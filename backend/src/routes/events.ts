import { and, eq, gte, lt } from "drizzle-orm";
import { Hono } from "hono";
import { db, schema, type Database } from "../db";
import { serialiseEvent } from "../lib/serialise";
import { planIsCurrent, planSession, type Checkout, type SessionPlan } from "../lib/session-plan";
import { effectiveTier, isPaidTier } from "../lib/tiers";
import { DAY, MINUTE } from "../lib/time";
import { awardXp } from "../lib/rewards";
import { XP } from "../../../shared/progress";
import type { Env, Variables } from "../types";

type EventRow = typeof schema.events.$inferSelect;
type Outcome = "completed" | "missed" | "planned";
type MissReason = "sick" | "tired" | "other_plans" | "forgot" | "didnt_feel_like_it" | "other";

const MISS_REASONS = new Set<MissReason>([
  "sick", "tired", "other_plans", "forgot", "didnt_feel_like_it", "other",
]);

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
      // A new outcome supersedes an earlier explanation. Missed outcomes only
      // retain a reason when the paid follow-up explicitly supplies one.
      missReason: outcome === "missed" ? extra.missReason ?? event.missReason : null,
      missNote: outcome === "missed" ? extra.missNote ?? event.missNote : null,
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
    .set({
      completedMinutes: completed,
      status: completed >= task.estimatedMinutes ? "complete" : "pending",
      completedAt: completed >= task.estimatedMinutes ? (task.completedAt ?? Date.now()) : null,
    })
    .where(eq(schema.tasks.id, task.id));
}

async function missReasonAccess(database: Database, userId: string) {
  const [user] = await database
    .select({ email: schema.users.email, tier: schema.users.tier, developerAccess: schema.users.developerAccess, developerTier: schema.users.developerTier, proBonusUntil: schema.users.proBonusUntil })
    .from(schema.users)
    .where(eq(schema.users.id, userId))
    .limit(1);
  if (user?.email.endsWith("@arcadia.local")) {
    return { allowed: false as const, error: "Guest accounts cannot save miss reasons.", code: "guest_cannot_use" };
  }
  const tier = effectiveTier(user?.tier, user?.developerAccess ?? false, user?.proBonusUntil, Date.now(), user?.developerTier);
  if (!isPaidTier(tier)) {
    return { allowed: false as const, error: "Miss reasons are available on Pro and Max.", code: "tier_required" };
  }
  return { allowed: true as const };
}

function readMissReason(value: unknown): MissReason | null {
  return typeof value === "string" && MISS_REASONS.has(value as MissReason) ? value as MissReason : null;
}

function readMissNote(value: unknown): string | null {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, 280) || null : null;
}

/** The longest span one request can read: a term plus the holidays after it. */
const MAX_RANGE_MS = 130 * DAY;

/**
 * Blocks between two instants, for the planner's term, other weeks and
 * days. Only reads what's stored: the dashboard keeps the next seven days
 * planned, and anything further out is imported events and pinned blocks.
 */
events.get("/", async (c) => {
  const { userId } = c.get("session");
  const from = Date.parse(c.req.query("from") ?? "");
  const to = Date.parse(c.req.query("to") ?? "");
  if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from) {
    return c.json({ error: "Give a from and to date." }, 400);
  }
  if (to - from > MAX_RANGE_MS) return c.json({ error: "That range is too long." }, 400);

  const rows = await db(c.env.DB)
    .select()
    .from(schema.events)
    .where(
      and(
        eq(schema.events.userId, userId),
        // Starting a day early catches overnight blocks (sleep) that run into the range.
        gte(schema.events.startAt, from - DAY),
        lt(schema.events.startAt, to),
      ),
    );
  const events = rows
    .filter((event) => event.status !== "cancelled" && event.endAt > from)
    .sort((a, b) => a.startAt - b.startAt)
    .map(serialiseEvent);
  return c.json({ events });
});

