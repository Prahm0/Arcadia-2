"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api/client";

/** Arcad's plan for the next four weeks. Mirrors backend/src/lib/month-plan.ts. */
export interface MonthPlanWeek {
  /** The week's Monday, YYYY-MM-DD. */
  weekOf: string;
  /** "Term 4, week 2", "School holidays", or "" when the calendar isn't known. */
  label: string;
  focus: string;
  subjects: Array<{ name: string; minutes: number }>;
}

export interface MonthPlan {
  summary: string;
  weeks: MonthPlanWeek[];
  /** Each subject's usual week when the plan was made, keyed by lowercased name. */
  base: Record<string, number>;
  by: "arcad" | "fallback";
  createdAt: string;
}

/** Writes a fresh month plan, then lays the sessions out from it. */
export async function remakeMonthPlan(): Promise<MonthPlan | null> {
  const { plan } = await api<{ plan: MonthPlan | null }>("/api/plan/month", { method: "POST" });
  await api("/api/plan/schedule", { method: "POST" });
  return plan;
}

type PlanState =
  | { status: "loading" }
  | { status: "error"; error: string }
  | { status: "ready"; plan: MonthPlan | null };

export function useMonthPlan() {
  const [state, setState] = useState<PlanState>({ status: "loading" });

  const load = useCallback(
    () =>
      api<{ plan: MonthPlan | null }>("/api/plan/month").then(
        ({ plan }): PlanState => ({ status: "ready", plan }),
        (err): PlanState => ({
          status: "error",
          error: err instanceof Error ? err.message : "Couldn't load your plan.",
        }),
      ),
    [],
  );

  useEffect(() => {
    let live = true;
    void load().then((next) => live && setState(next));
    return () => {
      live = false;
    };
  }, [load]);

  const refresh = useCallback(async () => {
    setState({ status: "loading" });
    setState(await load());
  }, [load]);

  const replace = useCallback((plan: MonthPlan | null) => setState({ status: "ready", plan }), []);

  return { state, refresh, replace };
}
