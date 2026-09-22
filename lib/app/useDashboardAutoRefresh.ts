"use client";

import { useEffect, useRef } from "react";

const REFRESH_EVENT = "arcadia:dashboard-refresh";
/** Minimum ms between reloads. A quick tab switch shouldn't spam the server. */
const THROTTLE_MS = 12_000;

/**
 * Keep the dashboard cache warm without a manual reload: refetches when the
 * tab regains focus (visibilitychange → visible) and when anything in the
 * app dispatches an "arcadia:dashboard-refresh" custom event (Arcad chat
 * fires this after a schedule-changing action). Throttled so a burst of
 * events only round-trips once.
 *
 * Mount once from AppShell, no return value.
 */
export function useDashboardAutoRefresh(reload: () => Promise<void> | void): void {
  const lastRefreshRef = useRef(0);
  const reloadRef = useRef(reload);
  useEffect(() => {
    reloadRef.current = reload;
  }, [reload]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    function maybeRefresh(reason: string) {
      const now = Date.now();
      if (now - lastRefreshRef.current < THROTTLE_MS) return;
      lastRefreshRef.current = now;
      try {
        void reloadRef.current();
      } catch {
        /* swallow, a background refresh should never surface an error */
      }
      // Uncomment for local debugging:
      // console.debug("[arcadia] dashboard refresh", reason);
    }

    function onVisibility() {
      if (document.visibilityState === "visible") maybeRefresh("visibility");
    }
    function onCustom() {
      maybeRefresh("custom-event");
    }

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener(REFRESH_EVENT, onCustom);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener(REFRESH_EVENT, onCustom);
    };
  }, []);
}

/**
 * Broadcast a "refresh dashboard" hint from anywhere in the app, used by the
 * Arcad chat after a message whose response mutated the schedule so a Schedule
 * tab that's already open updates without a manual reload.
 */
export function requestDashboardRefresh(): void {
  if (typeof window === "undefined") return;
  try {
    window.dispatchEvent(new CustomEvent(REFRESH_EVENT));
  } catch {
    /* ignore */
  }
}
