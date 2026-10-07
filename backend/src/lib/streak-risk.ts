import { CONSISTENCY_THRESHOLD } from "../../../shared/progress";
import { localDateKey } from "./time";

export interface StudyBlock {
  startAt: number;
  endAt: number;
  outcome: string;
}

export interface StreakRisk {
  /** Consistent days in a row, up to and including yesterday. */
  streak: number;
  /** Share of today's planned minutes done so far, 0–100. */
  percentDone: number;
}

/**
 * Whether tonight is the night a streak breaks. Uses the app's definition of
 * a consistent day (lib/app/streaks.ts): 70% of the day's planned study
 * completed, or a Life happened day with some study done. Days with no plan
 * are passed over. A risk needs a streak of two or more running up to
 * yesterday, and a today whose remaining plan can't reach 70% on its own —
 * if the blocks still ahead would get there, their own check-ins cover it.
 */
export function streakAtRisk(
  blocks: StudyBlock[],
  recoveryDays: ReadonlySet<string>,
  timeZone: string,
  now: number,
): StreakRisk | null {
  const days = new Map<string, { planned: number; done: number; open: number }>();
  for (const block of blocks) {
    const key = localDateKey(block.startAt, timeZone);
    const minutes = Math.max(0, (block.endAt - block.startAt) / 60_000);
    const day = days.get(key) ?? { planned: 0, done: 0, open: 0 };
    day.planned += minutes;
    if (block.outcome === "completed") day.done += minutes;
    // Still to come, or under way right now.
    if (block.outcome === "planned" && block.endAt > now) day.open += minutes;
    days.set(key, day);
  }

  // true / false for a planned day, null for a day with no plan.
  const consistent = (key: string): boolean | null => {
    const day = days.get(key);
    const planned = Math.round(day?.planned ?? 0);
    if (!day || planned <= 0) return null;
    const done = Math.round(day.done);
    return done / planned >= CONSISTENCY_THRESHOLD || (recoveryDays.has(key) && done > 0);
  };

  const todayKey = localDateKey(now, timeZone);
  const today = days.get(todayKey);
  const planned = Math.round(today?.planned ?? 0);
  if (!today || planned <= 0 || consistent(todayKey)) return null;
  if ((Math.round(today.done) + Math.round(today.open)) / planned >= CONSISTENCY_THRESHOLD) return null;

  let streak = 0;
  let cursor = shiftKey(todayKey, -1);
  // The same bound as the app's walk back through history.
  for (let i = 0; i < 400; i += 1) {
    const day = consistent(cursor);
    if (day === false) break;
    if (day === true) streak += 1;
    cursor = shiftKey(cursor, -1);
  }
  if (streak < 2) return null;
  return { streak, percentDone: Math.round((Math.round(today.done) / planned) * 100) };
}

function shiftKey(key: string, days: number): string {
  const [y, m, d] = key.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
