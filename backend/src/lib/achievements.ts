import { eq } from "drizzle-orm";
import { ACHIEVEMENTS, type AchievementDefinition } from "../../../shared/achievements";
import { schema, type Database } from "../db";
import { computeStreaks } from "./analytics";

export interface AchievementProgress extends AchievementDefinition {
  current: number;
  unlockedAt: number | null;
}

export async function syncAchievements(database: Database, userId: string, timezone: string): Promise<AchievementProgress[]> {
  const [sessions, tasks, subjects, xpRows, unlocked] = await Promise.all([
    database.select().from(schema.studySessions).where(eq(schema.studySessions.userId, userId)),
    database.select().from(schema.tasks).where(eq(schema.tasks.userId, userId)),
    database.select().from(schema.subjects).where(eq(schema.subjects.userId, userId)),
    database.select({ source: schema.xpEvents.source }).from(schema.xpEvents).where(eq(schema.xpEvents.userId, userId)),
    database.select().from(schema.userAchievements).where(eq(schema.userAchievements.userId, userId)),
  ]);
  const focus = sessions.filter((session) => session.type !== "break");
  const minutes = Math.floor(focus.reduce((sum, session) => sum + session.seconds, 0) / 60);
  const streak = computeStreaks(focus, timezone).longestStreak;
  const recoveries = xpRows.filter((row) => row.source === "recovery").length;
  const hasWeekend = focus.some((session) => {
    const day = new Intl.DateTimeFormat("en-US", { timeZone: timezone, weekday: "short" }).format(new Date(session.endedAt));
    return day === "Sat" || day === "Sun";
  }) ? 1 : 0;
  const values: Record<string, number> = {
    streak_3: streak, streak_7: streak, streak_14: streak, streak_30: streak, streak_50: streak, streak_100: streak,
    focus_first: focus.length, focus_60: Math.max(0, ...focus.map((session) => Math.floor(session.seconds / 60))), focus_600: minutes, focus_3000: minutes, sessions_25: focus.length,
    recovery_first: recoveries, recovery_10: recoveries, tasks_5: tasks.filter((task) => task.status === "complete").length, tasks_early_3: 0,
    subject_first: subjects.length, weekend: hasWeekend,
  };
  const already = new Map(unlocked.map((row) => [row.achievementId, row.unlockedAt]));
  const now = Date.now();
  for (const definition of ACHIEVEMENTS) {
    if (values[definition.id] >= definition.target && !already.has(definition.id)) {
      await database.insert(schema.userAchievements).values({ userId, achievementId: definition.id, unlockedAt: now }).onConflictDoNothing();
      already.set(definition.id, now);
    }
  }
  return ACHIEVEMENTS.map((definition) => ({ ...definition, current: Math.min(definition.target, values[definition.id] ?? 0), unlockedAt: already.get(definition.id) ?? null }));
}
