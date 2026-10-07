import { DAY, MINUTE, zoneOffsetMinutes } from "./time.ts";

/** Local time the daily plan email goes out: 4pm. */
export const SEND_AT_MINUTE = 16 * 60;
/**
 * How long after 4pm a student is still picked up. The cron runs every
 * minute, but a run can be skipped or hit the per-run send cap, so there is
 * slack to catch up. push_deliveries stops anyone getting a second email.
 */
export const SEND_WINDOW_MINUTES = 30;
/** Stop emailing students who haven't opened the app for this long. */
export const INACTIVE_AFTER_MS = 14 * DAY;

/** Minutes since 4pm on the wall clock in `timeZone`, wrapping at midnight. */
export function minutesSinceSendTime(timeZone: string, now: number): number {
  const localMinute = Math.floor((((now / MINUTE + zoneOffsetMinutes(timeZone, now)) % 1440) + 1440) % 1440);
  return (localMinute - SEND_AT_MINUTE + 1440) % 1440;
}

export function inSendWindow(timeZone: string, now: number): boolean {
  return minutesSinceSendTime(timeZone, now) < SEND_WINDOW_MINUTES;
}

/** user_active_days stores UTC days; count the student as active until the end of that day. */
export function activeDayEnd(day: string): number {
  const start = Date.parse(`${day}T00:00:00Z`);
  return Number.isFinite(start) ? start + DAY - 1 : 0;
}

export function lastActiveAt(parts: { activeDay: string | null; lastSignInAt: number | null; createdAt: number }): number {
  return Math.max(parts.activeDay ? activeDayEnd(parts.activeDay) : 0, parts.lastSignInAt ?? 0, parts.createdAt);
}

export type SkipReason = "inactive" | "completed_today" | "no_blocks";

/** The skip rules that depend on the student's own activity (guest, opt-out and dedupe are checked in the query). */
export function skipReason(args: {
  now: number;
  lastActive: number;
  completedToday: boolean;
  plannedBlocks: number;
}): SkipReason | null {
  if (args.now - args.lastActive >= INACTIVE_AFTER_MS) return "inactive";
  if (args.completedToday) return "completed_today";
  if (args.plannedBlocks === 0) return "no_blocks";
  return null;
}

/** "4:30 pm" in the student's timezone. */
export function formatBlockTime(at: number, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat("en-AU", { timeZone, hour: "numeric", minute: "2-digit", hour12: true })
      .format(new Date(at))
      .replace(/\s?([ap])m$/i, (_, letter: string) => ` ${letter.toLowerCase()}m`);
  } catch {
    return new Date(at).toISOString().slice(11, 16);
  }
}
