import { and, eq } from "drizzle-orm";
import { Hono, type Context } from "hono";
import { db, schema } from "../db";
import { effectiveTier, isPaidTier } from "../lib/tiers";
import type { Env, Variables } from "../types";

const push = new Hono<{ Bindings: Env; Variables: Variables }>();

type SubscriptionInput = {
  endpoint?: unknown;
  keys?: { p256dh?: unknown; auth?: unknown };
};

type ValidSubscription = {
  endpoint: string;
  keys: { p256dh: string; auth: string };
};

type AppContext = Context<{ Bindings: Env; Variables: Variables }>;

type PreferenceInput = {
  checkinsEnabled?: unknown;
  sessionStartEnabled?: unknown;
  lateStartEnabled?: unknown;
  sessionFollowupEnabled?: unknown;
  streakEnabled?: unknown;
};

const PREFERENCE_KEYS = ["checkinsEnabled", "sessionStartEnabled", "lateStartEnabled", "sessionFollowupEnabled", "streakEnabled"] as const;

/** The switches a PATCH sets, ignoring anything that isn't a boolean. */
function preferenceValues(body: PreferenceInput) {
  const values: Partial<Record<(typeof PREFERENCE_KEYS)[number], boolean>> & { updatedAt: number } = { updatedAt: Date.now() };
  for (const key of PREFERENCE_KEYS) {
    const value = body[key];
    if (typeof value === "boolean") values[key] = value;
  }
  return values;
}

function validSubscription(value: SubscriptionInput | null): value is ValidSubscription {
  if (!value || typeof value.endpoint !== "string" || !value.keys) return false;
  if (!value.endpoint.startsWith("https://") || value.endpoint.length > 2_000) return false;
  return typeof value.keys.p256dh === "string" && value.keys.p256dh.length > 10 &&
    typeof value.keys.auth === "string" && value.keys.auth.length > 5;
}

async function access(c: AppContext) {
  const { userId } = c.get("session");
  const database = db(c.env.DB);
  const [user] = await database
    .select({ email: schema.users.email, tier: schema.users.tier, developerAccess: schema.users.developerAccess, developerTier: schema.users.developerTier, proBonusUntil: schema.users.proBonusUntil })
    .from(schema.users)
    .where(eq(schema.users.id, userId))
    .limit(1);
  if (!user) return { database, userId, response: c.json({ error: "Account not found." }, 404) };
  if (user.email.endsWith("@arcadia.local")) {
    return { database, userId, response: c.json({ error: "Guest accounts cannot use check-ins.", code: "guest_cannot_use" }, 403) };
  }
  const tier = effectiveTier(user.tier, user.developerAccess, user.proBonusUntil, Date.now(), user.developerTier);
  if (!isPaidTier(tier)) {
    return { database, userId, response: c.json({ error: "Check-ins are available on Pro and Max.", code: "upgrade_required" }, 402) };
  }
  return { database, userId, response: null };
}

push.get("/public-key", async (c) => {
  const result = await access(c);
  if (result.response) return result.response;
  if (!c.env.VAPID_PUBLIC_KEY) return c.json({ error: "Push check-ins are not configured yet." }, 503);
  return c.json({ publicKey: c.env.VAPID_PUBLIC_KEY });
});

push.post("/subscription", async (c) => {
  const result = await access(c);
  if (result.response) return result.response;
  const body = await c.req.json<SubscriptionInput>().catch(() => null);
  if (!validSubscription(body)) return c.json({ error: "Invalid push subscription." }, 422);

  const now = Date.now();
  await result.database
    .insert(schema.pushSubscriptions)
    .values({
      userId: result.userId,
      endpoint: body.endpoint,
      keysP256dh: body.keys.p256dh,
      keysAuth: body.keys.auth,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: schema.pushSubscriptions.endpoint,
      set: {
        userId: result.userId,
        keysP256dh: body.keys.p256dh,
        keysAuth: body.keys.auth,
        checkinsEnabled: true,
        sessionStartEnabled: true,
        lateStartEnabled: true,
        sessionFollowupEnabled: true,
        streakEnabled: true,
        updatedAt: now,
      },
    });
  return c.json({ ok: true });
});

push.post("/subscription/status", async (c) => {
  const result = await access(c);
  if (result.response) return result.response;
  const body = await c.req.json<{ endpoint?: unknown }>().catch(() => null);
  if (!body || typeof body.endpoint !== "string") return c.json({ error: "Invalid push subscription." }, 422);
  const [subscription] = await result.database
    .select({
      checkinsEnabled: schema.pushSubscriptions.checkinsEnabled,
      sessionStartEnabled: schema.pushSubscriptions.sessionStartEnabled,
      lateStartEnabled: schema.pushSubscriptions.lateStartEnabled,
      sessionFollowupEnabled: schema.pushSubscriptions.sessionFollowupEnabled,
      streakEnabled: schema.pushSubscriptions.streakEnabled,
    })
    .from(schema.pushSubscriptions)
    .where(and(eq(schema.pushSubscriptions.endpoint, body.endpoint), eq(schema.pushSubscriptions.userId, result.userId)))
    .limit(1);
  return c.json({ subscription: subscription ?? null });
});

