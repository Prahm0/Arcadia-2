import { and, eq, gte, sql } from "drizzle-orm";
import { XP } from "../../../shared/progress";
import { schema, type Database } from "../db";
import { newId } from "./ids";

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
