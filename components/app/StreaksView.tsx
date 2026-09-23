"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api/client";
import { useDashboardData } from "@/lib/app/DashboardProvider";
import { useStreak } from "@/lib/app/useStreak";
import { STREAK_MILESTONES } from "@/lib/app/streaks";
import { SUBJECT_COLORS } from "@/lib/app/categoryColors";
import PageHeader from "./PageHeader";
import StudySky, { type SkyTotals } from "./StudySky";

interface SkyResponse {
  sky: SkyTotals;
  streaks: { current: number; longest: number };
}

/**
 * The motivating side of progress: the study sky, milestones and streaks.
 * Analytics keeps the plain numbers and charts.
 */
export default function StreaksView() {
  const { data } = useDashboardData();
  const streak = useStreak();
  const [response, setResponse] = useState<SkyResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    // The sky and focus streak are all-time, so the period doesn't matter.
    api<SkyResponse>("/api/analytics?period=week")
      .then((value) => { if (!cancelled) setResponse(value); })
      .catch((err: unknown) => { if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load."); });
    return () => { cancelled = true; };
  }, []);

  const loading = !response && !error;
  const sky = response?.sky ?? { sessions: 0, minutes: 0, subjects: [] };
  const subjectColours = new Map(
    data.subjects.map((subject, index) => [subject.name, subject.colour || SUBJECT_COLORS[index % SUBJECT_COLORS.length]]),
  );

  return (
    <>
      <PageHeader
        width={1140}
        eyebrow="Progress"
        title="Streaks"
        meta={`${streak.current}-day streak · longest ${streak.longest}`}
        tour="streaks"
      />

      {error ? (
        <p className="mx-auto w-full max-w-[1140px] px-6 pt-4 text-[13px] sm:px-10" style={{ color: "var(--app-danger)" }}>{error}</p>
      ) : null}

      <StudySky sky={sky} streak={response?.streaks.current ?? 0} loading={loading} subjectColours={subjectColours} />

      <div className="mx-auto w-full max-w-[1140px] px-6 pb-16 pt-6 sm:px-10">
        <div className="rounded-lg p-6" style={{ background: "var(--app-surface)", boxShadow: "var(--elev-1)" }}>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="type-eyebrow" style={{ color: "var(--app-text-muted)" }}>Plan streak</p>
            <p className="type-mono-label" style={{ color: "var(--app-text-muted)" }}>
              ≥70% of planned study minutes = consistent day
            </p>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-6">
            <div>
              <p className="text-[32px] tabular-nums font-medium" style={{ color: "var(--app-text)" }}>{streak.current}</p>
              <p className="mt-1 text-[13px]" style={{ color: "var(--app-text-muted)" }}>Current</p>
            </div>
            <div>
              <p className="text-[32px] tabular-nums font-medium" style={{ color: "var(--app-text)" }}>{streak.longest}</p>
              <p className="mt-1 text-[13px]" style={{ color: "var(--app-text-muted)" }}>Longest</p>
            </div>
          </div>

          <div className="mt-6">
            <p className="type-eyebrow" style={{ color: "var(--app-text-muted)" }}>Milestones</p>
            <ul className="mt-2.5 flex flex-wrap gap-2">
              {STREAK_MILESTONES.map((m) => {
                const hit = streak.current >= m || streak.longest >= m;
                const active = streak.current >= m;
                return (
                  <li
                    key={m}
                    className="flex items-center gap-1.5 rounded-md px-3 py-1 text-[12.5px] font-medium"
                    style={{
                      background: active ? "var(--app-accent)" : hit ? "var(--app-accent-soft)" : "var(--app-surface-soft)",
                      color: active ? "var(--app-accent-on)" : hit ? "var(--app-accent-strong)" : "var(--app-text-muted)",
                      border: `1px solid ${active || hit ? "transparent" : "var(--app-border)"}`,
                    }}
                  >
                    <span aria-hidden="true">{hit ? "★" : "☆"}</span>
                    {m}-day
                  </li>
                );
              })}
            </ul>
            {streak.nextMilestone && streak.daysToNext ? (
              <p className="mt-3 text-[13px]" style={{ color: "var(--app-text-muted)" }}>
                <span className="tabular-nums">{streak.daysToNext}</span> more consistent {streak.daysToNext === 1 ? "day" : "days"} to hit {streak.nextMilestone}.
              </p>
            ) : null}
          </div>

          {streak.current === 0 && streak.lastPlannedDay?.missReason ? (
            <p
              className="mt-4 rounded-md px-3 py-2.5 text-[13px]"
              style={{ background: "var(--app-surface-soft)", boxShadow: "var(--elev-inset)", color: "var(--app-text-soft)" }}
            >
              Streak reset, {streak.lastPlannedDay.missReason}.
            </p>
          ) : null}
        </div>
      </div>
    </>
  );
}
