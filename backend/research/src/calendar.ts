/** Busy time and free time for the baseline methods and the generator. */
import { addDays, localToUtc, parseClock, weekdayOf } from "./localtime.ts";
import type { Block, CommitmentSpec, Instance } from "./types.ts";
import { MINUTE } from "./types.ts";

export interface Interval {
  start: number;
  end: number;
}

/** Local dates covered by the horizon, plus the day before (for overnight sleep). */
export function horizonDates(instance: Instance): string[] {
  return Array.from({ length: instance.days + 1 }, (_, i) => addDays(instance.startDate, i - 1));
}

export function commitmentIntervals(commitments: CommitmentSpec[], dates: string[], tz: string): Interval[] {
  const out: Interval[] = [];
  for (const c of commitments) {
    const s = parseClock(c.start);
    const e = parseClock(c.end);
    if (e <= s) continue;
    for (const date of dates) {
      const wd = weekdayOf(date);
      if (c.recurrence === "weekdays" && (wd === 0 || wd === 6)) continue;
      if (c.recurrence === "weekly" && wd !== c.weekday) continue;
      if (c.recurrence === "none" && date !== c.date) continue;
      out.push({ start: localToUtc(date, s, tz), end: localToUtc(date, e, tz) });
    }
  }
  return out;
}

/** Each night from bedtime to wake. A bedtime after midnight belongs to that morning. */
export function sleepIntervals(instance: Instance, dates: string[]): Interval[] {
  const bed = parseClock(instance.bedtime);
  const wake = parseClock(instance.wake);
  return dates.map((date) =>
    wake > bed
      ? { start: localToUtc(date, bed, instance.tz), end: localToUtc(date, wake, instance.tz) }
      : { start: localToUtc(date, bed, instance.tz), end: localToUtc(addDays(date, 1), wake, instance.tz) },
  );
}

export function subtract(free: Interval[], busy: Interval): Interval[] {
  const out: Interval[] = [];
  for (const f of free) {
    if (busy.end <= f.start || busy.start >= f.end) {
      out.push(f);
      continue;
    }
    if (busy.start > f.start) out.push({ start: f.start, end: busy.start });
    if (busy.end < f.end) out.push({ start: busy.end, end: f.end });
  }
  return out;
}

export function overlaps(a: Interval, b: Interval): boolean {
  return a.start < b.end && b.start < a.end;
}

export interface Day {
  date: string;
  start: number;
  end: number;
  /** Free time, already clear of commitments, sleep and study (with breaks). */
  free: Interval[];
  /** Study minutes already on this day. */
  used: number;
}

/**
 * Day-by-day free time from `from` to the end of the horizon, with every
 * block in `study` already booked (and a break either side of each).
 */
export function freeDays(
  instance: Instance,
  commitments: CommitmentSpec[],
  study: Block[],
  from: number,
): Day[] {
  const dates = horizonDates(instance);
  const busy = [...commitmentIntervals(commitments, dates, instance.tz), ...sleepIntervals(instance, dates)];
  const pad = instance.breakMinutes * MINUTE;
  const days: Day[] = [];
  for (const date of dates.slice(1)) {
    const start = localToUtc(date, 0, instance.tz);
    const end = localToUtc(addDays(date, 1), 0, instance.tz);
    if (end <= from) continue;
    let free: Interval[] = [{ start: Math.max(start, Math.ceil(from / (5 * MINUTE)) * 5 * MINUTE), end }];
    for (const b of busy) free = subtract(free, b);
    for (const b of study) free = subtract(free, { start: b.start - pad, end: b.end + pad });
    const used = study
      .filter((b) => b.start >= start && b.start < end)
      .reduce((sum, b) => sum + (b.end - b.start) / MINUTE, 0);
    days.push({ date, start, end, free: free.filter((f) => f.end - f.start >= 15 * MINUTE), used });
  }
  return days;
}

/** Books a block into a day's free time, keeping a break either side. */
export function book(day: Day, block: Interval, breakMinutes: number) {
  const pad = breakMinutes * MINUTE;
  let free: Interval[] = day.free;
  free = subtract(free, { start: block.start - pad, end: block.end + pad });
  day.free = free.filter((f) => f.end - f.start >= 15 * MINUTE);
  day.used += (block.end - block.start) / MINUTE;
}
