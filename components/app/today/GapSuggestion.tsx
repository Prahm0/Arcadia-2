"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api/client";
import type { PlannerEvent, PriorityPick } from "@/lib/api/types";
import { formatClock } from "@/lib/api/time";
import { useDashboardData } from "@/lib/app/DashboardProvider";

/** A gap shorter than this isn't worth filling. */
const MIN_GAP_MINUTES = 25;
/** How long a suggested block runs when the gap is longer. */
const MAX_BLOCK_MINUTES = 60;

/**
 * When nothing's on right now and the next thing is a while off, one thing
 * from Priorities: "Free until 2:15pm · Do a few of those methods questions".
 * Add makes it a block in the gap; Not now moves to the next priority.
 */
export default function GapSuggestion({
  events,
  picks,
  today,
  timezone,
  dayStartMs,
}: {
  /** Everything on today's timeline that hasn't finished. */
  events: PlannerEvent[];
  picks: PriorityPick[];
  today: string;
  timezone: string;
  dayStartMs: number;
}) {
  const { reload } = useDashboardData();
  const [now, setNow] = useState(() => Date.now());
  const [skipped, setSkipped] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const live = events.filter((event) => event.status !== "cancelled" && event.outcome === "planned");
  if (live.some((event) => Date.parse(event.startAt) <= now && Date.parse(event.endAt) > now)) return null;
  const next = live
    .map((event) => Date.parse(event.startAt))
    .filter((start) => start > now)
    .sort((a, b) => a - b)[0];
  const until = next ?? dayStartMs + 24 * 60 * 60_000;
  if ((until - now) / 60_000 < MIN_GAP_MINUTES) return null;
  const pick = picks.find((item) => !skipped.includes(item.id));
  if (!pick) return null;

  async function add() {
    if (!pick) return;
    setBusy(true);
    // From the next five minutes to the next thing, or an hour.
    const start = Math.ceil((now - dayStartMs) / 60_000 / 5) * 5;
    const end = Math.min(start + MAX_BLOCK_MINUTES, Math.floor((until - dayStartMs) / 60_000), 24 * 60);
    try {
      await api("/api/today/lines", {
        method: "POST",
        body: JSON.stringify({ day: today, title: pick.text, subject: pick.subject, start, end, evening: false }),
      });
      await reload();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-2 mb-1 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md px-3 py-2.5 sm:mx-3" style={{ background: "var(--app-surface-soft)" }}>
      <p className="min-w-0 flex-1 text-[14px]" style={{ color: "var(--app-text)" }}>
        <span style={{ color: "var(--app-text-muted)" }}>{next ? `Free until ${formatClock(new Date(next).toISOString(), timezone)}` : "Free now"} · </span>
        {pick.text}
      </p>
      <span className="flex shrink-0 items-center gap-3">
        <button type="button" onClick={() => setSkipped((list) => [...list, pick.id])} className="text-[13px] hover:underline" style={{ color: "var(--app-text-muted)" }}>
          Not now
        </button>
        <button
          type="button"
          onClick={() => void add()}
          disabled={busy}
          className="ui-press rounded-full px-3.5 py-1.5 text-[13px] font-semibold disabled:opacity-60"
          style={{ background: "var(--app-accent)", color: "var(--app-accent-on)" }}
        >
          Add
        </button>
      </span>
    </div>
  );
}
