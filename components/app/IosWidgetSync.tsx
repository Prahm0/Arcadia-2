"use client";

import { useEffect, useMemo, useSyncExternalStore } from "react";
import type { PlannerEvent } from "@/lib/api/types";
import { useDashboardData } from "@/lib/app/DashboardProvider";
import { dateKey } from "@/lib/api/time";
import { updateNativeWidgets, type ArcadiaWidgetSnapshot } from "@/lib/capacitor/widgetData";
import { useStreak } from "@/lib/app/useStreak";

function minutesBetween(startAt: string, endAt: string) {
  return Math.max(0, Math.round((Date.parse(endAt) - Date.parse(startAt)) / 60_000));
}

function nextStudyEvent(events: PlannerEvent[], now: number) {
  const upcoming = events
    .filter((event) => event.category === "study" && event.status !== "cancelled" && event.outcome !== "missed" && Date.parse(event.endAt) > now)
    .sort((a, b) => Date.parse(a.startAt) - Date.parse(b.startAt));
  const current = upcoming.find((event) => Boolean(event.startedAt) || Date.parse(event.startAt) <= now);
  return { event: current ?? upcoming[0] ?? null, isNow: Boolean(current) };
}

const clockListeners = new Set<() => void>();
let widgetClock = 0;
let clockTimer: number | null = null;

function refreshClock() {
  widgetClock = Date.now();
  clockListeners.forEach((listener) => listener());
}

function subscribeClock(listener: () => void) {
  clockListeners.add(listener);
  if (!clockTimer) {
    refreshClock();
    clockTimer = window.setInterval(refreshClock, 60_000);
  }
  return () => {
    clockListeners.delete(listener);
    if (clockListeners.size === 0 && clockTimer) {
      window.clearInterval(clockTimer);
      clockTimer = null;
    }
  };
}

function useWidgetClock() {
  return useSyncExternalStore(subscribeClock, () => widgetClock, () => 0);
}

/** Keeps iOS Home Screen widgets fresh whenever Arcadia's dashboard refreshes. */
export default function IosWidgetSync() {
  const { data } = useDashboardData();
  const { current: streakDays } = useStreak();
  const now = useWidgetClock();
  const timezone = data.profile?.timezone || data.user.timezone || "Australia/Brisbane";

  const snapshot = useMemo<ArcadiaWidgetSnapshot>(() => {
    const today = dateKey(new Date(now).toISOString(), timezone);
    const todayEvents = data.events.filter(
      (event) => event.category === "study" && event.status !== "cancelled" && dateKey(event.startAt, timezone) === today,
    );
    const plannedMinutes = todayEvents.reduce((total, event) => total + minutesBetween(event.startAt, event.endAt), 0);
    const completedMinutes = todayEvents
      .filter((event) => event.outcome === "completed")
      .reduce((total, event) => total + minutesBetween(event.startAt, event.endAt), 0);
    const next = nextStudyEvent(data.events, now);
    return {
      version: 1,
      updatedAt: new Date(now).toISOString(),
      today: {
        minutes: Math.max(data.analytics.todayMinutes ?? 0, completedMinutes),
        plannedMinutes,
        streakDays,
      },
      next: next.event
        ? {
          id: next.event.id,
          title: next.event.title,
          subject: next.event.subject ?? null,
          startAt: next.event.startAt,
          endAt: next.event.endAt,
          isNow: next.isNow,
        }
        : null,
    };
  }, [data.analytics.todayMinutes, data.events, now, streakDays, timezone]);

  useEffect(() => {
    const sync = () => void updateNativeWidgets(snapshot).catch(() => {
      // Widgets are optional. An older installed shell simply does not have
      // the native bridge yet.
    });
    sync();
    window.addEventListener("focus", sync);
    document.addEventListener("visibilitychange", sync);
    return () => {
      window.removeEventListener("focus", sync);
      document.removeEventListener("visibilitychange", sync);
    };
  }, [snapshot]);

  return null;
}
