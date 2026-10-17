import { asc, eq } from "drizzle-orm";
import { schema, type Database } from "../db";

export { openTasks, topBySubject, withPriorities, type PriorityPick } from "./priority-picks";

export type PriorityRow = typeof schema.priorities.$inferSelect;

export async function loadPriorities(database: Database, userId: string): Promise<PriorityRow[]> {
  return database
    .select()
    .from(schema.priorities)
    .where(eq(schema.priorities.userId, userId))
    .orderBy(asc(schema.priorities.position));
}
