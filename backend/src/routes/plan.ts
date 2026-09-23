import { Hono } from "hono";
import { db } from "../db";
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

/** Writes a fresh month plan. Doesn't touch the schedule; POST /schedule does. */
plan.post("/month", async (c) => {
  const { userId } = c.get("session");
  const made = await makeMonthPlan(c.env, db(c.env.DB), userId);
  if (!made) return c.json({ error: "Finish setting up first." }, 409);
  return c.json({ plan: made });
});

/** Lays the next four weeks out from the current plan. */
plan.post("/schedule", async (c) => {
  const { userId } = c.get("session");
  await replan(db(c.env.DB), userId);
  return c.json({ ok: true });
});

export default plan;
