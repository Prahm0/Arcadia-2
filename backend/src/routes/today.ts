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
 * day item.
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
}

const minuteOf = (value: unknown) =>
  typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 24 * 60 ? value : null;
const text = (value: unknown, limit: number) => (typeof value === "string" ? value.trim().slice(0, limit) : "");

today.post("/lines", async (c) => {
  const { userId } = c.get("session");
  const body = await c.req.json<LineBody>().catch(() => null);
  const day = typeof body?.day === "string" && DAY_KEY.test(body.day) ? body.day : null;
  const title = text(body?.title, 200);
  if (!day || !title) return c.json({ error: "Type something to add." }, 422);
  const note = text(body?.note, 1000);

  const database = db(c.env.DB);
  // Only one of the student's own subjects counts; anything else is a life line.
  let subject: string | null = null;
  if (typeof body?.subject === "string" && body.subject) {
    const [match] = await database
      .select({ name: schema.subjects.name })
      .from(schema.subjects)
      .where(and(eq(schema.subjects.userId, userId), eq(schema.subjects.name, body.subject)))
      .limit(1);
    subject = match?.name ?? null;
  }

  const start = minuteOf(body?.start);
  if (start !== null && start < 24 * 60) {
    const end = minuteOf(body?.end);
    if (end !== null && end <= start) return c.json({ error: "The end needs to be after the start." }, 422);
    const [profile] = await database
      .select({ timezone: schema.profiles.timezone })
      .from(schema.profiles)
      .where(eq(schema.profiles.userId, userId))
      .limit(1);
    const timezone = profile?.timezone ?? "Australia/Brisbane";
    const startAt = localDayTime(day, start, timezone);
    const endAt = end !== null ? localDayTime(day, end, timezone) : startAt + DEFAULT_MINUTES * MINUTE;
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
    });
    // Arcadia's own blocks move out of the way of what the student wrote down.
    await replan(database, userId);
    const [row] = await database.select().from(schema.events).where(eq(schema.events.id, id)).limit(1);
    return c.json({ kind: "event", event: serialiseEvent(row) }, 201);
  }

  const [last] = await database
    .select({ position: max(schema.dayItems.position) })
    .from(schema.dayItems)
    .where(and(eq(schema.dayItems.userId, userId), eq(schema.dayItems.day, day)));
  const id = newId("day");
  await database.insert(schema.dayItems).values({
    id,
    userId,
    day,
    text: title,
    subject,
    note,
    evening: body?.evening === true,
    position: (last?.position ?? 0) + 1,
  });
  const [row] = await database.select().from(schema.dayItems).where(eq(schema.dayItems.id, id)).limit(1);
  return c.json({ kind: "item", item: serialiseDayItem(row) }, 201);
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
