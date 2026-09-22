import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { db, schema } from "../db";
import {
  createCheckoutSession,
  createCustomer,
  createPortalSession,
  retrieveSubscription,
  verifyWebhookSignature,
  type StripeSubscription,
} from "../lib/stripe";
import type { Env, Variables } from "../types";

const billing = new Hono<{ Bindings: Env; Variables: Variables }>();

type Plan = "pro" | "max";
type Interval = "week" | "month" | "year";

/**
 * Returns the price ID for the {plan, interval} combo from the Worker's
 * env. Wrangler carries these as vars so switching sandbox → live is a
 * config change, not a redeploy of the code. Empty string means the
 * interval hasn't been set up in Stripe yet, treated as null.
 */
function priceIdFor(env: Env, plan: Plan, interval: Interval): string | null {
  const lookup: Record<string, string | undefined> = {
    "pro:week": env.STRIPE_PRICE_PRO_WEEKLY,
    "pro:month": env.STRIPE_PRICE_PRO_MONTHLY,
    "pro:year": env.STRIPE_PRICE_PRO_YEARLY,
    "max:week": env.STRIPE_PRICE_MAX_WEEKLY,
    "max:month": env.STRIPE_PRICE_MAX_MONTHLY,
    "max:year": env.STRIPE_PRICE_MAX_YEARLY,
  };
  const value = lookup[`${plan}:${interval}`];
  return value && value.length > 0 ? value : null;
}

function tierForPriceId(env: Env, priceId: string): "pro" | "max" | null {
  const proIds = [
    env.STRIPE_PRICE_PRO_WEEKLY,
    env.STRIPE_PRICE_PRO_MONTHLY,
    env.STRIPE_PRICE_PRO_YEARLY,
  ].filter((id) => id.length > 0);
  const maxIds = [
    env.STRIPE_PRICE_MAX_WEEKLY,
    env.STRIPE_PRICE_MAX_MONTHLY,
    env.STRIPE_PRICE_MAX_YEARLY,
  ].filter((id) => id.length > 0);
  if (proIds.includes(priceId)) return "pro";
  if (maxIds.includes(priceId)) return "max";
  return null;
}

// ────────── Checkout ──────────

billing.post("/checkout", async (c) => {
  const { userId } = c.get("session");
  const body = await c.req
    .json<{ plan?: Plan; interval?: Interval }>()
    .catch(() => ({} as { plan?: Plan; interval?: Interval }));
  const plan = body.plan;
  const interval = body.interval ?? "month";
  if (plan !== "pro" && plan !== "max") {
    return c.json({ error: "Pick a Pro or Max plan." }, 400);
  }
  if (interval !== "week" && interval !== "month" && interval !== "year") {
    return c.json({ error: "Interval must be week, month, or year." }, 400);
  }
  const priceId = priceIdFor(c.env, plan, interval);
  if (!priceId) {
    return c.json(
      {
        error: `${plan === "pro" ? "Pro" : "Max"} isn't available on the ${interval}ly plan yet.`,
        code: "interval_not_configured",
      },
      400,
    );
  }

  const database = db(c.env.DB);
  const [user] = await database.select().from(schema.users).where(eq(schema.users.id, userId)).limit(1);
  if (!user) return c.json({ error: "User missing." }, 404);
  // Guest accounts use the reserved `@arcadia.local` suffix and have no
  // way to sign back in, so subscribing one strands the customer with a
  // paid plan they can't ever reach. Force them to convert first.
  if (user.email.endsWith("@arcadia.local")) {
    return c.json(
      {
        error: "Create a proper account before subscribing, guest accounts can't upgrade.",
        code: "guest_cannot_upgrade",
      },
      403,
    );
  }

  // Reuse an existing Stripe customer if we already created one; only
  // create-and-persist on the first upgrade attempt. This avoids Stripe
  // showing "email already used by another customer" on retries.
  let customerId = user.stripeCustomerId;
  if (!customerId) {
    try {
      const customer = await createCustomer(c.env, user.email, userId);
      customerId = customer.id;
      await database
        .update(schema.users)
        .set({ stripeCustomerId: customerId })
        .where(eq(schema.users.id, userId));
    } catch (err) {
      console.error("[billing] customer create failed", err);
      return c.json({ error: "Couldn't reach Stripe." }, 502);
    }
  }

  try {
    const session = await createCheckoutSession(c.env, {
      customerId: customerId ?? undefined,
      userId,
      priceId,
      successUrl: `${c.env.APP_ORIGIN}/app/settings?upgrade=success`,
      cancelUrl: `${c.env.APP_ORIGIN}/app/upgrade?upgrade=cancelled`,
    });
    if (!session.url) return c.json({ error: "Stripe returned no checkout URL." }, 502);
    return c.json({ url: session.url });
  } catch (err) {
    console.error("[billing] checkout failed", err);
    return c.json({ error: "Couldn't start checkout." }, 502);
  }
});

// ────────── Customer Portal ──────────

