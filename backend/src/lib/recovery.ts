import { and, asc, desc, eq, gte, lt } from "drizzle-orm";
import { schema, type Database } from "../db";
import { newId } from "./ids";
import { replan } from "./replan";
import { DAY, MINUTE, localDateKey, startOfLocalDay } from "./time";

/**
 * The Recovery Loop. When life changes, the student picks a reason and we
 * reflow the plan deterministically (the rules-based scheduler, never a slow
 * model call), then hand back a plain-English account of what changed and the
 * single next thing to do. This is the product's core promise: the plan stays
 * useful when the week moves.
 */
export type RecoveryReason = "missed" | "less_time" | "tired" | "busy" | "new_deadline";

export interface RecoveryInput {
  reason: RecoveryReason;
  /** busy: a one-off block today, "HH:MM"-"HH:MM". Defaults to now->end of day. */
  busyStart?: string;
  busyEnd?: string;
  /** new_deadline */
  title?: string;
  subject?: string;
  dueOn?: string; // "YYYY-MM-DD"
  size?: "small" | "medium" | "large";
}

export interface RecoveryBlock {
  subject: string | null;
  title: string;
  startAt: string;
  minutes: number;
}

export interface RecoverySessionChange {
  subject: string | null;
  title: string;
  before: { startAt: string; endAt: string } | null;
  after: { startAt: string; endAt: string } | null;
}

export interface RecoveryResult {
  /** What changed, in plain words, most important first. */
  lines: string[];
  /** Sessions whose day changed or whose start moved by at least 15 minutes. */
  moved: number;
  /** Sessions newly added to the visible week. */
  added: number;
  /** Sessions removed from the visible week. */
  removed: number;
  /** The one thing to do next. */
  nextBlock: RecoveryBlock | null;
  /** Actual study-session changes in the week the student can see. */
  changes: RecoverySessionChange[];
  /** The deadline that caused this recovery, when one was added. */
  deadline: { title: string; subject: string | null; dueAt: string; prepSessions: number } | null;
  /** The local day that was made unavailable, when applicable. */
  affectedDay: string | null;
}

const SIZE_MINUTES: Record<NonNullable<RecoveryInput["size"]>, number> = {
  small: 45,
  medium: 120,
  large: 240,
};

interface StudyEvent {
  taskId: string | null;
  subject: string | null;
  title: string;
  startAt: number;
  endAt: number;
}

/** Future study blocks in the next week, the window a student feels. */
async function upcomingStudy(database: Database, userId: string, from: number): Promise<StudyEvent[]> {
  const rows = await database
    .select({
      taskId: schema.events.taskId,
      subject: schema.events.subject,
      title: schema.events.title,
      startAt: schema.events.startAt,
      endAt: schema.events.endAt,
    })
    .from(schema.events)
    .where(
      and(
        eq(schema.events.userId, userId),
        eq(schema.events.category, "study"),
        eq(schema.events.outcome, "planned"),
        gte(schema.events.startAt, from),
        lt(schema.events.startAt, from + 7 * DAY),
      ),
    );
  return rows;
}

function sessionKey(event: StudyEvent): string {
  // Replanning can recreate event ids. Tasks survive that process, and the
  // title plus subject fallback handles untasked study blocks.
  return event.taskId ? `task:${event.taskId}` : `session:${event.subject ?? ""}|${event.title}`;
}

function serialiseSession(event: StudyEvent) {
  return { startAt: new Date(event.startAt).toISOString(), endAt: new Date(event.endAt).toISOString() };
}

/**
 * Pair repeated sessions in time order. This makes the visual stable even
 * when `replan` creates replacement event rows with fresh ids.
 */
