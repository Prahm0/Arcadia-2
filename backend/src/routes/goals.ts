import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import { db, schema } from "../db";
import { newId } from "../lib/ids";
import type { Env, Variables } from "../types";

const MAX_GOALS = 20;

const goals = new Hono<{ Bindings: Env; Variables: Variables }>();

function cleanTitle(value: unknown): string {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, 160);
}

goals.post("/", async (c) => {
  const { userId } = c.get("session");
  const body = await c.req.json<{ title?: string }>().catch(() => null);
  const title = cleanTitle(body?.title);
  if (!title) return c.json({ error: "Write the goal first." }, 422);

  const database = db(c.env.DB);
  const existing = await database
    .select({ id: schema.goals.id })
    .from(schema.goals)
    .where(eq(schema.goals.userId, userId));
  if (existing.length >= MAX_GOALS) return c.json({ error: "Twenty goals is plenty. Finish or remove one first." }, 422);

  const id = newId("gol");
  await database.insert(schema.goals).values({ id, userId, title });
  return c.json({ ok: true, id }, 201);
});

goals.patch("/:id", async (c) => {
  const { userId } = c.get("session");
  const id = c.req.param("id");
  const body = await c.req.json<{ title?: string; done?: boolean }>().catch(() => null);
  if (!body) return c.json({ error: "Invalid request." }, 400);

  const patch: Partial<typeof schema.goals.$inferInsert> = {};
  if (body.title !== undefined) {
    const title = cleanTitle(body.title);
    if (!title) return c.json({ error: "A goal can't be empty." }, 422);
    patch.title = title;
  }
  if (body.done !== undefined) patch.done = Boolean(body.done);
  if (Object.keys(patch).length === 0) return c.json({ ok: true });

  const database = db(c.env.DB);
  const updated = await database
    .update(schema.goals)
    .set(patch)
    .where(and(eq(schema.goals.id, id), eq(schema.goals.userId, userId)))
    .returning({ id: schema.goals.id });
  if (updated.length === 0) return c.json({ error: "Goal not found." }, 404);
  return c.json({ ok: true });
});

goals.delete("/:id", async (c) => {
  const { userId } = c.get("session");
  const id = c.req.param("id");
  const deleted = await db(c.env.DB)
    .delete(schema.goals)
    .where(and(eq(schema.goals.id, id), eq(schema.goals.userId, userId)))
    .returning({ id: schema.goals.id });
  if (deleted.length === 0) return c.json({ error: "Goal not found." }, 404);
  return c.json({ ok: true });
});

export default goals;
