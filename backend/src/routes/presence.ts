import { Hono } from "hono";
import { db, schema } from "../db";
import { ACTIVITIES, type Activity } from "../lib/presence";
import type { Env, Variables } from "../types";

interface PresenceInput {
  activity?: string;
  subject?: string | null;
  startedAt?: string | null;
  durationSeconds?: number | null;
}

const presence = new Hono<{ Bindings: Env; Variables: Variables }>();

/**
 * The focus timer's single write. Upserts this user's one presence row, which
 * every study room they belong to reads. Sent on start/pause/reset/phase
 * change and as a once-a-minute keepalive while the timer runs.
 */
presence.put("/", async (c) => {
  const { userId } = c.get("session");
  const body = await c.req.json<PresenceInput>().catch(() => null);
  if (!body || !(ACTIVITIES as readonly string[]).includes(String(body.activity))) {
    return c.json({ error: "Invalid presence." }, 400);
  }

  const now = Date.now();
  const activity = body.activity as Activity;
  const subject = body.subject ? String(body.subject).trim().slice(0, 80) || null : null;

  let startedAt: number | null = null;
  let durationSeconds: number | null = null;
  if (activity !== "idle") {
    const parsed = Date.parse(String(body.startedAt ?? ""));
    // Clamp to the last 24h and never the future, so a bad client clock
    // cannot show someone as "studying for 3 days".
    startedAt = Number.isNaN(parsed) ? now : Math.min(now, Math.max(now - 24 * 3600_000, parsed));
    const duration = Number(body.durationSeconds);
    durationSeconds =
      Number.isFinite(duration) && duration > 0 ? Math.min(Math.round(duration), 24 * 3600) : null;
  }

  const values = { activity, subject, startedAt, durationSeconds, updatedAt: now };
  await db(c.env.DB)
    .insert(schema.userPresence)
    .values({ userId, ...values })
    .onConflictDoUpdate({ target: schema.userPresence.userId, set: values });

  return c.json({ ok: true });
});

export default presence;
