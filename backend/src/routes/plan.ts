import { Hono } from "hono";
import { db } from "../db";
import { getMonthPlan, makeMonthPlan } from "../lib/month-plan";
import { track } from "../lib/posthog";
import { getRecoveryAvailability, recoverPlan, RecoveryAlreadyUsedError, type RecoveryInput, type RecoveryReason } from "../lib/recovery";
import { replan } from "../lib/replan";
import { resetCounts, resetSchedule } from "../lib/reset";
import { awardXp } from "../lib/rewards";
import { XP } from "../../../shared/progress";
import type { Env, Variables } from "../types";

/**
 * The month plan: Arcad's split of study time across the next four weeks.
 * Making one and laying it out are separate calls so onboarding can show
 * each stage as it happens.
 */
const plan = new Hono<{ Bindings: Env; Variables: Variables }>();

plan.get("/month", async (c) => {
  const { userId } = c.get("session");
  return c.json({ plan: await getMonthPlan(db(c.env.DB), userId) });
});

/** A plan this fresh is handed back instead of asking Arcad again (double taps, retries). */
const FRESH_MS = 30_000;

plan.get("/recover/availability", async (c) => {
  const { userId } = c.get("session");
  return c.json(await getRecoveryAvailability(db(c.env.DB), userId));
});

/** Writes a fresh month plan. Doesn't touch the schedule; POST /schedule does. */
plan.post("/month", async (c) => {
  const { userId } = c.get("session");
  const database = db(c.env.DB);
  const latest = await getMonthPlan(database, userId);
  if (latest && Date.now() - Date.parse(latest.createdAt) < FRESH_MS) return c.json({ plan: latest });
  const made = await makeMonthPlan(c.env, database, userId);
  if (!made) return c.json({ error: "Finish setting up first." }, 409);
  return c.json({ plan: made });
});

/**
 * Gives a new student an immediate, rule-based schedule. `replan` also marks
 * the first-week Arcad layout as wanted, and the every-minute cron refines it
 * in the background. Waiting for that layout here used to hold onboarding at
 * 98% while Arcad could make several high-reasoning calls.
 */
plan.post("/schedule", async (c) => {
  const { userId } = c.get("session");
  const database = db(c.env.DB);
  await replan(database, userId);
  return c.json({ ok: true, refining: true });
});

/** What a reset would undo, so the confirm can say so (or say there's nothing to reset). */
plan.get("/reset", async (c) => {
  const { userId } = c.get("session");
  return c.json(await resetCounts(db(c.env.DB), userId));
});

/**
 * Resetting the schedule: the blocks the student moved or removed from now on
 * go back to where Arcad planned them. Everything they've done stays.
 */
plan.post("/reset", async (c) => {
  const { userId } = c.get("session");
  const counts = await resetSchedule(db(c.env.DB), userId);
  track(c, userId, "schedule_reset", { moved: counts.moved, removed: counts.removed });
  return c.json({ ok: true, ...counts });
});

/**
 * The Recovery Loop. The student says what changed; we reflow deterministically
 * and hand back what moved plus the next thing to do. The reply is immediate,
 * never gated on a model call.
 */
const RECOVERY_REASONS: RecoveryReason[] = ["missed", "less_time", "tired", "busy", "new_deadline"];

plan.post("/recover", async (c) => {
  const { userId } = c.get("session");
  const body = await c.req.json<Partial<RecoveryInput> & { recoveryId?: unknown }>().catch(() => ({}) as Partial<RecoveryInput> & { recoveryId?: unknown });
  if (!body.reason || !RECOVERY_REASONS.includes(body.reason)) {
    return c.json({ error: "Tell Arcad what changed." }, 400);
  }
  const database = db(c.env.DB);
  try {
    const result = await recoverPlan(database, userId, body as RecoveryInput);
    const recoveryId = typeof body.recoveryId === "string" && /^[a-zA-Z0-9_-]{8,100}$/.test(body.recoveryId) ? body.recoveryId : null;
    const rewards = recoveryId ? await awardXp(database, userId, "recovery", recoveryId, XP.recovery) : [];
    return c.json({ ...result, rewards });
  } catch (err) {
    if (err instanceof RecoveryAlreadyUsedError) {
      return c.json({ error: err.message, code: "recovery_already_used", reason: err.reason }, 409);
    }
    console.error("[plan] recover failed", err);
    return c.json({ error: "Couldn't update your plan. Try again in a moment." }, 502);
  }
});

export default plan;
