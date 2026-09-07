"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useDashboardData } from "@/lib/app/DashboardProvider";
import { useStreak } from "@/lib/app/useStreak";
import {
  buildWeeklyReview,
  previousWeekWindow,
  weekWindowContaining,
} from "@/lib/app/weeklyReview";
import { formatDurationMinutes } from "@/lib/api/time";

interface WeeklyReviewCardProps {
  /**
   * "previous" (default) reviews the most recent completed week.
   * "current" reviews the in-progress week — used for the /app/review page
   * when today is late in the week.
   */
  window?: "previous" | "current";
  /** Inline variant renders a lighter card meant to slot into Today. */
  inline?: boolean;
  /** Optional CTA link at the bottom (e.g. "See full review"). */
  cta?: { href: string; label: string };
}

export default function WeeklyReviewCard({
  window: which = "previous",
  inline = false,
  cta,
}: WeeklyReviewCardProps) {
  const { data } = useDashboardData();
  const streak = useStreak();
  const timezone = data.profile?.timezone || data.user.timezone || "Australia/Sydney";

  const review = useMemo(() => {
    const now = new Date();
    const win =
      which === "current"
        ? weekWindowContaining(now, timezone)
        : previousWeekWindow(now, timezone);
    return buildWeeklyReview(data.events, win, timezone);
  }, [data.events, timezone, which]);

  if (!review.hasData) {
    return (
      <div
        className="rounded-[14px] p-5"
        style={{
          background: inline ? "var(--app-surface-soft)" : "var(--app-surface)",
          border: "1px solid var(--app-border)",
        }}
      >
        <p className="type-eyebrow" style={{ color: "var(--app-text-muted)" }}>
          {which === "current" ? "This week" : "Last week"} · {review.window.label}
        </p>
        <p className="mt-2 text-[14px]" style={{ color: "var(--app-text-muted)" }}>
          No study blocks landed in that window yet — nothing to review.
        </p>
      </div>
    );
  }

  const pctOverall = Math.round(review.ratio * 100);
  const consistentLine =
    review.consistentDays > 0
      ? `${review.consistentDays} of ${review.plannedDays} planned ${review.plannedDays === 1 ? "day" : "days"} hit 70%`
      : `${review.plannedDays} planned ${review.plannedDays === 1 ? "day" : "days"} · none crossed the 70% line`;

  return (
    <div
      className="rounded-[14px] p-5"
      style={{
        background: inline ? "var(--app-surface-soft)" : "var(--app-surface)",
        border: "1px solid var(--app-border)",
      }}
    >
      <div className="flex items-baseline justify-between gap-2">
        <p className="type-eyebrow" style={{ color: "var(--app-text-muted)" }}>
          {which === "current" ? "This week" : "Last week"} · {review.window.label}
        </p>
        <p className="type-mono-label" style={{ color: "var(--app-text-muted)" }}>
          {formatDurationMinutes(review.totalDone)} of {formatDurationMinutes(review.totalPlanned)}
        </p>
      </div>

      {/* Overall ratio bar */}
      <div className="mt-3">
        <div
          className="h-1.5 w-full overflow-hidden rounded-full"
          style={{ background: "var(--app-surface-soft)", border: "1px solid var(--app-border)" }}
          aria-hidden="true"
        >
          <div
            className="h-full rounded-full"
            style={{
              width: `${Math.min(100, pctOverall)}%`,
              background: pctOverall >= 70 ? "var(--app-success)" : "var(--app-accent)",
              transition: "width 0.35s var(--ease-out-expo, ease-out)",
            }}
          />
        </div>
        <p className="mt-1.5 type-mono-label" style={{ color: "var(--app-text-muted)" }}>
          {pctOverall}% of planned time · {review.sessionsDone} of {review.sessionsPlanned} sessions
        </p>
      </div>

      {/* Win / Adjustment / Streak */}
      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        <LabeledLine
          label="Win"
          message={review.win?.message ?? "Small progress — worth noting anyway."}
          tone="success"
        />
        <LabeledLine
          label="Adjustment"
          message={review.adjustment?.message ?? "Nothing obvious to change — hold the pattern."}
          tone="warn"
        />
        <LabeledLine
          label="Streak"
          message={
            streak.current > 0
              ? `${streak.current} consistent ${streak.current === 1 ? "day" : "days"} · longest ${streak.longest}`
              : streak.lastPlannedDay?.missReason
                ? `Reset — ${streak.lastPlannedDay.missReason}.`
                : `Longest ${streak.longest} ${streak.longest === 1 ? "day" : "days"}`
          }
          tone="accent"
        />
      </div>

      {/* Per-subject */}
      {review.subjects.length > 0 ? (
        <div className="mt-5">
          <p className="type-eyebrow" style={{ color: "var(--app-text-muted)" }}>
            By subject
          </p>
          <ul className="mt-2.5 flex flex-col gap-2.5">
            {review.subjects.slice(0, inline ? 3 : 6).map((subject) => {
              const pct = Math.round(subject.ratio * 100);
              return (
                <li key={subject.subject}>
                  <div className="flex items-baseline justify-between text-[13.5px]">
                    <span style={{ color: "var(--app-text)" }}>{subject.subject}</span>
                    <span className="type-mono-label" style={{ color: "var(--app-text-muted)" }}>
                      {formatDurationMinutes(subject.doneMinutes)} / {formatDurationMinutes(subject.plannedMinutes)} · {pct}%
                    </span>
                  </div>
                  <div
                    className="mt-1 h-1 overflow-hidden rounded-full"
                    style={{ background: "var(--app-border)" }}
                    aria-hidden="true"
                  >
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${Math.min(100, pct)}%`,
                        background: pct >= 70 ? "var(--app-success)" : "var(--app-accent)",
                      }}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      {cta ? (
        <div className="mt-5">
          <Link
            href={cta.href}
            className="text-[13px] font-medium underline underline-offset-4"
            style={{ color: "var(--app-accent-strong)" }}
          >
            {cta.label}
          </Link>
        </div>
      ) : null}

      {!cta && !inline ? (
        <p className="mt-5 type-mono-label" style={{ color: "var(--app-text-muted)" }}>
          {consistentLine}
        </p>
      ) : null}
    </div>
  );
}

function LabeledLine({
  label,
  message,
  tone,
}: {
  label: string;
  message: string;
  tone: "success" | "warn" | "accent";
}) {
  const dotColor =
    tone === "success"
      ? "var(--app-success)"
      : tone === "warn"
        ? "var(--app-accent-strong)"
        : "var(--app-accent)";
  return (
    <div
      className="rounded-[10px] p-3"
      style={{ background: "var(--app-surface-soft)", border: "1px solid var(--app-border)" }}
    >
      <div className="flex items-center gap-1.5">
        <span aria-hidden="true" className="size-1.5 rounded-full" style={{ background: dotColor }} />
        <p className="type-eyebrow" style={{ color: "var(--app-text-muted)" }}>
          {label}
        </p>
      </div>
      <p className="mt-1.5 text-[13.5px] leading-snug" style={{ color: "var(--app-text)" }}>
        {message}
      </p>
    </div>
  );
}
