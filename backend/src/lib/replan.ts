import { eq } from "drizzle-orm";
import { schema, type Database } from "../db";
import { rebuildSchedule } from "./scheduler";
import { DAY, startOfLocalDay } from "./time";

/**
 * How far ahead the plan is laid out. Four weeks, so the month plan made at
 * onboarding shows up on the Schedule straight away; the dashboard only
 * refreshes the first week on each load, and any edit refreshes all of it.
 */
export const PLAN_DAYS = 28;

/** Re-plans the next four weeks for one user. */
export async function replan(database: Database, userId: string): Promise<void> {
  const [profile] = await database
    .select()
    .from(schema.profiles)
    .where(eq(schema.profiles.userId, userId))
    .limit(1);
  if (!profile?.onboardingComplete) return;

  const start = startOfLocalDay(Date.now(), profile.timezone);
  await rebuildSchedule(database, userId, start, start + PLAN_DAYS * DAY);
}
