import type { DashboardResponse, PlannerEvent, PlannerTask } from "@/lib/api/types";
import { dateKey } from "@/lib/api/time";
import { categoryBlock, hueBlock, type CategoryBlockStyle } from "@/lib/app/categoryColors";
import { subjectColour } from "@/lib/app/subjectColour";
import { is24Hour } from "@/lib/app/timeFormat";

export const DAY_MS = 86_400_000;
export const HOUR_MS = 3_600_000;
export const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export type ScheduleMode = "term" | "week" | "day";

export interface DayColumn {
  /** YYYY-MM-DD in the student's timezone. */
  key: string;
  weekday: string;
  /** "23 Sep" */
  label: string;
  date: number;
  isToday: boolean;
  /** Midnight to midnight in the student's timezone, as instants. */
  startMs: number;
  endMs: number;
}

/** How far the student's timezone is ahead of UTC at an instant. */
function zoneOffsetMs(timezone: string, at: number): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(at));
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? 0);
  return Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second")) - at;
}

/** The instant a local day begins. Checked twice so DST days land right. */
export function startOfDayMs(key: string, timezone: string): number {
  const [year, month, day] = key.split("-").map(Number);
  const wall = Date.UTC(year, month - 1, day);
  const guess = wall - zoneOffsetMs(timezone, wall);
  return wall - zoneOffsetMs(timezone, guess);
}

export function addDays(key: string, days: number): string {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + days, 12)).toISOString().slice(0, 10);
}

/** 0 for Monday through 6 for Sunday. */
export function weekdayIndex(key: string): number {
  return (new Date(`${key}T12:00:00Z`).getUTCDay() + 6) % 7;
}

export function mondayOf(key: string): string {
  return addDays(key, -weekdayIndex(key));
}

export function todayKey(now: Date, timezone: string): string {
  return dateKey(now.toISOString(), timezone);
}

export function dayColumn(key: string, today: string, timezone: string): DayColumn {
  const noon = new Date(`${key}T12:00:00Z`);
  return {
    key,
    weekday: WEEKDAYS[weekdayIndex(key)],
    label: new Intl.DateTimeFormat("en-AU", { day: "numeric", month: "short", timeZone: "UTC" }).format(noon),
    date: noon.getUTCDate(),
    isToday: key === today,
    startMs: startOfDayMs(key, timezone),
    endMs: startOfDayMs(addDays(key, 1), timezone),
  };
}

/** The day, or the Monday-to-Sunday week, around the anchor date. */
export function visibleDays(mode: "day" | "week", anchor: string, today: string, timezone: string): DayColumn[] {
  if (mode === "day") return [dayColumn(anchor, today, timezone)];
  const monday = mondayOf(anchor);
  return Array.from({ length: 7 }, (_, i) => dayColumn(addDays(monday, i), today, timezone));
}

const MONTH_SHORT = new Intl.DateTimeFormat("en-AU", { month: "short", timeZone: "UTC" });

/** "Wednesday 23 September 2026" */
export function dayTitle(key: string): string {
  return new Intl.DateTimeFormat("en-AU", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })
    .format(new Date(`${key}T12:00:00Z`))
    .replace(",", "");
}

/** "21 – 27 Sep 2026" */
export function weekTitle(days: DayColumn[]): string {
  const at = (key: string) => new Date(`${key}T12:00:00Z`);
  const first = days[0];
  const last = days[days.length - 1];
  const firstMonth = MONTH_SHORT.format(at(first.key));
  const lastMonth = MONTH_SHORT.format(at(last.key));
  const year = last.key.slice(0, 4);
  if (firstMonth === lastMonth) return `${first.date} – ${last.date} ${lastMonth} ${year}`;
  if (first.key.slice(0, 4) !== year) return `${first.date} ${firstMonth} ${first.key.slice(0, 4)} – ${last.date} ${lastMonth} ${year}`;
  return `${first.date} ${firstMonth} – ${last.date} ${lastMonth} ${year}`;
}

