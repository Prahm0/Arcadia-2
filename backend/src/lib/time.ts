export const MINUTE = 60_000;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;

export function iso(ms: number): string {
  return new Date(ms).toISOString();
}

/** Parse "HH:MM" into minutes past midnight. Returns null on bad input. */
export function parseClock(value: string | null | undefined): number | null {
  if (typeof value !== "string") return null;
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

// Building a DateTimeFormat costs far more than using one, and the scheduler
// asks for offsets hundreds of times per plan, so keep one per zone.
const formatters = new Map<string, Intl.DateTimeFormat>();

function zoneFormatter(timeZone: string): Intl.DateTimeFormat {
  let formatter = formatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone,
      // h23, not hour12: false, which some engines render as "24" at midnight.
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    formatters.set(timeZone, formatter);
  }
  return formatter;
}

/**
 * Offset in minutes between a timezone and UTC at a given instant.
 * Uses Intl rather than a tz library, which keeps the Worker small.
 */
export function zoneOffsetMinutes(timeZone: string, at: number): number {
  try {
    const parts = zoneFormatter(timeZone).formatToParts(new Date(at));
    const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? "0");
    const asUtc = Date.UTC(
      get("year"),
      get("month") - 1,
      get("day"),
      get("hour"),
      get("minute"),
      get("second"),
    );
    return Math.round((asUtc - at) / MINUTE);
  } catch {
    return 0;
  }
}

/** Midnight (UTC ms) of the local day containing `at`, in the given zone. */
export function startOfLocalDay(at: number, timeZone: string): number {
  const offset = zoneOffsetMinutes(timeZone, at);
  const floored = Math.floor((at + offset * MINUTE) / DAY) * DAY;
  // On the day the clocks change, midnight had a different offset from
  // `at`; using the later one lands an hour off (11pm the night before).
  const midnightOffset = zoneOffsetMinutes(timeZone, floored - offset * MINUTE);
  return floored - midnightOffset * MINUTE;
}

/**
 * Midnight of the local day after `day`. Stepping by a flat DAY drifts an
 * hour across a daylight-saving change (NSW, VIC, SA, TAS, ACT), so land in
 * the middle of the next day and floor back to its midnight instead.
 */
export function nextLocalDay(day: number, timeZone: string): number {
  return startOfLocalDay(day + DAY + DAY / 2, timeZone);
}

/** Midnight of the Monday that starts the local week containing `at`. */
export function startOfLocalWeek(at: number, timeZone: string): number {
  const day = startOfLocalDay(at, timeZone);
  const sinceMonday = (localWeekday(day, timeZone) + 6) % 7;
  return startOfLocalDay(day - sinceMonday * DAY + DAY / 2, timeZone);
}

export function localWeekday(at: number, timeZone: string): number {
  const offset = zoneOffsetMinutes(timeZone, at);
  return new Date(at + offset * MINUTE).getUTCDay();
}

export function localDateKey(at: number, timeZone: string): string {
  const offset = zoneOffsetMinutes(timeZone, at);
  return new Date(at + offset * MINUTE).toISOString().slice(0, 10);
}

export function localHour(at: number, timeZone: string): number {
  const offset = zoneOffsetMinutes(timeZone, at);
  return new Date(at + offset * MINUTE).getUTCHours();
}
