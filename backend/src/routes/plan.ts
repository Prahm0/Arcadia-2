import { Hono } from "hono";
import { db } from "../db";
import { makeLayout } from "../lib/day-plan";
import { getMonthPlan, makeMonthPlan } from "../lib/month-plan";
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
 * Lays the next four weeks out from the current plan: Arcad places the next
 * week block by block, the scheduler's rules do the rest.
 */
plan.post("/schedule", async (c) => {
  const { userId } = c.get("session");
  const database = db(c.env.DB);
  try {
    await makeLayout(c.env, database, userId);
  } catch (err) {
    // The rules alone still give them a schedule; the cron retries Arcad.
    console.error("[plan] layout failed", err);
  }
  await replan(database, userId);
  return c.json({ ok: true });
});

export default plan;
