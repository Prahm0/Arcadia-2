import { and, eq, max } from "drizzle-orm";
import { Hono } from "hono";
import { db, schema } from "../db";
import { newId } from "../lib/ids";
import { replan } from "../lib/replan";
import { lineXp } from "../lib/rewards";
import { serialiseDayItem, serialiseEvent } from "../lib/serialise";
import { MINUTE, localDayTime } from "../lib/time";
import type { Env, Variables } from "../types";

/**
 * Today as a note: the "Add to today..." line. The device reads the line
 * (lib/app/dayLine.ts) and sends what it found; this checks it and saves a
 * timed line as an event the planner works around, or an untimed one as a
 * day item. A pasted day comes in as a batch, and an edited line replaces
 * the old one.
 */
const today = new Hono<{ Bindings: Env; Variables: Variables }>();

/** How long a timed line with only a start ("SLC 10:50") holds in the timeline. */
const DEFAULT_MINUTES = 30;
const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/;

interface LineBody {
  day?: unknown;
  title?: unknown;
  subject?: unknown;
  start?: unknown;
  end?: unknown;
  evening?: unknown;
  note?: unknown;
  done?: unknown;
}

const minuteOf = (value: unknown) =>
  typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 24 * 60 ? value : null;
const text = (value: unknown, limit: number) => (typeof value === "string" ? value.trim().slice(0, limit) : "");

type Database = ReturnType<typeof db>;

interface LineContext {
  database: Database;
  userId: string;
  subjects: Set<string>;
  timezone: string;
  positions: Map<string, number>;
}

async function lineContext(database: Database, userId: string): Promise<LineContext> {
  const [subjectRows, profile] = await Promise.all([
    database.select({ name: schema.subjects.name }).from(schema.subjects).where(eq(schema.subjects.userId, userId)),
    database.select({ timezone: schema.profiles.timezone }).from(schema.profiles).where(eq(schema.profiles.userId, userId)).limit(1),
  ]);
  return { database, userId, subjects: new Set(subjectRows.map((row) => row.name)), timezone: profile[0]?.timezone ?? "Australia/Brisbane", positions: new Map() };
}

/**
 * Checks and saves one line: a timed one as an event the planner works
 * around, an untimed one as a day item. A line typed as done ("did chem till
 * 4:25", ✅) is saved done and earns its XP. Returns null with no replan; the
 * caller replans once for however many lines it saved.
 */
async function insertLine(context: LineContext, body: LineBody | null) {
  const { database, userId } = context;
  const day = typeof body?.day === "string" && DAY_KEY.test(body.day) ? body.day : null;
  const title = text(body?.title, 200);
  if (!day || !title) return { error: "Type something to add." } as const;
  const note = text(body?.note, 1000);
  const done = body?.done === true;
  // Only one of the student's own subjects counts; anything else is a life line.
  const subject = typeof body?.subject === "string" && context.subjects.has(body.subject) ? body.subject : null;

  const start = minuteOf(body?.start);
  if (start !== null && start < 24 * 60) {
    const end = minuteOf(body?.end);
    if (end !== null && end <= start) return { error: "The end needs to be after the start." } as const;
    const startAt = localDayTime(day, start, context.timezone);
    const endAt = end !== null ? localDayTime(day, end, context.timezone) : startAt + DEFAULT_MINUTES * MINUTE;
    const id = newId("evt");
    await database.insert(schema.events).values({
      id,
      userId,
      title,
      subject,
      // A line naming a subject is study (it counts and can block apps); anything else is life.
      category: subject ? "study" : "other",
      // "note-range" when the student gave an end, so Today shows both times.
      kind: end !== null ? "note-range" : "note",
      source: "note",
      startAt,
      endAt,
      editable: true,
      pinned: true,
      note,
      ...(done ? { status: "completed", outcome: "completed" } : {}),
    });
    const rewards = done ? await lineXp(database, userId, id, true) : [];
    const [row] = await database.select().from(schema.events).where(eq(schema.events.id, id)).limit(1);
    return { kind: "event", event: serialiseEvent(row), rewards, timed: true } as const;
  }

  if (!context.positions.has(day)) {
    const [last] = await database
      .select({ position: max(schema.dayItems.position) })
      .from(schema.dayItems)
      .where(and(eq(schema.dayItems.userId, userId), eq(schema.dayItems.day, day)));
    context.positions.set(day, last?.position ?? 0);
  }
  const position = context.positions.get(day)! + 1;
  context.positions.set(day, position);
  const id = newId("day");
  await database.insert(schema.dayItems).values({
    id,
    userId,
    day,
    text: title,
    subject,
    note,
    evening: body?.evening === true,
    position,
    done,
    doneAt: done ? Date.now() : null,
  });
  const rewards = done ? await lineXp(database, userId, id, true) : [];
  const [row] = await database.select().from(schema.dayItems).where(eq(schema.dayItems.id, id)).limit(1);
  return { kind: "item", item: serialiseDayItem(row), rewards, timed: false } as const;
}

today.post("/lines", async (c) => {
  const { userId } = c.get("session");
  const body = await c.req.json<LineBody>().catch(() => null);
  const database = db(c.env.DB);
  const saved = await insertLine(await lineContext(database, userId), body);
  if ("error" in saved) return c.json({ error: saved.error }, 422);
  // Arcadia's own blocks move out of the way of what the student wrote down.
  if (saved.timed) await replan(database, userId);
  return c.json(saved, 201);
});

