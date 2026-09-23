"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api/client";
import { useDashboardData } from "@/lib/app/DashboardProvider";
import { useStreak } from "@/lib/app/useStreak";
import type { StreakSummary } from "@/lib/app/streaks";
import { SUBJECT_COLORS } from "@/lib/app/categoryColors";
import { dateKey } from "@/lib/api/time";
import PageHeader from "./PageHeader";
import StudySky, { type SkyTotals } from "./StudySky";
import AppButton from "./AppButton";
import ShareCard from "./ShareCard";

interface SkyResponse {
  sky: SkyTotals;
  daily: Array<{ date: string; sessions: number }>;
  current: { minutes: number; sessions: number };
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
  const [shareOpen, setShareOpen] = useState(false);

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
  const weekly = response?.current ?? { minutes: 0, sessions: 0 };
  const recoveries = useMemo(() => recoveriesThisWeek(streak, today), [streak, today]);
  const canShareWeek = !loading && weekly.minutes > 0 && weekly.sessions > 0;

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
      {canShareWeek ? (
        <div className="mx-auto flex w-full max-w-[1140px] flex-wrap items-center justify-between gap-3 px-6 pt-4 sm:px-10">
          <p className="text-[13px]" style={{ color: "var(--app-text-muted)" }}>
            Your week is worth sharing.
          </p>
          <AppButton
            variant="secondary"
            onClick={() => setShareOpen(true)}
            icon={<ShareIcon />}
          >
            Share my week
          </AppButton>
        </div>
      ) : null}

      <div className="pb-16" />
      {shareOpen ? (
        <ShareCard
          recap={{
            minutes: weekly.minutes,
            sessions: weekly.sessions,
            streak: streak.current,
            recoveries,
            starsLit: sky.sessions,
          }}
          onClose={() => setShareOpen(false)}
        />
      ) : null}
    </>
  );
}

function recoveriesThisWeek(streak: StreakSummary, today: string) {
  const weekStart = startOfWeek(today);
  return streak.history.filter((day) => day.recovered && day.key >= weekStart && day.key <= today).length;
}

function startOfWeek(key: string) {
  const anchor = new Date(`${key}T12:00:00Z`);
  const mondayOffset = (anchor.getUTCDay() + 6) % 7;
  anchor.setUTCDate(anchor.getUTCDate() - mondayOffset);
  return anchor.toISOString().slice(0, 10);
}

function ShareIcon() {
  return (
    <svg viewBox="0 0 20 20" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
      <circle cx="15" cy="5" r="2" /><circle cx="5" cy="10" r="2" /><circle cx="15" cy="15" r="2" />
      <path d="M6.8 9l6.2-3M6.8 11l6.2 3" strokeLinecap="round" />
    </svg>
  );
}
