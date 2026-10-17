import { and, eq, inArray } from "drizzle-orm";
import { Hono } from "hono";
import { db, schema, type Database } from "../db";
import { newId } from "../lib/ids";
import { loadPriorities, type PriorityRow } from "../lib/priorities";
import { planTaskSync, unlinkedTaskLines, type LinkedTask } from "../lib/priority-tasks";
import { replan } from "../lib/replan";
import type { Env, Variables } from "../types";

/**
 * Priorities: the student's nested list (Area > Subject > Task), and their
 * deadlines. The page holds the whole outline and saves it at once, in
 * outline order, which keeps indenting, moving and pasting simple and never
 * leaves half an outline saved. A line with a due date is linked to a task,
 * which the planner books prep for (lib/priority-tasks).
 */
const priorities = new Hono<{ Bindings: Env; Variables: Variables }>();

const MAX_ITEMS = 1000;
const MAX_DEPTH = 6;
const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/;
const ID = /^[A-Za-z0-9_-]{1,40}$/;
/** D1 allows 100 bound values a statement; a row has 11. */
const ROWS_PER_INSERT = 9;

interface ItemInput {
  id?: unknown;
  parentId?: unknown;
  text?: unknown;
  subject?: unknown;
  dueOn?: unknown;
  done?: unknown;
  estimatedMinutes?: unknown;
}

type TaskRow = typeof schema.tasks.$inferSelect;

function serialise(row: PriorityRow, tasks: Map<string, TaskRow>) {
  const task = row.taskId ? tasks.get(row.taskId) : undefined;
  return {
    id: row.id, parentId: row.parentId, text: row.text, subject: row.subject, dueOn: row.dueOn, done: row.done,
    ...(task ? { estimatedMinutes: task.estimatedMinutes, prepDoneMinutes: task.completedMinutes } : {}),
  };
}

async function loadContext(database: Database, userId: string) {
  const [taskRows, profile] = await Promise.all([
    database.select().from(schema.tasks).where(eq(schema.tasks.userId, userId)),
    database.select({ timezone: schema.profiles.timezone }).from(schema.profiles).where(eq(schema.profiles.userId, userId)).limit(1),
  ]);
  return { tasks: new Map(taskRows.map((task) => [task.id, task])), timezone: profile[0]?.timezone ?? "Australia/Brisbane" };
}

priorities.get("/", async (c) => {
  const { userId } = c.get("session");
  const database = db(c.env.DB);
  const [rows, { tasks, timezone }] = await Promise.all([loadPriorities(database, userId), loadContext(database, userId)]);

  // Deadlines added anywhere else (Arcad, onboarding, an older app) join the list at the end.
  const linked = new Set(rows.map((row) => row.taskId).filter((id): id is string => Boolean(id)));
  const taken = new Set(rows.map((row) => row.id));
  const additions = unlinkedTaskLines([...tasks.values()], linked, timezone).filter((line) => !taken.has(line.id));
  const writes: unknown[] = [];
  let position = rows.length;
  for (const line of additions) {
    const row: PriorityRow = { ...line, userId, parentId: null, position: position++, done: false, doneAt: null, createdAt: Date.now() };
    rows.push(row);
    writes.push(database.insert(schema.priorities).values(row));
  }
  // A deadline deleted elsewhere leaves the line as a plain priority.
  for (const row of rows) {
    if (row.taskId && !tasks.has(row.taskId)) {
      writes.push(database.update(schema.priorities).set({ taskId: null, dueOn: null }).where(and(eq(schema.priorities.id, row.id), eq(schema.priorities.userId, userId))));
      row.taskId = null;
      row.dueOn = null;
    }
  }
  if (writes.length) await database.batch(writes as unknown as Parameters<Database["batch"]>[0]);
  return c.json({ items: rows.map((row) => serialise(row, tasks)) });
});

