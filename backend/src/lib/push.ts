import { and, eq, gte, inArray, lt, lte, or } from "drizzle-orm";
import * as webPush from "web-push";
import { db, schema, type Database } from "../db";
import type { Env } from "../types";
import { apnsConfigured, sendApns } from "./apns";
import { livePresence } from "./presence";
import { streakAtRisk } from "./streak-risk";
import { effectiveTier, isPaidTier } from "./tiers";
import { DAY, MINUTE, localDateKey, parseClock, zoneOffsetMinutes } from "./time";

export type PushKind = "session_start" | "late_start" | "session_followup" | "streak";

export interface PushPayload {
  title: string;
  body: string;
  tag: string;
  link: string;
}

/** The per-type switches shared by browser subscriptions and iPhone tokens. */
interface PushFlags {
  checkinsEnabled: boolean;
  sessionStartEnabled: boolean;
  lateStartEnabled: boolean;
  sessionFollowupEnabled: boolean;
  streakEnabled: boolean;
}

function webPushConfigured(env: Env): env is Env & Required<Pick<Env, "VAPID_PUBLIC_KEY" | "VAPID_PRIVATE_KEY">> {
  return Boolean(env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY);
}

function pushEnabledFor(flags: PushFlags, kind: PushKind): boolean {
  if (!flags.checkinsEnabled) return false;
  if (kind === "session_start") return flags.sessionStartEnabled;
  if (kind === "late_start") return flags.lateStartEnabled;
  if (kind === "streak") return flags.streakEnabled;
  return flags.sessionFollowupEnabled;
}

/** How long a check-in is still worth delivering to a phone that was offline. */
function ttlSeconds(kind: PushKind): number {
  if (kind === "session_start" || kind === "late_start") return 10 * 60;
  if (kind === "streak") return 2 * 60 * 60;
  return 60 * 60;
}

function statusCode(error: unknown): number | null {
  if (!error || typeof error !== "object" || !("statusCode" in error)) return null;
  const value = (error as { statusCode?: unknown }).statusCode;
  return typeof value === "number" ? value : null;
}

/**
 * First caller wins. The one-minute cron looks back 90 seconds, so two runs
 * can pick up the same block; the second finds the row and sends nothing.
 */
async function claimDelivery(database: Database, userId: string, dedupeKey: string): Promise<boolean> {
  const claimed = await database
    .insert(schema.pushDeliveries)
    .values({ userId, dedupeKey, sentAt: Date.now() })
    .onConflictDoNothing()
    .returning({ dedupeKey: schema.pushDeliveries.dedupeKey });
  return claimed.length > 0;
}

async function alreadySent(database: Database, userId: string, dedupeKey: string): Promise<boolean> {
  const [row] = await database
    .select({ dedupeKey: schema.pushDeliveries.dedupeKey })
    .from(schema.pushDeliveries)
    .where(and(eq(schema.pushDeliveries.userId, userId), eq(schema.pushDeliveries.dedupeKey, dedupeKey)))
    .limit(1);
  return Boolean(row);
}

/**
 * Sends a payload to every eligible device for one student: browsers over
 * Web Push and iPhones over APNs. An expired browser endpoint or iPhone token
 * is deleted immediately, so it cannot make every later cron fail.
 */
