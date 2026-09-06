"use client";

import { useCallback, useEffect, useState } from "react";
import { api, ApiError } from "./client";
import type { DashboardResponse } from "./types";

type State =
  | { status: "loading"; data: null; error: null }
  | { status: "ready"; data: DashboardResponse; error: null }
  | { status: "error"; data: null; error: string }
  | { status: "unauthenticated"; data: null; error: null };

export function useDashboard() {
  const [state, setState] = useState<State>({ status: "loading", data: null, error: null });

  const load = useCallback(async () => {
    setState((prev) =>
      prev.status === "ready"
        ? prev
        : { status: "loading", data: null, error: null },
    );
    try {
      const data = await api<DashboardResponse>("/api/dashboard");
      setState({ status: "ready", data, error: null });
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        setState({ status: "unauthenticated", data: null, error: null });
        return;
      }
      const message = error instanceof Error ? error.message : "Failed to load your plan.";
      setState({ status: "error", data: null, error: message });
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const patch = useCallback((updater: (previous: DashboardResponse) => DashboardResponse) => {
    setState((prev) => {
      if (prev.status !== "ready") return prev;
      return { status: "ready", data: updater(prev.data), error: null };
    });
  }, []);

  return { state, reload: load, patch };
}
