import { and, desc, eq, gte, inArray, lt, lte } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import type { Database } from "../db";
import { schema } from "../db";
import { newId } from "./ids";
import type { MonthPlan } from "./month-plan";
import {
  DAY,
  HOUR,
  MINUTE,
  localDateKey,
  localWeekday,
  nextLocalDay,
  parseClock,
  startOfLocalDay,
  startOfLocalWeek,
} from "./time";

type Profile = typeof schema.profiles.$inferSelect;
type Subject = typeof schema.subjects.$inferSelect;
type Commitment = typeof schema.commitments.$inferSelect;
type EventSelect = typeof schema.events.$inferSelect;
type EventRow = typeof schema.events.$inferInsert;
type Task = typeof schema.tasks.$inferSelect;
type StudySession = typeof schema.studySessions.$inferSelect;
type DayLayoutRow = typeof schema.dayLayouts.$inferSelect;

const HALF_DAY = DAY / 2;
const MIN_BLOCK = 15 * MINUTE;
// Subject sessions don't get squeezed into the 15-minute crumbs that
// deadline work is allowed to fill.
const MIN_SUBJECT_BLOCK = 25 * MINUTE;

export interface Slot {
  start: number;
  end: number;
}

function overlaps(a: Slot, b: Slot): boolean {
  return a.start < b.end && b.start < a.end;
}

function subtract(free: Slot[], busy: Slot): Slot[] {
  const out: Slot[] = [];
  for (const slot of free) {
    if (!overlaps(slot, busy)) {
      out.push(slot);
      continue;
    }
    if (busy.start > slot.start) out.push({ start: slot.start, end: busy.start });
    if (busy.end < slot.end) out.push({ start: busy.end, end: slot.end });
  }
  return out;
}

/**
 * Concrete occurrences of a commitment inside [from, to). A commitment the
 * student entered (school included) always blocks its hours. We used to skip
 * school in the holidays from a hardcoded term calendar, but that silently
 * overrode an explicit commitment and scheduled study straight through the
 * student's school hours, which they never expect. Holiday awareness, if we
 * want it, belongs in an explicit "I'm on break" control, not an auto guess.
 */
function commitmentSlots(
  commitment: Commitment,
  from: number,
  to: number,
  tz: string,
): Slot[] {
  const startMinutes = parseClock(commitment.startTime);
  const endMinutes = parseClock(commitment.endTime);
  if (startMinutes === null || endMinutes === null || endMinutes <= startMinutes) return [];

  const slots: Slot[] = [];
  for (let day = startOfLocalDay(from, tz); day < to; day = nextLocalDay(day, tz)) {
    if (commitment.recurrence === "weekly") {
      if (commitment.weekday === null || localWeekday(day, tz) !== commitment.weekday) continue;
    } else if (commitment.recurrence === "weekdays") {
      const weekday = localWeekday(day, tz);
      if (weekday === 0 || weekday === 6) continue;
    } else if (commitment.recurrence === "none") {
      if (!commitment.startDate) continue;
      const target = Date.parse(`${commitment.startDate}T00:00:00Z`);
      if (Math.abs(startOfLocalDay(target, tz) - day) > HALF_DAY) continue;
    }
    // "daily" falls through and matches every day
    slots.push({
      start: day + startMinutes * MINUTE,
      end: day + endMinutes * MINUTE,
    });
  }
  return slots;
}

/** Nightly sleep blocks across the range. */
function sleepSlots(profile: Profile, from: number, to: number): Slot[] {
  const bedtime = parseClock(profile.bedtime) ?? 22 * 60 + 30;
  const wake = parseClock(profile.wakeTime) ?? 7 * 60;
  const tz = profile.timezone;
  const slots: Slot[] = [];
  // Start the night before `from` so the early hours of day one are covered.
  const firstNight = startOfLocalDay(startOfLocalDay(from, tz) - HALF_DAY, tz);
  for (let day = firstNight; day < to; day = nextLocalDay(day, tz)) {
    const start = day + bedtime * MINUTE;
    // bedtime after midnight (e.g. 00:30) belongs to the same night
    const end = day + (wake > bedtime ? wake : wake + 24 * 60) * MINUTE;
    slots.push({ start, end });
  }
  return slots;
}

/**
 * Weekly study time a subject gets when the student hasn't set one.
 * Keep in step with suggestedWeeklyMinutes in lib/app/studyTargets.ts.
 */
export function defaultWeeklyMinutes(grade: string | null | undefined): number {
  const text = (grade ?? "").trim().toLowerCase();
  const year = /^year\s*(\d{1,2})$/.exec(text);
  if (year) return Number(year[1]) >= 11 ? 180 : 120;
  if (text.includes("uni") || text.includes("year+")) return 240;
  return 150;
}

export function weeklyTargetMinutes(subject: Subject, grade: string | null | undefined): number {
  return subject.weeklyMinutes ?? defaultWeeklyMinutes(grade);
}

export interface WeeklyBudget {
  targetMinutes: number;
  capacityMinutes: number;
}

