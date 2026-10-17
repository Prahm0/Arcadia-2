import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { db, schema, type Database } from "../db";
import { loadPriorities } from "../lib/priorities";
import type { Env, Variables } from "../types";

/**
 * Priorities: the student's nested list (Area > Subject > Task). The page
 * holds the whole outline and saves it at once, in outline order, which keeps
 * indenting, moving and pasting simple and never leaves half an outline saved.
 */
const priorities = new Hono<{ Bindings: Env; Variables: Variables }>();

const MAX_ITEMS = 1000;
const MAX_DEPTH = 6;
const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/;
const ID = /^[A-Za-z0-9_-]{1,40}$/;
/** D1 allows 100 bound values a statement; a row has 10. */
const ROWS_PER_INSERT = 9;

interface ItemInput {
  id?: unknown;
  parentId?: unknown;
  text?: unknown;
  subject?: unknown;
  dueOn?: unknown;
  done?: unknown;
}

function serialise(row: typeof schema.priorities.$inferSelect) {
  return { id: row.id, parentId: row.parentId, text: row.text, subject: row.subject, dueOn: row.dueOn, done: row.done };
}

priorities.get("/", async (c) => {
  const { userId } = c.get("session");
  const rows = await loadPriorities(db(c.env.DB), userId);
  return c.json({ items: rows.map(serialise) });
});

priorities.put("/", async (c) => {
  const { userId } = c.get("session");
  const body = await c.req.json<{ items?: unknown }>().catch(() => null);
  if (!body || !Array.isArray(body.items)) return c.json({ error: "Invalid request." }, 400);
  if (body.items.length > MAX_ITEMS) return c.json({ error: `Priorities hold up to ${MAX_ITEMS} lines.` }, 422);

  const database = db(c.env.DB);
  const [subjectRows, existing] = await Promise.all([
    database.select({ name: schema.subjects.name }).from(schema.subjects).where(eq(schema.subjects.userId, userId)),
    loadPriorities(database, userId),
  ]);
  const subjects = new Set(subjectRows.map((row) => row.name));
  const doneAt = new Map(existing.map((row) => [row.id, row.doneAt]));

  // Outline order: a parent always comes before its children.
  const depth = new Map<string, number>();
  const rows: Array<typeof schema.priorities.$inferInsert> = [];
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

  await replaceAll(database, userId, rows);
  return c.json({ ok: true, count: rows.length });
});

/** Swap the student's outline for the new one in a single batch, so a failure changes nothing. */
async function replaceAll(database: Database, userId: string, rows: Array<typeof schema.priorities.$inferInsert>) {
  const writes: unknown[] = [database.delete(schema.priorities).where(eq(schema.priorities.userId, userId))];
  for (let index = 0; index < rows.length; index += ROWS_PER_INSERT) {
    writes.push(database.insert(schema.priorities).values(rows.slice(index, index + ROWS_PER_INSERT)));
  }
  await database.batch(writes as unknown as Parameters<Database["batch"]>[0]);
}

export default priorities;