/** A whole day pasted from Notes: every line saved, then one replan. */
today.post("/lines/batch", async (c) => {
  const { userId } = c.get("session");
  const body = await c.req.json<{ lines?: unknown }>().catch(() => null);
  if (!body || !Array.isArray(body.lines) || !body.lines.length) return c.json({ error: "Nothing to add." }, 400);
  if (body.lines.length > 60) return c.json({ error: "That's more than a day's worth. Paste up to 60 lines." }, 422);
  const database = db(c.env.DB);
  const context = await lineContext(database, userId);
  const saved = [];
  for (const line of body.lines as LineBody[]) {
    const result = await insertLine(context, line);
    if (!("error" in result)) saved.push(result);
  }
  if (saved.some((line) => line.timed)) await replan(database, userId);
  return c.json({ lines: saved, rewards: saved.flatMap((line) => line.rewards) }, 201);
});

/**
 * An edited line, re-read: the old one is replaced by the new, keeping its
 * note and whether it was done, so a line can gain or lose its time.
 */
today.put("/lines/:kind/:id", async (c) => {
  const { userId } = c.get("session");
  const kind = c.req.param("kind");
  const id = c.req.param("id");
  const body = await c.req.json<LineBody>().catch(() => null);
  const database = db(c.env.DB);
  let note = "";
  let done = false;
  if (kind === "item") {
    const [row] = await database.select().from(schema.dayItems).where(and(eq(schema.dayItems.id, id), eq(schema.dayItems.userId, userId))).limit(1);
    if (!row) return c.json({ error: "Not found." }, 404);
    ({ note, done } = row);
  } else if (kind === "event") {
    const [row] = await database.select().from(schema.events).where(and(eq(schema.events.id, id), eq(schema.events.userId, userId), eq(schema.events.source, "note"))).limit(1);
    if (!row) return c.json({ error: "Not found." }, 404);
    note = row.note;
    done = row.outcome === "completed";
  } else {
    return c.json({ error: "Not found." }, 404);
  }
  const saved = await insertLine(await lineContext(database, userId), { ...body, note, done });
  if ("error" in saved) return c.json({ error: saved.error }, 422);
  if (kind === "item") await database.delete(schema.dayItems).where(and(eq(schema.dayItems.id, id), eq(schema.dayItems.userId, userId)));
  else await database.delete(schema.events).where(and(eq(schema.events.id, id), eq(schema.events.userId, userId)));
  // The XP moved with the line rather than being earned twice.
  if (done) await database.delete(schema.xpEvents).where(and(eq(schema.xpEvents.userId, userId), eq(schema.xpEvents.source, "day_line"), eq(schema.xpEvents.sourceId, id)));
  await replan(database, userId);
  return c.json(saved);
});

today.patch("/items/:id", async (c) => {
  const { userId } = c.get("session");
  const body = await c.req.json<{ done?: unknown; day?: unknown; note?: unknown; text?: unknown }>().catch(() => null);
  if (!body) return c.json({ error: "Invalid request." }, 400);
  const patch: Partial<typeof schema.dayItems.$inferInsert> = {};
  if (typeof body.done === "boolean") {
    patch.done = body.done;
    patch.doneAt = body.done ? Date.now() : null;
  }
  if (typeof body.day === "string" && DAY_KEY.test(body.day)) patch.day = body.day;
  if (typeof body.note === "string") patch.note = text(body.note, 1000);
  if (typeof body.text === "string" && body.text.trim()) patch.text = text(body.text, 200);
  if (!Object.keys(patch).length) return c.json({ error: "Nothing to change." }, 422);

  const database = db(c.env.DB);
  const updated = await database
    .update(schema.dayItems)
    .set(patch)
    .where(and(eq(schema.dayItems.id, c.req.param("id")), eq(schema.dayItems.userId, userId)))
    .returning();
  if (!updated.length) return c.json({ error: "Not found." }, 404);
  const rewards = typeof body.done === "boolean" ? await lineXp(database, userId, updated[0].id, body.done) : [];
  return c.json({ item: serialiseDayItem(updated[0]), rewards });
});

today.delete("/items/:id", async (c) => {
  const { userId } = c.get("session");
  const removed = await db(c.env.DB)
    .delete(schema.dayItems)
    .where(and(eq(schema.dayItems.id, c.req.param("id")), eq(schema.dayItems.userId, userId)))
    .returning({ id: schema.dayItems.id });
  if (!removed.length) return c.json({ error: "Not found." }, 404);
  return c.json({ ok: true });
});

/** The sub-bullet under any line in the note, timed lines and Arcadia's blocks included. */
today.patch("/events/:id/note", async (c) => {
  const { userId } = c.get("session");
  const body = await c.req.json<{ note?: unknown }>().catch(() => null);
  if (typeof body?.note !== "string") return c.json({ error: "Invalid request." }, 400);
  const updated = await db(c.env.DB)
    .update(schema.events)
    .set({ note: text(body.note, 1000) })
    .where(and(eq(schema.events.id, c.req.param("id")), eq(schema.events.userId, userId)))
    .returning();
  if (!updated.length) return c.json({ error: "Not found." }, 404);
  return c.json({ event: serialiseEvent(updated[0]) });
});

export default today;
