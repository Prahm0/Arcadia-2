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
import { activeRevenueCatEntitlement, fetchRevenueCatSubscriber } from "../lib/revenuecat";
import type { Env, Variables } from "../types";

const billing = new Hono<{ Bindings: Env; Variables: Variables }>();

type Plan = "pro" | "max";
type Interval = "week" | "month" | "year";
const MANAGEABLE_SUBSCRIPTION_STATUSES = new Set(["active", "trialing", "past_due", "incomplete", "unpaid"]);

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
  if (user.developerAccess) return c.json({ error: "Developer access already includes Max features. No subscription is needed." }, 409);
  if (user.billingProvider === "app_store" && user.subscriptionStatus === "active") {
    return c.json({ error: "This subscription is managed through the App Store.", code: "app_store_subscription_active" }, 409);
  }
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

  // A second Checkout session can create a second Stripe subscription. Plan
  // changes, payment recovery and cancellation all belong in the customer
  // portal, where Stripe updates the existing subscription safely.
  if (user.subscriptionStatus && MANAGEABLE_SUBSCRIPTION_STATUSES.has(user.subscriptionStatus)) {
    return c.json(
      {
        error: "You already have a subscription. Manage it in the Stripe billing portal.",
        code: "subscription_already_exists",
      },
      409,
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
      successUrl: `${c.env.APP_ORIGIN}/app/welcome?upgrade=success`,
      cancelUrl: `${c.env.APP_ORIGIN}/app/pricing?upgrade=cancelled`,
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
  if (user?.billingProvider === "app_store") {
    return c.json({ error: "This subscription is managed through the App Store." }, 409);
  }
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

// ────────── App Store / RevenueCat ──────────

/**
 * The iOS client calls this only after RevenueCat reports a completed purchase
 * or restore. It carries no plan, product ID, or receipt to trust: the Worker
 * reads the session user and verifies their active entitlement directly with
 * RevenueCat's server API.
 */
billing.post("/iap/activate", async (c) => {
  const { userId } = c.get("session");
  const database = db(c.env.DB);
  const [user] = await database.select().from(schema.users).where(eq(schema.users.id, userId)).limit(1);
  if (!user) return c.json({ error: "User missing." }, 404);
  if (user.email.endsWith("@arcadia.local")) {
    return c.json({ error: "Create an account before subscribing.", code: "guest_cannot_upgrade" }, 403);
  }
  if (user.developerAccess) {
    return c.json({ error: "Developer access already includes Max features. No subscription is needed." }, 409);
  }
  if (user.billingProvider === "stripe" && MANAGEABLE_SUBSCRIPTION_STATUSES.has(user.subscriptionStatus ?? "")) {
    return c.json({ error: "Your existing subscription is managed outside the App Store.", code: "subscription_already_exists" }, 409);
  }

  try {
    const entitlement = await reconcileRevenueCatUser(database, user, c.env);
    if (!entitlement) {
      return c.json({ error: "No active App Store subscription was found.", code: "no_active_entitlement" }, 422);
    }
    return c.json({ tier: entitlement.tier, productId: entitlement.productId });
  } catch (error) {
    console.error("[billing] RevenueCat activation failed", error);
    return c.json({ error: "Couldn't verify your App Store subscription." }, 502);
  }
});

/**
 * RevenueCat posts lifecycle events here. The configured authorization header
 * gates the public endpoint, and we re-fetch the subscriber instead of
 * deriving access from individual webhook event shapes.
 */
billing.post("/iap/webhook", async (c) => {
  if (!c.env.REVENUECAT_WEBHOOK_AUTHORIZATION) {
    return c.json({ error: "RevenueCat webhooks not configured." }, 503);
  }
  if (c.req.header("authorization") !== c.env.REVENUECAT_WEBHOOK_AUTHORIZATION) {
    return c.json({ error: "Unauthorized." }, 401);
  }
  const payload = await c.req.json<{ event?: { app_user_id?: string } }>().catch(() => null);
  const appUserId = payload?.event?.app_user_id;
  if (!appUserId) return c.json({ received: true });

  const database = db(c.env.DB);
  const [user] = await database.select().from(schema.users).where(eq(schema.users.id, appUserId)).limit(1);
  if (!user) return c.json({ received: true });
  try {
    await reconcileRevenueCatUser(database, user, c.env);
  } catch (error) {
    console.error("[billing] RevenueCat webhook reconciliation failed", error);
    return c.json({ error: "Webhook handler failed." }, 500);
  }
  return c.json({ received: true });
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
        const [user] = await database.select().from(schema.users).where(eq(schema.users.id, userId)).limit(1);
        if (user?.billingProvider !== "app_store") {
          await database
            .update(schema.users)
            .set({
              tier: "free",
              billingProvider: "stripe",
              subscriptionStatus: "canceled",
              subscriptionCurrentPeriodEnd: subscription.current_period_end * 1000,
            })
            .where(eq(schema.users.id, userId));
        }
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
  const [existing] = await database
    .select({ billingProvider: schema.users.billingProvider, subscriptionStatus: schema.users.subscriptionStatus })
    .from(schema.users)
    .where(eq(schema.users.id, userId))
    .limit(1);
  // Stripe can retry an older event after the person moved to an App Store
  // subscription. Never let that stale event replace RevenueCat's active tier.
  if (existing?.billingProvider === "app_store" && existing.subscriptionStatus === "active") return;

  const priceId = subscription.items.data[0]?.price.id;
  const tier = priceId ? tierForPriceId(env, priceId) : null;
  // Stripe considers "trialing" and "active" as paid; everything else
  // (past_due, incomplete, unpaid, canceled) should drop back to free.
  const isPaid = subscription.status === "active" || subscription.status === "trialing";
  await database
    .update(schema.users)
    .set({
      tier: isPaid && tier ? tier : "free",
      billingProvider: "stripe",
      stripeCustomerId: subscription.customer,
      stripeSubscriptionId: subscription.id,
      subscriptionStatus: subscription.status,
      subscriptionCurrentPeriodEnd: subscription.current_period_end * 1000,
    })
    .where(eq(schema.users.id, userId));
}

async function reconcileRevenueCatUser(
  database: ReturnType<typeof db>,
  user: typeof schema.users.$inferSelect,
  env: Env,
) {
  const subscriber = await fetchRevenueCatSubscriber(env, user.id);
  const entitlement = activeRevenueCatEntitlement(env, subscriber);

  if (entitlement) {
    await database
      .update(schema.users)
      .set({
        tier: entitlement.tier,
        billingProvider: "app_store",
        revenuecatAppUserId: user.id,
        revenuecatEntitlement: entitlement.entitlement,
        revenuecatProductId: entitlement.productId,
        subscriptionStatus: "active",
        subscriptionCurrentPeriodEnd: entitlement.expiresAt,
      })
      .where(eq(schema.users.id, user.id));
    return entitlement;
  }

  // A RevenueCat expiration must never remove an active Stripe plan.
  if (user.billingProvider === "app_store") {
    await database
      .update(schema.users)
      .set({
        tier: "free",
        subscriptionStatus: "expired",
        subscriptionCurrentPeriodEnd: null,
        revenuecatAppUserId: user.id,
        revenuecatEntitlement: null,
        revenuecatProductId: null,
      })
      .where(eq(schema.users.id, user.id));
  }
  return null;
}

export default billing;
