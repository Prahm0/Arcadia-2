import { and, eq, gte, lte } from "drizzle-orm";
import { Hono } from "hono";
import { bucketByDay, bucketBySubject, computeStreaks, minutesBetween } from "../lib/analytics";
import { db, schema } from "../db";
import { getUserTier, isPaidTier } from "../lib/tiers";
import { DAY, iso, localHour, startOfLocalDay } from "../lib/time";
import type { Env, Variables } from "../types";

const analytics = new Hono<{ Bindings: Env; Variables: Variables }>();

analytics.get("/", async (c) => {
  const { userId } = c.get("session");
  const requested = c.req.query("period");
  const period: "day" | "week" | "month" =
    requested === "day" || requested === "month" ? requested : "week";

  const database = db(c.env.DB);
  const [profile] = await database
    .select()
    .from(schema.profiles)
    .where(eq(schema.profiles.userId, userId))
    .limit(1);
  const timezone = profile?.timezone ?? "Australia/Brisbane";

  const span = period === "day" ? 1 : period === "month" ? 30 : 7;
  const end = startOfLocalDay(Date.now(), timezone) + DAY;
  const start = end - span * DAY;
  const previousStart = start - span * DAY;

  const rows = await database
    .select()
    .from(schema.studySessions)
    .where(
      and(
        eq(schema.studySessions.userId, userId),
        gte(schema.studySessions.endedAt, previousStart),
        lte(schema.studySessions.endedAt, end),
      ),
    );

  const current = rows.filter((row) => row.endedAt >= start);
  const previous = rows.filter((row) => row.endedAt < start);

  const hourly = Array.from({ length: 24 }, (_, hour) => ({ hour, minutes: 0 }));
  for (const row of current) {
    hourly[localHour(row.endedAt, timezone)].minutes += Math.round(row.seconds / 60);
  }

  const allSessions = await database
    .select()
    .from(schema.studySessions)
    .where(eq(schema.studySessions.userId, userId));
  const streaks = computeStreaks(allSessions, timezone);
  const tier = await getUserTier(database, userId);
  const recentMisses = isPaidTier(tier)
    ? await database
        .select({ missReason: schema.events.missReason })
        .from(schema.events)
        .where(
          and(
            eq(schema.events.userId, userId),
            eq(schema.events.category, "study"),
            eq(schema.events.outcome, "missed"),
            gte(schema.events.endAt, end - 30 * DAY),
          ),
        )
    : [];
  const missReasonCounts = new Map<string, number>();
  for (const row of recentMisses) {
    if (!row.missReason) continue;
    missReasonCounts.set(row.missReason, (missReasonCounts.get(row.missReason) ?? 0) + 1);
  }

  return c.json({
    period,
    range: { start: iso(start), end: iso(end) },
    timezone,
    daily: bucketByDay(current, start, end, timezone),
    previousDaily: bucketByDay(previous, previousStart, start, timezone),
    hourly,
    subjects: bucketBySubject(current),
    missReasons: [...missReasonCounts.entries()]
      .map(([reason, count]) => ({ reason, count }))
      .sort((a, b) => b.count - a.count || a.reason.localeCompare(b.reason)),
    streaks: { current: streaks.currentStreak, longest: streaks.longestStreak },
    current: summarise(current),
    previous: summarise(previous),
  });
});

function summarise(rows: Array<typeof schema.studySessions.$inferSelect>) {
  const minutes = minutesBetween(rows);
  const sessions = rows.length;
  return {
    minutes,
    sessions,
    averageMinutes: sessions === 0 ? 0 : Math.round(minutes / sessions),
  };
}

export default analytics;
