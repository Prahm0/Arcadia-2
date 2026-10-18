"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api/client";
import { useDashboardData } from "@/lib/app/DashboardProvider";
import { useStreak } from "@/lib/app/useStreak";
import { useStudySky } from "@/lib/app/StudySkyProvider";
import { reviewLeads, weekDays, weekProgress } from "@/lib/app/weekProgress";
import { dateKey, formatMinutes } from "@/lib/api/time";
import { nextLevelUnlock } from "@/shared/progress";
import PageHeader from "./PageHeader";
import AppButton from "./AppButton";
import ShareCard from "./ShareCard";
import WeeklyReviewCard from "./WeeklyReviewCard";
import ConsistencyHeatmap from "./ConsistencyHeatmap";
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
 * How it's going, kept simple: this week's study time, blocks done and
 * streak, with a bar for each day. Then the weekly review and the
 * consistency map. Levels, achievements and constellations are extras,
 * folded away at the bottom for anyone who wants them.
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
  const week = weekProgress(data.events, timezone, today);
  const days = weekDays(data.events, timezone, today);

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
        <ThisWeek
          minutes={Math.max(weekly.minutes, week.minutes)}
          lastWeek={previous.minutes}
          done={week.done}
          planned={week.planned}
          streak={streak.current}
          days={days}
        />

        {leads ? review : null}
        <div className="mt-6"><ConsistencyHeatmap /></div>
        {leads ? null : review}

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

        {progress && progress.achievements.length ? (
          <Extra title="Achievements" detail={`${progress.achievements.filter((item) => item.unlockedAt).length} of ${progress.achievements.length}`}>
            <Achievements achievements={progress.achievements} />
          </Extra>
        ) : null}
        <Extra id="constellations" title="Constellations" detail={`${collected} collected`}>
          <YourSky />
        </Extra>
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


