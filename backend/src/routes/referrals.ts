import { and, count, eq, isNotNull } from "drizzle-orm";
import { Hono } from "hono";
import { db, schema } from "../db";
import { activeBonusDays, ensureReferralCode } from "../lib/referrals";
import type { Env, Variables } from "../types";

const referrals = new Hono<{ Bindings: Env; Variables: Variables }>();

referrals.get("/", async (c) => {
  const { userId } = c.get("session");
  const database = db(c.env.DB);
  const [user] = await database
    .select({
      email: schema.users.email,
      proBonusUntil: schema.users.proBonusUntil,
      stripeCustomerId: schema.users.stripeCustomerId,
      billingProvider: schema.users.billingProvider,
      subscriptionStatus: schema.users.subscriptionStatus,
    })
    .from(schema.users)
    .where(eq(schema.users.id, userId))
    .limit(1);
  if (!user) return c.json({ error: "Not signed in." }, 401);
  if (user.email.endsWith("@arcadia.local")) {
    return c.json({ error: "Create an account to invite friends.", code: "guest_cannot_use" }, 403);
  }
  // Referral Pro time is an acquisition offer. Students with a direct paid
  // subscription should not see or use it, otherwise it makes their upgrade
  // feel like a missed workaround.
  if (
    user.stripeCustomerId ||
    (user.billingProvider === "app_store" && user.subscriptionStatus === "active")
  ) {
    return c.json({ error: "Invites are available for free Arcadia accounts.", code: "paid_subscription" }, 403);
  }

  const referralCode = await ensureReferralCode(database, userId);
  const [totals] = await database
    .select({ qualifiedReferrals: count() })
    .from(schema.referrals)
    .where(
      and(
        eq(schema.referrals.referrerUserId, userId),
        isNotNull(schema.referrals.qualifiedAt),
      ),
    );

  return c.json({
    code: referralCode,
    inviteLink: `${c.env.APP_ORIGIN}/register?ref=${encodeURIComponent(referralCode)}`,
    qualifiedReferrals: totals?.qualifiedReferrals ?? 0,
    bonusDays: activeBonusDays(user.proBonusUntil),
  });
});

export default referrals;
