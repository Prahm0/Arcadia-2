"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useDashboardData } from "@/lib/app/DashboardProvider";
import type { PlannerEvent } from "@/lib/api/types";
import { dateKey, formatDurationMinutes } from "@/lib/api/time";

const STORAGE_PREFIX = "arcadia:checkin:dismissed:";

/**
 * A once-a-day recap card shown at the top of Today.
 *
 * Only appears when yesterday actually had study blocks in the plan — nothing
 * to check in on for a fresh account. Dismissal is remembered per-day in
 * localStorage so a page refresh doesn't bring it back.
 */
export default function DailyCheckInCard() {
  const { data } = useDashboardData();
  const timezone = data.profile?.timezone || data.user.timezone || "Australia/Sydney";
  const [visible, setVisible] = useState(false);

  const summary = useMemo(() => {
    const now = new Date();
    const todayKey = dateKey(now.toISOString(), timezone);
    const yesterdayKey = shiftDayKey(todayKey, -1);
    const yesterdaysStudy = data.events.filter(
      (event) => event.category === "study" && dateKey(event.startAt, timezone) === yesterdayKey,
    );
    if (yesterdaysStudy.length === 0) return null;
    return summarise(yesterdaysStudy, yesterdayKey);
  }, [data.events, timezone]);

  const storageKey = summary ? `${STORAGE_PREFIX}${summary.yesterdayKey}` : null;

  useEffect(() => {
    if (!storageKey) {
      setVisible(false);
      return;
    }
    let dismissed = false;
    try {
      dismissed = window.localStorage.getItem(storageKey) === "1";
    } catch {
      /* ignore */
    }
    setVisible(!dismissed);
  }, [storageKey]);

  function dismiss() {
    if (storageKey) {
      try {
        window.localStorage.setItem(storageKey, "1");
      } catch {
        /* ignore */
      }
    }
    setVisible(false);
  }

  if (!summary || !visible) return null;

  const currentStreak = Number(data.analytics?.currentStreak ?? 0);
  const streakLine = streakSentence(currentStreak, summary);

  return (
    <div
      className="hero-fade-up mb-6 flex flex-wrap items-start gap-4 rounded-[14px] px-5 py-4"
      style={{
        background: "var(--app-accent-soft)",
        border: "1px solid color-mix(in oklab, var(--app-accent) 25%, var(--app-border))",
        color: "var(--app-text)",
      }}
    >
      <span
        aria-hidden="true"
        className="mt-1 grid size-6 shrink-0 place-items-center rounded-full"
        style={{ background: "var(--app-accent)", color: "white" }}
      >
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
          <path d="M6 1v3M6 8v3M1 6h3M8 6h3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </span>
      <div className="min-w-0 flex-1">
        <p className="type-eyebrow" style={{ color: "var(--app-accent-strong)" }}>
          Arcad · Yesterday
        </p>
        <p className="mt-1.5 text-[15px] leading-snug" style={{ color: "var(--app-text)" }}>
          {summary.headline}
          {summary.detail ? (
            <span style={{ color: "var(--app-text-soft)" }}> {summary.detail}</span>
          ) : null}
        </p>
        {streakLine ? (
          <p className="mt-1 text-[13px]" style={{ color: "var(--app-text-muted)" }}>
            {streakLine}
          </p>
        ) : null}
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <Link
            href="/app/arcad"
            className="rounded-full px-3 py-1.5 text-[12.5px] font-medium transition-colors"
            style={{ background: "var(--app-accent)", color: "white" }}
            onClick={dismiss}
          >
            Talk to Arcad
          </Link>
          <button
            type="button"
            onClick={dismiss}
            className="text-[12.5px] font-medium"
            style={{ color: "var(--app-text-muted)" }}
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}

interface Summary {
  yesterdayKey: string;
  completedCount: number;
  totalCount: number;
  missedMinutes: number;
  completedMinutes: number;
  headline: string;
  detail?: string;
  cleanSlate: boolean;
}

function summarise(events: PlannerEvent[], yesterdayKey: string): Summary {
  const total = events.length;
  const completed = events.filter((event) => event.outcome === "completed");
  const missed = events.filter((event) => event.outcome === "missed");
  const completedMinutes = sumMinutes(completed);
  const missedMinutes = sumMinutes(missed);
  const cleanSlate = completed.length === total;

  let headline: string;
  if (total === 0) {
    headline = "Yesterday was a quiet day.";
  } else if (cleanSlate) {
    headline =
      total === 1
        ? "Yesterday you finished the one session on your plan."
        : `Yesterday you finished all ${total} sessions.`;
  } else if (completed.length === 0) {
    headline =
      total === 1
        ? "You had one study block yesterday that didn't happen."
        : `You had ${total} study blocks yesterday that didn't happen.`;
  } else {
    headline = `Yesterday you did ${completed.length} of ${total} study sessions.`;
  }

  let detail: string | undefined;
  if (!cleanSlate && missed.length > 0) {
    const subjects = uniqueSubjects(missed);
    if (missedMinutes > 0 && subjects.length === 1) {
      detail = `${subjects[0]} slipped by ${formatDurationMinutes(missedMinutes)}.`;
    } else if (missedMinutes > 0) {
      detail = `${formatDurationMinutes(missedMinutes)} of study moved forward.`;
    }
  }

  return {
    yesterdayKey,
    completedCount: completed.length,
    totalCount: total,
    completedMinutes,
    missedMinutes,
    headline,
    detail,
    cleanSlate,
  };
}

function sumMinutes(events: PlannerEvent[]): number {
  return events.reduce(
    (total, event) => total + Math.max(0, (Date.parse(event.endAt) - Date.parse(event.startAt)) / 60000),
    0,
  );
}

function uniqueSubjects(events: PlannerEvent[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const event of events) {
    const name = event.subject?.trim();
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(name);
  }
  return out;
}

function streakSentence(currentStreak: number, summary: Summary): string | null {
  if (summary.cleanSlate && summary.totalCount > 0) {
    if (currentStreak >= 3) return `That's ${currentStreak} consistent days in a row.`;
    if (currentStreak === 2) return "Two in a row — one more locks a 3-day streak.";
    if (currentStreak === 1) return "Nice — that's day one of a new streak.";
  }
  if (!summary.cleanSlate && summary.completedCount > 0) {
    return "Not everything, but something — that still counts.";
  }
  return null;
}

function shiftDayKey(key: string, days: number): string {
  const [y, m, d] = key.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}