/** What the subjects ask for in a week, against what the daily cap allows. */
export function weeklyBudget(profile: Profile, subjects: Subject[]): WeeklyBudget {
  return {
    targetMinutes: uniqueSubjects(subjects).reduce(
      (sum, subject) => sum + weeklyTargetMinutes(subject, profile.grade),
      0,
    ),
    capacityMinutes: Math.max(0, profile.maxDailyStudyMinutes) * 7,
  };
}

export function subjectKey(name: string | null | undefined): string {
  return (name ?? "").trim().toLowerCase();
}

/** Same-named subjects (e.g. onboarding run twice) plan as one. */
export function uniqueSubjects(subjects: Subject[]): Subject[] {
  const seen = new Set<string>();
  return subjects.filter((subject) => {
    const key = subjectKey(subject.name);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export interface PlanDay {
  start: number;
  /** YYYY-MM-DD in the student's timezone. */
  date: string;
  weekStart: number;
  /** 0 = Monday. */
  sinceMonday: number;
  free: Slot[];
  /** Study time already on this day, counted against the cap. */
  used: number;
  /** Most study the day takes: the daily limit, or Arcad's total for the day. */
  cap: number;
}

/**
 * Picks where the next block goes. Afternoons and evenings first (after
 * school, weekend afternoons), earliest first; mornings only once those are
 * full, and then as close to midday as possible, so nobody is handed a
 * 6:30am session while the evening sits empty. `before` keeps deadline work
 * ahead of its due time. Returns the block's position, or null.
 */
function pickSpot(day: PlanDay, length: number, before = Infinity): Slot | null {
  const midday = day.start + 12 * HOUR;
  const room = (slot: Slot) => slot.end - slot.start >= length && slot.start < before;

  const later = day.free
    .map((slot) => ({ start: Math.max(slot.start, midday), end: slot.end }))
    .find(room);
  if (later) return { start: later.start, end: later.start + length };

  const mornings = day.free
    .map((slot) => ({ start: slot.start, end: Math.min(slot.end, midday) }))
    .filter(room);
  const latest = mornings[mornings.length - 1];
  if (latest) return { start: latest.end - length, end: latest.end };

  // A gap that only fits by straddling midday.
  const any = day.free.find(room);
  return any ? { start: any.start, end: any.start + length } : null;
}

/** Books a block into the day: out of its free time, with a break either side. */
function take(day: PlanDay, block: Slot, breakLength: number) {
  let free: Slot[] = [];
  for (const slot of day.free) {
    free.push(...subtract([slot], { start: block.start - breakLength, end: block.end + breakLength }));
  }
  free = free.filter((slot) => slot.end - slot.start >= MIN_BLOCK);
  day.free = free.sort((a, b) => a.start - b.start);
  day.used += block.end - block.start;
}

/**
 * Takes up to `want` (never less than `atLeast`) out of the day's free time,
 * with a break either side, counted against the day's cap. Null if nothing
 * fits or the cap is spent.
 */
function carve(
  day: PlanDay,
  want: number,
  atLeast: number,
  breakLength: number,
  before = Infinity,
  cap = day.cap,
): Slot | null {
  const budget = Math.min(want, cap - day.used);
  if (budget < atLeast) return null;

  // Longest block that fits, down to atLeast, in the preferred spot.
  const longest = day.free
    .filter((slot) => slot.start < before)
    .reduce((max, slot) => Math.max(max, slot.end - slot.start), 0);
  const length = Math.min(budget, longest);
  if (length < atLeast) return null;
  const block = pickSpot(day, length, before);
  if (!block) return null;
  take(day, block, breakLength);
  return block;
}

/** How far a block Arcad placed may slide later to clear a break. */
const NUDGE = 20 * MINUTE;

/**
 * Books a block where Arcad put it, or up to NUDGE later if a break or a
 * clash is in the way. Null, with the reason, when it can't go there.
 */
function placeAt(
  day: PlanDay,
  start: number,
  length: number,
  breakLength: number,
  before = Infinity,
): Slot | string {
  if (day.used + length > day.cap) return "goes over their daily study limit";
  const slot = day.free.find(
    (free) => free.start <= start + NUDGE && free.end - Math.max(free.start, start) >= length,
  );
  if (!slot) return "isn't inside their free time, or leaves no break next to another block";
  const at = Math.max(slot.start, start);
  if (at + length > before) return "finishes after the task is due";
  const block = { start: at, end: at + length };
  take(day, block, breakLength);
  return block;
}

/**
 * Splits `total` into equal sessions near the preferred length, rounded to
 * five minutes: 2h at 50-minute sessions is 2 × 60, not 50 + 50 + 20.
 */
function evenSession(total: number, sessionLength: number, floor: number): number {
  const sessions = Math.max(1, Math.round(total / sessionLength));
  return Math.max(floor, Math.round(total / sessions / (5 * MINUTE)) * 5 * MINUTE);
}

/**
 * The newest month plan as minutes per subject per week, keyed by the
 * week's Monday (YYYY-MM-DD) then subjectKey, plus the weekly targets it was
 * made against. Null when there's no plan or it can't be read.
 */
function readMonthPlan(raw: string | undefined) {
  if (!raw) return null;
  try {
    const plan = JSON.parse(raw) as MonthPlan;
    const weeks = new Map<string, Map<string, number>>();
    const focus = new Map<string, string>();
    for (const week of plan.weeks ?? []) {
      weeks.set(
        week.weekOf,
        new Map((week.subjects ?? []).map((entry) => [subjectKey(entry.name), Number(entry.minutes) || 0])),
      );
      if (week.focus) focus.set(week.weekOf, week.focus);
    }
    return { weeks, focus, base: plan.base ?? {}, createdAt: plan.createdAt ?? "" };
  } catch {
    return null;
  }
}

/** Two rows describe the same block, so an unchanged block keeps its id. */
function signature(row: EventRow | EventSelect): string {
  return [
    row.source,
    row.startAt,
    row.endAt,
    row.title,
    row.subject ?? "",
    row.taskId ?? "",
    row.commitmentId ?? "",
    row.category,
    row.kind ?? "",
  ].join("|");
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** How many days Arcad lays out block by block, from today. */
export const LAYOUT_DAYS = 7;

/** One block in Arcad's layout. Exactly one of taskId and subject is set. */
export interface LayoutBlock {
  /** YYYY-MM-DD */
  date: string;
  /** HH:MM, local time. */
  start: string;
  minutes: number;
  taskId: string | null;
  subject: string | null;
}

/** Arcad's day-by-day layout, stored as JSON in day_layouts.layout. */
export interface DayLayout {
  /** The dates it covers, YYYY-MM-DD. */
  dates: string[];
  blocks: LayoutBlock[];
  /** A line or two on how the week is set up. */
  summary: string;
  /** Unbooked work or short subjects the check found. Zero means complete. */
  gaps?: number;
  model: string;
  createdAt: string;
  /** Layouts made on the paid tier's stronger model on `day`, the student's local date. */
  premium?: { day: string; count: number };
  /** What it was planned from, less work logged since (see day-plan.ts layoutBasis). */
  basis?: string;
}

export function readLayout(raw: string | null | undefined): DayLayout | null {
  if (!raw) return null;
  try {
    const layout = JSON.parse(raw) as DayLayout;
    return Array.isArray(layout.blocks) && Array.isArray(layout.dates) ? layout : null;
  } catch {
    return null;
  }
}

export interface ScheduleInputs {
  profile: Profile;
  /** Events already in the window being rebuilt. */
  existing: EventSelect[];
  commitments: Commitment[];
  tasks: Task[];
  subjects: Subject[];
  /** Completed study earlier this week, before the window. */
  earlierThisWeek: EventSelect[];
  sessions: StudySession[];
  monthPlanRaw: string | undefined;
  layoutRow: DayLayoutRow | undefined;
}

export async function loadScheduleInputs(
  database: Database,
  userId: string,
  from: number,
  to: number,
): Promise<ScheduleInputs | null> {
  const [profile] = await database
    .select()
    .from(schema.profiles)
    .where(eq(schema.profiles.userId, userId))
    .limit(1);
  if (!profile) return null;

  const weekStart = startOfLocalWeek(Math.max(from, Date.now()), profile.timezone);
  const [existing, commitments, tasks, subjects, earlierThisWeek, sessions, [planRow], [layoutRow]] =
    await Promise.all([
      database
        .select()
        .from(schema.events)
        .where(
          and(
            eq(schema.events.userId, userId),
            gte(schema.events.startAt, from),
            lte(schema.events.startAt, to),
          ),
        ),
      database.select().from(schema.commitments).where(eq(schema.commitments.userId, userId)),
      database
        .select()
        .from(schema.tasks)
        .where(and(eq(schema.tasks.userId, userId), eq(schema.tasks.status, "pending"))),
      database.select().from(schema.subjects).where(eq(schema.subjects.userId, userId)),
      // Study already done earlier this week counts toward this week's targets.
      weekStart < from
        ? database
            .select()
            .from(schema.events)
            .where(
              and(
                eq(schema.events.userId, userId),
                gte(schema.events.startAt, weekStart),
                lt(schema.events.startAt, from),
                eq(schema.events.category, "study"),
                eq(schema.events.outcome, "completed"),
              ),
            )
        : Promise.resolve([] as EventSelect[]),
      database
        .select()
        .from(schema.studySessions)
        .where(
          and(
            eq(schema.studySessions.userId, userId),
            gte(schema.studySessions.endedAt, weekStart),
          ),
        ),
      database
        .select({ plan: schema.monthPlans.plan })
        .from(schema.monthPlans)
        .where(eq(schema.monthPlans.userId, userId))
        .orderBy(desc(schema.monthPlans.createdAt))
        .limit(1),
      database.select().from(schema.dayLayouts).where(eq(schema.dayLayouts.userId, userId)).limit(1),
    ]);

  return {
    profile,
    existing,
    commitments,
    tasks,
    subjects,
    earlierThisWeek,
    sessions,
    monthPlanRaw: planRow?.plan,
    layoutRow,
  };
}

/** Everything fixed before any study is placed. */
export interface Groundwork {
  now: number;
  /** Events the rebuild leaves alone. */
  keep: EventSelect[];
  /** Events the rebuild may replace. */
  disposable: EventSelect[];
  /** Commitments and sleep, re-materialised as events. */
  fixed: EventRow[];
  days: PlanDay[];
  sessionLength: number;
  breakLength: number;
  dailyCap: number;
}

// Every source we re-materialise has to be listed here, or the old rows
// survive and pile up on top of the fresh ones (e.g. "sleep sleep sleep
// sleep sleep" showing on Today after a few dashboard loads).
const REMATERIALISED = new Set(["auto", "sleep", "commitment"]);

export function groundwork(
  userId: string,
  inputs: ScheduleInputs,
  from: number,
  to: number,
  now = Date.now(),
): Groundwork {
  const { profile } = inputs;
  const tz = profile.timezone;

  // The block you're in the middle of stays put rather than sliding forward.
  const underway = (event: EventSelect) =>
    event.source === "auto" && event.startAt <= now && event.endAt > now;
  const keep = inputs.existing.filter(
    (event) =>
      (event.source !== "sleep" ||
        (event.pinned && event.outcome === "planned")) &&
      (event.pinned ||
        event.outcome !== "planned" ||
        !REMATERIALISED.has(event.source) ||
        underway(event)),
  );
  const disposable = inputs.existing.filter((event) => !keep.includes(event));

  // Commitments and sleep become real events and also block study time.
  const fixed: EventRow[] = [];
  const busy: Slot[] = [];

  for (const commitment of inputs.commitments) {
    for (const slot of commitmentSlots(commitment, from, to, tz)) {
      busy.push(slot);
      fixed.push({
        id: newId("evt"),
        userId,
        commitmentId: commitment.id,
        title: commitment.title,
        category: commitment.category === "school" ? "school" : commitment.category,
        kind: "commitment",
        startAt: slot.start,
        endAt: slot.end,
        status: "planned",
        outcome: "planned",
        source: "commitment",
        editable: false,
        pinned: false,
      });
    }
  }

  for (const slot of sleepSlots(profile, from, to)) {
    const id = `evt_sleep_${userId}_${localDateKey(slot.start, tz)}`;
    const delayed = inputs.existing.find((event) =>
      event.id === id && event.source === "sleep" && event.pinned &&
      event.outcome === "planned",
    );
    if (delayed) continue; // The pinned override is already included below via `keep`.

    busy.push(slot);
    // The night before the window still blocks early study time, but its
    // event starts outside the rows loaded for reconciliation.
    if (slot.start < from || slot.start >= to) continue;
    fixed.push({
      // One id per user and local night also prevents overlapping rebuilds
      // from inserting the same sleep block with different random ids.
      id,
      userId,
      title: "Sleep",
      category: "sleep",
      kind: "sleep",
      startAt: slot.start,
      endAt: slot.end,
      status: "planned",
      outcome: "planned",
      source: "sleep",
      editable: false,
      pinned: false,
    });
  }

  for (const event of keep) busy.push({ start: event.startAt, end: event.endAt });

  // Whatever is left is study time, day by day. Nothing starts at an odd
  // minute like 2:28pm: today's free time begins on the next five minutes.
  const dailyCap = Math.max(0, profile.maxDailyStudyMinutes) * MINUTE;
  const startFrom = Math.ceil(now / (5 * MINUTE)) * 5 * MINUTE;
  const days: PlanDay[] = [];
  for (let day = startOfLocalDay(Math.max(from, now), tz); day < to; day = nextLocalDay(day, tz)) {
    const end = nextLocalDay(day, tz);
    let free: Slot[] = [{ start: Math.max(day, startFrom), end }];
    for (const block of busy) free = subtract(free, block);
    days.push({
      start: day,
      date: localDateKey(day, tz),
      weekStart: startOfLocalWeek(day, tz),
      sinceMonday: (localWeekday(day, tz) + 6) % 7,
      free: free
        .filter((slot) => slot.end - slot.start >= MIN_BLOCK)
        .sort((a, b) => a.start - b.start),
      used: keep
        .filter(
          (event) =>
            event.category === "study" &&
            event.outcome !== "missed" &&
            event.startAt >= day &&
            event.startAt < end,
        )
        .reduce((sum, event) => sum + (event.endAt - event.startAt), 0),
      cap: dailyCap,
    });
  }

  return {
    now,
    keep,
    disposable,
    fixed,
    days,
    sessionLength: Math.max(15, profile.preferredSessionMinutes) * MINUTE,
    breakLength: Math.max(0, profile.breakMinutes) * MINUTE,
    dailyCap,
  };
}

export interface QueueEntry {
  task: Task;
  remaining: number;
  unit: number;
}

/** Pending deadline work with time left, most urgent first, then highest priority. */
export function taskQueue(tasks: Task[], sessionLength: number): QueueEntry[] {
  return tasks
    .map((task) => {
      const remaining = Math.max(0, task.estimatedMinutes - task.completedMinutes) * MINUTE;
      return { task, remaining, unit: evenSession(remaining, sessionLength, MIN_BLOCK) };
    })
    .filter((entry) => entry.remaining > 0)
    .sort((a, b) => a.task.dueAt - b.task.dueAt || b.task.priority - a.task.priority);
}

/** A study block the rebuild wants on the calendar. */
export interface Placement {
  block: Slot;
  title: string;
  subject: string | null;
  taskId: string | null;
  kind: string;
}

export interface LayoutResult {
  placed: Placement[];
  /** Blocks that couldn't go where Arcad put them, and why. */
  problems: string[];
}

/**
 * Books Arcad's blocks where it put them, in the days it covers. Blocks
 * already in the past are skipped quietly; anything else that doesn't fit
 * (a new clash, a task that's since been done) is left out and reported, and
 * the rules below fill the gap. Deadline work comes off `queue` as it's placed.
 */
export function applyLayout(
  g: Groundwork,
  layout: DayLayout,
  queue: QueueEntry[],
  subjects: Subject[],
): LayoutResult {
  const placed: Placement[] = [];
  const problems: string[] = [];
  const byKey = new Map(uniqueSubjects(subjects).map((subject) => [subjectKey(subject.name), subject]));
  const blocks = [...layout.blocks].sort(
    (a, b) => a.date.localeCompare(b.date) || a.start.localeCompare(b.start),
  );

  for (const item of blocks) {
    const label = `${item.date} ${item.start}`;
    const day = g.days.find((candidate) => candidate.date === item.date);
    const clock = parseClock(item.start);
    if (!day || clock === null) {
      if (item.date >= (g.days[0]?.date ?? "")) problems.push(`${label}: not a day or time in the plan`);
      continue;
    }
    const start = day.start + clock * MINUTE;
    if (start < g.now) continue;

    let length = Math.round(Number(item.minutes) / 5) * 5 * MINUTE;
    if (!(length >= MIN_SUBJECT_BLOCK && length <= 2 * HOUR)) {
      problems.push(`${label}: blocks must be 25 to 120 minutes`);
      continue;
    }

    if (item.taskId) {
      const entry = queue.find((candidate) => candidate.task.id === item.taskId);
      if (!entry || entry.remaining <= 0) {
        problems.push(`${label}: that deadline work is already fully booked, or isn't on their list`);
        continue;
      }
      // The last bit of a task only needs as long as what's left.
      if (entry.remaining < length) length = Math.max(MIN_BLOCK, entry.remaining);
      const spot = placeAt(day, start, length, g.breakLength, entry.task.dueAt);
      if (typeof spot === "string") {
        problems.push(`${label} (${entry.task.title}): ${spot}`);
        continue;
      }
      entry.remaining -= spot.end - spot.start;
      placed.push({
        block: spot,
        title: entry.task.title,
        subject: entry.task.subject,
        taskId: entry.task.id,
        kind: entry.task.taskType,
      });
    } else {
      const subject = byKey.get(subjectKey(item.subject));
      if (!subject) {
        problems.push(`${label}: "${item.subject}" isn't one of their subjects`);
        continue;
      }
      const spot = placeAt(day, start, length, g.breakLength);
      if (typeof spot === "string") {
        problems.push(`${label} (${subject.name}): ${spot}`);
        continue;
      }
      placed.push({
        block: spot,
        title: `${subject.name} study`,
        subject: subject.name,
        taskId: null,
        kind: "subject",
      });
    }
  }
  return { placed, problems };
}

/** A short, stable fingerprint of a string (two FNV-1a passes). */
function fingerprint(text: string): string {
  let a = 0x811c9dc5;
  let b = 0x01000193 ^ text.length;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    a = Math.imul(a ^ code, 0x01000193) >>> 0;
    b = Math.imul(b ^ code, 0x5bd1e995) >>> 0;
  }
  return a.toString(16).padStart(8, "0") + b.toString(16).padStart(8, "0");
}

/**
 * What Arcad's layout depends on. When this changes (a new deadline, an edit
 * to their week, a new day) the layout is out of date. Study blocks being
 * ticked off don't change it; the work left on a task does.
 */
export function layoutKey(inputs: ScheduleInputs, g: Groundwork): string {
  const { profile } = inputs;
  const tz = profile.timezone;
  const today = startOfLocalDay(g.now, tz);
  const horizon = today + LAYOUT_DAYS * DAY;
  return fingerprint(
    JSON.stringify([
      localDateKey(g.now, tz),
      tz,
      profile.wakeTime,
      profile.bedtime,
      profile.maxDailyStudyMinutes,
      profile.preferredSessionMinutes,
      profile.breakMinutes,
      profile.state,
      inputs.tasks
        .map((task) => [task.id, task.title, task.subject, task.dueAt, task.estimatedMinutes - task.completedMinutes, task.priority])
        .sort(),
      inputs.commitments
        .map((row) => [row.id, row.startTime, row.endTime, row.recurrence, row.weekday, row.startDate, row.category])
        .sort(),
      uniqueSubjects(inputs.subjects)
        .map((subject) => [subjectKey(subject.name), subject.weeklyMinutes, subject.priority])
        .sort(),
      g.keep
        .filter((event) => (event.pinned || event.source !== "auto") && event.startAt < horizon)
        .map((event) => [event.startAt, event.endAt])
        .sort(),
      fingerprint(inputs.monthPlanRaw ?? ""),
    ]),
  );
}

/** Minutes of study each subject has had (or has booked) in one week, by subjectKey. */
export class StudyCredit {
  private entries = new Map<string, { done: number; focused: number; planned: number }>();

  constructor(private readonly tz: string) {}

  private entry(at: number, subject: string | null | undefined) {
    const key = `${startOfLocalWeek(at, this.tz)}|${subjectKey(subject)}`;
    let entry = this.entries.get(key);
    if (!entry) {
      entry = { done: 0, focused: 0, planned: 0 };
      this.entries.set(key, entry);
    }
    return entry;
  }

  /** Completed and still-planned study events. */
  addEvent(event: Pick<EventRow, "category" | "subject" | "outcome" | "startAt" | "endAt">) {
    if (event.category !== "study" || !event.subject) return;
    if (event.outcome === "completed") this.entry(event.startAt, event.subject).done += event.endAt - event.startAt;
    else if (event.outcome === "planned") this.entry(event.startAt, event.subject).planned += event.endAt - event.startAt;
  }

  addSession(session: StudySession) {
    if (session.type !== "focus" || !session.subject) return;
    this.entry(session.endedAt, session.subject).focused += session.seconds * 1000;
  }

  /**
   * Study done (the larger of completed blocks and logged focus time, since
   * a focused block records both) plus study still planned.
   */
  covered(week: number, subject: string): number {
    const entry = this.entries.get(`${week}|${subjectKey(subject)}`);
    return entry ? Math.max(entry.done, entry.focused) + entry.planned : 0;
  }
}

/** Study so far this week plus the blocks nobody's allowed to move. */
export function baseCredit(inputs: ScheduleInputs, g: Groundwork): StudyCredit {
  const credit = new StudyCredit(inputs.profile.timezone);
  for (const event of [...inputs.earlierThisWeek, ...g.keep]) credit.addEvent(event);
  for (const session of inputs.sessions) credit.addSession(session);
  return credit;
}

/**
 * Each subject's minutes for one week (the Monday's timestamp). The month
 * plan moves time between weeks (more before a deadline, less after). It's
 * stored against the targets at the time, so a target changed since scales
 * the plan with it. Targets that add up to more than the daily limit allows
 * all shrink by the same share, rather than the last subjects missing out.
 */
export function weekTargets(inputs: ScheduleInputs, week: number): Map<Subject, number> {
  const { profile } = inputs;
  const monthPlan = readMonthPlan(inputs.monthPlanRaw);
  const subjects = uniqueSubjects(inputs.subjects);
  const raw = subjects.map((subject) => {
    const target = weeklyTargetMinutes(subject, profile.grade);
    const key = subjectKey(subject.name);
    const planned = monthPlan?.weeks.get(localDateKey(week, profile.timezone))?.get(key);
    const base = monthPlan?.base[key];
    return planned === undefined || !base ? target : (target * planned) / base;
  });
  const capacity = Math.max(0, profile.maxDailyStudyMinutes) * 7;
  const wanted = raw.reduce((sum, minutes) => sum + minutes, 0);
  const scale = wanted > capacity && wanted > 0 ? capacity / wanted : 1;
  return new Map(
    subjects.map((subject, index) => [subject, Math.round((raw[index] * scale) / 5) * 5 * MINUTE]),
  );
}

/** The month plan's line for a week, if it has one. */
export function weekFocus(inputs: ScheduleInputs, week: number): string {
  return readMonthPlan(inputs.monthPlanRaw)?.focus.get(localDateKey(week, inputs.profile.timezone)) ?? "";
}

export interface RebuildResult {
  created: number;
  removed: number;
}

/**
 * Rebuilds auto-generated study blocks for [from, to).
 *
 * Anything the user touched is left alone: pinned events, events with an
 * outcome, events whose source is not "auto", and the block that is under
 * way right now. Commitments and sleep are re-materialised each run so edits
 * to them take effect immediately.
 *
 * Study time comes from three places, in this order:
 *   1. Arcad's layout: for the next week, the blocks Arcad chose, placed
 *      where it put them (see day-plan.ts).
 *   2. Deadline work: whatever's left of pending tasks, most urgent first.
 *   3. Subject time: each subject is topped up toward its weekly target,
 *      paced across the week so sessions spread out instead of bunching.
 * On days Arcad's up-to-date layout covers, 2 and 3 only make up for blocks
 * that no longer fit; they don't add study on top of what Arcad chose.
 *
 * When the layout is out of date the row is flagged and the cron asks Arcad
 * for a new one; until then the old one is used as far as it still fits.
 *
 * Rows are diffed against what's already there, so reloading an unchanged
 * plan writes nothing and every surviving block keeps its id.
 */
export async function rebuildSchedule(
  database: Database,
  userId: string,
  from: number,
  to: number,
): Promise<RebuildResult> {
  const inputs = await loadScheduleInputs(database, userId, from, to);
  if (!inputs) return { created: 0, removed: 0 };

  const { profile } = inputs;
  const tz = profile.timezone;
  const g = groundwork(userId, inputs, from, to);
  const { days, breakLength, sessionLength } = g;
  const planned: EventRow[] = [...g.fixed];

  const studyBlock = (placement: Placement): EventRow => ({
    id: newId("evt"),
    userId,
    taskId: placement.taskId,
    title: placement.title,
    subject: placement.subject,
    category: "study",
    kind: placement.kind,
    startAt: placement.block.start,
    endAt: placement.block.end,
    status: "planned",
    outcome: "planned",
    source: "auto",
    editable: true,
    pinned: false,
  });

  const queue = taskQueue(inputs.tasks, sessionLength);

  // 1. Arcad's layout.
  const key = layoutKey(inputs, g);
  const layout = readLayout(inputs.layoutRow?.layout);
  // Made from today's inputs (even if Arcad had nothing to lay out).
  const current = inputs.layoutRow?.inputsKey === key;
  // A layout that left work or subject time unbooked doesn't get to hold
  // the rules back from filling the rest.
  const fresh = Boolean(layout) && current && !layout?.gaps;
  if (layout) {
    const alreadyUsed = new Map(days.map((day) => [day, day.used]));
    planned.push(...applyLayout(g, layout, queue, inputs.subjects).placed.map(studyBlock));
    if (fresh) {
      // Arcad's total for the day is the day's total. Blocks that no longer
      // fit get replaced below, but nothing gets piled on top.
      for (const day of days) {
        if (!layout.dates.includes(day.date)) continue;
        const booked = layout.blocks
          .filter((block) => block.date === day.date)
          .reduce((sum, block) => {
            const clock = parseClock(block.start);
            return clock !== null && day.start + clock * MINUTE >= g.now
              ? sum + Math.round(Number(block.minutes) / 5) * 5 * MINUTE
              : sum;
          }, 0);
        day.cap = Math.min(g.dailyCap, Math.max(day.used, (alreadyUsed.get(day) ?? 0) + booked));
      }
    }
  }

  // 2. Deadline work. Most urgent first, but spread out: the same task gets
  // two sessions a day at most, unless it needs more to finish on time, and
  // back-to-back sessions of one task only when nothing else is waiting.
  for (const day of days) {
    const sessionsToday = new Map<string, number>();
    for (const row of planned) {
      if (row.taskId && row.startAt >= day.start && row.startAt < day.start + DAY) {
        sessionsToday.set(row.taskId, (sessionsToday.get(row.taskId) ?? 0) + 1);
      }
    }
    let last: string | null = null;
    const allowed = (entry: QueueEntry) => {
      const daysLeft = Math.max(1, Math.ceil((entry.task.dueAt - day.start) / DAY));
      const needed = Math.ceil(entry.remaining / entry.unit / daysLeft);
      return (sessionsToday.get(entry.task.id) ?? 0) < Math.max(2, needed);
    };
    for (;;) {
      const earliest = day.free[0]?.start;
      if (earliest === undefined) break;
      const candidates = queue.filter(
        (item) => item.remaining > 0 && item.task.dueAt > earliest && allowed(item),
      );
      const entry = candidates.find((item) => item.task.id !== last) ?? candidates[0];
      if (!entry) break;

      const want =
        entry.remaining - entry.unit < MIN_BLOCK
          ? Math.max(MIN_BLOCK, entry.remaining)
          : entry.unit;
      // Deadline work left over after Arcad's layout still gets booked, up
      // to the daily limit: a missed booking costs more than a busy day.
      const block = carve(day, want, MIN_BLOCK, breakLength, entry.task.dueAt, g.dailyCap);
      if (!block) break;

      planned.push(
        studyBlock({
          block,
          title: entry.task.title,
          subject: entry.task.subject,
          taskId: entry.task.id,
          kind: entry.task.taskType,
        }),
      );
      entry.remaining -= block.end - block.start;
      sessionsToday.set(entry.task.id, (sessionsToday.get(entry.task.id) ?? 0) + 1);
      last = entry.task.id;
    }
  }

  // 3. Subject time. Work out how much of each weekly target is already
  // covered: study done plus study still planned, deadline work included.
  const credit = baseCredit(inputs, g);
  for (const row of planned) credit.addEvent(row);

  const weeks = new Map<number, PlanDay[]>();
  for (const day of days) weeks.set(day.weekStart, [...(weeks.get(day.weekStart) ?? []), day]);

  for (const [start, weekDays] of weeks) {
    const first = weekDays[0].sinceMonday;
    // Pace over the rest of the week, even the part beyond this window, so
    // next week's first days only get their share rather than all of it.
    const span = 7 - first;

    const needs = [...weekTargets(inputs, start)]
      .map(([subject, target]) => {
        const need = Math.max(0, target - credit.covered(start, subject.name));
        return {
          subject,
          need,
          unit: evenSession(need, sessionLength, MIN_SUBJECT_BLOCK),
          remaining: need,
        };
      })
      .filter((entry) => entry.need >= MIN_SUBJECT_BLOCK);

    type Need = (typeof needs)[number];

    for (const day of weekDays) {
      const k = day.sinceMonday - first;
      // Where each subject would sit after today if it were spread evenly.
      const onPace = (entry: Need) => (entry.need * (span - k - 1)) / span;
      const behind = (entry: Need) => entry.remaining - onPace(entry);
      const placedToday = new Set<Need>();

      const place = (entry: Need) => {
        // A tail too short to be its own session rides along with this one.
        const want =
          entry.remaining - entry.unit < MIN_SUBJECT_BLOCK ? entry.remaining : entry.unit;
        const block = carve(day, want, Math.min(want, MIN_SUBJECT_BLOCK), breakLength);
        if (!block) return;
        planned.push(
          studyBlock({
            block,
            title: `${entry.subject.name} study`,
            subject: entry.subject.name,
            taskId: null,
            kind: "subject",
          }),
        );
        entry.remaining -= block.end - block.start;
        placedToday.add(entry);
      };

      // Usually one session per subject per day; a second only for a
      // subject a full session behind (big targets, or a crowded week).
      for (let round = 0; round < 2; round++) {
        needs
          .filter(
            (entry) =>
              entry.remaining >= MIN_SUBJECT_BLOCK &&
              behind(entry) >=
                (round === 0 ? Math.min(entry.unit / 2, entry.remaining) : entry.unit),
          )
          .sort(
            (a, b) =>
              behind(b) - behind(a) ||
              b.subject.priority - a.subject.priority ||
              a.subject.name.localeCompare(b.subject.name),
          )
          .forEach(place);
      }

      // Pacing holds sessions back for later in the week. When later can't
      // absorb what's left (a tight daily limit, a packed week), use today's
      // spare room instead of wasting it. Days past this window are assumed
      // to have a full daily limit free.
      const laterDays = weekDays.filter((other) => other.sinceMonday > day.sinceMonday);
      const laterRoom =
        laterDays.reduce(
          (sum, other) =>
            sum +
            Math.max(
              0,
              Math.min(
                other.cap - other.used,
                other.free.reduce((free, slot) => free + (slot.end - slot.start), 0),
              ),
            ),
          0,
        ) +
        Math.max(0, span - k - 1 - laterDays.length) * g.dailyCap;
      const outstanding = needs.reduce((sum, entry) => sum + entry.remaining, 0);
      if (outstanding > laterRoom) {
        needs
          .filter((entry) => entry.remaining >= MIN_SUBJECT_BLOCK && !placedToday.has(entry))
          .sort(
            (a, b) =>
              b.remaining - a.remaining ||
              b.subject.priority - a.subject.priority ||
              a.subject.name.localeCompare(b.subject.name),
          )
          .forEach(place);
      }
    }
  }

  // 4. Write only the difference, and flag an out-of-date layout for the cron.
  const reusable = new Map<string, EventSelect[]>();
  for (const event of g.disposable) {
    const key = signature(event);
    reusable.set(key, [...(reusable.get(key) ?? []), event]);
  }
  const survivors = new Set<string>();
  const inserts: EventRow[] = [];
  for (const row of planned) {
    const matches = reusable.get(signature(row));
    const match = row.source === "sleep"
      ? matches?.find((event) =>
          event.id === row.id && event.status === "planned" &&
          event.outcome === "planned" && !event.pinned,
        )
      : matches?.pop();
    if (match) survivors.add(match.id);
    else inserts.push(row);
  }
  const removals = g.disposable.filter((event) => !survivors.has(event.id)).map((event) => event.id);

  const writes: BatchItem<"sqlite">[] = [
    ...chunk(removals, 50).map((ids) =>
      database
        .delete(schema.events)
        .where(and(eq(schema.events.userId, userId), inArray(schema.events.id, ids))),
    ),
    ...inserts.map((row) => row.source === "sleep"
      ? database.insert(schema.events).values(row).onConflictDoUpdate({
          target: schema.events.id,
          set: {
            startAt: row.startAt,
            endAt: row.endAt,
            title: "Sleep",
            category: "sleep",
            kind: "sleep",
            status: "planned",
            outcome: "planned",
            source: "sleep",
            editable: false,
            pinned: false,
          },
        })
      : database.insert(schema.events).values(row)),
  ];
  if (!current && inputs.layoutRow?.wantedKey !== key) {
    writes.push(
      database
        .insert(schema.dayLayouts)
        .values({ userId, wantedKey: key, wantedAt: Date.now() })
        .onConflictDoUpdate({ target: schema.dayLayouts.userId, set: { wantedKey: key, wantedAt: Date.now() } }),
    );
  }
  if (writes.length > 0) {
    await database.batch(writes as [BatchItem<"sqlite">, ...BatchItem<"sqlite">[]]);
  }

  return { created: inserts.length, removed: removals.length };
}
