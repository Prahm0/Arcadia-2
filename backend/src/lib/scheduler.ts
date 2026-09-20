import { and, eq, gte, lte } from "drizzle-orm";
import type { Database } from "../db";
import { schema } from "../db";
import { newId } from "./ids";
import { DAY, MINUTE, localWeekday, parseClock, startOfLocalDay } from "./time";

type Profile = typeof schema.profiles.$inferSelect;
type Task = typeof schema.tasks.$inferSelect;
type Commitment = typeof schema.commitments.$inferSelect;
type EventRow = typeof schema.events.$inferInsert;

const HALF_DAY = DAY / 2;

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

/** Concrete occurrences of a commitment inside [from, to). */
function commitmentSlots(commitment: Commitment, from: number, to: number, tz: string): Slot[] {
  const startMinutes = parseClock(commitment.startTime);
  const endMinutes = parseClock(commitment.endTime);
  if (startMinutes === null || endMinutes === null || endMinutes <= startMinutes) return [];

  const slots: Slot[] = [];
  for (let day = startOfLocalDay(from, tz); day < to; day += DAY) {
    if (commitment.recurrence === "weekly") {
      if (commitment.weekday === null || localWeekday(day, tz) !== commitment.weekday) continue;
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
  for (let day = startOfLocalDay(from, tz) - DAY; day < to; day += DAY) {
    const start = day + bedtime * MINUTE;
    // bedtime after midnight (e.g. 00:30) belongs to the same night
    const end = day + (wake > bedtime ? wake : wake + 24 * 60) * MINUTE;
    slots.push({ start, end });
  }
  return slots;
}

export interface RebuildResult {
  created: number;
  removed: number;
}

/**
 * Rebuilds auto-generated study blocks for [from, to).
 *
 * Anything the user touched is left alone: pinned events, events with an
 * outcome, and events whose source is not "auto". Commitments and sleep are
 * re-materialised each run so edits to them take effect immediately.
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

  const existing = await database
    .select()
    .from(schema.events)
    .where(
      and(
        eq(schema.events.userId, userId),
        gte(schema.events.startAt, from),
        lte(schema.events.startAt, to),
      ),
    );

  // Every source we re-materialise below has to be listed here, or the old
  // rows survive and pile up on top of the fresh ones (e.g. "sleep sleep
  // sleep sleep sleep" showing on Today after a few dashboard loads).
  const REMATERIALISED = new Set(["auto", "sleep", "commitment"]);
  const keep = existing.filter(
    (event) => event.pinned || event.outcome !== "planned" || !REMATERIALISED.has(event.source),
  );
  const disposable = existing.filter((event) => !keep.includes(event));

  for (const event of disposable) {
    await database.delete(schema.events).where(eq(schema.events.id, event.id));
  }

  const commitmentRows = await database
    .select()
    .from(schema.commitments)
    .where(eq(schema.commitments.userId, userId));

  const taskRows = await database
    .select()
    .from(schema.tasks)
    .where(and(eq(schema.tasks.userId, userId), eq(schema.tasks.status, "pending")));

  const inserts: EventRow[] = [];

  // 1. Commitments and sleep become real events and also block study time.
  const busy: Slot[] = [];

  for (const commitment of commitmentRows) {
    for (const slot of commitmentSlots(commitment, from, to, tz)) {
      busy.push(slot);
      inserts.push({
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
    inserts.push({
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

  // Most urgent first, then highest priority.
  const queue = taskRows
    .map((task) => ({
      task,
      remaining: Math.max(0, task.estimatedMinutes - task.completedMinutes) * MINUTE,
    }))
    .filter((entry) => entry.remaining > 0)
    .sort((a, b) => a.task.dueAt - b.task.dueAt || b.task.priority - a.task.priority);

  const now = Date.now();

  for (let day = startOfLocalDay(Math.max(from, now), tz); day < to; day += DAY) {
    let free: Slot[] = [{ start: Math.max(day, now), end: day + DAY }];
    for (const block of busy) free = subtract(free, block);
    free = free
      .filter((slot) => slot.end - slot.start >= 15 * MINUTE)
      .sort((a, b) => a.start - b.start);

    let usedToday = 0;

    for (const slot of free) {
      let cursor = slot.start;
      while (cursor + 15 * MINUTE <= slot.end && usedToday < dailyCap) {
        const entry = queue.find((item) => item.remaining > 0 && item.task.dueAt > cursor);
        if (!entry) break;

        const available = Math.min(
          slot.end - cursor,
          sessionLength,
          entry.remaining,
          dailyCap - usedToday,
        );
        if (available < 15 * MINUTE) break;

        const block: Slot = { start: cursor, end: cursor + available };
        inserts.push({
          id: newId("evt"),
          userId,
          taskId: entry.task.id,
          title: entry.task.title,
          subject: entry.task.subject,
          category: "study",
          kind: entry.task.taskType,
          startAt: block.start,
          endAt: block.end,
          status: "planned",
          outcome: "planned",
          source: "auto",
          editable: true,
          pinned: false,
        });

        entry.remaining -= available;
        usedToday += available;
        cursor = block.end + breakLength;
      }
      if (usedToday >= dailyCap) break;
    }
  }

  for (const row of inserts) {
    await database.insert(schema.events).values(row);
  }

  return { created: inserts.length, removed: disposable.length };
}
