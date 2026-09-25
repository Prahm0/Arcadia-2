"use client";

import { useEffect, useRef } from "react";
import { useDashboardData } from "@/lib/app/DashboardProvider";
import {
  getLeadMinutes,
  isReminderEnabled,
  notificationsSupported,
  REMINDER_PREFERENCES_CHANGED,
  showNotification,
} from "@/lib/app/notifications";
import { formatClock } from "@/lib/api/time";

/**
 * How often we recompute the reminder schedule. Cheap because the scheduler
 * only ever tracks the next handful of events, and we always cancel the
 * previous timers before installing new ones.
 */
const RESCHEDULE_INTERVAL_MS = 60 * 1000;

/**
 * Schedules local browser notifications (`Notification` API) for the user's
 * upcoming study and sleep blocks. Runs entirely in the tab, no service worker, so
 * reminders only fire while the app is open somewhere. That's the common
 * case for a student who leaves Arcadia open in a background tab; a proper
 * push-when-closed pipeline needs a service worker + backend cron and is a
 * follow-up.
 *
 * Mount once at the app shell.
 */
export function useSessionReminders(): void {
  const { data } = useDashboardData();
  const timersRef = useRef<number[]>([]);

  useEffect(() => {
    if (!notificationsSupported()) return;

    function scheduleUpcoming() {
      // Cancel any previously-scheduled timers before installing new ones ,
      // this covers reschedules, event mutations, and general drift.
      for (const id of timersRef.current) window.clearTimeout(id);
      timersRef.current = [];
      if (!isReminderEnabled()) return;

      const now = Date.now();
      const leadMs = getLeadMinutes() * 60 * 1000;
      const timezone = data.profile?.timezone || data.user.timezone || "Australia/Sydney";

      const eligible = data.events
        .filter((event) => (event.category === "study" || event.category === "sleep") && event.outcome === "planned")
        .filter((event) => Date.parse(event.startAt) - leadMs > now)
        .filter((event) => Date.parse(event.startAt) - leadMs - now < 12 * 60 * 60 * 1000)
        .sort((a, b) => Date.parse(a.startAt) - Date.parse(b.startAt));
      // Keep the study cap, but reserve a timer for tonight's sleep so a busy
      // study schedule cannot push bedtime out of the reminder window.
      const upcoming = [
        ...eligible.filter((event) => event.category === "study").slice(0, 4),
        ...eligible.filter((event) => event.category === "sleep").slice(0, 1),
      ].sort((a, b) => Date.parse(a.startAt) - Date.parse(b.startAt));

      for (const event of upcoming) {
        const fireAt = Date.parse(event.startAt) - leadMs;
        const delay = Math.max(0, fireAt - Date.now());
        // setTimeout clamps at 2**31 - 1; anything larger is inside our
        // 12-hour filter above, so this is safe.
        const id = window.setTimeout(() => {
          const minutesUntil = Math.max(
            0,
            Math.round((Date.parse(event.startAt) - Date.now()) / 60000),
          );
          if (event.category === "sleep") {
            showNotification({
              title: minutesUntil <= 0 ? "Sleep · starting now" : `Sleep · in ${minutesUntil} min`,
              body: `Time to wind down. Rest helps you recharge for tomorrow. Bedtime: ${formatClock(event.startAt, timezone)}.`,
              tag: `arcadia:event:${event.id}`,
              href: `/app/schedule?eventId=${encodeURIComponent(event.id)}`,
            });
            return;
          }
          const subject = event.subject || "Study block";
          const body =
            minutesUntil <= 0
              ? `${event.title} · starting now`
              : `${event.title} · in ${minutesUntil} min`;
          showNotification({
            title: minutesUntil <= 0 ? `${subject} · starting now` : `${subject} · in ${minutesUntil} min`,
            body: `${body} · ${formatClock(event.startAt, timezone)}`,
            tag: `arcadia:event:${event.id}`,
            href: `/app/focus?eventId=${encodeURIComponent(event.id)}`,
          });
        }, delay);
        timersRef.current.push(id);
      }
    }

    scheduleUpcoming();
    const interval = window.setInterval(scheduleUpcoming, RESCHEDULE_INTERVAL_MS);
    window.addEventListener(REMINDER_PREFERENCES_CHANGED, scheduleUpcoming);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener(REMINDER_PREFERENCES_CHANGED, scheduleUpcoming);
      for (const id of timersRef.current) window.clearTimeout(id);
      timersRef.current = [];
    };
  }, [data.events, data.profile?.timezone, data.user.timezone]);
}
