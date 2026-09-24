import test from "node:test";
import assert from "node:assert/strict";
import { PREMIUM_LAYOUTS_PER_DAY, layoutEffort, monthPlanEffort } from "./src/lib/plan-tier.ts";
import { summariseHabits } from "./src/lib/study-habits.ts";

const env = { OPENAI_MODEL: "gpt-4o-mini", OPENAI_PLAN_MODEL: "gpt-5-mini", OPENAI_PLAN_MODEL_PRO: "gpt-5" };

test("free students plan on the standard model", () => {
  const effort = layoutEffort(env, "free", 0);
  assert.deepEqual(effort.models, ["gpt-5-mini", "gpt-4o-mini"]);
  assert.equal(effort.premium, false);
});

test("paid students get the stronger model first, falling back to the standard ones", () => {
  const pro = layoutEffort(env, "pro", 0);
  assert.deepEqual(pro.models, ["gpt-5", "gpt-5-mini", "gpt-4o-mini"]);
  assert.equal(pro.premium, true);
  assert.equal(pro.reasoningEffort, "medium");

  const max = layoutEffort({ ...env, OPENAI_PLAN_MODEL_MAX: "gpt-5-pro" }, "max", 0);
  assert.equal(max.models[0], "gpt-5-pro");
  assert.equal(max.reasoningEffort, "high");
});

test("Max uses Pro's model when it has none of its own", () => {
  assert.equal(layoutEffort(env, "max", 0).models[0], "gpt-5");
});

test("past the daily allowance, paid students drop to the standard model", () => {
  const effort = layoutEffort(env, "pro", PREMIUM_LAYOUTS_PER_DAY.pro);
  assert.equal(effort.premium, false);
  assert.equal(effort.models[0], "gpt-5-mini");
});

test("free month plans keep the fast chat model", () => {
  assert.deepEqual(monthPlanEffort(env, "free").models, ["gpt-4o-mini"]);
  assert.deepEqual(monthPlanEffort(env, "pro").models, ["gpt-5", "gpt-4o-mini"]);
});

const block = (hour, kept, extra = {}) => ({ subject: "Maths", kept, hour, weekday: 2, minutes: 50, ...extra });

test("says nothing until there's enough history", () => {
  const habits = summariseHabits([block(16, true), block(16, false)]);
  assert.deepEqual(habits.lines, []);
  assert.equal(habits.keptShare, null);
});

test("reports the times they keep and the ones they skip", () => {
  const habits = summariseHabits([
    block(16, true), block(15, true), block(14, true), block(16, true),
    block(21, false), block(21, false), block(22, true),
  ]);
  assert.ok(habits.lines.some((line) => line.startsWith("Afternoons (12-5pm): kept 4 of 4 (reliable)")));
  assert.ok(habits.lines.some((line) => line.startsWith("Late evenings (after 8pm): kept 1 of 3 (often skipped)")));
  assert.equal(Math.round(habits.keptShare * 100), 71);
});

test("names subjects that keep slipping, not the ones going fine", () => {
  const habits = summariseHabits([
    block(16, true, { subject: "English" }), block(16, true, { subject: "English" }), block(16, true, { subject: "English" }),
    block(17, false, { subject: "Chemistry" }), block(17, false, { subject: "Chemistry" }), block(17, true, { subject: "Chemistry" }),
  ]);
  assert.ok(habits.lines.includes("Chemistry: kept 1 of 3."));
  assert.ok(!habits.lines.some((line) => line.startsWith("English")));
});