function Achievements({ achievements }: { achievements: Achievement[] }) {
  if (!achievements.length) return null;
  const unlocked = achievements.filter((achievement) => achievement.unlockedAt).length;
  return (
    <section id="achievements" aria-label={`Achievements, ${unlocked} of ${achievements.length}`}>
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-3">
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

const RING = { time: "#3fb26b", blocks: "#e2a92b", days: "#3a9bd9" };
const DEFAULT_WEEK_GOAL = 300;

/**
 * This week, the way a fitness app shows a week: three rings (time studied,
 * blocks done, days you studied), then a bar for each day against the
 * day's plan, with today picked out. Before any study it still looks alive:
 * the rings sit ready and the bars show the plan waiting to be filled.
 */
function ThisWeek({ minutes, lastWeek, done, planned, streak, days }: {
  minutes: number;
  lastWeek: number;
  done: number;
  planned: number;
  streak: number;
  days: Array<{ day: string; minutes: number; planned: number; isToday: boolean; future: boolean }>;
}) {
  const goal = Math.max(60, days.reduce((sum, entry) => sum + entry.planned, 0) || DEFAULT_WEEK_GOAL);
  const activeDays = days.filter((entry) => entry.minutes > 0).length;
  const rings = [
    { key: "time", colour: RING.time, ratio: minutes / goal, value: formatMinutes(minutes), of: `of ${formatMinutes(goal)}`, label: "Study time" },
    { key: "blocks", colour: RING.blocks, ratio: planned ? done / planned : 0, value: String(done), of: `of ${planned || 0} blocks`, label: "Blocks done" },
    { key: "days", colour: RING.days, ratio: activeDays / 7, value: String(activeDays), of: "of 7 days", label: "Study days" },
  ];
  const most = Math.max(30, ...days.map((entry) => Math.max(entry.minutes, entry.planned)));
  const change = lastWeek > 0 ? minutes - lastWeek : null;
  const best = days.reduce((top, entry) => (entry.minutes > top.minutes ? entry : top), days[0]);
  const empty = minutes === 0;

  return (
    <section aria-label="This week" className="overflow-hidden rounded-[28px] p-5 sm:p-7" style={{ background: "var(--app-surface)", boxShadow: "var(--elev-1)" }}>
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-[20px] font-semibold tracking-[-0.01em]" style={{ color: "var(--app-text)" }}>This week</h2>
        {streak > 0 ? (
          <span className="rounded-full px-3 py-1 text-[13px] font-semibold" style={{ background: "rgba(226,169,43,.16)", color: "var(--app-text)" }}>
            🔥 {streak} day streak
          </span>
        ) : null}
      </div>

      <div className="mt-5 flex flex-col items-center gap-6 sm:flex-row sm:gap-8">
        <ActivityRings rings={rings} />
        <ul className="grid w-full flex-1 gap-3">
          {rings.map((ring) => (
            <li key={ring.key} className="flex items-center gap-3">
              <span aria-hidden="true" className="size-3 shrink-0 rounded-full" style={{ background: ring.colour }} />
              <div className="min-w-0 flex-1">
                <p className="text-[12.5px] font-medium" style={{ color: "var(--app-text-muted)" }}>{ring.label}</p>
                <p className="text-[22px] font-semibold leading-tight tracking-[-0.02em] tabular-nums" style={{ color: ring.colour }}>
                  {ring.value} <span className="text-[14px] font-medium" style={{ color: "var(--app-text-muted)" }}>{ring.of}</span>
                </p>
              </div>
            </li>
          ))}
        </ul>
      </div>

      <div className="mt-7">
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-[13px] font-semibold" style={{ color: "var(--app-text)" }}>Minutes each day</p>
          <p className="text-[12.5px]" style={{ color: "var(--app-text-muted)" }}>
            {empty
              ? "Tick your first block and watch this fill"
              : change === null
                ? `Best day: ${new Intl.DateTimeFormat("en-AU", { weekday: "long", timeZone: "UTC" }).format(new Date(`${best.day}T12:00:00Z`))}`
                : change >= 0 ? `↑ ${formatMinutes(change)} on last week` : `↓ ${formatMinutes(-change)} on last week`}
          </p>
        </div>
        <div className="mt-4 grid grid-cols-7 items-end gap-2 sm:gap-3" style={{ height: 150 }}>
          {days.map((entry, index) => {
            const label = new Intl.DateTimeFormat("en-AU", { weekday: "narrow", timeZone: "UTC" }).format(new Date(`${entry.day}T12:00:00Z`));
            const planHeight = (entry.planned / most) * 118;
            const doneHeight = (entry.minutes / most) * 118;
            return (
              <div key={entry.day} className="flex h-full flex-col items-center justify-end gap-1.5" title={`${formatMinutes(entry.minutes)} of ${formatMinutes(entry.planned)}`}>
                <span className="text-[10.5px] font-semibold tabular-nums" style={{ color: entry.minutes ? "var(--app-text)" : "transparent" }}>
                  {entry.minutes ? formatMinutes(entry.minutes) : "0"}
                </span>
                <div className="relative w-full max-w-[38px] rounded-[10px]" style={{ height: Math.max(10, planHeight, doneHeight), background: "var(--app-surface-soft)", outline: entry.isToday ? `2px solid ${RING.time}` : undefined, outlineOffset: 2 }}>
                  <div
                    className="progress-bar-grow absolute inset-x-0 bottom-0 rounded-[10px]"
                    style={{ height: doneHeight, background: `linear-gradient(180deg, ${RING.time}, #2f8a52)`, animationDelay: `${index * 60}ms` }}
                  />
                </div>
                <span className="text-[12px] font-semibold" style={{ color: entry.isToday ? "var(--app-text)" : "var(--app-text-muted)" }}>{label}</span>
              </div>
            );
          })}
        </div>
        <div className="mt-3 flex items-center gap-4 text-[12px]" style={{ color: "var(--app-text-muted)" }}>
          <span className="flex items-center gap-1.5"><span aria-hidden="true" className="size-2.5 rounded-[3px]" style={{ background: RING.time }} />Done</span>
          <span className="flex items-center gap-1.5"><span aria-hidden="true" className="size-2.5 rounded-[3px]" style={{ background: "var(--app-surface-soft)", boxShadow: "inset 0 0 0 1px var(--app-border)" }} />Planned</span>
        </div>
      </div>
    </section>
  );
}

/** Three concentric rings that fill to their ratio, like a fitness app's activity rings. */
function ActivityRings({ rings }: { rings: Array<{ key: string; colour: string; ratio: number; label: string; value: string; of: string }> }) {
  const size = 168;
  const stroke = 18;
  const gap = 4;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={rings.map((ring) => `${ring.label} ${ring.value} ${ring.of}`).join(", ")} className="shrink-0 -rotate-90">
      {rings.map((ring, index) => {
        const r = size / 2 - stroke / 2 - index * (stroke + gap);
        const c = 2 * Math.PI * r;
        const ratio = Math.max(0, Math.min(1, ring.ratio));
        return (
          <g key={ring.key}>
            <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={ring.colour} strokeOpacity={0.18} strokeWidth={stroke} />
            <circle
              className="progress-ring-fill"
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="none"
              stroke={ring.colour}
              strokeWidth={stroke}
              strokeLinecap="round"
              strokeDasharray={c}
              strokeDashoffset={ratio > 0 ? c * (1 - Math.max(ratio, 0.02)) : c}
              style={{ ["--ring-c" as string]: `${c}`, animationDelay: `${index * 120}ms` }}
            />
          </g>
        );
      })}
    </svg>
  );
}

/** One of the extras at the bottom: a single row that opens to show it. */
function Extra({ id, title, detail, children }: { id?: string; title: string; detail: string; children: React.ReactNode }) {
  return (
    <details id={id} className="group mt-3 rounded-xl border scroll-mt-6" style={{ background: "var(--app-surface)", borderColor: "var(--app-border)" }}>
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-4" style={{ color: "var(--app-text)" }}>
        <span className="text-[15px] font-semibold">{title}</span>
        <span className="flex items-center gap-2 text-[13px]" style={{ color: "var(--app-text-muted)" }}>
          {detail}
          <span aria-hidden="true" className="transition-transform group-open:rotate-90">›</span>
        </span>
      </summary>
      <div className="px-4 pb-4 sm:px-5">{children}</div>
    </details>
  );
}
