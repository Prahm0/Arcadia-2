/**
 * Schedule model and sample data used by every Arcadia product demonstration.
 * Times are minutes from midnight so blocks can be positioned and compared.
 */

export type Category =
  | "school"
  | "study"
  | "sport"
  | "sleep"
  | "personal"
  | "exam";

export type Day = "Mon" | "Tue" | "Wed" | "Thu" | "Fri";

export const DAYS: Day[] = ["Mon", "Tue", "Wed", "Thu", "Fri"];

export const DAY_LABELS: Record<Day, { long: string; date: number }> = {
  Mon: { long: "Monday", date: 7 },
  Tue: { long: "Tuesday", date: 8 },
  Wed: { long: "Wednesday", date: 9 },
  Thu: { long: "Thursday", date: 10 },
  Fri: { long: "Friday", date: 11 },
};

export type ChangeKind =
  | "moved"
  | "shifted"
  | "shortened"
  | "deferred"
  | "kept"
  | "new";

export interface ScheduleBlock {
  id: string;
  day: Day;
  /** Minutes from midnight. */
  start: number;
  end: number;
  title: string;
  subject?: string;
  category: Category;
  change?: ChangeKind;
}

export const CHANGE_LABELS: Record<ChangeKind, string> = {
  moved: "Moved",
  shifted: "Shifted",
  shortened: "Shortened",
  deferred: "Moved to Thu",
  kept: "Kept",
  new: "Added",
};

export const h = (hours: number, minutes = 0) => hours * 60 + minutes;

export function formatTime(minutes: number, withSuffix = true): string {
  const hrs = Math.floor(minutes / 60);
  const mins = minutes % 60;
  const suffix = hrs >= 12 ? "pm" : "am";
  const display = hrs % 12 === 0 ? 12 : hrs % 12;
  const m = mins === 0 ? "" : `:${mins.toString().padStart(2, "0")}`;
  return withSuffix ? `${display}${m} ${suffix}` : `${display}${m}`;
}

export function formatRange(start: number, end: number): string {
  const sameSuffix = start >= 720 === end >= 720;
  return `${formatTime(start, !sameSuffix)}–${formatTime(end)}`;
}

export function formatDuration(minutes: number): string {
  const hrs = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hrs === 0) return `${mins} min`;
  if (mins === 0) return `${hrs} hr`;
  return `${hrs} hr ${mins} min`;
}

/** Visible range of the week view. */
export const WEEK_VIEW = { start: h(8), end: h(23, 30) } as const;

