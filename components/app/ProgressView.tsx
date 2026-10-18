"use client";

import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api/client";
import { useDashboardData } from "@/lib/app/DashboardProvider";
import { useStreak } from "@/lib/app/useStreak";
import { useStudySky } from "@/lib/app/StudySkyProvider";
import { reviewLeads, weekProgress } from "@/lib/app/weekProgress";
import { dateKey } from "@/lib/api/time";
import { nextLevelUnlock } from "@/shared/progress";
import PageHeader from "./PageHeader";
import AppButton from "./AppButton";
import ShareCard from "./ShareCard";
import WeeklyReviewCard from "./WeeklyReviewCard";
import ConsistencyHeatmap from "./ConsistencyHeatmap";
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

interface ProgressResponse {
  xp: number;
  level: number;
  title: string;
  levelProgress: { current: number; needed: number };
  achievements: Achievement[];
}

/**
 * Everything about how it's going, on one page. This week first: the ring of
 * blocks done, the streak and the minutes. Then the weekly review, which
 * leads on Sundays and Mondays and folds away the rest of the week. Levels,
 * stars and achievements sit lower down.
 */
export default function ProgressView() {
  const { data } = useDashboardData();
  const streak = useStreak();
  const { sky } = useStudySky();
  const [analytics, setAnalytics] = useState<AnalyticsResponse | null>(null);
  const [progress, setProgress] = useState<ProgressResponse | null>(null);
  const [shareOpen, setShareOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void api<AnalyticsResponse>("/api/analytics?period=week").then((value) => { if (!cancelled) setAnalytics(value); }).catch(() => {});
    void api<ProgressResponse>("/api/progress").then((value) => { if (!cancelled) setProgress(value); }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const timezone = data.profile?.timezone || data.user.timezone || "Australia/Sydney";
  const today = dateKey(new Date().toISOString(), timezone);
  const leads = reviewLeads(today);
  const weekly = analytics?.current ?? { minutes: 0, sessions: 0 };
  const previous = analytics?.previous ?? { minutes: 0, sessions: 0 };
  const totals = analytics?.sky ?? { minutes: 0, sessions: 0, subjects: [] };
  const collected = sky?.cards.filter((card) => card.earnedAt !== null).length ?? 0;
  const todayProgress = useMemo(() => dayProgress(data.events, timezone, today), [data.events, timezone, today]);

  const review = (
    <section className="mt-6">
      {leads ? (
        <WeeklyReviewCard window={new Date(`${today}T12:00:00Z`).getUTCDay() === 0 ? "current" : "previous"} inline />
      ) : (
        <details className="group rounded-xl border" style={{ background: "var(--app-surface)", borderColor: "var(--app-border)" }}>
          <summary className="flex cursor-pointer list-none items-center justify-between px-5 py-4 text-[15px] font-semibold" style={{ color: "var(--app-text)" }}>
            Last week in review
            <span aria-hidden="true" className="transition-transform group-open:rotate-90" style={{ color: "var(--app-text-muted)" }}>›</span>
          </summary>
          <div className="px-2 pb-2"><WeeklyReviewCard window="previous" inline /></div>
        </details>
      )}
    </section>
  );

  return (
    <>
      <PageHeader
        width={1000}
        title="Progress"
        action={weekly.minutes > 0 ? <AppButton onClick={() => setShareOpen(true)}>Share my week</AppButton> : undefined}
      />

      <div className="mx-auto w-full max-w-[1000px] px-6 pb-16 pt-6 sm:px-10">
        <YourSky
          ring={todayProgress}
        />

        {progress ? (
          <section aria-label="Level progress" className="mt-5 flex items-center gap-4 rounded-xl border px-5 py-4" style={{ background: "var(--app-surface)", borderColor: "var(--app-border)" }}>
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-3 text-[12px]">
                <p className="truncate font-semibold" style={{ color: "var(--app-text)" }}>Level {progress.level} · {progress.title}</p>
                <p className="shrink-0 tabular-nums" style={{ color: "var(--app-text-muted)" }}>{progress.levelProgress.current}/{progress.levelProgress.needed} XP</p>
              </div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full" style={{ background: "var(--app-surface-soft)" }}>
                <div className="h-full rounded-full" style={{ width: `${Math.min(100, (progress.levelProgress.current / Math.max(1, progress.levelProgress.needed)) * 100)}%`, background: "var(--app-gold)" }} />
              </div>
            </div>
            <p className="hidden text-right text-[11px] leading-4 sm:block" style={{ color: "var(--app-text-muted)" }}>{nextLevelUnlock(progress.level)} · {collected} collected</p>
          </section>
        ) : null}

        <div className="mt-6"><StreakChain streak={streak} today={today} /></div>
        {leads ? review : null}
        <div className="mt-6"><ConsistencyHeatmap /></div>
        {progress ? <Achievements achievements={progress.achievements} /> : null}
        {leads ? null : review}
      </div>

      {shareOpen ? (
        <ShareCard
          recap={{
            minutes: weekly.minutes,
            sessions: weekly.sessions,
            streak: streak.current,
            recoveries: 0,
            starsLit: totals.sessions,
            beatLastWeekBy: Math.max(0, weekly.minutes - previous.minutes),
          }}
          onClose={() => setShareOpen(false)}
        />
      ) : null}
    </>
  );
}

function dayProgress(events: Parameters<typeof weekProgress>[0], timezone: string, today: string) {
  let planned = 0;
  let done = 0;
  for (const event of events) {
    if (event.category !== "study") continue;
    const day = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(event.startAt));
    if (day !== today) continue;
    planned += 1;
    if (event.outcome === "completed") done += 1;
  }
  return { done, planned, ratio: planned ? done / planned : 0 };
}

function Achievements({ achievements }: { achievements: Achievement[] }) {
  if (!achievements.length) return null;
  const unlocked = achievements.filter((achievement) => achievement.unlockedAt).length;
  return (
    <section id="achievements" className="mt-6 rounded-xl border p-5" style={{ background: "var(--app-surface)", borderColor: "var(--app-border)" }}>
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-[17px] font-semibold" style={{ color: "var(--app-text)" }}>Achievements</h2>
        <p className="text-[13px] tabular-nums" style={{ color: "var(--app-text-muted)" }}>{unlocked}/{achievements.length}</p>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2 lg:grid-cols-3">
        {achievements.map((achievement) => {
          const locked = !achievement.unlockedAt;
          return (
            <article key={achievement.id} className="flex items-start gap-3 rounded-lg p-3" style={{ background: locked ? "var(--app-surface-soft)" : "var(--app-arcad-soft)", opacity: locked ? 0.7 : 1 }}>
              <span className="grid size-8 shrink-0 place-items-center rounded-full text-base" style={{ background: locked ? "var(--app-border)" : "var(--app-arcad)", color: locked ? "var(--app-text-muted)" : "var(--app-arcad-on)" }}>{locked ? "·" : achievement.icon}</span>
              <div className="min-w-0">
                <h3 className="text-[13.5px] font-semibold" style={{ color: "var(--app-text)" }}>{achievement.title}</h3>
                <p className="text-[12px] leading-5" style={{ color: "var(--app-text-muted)" }}>{locked ? `${achievement.current} of ${achievement.target}` : achievement.description}</p>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
