"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api/client";

type Progress = { todayRing: { doneMinutes: number; goalMinutes: number; closed: boolean }; personalBests: { longestStreak?: number } };

/** A once-a-day, dismissible checkpoint. It never interrupts the student. */
export default function DailyWelcome() {
  const [progress, setProgress] = useState<Progress | null>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    void api<Progress>("/api/progress").then((value) => {
      const key = `arcadia:daily-welcome:${new Date().toLocaleDateString("en-CA")}`;
      try { if (sessionStorage.getItem(key) === "1") return; } catch { /* show once per page when storage is unavailable */ }
      setProgress(value);
      setVisible(true);
    }).catch(() => {});
  }, []);
  if (!visible || !progress) return null;
  const ring = progress.todayRing;
  return <div className="mx-auto flex w-full max-w-[1160px] items-center justify-between gap-3 px-6 pt-3 sm:px-10" role="status">
    <div className="flex min-w-0 items-center gap-2 rounded-lg border px-3 py-2 text-[12px]" style={{ borderColor: "var(--app-border)", background: "var(--app-surface-soft)", color: "var(--app-text-muted)" }}><span aria-hidden="true" style={{ color: "var(--app-arcad)" }}>✦</span><span className="truncate">{ring.closed ? "Welcome back. Today’s ring is already closed." : `Welcome back. ${ring.doneMinutes} of ${ring.goalMinutes} minutes toward today’s ring.`}</span></div>
    <button type="button" onClick={() => { try { sessionStorage.setItem(`arcadia:daily-welcome:${new Date().toLocaleDateString("en-CA")}`, "1"); } catch {} setVisible(false); }} className="ui-press shrink-0 rounded-md px-2 py-1 text-[12px]" style={{ color: "var(--app-text-muted)" }}>Dismiss</button>
  </div>;
}
