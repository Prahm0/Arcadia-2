import type { PlannerEvent } from "@/lib/api/types";
import { dateKey } from "@/lib/api/time";

/**
 * A day counts as "consistent" when planned study minutes are met to at least
 * this ratio. 70% intentionally leaves headroom for a class overrun or a
 * late-starting session without breaking a streak.
 */
export const CONSISTENCY_THRESHOLD = 0.7;

export const STREAK_MILESTONES = [3, 7, 30] as const;

export interface DayConsistency {
  key: string;
  plannedMinutes: number;
  actualMinutes: number;
  ratio: number;
  consistent: boolean;
  /** True while the day is still in progress — protects it from breaking a streak. */
  isInProgress: boolean;
  /** Set when the day had a plan but fell short, phrased for direct display. */
  missReason?: string;
}

export interface StreakSummary {
  current: number;
  longest: number;
  /** Highest milestone reached by the current streak, or null. */
  hitMilestone: number | null;
  /** Next milestone the current streak is working toward, or null past 30. */
  nextMilestone: number | null;
  /** How many more consistent days to reach that next milestone. */
  daysToNext: number | null;
  /** Most recent day that had a plan — used to surface "why" a streak broke. */
  lastPlannedDay: DayConsistency | null;
  /** Full window, oldest → newest. */
  history: DayConsistency[];
}

/**
 * Build a per-day consistency record for every day in the dashboard's event
 * window. Days without any planned study appear as `plannedMinutes: 0`, and
 * are neutral: they neither add to nor break a streak.
 */
export function computeConsistency(
  events: PlannerEvent[],
  timezone: string,
  todayKey: string,
): DayConsistency[] {
  const study = events.filter((event) => event.category === "study");
  if (study.length === 0) return [];

  const dayMap = new Map<string, { planned: number; actual: number }>();
  const nowMs = Date.now();

  for (const event of study) {
    const key = dateKey(event.startAt, timezone);
    const minutes = Math.max(0, (Date.parse(event.endAt) - Date.parse(event.startAt)) / 60000);
    const bucket = dayMap.get(key) ?? { planned: 0, actual: 0 };
    bucket.planned += minutes;
    if (event.outcome === "completed") bucket.actual += minutes;
    dayMap.set(key, bucket);
  }

  const keys = [...dayMap.keys()].sort();
  return keys.map((key) => {
    const bucket = dayMap.get(key)!;
    const planned = Math.round(bucket.planned);
    const actual = Math.round(bucket.actual);
    const ratio = planned > 0 ? actual / planned : 0;
    const consistent = planned > 0 && ratio >= CONSISTENCY_THRESHOLD;
    const dayEndMs = new Date(`${key}T23:59:59Z`).getTime();
    const isInProgress = key === todayKey && nowMs < dayEndMs;
    return {
      key,
      plannedMinutes: planned,
      actualMinutes: actual,
      ratio,
      consistent,
      isInProgress,
      missReason:
        planned > 0 && !consistent
          ? `${actual} of ${planned} planned min`
          : undefined,
    };
  });
}

/**
 * Walk backwards from today to build the current consistent-day streak.
 *
 * The current in-progress day is treated as a "grace day" — it can't break a
 * streak yet, but it does extend it once its ratio crosses the threshold.
 * Days without any planned study are transparent: the walk passes over them.
 */
export function computeStreak(
  events: PlannerEvent[],
  timezone: string,
  now: Date = new Date(),
): StreakSummary {
  const todayKey = dateKey(now.toISOString(), timezone);
  const history = computeConsistency(events, timezone, todayKey);
  const byKey = new Map(history.map((day) => [day.key, day]));

  // Current streak: walk backwards from today, jumping over planless days.
  let current = 0;
  let cursor = todayKey;
  // Guard against runaway walks in a stale dataset.
  const MAX_WALK = 400;
  for (let i = 0; i < MAX_WALK; i += 1) {
    const day = byKey.get(cursor);
    if (day) {
      if (day.consistent) {
        current += 1;
      } else if (day.isInProgress) {
        // Today hasn't ruled itself out yet — skip it and keep walking backwards.
      } else if (day.plannedMinutes > 0) {
        // A planned day that fell short — the streak stops here.
        break;
      }
      // A planned-but-empty day (planned: 0) can't happen because we require
      // planned>0 to make it into `history` with any signal — but if it does,
      // treat as neutral and continue.
    }
    cursor = shiftKey(cursor, -1);
  }

  // Longest: iterate forward, resetting on any planned-day miss.
  let longest = 0;
  let run = 0;
  for (const day of history) {
    if (day.consistent) {
      run += 1;
      longest = Math.max(longest, run);
    } else if (day.plannedMinutes > 0 && !day.isInProgress) {
      run = 0;
    }
    // planless / in-progress days keep the run alive but don't extend it
  }

  const hitMilestone = highestMilestone(current);
  const nextMilestone = nextMilestoneAbove(current);
  const daysToNext = nextMilestone === null ? null : nextMilestone - current;

  // "Why" — the most recent planned day that isn't in progress, whether or not
  // it was consistent. Callers use it to explain a broken streak, or to
  // celebrate a fresh win when it IS consistent.
  const lastPlannedDay =
    [...history].reverse().find((day) => day.plannedMinutes > 0 && !day.isInProgress) ?? null;

  return {
    current,
    longest,
    hitMilestone,
    nextMilestone,
    daysToNext,
    lastPlannedDay,
    history,
  };
}

function highestMilestone(current: number): number | null {
  let hit: number | null = null;
  for (const m of STREAK_MILESTONES) {
    if (current >= m) hit = m;
  }
  return hit;
}

function nextMilestoneAbove(current: number): number | null {
  for (const m of STREAK_MILESTONES) {
    if (m > current) return m;
  }
  return null;
}

function shiftKey(key: string, days: number): string {
  const [y, m, d] = key.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}
