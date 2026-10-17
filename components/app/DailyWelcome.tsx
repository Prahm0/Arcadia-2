"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api/client";
import { dateKey } from "@/lib/api/time";
import { useDashboardData } from "@/lib/app/DashboardProvider";
import { hasCompletedStudyBlock } from "@/lib/app/firstStudyBlock";

type Progress = { todayRing: { doneMinutes: number; goalMinutes: number; closed: boolean; restDay?: boolean } };

function todayKey(userId: string, timezone: string) {
  return `arcadia:daily-welcome:${userId}:${dateKey(new Date().toISOString(), timezone)}`;
}

function message(ring: Progress["todayRing"]): string {
  if (ring.restDay) return "Welcome back. Nothing planned today, so enjoy the rest.";
  if (ring.closed) return "Welcome back. Today’s ring is already closed.";
  const left = Math.max(0, ring.goalMinutes - ring.doneMinutes);
  return `Welcome back. ${left} ${left === 1 ? "minute" : "minutes"} of study to close today’s ring.`;
}

/**
 * A once-a-day checkpoint on Today. It shows on the first visit of the day
 * and never interrupts the student; dismissing it just hides it sooner.
 */
export default function DailyWelcome() {
  const { data } = useDashboardData();
  const [progress, setProgress] = useState<Progress | null>(null);
  const timezone = data.profile?.timezone || data.user.timezone || "Australia/Sydney";
  const completed = data.events.filter((event) => event.category === "study" && event.outcome === "completed");
  const today = dateKey(new Date().toISOString(), timezone);
  const firstStudyDay = completed.length > 0 && completed.every((event) => dateKey(event.endAt, timezone) === today);

  useEffect(() => {
    // The first session is for seeing the plan work, not another message to
    // read. A welcome starts on a later day once study has actually happened.
    if (!hasCompletedStudyBlock(data.events) || firstStudyDay) return;
    try {
      if (localStorage.getItem(todayKey(data.user.id, timezone)) === "1") return;
    } catch {
      /* no storage: show it, it's harmless */
    }
    void api<Progress>("/api/progress")
      .then((value) => {
        setProgress(value);
        try {
          localStorage.setItem(todayKey(data.user.id, timezone), "1");
        } catch {
          /* ignore */
        }
      })
      .catch(() => {});
  }, [data.events, data.user.id, firstStudyDay, timezone]);
  if (!progress) return null;
  return (
    <div className="mx-auto flex w-full max-w-[1160px] items-center justify-between gap-3 px-6 pt-3 sm:px-10" role="status">
      <div className="flex min-w-0 items-center gap-2 rounded-lg border px-3 py-2 text-[12px]" style={{ borderColor: "var(--app-border)", background: "var(--app-surface-soft)", color: "var(--app-text-muted)" }}>
        <span aria-hidden="true" style={{ color: "var(--app-arcad)" }}>✦</span>
        <span className="truncate">{message(progress.todayRing)}</span>
      </div>
      <button type="button" onClick={() => setProgress(null)} className="ui-press shrink-0 rounded-md px-2 py-1 text-[12px]" style={{ color: "var(--app-text-muted)" }}>
        Dismiss
      </button>
    </div>
  );
}
