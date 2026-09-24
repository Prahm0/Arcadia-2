"use client";

import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api/client";
import { useDashboardData } from "@/lib/app/DashboardProvider";
import { useStreak } from "@/lib/app/useStreak";
import { useStudySky } from "@/lib/app/StudySkyProvider";
import type { StreakSummary } from "@/lib/app/streaks";
import { SUBJECT_COLORS } from "@/lib/app/categoryColors";
import { dateKey } from "@/lib/api/time";
import PageHeader from "./PageHeader";
import AppButton from "./AppButton";
import ShareCard from "./ShareCard";
import StreakChain from "./streaks/StreakChain";
import YourSky, { type FocusTotals } from "./sky/YourSky";

interface AnalyticsResponse {
  sky: FocusTotals;
  current: { minutes: number; sessions: number };
  previous: { minutes: number; sessions: number };
}

interface Achievement {
  id: string; title: string; description: string; category: string; target: number; icon: string; current: number; unlockedAt: number | null;
}

/**
 * The motivating side of progress, in one place. On top, the streak: days
 * you did at least 70% of what you planned, drawn as a chain of stars. Under
 * it, your sky: constellations lit by every minute of focus, which stay lit
 * even when a streak breaks. Analytics keeps the plain numbers and charts.
 */
export default function StreaksView() {
  const { data } = useDashboardData();
  const streak = useStreak();
  const { sky } = useStudySky();
  const [response, setResponse] = useState<AnalyticsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [achievements, setAchievements] = useState<Achievement[]>([]);

  useEffect(() => {
    let cancelled = false;
    // All-time totals come with any period; "week" also gives the share recap.
    api<AnalyticsResponse>("/api/analytics?period=week")
      .then((value) => { if (!cancelled) setResponse(value); })
      .catch((err: unknown) => { if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load."); });
    return () => { cancelled = true; };
  }, []);
  useEffect(() => { void api<{ achievements: Achievement[] }>("/api/progress").then((value) => setAchievements(value.achievements)).catch(() => {}); }, []);

  const loading = !response && !error;
  const totals = response?.sky ?? { sessions: 0, minutes: 0, subjects: [] };
  const timezone = data.profile?.timezone || data.user.timezone || "Australia/Sydney";
  const today = dateKey(new Date().toISOString(), timezone);
  const subjectColours = new Map(
    data.subjects.map((subject, index) => [subject.name, subject.colour || SUBJECT_COLORS[index % SUBJECT_COLORS.length]]),
  );
  const weekly = response?.current ?? { minutes: 0, sessions: 0 };
  const previous = response?.previous ?? { minutes: 0, sessions: 0 };
  const recoveries = useMemo(() => recoveriesThisWeek(streak, today), [streak, today]);
  const collected = sky?.cards.filter((card) => card.earnedAt !== null).length;
  const canShareWeek = !loading && weekly.minutes > 0 && weekly.sessions > 0;
  const meta = [
    streak.current > 0 ? `${streak.current}-day streak` : "No streak yet",
    streak.longest > 0 ? `best ${streak.longest}` : null,
    collected === undefined ? null : `${collected} streak ${collected === 1 ? "card" : "cards"} collected`,
  ].filter(Boolean).join(" · ");

  return (
    <>
      <PageHeader
        width={1140}
        eyebrow="Progress"
        title="Streaks"
        meta={meta}
        tour="streaks"
        action={canShareWeek ? (
          <AppButton onClick={() => setShareOpen(true)} icon={<ShareIcon />}>Share my week</AppButton>
        ) : undefined}
      />

      <div className="mx-auto w-full max-w-[1140px] px-6 pb-16 pt-6 sm:px-10">
        {error ? (
          <p className="mb-4 text-[13px]" style={{ color: "var(--app-danger)" }}>{error}</p>
        ) : null}
        <StreakChain streak={streak} today={today} />
        <YourSky totals={totals} totalsLoading={loading} subjectColours={subjectColours} />
        <AchievementsCollection achievements={achievements} />
      </div>

      {shareOpen ? (
        <ShareCard
          recap={{
            minutes: weekly.minutes,
            sessions: weekly.sessions,
            streak: streak.current,
            recoveries,
            starsLit: totals.sessions,
            beatLastWeekBy: Math.max(0, weekly.minutes - previous.minutes),
          }}
          onClose={() => setShareOpen(false)}
        />
      ) : null}
    </>
  );
}

function AchievementsCollection({ achievements }: { achievements: Achievement[] }) {
  if (!achievements.length) return null;
  const unlocked = achievements.filter((achievement) => achievement.unlockedAt).length;
  return <section id="achievements" className="mt-7 rounded-xl border p-5 sm:p-6" style={{ background: "var(--app-surface)", borderColor: "var(--app-border)" }}>
    <div className="flex items-end justify-between gap-3"><div><p className="type-eyebrow" style={{ color: "var(--app-text-muted)" }}>Your collection</p><h2 className="mt-1 text-xl font-semibold tracking-tight">Achievements</h2></div><p className="text-sm tabular-nums" style={{ color: "var(--app-text-muted)" }}>{unlocked}/{achievements.length}</p></div>
    <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {achievements.map((achievement) => { const locked = !achievement.unlockedAt; const percentage = Math.min(100, Math.round((achievement.current / achievement.target) * 100)); return <article key={achievement.id} className="rounded-lg border p-4" style={{ borderColor: "var(--app-border)", opacity: locked ? 0.72 : 1, background: locked ? "var(--app-surface-soft)" : "color-mix(in oklab, var(--app-arcad-soft) 34%, var(--app-surface))" }}>
        <div className="flex items-start gap-3"><span className="grid size-9 shrink-0 place-items-center rounded-full text-lg" style={{ background: locked ? "var(--app-border)" : "var(--app-arcad)", color: locked ? "var(--app-text-muted)" : "white" }}>{locked ? "🔒" : achievement.icon}</span><div><p className="text-[11px] font-semibold uppercase tracking-[0.12em]" style={{ color: "var(--app-text-muted)" }}>{achievement.category}</p><h3 className="mt-0.5 text-sm font-semibold">{achievement.title}</h3><p className="mt-1 text-xs leading-5" style={{ color: "var(--app-text-muted)" }}>{achievement.description}</p></div></div>
        {locked ? <><div className="mt-4 h-1.5 overflow-hidden rounded-full" style={{ background: "var(--app-border)" }}><div className="h-full rounded-full" style={{ width: `${percentage}%`, background: "var(--app-arcad)" }} /></div><p className="mt-1.5 text-[11px] tabular-nums" style={{ color: "var(--app-text-muted)" }}>{achievement.current} of {achievement.target}</p></> : <p className="mt-4 text-[11px] font-semibold" style={{ color: "var(--app-arcad)" }}>Unlocked</p>}
      </article>; })}
    </div>
  </section>;
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
