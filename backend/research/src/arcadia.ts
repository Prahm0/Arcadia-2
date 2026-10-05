/**
 * Runs Arcadia's real scheduler (commit f179689, rules only, no AI layout)
 * on a synthetic week. Builds the same ScheduleInputs the database would
 * give it, then calls groundwork() and planStudy() exactly as
 * rebuildSchedule() does, minus the database write.
 */
import { groundwork, planStudy, type ScheduleInputs } from "../../src/lib/scheduler.ts";
import { DAY as ADAY, startOfLocalDay, startOfLocalWeek } from "../../src/lib/time.ts";
import type { Block, CommitmentSpec, Instance, RepairMethod, RepairState, TaskSpec } from "./types.ts";
import { MINUTE } from "./types.ts";

const USER = "u_research";

function profileOf(instance: Instance) {
  return {
    userId: USER,
    timezone: instance.tz,
    bedtime: instance.bedtime,
    wakeTime: instance.wake,
    maxDailyStudyMinutes: instance.cap,
    preferredSessionMinutes: instance.session,
    breakMinutes: instance.breakMinutes,
    grade: "Year 12",
    state: null,
    minimumSleepMinutes: 480,
  };
}

function commitmentRows(commitments: CommitmentSpec[]) {
  return commitments.map((c) => ({
    id: c.id,
    userId: USER,
    title: c.title,
    category: c.category,
    recurrence: c.recurrence,
    weekday: c.weekday,
    startDate: c.date,
    startTime: c.start,
    endTime: c.end,
    notes: null,
  }));
}

function taskRows(tasks: TaskSpec[], done: Map<string, number>) {
  return tasks.map((t) => ({
    id: t.id,
    userId: USER,
    title: t.title,
    subject: t.subject,
    taskType: "assignment",
    dueAt: t.dueAt,
    estimatedMinutes: t.minutes,
    completedMinutes: Math.min(t.minutes, Math.round(done.get(t.id) ?? 0)),
    priority: t.priority,
    status: "pending",
  }));
}

function eventRow(block: Block, outcome: "planned" | "completed" | "missed", title: string) {
  return {
    id: block.id,
    userId: USER,
    taskId: block.taskId,
    commitmentId: null,
    title,
    subject: block.subject,
    category: "study",
    kind: block.taskId ? "assignment" : "subject",
    startAt: block.start,
    endAt: block.end,
    status: outcome,
    outcome,
    source: "auto",
    editable: true,
    pinned: outcome !== "planned",
    movedFrom: null,
  };
}

function run(
  instance: Instance,
  commitments: CommitmentSpec[],
  tasks: TaskSpec[],
  done: Map<string, number>,
  events: ReturnType<typeof eventRow>[],
  now: number,
): Block[] {
  const tz = instance.tz;
  // replan(): the next 28 days from the start of today.
  const from = startOfLocalDay(now, tz);
  const to = from + 28 * ADAY;
  const weekStart = startOfLocalWeek(now, tz);
  const inputs = {
    profile: profileOf(instance),
    existing: events.filter((e) => e.startAt >= from && e.startAt <= to),
    commitments: commitmentRows(commitments),
    // Only pending tasks with work left, as loadScheduleInputs loads them.
    tasks: taskRows(tasks, done).filter((t) => t.completedMinutes < t.estimatedMinutes),
    subjects: instance.subjects.map((s, i) => ({
      id: `s${i}`, userId: USER, name: s.name, weeklyMinutes: s.weekly, priority: s.priority,
    })),
    earlierThisWeek: events.filter((e) => e.startAt >= weekStart && e.startAt < from && e.outcome === "completed"),
    sessions: [],
    monthPlanRaw: undefined,
    layoutRow: undefined,
  } as unknown as ScheduleInputs;

  const g = groundwork(USER, inputs, from, to, now);
  const { planned } = planStudy(USER, inputs, g);
  return planned
    .filter((row) => row.category === "study" && row.startAt >= now)
    .map((row, i) => ({
      id: `a${i}`,
      start: row.startAt,
      end: row.endAt,
      taskId: row.taskId ?? null,
      subject: row.subject ?? null,
      fixed: false,
    }));
}

/** The starting plan: what Arcadia books when the horizon begins. */
export function startingPlan(instance: Instance): Block[] {
  return run(instance, instance.commitments, instance.tasks, new Map(), [], instance.start);
}

/** M2: Arcadia's existing rebuild, as replan() runs it after a recovery. */
export const arcadiaRebuild: RepairMethod = {
  code: "M2",
  name: "Current Arcadia rebuild",
  repair(state: RepairState): Block[] {
    const events = [
      ...state.fixed.map((b) =>
        eventRow(b, b.id === state.missedBlockId ? "missed" : b.end <= state.now ? "completed" : "planned", "Study"),
      ),
      ...state.current.map((b) => eventRow(b, "planned", "Study")),
    ];
    return run(state.instance, state.commitments, state.tasks, state.done, events, state.now);
  },
};

export { MINUTE };
