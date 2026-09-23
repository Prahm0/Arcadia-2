import { and, eq } from "drizzle-orm";
import * as webPush from "web-push";
import { db, schema, type Database } from "../db";
import type { Env } from "../types";
import { effectiveTier, isPaidTier } from "./tiers";

export type PushKind = "session_start" | "session_followup";

export interface PushPayload {
  title: string;
  body: string;
  tag: string;
  link: string;
}

function configured(env: Env): env is Env & Required<Pick<Env, "VAPID_PUBLIC_KEY" | "VAPID_PRIVATE_KEY">> {
  return Boolean(env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY);
}

function pushEnabledFor(subscription: typeof schema.pushSubscriptions.$inferSelect, kind: PushKind): boolean {
  return subscription.checkinsEnabled && (kind === "session_start" ? subscription.sessionStartEnabled : subscription.sessionFollowupEnabled);
}

function statusCode(error: unknown): number | null {
  if (!error || typeof error !== "object" || !("statusCode" in error)) return null;
  const value = (error as { statusCode?: unknown }).statusCode;
  return typeof value === "number" ? value : null;
}

/**
 * Sends a payload to every eligible device for one student. An expired browser
 * endpoint is deleted immediately, so it cannot make every later cron fail.
 */
export async function sendPushToUser(
  database: Database,
  env: Env,
  userId: string,
  kind: PushKind,
  payload: PushPayload,
): Promise<void> {
  if (!configured(env)) return;

  const [user] = await database
    .select({ email: schema.users.email, tier: schema.users.tier, developerAccess: schema.users.developerAccess })
    .from(schema.users)
    .where(eq(schema.users.id, userId))
    .limit(1);
  if (!user || user.email.endsWith("@arcadia.local") || !isPaidTier(effectiveTier(user.tier, user.developerAccess))) return;

  const subscriptions = await database
    .select()
    .from(schema.pushSubscriptions)
    .where(eq(schema.pushSubscriptions.userId, userId));

  await Promise.all(
    subscriptions
      .filter((subscription) => pushEnabledFor(subscription, kind))
      .map(async (subscription) => {
        try {
          await webPush.sendNotification(
            {
              endpoint: subscription.endpoint,
              keys: { p256dh: subscription.keysP256dh, auth: subscription.keysAuth },
            },
            JSON.stringify(payload),
            {
              TTL: kind === "session_start" ? 10 * 60 : 60 * 60,
              urgency: kind === "session_start" ? "high" : "normal",
              topic: payload.tag.slice(0, 32),
              vapidDetails: {
                subject: "mailto:hello@arcadiahq.app",
                publicKey: env.VAPID_PUBLIC_KEY,
                privateKey: env.VAPID_PRIVATE_KEY,
              },
            },
          );
        } catch (error) {
          const code = statusCode(error);
          if (code === 404 || code === 410) {
            await database
              .delete(schema.pushSubscriptions)
              .where(and(eq(schema.pushSubscriptions.endpoint, subscription.endpoint), eq(schema.pushSubscriptions.userId, userId)));
            return;
          }
          console.error("[push] delivery failed", { userId, code, kind });
        }
      }),
  );
}

/** Runs the one-minute check-in schedule. Kept outside the Hono router so Cloudflare's cron invokes it directly. */
export async function dispatchPushCheckIns(env: Env, now = Date.now()): Promise<void> {
  if (!configured(env)) return;
  const database = db(env.DB);
  const minute = 60_000;

  // The scheduler is minute-granular. This 90-second look-back gives a
  // slightly late invocation a chance to deliver one relevant check-in.
  const windowStart = (offset: number) => now + offset - 90_000;
  const windowEnd = (offset: number) => now + offset + 30_000;

  const plannedStudyEvents = await database
    .select()
    .from(schema.events)
    .where(
      and(
        eq(schema.events.category, "study"),
        eq(schema.events.outcome, "planned"),
      ),
    );
  const startsSoon = plannedStudyEvents.filter((event) => event.startedAt === null);
  const nextByUser = new Map<string, typeof startsSoon[number]>();
  for (const event of startsSoon) {
    if (event.startAt < windowStart(5 * minute) || event.startAt > windowEnd(5 * minute)) continue;
    const current = nextByUser.get(event.userId);
    if (!current || event.startAt < current.startAt) nextByUser.set(event.userId, event);
  }
  await Promise.all(
    [...nextByUser.values()].map((event) =>
      sendPushToUser(database, env, event.userId, "session_start", {
        title: `${event.subject || "Study"} starts in 5 minutes`,
        body: event.title,
        tag: `arcadia-start-${event.id}`,
        link: `/app?openEvent=${encodeURIComponent(event.id)}`,
      }),
    ),
  );

  const followUps = plannedStudyEvents.filter(
    (event) => event.endAt >= windowStart(0) && event.endAt <= windowEnd(0),
  );
  await Promise.all(
    followUps.map((event) =>
      sendPushToUser(database, env, event.userId, "session_followup", {
        title: "How did that session go?",
        body: `Log ${event.title} so Arcad can keep your plan accurate.`,
        tag: `arcadia-followup-${event.id}`,
        link: `/app?openEvent=${encodeURIComponent(event.id)}`,
      }),
    ),
  );

  const autoMisses = plannedStudyEvents.filter(
    (event) => event.endAt >= windowStart(-2 * 60 * minute) && event.endAt <= windowEnd(-2 * 60 * minute),
  );
  await Promise.all(
    autoMisses.map(async (event) => {
      // Only one cron run wins this conditional write. Later runs see a
      // missed outcome and cannot repeat the two-hour follow-up.
      const result = await database
        .update(schema.events)
        .set({ outcome: "missed", status: "missed", pinned: true })
        .where(and(eq(schema.events.id, event.id), eq(schema.events.outcome, "planned")))
        .returning({ id: schema.events.id });
      if (!result.length) return;
      await sendPushToUser(database, env, event.userId, "session_followup", {
        title: "That session slipped by",
        body: `Arcad marked ${event.title} as missed. Open your plan to recover the time.`,
        tag: `arcadia-missed-${event.id}`,
        link: `/app?openEvent=${encodeURIComponent(event.id)}&missReason=1`,
      });
    }),
  );
}