function recoveryChanges(before: StudyEvent[], after: StudyEvent[]): RecoverySessionChange[] {
  const groups = new Map<string, { before: StudyEvent[]; after: StudyEvent[] }>();
  for (const event of before) {
    const key = sessionKey(event);
    const group = groups.get(key) ?? { before: [], after: [] };
    group.before.push(event);
    groups.set(key, group);
  }
  for (const event of after) {
    const key = sessionKey(event);
    const group = groups.get(key) ?? { before: [], after: [] };
    group.after.push(event);
    groups.set(key, group);
  }

  const changes: RecoverySessionChange[] = [];
  for (const group of groups.values()) {
    group.before.sort((a, b) => a.startAt - b.startAt);
    group.after.sort((a, b) => a.startAt - b.startAt);
    const count = Math.max(group.before.length, group.after.length);
    for (let index = 0; index < count; index += 1) {
      const beforeEvent = group.before[index] ?? null;
      const afterEvent = group.after[index] ?? null;
      if (
        beforeEvent && afterEvent &&
        beforeEvent.startAt === afterEvent.startAt && beforeEvent.endAt === afterEvent.endAt
      ) continue;
      const event = afterEvent ?? beforeEvent;
      if (!event) continue;
      changes.push({
        subject: event.subject,
        title: event.title,
        before: beforeEvent ? serialiseSession(beforeEvent) : null,
        after: afterEvent ? serialiseSession(afterEvent) : null,
      });
    }
  }
  return changes.sort((a, b) => {
    const aAt = Date.parse(a.after?.startAt ?? a.before?.startAt ?? "");
    const bAt = Date.parse(b.after?.startAt ?? b.before?.startAt ?? "");
    return aAt - bAt;
  });
}

function pad(n: number): string {
  return n.toString().padStart(2, "0");
}

/** Current wall-clock "HH:MM" in the student's timezone. */
function clockNow(now: number, tz: string): string {
  const minutesIntoDay = Math.floor((now - startOfLocalDay(now, tz)) / MINUTE);
  return `${pad(Math.floor(minutesIntoDay / 60))}:${pad(minutesIntoDay % 60)}`;
}

function dateLabel(at: number, tz: string): string {
  return new Date(at).toLocaleDateString("en-AU", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: tz,
  });
}

function timeLabel(at: number, tz: string): string {
  return new Date(at)
    .toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit", timeZone: tz })
    .toLowerCase()
    .replace(/\s/g, "");
}

const label = (event: { subject: string | null; title: string }) => event.subject || event.title;