events.post("/:id/outcome", async (c) => {
  const { userId } = c.get("session");
  const body = await c.req.json<{ outcome?: string; missReason?: unknown; missNote?: unknown }>().catch(() => null);
  const outcome = body?.outcome;
  if (outcome !== "completed" && outcome !== "missed" && outcome !== "planned") {
    return c.json({ error: "Unknown outcome." }, 422);
  }

  const database = db(c.env.DB);
  const event = await ownedEvent(database, userId, c.req.param("id"));
  if (!event) return c.json({ error: "Event not found." }, 404);

  const includesReason = Boolean(body && ("missReason" in body || "missNote" in body));
  if (includesReason) {
    const access = await missReasonAccess(database, userId);
    if (!access.allowed) return c.json({ error: access.error, code: access.code }, 403);
    if (outcome !== "missed" || event.category !== "study") {
      return c.json({ error: "Miss reasons only apply to missed study blocks." }, 422);
    }
    const missReason = readMissReason(body?.missReason);
    if (!missReason) return c.json({ error: "Choose a miss reason." }, 422);
    await applyOutcome(database, event, outcome, { missReason, missNote: readMissNote(body?.missNote) });
  } else {
    await applyOutcome(database, event, outcome);
  }
  const rewards = outcome === "completed" && event.outcome !== "completed" && event.category === "study"
    ? await awardXp(database, userId, "study_block", event.id, XP.studyBlock)
    : [];
  if (outcome === "planned" && event.outcome === "completed") {
    await database.delete(schema.xpEvents).where(and(eq(schema.xpEvents.userId, userId), eq(schema.xpEvents.source, "study_block"), eq(schema.xpEvents.sourceId, event.id)));
  }
  return c.json({ ok: true, event: await reread(database, event.id), rewards });
});

/** Moving a block (drag on the Schedule). A moved block is pinned where it's put. */
events.patch("/:id", async (c) => {
  const { userId } = c.get("session");
  const body = await c.req
    .json<{ startAt?: string; endAt?: string; missReason?: unknown; missNote?: unknown }>()
    .catch(() => null);
  const database = db(c.env.DB);
  const event = await ownedEvent(database, userId, c.req.param("id"));
  if (!event) return c.json({ error: "Event not found." }, 404);

  const includesReason = Boolean(body && ("missReason" in body || "missNote" in body));
  const includesTime = Boolean(body && ("startAt" in body || "endAt" in body));
  if (includesReason && !includesTime) {
    const access = await missReasonAccess(database, userId);
    if (!access.allowed) return c.json({ error: access.error, code: access.code }, 403);
    if (event.category !== "study" || event.outcome !== "missed") {
      return c.json({ error: "Miss reasons only apply to missed study blocks." }, 422);
    }
    const missReason = readMissReason(body?.missReason);
    if (!missReason) return c.json({ error: "Choose a miss reason." }, 422);
    await database
      .update(schema.events)
      .set({ missReason, missNote: readMissNote(body?.missNote) })
      .where(eq(schema.events.id, event.id));
    return c.json({ ok: true, event: await reread(database, event.id) });
  }

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

/** Delay one generated sleep block without changing the user's usual sleep schedule. */
events.post("/:id/snooze", async (c) => {
  const { userId } = c.get("session");
  const body = await c.req.json<{ minutes?: unknown }>().catch(() => null);
  const minutes = body?.minutes;
  if (minutes !== 15 && minutes !== 30 && minutes !== 60) {
    return c.json({ error: "Choose a delay of 15, 30, or 60 minutes." }, 422);
  }

  const database = db(c.env.DB);
  const event = await ownedEvent(database, userId, c.req.param("id"));
  if (!event) return c.json({ error: "Event not found." }, 404);
  if (event.category !== "sleep" || event.source !== "sleep" || event.outcome !== "planned") {
    return c.json({ error: "Only a planned sleep block can be delayed." }, 409);
  }

  const offset = minutes * MINUTE;
  await database.update(schema.events)
    .set({ startAt: event.startAt + offset, endAt: event.endAt + offset, pinned: true })
    .where(eq(schema.events.id, event.id));
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

  // Plans from an older planner may name topics it made up; redo them
  // unless the session's already under way.
  const stale = Boolean(event.plan && !event.startedAt && !planIsCurrent(JSON.parse(event.plan) as SessionPlan));
  if (!event.plan || stale || body?.refresh) {
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
