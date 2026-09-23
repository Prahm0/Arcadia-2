"use client";

import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api/client";
import type { PlannerEvent } from "@/lib/api/types";

/**
 * Events for the range on screen. The dashboard only carries today plus the
 * next seven days, so earlier days this week, later weeks and the month view
 * are read from /api/events. The dashboard's copies win where both have a
 * block, because that's where drags and outcomes land optimistically.
 */
export function useRangeEvents(
  fromMs: number,
  toMs: number,
  dashboardEvents: PlannerEvent[],
  dashboardRange: { start: string; end: string },
): { events: PlannerEvent[]; loading: boolean } {
  const rangeStart = Date.parse(dashboardRange.start);
  const rangeEnd = Date.parse(dashboardRange.end);
  const covered = fromMs >= rangeStart && toMs <= rangeEnd;
  const cacheKey = `${fromMs}:${toMs}`;
  const [fetched, setFetched] = useState<{ key: string; events: PlannerEvent[] } | null>(null);

  useEffect(() => {
    if (covered) return;
    let cancelled = false;
    const from = new Date(fromMs).toISOString();
    const to = new Date(toMs).toISOString();
    api<{ events: PlannerEvent[] }>(`/api/events?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`)
      .then((response) => {
        if (!cancelled) setFetched({ key: cacheKey, events: response.events });
      })
      .catch((error) => {
        console.warn("Couldn't load events for that range", error);
        if (!cancelled) setFetched({ key: cacheKey, events: [] });
      });
    return () => {
      cancelled = true;
    };
    // Refetch when the dashboard reloads, so a moved block shows in its new place.
  }, [covered, cacheKey, fromMs, toMs, dashboardEvents]);

  const events = useMemo(() => {
    const inRange = (event: PlannerEvent) => Date.parse(event.endAt) > fromMs && Date.parse(event.startAt) < toMs;
    const live = dashboardEvents.filter(inRange);
    if (covered || fetched?.key !== cacheKey) return live;
    const ids = new Set(live.map((event) => event.id));
    // Stored blocks the dashboard already replanned (rangeStart onward) come from the dashboard.
    const older = fetched.events.filter(
      (event) => !ids.has(event.id) && inRange(event) && !(Date.parse(event.startAt) >= rangeStart && Date.parse(event.startAt) <= rangeEnd),
    );
    return [...live, ...older].sort((a, b) => Date.parse(a.startAt) - Date.parse(b.startAt));
  }, [dashboardEvents, fetched, covered, cacheKey, fromMs, toMs, rangeStart, rangeEnd]);

  return { events, loading: !covered && fetched?.key !== cacheKey };
}
