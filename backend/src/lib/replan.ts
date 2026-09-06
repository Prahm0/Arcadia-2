import { eq } from "drizzle-orm";
import { schema, type Database } from "../db";
import { rebuildSchedule } from "./scheduler";
import { DAY, startOfLocalDay } from "./time";

/** Re-plans the current 7-day window for one user. */
export async function replan(database: Database, userId: string): Promise<void> {
  const [profile] = await database
    .select()
    .from(schema.profiles)
    .where(eq(schema.profiles.userId, userId))
    .limit(1);
  if (!profile?.onboardingComplete) return;

  const start = startOfLocalDay(Date.now(), profile.timezone);
  await rebuildSchedule(database, userId, start, start + 7 * DAY);
}
