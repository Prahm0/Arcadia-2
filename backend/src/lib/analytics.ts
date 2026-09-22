import { schema } from "../db";
import { DAY, localDateKey, nextLocalDay, startOfLocalDay } from "./time";

type SessionRow = typeof schema.studySessions.$inferSelect;

export function minutesBetween(sessions: SessionRow[]): number {
  return Math.round(sessions.reduce((sum, session) => sum + session.seconds, 0) / 60);
}

/** Consecutive local days, ending today or yesterday, with any focus time. */
export function computeStreaks(
  sessions: SessionRow[],
  timeZone: string,
): { currentStreak: number; longestStreak: number } {
  const days = new Set(
    sessions
      .filter((session) => session.type !== "break" && session.seconds > 0)
      .map((session) => localDateKey(session.endedAt, timeZone)),
  );
  if (days.size === 0) return { currentStreak: 0, longestStreak: 0 };

  const sorted = [...days].sort();
  let longest = 1;
  let run = 1;
  for (let i = 1; i < sorted.length; i++) {
    const previous = Date.parse(`${sorted[i - 1]}T00:00:00Z`);
    const current = Date.parse(`${sorted[i]}T00:00:00Z`);
    if (current - previous === DAY) {
      run += 1;
      longest = Math.max(longest, run);
    } else {
      run = 1;
    }
  }

  // Count back from today. An empty today does not break a streak that ran
  // up to yesterday, but an empty yesterday does.
  // Step back by local day, not a flat 24h, or the 23-hour day when the
  // clocks go forward gets skipped and the streak breaks.
  const previousDay = (day: number) => startOfLocalDay(day - DAY / 2, timeZone);
  const todayStart = startOfLocalDay(Date.now(), timeZone);
  let cursor = days.has(localDateKey(todayStart, timeZone)) ? todayStart : previousDay(todayStart);
  let current = 0;
  while (days.has(localDateKey(cursor, timeZone)) && current <= 3650) {
    current += 1;
    cursor = previousDay(cursor);
  }

  return { currentStreak: current, longestStreak: Math.max(longest, current) };
}

export interface Bucket {
  date: string;
  minutes: number;
  sessions: number;
}

export function bucketByDay(
  sessions: SessionRow[],
  from: number,
  to: number,
  timeZone: string,
): Bucket[] {
  const buckets = new Map<string, Bucket>();
  for (let day = startOfLocalDay(from, timeZone); day < to; day = nextLocalDay(day, timeZone)) {
    const key = localDateKey(day, timeZone);
    buckets.set(key, { date: key, minutes: 0, sessions: 0 });
  }
  for (const session of sessions) {
    const key = localDateKey(session.endedAt, timeZone);
    const bucket = buckets.get(key);
    if (!bucket) continue;
    bucket.minutes += Math.round(session.seconds / 60);
    bucket.sessions += 1;
  }
  return [...buckets.values()];
}

export function bucketBySubject(sessions: SessionRow[]) {
  const buckets = new Map<string, { subject: string; minutes: number; sessions: number }>();
  for (const session of sessions) {
    const subject = session.subject || "Unassigned";
    const bucket = buckets.get(subject) ?? { subject, minutes: 0, sessions: 0 };
    bucket.minutes += Math.round(session.seconds / 60);
    bucket.sessions += 1;
    buckets.set(subject, bucket);
  }
  return [...buckets.values()].sort((a, b) => b.minutes - a.minutes);
}
