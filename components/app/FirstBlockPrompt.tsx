"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useDashboardData } from "@/lib/app/DashboardProvider";
import type { PlannerEvent } from "@/lib/api/types";

const PENDING_KEY = "arcadia:first-block-prompt";

/** Called when onboarding finishes: the next visit to Today offers the first block. */
export function markFirstBlockPrompt(userId: string): void {
  try {
    window.localStorage.setItem(PENDING_KEY, userId);
  } catch {
    /* private mode: they still have Today's Start button */
  }
}

/**
 * Right after onboarding, one full-screen nudge to start the first study
 * block now. Students who finish one block on day one come back; most who
 * don't, never do (only about 1 in 4 who onboarded ever ticked a block).
 * Shown once, and only when there's a block left to start today.
 */
export default function FirstBlockPrompt() {
  const { data } = useDashboardData();
  const [block, setBlock] = useState<PlannerEvent | null>(null);

  useEffect(() => {
    let mine = false;
    try {
      mine = window.localStorage.getItem(PENDING_KEY) === data.user.id;
    } catch {
      /* never shown */
    }
    if (!mine) return;
    // The next study block still to come today, if there is one.
    const now = Date.now();
    const first = data.events
      .filter((event) => event.category === "study" && event.outcome === "planned" && event.status !== "cancelled" && Date.parse(event.endAt) > now)
      .sort((a, b) => Date.parse(a.startAt) - Date.parse(b.startAt))[0];
    if (!first || new Date(first.startAt).toDateString() !== new Date(now).toDateString()) return;
    const timer = window.setTimeout(() => setBlock(first), 600);
    return () => window.clearTimeout(timer);
  }, [data.user.id, data.events]);

  function dismiss() {
    try {
      window.localStorage.removeItem(PENDING_KEY);
    } catch {
      /* fine */
    }
    setBlock(null);
  }

  if (!block) return null;

  const minutes = Math.round((Date.parse(block.endAt) - Date.parse(block.startAt)) / 60_000);
  const name = block.subject || block.title;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="first-block-title"
      className="fixed inset-0 z-[130] flex flex-col items-center justify-center px-6 text-center app-enter"
      style={{ background: "var(--app-hero)", color: "var(--app-hero-on)" }}
    >
      <p className="text-[13px] font-semibold uppercase tracking-[0.14em]" style={{ opacity: 0.7 }}>Your plan&apos;s ready</p>
      <h2 id="first-block-title" className="mt-3 max-w-sm text-[30px] font-semibold leading-tight tracking-[-0.02em]">
        Start your first block now?
      </h2>
      <p className="mt-3 max-w-sm text-[15.5px] leading-snug" style={{ opacity: 0.8 }}>
        {name}, {minutes} min. Even 10 minutes today makes tomorrow easier.
      </p>
      <Link
        href={`/app/sessions?eventId=${encodeURIComponent(block.id)}&start=1`}
        onClick={dismiss}
        className="ui-press mt-8 inline-flex h-12 w-full max-w-xs items-center justify-center rounded-full text-[16px] font-semibold"
        style={{ background: "var(--app-hero-cta)", color: "var(--app-hero-cta-on)" }}
      >
        Start now
      </Link>
      <button
        type="button"
        onClick={dismiss}
        className="ui-press mt-4 rounded-full px-4 py-2 text-[14.5px] font-medium underline-offset-4 hover:underline"
        style={{ opacity: 0.75 }}
      >
        I&apos;ll start it later
      </button>
    </div>
  );
}
