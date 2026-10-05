/**
 * Local wall-clock time to UTC, correct across daylight-saving changes.
 * Used by the generator and the baseline methods. The validator has its own
 * copy (validator.ts) so a mistake here can't hide a mistake there.
 */
import { DAY, MINUTE } from "./types.ts";

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(tz: string): Intl.DateTimeFormat {
  let f = formatters.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
    formatters.set(tz, f);
  }
  return f;
}

/** Minutes the zone is ahead of UTC at this instant. */
export function offsetAt(tz: string, at: number): number {
  const parts = formatter(tz).formatToParts(new Date(at));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const wall = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"));
  return Math.round((wall - Math.floor(at / MINUTE) * MINUTE) / MINUTE);
}

/**
 * The instant a local date and clock time happen. A time that doesn't exist
 * (inside the spring-forward gap) moves forward by the size of the gap.
 */
export function localToUtc(date: string, minutes: number, tz: string): number {
  const wall = Date.parse(`${date}T00:00:00Z`) + minutes * MINUTE;
  const first = wall - offsetAt(tz, wall) * MINUTE;
  const second = wall - offsetAt(tz, first) * MINUTE;
  if (offsetAt(tz, second) * MINUTE === wall - second) return second;
  return Math.max(first, second);
}

/** YYYY-MM-DD of the local date at an instant. */
export function localDate(at: number, tz: string): string {
  return new Date(at + offsetAt(tz, at) * MINUTE).toISOString().slice(0, 10);
}

/** Minutes past local midnight at an instant. */
export function localMinutes(at: number, tz: string): number {
  const wall = at + offsetAt(tz, at) * MINUTE;
  return Math.round((wall - Math.floor(wall / DAY) * DAY) / MINUTE);
}

export function addDays(date: string, n: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);
}

/** 0 = Sunday. */
export function weekdayOf(date: string): number {
  return new Date(`${date}T00:00:00Z`).getUTCDay();
}

export function parseClock(value: string): number {
  const [h, m] = value.split(":").map(Number);
  return h * 60 + m;
}

export function clock(minutes: number): string {
  const m = ((minutes % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}
