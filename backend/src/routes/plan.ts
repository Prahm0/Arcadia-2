import { Hono } from "hono";
import { db } from "../db";
import { getMonthPlan, makeMonthPlan } from "../lib/month-plan";
import { recoverPlan, type RecoveryInput, type RecoveryReason } from "../lib/recovery";
import { replan } from "../lib/replan";
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

/**
 * The Recovery Loop. The student says what changed; we reflow deterministically
 * and hand back what moved plus the next thing to do. The reply is immediate,
 * never gated on a model call.
 */
const RECOVERY_REASONS: RecoveryReason[] = ["missed", "less_time", "tired", "busy", "new_deadline"];

plan.post("/recover", async (c) => {
  const { userId } = c.get("session");
  const body = await c.req.json<Partial<RecoveryInput>>().catch(() => ({}) as Partial<RecoveryInput>);
  if (!body.reason || !RECOVERY_REASONS.includes(body.reason)) {
    return c.json({ error: "Tell Arcad what changed." }, 400);
  }
  const database = db(c.env.DB);
  try {
    const result = await recoverPlan(database, userId, body as RecoveryInput);
    return c.json(result);
  } catch (err) {
    console.error("[plan] recover failed", err);
    return c.json({ error: "Couldn't update your plan. Try again in a moment." }, 502);
  }
});

export default plan;
