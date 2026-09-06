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

/**
 * Offset in minutes between a timezone and UTC at a given instant.
 * Uses Intl rather than a tz library, which keeps the Worker small.
 */
export function zoneOffsetMinutes(timeZone: string, at: number): number {
  try {
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hour12: false,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    const parts = formatter.formatToParts(new Date(at));
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
  const local = at + offset * MINUTE;
  const floored = Math.floor(local / DAY) * DAY;
  return floored - offset * MINUTE;
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