export async function sendPushToUser(
  database: Database,
  env: Env,
  userId: string,
  kind: PushKind,
  payload: PushPayload,
  dedupeKey: string = payload.tag,
): Promise<void> {
  const web = webPushConfigured(env);
  const native = apnsConfigured(env);
  if (!web && !native) return;

  const [user] = await database
    .select({ email: schema.users.email, tier: schema.users.tier, developerAccess: schema.users.developerAccess, developerTier: schema.users.developerTier, proBonusUntil: schema.users.proBonusUntil })
    .from(schema.users)
    .where(eq(schema.users.id, userId))
    .limit(1);
  if (!user || user.email.endsWith("@arcadia.local") || !isPaidTier(effectiveTier(user.tier, user.developerAccess, user.proBonusUntil, Date.now(), user.developerTier))) return;

  const [subscriptions, tokens] = await Promise.all([
    web ? database.select().from(schema.pushSubscriptions).where(eq(schema.pushSubscriptions.userId, userId)) : [],
    native ? database.select().from(schema.nativePushTokens).where(eq(schema.nativePushTokens.userId, userId)) : [],
  ]);
  const browsers = subscriptions.filter((subscription) => pushEnabledFor(subscription, kind));
  const phones = tokens.filter((token) => pushEnabledFor(token, kind));
  if (!browsers.length && !phones.length) return;
  if (!(await claimDelivery(database, userId, dedupeKey))) return;

  await Promise.all([
    ...browsers.map(async (subscription) => {
      if (!webPushConfigured(env)) return;
      try {
        await webPush.sendNotification(
          {
            endpoint: subscription.endpoint,
            keys: { p256dh: subscription.keysP256dh, auth: subscription.keysAuth },
          },
          JSON.stringify(payload),
          {
            TTL: ttlSeconds(kind),
            urgency: kind === "session_start" || kind === "late_start" ? "high" : "normal",
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
    ...phones.map(async (phone) => {
      const result = await sendApns(env, phone, {
        title: payload.title,
        body: payload.body,
        collapseId: payload.tag,
        link: payload.link,
        expiresInSeconds: ttlSeconds(kind),
      });
      if (result.ok) {
        if (result.environment !== phone.environment) {
          await database
            .update(schema.nativePushTokens)
            .set({ environment: result.environment, updatedAt: Date.now() })
            .where(eq(schema.nativePushTokens.token, phone.token));
        }
        return;
      }
      if (result.gone) {
        await database
          .delete(schema.nativePushTokens)
          .where(and(eq(schema.nativePushTokens.token, phone.token), eq(schema.nativePushTokens.userId, userId)));
        return;
      }
      console.error("[push] apns delivery failed", { userId, status: result.status, reason: result.reason, kind });
    }),
  ]);
}

/** Runs the one-minute check-in schedule. Kept outside the Hono router so Cloudflare's cron invokes it directly. */
export async function dispatchPushCheckIns(env: Env, now = Date.now()): Promise<void> {
  if (!webPushConfigured(env) && !apnsConfigured(env)) return;
  const database = db(env.DB);
  const minute = MINUTE;

  // The scheduler is minute-granular. This 90-second look-back gives a
  // slightly late invocation a chance to deliver one relevant check-in;
  // push_deliveries stops the next run sending it again.
  const windowStart = (offset: number) => now + offset - 90_000;
  const windowEnd = (offset: number) => now + offset + 30_000;

  // Only blocks near a check-in moment: starting in five minutes, started
  // ten minutes ago, ending now, or ended two hours ago.
  const plannedStudyEvents = await database
    .select()
    .from(schema.events)
    .where(
      and(
        eq(schema.events.category, "study"),
        eq(schema.events.outcome, "planned"),
        or(
          and(gte(schema.events.startAt, windowStart(-10 * minute)), lte(schema.events.startAt, windowEnd(5 * minute))),
          and(gte(schema.events.endAt, windowStart(-2 * 60 * minute)), lte(schema.events.endAt, windowEnd(0))),
        ),
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
      }, `start:${event.id}:${event.startAt}`),
    ),
  );

  await dispatchLateStarts(database, env, startsSoon.filter(
    // Started ten minutes ago with no start, and enough of it left to save.
    (event) => event.startAt >= windowStart(-10 * minute) && event.startAt <= windowEnd(-10 * minute) && event.endAt - now >= 10 * minute,
  ), now);

  // Sleep is a scheduled calendar block too. Use the same five-minute
  // check-in preference and timing as study, without a session follow-up.
  const sleepEvents = await database
    .select()
    .from(schema.events)
    .where(and(
      eq(schema.events.category, "sleep"),
      eq(schema.events.outcome, "planned"),
      gte(schema.events.startAt, windowStart(5 * minute)),
      lte(schema.events.startAt, windowEnd(5 * minute)),
    ));
  const nextSleepByUser = new Map<string, typeof sleepEvents[number]>();
  for (const event of sleepEvents) {
    const current = nextSleepByUser.get(event.userId);
    if (!current || event.startAt < current.startAt) nextSleepByUser.set(event.userId, event);
  }
  await Promise.all(
    [...nextSleepByUser.values()].map((event) =>
      sendPushToUser(database, env, event.userId, "session_start", {
        title: "Sleep starts in 5 minutes",
        body: "Time to wind down. Rest helps you recharge for tomorrow.",
        tag: `arcadia-sleep-${event.id}`,
        link: `/app/schedule?eventId=${encodeURIComponent(event.id)}`,
      }, `sleep:${event.id}:${event.startAt}`),
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
      }, `followup:${event.id}:${event.endAt}`),
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
      }, `missed:${event.id}`);
    }),
  );

  await dispatchStreakRisks(database, env, now);

  // Keep the delivery log small: nothing looks back further than a day.
  if (new Date(now).getUTCMinutes() === 0) {
    await database.delete(schema.pushDeliveries).where(lt(schema.pushDeliveries.sentAt, now - 2 * DAY));
  }
}

/** D1 caps bound parameters per query, so long id lists go in batches. */
function batches<T>(items: T[], size = 90): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) result.push(items.slice(index, index + size));
  return result;
}

/**
 * A block that started ten minutes ago and still hasn't been started. Skipped
 * when the student's timer is already running, e.g. a free timer or a room
 * session they began instead of opening the block.
 */
