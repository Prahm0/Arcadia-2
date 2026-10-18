import type { GuardedBlock } from "./autoBlocking.ts";

/**
 * Block times: Opal's schedules. "Night, 9pm to 7am, every day" or "After
 * school, 4 to 6pm, weekdays" block the picked apps on their own, on top of
 * study blocks. They live on this phone, with the apps they block.
 */
export interface BlockTime {
  id: string;
  label: string;
  /** 0 = Sunday ... 6 = Saturday, the day the block starts on. */
  days: number[];
  /** Minutes past midnight. An end at or before the start runs past midnight. */
  start: number;
  end: number;
}

const TIMES_KEY = "arcadia:block-times";
const WAIT_KEY = "arcadia:unlock-wait";
export const BLOCK_TIMES_CHANGED = "arcadia:block-times-changed";
/** Seconds to wait before "5 more minutes" works: the friction that makes it a choice. */
export const UNLOCK_WAITS = [5, 10, 30, 60] as const;
export const DEFAULT_UNLOCK_WAIT = 5;

export function readBlockTimes(): BlockTime[] {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(TIMES_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter(isBlockTime) : [];
  } catch {
    return [];
  }
}

export function saveBlockTimes(times: BlockTime[]): void {
  try {
    window.localStorage.setItem(TIMES_KEY, JSON.stringify(times));
  } catch { /* private mode: they last this visit */ }
  window.dispatchEvent(new Event(BLOCK_TIMES_CHANGED));
}

export function readUnlockWait(): number {
  try {
    const value = Number(window.localStorage.getItem(WAIT_KEY));
    return (UNLOCK_WAITS as readonly number[]).includes(value) ? value : DEFAULT_UNLOCK_WAIT;
  } catch {
    return DEFAULT_UNLOCK_WAIT;
  }
}

export function saveUnlockWait(seconds: number): void {
  try {
    window.localStorage.setItem(WAIT_KEY, String(seconds));
  } catch { /* fine */ }
  window.dispatchEvent(new Event(BLOCK_TIMES_CHANGED));
}

function isBlockTime(value: unknown): value is BlockTime {
  const time = value as BlockTime;
  return Boolean(time) && typeof time.id === "string" && Array.isArray(time.days)
    && Number.isInteger(time.start) && Number.isInteger(time.end) && time.start !== time.end;
}

/**
 * The block times that fall between now and `horizon` ms from now, in the
 * phone's own time, as blocks the phone can take. One that started
 * yesterday evening and runs to the morning is included while it's on.
 */
export function blockTimeBlocks(times: BlockTime[], now: number, horizon: number): GuardedBlock[] {
  const blocks: GuardedBlock[] = [];
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  for (let offset = -1; offset <= Math.ceil(horizon / 86_400_000) + 1; offset += 1) {
    const day = new Date(today);
    day.setDate(day.getDate() + offset);
    for (const time of times) {
      if (!time.days.includes(day.getDay())) continue;
      const start = new Date(day);
      start.setHours(0, time.start, 0, 0);
      const end = new Date(day);
      if (time.end <= time.start) end.setDate(end.getDate() + 1);
      end.setHours(0, time.end, 0, 0);
      if (end.getTime() <= now || start.getTime() >= now + horizon) continue;
      const key = `${day.getFullYear()}${String(day.getMonth() + 1).padStart(2, "0")}${String(day.getDate()).padStart(2, "0")}`;
      blocks.push({ id: `time-${time.id}-${key}`, startsAt: start.getTime(), endsAt: end.getTime(), subject: time.label.trim() || "Focus time" });
    }
  }
  return blocks.sort((a, b) => a.startsAt - b.startsAt);
}

/** "9:00pm to 7:00am" for a block time. */
export function blockTimeRange(time: Pick<BlockTime, "start" | "end">): string {
  const clock = (minutes: number) => {
    const hour = Math.floor(minutes / 60) % 24;
    const minute = minutes % 60;
    return `${hour % 12 || 12}:${String(minute).padStart(2, "0")}${hour < 12 ? "am" : "pm"}`;
  };
  return `${clock(time.start)} to ${clock(time.end)}`;
}

/** "Every day", "Weekdays", "Weekends" or "Mon, Wed, Fri". */
export function blockTimeDays(days: number[]): string {
  const set = [...new Set(days)].sort();
  if (set.length === 7) return "Every day";
  if (set.join() === "1,2,3,4,5") return "Weekdays";
  if (set.join() === "0,6") return "Weekends";
  return set.map((day) => ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][day]).join(", ");
}