billing.post("/portal", async (c) => {
  const { userId } = c.get("session");
  const database = db(c.env.DB);
  const [user] = await database.select().from(schema.users).where(eq(schema.users.id, userId)).limit(1);
  if (!user?.stripeCustomerId) {
    return c.json({ error: "No subscription to manage yet." }, 400);
  }
  try {
    const session = await createPortalSession(c.env, {
      customerId: user.stripeCustomerId,
      returnUrl: `${c.env.APP_ORIGIN}/app/settings`,
    });
    return c.json({ url: session.url });
  } catch (err) {
    console.error("[billing] portal failed", err);
    return c.json({ error: "Couldn't open billing portal." }, 502);
  }
});

// ────────── Webhook ──────────

/**
 * Public endpoint Stripe posts to on every subscription-lifecycle event.
 * We verify the signature against STRIPE_WEBHOOK_SECRET and then reconcile
 * the affected user row. The webhook is our source of truth — the browser
 * redirect after Checkout is best-effort UX only.
 */
billing.post("/webhook", async (c) => {
  if (!c.env.STRIPE_WEBHOOK_SECRET || !c.env.STRIPE_SECRET_KEY) {
    return c.json({ error: "Webhooks not configured." }, 503);
  }
  const signature = c.req.header("stripe-signature");
  if (!signature) return c.json({ error: "Missing signature." }, 400);

  const rawBody = await c.req.text();
  let event;
  try {
    ({ event } = await verifyWebhookSignature(c.env.STRIPE_WEBHOOK_SECRET, rawBody, signature));
  } catch (err) {
    console.warn("[billing] webhook signature failed", err);
    return c.json({ error: "Bad signature." }, 400);
  }

  const database = db(c.env.DB);

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        // Grab the resulting subscription and reconcile from that. We
        // could pull the priceId off the session's line_items too, but
        // the subscription object is what every later update mutates, so
        // hitting it here means the same code path handles both branches.
        const session = event.data.object as {
          client_reference_id?: string;
          customer?: string;
          subscription?: string;
        };
        const userId = session.client_reference_id;
        const subscriptionId = session.subscription;
        if (!userId || !subscriptionId) break;
        const subscription = await retrieveSubscription(c.env, subscriptionId);
        await reconcileSubscription(database, userId, subscription, c.env);
        break;
      }

      case "customer.subscription.created":
      case "customer.subscription.updated": {
        const subscription = event.data.object as StripeSubscription & {
          metadata?: { userId?: string };
        };
        const userId = await resolveUserId(database, subscription);
        if (!userId) break;
        await reconcileSubscription(database, userId, subscription, c.env);
        break;
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object as StripeSubscription & {
          metadata?: { userId?: string };
        };
        const userId = await resolveUserId(database, subscription);
        if (!userId) break;
        await database
          .update(schema.users)
          .set({
            tier: "free",
            subscriptionStatus: "canceled",
            subscriptionCurrentPeriodEnd: subscription.current_period_end * 1000,
          })
          .where(eq(schema.users.id, userId));
        break;
      }

      default:
      // Everything else (invoice.paid, payment_method.attached, …) we don't
      // need to react to yet. Return 200 so Stripe stops retrying.
    }
  } catch (err) {
    console.error("[billing] webhook handler failed", err);
    // Return 500 so Stripe retries — the reconcile step touches Stripe
    // and the DB, and a transient failure of either shouldn't drop the
    // subscription silently.
    return c.json({ error: "Webhook handler failed." }, 500);
  }

  return c.json({ received: true });
});

/**
 * Look up the userId for a subscription. Prefer metadata (set at
 * creation time) and fall back to the stripe_customer_id row we
 * persisted on first checkout — either works.
 */
async function resolveUserId(
  database: ReturnType<typeof db>,
  subscription: StripeSubscription & { metadata?: { userId?: string } },
): Promise<string | null> {
  if (subscription.metadata?.userId) return subscription.metadata.userId;
  const [row] = await database
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(eq(schema.users.stripeCustomerId, subscription.customer))
    .limit(1);
  return row?.id ?? null;
}

async function reconcileSubscription(
  database: ReturnType<typeof db>,
  userId: string,
  subscription: StripeSubscription,
  env: Env,
): Promise<void> {
  const priceId = subscription.items.data[0]?.price.id;
  const tier = priceId ? tierForPriceId(env, priceId) : null;
  // Stripe considers "trialing" and "active" as paid; everything else
  // (past_due, incomplete, unpaid, canceled) should drop back to free.
  const isPaid = subscription.status === "active" || subscription.status === "trialing";
  await database
    .update(schema.users)
    .set({
      tier: isPaid && tier ? tier : "free",
      stripeCustomerId: subscription.customer,
      stripeSubscriptionId: subscription.id,
      subscriptionStatus: subscription.status,
      subscriptionCurrentPeriodEnd: subscription.current_period_end * 1000,
    })
    .where(eq(schema.users.id, userId));
}

export default billing;
