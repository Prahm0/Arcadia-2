"use client";

import { createContext, useContext, useMemo } from "react";
import { useDashboard } from "@/lib/api/dashboard";
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
  return <DashboardContext.Provider value={value}>{children}</DashboardContext.Provider>;
}

export function useDashboardData() {
  const ctx = useContext(DashboardContext);
  if (!ctx) throw new Error("useDashboardData must be used inside <DashboardDataProvider>");
  return ctx;
}

export { useDashboard };
