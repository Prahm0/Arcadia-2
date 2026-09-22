import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import { db, schema, type Database } from "../db";
import { serialiseEvent } from "../lib/serialise";
import { planSession, type Checkout } from "../lib/session-plan";
import { MINUTE } from "../lib/time";
import type { Env, Variables } from "../types";

type EventRow = typeof schema.events.$inferSelect;
type Outcome = "completed" | "missed" | "planned";

const events = new Hono<{ Bindings: Env; Variables: Variables }>();

async function ownedEvent(database: Database, userId: string, id: string) {
  const [event] = await database
    .select()
    .from(schema.events)
    .where(and(eq(schema.events.id, id), eq(schema.events.userId, userId)))
    .limit(1);
  return event;
}

async function reread(database: Database, id: string) {
  const [row] = await database.select().from(schema.events).where(eq(schema.events.id, id)).limit(1);
  return row ? serialiseEvent(row) : null;
}

/**
 * Marks a block done, missed or back to planned. Any outcome pins it so
 * re-planning doesn't discard it, and completing a deadline block credits
 * its task with the block's length.
 */
async function applyOutcome(database: Database, event: EventRow, outcome: Outcome, extra: Partial<EventRow> = {}) {
  await database
    .update(schema.events)
    .set({
      ...extra,
      outcome,
      status: outcome === "planned" ? "planned" : outcome,
      pinned: outcome !== "planned" || Boolean(event.startedAt),
    })
    .where(eq(schema.events.id, event.id));

  if (!event.taskId) return;
  const [task] = await database.select().from(schema.tasks).where(eq(schema.tasks.id, event.taskId)).limit(1);
  if (!task) return;

  const before = Math.round((event.endAt - event.startAt) / MINUTE);
  const after = Math.round(((extra.endAt ?? event.endAt) - (extra.startAt ?? event.startAt)) / MINUTE);
  let completed = task.completedMinutes;
  if (event.outcome === "completed") completed -= before;
  if (outcome === "completed") completed += after;
  completed = Math.max(0, Math.min(task.estimatedMinutes, completed));

  await database
    .update(schema.tasks)
    .set({ completedMinutes: completed, status: completed >= task.estimatedMinutes ? "complete" : "pending" })
    .where(eq(schema.tasks.id, task.id));
}

events.post("/:id/outcome", async (c) => {
  const { userId } = c.get("session");
  const body = await c.req.json<{ outcome?: string }>().catch(() => null);
  const outcome = body?.outcome;
  if (outcome !== "completed" && outcome !== "missed" && outcome !== "planned") {
    return c.json({ error: "Unknown outcome." }, 422);
  }

  const database = db(c.env.DB);
  const event = await ownedEvent(database, userId, c.req.param("id"));
  if (!event) return c.json({ error: "Event not found." }, 404);

  await applyOutcome(database, event, outcome);
  return c.json({ ok: true, event: await reread(database, event.id) });
});

/** Moving a block (drag on the Schedule). A moved block is pinned where it's put. */
events.patch("/:id", async (c) => {
  const { userId } = c.get("session");
  const body = await c.req.json<{ startAt?: string; endAt?: string }>().catch(() => null);
  const database = db(c.env.DB);
  const event = await ownedEvent(database, userId, c.req.param("id"));
  if (!event) return c.json({ error: "Event not found." }, 404);
  if (!event.editable) return c.json({ error: "Change this one on your profile instead." }, 409);

  const startAt = Date.parse(String(body?.startAt ?? ""));
  const endAt = Date.parse(String(body?.endAt ?? ""));
  if (Number.isNaN(startAt) || Number.isNaN(endAt) || endAt <= startAt) {
    return c.json({ error: "Give it a start and an end." }, 422);
  }
  if (endAt - startAt > 6 * 60 * MINUTE) return c.json({ error: "That's longer than a block can be." }, 422);

  await database.update(schema.events).set({ startAt, endAt, pinned: true }).where(eq(schema.events.id, event.id));
  return c.json({ ok: true, event: await reread(database, event.id) });
});

/**
 * Taking a block off the schedule. A block Arcadia planned is kept as skipped
 * rather than deleted, or the next re-plan would put it straight back; the
 * time it stood for gets planned somewhere else.
 */
