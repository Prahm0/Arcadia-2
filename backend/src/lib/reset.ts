import { and, eq, gte, isNull, ne, or } from "drizzle-orm";
import { schema, type Database } from "../db";
import { replan } from "./replan";

export interface ResetCounts {
  /** Blocks the student dragged somewhere else. */
  moved: number;
  /** Blocks the student took off the schedule. */
  removed: number;
}

/**
 * The student's own changes to Arcadia's study blocks from now on: blocks
 * they moved (pinned where they were put) and blocks they removed (kept as
 * skipped so the re-plan wouldn't put them back).
 *
 * Nothing else counts. Done blocks, started blocks, the past, deadlines,
 * commitments and imported calendars all stay as they are.
 */
function changedBlocks(userId: string, now: number) {
  return and(
    eq(schema.events.userId, userId),
    eq(schema.events.source, "auto"),
    gte(schema.events.startAt, now),
    isNull(schema.events.startedAt),
    ne(schema.events.outcome, "completed"),
    or(eq(schema.events.pinned, true), eq(schema.events.outcome, "missed")),
  );
}

export async function resetCounts(database: Database, userId: string, now = Date.now()): Promise<ResetCounts> {
  const rows = await database
    .select({ outcome: schema.events.outcome })
    .from(schema.events)
    .where(changedBlocks(userId, now));
  const removed = rows.filter((row) => row.outcome === "missed").length;
  return { moved: rows.length - removed, removed };
}

/** Drops those changes and lays the next four weeks out again from Arcad's plan. */
export async function resetSchedule(database: Database, userId: string, now = Date.now()): Promise<ResetCounts> {
  const counts = await resetCounts(database, userId, now);
  await database.delete(schema.events).where(changedBlocks(userId, now));
  await replan(database, userId);
  return counts;
}
