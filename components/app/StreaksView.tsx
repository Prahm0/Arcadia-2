"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api/client";
import { useDashboardData } from "@/lib/app/DashboardProvider";
import { useStreak } from "@/lib/app/useStreak";
import { SUBJECT_COLORS } from "@/lib/app/categoryColors";
import PageHeader from "./PageHeader";
import StudySky, { type SkyTotals } from "./StudySky";

interface SkyResponse {
  sky: SkyTotals;
}

/**
 * The motivating side of progress: the study sky, its milestones and the
 * plan streak (days you did at least 70% of what you planned).
 * Analytics keeps the plain numbers and charts.
 */
export default function StreaksView() {
  const { data } = useDashboardData();
  const streak = useStreak();
  const [response, setResponse] = useState<SkyResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    // The sky is all-time, so the period doesn't matter.
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

      <StudySky sky={sky} streak={streak} loading={loading} subjectColours={subjectColours} />

      <div className="pb-16" />
    </>
  );
}