events.delete("/:id", async (c) => {
  const { userId } = c.get("session");
  const database = db(c.env.DB);
  const event = await ownedEvent(database, userId, c.req.param("id"));
  if (!event) return c.json({ error: "Event not found." }, 404);
  if (!event.editable) return c.json({ error: "Change this one on your profile instead." }, 409);

  if (event.source === "auto") {
    await database
      .update(schema.events)
      .set({ status: "cancelled", outcome: "missed", pinned: true })
      .where(eq(schema.events.id, event.id));
  } else {
    await database.delete(schema.events).where(eq(schema.events.id, event.id));
  }
  return c.json({ ok: true });
});

/**
 * Arcad sets up the session: made the first time a block is opened and kept
 * after that, unless the student asks for a fresh one.
 */
events.post("/:id/plan", async (c) => {
  const { userId } = c.get("session");
  const body = await c.req.json<{ refresh?: boolean }>().catch(() => ({}) as { refresh?: boolean });
  const database = db(c.env.DB);
  const event = await ownedEvent(database, userId, c.req.param("id"));
  if (!event) return c.json({ error: "Event not found." }, 404);
  if (event.category !== "study") return c.json({ error: "Only study blocks get a plan." }, 422);
  if (event.checkout) return c.json({ event: serialiseEvent(event) });

  if (!event.plan || body?.refresh) {
    const plan = await planSession(c.env, database, userId, event);
    await database.update(schema.events).set({ plan: JSON.stringify(plan) }).where(eq(schema.events.id, event.id));
  }
  return c.json({ event: await reread(database, event.id) });
});

/**
 * The student starts the session. The block moves to when it really began
 * (early or late) and is pinned, so the rest of the week replans around it.
 */
events.post("/:id/start", async (c) => {
  const { userId } = c.get("session");
  const database = db(c.env.DB);
  const event = await ownedEvent(database, userId, c.req.param("id"));
  if (!event) return c.json({ error: "Event not found." }, 404);
  if (event.category !== "study") return c.json({ error: "Only study blocks can be started." }, 422);
  if (event.startedAt || event.outcome !== "planned") return c.json({ event: serialiseEvent(event) });

  const now = Date.now();
  const length = event.endAt - event.startAt;
  await database
    .update(schema.events)
    .set({ startedAt: now, startAt: now, endAt: now + length, pinned: true })
    .where(eq(schema.events.id, event.id));
  return c.json({ event: await reread(database, event.id) });
});

const FEELINGS = ["good", "ok", "rough"] as const;

/**
 * How it went. Marks the block done (trimmed to the time actually spent if
 * they stopped early) and keeps what's left over for the next plan.
 */
events.post("/:id/checkout", async (c) => {
  const { userId } = c.get("session");
  const body = await c.req
    .json<{ done?: unknown; leftover?: unknown; feeling?: unknown; minutes?: unknown }>()
    .catch(() => null);
  if (!body) return c.json({ error: "Invalid request." }, 400);

  const database = db(c.env.DB);
  const event = await ownedEvent(database, userId, c.req.param("id"));
  if (!event) return c.json({ error: "Event not found." }, 404);
  if (event.category !== "study") return c.json({ error: "Only study blocks can be checked out." }, 422);

  const planned = Math.round((event.endAt - event.startAt) / MINUTE);
  const spent = Number(body.minutes);
  const minutes = Number.isFinite(spent) && spent > 0 ? Math.min(planned, Math.round(spent)) : planned;
  const stepCount = event.plan ? ((JSON.parse(event.plan) as { steps?: unknown[] }).steps?.length ?? 0) : 0;
  const checkout: Checkout = {
    done: Array.isArray(body.done)
      ? [...new Set(body.done.map(Number).filter((index) => Number.isInteger(index) && index >= 0 && index < stepCount))]
      : [],
    leftover: String(body.leftover ?? "").replace(/\s+/g, " ").trim().slice(0, 200),
    feeling: (FEELINGS as readonly unknown[]).includes(body.feeling) ? (body.feeling as Checkout["feeling"]) : null,
    minutes,
    at: new Date().toISOString(),
  };

  // Stopped early: the block shrinks to what happened, so weekly targets and
  // the deadline's progress count real time.
  const start = event.startedAt ?? event.startAt;
  const extra: Partial<EventRow> = { checkout: JSON.stringify(checkout) };
  if (minutes < planned) {
    extra.startAt = start;
    extra.endAt = start + minutes * MINUTE;
  }
  await applyOutcome(database, event, "completed", extra);
  return c.json({ event: await reread(database, event.id) });
});

export default events;
