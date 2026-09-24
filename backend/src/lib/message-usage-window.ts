import { iso, localDateKey, nextLocalDay, startOfLocalDay } from "./time.ts";

export const DEFAULT_MESSAGE_USAGE_TIMEZONE = "Australia/Brisbane";

export interface MessageUsageWindow {
  day: string;
  timezone: string;
  resetAt: string;
}

/** The cap follows the student's profile timezone, including daylight saving. */
export function messageUsageWindow(timezone: string | null | undefined, at = Date.now()): MessageUsageWindow {
  const zone = timezone || DEFAULT_MESSAGE_USAGE_TIMEZONE;
  const dayStart = startOfLocalDay(at, zone);
  return {
    day: localDateKey(at, zone),
    timezone: zone,
    resetAt: iso(nextLocalDay(dayStart, zone)),
  };
}
