import { and, eq, gte, lt, sql } from "drizzle-orm";
import { Hono } from "hono";
import { CONSISTENCY_THRESHOLD, levelForXp, XP } from "../../../shared/progress";
import { db, schema } from "../db";
import { awardXp } from "../lib/rewards";
import { syncAchievements } from "../lib/achievements";
import { computeStreaks } from "../lib/analytics";
import { DAY, MINUTE, startOfLocalDay } from "../lib/time";
import type { Env, Variables } from "../types";

const progress = new Hono<{ Bindings: Env; Variables: Variables }>();

progress.get("/", async (c) => {
  const { userId } = c.get("session"); const database = db(c.env.DB);
  const [profile] = await database.select({ timezone: schema.profiles.timezone }).from(schema.profiles).where(eq(schema.profiles.userId, userId));
  const now = Date.now(); const start = startOfLocalDay(now, profile?.timezone || "Australia/Brisbane");
  const [events, sessions, totals] = await Promise.all([
    database.select().from(schema.events).where(and(eq(schema.events.userId, userId), eq(schema.events.category, "study"), gte(schema.events.startAt, start), lt(schema.events.startAt, start + DAY))),
    database.select().from(schema.studySessions).where(and(eq(schema.studySessions.userId, userId), gte(schema.studySessions.endedAt, start))),
    database.select({ xp: sql<number>`coalesce(sum(${schema.xpEvents.xp}), 0)` }).from(schema.xpEvents).where(eq(schema.xpEvents.userId, userId)),
  ]);
  const goalMinutes = Math.max(1, Math.round(events.reduce((sum, event) => sum + (event.endAt - event.startAt), 0) / MINUTE));
  const completedMinutes = Math.round(events.filter((event) => event.outcome === "completed").reduce((sum, event) => sum + (event.endAt - event.startAt), 0) / MINUTE);
  const focusedMinutes = Math.round(sessions.filter((session) => session.type !== "break").reduce((sum, session) => sum + session.seconds, 0) / 60);
  const doneMinutes = Math.max(completedMinutes, focusedMinutes);
  const closed = doneMinutes >= Math.ceil(goalMinutes * CONSISTENCY_THRESHOLD);
  const ringReward = closed ? await awardXp(database, userId, "ring_closed", String(start), XP.ringClosed) : [];
  const xp = Number(totals[0]?.xp ?? 0) + ringReward.reduce((sum, reward) => sum + reward.xp, 0); const level = levelForXp(xp);
  const allSessions = await database.select().from(schema.studySessions).where(eq(schema.studySessions.userId, userId));
  const streaks = computeStreaks(allSessions, profile?.timezone || "Australia/Brisbane");
  const achievements = await syncAchievements(database, userId, profile?.timezone || "Australia/Brisbane");
  const earnedFreezes = Math.min(2, Math.floor(streaks.longestStreak / 7));
  return c.json({ xp, level: level.level, title: level.title, levelProgress: { current: level.progress, needed: level.needed }, todayRing: { doneMinutes, goalMinutes, closed }, streak: { days: streaks.currentStreak, freezes: earnedFreezes, protectedToday: false }, achievements, personalBests: { longestFocus: Math.max(0, ...allSessions.map((session) => Math.round(session.seconds / 60))), longestStreak: streaks.longestStreak }, recentUnlocks: achievements.filter((achievement) => achievement.unlockedAt && achievement.unlockedAt >= now - DAY) });
});

export default progress;
