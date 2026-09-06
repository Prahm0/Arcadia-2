import { and, eq, gte } from "drizzle-orm";
import { Hono } from "hono";
import { db, schema } from "../db";
import { newId } from "../lib/ids";
import { DAY } from "../lib/time";
import type { Env, Variables } from "../types";

interface SessionInput {
  type?: string;
  seconds?: number;
  subject?: string | null;
  goal?: string | null;
  distractions?: number;
  endedAt?: string;
}

const studySessions = new Hono<{ Bindings: Env; Variables: Variables }>();

// FocusView posts an array, so accept both an array and a single object.
studySessions.post("/", async (c) => {
  const { userId } = c.get("session");
  const payload = await c.req.json<SessionInput[] | SessionInput>().catch(() => null);
  if (!payload) return c.json({ error: "Invalid request." }, 400);

  const items = Array.isArray(payload) ? payload : [payload];
  if (items.length > 100) return c.json({ error: "Too many sessions in one request." }, 422);

  const database = db(c.env.DB);
  let stored = 0;

  for (const item of items) {
    const seconds = Number(item.seconds);
    if (!Number.isFinite(seconds) || seconds <= 0 || seconds > 24 * 3600) continue;

    const endedAt = Date.parse(String(item.endedAt ?? ""));
    await database.insert(schema.studySessions).values({
      id: newId("ses"),
      userId,
      type: String(item.type ?? "focus").slice(0, 32),
      seconds: Math.round(seconds),
      subject: item.subject ? String(item.subject).slice(0, 80) : null,
      goal: item.goal ? String(item.goal).slice(0, 200) : null,
      distractions: Number.isFinite(Number(item.distractions))
        ? Math.max(0, Math.round(Number(item.distractions)))
        : 0,
      endedAt: Number.isNaN(endedAt) ? Date.now() : endedAt,
    });
    stored += 1;
  }

  return c.json({ ok: true, stored }, 201);
});

studySessions.get("/", async (c) => {
  const { userId } = c.get("session");
  const rows = await db(c.env.DB)
    .select()
    .from(schema.studySessions)
    .where(
      and(
        eq(schema.studySessions.userId, userId),
        gte(schema.studySessions.endedAt, Date.now() - 30 * DAY),
      ),
    );
  return c.json({
    sessions: rows.map((row) => ({
      id: row.id,
      type: row.type,
      seconds: row.seconds,
      subject: row.subject,
      goal: row.goal,
      distractions: row.distractions,
      endedAt: new Date(row.endedAt).toISOString(),
    })),
  });
});

export default studySessions;
