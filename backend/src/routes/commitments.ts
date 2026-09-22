import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import { db, schema } from "../db";
import { newId } from "../lib/ids";
import { replan } from "../lib/replan";
import { serialiseCommitment } from "../lib/serialise";
import { parseClock } from "../lib/time";
import type { Env, Variables } from "../types";

const CATEGORIES = ["school", "sport", "extracurricular", "study", "sleep", "other"];
// "weekdays" is Mon–Fri, the shape most school timetables take.
const RECURRENCES = ["none", "daily", "weekly", "weekdays"];

interface CommitmentBody {
  title?: string;
  category?: string;
  recurrence?: string;
  weekday?: number | null;
  startDate?: string | null;
  startTime?: string;
  endTime?: string;
  notes?: string;
}

const commitments = new Hono<{ Bindings: Env; Variables: Variables }>();

commitments.get("/", async (c) => {
  const { userId } = c.get("session");
  const rows = await db(c.env.DB)
    .select()
    .from(schema.commitments)
    .where(eq(schema.commitments.userId, userId));
  return c.json({ commitments: rows.map(serialiseCommitment) });
});

function validate(body: CommitmentBody): string | null {
  if (!String(body.title ?? "").trim()) return "Give the commitment a title.";
  const start = parseClock(body.startTime);
  const end = parseClock(body.endTime);
  if (start === null || end === null) return "Use HH:MM for the start and end time.";
  if (end <= start) return "The end time has to be after the start time.";
  if (body.category && !CATEGORIES.includes(body.category)) return "Unknown category.";
  if (body.recurrence && !RECURRENCES.includes(body.recurrence)) return "Unknown recurrence.";
  if (body.recurrence === "weekly" && (body.weekday === null || body.weekday === undefined)) {
    return "Pick a day of the week.";
  }
  return null;
}

commitments.post("/", async (c) => {
  const { userId } = c.get("session");
  const body = await c.req.json<CommitmentBody>().catch(() => null);
  if (!body) return c.json({ error: "Invalid request." }, 400);

  const problem = validate(body);
  if (problem) return c.json({ error: problem }, 422);

  const id = newId("cmt");
  await db(c.env.DB).insert(schema.commitments).values({
    id,
    userId,
    title: body.title!.trim().slice(0, 200),
    category: body.category ?? "other",
    recurrence: body.recurrence ?? "weekly",
    weekday: typeof body.weekday === "number" ? body.weekday : null,
    startDate: body.startDate ?? null,
    startTime: body.startTime!,
    endTime: body.endTime!,
    notes: String(body.notes ?? "").slice(0, 1000),
  });

  await replan(db(c.env.DB), userId);
  return c.json({ ok: true, id }, 201);
});

commitments.patch("/:id", async (c) => {
  const { userId } = c.get("session");
  const id = c.req.param("id");
  const body = await c.req.json<CommitmentBody>().catch(() => null);
  if (!body) return c.json({ error: "Invalid request." }, 400);

  const problem = validate(body);
  if (problem) return c.json({ error: problem }, 422);

  const database = db(c.env.DB);
  const [existing] = await database
    .select({ id: schema.commitments.id })
    .from(schema.commitments)
    .where(and(eq(schema.commitments.id, id), eq(schema.commitments.userId, userId)))
    .limit(1);
  if (!existing) return c.json({ error: "Commitment not found." }, 404);

  await database
    .update(schema.commitments)
    .set({
      title: body.title!.trim().slice(0, 200),
      category: body.category ?? "other",
      recurrence: body.recurrence ?? "weekly",
      weekday: typeof body.weekday === "number" ? body.weekday : null,
      startDate: body.startDate ?? null,
      startTime: body.startTime!,
      endTime: body.endTime!,
      notes: String(body.notes ?? "").slice(0, 1000),
    })
    .where(eq(schema.commitments.id, id));

  await replan(database, userId);
  return c.json({ ok: true });
});

commitments.delete("/:id", async (c) => {
  const { userId } = c.get("session");
  const id = c.req.param("id");
  const database = db(c.env.DB);

  const [existing] = await database
    .select({ id: schema.commitments.id })
    .from(schema.commitments)
    .where(and(eq(schema.commitments.id, id), eq(schema.commitments.userId, userId)))
    .limit(1);
  if (!existing) return c.json({ error: "Commitment not found." }, 404);

  await database
    .delete(schema.events)
    .where(and(eq(schema.events.userId, userId), eq(schema.events.commitmentId, id)));
  await database.delete(schema.commitments).where(eq(schema.commitments.id, id));

  await replan(database, userId);
  return c.json({ ok: true });
});

export default commitments;
