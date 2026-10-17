/**
 * The small rules behind Today's rewards, kept pure so they're tested:
 * when ticks count as a combo, when a day is perfect, when the ring has just
 * closed, how the Done group forms and how big the streak flame gets.
 */

/** Ticks this close together count as one run. */
export const COMBO_WINDOW_MS = 20 * 60_000;

/** How many ticks in a row end with the latest one: 1 for a lone tick. */
export function comboCount(tickTimes: number[]): number {
  const sorted = [...tickTimes].sort((a, b) => a - b);
  let count = sorted.length ? 1 : 0;
  for (let index = sorted.length - 1; index > 0; index--) {
    if (sorted[index] - sorted[index - 1] > COMBO_WINDOW_MS) break;
    count += 1;
  }
  return count;
}

interface Doneable {
  done: boolean;
}

/** Everything planned for today is ticked, and there was more than one thing. */
export function isPerfectDay(rows: Doneable[]): boolean {
  return rows.length >= 2 && rows.every((row) => row.done);
}

/** This tick is the one that closed the ring. */
export function closesRing(beforeMinutes: number, afterMinutes: number, goalMinutes: number): boolean {
  return goalMinutes > 0 && beforeMinutes < goalMinutes && afterMinutes >= goalMinutes;
}

/**
 * Open rows keep their order; finished ones gather in a Done group at the
 * bottom. A row ticked a moment ago (`settling`) stays put until its burst
 * has played, then slides down.
 */
export function splitDone<T extends { key: string; done: boolean }>(rows: T[], settling: ReadonlySet<string>) {
  const open: T[] = [];
  const done: T[] = [];
  for (const row of rows) (row.done && !settling.has(row.key) ? done : open).push(row);
  return { open, done };
}

/** The flame grows with the streak: 1 at the start, 1.6 from a month on. */
export function flameScale(streak: number): number {
  return 1 + Math.min(30, Math.max(0, streak)) / 50;
}