priorities.put("/", async (c) => {
  const { userId } = c.get("session");
  const body = await c.req.json<{ items?: unknown }>().catch(() => null);
  if (!body || !Array.isArray(body.items)) return c.json({ error: "Invalid request." }, 400);
  if (body.items.length > MAX_ITEMS) return c.json({ error: `Priorities hold up to ${MAX_ITEMS} lines.` }, 422);

  const database = db(c.env.DB);
  const [subjectRows, existing, { tasks, timezone }] = await Promise.all([
    database.select({ name: schema.subjects.name }).from(schema.subjects).where(eq(schema.subjects.userId, userId)),
    loadPriorities(database, userId),
    loadContext(database, userId),
  ]);
  const subjects = new Set(subjectRows.map((row) => row.name));
  const doneAt = new Map(existing.map((row) => [row.id, row.doneAt]));

  // Outline order: a parent always comes before its children.
  const depth = new Map<string, number>();
  const rows: Array<typeof schema.priorities.$inferInsert> = [];
  const estimates = new Map<string, number>();
  const now = Date.now();
  for (const [index, raw] of (body.items as ItemInput[]).entries()) {
    if (!raw || typeof raw.id !== "string" || !ID.test(raw.id) || depth.has(raw.id)) {
      return c.json({ error: "Each line needs its own id." }, 422);
    }
    const parentId = typeof raw.parentId === "string" ? raw.parentId : null;
    if (parentId !== null && !depth.has(parentId)) return c.json({ error: "A line's parent has to come before it." }, 422);
    const level = parentId === null ? 0 : depth.get(parentId)! + 1;
    if (level > MAX_DEPTH) return c.json({ error: "That's nested too deep." }, 422);
    depth.set(raw.id, level);
    const done = raw.done === true;
    if (typeof raw.estimatedMinutes === "number" && Number.isFinite(raw.estimatedMinutes)) estimates.set(raw.id, raw.estimatedMinutes);
    rows.push({
      id: raw.id,
      userId,
      parentId,
      position: index,
      text: typeof raw.text === "string" ? raw.text.slice(0, 500) : "",
      subject: typeof raw.subject === "string" && subjects.has(raw.subject) ? raw.subject : null,
      dueOn: typeof raw.dueOn === "string" && DAY_KEY.test(raw.dueOn) ? raw.dueOn : null,
      done,
      doneAt: done ? doneAt.get(raw.id) ?? now : null,
    });
  }

  const sync = planTaskSync(
    rows.map((row) => ({ id: row.id, text: row.text ?? "", subject: row.subject ?? null, dueOn: row.dueOn ?? null, done: row.done ?? false, estimatedMinutes: estimates.get(row.id) })),
    new Map(existing.map((row) => [row.id, row])),
    new Map([...tasks.values()].map((task): [string, LinkedTask] => [task.id, task])),
    { timezone, now, newTaskId: () => newId("tsk") },
  );
  for (const row of rows) row.taskId = sync.links.get(row.id) ?? null;

  const taskWrites: unknown[] = [
    ...sync.creates.map((task) => database.insert(schema.tasks).values({ ...task, userId })),
    ...sync.updates.map(({ id, patch }) => database.update(schema.tasks).set(patch).where(and(eq(schema.tasks.id, id), eq(schema.tasks.userId, userId)))),
  ];
  if (sync.deletes.length) {
    // Prep still to come goes with the deadline; blocks already studied stay in the history.
    taskWrites.push(
      database.delete(schema.events).where(and(eq(schema.events.userId, userId), inArray(schema.events.taskId, sync.deletes), eq(schema.events.outcome, "planned"))),
      database.delete(schema.tasks).where(and(eq(schema.tasks.userId, userId), inArray(schema.tasks.id, sync.deletes))),
    );
  }
  await replaceAll(database, userId, rows, taskWrites);
  // New or moved deadlines get their prep booked straight away.
  if (taskWrites.length) await replan(database, userId);
  return c.json({ ok: true, count: rows.length });
});

/** Swap the student's outline for the new one in a single batch, so a failure changes nothing. */
async function replaceAll(database: Database, userId: string, rows: Array<typeof schema.priorities.$inferInsert>, extra: unknown[] = []) {
  const writes: unknown[] = [...extra, database.delete(schema.priorities).where(eq(schema.priorities.userId, userId))];
  for (let index = 0; index < rows.length; index += ROWS_PER_INSERT) {
    writes.push(database.insert(schema.priorities).values(rows.slice(index, index + ROWS_PER_INSERT)));
  }
  await database.batch(writes as unknown as Parameters<Database["batch"]>[0]);
}

export default priorities;
