import { localDateKey, localDayTime } from "./time.ts";

/**
 * Deadlines live in Priorities. A line with a due date is linked to a task,
 * which is what the planner books prep for. These are the pure parts: what
 * kind of work a line is, how long it probably takes, and which task writes
 * a save needs.
 */

export type TaskType = "exam" | "assignment" | "study";

const EXAM = /\b(tests?|exams?|sacs?|quiz(zes)?|mid-?terms?|finals?|trials?|mocks?|assessments?)\b/i;
const ASSIGNMENT = /\b(essays?|assignments?|reports?|pracs?|projects?|drafts?|presentations?|homework|research|portfolio|lab)\b/i;

export function guessTaskType(title: string): TaskType {
  if (EXAM.test(title)) return "exam";
  if (ASSIGNMENT.test(title)) return "assignment";
  return "study";
}

/** A first guess at the prep a line needs, in minutes. The student can change it with one tap. */
export function guessMinutes(title: string, type: TaskType = guessTaskType(title)): number {
  if (/\bsacs?\b/i.test(title)) return 180;
  if (/\bquiz/i.test(title)) return 60;
  if (/\bessays?\b/i.test(title)) return 150;
  if (type === "exam") return 150;
  if (type === "assignment") return 120;
  return 60;
}

/** Exams are due at 9am, everything else by the end of the day, in the student's zone. */
export function dueAtFor(dueOn: string, type: TaskType, timezone: string): number {
  return localDayTime(dueOn, type === "exam" ? 9 * 60 : 23 * 60 + 59, timezone);
}

export interface SyncRow {
  id: string;
  text: string;
  subject: string | null;
  dueOn: string | null;
  done: boolean;
  /** Only when the student changed it on this save. */
  estimatedMinutes?: number;
}

export interface PreviousRow {
  taskId: string | null;
  text: string;
  subject: string | null;
  dueOn: string | null;
  done: boolean;
}

export interface LinkedTask {
  id: string;
  title: string;
  subject: string | null;
  estimatedMinutes: number;
  status: string;
}

export interface TaskInsert {
  id: string;
  title: string;
  subject: string | null;
  taskType: TaskType;
  dueAt: number;
  estimatedMinutes: number;
  status: "pending" | "completed";
  completedAt: number | null;
}

export interface TaskSync {
  creates: TaskInsert[];
  updates: Array<{ id: string; patch: Record<string, unknown> }>;
  deletes: string[];
  /** Line id to its task id, for every dated line after the save. */
  links: Map<string, string>;
}

const clampMinutes = (minutes: number) => Math.max(15, Math.min(1200, Math.round(minutes)));

export function planTaskSync(
  next: SyncRow[],
  previous: Map<string, PreviousRow>,
  tasks: Map<string, LinkedTask>,
  options: { timezone: string; now: number; newTaskId: () => string },
): TaskSync {
  const sync: TaskSync = { creates: [], updates: [], deletes: [], links: new Map() };
  const kept = new Set<string>();
  for (const row of next) {
    const before = previous.get(row.id);
    const existing = before?.taskId ? tasks.get(before.taskId) : undefined;
    const title = row.text.trim();
    if (!row.dueOn || !title) {
      if (existing) sync.deletes.push(existing.id);
      continue;
    }
    if (!existing) {
      const type = guessTaskType(title);
      const id = options.newTaskId();
      sync.creates.push({
        id,
        title: title.slice(0, 200),
        subject: row.subject,
        taskType: type,
        dueAt: dueAtFor(row.dueOn, type, options.timezone),
        estimatedMinutes: clampMinutes(row.estimatedMinutes ?? guessMinutes(title, type)),
        status: row.done ? "completed" : "pending",
        completedAt: row.done ? options.now : null,
      });
      sync.links.set(row.id, id);
      kept.add(id);
      continue;
    }
    kept.add(existing.id);
    sync.links.set(row.id, existing.id);
    const patch: Record<string, unknown> = {};
    if (title !== existing.title) patch.title = title.slice(0, 200);
    if (row.subject !== existing.subject) patch.subject = row.subject;
    // Only a date the student changed moves the deadline; a linked task keeps its exact time otherwise.
    if (row.dueOn !== before!.dueOn) {
      const type = guessTaskType(title);
      patch.dueAt = dueAtFor(row.dueOn, type, options.timezone);
    }
    if (row.estimatedMinutes !== undefined && clampMinutes(row.estimatedMinutes) !== existing.estimatedMinutes) {
      patch.estimatedMinutes = clampMinutes(row.estimatedMinutes);
    }
    const completed = existing.status === "completed";
    if (row.done !== completed) {
      patch.status = row.done ? "completed" : "pending";
      patch.completedAt = row.done ? options.now : null;
    }
    if (Object.keys(patch).length) sync.updates.push({ id: existing.id, patch });
  }
  // Lines deleted from the outline take their deadline with them.
  for (const before of previous.values()) {
    if (before.taskId && tasks.has(before.taskId) && !kept.has(before.taskId) && !sync.deletes.includes(before.taskId)) {
      sync.deletes.push(before.taskId);
    }
  }
  return sync;
}

/** Open tasks that no line points at yet, as lines to append: how existing deadlines move into Priorities. */
export function unlinkedTaskLines<T extends { id: string; title: string; subject: string | null; dueAt: number; status: string }>(
  tasks: T[],
  linked: Set<string>,
  timezone: string,
) {
  return tasks
    .filter((task) => task.status !== "completed" && !linked.has(task.id))
    .sort((a, b) => a.dueAt - b.dueAt)
    .map((task) => ({ id: `pri_${task.id}`.slice(0, 40), text: task.title, subject: task.subject, dueOn: localDateKey(task.dueAt, timezone), taskId: task.id }));
}
