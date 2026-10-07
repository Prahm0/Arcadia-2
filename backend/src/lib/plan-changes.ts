import { and, asc, eq, gte, lt } from "drizzle-orm";
import { schema, type Database } from "../db";
import { newId } from "./ids";
import { MAX_COMMITMENT_BUFFER, commitmentBuffers, releaseFromLayout, skipDates, subjectKey, weeklyTargetMinutes } from "./scheduler";
import { DAY, MINUTE, iso, localDateKey, parseClock, startOfLocalDay, zoneOffsetMinutes } from "./time";

/**
 * The changes Arcad proposes in chat (propose_changes), checked when it
 * proposes them and applied when the student taps Apply.
 *
 * Block changes (move, remove, add) work like the student doing it on the
 * Schedule: a moved or added block is pinned where it's put, and a removed
 * one is kept as skipped so the next re-plan doesn't put it straight back.
 */

type EventRow = typeof schema.events.$inferSelect;
type Operation = Record<string, unknown>;

/** How far ahead Arcad may put a block: the planned window. */
const AHEAD = 28 * DAY;
const MIN_LENGTH = 15 * MINUTE;
const MAX_LENGTH = 6 * 60 * MINUTE;
/** Same cap as the Subjects page. */
const WEEKLY_MAX = 1200;
const CATEGORIES = new Set(["school", "sport", "extracurricular", "other"]);

const str = (operation: Operation, key: string) =>
  typeof operation[key] === "string" && (operation[key] as string).trim() ? (operation[key] as string).trim() : undefined;
const num = (operation: Operation, key: string) =>
  operation[key] !== null && operation[key] !== "" && Number.isFinite(Number(operation[key])) ? Number(operation[key]) : undefined;

/** The instant a local date and clock time mean in the student's zone, or null. */
export function localInstant(date: string | undefined, minutes: number, timeZone: string): number | null {
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const noon = Date.parse(`${date}T12:00:00Z`);
  if (Number.isNaN(noon)) return null;
  const day = startOfLocalDay(noon - zoneOffsetMinutes(timeZone, noon) * MINUTE, timeZone);
  return localDateKey(day, timeZone) === date ? day + minutes * MINUTE : null;
}

function localClock(at: number, timeZone: string): string {
  const minutes = Math.round((at - startOfLocalDay(at, timeZone)) / MINUTE);
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

function when(at: number, timeZone: string): string {
  return new Intl.DateTimeFormat("en-AU", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    timeZone,
  }).format(at);
}

/** A block Arcad can move or remove: one of Arcadia's study blocks that hasn't happened. */
function movable(event: EventRow | undefined, now: number): event is EventRow {
  return Boolean(
    event &&
      event.editable &&
      event.category === "study" &&
      event.outcome === "planned" &&
      event.status !== "cancelled" &&
      !event.startedAt &&
      event.endAt > now,
  );
}

/**
 * What a block at [start, end) would sit on top of. Arcadia's own unpinned
 * blocks don't count: the re-plan after applying moves them out of the way.
 */
function clash(events: EventRow[], start: number, end: number, self?: string): EventRow | undefined {
  return events.find(
    (event) =>
      event.id !== self &&
      event.status !== "cancelled" &&
      !(event.source === "auto" && !event.pinned && event.outcome === "planned") &&
      event.startAt < end &&
      event.endAt > start,
  );
}

/** Where a block may go, or why it can't. */
function checkSlot(
  events: EventRow[],
  start: number | null,
  end: number,
  now: number,
  timeZone: string,
  self?: string,
): string | null {
  if (start === null) return "that's not a day and time I can read";
  if (end - start < MIN_LENGTH || end - start > MAX_LENGTH) return "blocks run 15 minutes to 6 hours";
  if (start < now) return `${when(start, timeZone)} has already gone`;
  if (start > now + AHEAD) return "that's more than four weeks out";
  const other = clash(events, start, end, self);
  return other ? `${when(start, timeZone)} clashes with ${other.title}` : null;
}

