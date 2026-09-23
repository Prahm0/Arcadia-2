import { and, desc, eq, gte, lt } from "drizzle-orm";
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

export interface RecoveryResult {
  /** What changed, in plain words, most important first. */
  lines: string[];
  /** How many upcoming sessions Arcad rearranged. */
  moved: number;
  /** The one thing to do next. */
  nextBlock: RecoveryBlock | null;
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
        gte(schema.events.startAt, from),
        lt(schema.events.startAt, from + 7 * DAY),
      ),
    );
  return rows;
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
  let addedDeadline: { name: string; dueAt: number } | null = null;

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
    await database.insert(schema.tasks).values({
      id: newId("tsk"),
      userId,
      title: name,
      subject: input.subject || null,
      taskType: "assignment",
      dueAt,
      estimatedMinutes: SIZE_MINUTES[input.size ?? "medium"],
    });
    addedDeadline = { name, dueAt };
  }

  // 2. Reflow, deterministically. No model call sits between the student and a
  //    usable plan.
  await replan(database, userId);

  // 3. Read the new plan and describe the change.
  const after = await upcomingStudy(database, userId, now);

  const afterSlots = new Set(after.map((e) => `${e.taskId ?? e.subject ?? ""}@${e.startAt}`));
  const moved = Math.min(
    before.length,
    before.filter((e) => !afterSlots.has(`${e.taskId ?? e.subject ?? ""}@${e.startAt}`)).length,
  );

  const lines: string[] = [];
  if (moved > 0) {
    lines.push(`Moved ${moved} ${moved === 1 ? "session" : "sessions"} around your week`);
  } else {
    lines.push("Your week still works, nothing needed moving");
  }

  if (addedDeadline) {
    lines.push(`Booked prep for ${addedDeadline.name} before ${dateLabel(addedDeadline.dueAt, tz)}`);
  }

  // The nearest real deadline that still has study booked before it: the thing
  // the student most needs protected.
  const withDue = after.filter((e) => e.taskId);
  if (withDue.length > 0) {
    const soonest = withDue.reduce((a, b) => (a.startAt < b.startAt ? a : b));
    const protectedName = label(soonest);
    if (!addedDeadline || protectedName !== addedDeadline.name) {
      lines.push(`Kept ${protectedName} on track`);
    }
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

  return { lines, moved, nextBlock };
}

export { timeLabel };