export async function recoverPlan(
  database: Database,
  userId: string,
  input: RecoveryInput,
): Promise<RecoveryResult> {
  const [profile] = await database
    .select()
    .from(schema.profiles)
    .where(eq(schema.profiles.userId, userId))
    .limit(1);
  const tz = profile?.timezone ?? "Australia/Brisbane";
  const now = Date.now();
  const today = localDateKey(now, tz);

  const before = await upcomingStudy(database, userId, now);

  // 1. Apply the change deterministically.
  let freedToday = 0;
  let addedDeadline: { id: string; name: string; subject: string | null; dueAt: number } | null = null;

  if (input.reason === "missed") {
    // Mark the most recent block that has already started today as missed, so
    // the reflow treats its work as still owing rather than done.
    const startToday = startOfLocalDay(now, tz);
    const [recent] = await database
      .select({ id: schema.events.id })
      .from(schema.events)
      .where(
        and(
          eq(schema.events.userId, userId),
          eq(schema.events.category, "study"),
          gte(schema.events.startAt, startToday),
          lt(schema.events.startAt, now),
          eq(schema.events.outcome, "planned"),
        ),
      )
      .orderBy(desc(schema.events.startAt))
      .limit(1);
    if (recent) {
      await database
        .update(schema.events)
        .set({ status: "missed", outcome: "missed", missReason: "recovery" })
        .where(eq(schema.events.id, recent.id));
    }
  } else if (input.reason === "less_time" || input.reason === "tired") {
    // Block the rest of today so study reflows to the days that have room.
    freedToday = before
      .filter((e) => localDateKey(e.startAt, tz) === today)
      .reduce((sum, e) => sum + Math.round((e.endAt - e.startAt) / MINUTE), 0);
    await database.insert(schema.commitments).values({
      id: newId("cmt"),
      userId,
      title: input.reason === "tired" ? "Rest" : "Time off",
      category: "rest",
      recurrence: "none",
      startDate: today,
      startTime: clockNow(now, tz),
      endTime: "23:59",
      notes: "Added from a recovery",
    });
  } else if (input.reason === "busy") {
    const startTime = input.busyStart || clockNow(now, tz);
    const endTime = input.busyEnd || "23:59";
    await database.insert(schema.commitments).values({
      id: newId("cmt"),
      userId,
      title: "Busy",
      category: "other",
      recurrence: "none",
      startDate: today,
      startTime,
      endTime,
      notes: "Added from a recovery",
    });
  } else if (input.reason === "new_deadline") {
    const name = (input.title || "New deadline").slice(0, 120);
    // End of the given local day, so prep books in the days before it.
    const dueAt = input.dueOn
      ? startOfLocalDay(Date.parse(`${input.dueOn}T12:00:00Z`), tz) + DAY - MINUTE
      : now + 7 * DAY;
    const taskId = newId("tsk");
    const subject = input.subject || null;
    await database.insert(schema.tasks).values({
      id: taskId,
      userId,
      title: name,
      subject,
      taskType: "assignment",
      dueAt,
      estimatedMinutes: SIZE_MINUTES[input.size ?? "medium"],
    });
    addedDeadline = { id: taskId, name, subject, dueAt };
  }

  // 2. Reflow, deterministically. No model call sits between the student and a
  //    usable plan.
  await replan(database, userId);

  // 3. Read the new plan and describe the change.
  const after = await upcomingStudy(database, userId, now);
  const changes = recoveryChanges(before, after);
  const moved = changes.filter((change) => {
    if (!change.before || !change.after) return false;
    const dayChanged = localDateKey(Date.parse(change.before.startAt), tz) !== localDateKey(Date.parse(change.after.startAt), tz);
    const startShifted = Math.abs(Date.parse(change.before.startAt) - Date.parse(change.after.startAt)) >= 15 * MINUTE;
    return dayChanged || startShifted;
  }).length;
  const added = changes.filter((change) => !change.before && change.after).length;
  const removed = changes.filter((change) => change.before && !change.after).length;

  // The nearest real deadline that still has study booked before it is the
  // reassurance we should lead with after the week has shifted.
  const [nearestTask] = await database
    .select({
      id: schema.tasks.id,
      title: schema.tasks.title,
      subject: schema.tasks.subject,
      dueAt: schema.tasks.dueAt,
    })
    .from(schema.tasks)
    .where(and(eq(schema.tasks.userId, userId), eq(schema.tasks.status, "pending"), gte(schema.tasks.dueAt, now)))
    .orderBy(asc(schema.tasks.dueAt))
    .limit(1);

  const lines: string[] = [];
  if (addedDeadline) {
    const prepSessions = after.filter((event) => event.taskId === addedDeadline.id && event.startAt <= addedDeadline.dueAt).length;
    if (prepSessions > 0) {
      lines.push(`${addedDeadline.name} due ${dateLabel(addedDeadline.dueAt, tz)}: ${prepSessions} prep ${prepSessions === 1 ? "session" : "sessions"} booked`);
    } else {
      lines.push(`${addedDeadline.name} is in your plan`);
    }
  } else if (nearestTask) {
    const bookedBeforeDue = after.some((e) => e.taskId === nearestTask.id && e.startAt <= nearestTask.dueAt);
    if (bookedBeforeDue) {
      lines.push(`${label(nearestTask)} due ${dateLabel(nearestTask.dueAt, tz)} is still on track`);
    }
  }

  if (moved > 0) {
    lines.push(`Shifted ${moved} ${moved === 1 ? "session" : "sessions"} to make room`);
  } else if (addedDeadline || added > 0 || removed > 0) {
    lines.push("Your plan already had room");
  } else {
    lines.push("Your week still works as it is");
  }

  if (input.reason === "less_time" || input.reason === "tired") {
    lines.push(freedToday > 0 ? "Cleared the rest of today" : "Kept today light");
  } else if (input.reason === "busy") {
    lines.push("Worked around your new commitment");
  }

  const upcoming = after.filter((e) => e.startAt >= now).sort((a, b) => a.startAt - b.startAt);
  const next = upcoming[0] ?? null;
  const nextBlock: RecoveryBlock | null = next
    ? {
        subject: next.subject,
        title: next.title,
        startAt: new Date(next.startAt).toISOString(),
        minutes: Math.round((next.endAt - next.startAt) / MINUTE),
      }
    : null;

  return {
    lines,
    moved,
    added,
    removed,
    nextBlock,
    changes,
    deadline: addedDeadline
      ? {
          title: addedDeadline.name,
          subject: addedDeadline.subject,
          dueAt: new Date(addedDeadline.dueAt).toISOString(),
          prepSessions: after.filter((event) => event.taskId === addedDeadline.id && event.startAt <= addedDeadline.dueAt).length,
        }
      : null,
    affectedDay: input.reason === "busy" || input.reason === "less_time" || input.reason === "tired" ? today : null,
  };
}

export { timeLabel };
