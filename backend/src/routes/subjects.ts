import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import { db, schema } from "../db";
import { newId } from "../lib/ids";
import { replan } from "../lib/replan";
import { subjectKey } from "../lib/scheduler";
import type { Env, Variables } from "../types";

const MAX_SUBJECTS = 20;
const WEEKLY_MAX = 1200;
const NOTES_LIMIT = 2000;

interface SubjectBody {
  name?: string;
  colour?: string | null;
  /** Minutes a week; null goes back to the year-level suggestion. */
  weeklyMinutes?: number | null;
  targetGrade?: string | null;
  notes?: string;
}

const subjects = new Hono<{ Bindings: Env; Variables: Variables }>();

function cleanName(value: unknown): string {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, 80);
}

function cleanColour(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  return /^#[0-9a-f]{6}$/i.test(String(value)) ? String(value) : undefined;
}

function cleanWeekly(value: unknown): number | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const minutes = Number(value);
  if (!Number.isFinite(minutes)) return undefined;
  return Math.min(WEEKLY_MAX, Math.max(0, Math.round(minutes)));
}

subjects.post("/", async (c) => {
  const { userId } = c.get("session");
  const body = await c.req.json<SubjectBody>().catch(() => null);
  if (!body) return c.json({ error: "Invalid request." }, 400);

  const name = cleanName(body.name);
  if (!name) return c.json({ error: "Give the subject a name." }, 422);

  const database = db(c.env.DB);
  const existing = await database
    .select({ name: schema.subjects.name })
    .from(schema.subjects)
    .where(eq(schema.subjects.userId, userId));
  if (existing.length >= MAX_SUBJECTS) return c.json({ error: "That's the most subjects Arcadia can plan." }, 422);
  if (existing.some((row) => subjectKey(row.name) === subjectKey(name))) {
    return c.json({ error: `You already have ${name}.` }, 409);
  }

  const id = newId("sub");
  await database.insert(schema.subjects).values({
    id,
    userId,
    name,
    colour: cleanColour(body.colour) ?? null,
    weeklyMinutes: cleanWeekly(body.weeklyMinutes) ?? null,
    targetGrade: body.targetGrade ? String(body.targetGrade).trim().slice(0, 16) || null : null,
    notes: String(body.notes ?? "").slice(0, NOTES_LIMIT),
  });

  await replan(database, userId);
  return c.json({ ok: true, id }, 201);
});

subjects.patch("/:id", async (c) => {
  const { userId } = c.get("session");
  const id = c.req.param("id");
  const body = await c.req.json<SubjectBody>().catch(() => null);
  if (!body) return c.json({ error: "Invalid request." }, 400);

  const database = db(c.env.DB);
  const [subject] = await database
    .select()
    .from(schema.subjects)
    .where(and(eq(schema.subjects.id, id), eq(schema.subjects.userId, userId)))
    .limit(1);
  if (!subject) return c.json({ error: "Subject not found." }, 404);

  const patch: Partial<typeof schema.subjects.$inferInsert> = {};

  let renamedFrom: string | null = null;
  if (body.name !== undefined) {
    const name = cleanName(body.name);
    if (!name) return c.json({ error: "Give the subject a name." }, 422);
    if (name !== subject.name) {
      const others = await database
        .select({ id: schema.subjects.id, name: schema.subjects.name })
        .from(schema.subjects)
        .where(eq(schema.subjects.userId, userId));
      if (others.some((row) => row.id !== id && subjectKey(row.name) === subjectKey(name))) {
        return c.json({ error: `You already have ${name}.` }, 409);
      }
      patch.name = name;
      renamedFrom = subject.name;
    }
  }
  if (body.colour !== undefined) {
    const colour = cleanColour(body.colour);
    if (colour === undefined) return c.json({ error: "Unknown colour." }, 422);
    patch.colour = colour;
  }
  if (body.weeklyMinutes !== undefined) {
    const weekly = cleanWeekly(body.weeklyMinutes);
    if (weekly === undefined) return c.json({ error: "Use a number of minutes." }, 422);
    patch.weeklyMinutes = weekly;
  }
  if (body.targetGrade !== undefined) {
    patch.targetGrade = body.targetGrade ? String(body.targetGrade).trim().slice(0, 16) || null : null;
  }
  if (body.notes !== undefined) patch.notes = String(body.notes).slice(0, NOTES_LIMIT);

  if (Object.keys(patch).length === 0) return c.json({ ok: true });

  const writes = [
    database.update(schema.subjects).set(patch).where(eq(schema.subjects.id, id)),
    // Tasks, blocks and focus history refer to subjects by name, so a rename
    // carries through or last week's Literature stops counting as Literature.
    ...(renamedFrom && patch.name
      ? [
          database
            .update(schema.tasks)
            .set({ subject: patch.name })
            .where(and(eq(schema.tasks.userId, userId), eq(schema.tasks.subject, renamedFrom))),
          database
            .update(schema.events)
            .set({ subject: patch.name })
            .where(and(eq(schema.events.userId, userId), eq(schema.events.subject, renamedFrom))),
          database
            .update(schema.studySessions)
            .set({ subject: patch.name })
            .where(
              and(
                eq(schema.studySessions.userId, userId),
                eq(schema.studySessions.subject, renamedFrom),
              ),
            ),
        ]
      : []),
  ];
  await database.batch(writes as [(typeof writes)[number], ...(typeof writes)[number][]]);

  if (patch.name !== undefined || patch.weeklyMinutes !== undefined) await replan(database, userId);
  return c.json({ ok: true });
});

subjects.delete("/:id", async (c) => {
  const { userId } = c.get("session");
  const id = c.req.param("id");
  const database = db(c.env.DB);

  const [subject] = await database
    .select({ id: schema.subjects.id })
    .from(schema.subjects)
    .where(and(eq(schema.subjects.id, id), eq(schema.subjects.userId, userId)))
    .limit(1);
  if (!subject) return c.json({ error: "Subject not found." }, 404);

  // Its planned study blocks go on the replan; tasks and past sessions keep
  // their subject label as history.
  await database.delete(schema.subjects).where(eq(schema.subjects.id, id));
  await replan(database, userId);
  return c.json({ ok: true });
});

export default subjects;
