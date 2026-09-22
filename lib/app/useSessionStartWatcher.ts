"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { isGuestEmail } from "@/lib/auth/guest";
import { useDashboardData } from "@/lib/app/DashboardProvider";
import type { PlannerEvent } from "@/lib/api/types";

const CHECK_INTERVAL_MS = 15_000;
const START_WINDOW_MS = 60_000;
const SHOWN_PREFIX = "arcadia:session-start:shown:";

function wasShown(eventId: string): boolean {
  try {
    return window.localStorage.getItem(`${SHOWN_PREFIX}${eventId}`) === "1";
  } catch {
    return false;
  }
}

function markShown(eventId: string) {
  try {
    window.localStorage.setItem(`${SHOWN_PREFIX}${eventId}`, "1");
  } catch {
    /* A blocked storage area should not stop the check-in. */
  }
}

/**
 * Surfaces one study block when its planned start is near. Showing a check-in
 * is deliberately remembered per event, so navigation and reloads do not nag
 * a student about the same block twice.
 */
export function useSessionStartWatcher(): {
  event: PlannerEvent | null;
  timezone: string;
  dismiss: () => void;
} {
  const { data } = useDashboardData();
  const [shownEventId, setShownEventId] = useState<string | null>(null);
  const checkingRef = useRef(false);
  const isGuest = isGuestEmail(data.user.email);
  const timezone = data.profile?.timezone || data.user.timezone || "Australia/Sydney";

  const event = useMemo(
    () => {
      const candidate = data.events.find((item) => item.id === shownEventId) ?? null;
      return candidate?.outcome === "planned" ? candidate : null;
    },
    [data.events, shownEventId],
  );

  const dismiss = useCallback(() => setShownEventId(null), []);

  useEffect(() => {
    if (isGuest) return;

    function check() {
      if (checkingRef.current) return;
      checkingRef.current = true;
      try {
        const now = Date.now();
        const next = data.events
          .filter((candidate) => candidate.category === "study")
          .filter((candidate) => candidate.outcome === "planned" && !candidate.startedAt)
          .filter((candidate) => Math.abs(Date.parse(candidate.startAt) - now) <= START_WINDOW_MS)
          .filter((candidate) => !wasShown(candidate.id))
          .sort((a, b) => Date.parse(a.startAt) - Date.parse(b.startAt))[0];

        if (!next) return;
        markShown(next.id);
        setShownEventId(next.id);
      } finally {
        checkingRef.current = false;
      }
    }

    check();
    const interval = window.setInterval(check, CHECK_INTERVAL_MS);
    return () => window.clearInterval(interval);
  }, [data.events, isGuest]);

  return { event, timezone, dismiss };
}