async function dispatchLateStarts(
  database: Database,
  env: Env,
  events: (typeof schema.events.$inferSelect)[],
  now: number,
): Promise<void> {
  if (!events.length) return;
  const userIds = [...new Set(events.map((event) => event.userId))];
  const studying = new Set<string>();
  for (const ids of batches(userIds)) {
    const rows = await database.select().from(schema.userPresence).where(inArray(schema.userPresence.userId, ids));
    for (const row of rows) {
      if (livePresence(row, now).activity !== "idle") studying.add(row.userId);
    }
  }

  const firstByUser = new Map<string, (typeof events)[number]>();
  for (const event of events) {
    if (studying.has(event.userId)) continue;
    const current = firstByUser.get(event.userId);
    if (!current || event.startAt < current.startAt) firstByUser.set(event.userId, event);
  }
  await Promise.all(
    [...firstByUser.values()].map((event) => {
      const left = Math.round((event.endAt - now) / MINUTE);
      return sendPushToUser(database, env, event.userId, "late_start", {
        title: `${event.subject || "Study"} started 10 minutes ago`,
        body: `${left} minutes left of ${event.title}. Start now and it still counts.`,
        tag: `arcadia-late-${event.id}`,
        link: `/app?openEvent=${encodeURIComponent(event.id)}`,
      }, `late:${event.id}:${event.startAt}`);
    }),
  );
}

/** When the streak check-in goes out: three hours before bedtime, between 5pm and 9pm. */
function streakCheckMinute(bedtime: string | null): number {
  const bed = parseClock(bedtime) ?? 22 * 60 + 30;
  // A bedtime after midnight (00:30) still means a late evening.
  const evening = bed < 12 * 60 ? bed + 24 * 60 : bed;
  return Math.min(21 * 60, Math.max(17 * 60, evening - 3 * 60));
}

/**
 * Evening check for students about to lose a streak of two or more days.
 * Runs every minute but only looks at students whose check time is in the
 * last five minutes, and push_deliveries keeps it to once a day.
 */
async function dispatchStreakRisks(database: Database, env: Env, now: number): Promise<void> {
  const browsers = database
    .select({ userId: schema.pushSubscriptions.userId })
    .from(schema.pushSubscriptions)
    .where(and(eq(schema.pushSubscriptions.checkinsEnabled, true), eq(schema.pushSubscriptions.streakEnabled, true)));
  const phones = database
    .select({ userId: schema.nativePushTokens.userId })
    .from(schema.nativePushTokens)
    .where(and(eq(schema.nativePushTokens.checkinsEnabled, true), eq(schema.nativePushTokens.streakEnabled, true)));
  const candidates = await database
    .select({ userId: schema.profiles.userId, timezone: schema.profiles.timezone, bedtime: schema.profiles.bedtime })
    .from(schema.profiles)
    .where(or(inArray(schema.profiles.userId, browsers), inArray(schema.profiles.userId, phones)));

  const due = candidates.filter((candidate) => {
    const localMinute = Math.floor((((now / MINUTE + zoneOffsetMinutes(candidate.timezone, now)) % 1440) + 1440) % 1440);
    const target = streakCheckMinute(candidate.bedtime) % 1440;
    const since = (localMinute - target + 1440) % 1440;
    return since < 5;
  });

  for (const candidate of due) {
    const todayKey = localDateKey(now, candidate.timezone);
    const dedupeKey = `streak:${todayKey}`;
    if (await alreadySent(database, candidate.userId, dedupeKey)) continue;

    // The same 60 days of history the app's streak is computed from.
    const since = now - 60 * DAY;
    const [blocks, recoveries] = await Promise.all([
      database
        .select({ startAt: schema.events.startAt, endAt: schema.events.endAt, outcome: schema.events.outcome })
        .from(schema.events)
        .where(and(
          eq(schema.events.userId, candidate.userId),
          eq(schema.events.category, "study"),
          gte(schema.events.startAt, since),
          lte(schema.events.startAt, now + DAY),
        )),
      database
        .select({ createdAt: schema.xpEvents.createdAt })
        .from(schema.xpEvents)
        .where(and(
          eq(schema.xpEvents.userId, candidate.userId),
          eq(schema.xpEvents.source, "recovery"),
          gte(schema.xpEvents.createdAt, since),
        )),
    ]);
    const recoveryDays = new Set(recoveries.map((row) => localDateKey(row.createdAt, candidate.timezone)));
    const risk = streakAtRisk(blocks, recoveryDays, candidate.timezone, now);
    if (!risk) continue;

    await sendPushToUser(database, env, candidate.userId, "streak", {
      title: `Your ${risk.streak}-day streak is on the line`,
      body: risk.percentDone > 0
        ? `You're at ${risk.percentDone}% of today's plan. Catch up a block tonight to keep it going.`
        : "Nothing from today's plan is done yet. Catch up a block tonight to keep it going.",
      tag: `arcadia-streak-${todayKey}`,
      link: "/app",
    }, dedupeKey);
  }
}