/** "Wed 23 Sep" */
export function shortDate(key: string): string {
  return new Intl.DateTimeFormat("en-AU", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" })
    .format(new Date(`${key}T12:00:00Z`))
    .replace(",", "");
}

/** Hours since the local day began, e.g. 13.5 for 1:30pm. */
export function hoursIntoDay(ms: number, day: DayColumn): number {
  return (ms - day.startMs) / HOUR_MS;
}

export function hourLabel(hour: number): string {
  if (is24Hour()) return `${String(hour % 24).padStart(2, "0")}:00`;
  const suffix = hour % 24 >= 12 ? "pm" : "am";
  const display = hour % 12 === 0 ? 12 : hour % 12;
  return `${display} ${suffix}`;
}

/** Parses "07:30" into 7.5. */
export function clockHours(value: string | undefined, fallback: number): number {
  const match = /^(\d{1,2}):(\d{2})/.exec(value ?? "");
  if (!match) return fallback;
  return Number(match[1]) + Number(match[2]) / 60;
}

type Subjects = DashboardResponse["subjects"];

export const CATEGORY_LABEL: Record<PlannerEvent["category"], string> = {
  study: "Study",
  school: "School",
  sport: "Sport",
  extracurricular: "Activity",
  sleep: "Sleep",
  other: "Other",
};

/** Study blocks take their subject's colour; everything else its category's. */
export function blockStyle(event: PlannerEvent, subjects: Subjects): CategoryBlockStyle {
  const hue = event.category === "study" ? subjectColour(subjects, event.subject) : null;
  return hue ? hueBlock(hue) : categoryBlock(event.category);
}

export function isDraggable(event: PlannerEvent): boolean {
  return event.category === "study" && event.editable !== false && event.outcome === "planned" && event.kind !== "all-day";
}

export function isExam(task: PlannerTask): boolean {
  return task.taskType === "exam";
}

/** Tasks grouped by the local day they're due, done ones included. */
export function tasksByDay(tasks: PlannerTask[], timezone: string): Map<string, PlannerTask[]> {
  const byDay = new Map<string, PlannerTask[]>();
  for (const task of tasks) {
    if (task.status === "cancelled") continue;
    const key = dateKey(task.dueAt, timezone);
    const list = byDay.get(key) ?? [];
    list.push(task);
    byDay.set(key, list);
  }
  // Open before done, and exams first: they're the thing a student plans a week around.
  for (const list of byDay.values()) {
    list.sort((a, b) => Number(a.status === "complete") - Number(b.status === "complete") || Number(isExam(b)) - Number(isExam(a)));
  }
  return byDay;
}

/** "Today", "Tomorrow", "in 5 days", "Mon 5 Oct". */
export function dueIn(dueKey: string, today: string): string {
  const days = Math.round((Date.parse(`${dueKey}T12:00:00Z`) - Date.parse(`${today}T12:00:00Z`)) / DAY_MS);
  if (days < 0) return days === -1 ? "Yesterday" : `${-days} days ago`;
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  if (days < 14) return `in ${days} days`;
  return new Intl.DateTimeFormat("en-AU", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" })
    .format(new Date(`${dueKey}T12:00:00Z`))
    .replace(",", "");
}

export interface PlacedBlock {
  event: PlannerEvent;
  /** Hours from the day's midnight, clipped to the day. */
  start: number;
  end: number;
  /** Side-by-side placement when blocks overlap. */
  column: number;
  columns: number;
  /** The block carries on from the day before or into the next. */
  continuesBefore: boolean;
  continuesAfter: boolean;
}

/**
 * Timed blocks for one day, clipped to it, with overlapping blocks placed side
 * by side like Google Calendar does rather than stacked on top of each other.
 * Sleep sits behind everything and takes the full width.
 */
export function placeBlocks(events: PlannerEvent[], day: DayColumn): { sleep: PlacedBlock[]; blocks: PlacedBlock[] } {
  const sleep: PlacedBlock[] = [];
  const timed: PlacedBlock[] = [];
  for (const event of events) {
    if (event.kind === "all-day") continue;
    const startMs = Date.parse(event.startAt);
    const endMs = Date.parse(event.endAt);
    if (endMs <= day.startMs || startMs >= day.endMs) continue;
    const block: PlacedBlock = {
      event,
      start: Math.max(0, hoursIntoDay(startMs, day)),
      end: Math.min(24, hoursIntoDay(endMs, day)),
      column: 0,
      columns: 1,
      continuesBefore: startMs < day.startMs,
      continuesAfter: endMs > day.endMs,
    };
    (event.category === "sleep" ? sleep : timed).push(block);
  }

  timed.sort((a, b) => a.start - b.start || b.end - a.end);
  let cluster: PlacedBlock[] = [];
  let clusterEnd = -1;
  const flush = () => {
    const columnEnds: number[] = [];
    for (const block of cluster) {
      let column = columnEnds.findIndex((end) => end <= block.start + 1e-6);
      if (column === -1) column = columnEnds.length;
      columnEnds[column] = block.end;
      block.column = column;
    }
    for (const block of cluster) block.columns = columnEnds.length;
  };
  for (const block of timed) {
    if (cluster.length && block.start >= clusterEnd - 1e-6) {
      flush();
      cluster = [];
      clusterEnd = -1;
    }
    cluster.push(block);
    clusterEnd = Math.max(clusterEnd, block.end);
  }
  if (cluster.length) flush();
  return { sleep, blocks: timed };
}

/**
 * All-day imported events that touch a day. Calendars store these as UTC
 * dates with an exclusive end, so compare dates rather than instants or a
 * timezone ahead of UTC would spill them onto the next day.
 */
export function allDayEvents(events: PlannerEvent[], day: DayColumn): PlannerEvent[] {
  return events.filter((event) => {
    if (event.kind !== "all-day") return false;
    const first = event.startAt.slice(0, 10);
    const endKey = event.endAt.slice(0, 10);
    const last = endKey > first ? addDays(endKey, -1) : first;
    return day.key >= first && day.key <= last;
  });
}

export function eventMinutes(event: PlannerEvent): number {
  return Math.max(0, (Date.parse(event.endAt) - Date.parse(event.startAt)) / 60_000);
}

export type ItemStatus = "completed" | "pending" | "rescheduled" | "overdue" | "missed";

/**
 * Where a block stands. A study block the student moved is pinned where they
 * put it (see PATCH /api/events/:id), which is how "rescheduled" is known.
 */
export function eventStatus(event: PlannerEvent, nowMs: number): ItemStatus {
  if (event.outcome === "completed") return "completed";
  if (event.outcome === "missed") return "missed";
  if (Date.parse(event.endAt) < nowMs) return "overdue";
  if (event.category === "study" && event.pinned && event.editable !== false && !event.startedAt) return "rescheduled";
  return "pending";
}

export function taskStatus(task: PlannerTask, nowMs: number): ItemStatus {
  if (task.status === "complete") return "completed";
  return Date.parse(task.dueAt) < nowMs ? "overdue" : "pending";
}

export const STATUS_LABEL: Record<ItemStatus, string> = {
  completed: "Done",
  pending: "Pending",
  rescheduled: "Moved",
  overdue: "Overdue",
  missed: "Missed",
};

/** "45m", "1h 30m" */
export function shortMinutes(minutes: number): string {
  const rounded = Math.round(minutes);
  if (rounded < 60) return `${rounded}m`;
  const h = Math.floor(rounded / 60);
  const m = rounded % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

/** Same subject, ignoring case and stray spaces. */
export function sameSubject(a: string | null | undefined, b: string | null | undefined): boolean {
  return (a ?? "").trim().toLowerCase() === (b ?? "").trim().toLowerCase();
}