/** The student’s week before any change. */
export const initialSchedule: ScheduleBlock[] = [
  // Monday
  { id: "mon-school", day: "Mon", start: h(8, 30), end: h(15), title: "School", category: "school" },
  { id: "mon-methods", day: "Mon", start: h(16), end: h(16, 45), title: "Mathematical Methods", subject: "Complex numbers", category: "study" },
  { id: "mon-bball", day: "Mon", start: h(17, 30), end: h(19), title: "Basketball Training", category: "sport" },
  { id: "mon-english", day: "Mon", start: h(19, 30), end: h(20, 10), title: "English Draft", subject: "Essay outline", category: "study" },
  { id: "mon-sleep", day: "Mon", start: h(22, 30), end: h(23, 30), title: "Sleep", category: "sleep" },

  // Tuesday
  { id: "tue-school", day: "Tue", start: h(8, 30), end: h(15), title: "School", category: "school" },
  { id: "tue-chem", day: "Tue", start: h(16), end: h(16, 35), title: "Chemistry Review", subject: "Equilibrium", category: "study" },
  { id: "tue-methods", day: "Tue", start: h(17), end: h(17, 45), title: "Methods Practice", subject: "Complex numbers", category: "study" },
  { id: "tue-dinner", day: "Tue", start: h(18, 30), end: h(20), title: "Dinner at Nan’s", category: "personal" },
  { id: "tue-sleep", day: "Tue", start: h(22, 30), end: h(23, 30), title: "Sleep", category: "sleep" },

  // Wednesday
  { id: "wed-school", day: "Wed", start: h(8, 30), end: h(15), title: "School", category: "school" },
  { id: "wed-english", day: "Wed", start: h(16, 30), end: h(17, 30), title: "English Essay", subject: "Draft", category: "study" },
  { id: "wed-bball", day: "Wed", start: h(18), end: h(19, 30), title: "Basketball Training", category: "sport" },
  { id: "wed-chem", day: "Wed", start: h(19, 45), end: h(20, 25), title: "Chemistry Homework", subject: "Set 4", category: "study" },
  { id: "wed-methods", day: "Wed", start: h(20, 40), end: h(21, 20), title: "Methods Practice", subject: "Past paper Q1–6", category: "study" },
  { id: "wed-sleep", day: "Wed", start: h(22, 30), end: h(23, 30), title: "Sleep", category: "sleep" },

  // Thursday
  { id: "thu-school", day: "Thu", start: h(8, 30), end: h(15), title: "School", category: "school" },
  { id: "thu-chem", day: "Thu", start: h(16), end: h(16, 45), title: "Chemistry", subject: "Equilibrium", category: "study" },
  { id: "thu-methods", day: "Thu", start: h(17), end: h(17, 40), title: "Methods Revision", subject: "Test prep", category: "study" },
  { id: "thu-sleep", day: "Thu", start: h(22, 30), end: h(23, 30), title: "Sleep", category: "sleep" },

  // Friday
  { id: "fri-school", day: "Fri", start: h(8, 30), end: h(15), title: "School", category: "school" },
  { id: "fri-test", day: "Fri", start: h(9), end: h(10, 20), title: "Methods Test", subject: "Period 1–2", category: "exam" },
  { id: "fri-plans", day: "Fri", start: h(17), end: h(21), title: "Movies with Sam", category: "personal" },
  { id: "fri-sleep", day: "Fri", start: h(22, 30), end: h(23, 30), title: "Sleep", category: "sleep" },
];

/**
 * The same week after "Basketball training moved to 5:30 PM" on Wednesday.
 * Only the blocks that changed are listed; everything else is carried over.
 */
export const scheduleChanges: ScheduleBlock[] = [
  { id: "wed-bball", day: "Wed", start: h(17, 30), end: h(19), title: "Basketball Training", category: "sport", change: "moved" },
  { id: "wed-english", day: "Wed", start: h(19, 15), end: h(20, 15), title: "English Essay", subject: "Draft", category: "study", change: "shifted" },
  { id: "wed-chem", day: "Wed", start: h(20, 30), end: h(21), title: "Chemistry Homework", subject: "Set 4", category: "study", change: "shortened" },
  { id: "wed-methods", day: "Thu", start: h(17, 50), end: h(18, 30), title: "Methods Practice", subject: "Past paper Q1–6", category: "study", change: "deferred" },
];

/** Order in which changes are applied during the demonstration. */
export const changeSequence: string[] = scheduleChanges.map((b) => b.id);

export function applyChanges(
  base: ScheduleBlock[],
  changes: ScheduleBlock[],
  upToIndex: number,
): ScheduleBlock[] {
  const applied = new Map(changes.slice(0, upToIndex).map((b) => [b.id, b]));
  return base.map((b) => applied.get(b.id) ?? b);
}

export const updatedSchedule = applyChanges(
  initialSchedule,
  scheduleChanges,
  scheduleChanges.length,
);

export interface ChangeSummary {
  id: string;
  label: string;
  detail: string;
}

export const changeSummaries: ChangeSummary[] = [
  { id: "wed-bball", label: "Basketball Training", detail: "6:00 → 5:30 pm" },
  { id: "wed-english", label: "English Essay", detail: "Moved after training" },
  { id: "wed-chem", label: "Chemistry Homework", detail: "40 → 30 min" },
  { id: "wed-methods", label: "Methods Practice", detail: "Moved to Thursday" },
];
