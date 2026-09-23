"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api/client";
import { useDashboardData } from "@/lib/app/DashboardProvider";
import { useStreak } from "@/lib/app/useStreak";
import { SUBJECT_COLORS } from "@/lib/app/categoryColors";
import { dateKey } from "@/lib/api/time";
import PageHeader from "./PageHeader";
import StudySky, { type SkyTotals } from "./StudySky";

interface SkyResponse {
  sky: SkyTotals;
  daily: Array<{ date: string; sessions: number }>;
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
  const timezone = data.profile?.timezone || data.user.timezone || "Australia/Sydney";
  const today = dateKey(new Date().toISOString(), timezone);
  // Focus sessions, including a free-timer block with no scheduled event,
  // are the stars. The dashboard remains the source of the plan streak.
  const todayStars = response?.daily.find((bucket) => bucket.date === today)?.sessions ?? 0;
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

      <StudySky sky={sky} streak={streak} loading={loading} subjectColours={subjectColours} todayStars={todayStars} />

      <div className="mx-auto w-full max-w-[1140px] px-6 pt-6 text-center sm:px-10">
        <Link href="/app/sky" className="text-[13px] font-medium underline underline-offset-4" style={{ color: "var(--app-accent)" }}>
          Explore Constellation Cards
        </Link>
      </div>

      <div className="pb-16" />
    </>
  );
}
