import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import { db, schema } from "../db";
import { saveMemories } from "../lib/memories";
import { iso } from "../lib/time";
import type { Env, Variables } from "../types";

/** What Arcad remembers about the student. Arcad adds to it from chats; the student can add or remove. */
const memories = new Hono<{ Bindings: Env; Variables: Variables }>();

memories.post("/", async (c) => {
  const { userId } = c.get("session");
  const body = await c.req.json<{ content?: string }>().catch(() => null);
  const content = String(body?.content ?? "").trim();
  if (content.length < 3) return c.json({ error: "Write what Arcad should remember." }, 422);

  const [saved] = await saveMemories(db(c.env.DB), userId, [content], "manual");
  if (!saved) return c.json({ error: "Arcad already remembers that." }, 409);
  return c.json(
    { memory: { id: saved.id, content: saved.content, source: saved.source, createdAt: iso(saved.createdAt) } },
    201,
  );
});

memories.delete("/:id", async (c) => {
  const { userId } = c.get("session");
  const id = c.req.param("id");
  const deleted = await db(c.env.DB)
    .delete(schema.memories)
    .where(and(eq(schema.memories.id, id), eq(schema.memories.userId, userId)))
    .returning({ id: schema.memories.id });
  if (deleted.length === 0) return c.json({ error: "Memory not found." }, 404);
  return c.json({ ok: true });
});

/** Forget everything. */
memories.delete("/", async (c) => {
  const { userId } = c.get("session");
  await db(c.env.DB).delete(schema.memories).where(eq(schema.memories.userId, userId));
  return c.json({ ok: true });
});

export default memories;
