import { and, desc, eq, gte, inArray, lt, lte } from "drizzle-orm";
import type { Database } from "../db";
import { schema } from "../db";
import { newId } from "./ids";
import type { MonthPlan } from "./month-plan";
import { inTerm } from "./terms";
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

const HALF_DAY = DAY / 2;
const MIN_BLOCK = 15 * MINUTE;
// Subject sessions don't get squeezed into the 15-minute crumbs that
// deadline work is allowed to fill.
const MIN_SUBJECT_BLOCK = 25 * MINUTE;

interface Slot {
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
 * Concrete occurrences of a commitment inside [from, to). School hours are
 * skipped in the holidays when the student's state calendar is known.
 */
function commitmentSlots(
  commitment: Commitment,
  from: number,
  to: number,
  tz: string,
  state: string | null,
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
    if (commitment.category === "school" && inTerm(state, localDateKey(day, tz)) === false) continue;
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

interface PlanDay {
  start: number;
  weekStart: number;
  /** 0 = Monday. */
  sinceMonday: number;
  free: Slot[];
  /** Study time already on this day, counted against the daily cap. */
  used: number;
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

/**
 * Takes up to `want` (never less than `atLeast`) out of the day's free time,
 * with a break either side, counted against the daily cap. Null if nothing
 * fits or the cap is spent.
 */
function carve(
  day: PlanDay,
  want: number,
  atLeast: number,
  breakLength: number,
  dailyCap: number,
  before = Infinity,
): Slot | null {
  const budget = Math.min(want, dailyCap - day.used);
  if (budget < atLeast) return null;

  // Longest block that fits, down to atLeast, in the preferred spot.
  const longest = day.free
    .filter((slot) => slot.start < before)
    .reduce((max, slot) => Math.max(max, slot.end - slot.start), 0);
  const length = Math.min(budget, longest);
  if (length < atLeast) return null;
  const block = pickSpot(day, length, before);
  if (!block) return null;

  let free: Slot[] = [];
  for (const slot of day.free) {
    free.push(...subtract([slot], { start: block.start - breakLength, end: block.end + breakLength }));
  }
  free = free.filter((slot) => slot.end - slot.start >= MIN_BLOCK);
  day.free = free.sort((a, b) => a.start - b.start);
  day.used += block.end - block.start;
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
    for (const week of plan.weeks ?? []) {
      weeks.set(
        week.weekOf,
        new Map((week.subjects ?? []).map((entry) => [subjectKey(entry.name), Number(entry.minutes) || 0])),
      );
    }
    return { weeks, base: plan.base ?? {} };
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
 * Study time comes from two places, in this order:
 *   1. Deadline work: pending tasks, most urgent first.
 *   2. Subject time: each subject is topped up toward its weekly target,
 *      paced across the week so sessions spread out instead of bunching.
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
  const [profile] = await database
    .select()
    .from(schema.profiles)
    .where(eq(schema.profiles.userId, userId))
    .limit(1);
  if (!profile) return { created: 0, removed: 0 };

  const tz = profile.timezone;
  const now = Date.now();
  const weekStart = startOfLocalWeek(Math.max(from, now), tz);

  const [existing, commitmentRows, taskRows, subjectRows, earlierThisWeek, sessionRows, [planRow]] =
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
    ]);

  // Every source we re-materialise below has to be listed here, or the old
  // rows survive and pile up on top of the fresh ones (e.g. "sleep sleep
  // sleep sleep sleep" showing on Today after a few dashboard loads).
  const REMATERIALISED = new Set(["auto", "sleep", "commitment"]);
  // The block you're in the middle of stays put rather than sliding forward.
  const underway = (event: EventSelect) =>
    event.source === "auto" && event.startAt <= now && event.endAt > now;
  const keep = existing.filter(
    (event) =>
      event.pinned ||
      event.outcome !== "planned" ||
      !REMATERIALISED.has(event.source) ||
      underway(event),
  );
  const disposable = existing.filter((event) => !keep.includes(event));

  const planned: EventRow[] = [];

  // 1. Commitments and sleep become real events and also block study time.
  const busy: Slot[] = [];

  for (const commitment of commitmentRows) {
    for (const slot of commitmentSlots(commitment, from, to, tz, profile.state)) {
      busy.push(slot);
      planned.push({
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
    busy.push(slot);
    if (slot.end <= from || slot.start >= to) continue;
    planned.push({
      id: newId("evt"),
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

  // 2. Whatever is left is study time, day by day.
  const sessionLength = Math.max(15, profile.preferredSessionMinutes) * MINUTE;
  const breakLength = Math.max(0, profile.breakMinutes) * MINUTE;
  const dailyCap = Math.max(0, profile.maxDailyStudyMinutes) * MINUTE;

  const days: PlanDay[] = [];
  for (let day = startOfLocalDay(Math.max(from, now), tz); day < to; day = nextLocalDay(day, tz)) {
    const end = nextLocalDay(day, tz);
    let free: Slot[] = [{ start: Math.max(day, now), end }];
    for (const block of busy) free = subtract(free, block);
    days.push({
      start: day,
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
    });
  }

  const studyBlock = (
    block: Slot,
    fields: { title: string; subject: string | null; taskId: string | null; kind: string },
  ): EventRow => ({
    id: newId("evt"),
    userId,
    taskId: fields.taskId,
    title: fields.title,
    subject: fields.subject,
    category: "study",
    kind: fields.kind,
    startAt: block.start,
    endAt: block.end,
    status: "planned",
    outcome: "planned",
    source: "auto",
    editable: true,
    pinned: false,
  });

  // 2a. Deadline work. Most urgent first, then highest priority.
  const queue = taskRows
    .map((task) => {
      const remaining = Math.max(0, task.estimatedMinutes - task.completedMinutes) * MINUTE;
      return { task, remaining, unit: evenSession(remaining, sessionLength, MIN_BLOCK) };
    })
    .filter((entry) => entry.remaining > 0)
    .sort((a, b) => a.task.dueAt - b.task.dueAt || b.task.priority - a.task.priority);

  for (const day of days) {
    for (;;) {
      const earliest = day.free[0]?.start;
      if (earliest === undefined) break;
      const entry = queue.find((item) => item.remaining > 0 && item.task.dueAt > earliest);
      if (!entry) break;

      const want =
        entry.remaining - entry.unit < MIN_BLOCK
          ? Math.max(MIN_BLOCK, entry.remaining)
          : entry.unit;
      const block = carve(day, want, MIN_BLOCK, breakLength, dailyCap, entry.task.dueAt);
      if (!block) break;

      planned.push(
        studyBlock(block, {
          title: entry.task.title,
          subject: entry.task.subject,
          taskId: entry.task.id,
          kind: entry.task.taskType,
        }),
      );
      entry.remaining -= block.end - block.start;
    }
  }

  // 2b. Subject time. Work out how much of each weekly target is already
  // covered: study done (the larger of completed blocks and logged focus
  // time, since a focused block records both) plus study still planned.
  const credit = new Map<string, { done: number; focused: number; planned: number }>();
  const creditFor = (at: number, subject: string | null | undefined) => {
    const key = `${startOfLocalWeek(at, tz)}|${subjectKey(subject)}`;
    let entry = credit.get(key);
    if (!entry) {
      entry = { done: 0, focused: 0, planned: 0 };
      credit.set(key, entry);
    }
    return entry;
  };

  for (const event of [...earlierThisWeek, ...keep]) {
    if (event.category !== "study" || !event.subject) continue;
    if (event.outcome === "completed") creditFor(event.startAt, event.subject).done += event.endAt - event.startAt;
    else if (event.outcome === "planned") creditFor(event.startAt, event.subject).planned += event.endAt - event.startAt;
  }
  for (const row of planned) {
    if (row.category !== "study" || !row.subject) continue;
    creditFor(row.startAt, row.subject).planned += row.endAt - row.startAt;
  }
  for (const session of sessionRows) {
    if (session.type !== "focus" || !session.subject) continue;
    creditFor(session.endedAt, session.subject).focused += session.seconds * 1000;
  }

  const subjects = uniqueSubjects(subjectRows);
  const monthPlan = readMonthPlan(planRow?.plan);
  const capacity = Math.max(0, profile.maxDailyStudyMinutes) * 7;

  /**
   * A subject's minutes in one week. The month plan moves time between
   * weeks (more before a deadline, less after). It's stored against the
   * targets at the time, so a target changed since scales the plan with it.
   */
  const targetFor = (subject: Subject, week: number) => {
    const target = weeklyTargetMinutes(subject, profile.grade);
    const key = subjectKey(subject.name);
    const planned = monthPlan?.weeks.get(localDateKey(week, tz))?.get(key);
    const base = monthPlan?.base[key];
    if (planned === undefined || !base) return target;
    return (target * planned) / base;
  };

  const weeks = new Map<number, PlanDay[]>();
  for (const day of days) weeks.set(day.weekStart, [...(weeks.get(day.weekStart) ?? []), day]);

  for (const [start, weekDays] of weeks) {
    const first = weekDays[0].sinceMonday;
    // Pace over the rest of the week, even the part beyond this window, so
    // next week's first days only get their share rather than all of it.
    const span = 7 - first;

    // Targets that add up to more than the cap allows all shrink by the same
    // share, rather than the last subjects in the week missing out.
    const wanted = subjects.reduce((sum, subject) => sum + targetFor(subject, start), 0);
    const scale = wanted > capacity && wanted > 0 ? capacity / wanted : 1;

    const needs = subjects
      .map((subject) => {
        const target = Math.round((targetFor(subject, start) * scale) / 5) * 5 * MINUTE;
        const covered = credit.get(`${start}|${subjectKey(subject.name)}`);
        const need = Math.max(
          0,
          target - (covered ? Math.max(covered.done, covered.focused) + covered.planned : 0),
        );
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
        const block = carve(day, want, Math.min(want, MIN_SUBJECT_BLOCK), breakLength, dailyCap);
        if (!block) return;
        planned.push(
          studyBlock(block, {
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
                dailyCap - other.used,
                other.free.reduce((free, slot) => free + (slot.end - slot.start), 0),
              ),
            ),
          0,
        ) +
        Math.max(0, span - k - 1 - laterDays.length) * dailyCap;
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

  // 3. Write only the difference.
  const reusable = new Map<string, EventSelect[]>();
  for (const event of disposable) {
    const key = signature(event);
    reusable.set(key, [...(reusable.get(key) ?? []), event]);
  }
  const survivors = new Set<string>();
  const inserts: EventRow[] = [];
  for (const row of planned) {
    const match = reusable.get(signature(row))?.pop();
    if (match) survivors.add(match.id);
    else inserts.push(row);
  }
  const removals = disposable.filter((event) => !survivors.has(event.id)).map((event) => event.id);

  const writes = [
    ...chunk(removals, 50).map((ids) =>
      database
        .delete(schema.events)
        .where(and(eq(schema.events.userId, userId), inArray(schema.events.id, ids))),
    ),
    ...inserts.map((row) => database.insert(schema.events).values(row)),
  ];
  if (writes.length > 0) {
    await database.batch(writes as [(typeof writes)[number], ...(typeof writes)[number][]]);
  }

  return { created: inserts.length, removed: removals.length };
}
