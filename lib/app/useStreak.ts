"use client";

import { useMemo } from "react";
import { useDashboardData } from "@/lib/app/DashboardProvider";
import { computeStreak, type StreakSummary } from "@/lib/app/streaks";

/**
 * Live consistent-day streak, derived from planner events in the dashboard
 * cache. Every consumer of streak data should use this hook so a single
 * definition of "consistent day" powers the whole app.
 */
export function useStreak(): StreakSummary {
  const { data } = useDashboardData();
  const timezone = data.profile?.timezone || data.user.timezone || "Australia/Sydney";
  const recoveryDays = data.analytics?.recoveryDays;
  return useMemo(
    () => computeStreak(data.events, timezone, new Date(), new Set(recoveryDays ?? [])),
    [data.events, timezone, recoveryDays],
  );
}
