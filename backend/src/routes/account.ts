import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { db, schema } from "../db";
import { hashPassword, newSalt, passwordProblem, verifyPassword } from "../lib/password";
import { destroySession } from "../lib/session";
import { cancelSubscription, listCustomerSubscriptions } from "../lib/stripe";
import { iso } from "../lib/time";
import type { Env, Variables } from "../types";

const account = new Hono<{ Bindings: Env; Variables: Variables }>();
const RECENT_SIGN_IN_MS = 15 * 60 * 1000;
const CANCELLABLE_SUBSCRIPTION_STATUSES = new Set(["active", "trialing", "past_due", "incomplete", "unpaid"]);

account.get("/", async (c) => {
  const { userId } = c.get("session");
  const database = db(c.env.DB);

  const [user] = await database
    .select()
    .from(schema.users)
    .where(eq(schema.users.id, userId))
    .limit(1);
  if (!user) return c.json({ error: "Not signed in." }, 401);

  const [profile] = await database
    .select()
    .from(schema.profiles)
    .where(eq(schema.profiles.userId, userId))
    .limit(1);

  return c.json({
    account: {
      email: user.email,
      displayName: profile?.displayName || user.name,
      theme: user.theme,
      createdAt: iso(user.createdAt),
      lastSignInAt: user.lastSignInAt ? iso(user.lastSignInAt) : undefined,
    },
  });
});

account.patch("/", async (c) => {
  const { userId } = c.get("session");
  const body = await c.req.json<{ name?: string; theme?: string }>().catch(() => null);
  if (!body) return c.json({ error: "Invalid request." }, 400);

  const database = db(c.env.DB);

  if (typeof body.name === "string") {
    const name = body.name.trim().slice(0, 120);
    if (!name) return c.json({ error: "Name cannot be empty." }, 422);
    await database.update(schema.users).set({ name }).where(eq(schema.users.id, userId));
    await database
      .update(schema.profiles)
      .set({ displayName: name })
      .where(eq(schema.profiles.userId, userId));
  }

  if (typeof body.theme === "string") {
    const theme = body.theme.trim().slice(0, 32);
    if (!["system", "light", "dark"].includes(theme)) {
      return c.json({ error: "Unknown theme." }, 422);
    }
    await database.update(schema.users).set({ theme }).where(eq(schema.users.id, userId));
  }

  return c.json({ ok: true });
});

account.post("/change-password", async (c) => {
  const { userId, sessionId } = c.get("session");
  const body = await c.req
    .json<{ currentPassword?: string; newPassword?: string }>()
    .catch(() => null);
  if (!body) return c.json({ error: "Invalid request." }, 400);

  const problem = passwordProblem(String(body.newPassword ?? ""));
  if (problem) return c.json({ error: problem }, 422);

  const database = db(c.env.DB);
  const [user] = await database
    .select()
    .from(schema.users)
    .where(eq(schema.users.id, userId))
    .limit(1);
  if (!user) return c.json({ error: "Not signed in." }, 401);

  const ok = await verifyPassword(
    String(body.currentPassword ?? ""),
    user.passwordSalt,
    user.passwordHash,
  );
  if (!ok) return c.json({ error: "Current password is incorrect." }, 403);

  const salt = newSalt();
  const passwordHash = await hashPassword(String(body.newPassword), salt);
  await database
    .update(schema.users)
    .set({ passwordHash, passwordSalt: salt })
    .where(eq(schema.users.id, userId));

  // Sign out every other device; keep this one.
  const sessions = await database
    .select()
    .from(schema.sessions)
    .where(eq(schema.sessions.userId, userId));
  for (const session of sessions) {
    if (session.id !== sessionId) {
      await database.delete(schema.sessions).where(eq(schema.sessions.id, session.id));
    }
  }

  return c.json({ ok: true });
});

/**
 * Permanently removes an Arcadia account and all app-held data. Foreign-key
 * cascades are deliberately relied on here: every user-owned table references
 * users directly or through another cascading parent, so this remains correct
 * as new data types are added. Stripe customer and invoice records remain for
 * financial recordkeeping, but any active subscription is cancelled first.
 */
account.delete("/", async (c) => {
  const { userId } = c.get("session");
  const body = await c.req.json<{ confirmation?: string }>().catch(() => null);
  if (body?.confirmation !== "DELETE") {
    return c.json({ error: 'Type DELETE to confirm account deletion.' }, 422);
  }

  const database = db(c.env.DB);
  const [user] = await database
    .select()
    .from(schema.users)
    .where(eq(schema.users.id, userId))
    .limit(1);
  if (!user) return c.json({ error: "Not signed in." }, 401);

  if (!user.lastSignInAt || Date.now() - user.lastSignInAt > RECENT_SIGN_IN_MS) {
    return c.json({
      error: "For your security, sign out and sign in again before deleting your account.",
      code: "recent_sign_in_required",
    }, 403);
  }

  try {
    const subscriptions = user.stripeCustomerId
      ? await listCustomerSubscriptions(c.env, user.stripeCustomerId)
      : [];
    if (subscriptions.length === 0 && user.stripeSubscriptionId && user.subscriptionStatus) {
      subscriptions.push({
        id: user.stripeSubscriptionId,
        status: user.subscriptionStatus,
        customer: user.stripeCustomerId ?? "",
        current_period_end: 0,
        cancel_at_period_end: false,
        items: { data: [] },
      });
    }
    for (const subscription of subscriptions) {
      if (CANCELLABLE_SUBSCRIPTION_STATUSES.has(subscription.status)) {
        await cancelSubscription(c.env, subscription.id);
      }
    }
  } catch (error) {
    // If we cannot establish that billing has stopped, preserve the account
    // so the person is never left paying for an inaccessible service.
    console.error("[account] subscription cancellation failed", error);
    return c.json({ error: "We couldn't cancel your Stripe subscription. Please try again." }, 502);
  }

  // Delete retained originals from R2 first, best-effort. The D1 delete must
  // still complete if object storage is briefly unavailable.
  try {
    await deleteUserObjects(c.env.UPLOADS, userId);
  } catch (error) {
    console.error("[account] R2 cleanup failed", error);
  }

  // A person may have joined the launch waitlist before creating an account.
  // It is the only user-adjacent table without a foreign key, so remove it in
  // the same D1 transaction as the account row.
  await database.batch([
    database.delete(schema.waitlist).where(eq(schema.waitlist.email, user.email)),
    database.delete(schema.users).where(eq(schema.users.id, userId)),
  ]);
  // The user delete invalidates every device session via cascade. This call
  // also expires the current browser cookie.
  await destroySession(c);
  return c.json({ ok: true });
});

async function deleteUserObjects(bucket: R2Bucket | undefined, userId: string): Promise<void> {
  if (!bucket) return;
  let cursor: string | undefined;
  do {
    const page = await bucket.list({ prefix: `${userId}/`, cursor });
    if (page.objects.length > 0) await bucket.delete(page.objects.map((object) => object.key));
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
}

export default account;
