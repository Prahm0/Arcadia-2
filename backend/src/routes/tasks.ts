import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import { db, schema } from "../db";
import { newId } from "../lib/ids";
import { replan } from "../lib/replan";
import { serialiseTask } from "../lib/serialise";
import type { Env, Variables } from "../types";

const tasks = new Hono<{ Bindings: Env; Variables: Variables }>();
const TASK_NOTES_LIMIT = 2000;

interface TaskBody {
  title?: string;
  subject?: string | null;
  notes?: string;
  taskType?: string;
  dueAt?: string;
  estimatedMinutes?: number;
  priority?: number;
  status?: string;
}

tasks.get("/", async (c) => {
  const { userId } = c.get("session");
  const rows = await db(c.env.DB)
    .select()
    .from(schema.tasks)
    .where(eq(schema.tasks.userId, userId));
  return c.json({ tasks: rows.sort((a, b) => a.dueAt - b.dueAt).map(serialiseTask) });
});

tasks.post("/", async (c) => {
  const { userId } = c.get("session");
  const body = await c.req.json<TaskBody>().catch(() => null);
  if (!body) return c.json({ error: "Invalid request." }, 400);

  const title = String(body.title ?? "").trim().slice(0, 200);
  if (!title) return c.json({ error: "Give the task a title." }, 422);

  const dueAt = Date.parse(String(body.dueAt ?? ""));
  if (Number.isNaN(dueAt)) return c.json({ error: "Give the task a due date." }, 422);

  const database = db(c.env.DB);
  const id = newId("tsk");
  const subject = await resolveSubject(database, userId, body.subject);
  await database.insert(schema.tasks).values({
    id,
    userId,
    title,
    subject,
    taskType: body.taskType ?? "study",
    dueAt,
    estimatedMinutes: clamp(body.estimatedMinutes, 15, 1200, 60),
    priority: clamp(body.priority, 1, 5, 2),
  });

  await replan(database, userId);
  return c.json({ ok: true, id }, 201);
});

tasks.patch("/:id", async (c) => {
  const { userId } = c.get("session");
  const id = c.req.param("id");
  const body = await c.req.json<TaskBody>().catch(() => null);
  if (!body) return c.json({ error: "Invalid request." }, 400);

  const database = db(c.env.DB);
  const [existing] = await database
    .select()
    .from(schema.tasks)
    .where(and(eq(schema.tasks.id, id), eq(schema.tasks.userId, userId)))
    .limit(1);
  if (!existing) return c.json({ error: "Task not found." }, 404);

  const patch: Partial<typeof schema.tasks.$inferInsert> = {};
  if (typeof body.title === "string" && body.title.trim()) {
    patch.title = body.title.trim().slice(0, 200);
  }
  if ("subject" in body) patch.subject = await resolveSubject(database, userId, body.subject);
  if (typeof body.notes === "string") patch.notes = body.notes.slice(0, TASK_NOTES_LIMIT);
  if (typeof body.taskType === "string") patch.taskType = body.taskType;
  if (typeof body.dueAt === "string") {
    const dueAt = Date.parse(body.dueAt);
    if (!Number.isNaN(dueAt)) patch.dueAt = dueAt;
  }
  if (body.estimatedMinutes !== undefined) {
    patch.estimatedMinutes = clamp(body.estimatedMinutes, 15, 1200, existing.estimatedMinutes);
  }
  if (body.priority !== undefined) {
    patch.priority = clamp(body.priority, 1, 5, existing.priority);
  }
  if (typeof body.status === "string" && ["pending", "complete", "cancelled"].includes(body.status)) {
    patch.status = body.status;
    if (body.status !== existing.status) patch.completedAt = body.status === "complete" ? Date.now() : null;
  }

  if (Object.keys(patch).length > 0) {
    await database.update(schema.tasks).set(patch).where(eq(schema.tasks.id, id));
  }

  if (Object.keys(patch).some((key) => key !== "notes")) {
    await replan(database, userId);
  }
  return c.json({ ok: true });
});

tasks.delete("/:id", async (c) => {
  const { userId } = c.get("session");
  const id = c.req.param("id");
  const database = db(c.env.DB);

  const [existing] = await database
    .select({ id: schema.tasks.id })
    .from(schema.tasks)
    .where(and(eq(schema.tasks.id, id), eq(schema.tasks.userId, userId)))
    .limit(1);
  if (!existing) return c.json({ error: "Task not found." }, 404);

  // Its scheduled blocks go with it, as the confirm dialog promises.
  await database
    .delete(schema.events)
    .where(and(eq(schema.events.userId, userId), eq(schema.events.taskId, id)));
  await database.delete(schema.tasks).where(eq(schema.tasks.id, id));

  await replan(db(c.env.DB), userId);
  return c.json({ ok: true });
});

function clamp(value: unknown, min: number, max: number, fallback: number): number {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(max, Math.max(min, Math.round(numeric)));
}

/** Canonicalise existing names and turn an inline task subject into a real subject. */
async function resolveSubject(
  database: ReturnType<typeof db>,
  userId: string,
  value: string | null | undefined,
): Promise<string | null> {
  const name = typeof value === "string" ? value.trim().slice(0, 80) : "";
  if (!name) return null;
  const subjects = await database
    .select({ name: schema.subjects.name })
    .from(schema.subjects)
    .where(eq(schema.subjects.userId, userId));
  const existing = subjects.find((subject) => subject.name.toLowerCase() === name.toLowerCase());
  if (existing) return existing.name;
  await database.insert(schema.subjects).values({ id: newId("sub"), userId, name });
  return name;
}

export default tasks;
