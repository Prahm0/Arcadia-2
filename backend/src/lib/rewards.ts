import { and, eq, gte, sql } from "drizzle-orm";
import { XP } from "../../../shared/progress";
import { schema, type Database } from "../db";
import { newId } from "./ids";
import { startOfLocalDay } from "./time";

export interface Reward { xp: number; source: string }

export async function awardXp(database: Database, userId: string, source: string, sourceId: string, xp: number): Promise<Reward[]> {
  const inserted = await database.insert(schema.xpEvents).values({ id: newId("xp"), userId, source, sourceId, xp }).onConflictDoNothing().returning({ id: schema.xpEvents.id });
  return inserted.length ? [{ xp, source }] : [];
}

export async function awardFocusXp(database: Database, userId: string, sourceId: string, minutes: number, dayStart: number): Promise<Reward[]> {
  const [{ used = 0 } = {}] = await database.select({ used: sql<number>`coalesce(sum(${schema.xpEvents.xp}), 0)` }).from(schema.xpEvents).where(and(eq(schema.xpEvents.userId, userId), eq(schema.xpEvents.source, "focus_minute"), gte(schema.xpEvents.createdAt, dayStart)));
  const earned = Math.max(0, Math.min(Math.floor(minutes), XP.focusDailyCap - Number(used)));
  return earned > 0 ? awardXp(database, userId, "focus_minute", sourceId, earned) : [];
}

/** Ten XP for ticking one of your own lines, at most lineDailyCap a day so a long list isn't a farm. */
export async function awardLineXp(database: Database, userId: string, sourceId: string, dayStart: number): Promise<Reward[]> {
  const [{ used = 0 } = {}] = await database.select({ used: sql<number>`coalesce(sum(${schema.xpEvents.xp}), 0)` }).from(schema.xpEvents).where(and(eq(schema.xpEvents.userId, userId), eq(schema.xpEvents.source, "day_line"), gte(schema.xpEvents.createdAt, dayStart)));
  return Number(used) + XP.line <= XP.lineDailyCap ? awardXp(database, userId, "day_line", sourceId, XP.line) : [];
}

export async function takeBackLineXp(database: Database, userId: string, sourceId: string): Promise<void> {
  await database.delete(schema.xpEvents).where(and(eq(schema.xpEvents.userId, userId), eq(schema.xpEvents.source, "day_line"), eq(schema.xpEvents.sourceId, sourceId)));
}

/** Ticking a line earns its XP once; unticking takes it back. */
export async function lineXp(database: Database, userId: string, id: string, done: boolean): Promise<Reward[]> {
  if (!done) {
    await takeBackLineXp(database, userId, id);
    return [];
  }
  const [profile] = await database.select({ timezone: schema.profiles.timezone }).from(schema.profiles).where(eq(schema.profiles.userId, userId)).limit(1);
  return awardLineXp(database, userId, id, startOfLocalDay(Date.now(), profile?.timezone ?? "Australia/Brisbane"));
}
