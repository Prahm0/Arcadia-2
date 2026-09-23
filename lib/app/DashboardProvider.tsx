"use client";

import { createContext, useContext, useEffect, useMemo } from "react";
import { useDashboard } from "@/lib/api/dashboard";
import { identifyUser } from "@/lib/analytics/events";
import type { DashboardResponse } from "@/lib/api/types";

interface DashboardContextValue {
  data: DashboardResponse;
  reload: () => Promise<void>;
  patch: (updater: (previous: DashboardResponse) => DashboardResponse) => void;
}

const DashboardContext = createContext<DashboardContextValue | null>(null);

interface ProviderProps {
  data: DashboardResponse;
  reload: () => Promise<void>;
  patch: (updater: (previous: DashboardResponse) => DashboardResponse) => void;
  children: React.ReactNode;
}

export function DashboardDataProvider({ data, reload, patch, children }: ProviderProps) {
  const value = useMemo(() => ({ data, reload, patch }), [data, reload, patch]);
  // Tie analytics events and session replays to the signed-in user. We send
  // no name or email, only the id plus non-identifying attributes, so the
  // data stays privacy-minimal for a young audience.
  const userId = data.user?.id;
  const tier = data.user?.tier;
  const isGuest = data.user?.email?.endsWith("@arcadia.local") ?? false;
  useEffect(() => {
    if (userId) identifyUser(userId, { tier, isGuest });
  }, [userId, tier, isGuest]);
  return <DashboardContext.Provider value={value}>{children}</DashboardContext.Provider>;
}

export function useDashboardData() {
  const ctx = useContext(DashboardContext);
  if (!ctx) throw new Error("useDashboardData must be used inside <DashboardDataProvider>");
  return ctx;
}

export { useDashboard };
