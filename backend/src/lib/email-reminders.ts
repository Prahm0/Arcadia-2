import { and, eq, gte, inArray, like, lte, max, not } from "drizzle-orm";
import { db, schema, type Database } from "../db";
import type { Env } from "../types";
import { sendEmail, studyPlanEmail } from "./email";
import { formatBlockTime, inSendWindow, lastActiveAt, skipReason } from "./email-reminder-rules";
import { signUnsubscribeToken, unsubscribeUrl } from "./email-unsubscribe";
import { DAY, localDateKey, nextLocalDay, startOfLocalDay } from "./time";

/** Most emails one cron run sends. D1 and fetch calls share a per-invocation subrequest budget. */
const MAX_SENDS_PER_RUN = 100;
/** D1 caps bound parameters per query, so id lists go in batches. */
const BATCH = 90;

const dedupeKeyFor = (localDay: string) => `email-plan:${localDay}`;

function batches<T>(items: T[], size = BATCH): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < items.length; i += size) result.push(items.slice(i, i + size));
  return result;
}

interface Candidate {
  userId: string;
  email: string;
  name: string;
  displayName: string | null;
  timezone: string;
  createdAt: number;
  lastSignInAt: number | null;
}

interface PlannedBlock {
  subject: string;
  startAt: number;
  endAt: number;
}

/** Today's blocks still to come, as the email lists them. */
function plannedToday(events: (typeof schema.events.$inferSelect)[], timezone: string, now: number): PlannedBlock[] {
  const dayStart = startOfLocalDay(now, timezone);
  const dayEnd = nextLocalDay(dayStart, timezone);
  return events
    .filter((event) => event.outcome === "planned" && event.startAt >= dayStart && event.startAt < dayEnd && event.endAt > now)
    .sort((a, b) => a.startAt - b.startAt)
    .map((event) => ({ subject: event.subject || event.title, startAt: event.startAt, endAt: event.endAt }));
}