push.patch("/subscription", async (c) => {
  const result = await access(c);
  if (result.response) return result.response;
  const body = await c.req.json<SubscriptionInput & PreferenceInput>().catch(() => null);
  if (!body || typeof body.endpoint !== "string" || !body.endpoint.startsWith("https://")) {
    return c.json({ error: "Invalid push subscription." }, 422);
  }
  await result.database
    .update(schema.pushSubscriptions)
    .set(preferenceValues(body))
    .where(and(eq(schema.pushSubscriptions.endpoint, body.endpoint), eq(schema.pushSubscriptions.userId, result.userId)));
  return c.json({ ok: true });
});

push.delete("/subscription", async (c) => {
  const result = await access(c);
  if (result.response) return result.response;
  const body = await c.req.json<{ endpoint?: unknown }>().catch(() => null);
  if (!body || typeof body.endpoint !== "string") return c.json({ error: "Invalid push subscription." }, 422);
  await result.database
    .delete(schema.pushSubscriptions)
    .where(and(eq(schema.pushSubscriptions.endpoint, body.endpoint), eq(schema.pushSubscriptions.userId, result.userId)));
  return c.json({ ok: true });
});

// iPhone check-ins. The iOS app hands over its APNs device token (hex) in
// place of a browser subscription; the switches work the same way.

type NativeTokenInput = PreferenceInput & { token?: unknown; environment?: unknown };

function validToken(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{64,200}$/i.test(value);
}

const nativePreferenceColumns = {
  checkinsEnabled: schema.nativePushTokens.checkinsEnabled,
  sessionStartEnabled: schema.nativePushTokens.sessionStartEnabled,
  lateStartEnabled: schema.nativePushTokens.lateStartEnabled,
  sessionFollowupEnabled: schema.nativePushTokens.sessionFollowupEnabled,
  streakEnabled: schema.nativePushTokens.streakEnabled,
};

/**
 * Registered on enable and again on every launch, since iOS can hand out a
 * new token. The same phone keeps its switches; a phone that changed hands
 * (another account signed in) starts over with everything on.
 */
push.post("/native", async (c) => {
  const result = await access(c);
  if (result.response) return result.response;
  const body = await c.req.json<NativeTokenInput>().catch(() => null);
  if (!body || !validToken(body.token)) return c.json({ error: "Invalid device token." }, 422);
  const token = body.token.toLowerCase();
  const environment = body.environment === "sandbox" ? "sandbox" : "production";
  const now = Date.now();

  const [existing] = await result.database
    .select({ userId: schema.nativePushTokens.userId })
    .from(schema.nativePushTokens)
    .where(eq(schema.nativePushTokens.token, token))
    .limit(1);
  if (existing?.userId === result.userId) {
    await result.database
      .update(schema.nativePushTokens)
      .set({ environment, updatedAt: now })
      .where(eq(schema.nativePushTokens.token, token));
  } else {
    await result.database
      .insert(schema.nativePushTokens)
      .values({ token, userId: result.userId, environment, createdAt: now, updatedAt: now })
      .onConflictDoUpdate({
        target: schema.nativePushTokens.token,
        set: {
          userId: result.userId,
          environment,
          checkinsEnabled: true,
          sessionStartEnabled: true,
          lateStartEnabled: true,
          sessionFollowupEnabled: true,
          streakEnabled: true,
          updatedAt: now,
        },
      });
  }
  const [preferences] = await result.database
    .select(nativePreferenceColumns)
    .from(schema.nativePushTokens)
    .where(eq(schema.nativePushTokens.token, token))
    .limit(1);
  return c.json({ preferences });
});

push.post("/native/status", async (c) => {
  const result = await access(c);
  if (result.response) return result.response;
  const body = await c.req.json<NativeTokenInput>().catch(() => null);
  if (!body || !validToken(body.token)) return c.json({ error: "Invalid device token." }, 422);
  const [preferences] = await result.database
    .select(nativePreferenceColumns)
    .from(schema.nativePushTokens)
    .where(and(eq(schema.nativePushTokens.token, body.token.toLowerCase()), eq(schema.nativePushTokens.userId, result.userId)))
    .limit(1);
  return c.json({ subscription: preferences ?? null });
});

push.patch("/native", async (c) => {
  const result = await access(c);
  if (result.response) return result.response;
  const body = await c.req.json<NativeTokenInput>().catch(() => null);
  if (!body || !validToken(body.token)) return c.json({ error: "Invalid device token." }, 422);
  await result.database
    .update(schema.nativePushTokens)
    .set(preferenceValues(body))
    .where(and(eq(schema.nativePushTokens.token, body.token.toLowerCase()), eq(schema.nativePushTokens.userId, result.userId)));
  return c.json({ ok: true });
});

// Sign-out unlinks the phone from the account. Not plan-gated: a student who
// has since dropped to Free must still be able to stop the check-ins.
push.delete("/native", async (c) => {
  const { userId } = c.get("session");
  const body = await c.req.json<NativeTokenInput>().catch(() => null);
  if (!body || !validToken(body.token)) return c.json({ error: "Invalid device token." }, 422);
  await db(c.env.DB)
    .delete(schema.nativePushTokens)
    .where(and(eq(schema.nativePushTokens.token, body.token.toLowerCase()), eq(schema.nativePushTokens.userId, userId)));
  return c.json({ ok: true });
});

export default push;
