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
    .select({ email: schema.users.email, tier: schema.users.tier, developerAccess: schema.users.developerAccess, proBonusUntil: schema.users.proBonusUntil })
    .from(schema.users)
    .where(eq(schema.users.id, userId))
    .limit(1);
  if (!user) return { database, userId, response: c.json({ error: "Account not found." }, 404) };
  if (user.email.endsWith("@arcadia.local")) {
    return { database, userId, response: c.json({ error: "Guest accounts cannot use check-ins.", code: "guest_cannot_use" }, 403) };
  }
  const tier = effectiveTier(user.tier, user.developerAccess, user.proBonusUntil);
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
        sessionFollowupEnabled: true,
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
      sessionFollowupEnabled: schema.pushSubscriptions.sessionFollowupEnabled,
    })
    .from(schema.pushSubscriptions)
    .where(and(eq(schema.pushSubscriptions.endpoint, body.endpoint), eq(schema.pushSubscriptions.userId, result.userId)))
    .limit(1);
  return c.json({ subscription: subscription ?? null });
});

push.patch("/subscription", async (c) => {
  const result = await access(c);
  if (result.response) return result.response;
  const body = await c.req.json<SubscriptionInput & {
    checkinsEnabled?: unknown;
    sessionStartEnabled?: unknown;
    sessionFollowupEnabled?: unknown;
  }>().catch(() => null);
  if (!body || typeof body.endpoint !== "string" || !body.endpoint.startsWith("https://")) {
    return c.json({ error: "Invalid push subscription." }, 422);
  }
  const values = {
    updatedAt: Date.now(),
    ...(typeof body.checkinsEnabled === "boolean" ? { checkinsEnabled: body.checkinsEnabled } : {}),
    ...(typeof body.sessionStartEnabled === "boolean" ? { sessionStartEnabled: body.sessionStartEnabled } : {}),
    ...(typeof body.sessionFollowupEnabled === "boolean" ? { sessionFollowupEnabled: body.sessionFollowupEnabled } : {}),
  };
  await result.database
    .update(schema.pushSubscriptions)
    .set(values)
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

export default push;
