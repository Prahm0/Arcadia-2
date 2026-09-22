import { and, eq, gte, lt } from "drizzle-orm";
import { schema, type Database } from "../db";
import { subjectKey } from "./scheduler";
import { DAY, MINUTE, startOfLocalWeek } from "./time";

export interface SubjectWeek {
  /** Study done this week, in minutes. */
  doneMinutes: number;
  /** Study still planned for the rest of this week, in minutes. */
  plannedMinutes: number;
}

/**
 * This week's study per subject (Monday to Sunday, local time), keyed by
 * subjectKey. "Done" is the larger of completed blocks and logged focus time,
 * the same rule the scheduler credits against weekly targets, because a
 * block studied through the Focus timer records both.
 */
export async function subjectWeekProgress(
  database: Database,
  userId: string,
  timeZone: string,
): Promise<Map<string, SubjectWeek>> {
  const now = Date.now();
  const weekStart = startOfLocalWeek(now, timeZone);
  const weekEnd = startOfLocalWeek(weekStart + 7 * DAY + DAY / 2, timeZone);

  const [events, sessions] = await Promise.all([
    database
      .select()
      .from(schema.events)
      .where(
        and(
          eq(schema.events.userId, userId),
          eq(schema.events.category, "study"),
          gte(schema.events.startAt, weekStart),
          lt(schema.events.startAt, weekEnd),
        ),
      ),
    database
      .select()
      .from(schema.studySessions)
      .where(
        and(
          eq(schema.studySessions.userId, userId),
          gte(schema.studySessions.endedAt, weekStart),
        ),
      ),
  ]);

  const tally = new Map<string, { completed: number; focused: number; planned: number }>();
  const entry = (subject: string | null) => {
    const key = subjectKey(subject);
    let found = tally.get(key);
    if (!found) {
      found = { completed: 0, focused: 0, planned: 0 };
      tally.set(key, found);
    }
    return found;
  };

  for (const event of events) {
    if (!event.subject) continue;
    const length = event.endAt - event.startAt;
    if (event.outcome === "completed") entry(event.subject).completed += length;
    else if (event.outcome === "planned" && event.endAt > now) entry(event.subject).planned += length;
  }
  for (const session of sessions) {
    if (session.type !== "focus" || !session.subject) continue;
    entry(session.subject).focused += session.seconds * 1000;
  }

  const out = new Map<string, SubjectWeek>();
  for (const [key, value] of tally) {
    out.set(key, {
      doneMinutes: Math.round(Math.max(value.completed, value.focused) / MINUTE),
      plannedMinutes: Math.round(value.planned / MINUTE),
    });
  }
  return out;
}
