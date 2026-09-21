"use client";

const KEY = "arcadia:time-format";

/**
 * Whether to render clock times in 24-hour form (13:45) rather than 12-hour
 * (1:45pm). Users flip this in Settings — useful for night workers and
 * anyone who reads schedules across midnight.
 *
 * Reads localStorage on every call so formatters stay in sync without a
 * subscription. Server-side (no window) defaults to 12-hour so SSR output
 * matches the majority default; a client re-render fixes it if the user
 * has opted into 24-hour.
 */
export function is24Hour(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(KEY) === "24";
  } catch {
    return false;
  }
}

export function set24Hour(value: boolean): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, value ? "24" : "12");
  } catch {
    /* ignore */
  }
}