interface Loaded {
  userId: string;
  timeZone: string;
  bedtime: string;
  wakeTime: string;
  commitments: Array<typeof schema.commitments.$inferSelect>;
  sessionMinutes: number;
  grade: string | null;
  events: EventRow[];
  subjects: Array<typeof schema.subjects.$inferSelect>;
  tasks: Array<typeof schema.tasks.$inferSelect>;
}

async function load(database: Database, userId: string, now: number): Promise<Loaded> {
  const [profile] = await database
    .select({
      timezone: schema.profiles.timezone,
      preferredSessionMinutes: schema.profiles.preferredSessionMinutes,
      grade: schema.profiles.grade,
      bedtime: schema.profiles.bedtime,
      wakeTime: schema.profiles.wakeTime,
    })
    .from(schema.profiles)
    .where(eq(schema.profiles.userId, userId))
    .limit(1);
  const timeZone = profile?.timezone ?? "Australia/Brisbane";
  const from = startOfLocalDay(now, timeZone) - DAY;
  const [events, subjects, tasks, commitments] = await Promise.all([
    database
      .select()
      .from(schema.events)
      .where(and(eq(schema.events.userId, userId), gte(schema.events.endAt, from), lt(schema.events.startAt, now + AHEAD + DAY))),
    database.select().from(schema.subjects).where(eq(schema.subjects.userId, userId)),
    database
      .select()
      .from(schema.tasks)
      .where(and(eq(schema.tasks.userId, userId), eq(schema.tasks.status, "pending"))),
    database.select().from(schema.commitments).where(eq(schema.commitments.userId, userId)),
  ]);
  return {
    userId,
    timeZone,
    bedtime: profile?.bedtime ?? "22:30",
    wakeTime: profile?.wakeTime ?? "07:00",
    commitments,
    sessionMinutes: Math.max(15, profile?.preferredSessionMinutes ?? 50),
    grade: profile?.grade ?? null,
    events,
    subjects,
    tasks,
  };
}

const findSubject = (loaded: Loaded, name: string | undefined) =>
  name ? loaded.subjects.find((subject) => subjectKey(subject.name) === subjectKey(name)) : undefined;