async function buildEmail(env: Env, candidate: Candidate, blocks: PlannedBlock[], now: number) {
  const token = await signUnsubscribeToken(env, candidate.userId);
  if (!token) return null;
  const firstName = (candidate.displayName || candidate.name).trim().split(/\s+/)[0] ?? "";
  const url = unsubscribeUrl(env, token);
  const content = studyPlanEmail({
    firstName,
    blocks: blocks.map((block) => ({
      subject: block.subject,
      time: formatBlockTime(block.startAt, candidate.timezone),
      minutes: Math.max(1, Math.round((block.endAt - block.startAt) / 60_000)),
    })),
    appLink: `${env.APP_ORIGIN}/app`,
    unsubscribeUrl: url,
  });
  // One-click unsubscribe for mail clients (RFC 8058), alongside the footer link.
  const headers = { "List-Unsubscribe": `<${url}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" };
  return { ...content, headers };
}

/** Events a plan email can depend on: study blocks around today in any timezone. */
async function loadEvents(database: Database, userIds: string[], now: number) {
  const byUser = new Map<string, (typeof schema.events.$inferSelect)[]>();
  for (const ids of batches(userIds)) {
    const rows = await database
      .select()
      .from(schema.events)
      .where(and(
        inArray(schema.events.userId, ids),
        eq(schema.events.category, "study"),
        gte(schema.events.startAt, now - DAY),
        lte(schema.events.startAt, now + DAY),
      ));
    for (const row of rows) {
      const list = byUser.get(row.userId) ?? [];
      list.push(row);
      byUser.set(row.userId, list);
    }
  }
  return byUser;
}

/**
 * The 4pm plan email. Runs from the one-minute cron like dispatchStreakRisks:
 * work out which timezones are inside their send window, then check each
 * student there. push_deliveries ("email-plan:<local date>") keeps it to one a
 * day; the row is claimed before sending and released if the send fails, so a
 * Resend hiccup retries on the next minute instead of losing the day.
 */
export async function dispatchEmailReminders(env: Env, now = Date.now()): Promise<void> {
  // No key to sign unsubscribe links with means no email at all: every one needs the link.
  if (!env.RESEND_API_KEY || !env.TOKEN_ENCRYPTION_KEY) return;
  const database = db(env.DB);

  const zoneRows = await database
    .selectDistinct({ timezone: schema.profiles.timezone })
    .from(schema.profiles)
    .where(eq(schema.profiles.emailRemindersEnabled, true));
  const dueZones = zoneRows.map((row) => row.timezone).filter((timezone) => inSendWindow(timezone, now));
  if (!dueZones.length) return;

  const candidates: Candidate[] = [];
  for (const zones of batches(dueZones)) {
    candidates.push(...await database
      .select({
        userId: schema.profiles.userId,
        email: schema.users.email,
        name: schema.users.name,
        displayName: schema.profiles.displayName,
        timezone: schema.profiles.timezone,
        createdAt: schema.users.createdAt,
        lastSignInAt: schema.users.lastSignInAt,
      })
      .from(schema.profiles)
      .innerJoin(schema.users, eq(schema.users.id, schema.profiles.userId))
      .where(and(
        eq(schema.profiles.emailRemindersEnabled, true),
        inArray(schema.profiles.timezone, zones),
        // Only addresses the student confirmed, and never guest accounts.
        eq(schema.users.emailVerified, true),
        not(like(schema.users.email, "%@arcadia.local")),
      )));
  }

  let sends = 0;
  for (const group of batches(candidates)) {
    if (sends >= MAX_SENDS_PER_RUN) break;
    const ids = group.map((candidate) => candidate.userId);
    const [events, sentRows, activeRows, sessionRows] = await Promise.all([
      loadEvents(database, ids, now),
      database
        .select({ userId: schema.pushDeliveries.userId, dedupeKey: schema.pushDeliveries.dedupeKey })
        .from(schema.pushDeliveries)
        .where(and(inArray(schema.pushDeliveries.userId, ids), like(schema.pushDeliveries.dedupeKey, "email-plan:%"))),
      database
        .select({ userId: schema.userActiveDays.userId, day: max(schema.userActiveDays.day) })
        .from(schema.userActiveDays)
        .where(inArray(schema.userActiveDays.userId, ids))
        .groupBy(schema.userActiveDays.userId),
      database
        .select({ userId: schema.studySessions.userId, endedAt: schema.studySessions.endedAt, type: schema.studySessions.type })
        .from(schema.studySessions)
        .where(and(inArray(schema.studySessions.userId, ids), gte(schema.studySessions.endedAt, now - DAY))),
    ]);
    const sent = new Set(sentRows.map((row) => `${row.userId}|${row.dedupeKey}`));
    const activeDay = new Map(activeRows.map((row) => [row.userId, row.day]));

    for (const candidate of group) {
      if (sends >= MAX_SENDS_PER_RUN) break;
      const today = localDateKey(now, candidate.timezone);
      const dedupeKey = dedupeKeyFor(today);
      if (sent.has(`${candidate.userId}|${dedupeKey}`)) continue;

      const userEvents = events.get(candidate.userId) ?? [];
      const dayStart = startOfLocalDay(now, candidate.timezone);
      // Already studied today: a completed planned block, or any focus timer that finished.
      const completedToday =
        userEvents.some((event) => event.outcome === "completed" && event.startAt >= dayStart) ||
        sessionRows.some((row) => row.userId === candidate.userId && row.type !== "break" && row.endedAt >= dayStart);
      const blocks = plannedToday(userEvents, candidate.timezone, now);
      const skip = skipReason({
        now,
        lastActive: lastActiveAt({ activeDay: activeDay.get(candidate.userId) ?? null, lastSignInAt: candidate.lastSignInAt, createdAt: candidate.createdAt }),
        completedToday,
        plannedBlocks: blocks.length,
      });
      if (skip) continue;

      const claimed = await database
        .insert(schema.pushDeliveries)
        .values({ userId: candidate.userId, dedupeKey, sentAt: now })
        .onConflictDoNothing()
        .returning({ dedupeKey: schema.pushDeliveries.dedupeKey });
      if (!claimed.length) continue;

      sends += 1;
      const email = await buildEmail(env, candidate, blocks, now);
      const ok = email ? await sendEmail(env, { to: candidate.email, ...email }) : false;
      if (!ok) {
        console.error("[email-reminders] send failed", { userId: candidate.userId });
        await database
          .delete(schema.pushDeliveries)
          .where(and(eq(schema.pushDeliveries.userId, candidate.userId), eq(schema.pushDeliveries.dedupeKey, dedupeKey)));
      }
    }
  }
}

/**
 * Sends today's plan email to one student right now, skipping the 4pm window,
 * the dedupe row and the activity rules. For the developer test route only.
 */
export async function sendPlanEmailNow(
  env: Env,
  userId: string,
  now = Date.now(),
): Promise<{ status: "sent" | "not_sent" | "no_blocks" | "no_signing_key"; subject?: string; html?: string }> {
  const database = db(env.DB);
  const [row] = await database
    .select({
      userId: schema.users.id,
      email: schema.users.email,
      name: schema.users.name,
      displayName: schema.profiles.displayName,
      timezone: schema.profiles.timezone,
      createdAt: schema.users.createdAt,
      lastSignInAt: schema.users.lastSignInAt,
    })
    .from(schema.users)
    .innerJoin(schema.profiles, eq(schema.profiles.userId, schema.users.id))
    .where(eq(schema.users.id, userId))
    .limit(1);
  if (!row) return { status: "no_blocks" };

  const events = (await loadEvents(database, [userId], now)).get(userId) ?? [];
  const blocks = plannedToday(events, row.timezone, now);
  if (!blocks.length) return { status: "no_blocks" };

  const email = await buildEmail(env, row, blocks, now);
  if (!email) return { status: "no_signing_key" };
  const sent = await sendEmail(env, { to: row.email, ...email });
  // Without RESEND_API_KEY (local dev) hand back the HTML so it can be previewed.
  return sent ? { status: "sent", subject: email.subject } : { status: "not_sent", subject: email.subject, html: email.html };
}
