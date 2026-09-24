"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api/client";

type Progress = { todayRing: { doneMinutes: number; goalMinutes: number; closed: boolean; restDay?: boolean } };

function todayKey() {
  return `arcadia:daily-welcome:${new Date().toLocaleDateString("en-CA")}`;
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
  const [progress, setProgress] = useState<Progress | null>(null);
  useEffect(() => {
    try {
      if (localStorage.getItem(todayKey()) === "1") return;
    } catch {
      /* no storage: show it, it's harmless */
    }
    void api<Progress>("/api/progress")
      .then((value) => {
        setProgress(value);
        try {
          localStorage.setItem(todayKey(), "1");
        } catch {
          /* ignore */
        }
      })
      .catch(() => {});
  }, []);
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
