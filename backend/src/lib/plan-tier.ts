import type { Env } from "../types";
import type { Tier } from "./tiers";

/**
 * How hard Arcad works on a student's plan. Everyone gets the standard
 * planning model; Pro and Max get a stronger one, and Max thinks harder.
 *
 * The stronger model costs several times more per layout, and a layout is
 * remade every time the student's week changes (a new deadline, work logged,
 * a new day). So paid students get PREMIUM_LAYOUTS_PER_DAY on it, and any
 * past that fall back to the standard model for the rest of their day.
 */
export interface PlanEffort {
  /** Models to try, in order: the first that answers is used. */
  models: string[];
  reasoningEffort: "low" | "medium" | "high";
  /** True when the first model is the paid one. */
  premium: boolean;
}

/**
 * Premium layouts a paid student gets each day before the standard model
 * takes over. The first of the day (a new day changes the inputs) plus a
 * couple of edits covers most students.
 */
export const PREMIUM_LAYOUTS_PER_DAY: Record<Tier, number> = {
  free: 0,
  pro: 3,
  max: 6,
};

/** The model paid students plan with, unless the env names another. */
export const DEFAULT_PREMIUM_PLAN_MODEL = "gpt-5";

function standardModels(env: Env): string[] {
  return [env.OPENAI_PLAN_MODEL || env.OPENAI_MODEL || "gpt-4o-mini", env.OPENAI_MODEL || "gpt-4o-mini"];
}

function premiumModel(env: Env, tier: Tier): string {
  const pro = env.OPENAI_PLAN_MODEL_PRO || DEFAULT_PREMIUM_PLAN_MODEL;
  return tier === "max" ? env.OPENAI_PLAN_MODEL_MAX || pro : pro;
}

const unique = (models: string[]) => [...new Set(models.filter(Boolean))];

/**
 * The effort for one layout. `premiumUsedToday` is how many premium layouts
 * the student has had today; past the tier's allowance they get the
 * standard model.
 */
export function layoutEffort(env: Env, tier: Tier, premiumUsedToday: number): PlanEffort {
  if (tier === "free" || premiumUsedToday >= PREMIUM_LAYOUTS_PER_DAY[tier]) {
    return { models: unique(standardModels(env)), reasoningEffort: "medium", premium: false };
  }
  return {
    models: unique([premiumModel(env, tier), ...standardModels(env)]),
    reasoningEffort: tier === "max" ? "high" : "medium",
    premium: true,
  };
}

/**
 * The effort for a month plan. It's one call, made rarely (onboarding and
 * when the student asks), so paid students always get the stronger model.
 * Someone is watching a progress bar while it runs, so it thinks briefly,
 * and everyone else keeps the fast chat model.
 */
export function monthPlanEffort(env: Env, tier: Tier): PlanEffort {
  const chat = env.OPENAI_MODEL || "gpt-4o-mini";
  if (tier === "free") return { models: [chat], reasoningEffort: "low", premium: false };
  return { models: unique([premiumModel(env, tier), chat]), reasoningEffort: "low", premium: true };
}

/**
 * Reply tokens for one call. Reasoning models spend most of theirs thinking,
 * and the big one at high effort more still; the rest can't take 24k.
 */
export function replyBudget(reasoning: boolean, premium: boolean): number {
  if (!reasoning) return 6000;
  return premium ? 32000 : 24000;
}
