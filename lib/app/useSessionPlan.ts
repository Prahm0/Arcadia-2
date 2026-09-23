"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api/client";
import type { DashboardResponse, PlannerEvent } from "@/lib/api/types";
import { useDashboardData } from "@/lib/app/DashboardProvider";

/** Matches PLAN_VERSION in backend/src/lib/session-plan.ts. */
const PLAN_VERSION = 2;

/** Swap one event in the dashboard cache for the server's copy. */
export function useReplaceEvent() {
  const { patch } = useDashboardData();
  return useCallback(
    (event: PlannerEvent | null | undefined) => {
      if (!event) return;
      patch((prev: DashboardResponse) => ({
        ...prev,
        events: prev.events.map((existing) => (existing.id === event.id ? event : existing)),
      }));
    },
    [patch],
  );
}

/**
 * Makes sure a study block has Arcad's plan: asks for one the first time the
 * block is shown, then it's cached on the event. `refresh` asks for a new one.
 */
export function useSessionPlan(event: PlannerEvent | null | undefined) {
  const replaceEvent = useReplaceEvent();
  const requested = useRef<string | null>(null);
  const [failedFor, setFailedFor] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  // Plans from before v2 could name topics Arcad made up; they're redone
  // unless the session has already started.
  const stale = Boolean(event?.plan && (event.plan.v ?? 1) < PLAN_VERSION && !event.startedAt);
  const needsPlan = Boolean(event && event.category === "study" && (!event.plan || stale) && !event.checkout);
  const eventId = event?.id;

  useEffect(() => {
    if (!needsPlan || !eventId || requested.current === eventId) return;
    requested.current = eventId;
    api<{ event: PlannerEvent }>(`/api/events/${encodeURIComponent(eventId)}/plan`, { method: "POST", body: "{}" })
      .then((response) => replaceEvent(response.event))
      .catch(() => setFailedFor(eventId));
  }, [needsPlan, eventId, replaceEvent]);

  const refresh = useCallback(async () => {
    if (!eventId) return;
    setRefreshing(true);
    try {
      const response = await api<{ event: PlannerEvent }>(`/api/events/${encodeURIComponent(eventId)}/plan`, {
        method: "POST",
        body: JSON.stringify({ refresh: true }),
      });
      replaceEvent(response.event);
    } finally {
      setRefreshing(false);
    }
  }, [eventId, replaceEvent]);

  return {
    plan: stale ? null : (event?.plan ?? null),
    loading: needsPlan && failedFor !== eventId,
    failed: needsPlan && failedFor === eventId,
    refreshing,
    refresh,
  };
}