/** Lower-case letters and digits only, with any "(PSYC2050)"-style code taken off. */
function looseKey(value: string | null | undefined): string {
  return (value ?? "").replace(/\([^)]*\)/g, " ").toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * The task an add_block is for. Arcad is told to pass the taskId, but it
 * sometimes names the task in subject or title instead ("Self Monitoring
 * Report (PSYC2050)"), which used to be rejected as "not one of your
 * subjects". Match those to the open task they clearly mean.
 */
export function findTask<T extends { id: string; title: string }>(
  tasks: T[],
  operation: Record<string, unknown>,
): T | undefined {
  const byId = tasks.find((task) => task.id === str(operation, "taskId") || task.id === str(operation, "id"));
  if (byId) return byId;
  for (const name of [str(operation, "title"), str(operation, "subject")]) {
    const key = looseKey(name);
    if (key.length < 4) continue;
    const exact = tasks.find((task) => looseKey(task.title) === key);
    if (exact) return exact;
    const partial = tasks.filter((task) => {
      const title = looseKey(task.title);
      return title.length >= 4 && (key.includes(title) || title.includes(key));
    });
    if (partial.length === 1) return partial[0];
  }
  return undefined;
}

/** One checked block change, or the reason it can't happen. */
function prepareBlock(loaded: Loaded, operation: Operation, now: number): Operation | string {
  const { timeZone, events } = loaded;
  const op = operation.op;

  if (op === "move_block" || op === "remove_block") {
    const event = events.find((row) => row.id === str(operation, "id"));
    if (!movable(event, now)) return "I couldn't find that block on your schedule";
    const from = { fromStartAt: iso(event.startAt), fromEndAt: iso(event.endAt) };
    const base = { op, id: event.id, title: event.title, subject: event.subject, ...from };
    if (op === "remove_block") return base;

    const date = str(operation, "date") ?? localDateKey(event.startAt, timeZone);
    const startClock = parseClock(str(operation, "startTime") ?? localClock(event.startAt, timeZone));
    const endClock = parseClock(str(operation, "endTime"));
    if (startClock === null) return "that's not a time I can read";
    const start = localInstant(date, startClock, timeZone);
    const end = start === null
      ? 0
      : endClock !== null
        ? start + (endClock - startClock) * MINUTE
        : start + (event.endAt - event.startAt);
    const problem = checkSlot(events, start, end, now, timeZone, event.id);
    if (problem) return problem;
    // eventId and action are what the before/after preview reads.
    return { ...base, eventId: event.id, action: "update", startAt: iso(start!), endAt: iso(end) };
  }

  // add_block
  const named = findSubject(loaded, str(operation, "subject"));
  const task = str(operation, "taskId") || !named ? findTask(loaded.tasks, operation) : undefined;
  const subject = task ? findSubject(loaded, task.subject ?? undefined) : named;
  if (!task && !subject) return `"${str(operation, "subject") ?? str(operation, "title") ?? "that"}" isn't one of your subjects or tasks`;
  const startClock = parseClock(str(operation, "startTime"));
  if (startClock === null) return "that's not a time I can read";
  const endClock = parseClock(str(operation, "endTime"));
  const start = localInstant(str(operation, "date"), startClock, timeZone);
  const end = start === null
    ? 0
    : start + (endClock !== null ? endClock - startClock : loaded.sessionMinutes) * MINUTE;
  const problem = checkSlot(events, start, end, now, timeZone);
  if (problem) return problem;
  return {
    op,
    action: "create",
    taskId: task?.id ?? null,
    title: task ? task.title : `${subject!.name} study`,
    subject: task ? task.subject : subject!.name,
    kind: task?.taskType ?? "subject",
    startAt: iso(start!),
    endAt: iso(end),
  };
}

function prepareCommitment(loaded: Loaded, operation: Operation, now: number): Operation | string {
  const title = str(operation, "title");
  const startTime = str(operation, "startTime");
  const endTime = str(operation, "endTime");
  const start = parseClock(startTime);
  const end = parseClock(endTime);
  if (!title) return "that commitment needs a name";
  if (start === null || end === null || end <= start) return "that commitment needs a start and an end time";

  const category = CATEGORIES.has(str(operation, "category") ?? "") ? str(operation, "category")! : "other";
  const base = { op: "create_commitment", title: title.slice(0, 200), category, startTime, endTime };
  const date = str(operation, "date");
  if (date) {
    const at = localInstant(date, end, loaded.timeZone);
    if (at === null) return "that's not a date I can read";
    if (at <= now) return `${date} has already gone`;
    return { ...base, recurrence: "none", date, weekday: null };
  }
  const recurrence = str(operation, "recurrence") ?? "weekly";
  if (recurrence === "none") return "a one-off needs a date";
  if (recurrence === "daily" || recurrence === "weekdays") return { ...base, recurrence, weekday: null };
  const weekday = num(operation, "weekday");
  if (recurrence !== "weekly" || weekday === undefined || !Number.isInteger(weekday) || weekday < 0 || weekday > 6) {
    return "a weekly commitment needs a day";
  }
  return { ...base, recurrence: "weekly", weekday };
}

const buffer = (operation: Operation, key: string) => {
  const value = num(operation, key);
  return value === undefined ? undefined : Math.min(MAX_COMMITMENT_BUFFER, Math.max(0, Math.round(value / 5) * 5));
};

/**
 * A lasting change to a commitment: new times, or a gap kept free either
 * side ("keep 2 hours around training"). A gap never moves the commitment.
 */
function prepareCommitmentUpdate(loaded: Loaded, operation: Operation): Operation | string {
  const commitment = loaded.commitments.find((row) => row.id === str(operation, "id"));
  if (!commitment) return "I couldn't find that commitment";
  const startTime = str(operation, "startTime") ?? commitment.startTime;
  const endTime = str(operation, "endTime") ?? commitment.endTime;
  const start = parseClock(startTime);
  const end = parseClock(endTime);
  if (start === null || end === null || end <= start) return `${commitment.title} needs a start before its end`;
  const was = commitmentBuffers(commitment);
  const before = buffer(operation, "bufferBefore") ?? was.before;
  const after = buffer(operation, "bufferAfter") ?? was.after;
  if (startTime === commitment.startTime && endTime === commitment.endTime && before === was.before && after === was.after) {
    return `${commitment.title} is already set up like that`;
  }
  return {
    op: "update_commitment",
    id: commitment.id,
    title: commitment.title,
    recurrence: commitment.recurrence,
    weekday: commitment.weekday,
    startTime,
    endTime,
    bufferBefore: before,
    bufferAfter: after,
    fromStartTime: commitment.startTime,
    fromEndTime: commitment.endTime,
    fromBufferBefore: was.before,
    fromBufferAfter: was.after,
  };
}

/** One day off a repeating commitment, for when that day is different. */
function prepareCommitmentSkip(loaded: Loaded, operation: Operation, now: number): Operation | string {
  const commitment = loaded.commitments.find((row) => row.id === str(operation, "id"));
  if (!commitment) return "I couldn't find that commitment";
  if (commitment.recurrence === "none") return `${commitment.title} only happens once; remove it instead`;
  const date = str(operation, "date");
  const end = parseClock(commitment.endTime) ?? 0;
  const at = localInstant(date, end, loaded.timeZone);
  if (at === null) return "that's not a date I can read";
  if (at <= now) return `${date} has already gone`;
  if (at > now + AHEAD) return "that's more than four weeks out";
  if (skipDates(commitment).includes(date!)) return `${commitment.title} is already off on ${date}`;
  return { op: "skip_commitment", id: commitment.id, title: commitment.title, date, startTime: commitment.startTime, endTime: commitment.endTime };
}

/** The night of `date`'s sleep block, as the scheduler names it. */
function sleepEventId(userId: string, date: string): string {
  return `evt_sleep_${userId}_${date}`;
}

/**
 * One night's bedtime ("I can study until 11:45 tonight"). Their usual
 * bedtime stays as it is; this moves just that night's sleep block, the
 * same as editing it on the Schedule.
 */
function prepareBedtime(loaded: Loaded, operation: Operation, now: number): Operation | string {
  const date = str(operation, "date");
  const bedtime = str(operation, "bedtime") ?? str(operation, "startTime");
  const minutes = parseClock(bedtime);
  if (!date || localInstant(date, 0, loaded.timeZone) === null) return "that's not a date I can read";
  if (minutes === null) return "that's not a bedtime I can read";
  // Times before midday are after midnight, still that night.
  const start = localInstant(date, minutes, loaded.timeZone)! + (minutes < 12 * 60 ? DAY : 0);
  if (start <= now) return `${bedtime} on ${date} has already gone`;
  const night = loaded.events.find((event) => event.id === sleepEventId(loaded.userId, date));
  if (!night || night.outcome !== "planned") return `I can't find your sleep for ${date} yet`;
  if (night.endAt - start < 3 * 60 * MINUTE) return "that leaves less than 3 hours of sleep";
  return {
    op: "set_bedtime",
    date,
    bedtime,
    fromBedtime: localClock(night.startAt, loaded.timeZone),
    startAt: iso(start),
    endAt: iso(night.endAt),
  };
}

function prepareSubject(loaded: Loaded, operation: Operation): Operation | string {
  const subject = findSubject(loaded, str(operation, "subject"));
  if (!subject) return `"${str(operation, "subject") ?? "that"}" isn't one of your subjects`;
  const minutes = num(operation, "weeklyMinutes");
  if (minutes === undefined) return `how many minutes a week for ${subject.name}?`;
  return {
    op: "update_subject",
    id: subject.id,
    subject: subject.name,
    weeklyMinutes: Math.min(WEEKLY_MAX, Math.max(0, Math.round(minutes / 5) * 5)),
    fromWeeklyMinutes: weeklyTargetMinutes(subject, loaded.grade),
  };
}

/**
 * Checks what Arcad proposed against the student's real schedule, so a
 * change card only offers what Apply can actually do. Block and commitment
 * changes come back with their times worked out (and a snapshot of where a
 * block was, for the preview). Anything that can't happen is dropped, with
 * the reason in `problems`.
 */
export async function prepareOperations(
  database: Database,
  userId: string,
  raw: unknown[],
  now = Date.now(),
): Promise<{ operations: Operation[]; problems: string[] }> {
  const loaded = await load(database, userId, now);
  const operations: Operation[] = [];
  const problems: string[] = [];

  for (const item of raw.slice(0, 50)) {
    if (!item || typeof item !== "object") continue;
    const operation = item as Operation;
    let prepared: Operation | string;
    switch (operation.op) {
      case "move_block":
      case "remove_block":
      case "add_block":
        prepared = prepareBlock(loaded, operation, now);
        break;
      case "create_commitment":
        prepared = prepareCommitment(loaded, operation, now);
        break;
      case "update_subject":
        prepared = prepareSubject(loaded, operation);
        break;
      case "update_commitment":
        prepared = prepareCommitmentUpdate(loaded, operation);
        break;
      case "skip_commitment":
        prepared = prepareCommitmentSkip(loaded, operation, now);
        break;
      case "set_bedtime":
        prepared = prepareBedtime(loaded, operation, now);
        break;
      case "create_task":
      case "update_task":
      case "delete_task":
      case "delete_commitment":
        prepared = operation;
        break;
      default:
        continue;
    }
    if (typeof prepared === "string") problems.push(prepared);
    else operations.push(prepared);
  }

  // Two blocks moved or added into the same time would sit on each other.
  const placed = operations.filter((operation) => operation.op === "move_block" || operation.op === "add_block");
  for (let i = placed.length - 1; i > 0; i--) {
    const start = Date.parse(String(placed[i].startAt));
    const end = Date.parse(String(placed[i].endAt));
    const overlap = placed
      .slice(0, i)
      .some((other) => Date.parse(String(other.startAt)) < end && Date.parse(String(other.endAt)) > start);
    if (overlap) {
      operations.splice(operations.indexOf(placed[i]), 1);
      problems.push(`two blocks would land on ${when(start, loaded.timeZone)}`);
    }
  }

  return { operations, problems };
}

/**
 * Applies a proposal the student accepted. Each change is checked again,
 * since the schedule may have moved on since Arcad proposed it; one that no
 * longer fits is skipped rather than forced in. The caller re-plans after.
 */
export async function applyOperations(
  database: Database,
  userId: string,
  operations: Operation[],
  now = Date.now(),
): Promise<{ applied: number; skipped: number }> {
  const loaded = await load(database, userId, now);
  let applied = 0;
  let skipped = 0;

  for (const operation of operations.slice(0, 50)) {
    const op = String(operation.op ?? "");
    const s = (key: string) => str(operation, key);
    const n = (key: string) => num(operation, key);
    let done = false;

    if (op === "create_task") {
      const title = s("title");
      const dueAt = Date.parse(s("dueAt") ?? "");
      if (title && !Number.isNaN(dueAt)) {
        await database.insert(schema.tasks).values({
          id: newId("tsk"),
          userId,
          title: title.slice(0, 200),
          subject: s("subject") ?? null,
          taskType: s("taskType") ?? "study",
          dueAt,
          estimatedMinutes: Math.min(1200, Math.max(15, n("estimatedMinutes") ?? 60)),
          priority: Math.min(5, Math.max(1, n("priority") ?? 2)),
        });
        done = true;
      }
    } else if (op === "update_task") {
      const taskId = s("id");
      const patch: Partial<typeof schema.tasks.$inferInsert> = {};
      if (s("title")) patch.title = s("title")!.slice(0, 200);
      if (s("subject") !== undefined) patch.subject = s("subject") ?? null;
      const dueAt = Date.parse(s("dueAt") ?? "");
      if (!Number.isNaN(dueAt)) patch.dueAt = dueAt;
      if (n("estimatedMinutes") !== undefined) {
        patch.estimatedMinutes = Math.min(1200, Math.max(15, n("estimatedMinutes")!));
      }
      if (taskId && Object.keys(patch).length > 0) {
        await database
          .update(schema.tasks)
          .set(patch)
          .where(and(eq(schema.tasks.id, taskId), eq(schema.tasks.userId, userId)));
        done = true;
      }
    } else if (op === "delete_task") {
      const taskId = s("id");
      if (taskId) {
        await database
          .delete(schema.events)
          .where(and(eq(schema.events.userId, userId), eq(schema.events.taskId, taskId)));
        await database
          .delete(schema.tasks)
          .where(and(eq(schema.tasks.id, taskId), eq(schema.tasks.userId, userId)));
        done = true;
      }
    } else if (op === "create_commitment") {
      // Checked again: older proposals were stored before the checks above.
      const commitment = prepareCommitment(loaded, operation, now);
      if (typeof commitment !== "string") {
        await database.insert(schema.commitments).values({
          id: newId("cmt"),
          userId,
          title: String(commitment.title),
          category: String(commitment.category),
          recurrence: String(commitment.recurrence),
          weekday: typeof commitment.weekday === "number" ? commitment.weekday : null,
          startDate: typeof commitment.date === "string" ? commitment.date : null,
          startTime: String(commitment.startTime),
          endTime: String(commitment.endTime),
        });
        done = true;
      }
    } else if (op === "delete_commitment") {
      const commitmentId = s("id");
      if (commitmentId) {
        await database
          .delete(schema.events)
          .where(and(eq(schema.events.userId, userId), eq(schema.events.commitmentId, commitmentId)));
        await database
          .delete(schema.commitments)
          .where(and(eq(schema.commitments.id, commitmentId), eq(schema.commitments.userId, userId)));
        done = true;
      }
    } else if (op === "update_commitment") {
      const checked = prepareCommitmentUpdate(loaded, operation);
      if (typeof checked !== "string") {
        await database
          .update(schema.commitments)
          .set({
            startTime: String(checked.startTime),
            endTime: String(checked.endTime),
            bufferBefore: Number(checked.bufferBefore),
            bufferAfter: Number(checked.bufferAfter),
          })
          .where(and(eq(schema.commitments.id, String(checked.id)), eq(schema.commitments.userId, userId)));
        done = true;
      }
    } else if (op === "skip_commitment") {
      const checked = prepareCommitmentSkip(loaded, operation, now);
      const commitment = typeof checked === "string" ? undefined : loaded.commitments.find((row) => row.id === checked.id);
      if (commitment && typeof checked !== "string") {
        const today = localDateKey(now, loaded.timeZone);
        // Dates that have passed don't need keeping.
        const dates = [...skipDates(commitment).filter((date) => date >= today), String(checked.date)].sort();
        await database
          .update(schema.commitments)
          .set({ skipDates: JSON.stringify(dates) })
          .where(and(eq(schema.commitments.id, commitment.id), eq(schema.commitments.userId, userId)));
        commitment.skipDates = JSON.stringify(dates);
        done = true;
      }
    } else if (op === "set_bedtime") {
      const checked = prepareBedtime(loaded, operation, now);
      if (typeof checked !== "string") {
        await database
          .update(schema.events)
          .set({ startAt: Date.parse(String(checked.startAt)), pinned: true })
          .where(and(eq(schema.events.id, sleepEventId(userId, String(checked.date))), eq(schema.events.userId, userId)));
        done = true;
      }
    } else if (op === "update_subject") {
      const subject = loaded.subjects.find((row) => row.id === s("id"));
      const minutes = n("weeklyMinutes");
      if (subject && minutes !== undefined) {
        await database
          .update(schema.subjects)
          .set({ weeklyMinutes: Math.min(WEEKLY_MAX, Math.max(0, Math.round(minutes))) })
          .where(eq(schema.subjects.id, subject.id));
        done = true;
      }
    } else if (op === "move_block" || op === "remove_block") {
      const event = loaded.events.find((row) => row.id === s("id"));
      if (movable(event, now)) {
        if (op === "remove_block") {
          // As if they took it off the Schedule themselves.
          await database
            .update(schema.events)
            .set({ status: "cancelled", outcome: "missed", pinned: true })
            .where(eq(schema.events.id, event.id));
          event.status = "cancelled";
          done = true;
        } else {
          const startAt = Date.parse(s("startAt") ?? "");
          const endAt = Date.parse(s("endAt") ?? "");
          if (!checkSlot(loaded.events, Number.isNaN(startAt) ? null : startAt, endAt, now, loaded.timeZone, event.id)) {
            await releaseFromLayout(database, event, loaded.timeZone);
            const moved = { startAt, endAt, pinned: true, movedFrom: event.movedFrom ?? event.startAt };
            await database.update(schema.events).set(moved).where(eq(schema.events.id, event.id));
            Object.assign(event, moved);
            done = true;
          }
        }
      }
    } else if (op === "add_block") {
      const startAt = Date.parse(s("startAt") ?? "");
      const endAt = Date.parse(s("endAt") ?? "");
      // Prepared add_blocks carry the resolved taskId (null for subject time).
      const task = s("taskId") ? loaded.tasks.find((row) => row.id === s("taskId")) : undefined;
      const subject = task ? task.subject : findSubject(loaded, s("subject"))?.name;
      if ((task || subject) && !checkSlot(loaded.events, Number.isNaN(startAt) ? null : startAt, endAt, now, loaded.timeZone)) {
        const row = {
          id: newId("evt"),
          userId,
          taskId: task?.id ?? null,
          title: task?.title ?? `${subject} study`,
          subject: subject ?? null,
          category: "study",
          kind: task?.taskType ?? "subject",
          startAt,
          endAt,
          status: "planned",
          outcome: "planned",
          source: "auto",
          editable: true,
          pinned: true,
        };
        await database.insert(schema.events).values(row);
        loaded.events.push(row as EventRow);
        done = true;
      }
    }

    if (done) applied += 1;
    else skipped += 1;
  }

  return { applied, skipped };
}

/**
 * The next seven days as Arcad reads them in chat: everything on the
 * schedule but sleep, in their local time, with ids on the blocks it can
 * move or remove.
 */
export async function scheduleContext(
  database: Database,
  userId: string,
  timeZone: string,
  now = Date.now(),
): Promise<string[]> {
  const from = startOfLocalDay(now, timeZone);
  const rows = await database
    .select()
    .from(schema.events)
    .where(and(eq(schema.events.userId, userId), gte(schema.events.startAt, from), lt(schema.events.startAt, from + 7 * DAY)))
    .orderBy(asc(schema.events.startAt));
  const today = localDateKey(now, timeZone);
  const dayLabel = new Intl.DateTimeFormat("en-AU", { weekday: "short", day: "numeric", month: "short", timeZone });

  const lines = ["Their schedule for the next 7 days (local times; [id] marks a block you can move or remove):"];
  let day = "";
  for (const event of rows) {
    if (event.category === "sleep" || event.status === "cancelled") continue;
    const date = localDateKey(event.startAt, timeZone);
    if (date !== day) {
      day = date;
      lines.push(`${dayLabel.format(event.startAt)} (${date})${date === today ? ", today" : ""}:`);
    }
    const state =
      event.outcome === "completed" ? ", done" : event.outcome === "missed" ? ", skipped" : event.startedAt ? ", under way" : "";
    const subject = event.subject && !event.title.includes(event.subject) ? ` (${event.subject})` : "";
    lines.push(
      `- ${movable(event, now) ? `[${event.id}] ` : ""}${localClock(event.startAt, timeZone)}–${localClock(event.endAt, timeZone)} ${event.title}${subject}${state}`,
    );
  }
  if (lines.length === 1) lines.push("- nothing planned");
  return lines;
}
