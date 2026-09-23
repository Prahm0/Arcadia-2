"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api/client";
import { useDashboardData } from "@/lib/app/DashboardProvider";
import PageHeader from "./PageHeader";
import { useStreak } from "@/lib/app/useStreak";
import { STREAK_MILESTONES } from "@/lib/app/streaks";
import { SUBJECT_COLORS } from "@/lib/app/categoryColors";
import ConsistencyHeatmap from "./ConsistencyHeatmap";
import AppButton from "./AppButton";
import ArcadiaMark from "@/components/ui/ArcadiaMark";
import Link from "next/link";

interface DailyBucket {
  date: string;
  minutes: number;
  sessions: number;
}

interface SubjectBucket {
  subject: string;
  minutes: number;
  sessions: number;
}

interface AnalyticsResponse {
  period: "day" | "week" | "month";
  range: { start: string; end: string };
  timezone: string;
  daily: DailyBucket[];
  previousDaily: DailyBucket[];
  hourly?: Array<{ hour: number; minutes: number }>;
  subjects: SubjectBucket[];
  missReasons: Array<{ reason: string; count: number }>;
  streaks: { current: number; longest: number };
  sky: {
    sessions: number;
    minutes: number;
    subjects: SubjectBucket[];
  };
  previous: { minutes: number; sessions: number; averageMinutes: number };
  current: { minutes: number; sessions: number; averageMinutes: number };
  analytics?: Record<string, unknown>;
}

type Period = "week" | "month";

export default function AnalyticsView() {
  const { data } = useDashboardData();
  const streak = useStreak();
  const [period, setPeriod] = useState<Period>("week");
  const [analytics, setAnalytics] = useState<AnalyticsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await api<AnalyticsResponse>(`/api/analytics?period=${period}`);
      setAnalytics(response);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load.");
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => { void load(); }, [load]);

  const totalMinutes = analytics?.current.minutes ?? 0;
  const hasPaidPlan = data.user.tier === "pro" || data.user.tier === "max";
  const prevMinutes = analytics?.previous.minutes ?? 0;
  const delta = prevMinutes ? Math.round(((totalMinutes - prevMinutes) / prevMinutes) * 100) : null;
  const sky = analytics?.sky ?? { sessions: 0, minutes: 0, subjects: [] };
  const focusStreak = analytics?.streaks.current ?? 0;
  const subjectColours = new Map(
    data.subjects.map((subject, index) => [subject.name, subject.colour || SUBJECT_COLORS[index % SUBJECT_COLORS.length]]),
  );

  return (
    <>
      <PageHeader width={1140}
        eyebrow="Progress"
        title="Analytics"
        meta={`${period === "week" ? "This week" : "This month"}${analytics ? ` · ${formatMinutes(totalMinutes)} of focused study` : ""}`}
        tour="analytics"
        action={<AnalyticsPeriodPicker period={period} setPeriod={setPeriod} />}
      />

      <StudySky sky={sky} streak={focusStreak} loading={loading} subjectColours={subjectColours} />
      {loading || sky.sessions >= 3 ? (
      <>
      <div className="mx-auto grid w-full max-w-[1140px] gap-6 px-6 py-8 sm:px-10 lg:grid-cols-3">
        <StatCard label="Focus time" value={formatMinutes(totalMinutes)} delta={delta} />
        <StatCard label="Sessions" value={String(analytics?.current.sessions ?? 0)} delta={
          analytics?.previous.sessions ? Math.round(((analytics.current.sessions - analytics.previous.sessions) / analytics.previous.sessions) * 100) : null
        } />
        <StatCard label="Current streak" value={`${streak.current}`} unit={streak.current === 1 ? "day" : "days"} />
      </div>

      <div className="mx-auto grid w-full max-w-[1140px] gap-6 px-6 pb-8 sm:px-10 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="rounded-lg p-6" style={{ background: "var(--app-surface)", boxShadow: "var(--elev-1)" }}>
          <p className="type-eyebrow" style={{ color: "var(--app-text-muted)" }}>Daily focus</p>
          <p className="mt-2 text-[13px]" style={{ color: "var(--app-text-muted)" }}>
            Minutes of focused study each day this {period}.
          </p>
          <div className="mt-6">
            {loading ? (
              <p className="text-[13px]" style={{ color: "var(--app-text-muted)" }}>Loading…</p>
            ) : error ? (
              <p className="text-[13px]" style={{ color: "var(--app-danger)" }}>{error}</p>
            ) : (
              <BarChart daily={analytics?.daily ?? []} />
            )}
          </div>
        </div>

        <div className="rounded-lg p-6" style={{ background: "var(--app-surface)", boxShadow: "var(--elev-1)" }}>
          <p className="type-eyebrow" style={{ color: "var(--app-text-muted)" }}>By subject</p>
          {!analytics || analytics.subjects.length === 0 ? (
            <p className="mt-4 text-[13.5px]" style={{ color: "var(--app-text-muted)" }}>
              No study time logged yet. Use the Focus timer to start tracking.
            </p>
          ) : (
            <ul className="mt-4 flex flex-col gap-3">
              {analytics.subjects.map((s) => {
                const pct = analytics.subjects[0]?.minutes ? (s.minutes / analytics.subjects[0].minutes) * 100 : 0;
                return (
                  <li key={s.subject}>
                    <div className="flex items-baseline justify-between text-[13.5px]">
                      <span style={{ color: "var(--app-text)" }}>{s.subject}</span>
                      <span className="tabular-nums" style={{ color: "var(--app-text-muted)" }}>{formatMinutes(s.minutes)}</span>
                    </div>
                    <div className="mt-1.5 h-1.5 overflow-hidden rounded-[1px]" style={{ background: "var(--app-border)" }}>
                      <div className="h-full" style={{ width: `${pct}%`, background: "var(--app-accent)" }} />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      {hasPaidPlan ? (
        <div className="mx-auto w-full max-w-[1140px] px-6 pb-8 sm:px-10">
          <MissReasonBreakdown reasons={analytics?.missReasons ?? []} />
        </div>
      ) : null}

      <div className="mx-auto w-full max-w-[1140px] px-6 pb-6 sm:px-10">
        <ConsistencyHeatmap />
      </div>

      <div className="mx-auto w-full max-w-[1140px] px-6 pb-16 sm:px-10">
        <div className="rounded-lg p-6" style={{ background: "var(--app-surface)", boxShadow: "var(--elev-1)" }}>
          <div className="flex items-baseline justify-between">
            <p className="type-eyebrow" style={{ color: "var(--app-text-muted)" }}>Streaks</p>
            <p className="type-mono-label" style={{ color: "var(--app-text-muted)" }}>
              ≥70% of planned study minutes = consistent day
            </p>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-6">
            <div>
              <p className="text-[32px] tabular-nums font-medium" style={{ color: "var(--app-text)" }}>
                {streak.current}
              </p>
              <p className="mt-1 text-[13px]" style={{ color: "var(--app-text-muted)" }}>
                Current
              </p>
            </div>
            <div>
              <p className="text-[32px] tabular-nums font-medium" style={{ color: "var(--app-text)" }}>
                {streak.longest}
              </p>
              <p className="mt-1 text-[13px]" style={{ color: "var(--app-text-muted)" }}>
                Longest
              </p>
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
                      background: active
                        ? "var(--app-accent)"
                        : hit
                          ? "var(--app-accent-soft)"
                          : "var(--app-surface-soft)",
                      color: active
                        ? "white"
                        : hit
                          ? "var(--app-accent-strong)"
                          : "var(--app-text-muted)",
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
            <p className="mt-4 rounded-md px-3 py-2.5 text-[13px]"
              style={{
                background: "var(--app-surface-soft)", boxShadow: "var(--elev-inset)",
                color: "var(--app-text-soft)",
              }}
            >
              Streak reset, {streak.lastPlannedDay.missReason}.
            </p>
          ) : null}
        </div>
      </div>
      </>
      ) : <SkyLaunchPad sessions={sky.sessions} minutes={sky.minutes} />}
    </>
  );
}

function AnalyticsPeriodPicker({ period, setPeriod }: { period: Period; setPeriod: (period: Period) => void }) {
  return (
    <div className="inline-flex rounded-md p-1" style={{ background: "var(--app-surface-soft)", boxShadow: "var(--elev-inset)" }}>
      {(["week", "month"] as Period[]).map((option) => (
        <button
          key={option}
          type="button"
          onClick={() => setPeriod(option)}
          className="rounded-sm px-3.5 py-1.5 text-[13px] font-medium capitalize"
          style={{
            background: period === option ? "var(--app-surface)" : "transparent",
            color: period === option ? "var(--app-text)" : "var(--app-text-muted)",
            boxShadow: period === option ? "var(--elev-1)" : "none",
          }}
        >
          {option}
        </button>
      ))}
    </div>
  );
}

const SKY_STARS = [
  [42, 137], [84, 71], [132, 112], [178, 43], [222, 96], [274, 56], [329, 101], [376, 38],
  [420, 84], [468, 128], [512, 72], [558, 115], [608, 49], [654, 94], [704, 35], [747, 79],
] as const;
const SKY_PATHS = [
  "M42 137L84 71L132 112L178 43L222 96L274 56L329 101",
  "M329 101L376 38L420 84L468 128L512 72L558 115",
  "M558 115L608 49L654 94L704 35L747 79",
] as const;

function StudySky({
  sky,
  streak,
  loading,
  subjectColours,
}: {
  sky: AnalyticsResponse["sky"];
  streak: number;
  loading: boolean;
  subjectColours: Map<string, string>;
}) {
  const litStars = Math.min(SKY_STARS.length, sky.sessions);
  const skyComplete = sky.sessions >= SKY_STARS.length;
  const next = nextSkyGoal(sky, streak);
  const milestones = [
    { label: "First light", done: sky.sessions >= 1 },
    { label: "5-day streak", done: streak >= 5 },
    { label: "10 hours focused", done: sky.minutes >= 600 },
    { label: "50 sessions", done: sky.sessions >= 50 },
  ];

  return (
    <div className="mx-auto w-full max-w-[1140px] px-6 pb-1 pt-8 sm:px-10">
      <section
        className="overflow-hidden rounded-xl"
        style={{ background: "var(--app-surface)", boxShadow: "var(--elev-1)" }}
      >
        <div className="grid lg:grid-cols-[minmax(0,1.45fr)_minmax(320px,0.8fr)]">
          <div
            className="min-w-0 px-5 py-6 sm:px-8 sm:py-8"
            style={{ background: "color-mix(in oklab, var(--app-arcad-soft) 70%, var(--app-surface-soft))" }}
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="type-eyebrow flex items-center gap-1.5" style={{ color: "var(--app-text-muted)" }}>
                <ArcadiaMark size={10} className="text-[var(--app-arcad)]" />
                Your study sky
              </p>
              <p className="rounded-full px-2.5 py-1 text-[11.5px] font-medium" style={{ background: "var(--app-surface)", color: "var(--app-arcad-strong)", boxShadow: "var(--elev-1)" }}>
                {loading ? "Reading your sky" : `${litStars}/${SKY_STARS.length} stars lit`}
              </p>
            </div>

            <SkyMap litStars={litStars} />

            <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
              <div>
                <h2 className="text-[22px] font-semibold tracking-[-0.025em] sm:text-[26px]" style={{ color: "var(--app-text)" }}>
                  {loading
                    ? "Your constellation is loading."
                    : sky.sessions === 0
                      ? <>Your first <span className="accent-serif">star</span> is waiting.</>
                      : skyComplete
                        ? <>Your constellation is <span className="accent-serif">alive.</span></>
                        : <>Your sky is <span className="accent-serif">growing.</span></>}
                </h2>
                <p className="mt-1.5 max-w-[490px] text-[13.5px] leading-[1.55]" style={{ color: "var(--app-text-muted)" }}>
                  {loading
                    ? ""
                    : sky.sessions === 0
                      ? "Finish a focus session to light the first star. Every session adds another point to your sky."
                      : skyComplete
                        ? `${sky.sessions} focus sessions power this constellation. Keep studying to build your next one.`
                        : `${sky.sessions} focus session${sky.sessions === 1 ? "" : "s"} have lit ${litStars} star${litStars === 1 ? "" : "s"}. ${next.label}`}
                </p>
              </div>
              {sky.sessions === 0 ? (
                <Link href="/app/focus" className="shrink-0">
                  <AppButton variant="primary">Light your first star</AppButton>
                </Link>
              ) : null}
            </div>
          </div>

          <aside className="border-t px-5 py-6 sm:px-8 lg:border-l lg:border-t-0" style={{ borderColor: "var(--app-border)" }}>
            <p className="type-eyebrow" style={{ color: "var(--app-text-muted)" }}>Sky progress</p>
            <div className="mt-4 grid grid-cols-3 gap-2">
              <SkyStat label="Sessions" value={String(sky.sessions)} />
              <SkyStat label="Focused" value={formatMinutes(sky.minutes)} />
              <SkyStat label="Streak" value={`${streak}d`} />
            </div>

            <div className="mt-5">
              <div className="flex items-center justify-between gap-3">
                <p className="text-[12.5px] font-medium" style={{ color: "var(--app-text-muted)" }}>Milestones</p>
                <p className="text-[11.5px]" style={{ color: "var(--app-text-faint)" }}>{milestones.filter((item) => item.done).length}/4 unlocked</p>
              </div>
              <ul className="mt-2.5 grid grid-cols-2 gap-2">
                {milestones.map((milestone) => (
                  <li
                    key={milestone.label}
                    className="flex min-h-10 items-center gap-2 rounded-md px-2.5 py-2 text-[11.5px] font-medium"
                    style={{
                      background: milestone.done ? "var(--app-arcad-soft)" : "var(--app-surface-soft)",
                      color: milestone.done ? "var(--app-arcad-strong)" : "var(--app-text-muted)",
                      border: `1px solid ${milestone.done ? "color-mix(in oklab, var(--app-arcad) 25%, transparent)" : "var(--app-border)"}`,
                    }}
                  >
                    <span aria-hidden="true">{milestone.done ? "✦" : "◌"}</span>
                    <span>{milestone.label}</span>
                  </li>
                ))}
              </ul>
            </div>

            {sky.subjects.length > 0 ? (
              <div className="mt-5 border-t pt-4" style={{ borderColor: "var(--app-border)" }}>
                <p className="text-[12.5px] font-medium" style={{ color: "var(--app-text-muted)" }}>Subject clusters</p>
                <ul className="mt-2.5 flex flex-wrap gap-2">
                  {sky.subjects.map((subject, index) => {
                    const colour = subjectColours.get(subject.subject) ?? SUBJECT_COLORS[index % SUBJECT_COLORS.length];
                    return (
                      <li
                        key={subject.subject}
                        className="inline-flex max-w-full items-center gap-1.5 rounded-full px-2.5 py-1 text-[11.5px] font-medium"
                        style={{
                          background: `color-mix(in oklab, ${colour} 13%, var(--app-surface))`,
                          color: `color-mix(in oklab, ${colour} 70%, var(--app-text))`,
                        }}
                      >
                        <span className="size-1.5 rounded-full" style={{ background: colour }} />
                        <span className="max-w-[104px] truncate">{subject.subject}</span>
                        <span className="tabular-nums opacity-75">{formatMinutes(subject.minutes)}</span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ) : null}
          </aside>
        </div>
      </section>
    </div>
  );
}

function SkyMap({ litStars }: { litStars: number }) {
  const starPath = "M12 0C12 7.6 16.4 12 24 12C16.4 12 12 16.4 12 24C12 16.4 7.6 12 0 12C7.6 12 12 7.6 12 0Z";
  return (
    <svg aria-label={`${litStars} study stars lit`} role="img" className="mt-5 h-auto w-full" viewBox="0 0 790 170" fill="none">
      <g stroke="var(--app-arcad)" strokeLinecap="round" strokeWidth="1.25" opacity="0.24">
        {SKY_PATHS.map((path) => <path key={path} d={path} />)}
      </g>
      {SKY_STARS.map(([x, y], index) => {
        const lit = index < litStars;
        return (
          <g key={`${x}-${y}`}>
            {lit ? <circle cx={x} cy={y} r="14" fill="var(--app-arcad)" opacity="0.12" /> : null}
            <path
              d={starPath}
              transform={`translate(${x - 6} ${y - 6}) scale(0.5)`}
              fill={lit ? "var(--app-arcad)" : "var(--app-border-strong)"}
              opacity={lit ? 1 : 0.68}
            />
          </g>
        );
      })}
      <g fill="var(--app-text-faint)" opacity="0.62">
        <circle cx="24" cy="42" r="1.5" /><circle cx="115" cy="27" r="1.4" /><circle cx="244" cy="25" r="1.5" />
        <circle cx="306" cy="145" r="1.5" /><circle cx="452" cy="27" r="1.4" /><circle cx="610" cy="140" r="1.5" />
        <circle cx="738" cy="135" r="1.5" />
      </g>
    </svg>
  );
}

function SkyLaunchPad({ sessions, minutes }: { sessions: number; minutes: number }) {
  const remaining = Math.max(0, 3 - sessions);
  return (
    <div className="mx-auto w-full max-w-[820px] px-6 py-8 sm:px-10 sm:py-10">
      <section className="rounded-lg p-5 sm:p-6" style={{ background: "var(--app-surface)", boxShadow: "var(--elev-1)" }}>
        <p className="type-eyebrow" style={{ color: "var(--app-text-muted)" }}>Your launch sequence</p>
        <div className="mt-3 flex flex-wrap items-end justify-between gap-5">
          <div>
            <h2 className="text-[19px] font-semibold tracking-[-0.02em]" style={{ color: "var(--app-text)" }}>
              {sessions === 0 ? "Light three stars to reveal your patterns." : "Your sky is taking shape."}
            </h2>
            <p className="mt-1.5 max-w-[500px] text-[13.5px] leading-[1.55]" style={{ color: "var(--app-text-muted)" }}>
              {sessions === 0
                ? "Your first session lights the first star. After three sessions, Arcadia starts showing your daily patterns, subject clusters and consistency map."
                : `${sessions} of 3 early stars lit. You have ${formatMinutes(minutes)} focused so far. ${remaining} more session${remaining === 1 ? "" : "s"} opens your first study patterns.`}
            </p>
          </div>
          <Link href="/app/focus" className="shrink-0">
            <AppButton variant="secondary">Start a focus session</AppButton>
          </Link>
        </div>
        <ol className="mt-5 grid grid-cols-3 gap-2">
          {[1, 2, 3].map((step) => {
            const complete = sessions >= step;
            return (
              <li
                key={step}
                className="rounded-md px-3 py-3 text-center"
                style={{
                  background: complete ? "var(--app-arcad-soft)" : "var(--app-surface-soft)",
                  color: complete ? "var(--app-arcad-strong)" : "var(--app-text-muted)",
                }}
              >
                <p className="text-[15px] font-semibold">{complete ? "✦" : step}</p>
                <p className="mt-1 text-[11.5px] font-medium">{step === 1 ? "First light" : step === 2 ? "Second star" : "Patterns open"}</p>
              </li>
            );
          })}
        </ol>
      </section>
    </div>
  );
}

function SkyStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-md px-2.5 py-2.5" style={{ background: "var(--app-surface-soft)", boxShadow: "var(--elev-inset)" }}>
      <p className="truncate text-[10.5px] font-medium" style={{ color: "var(--app-text-muted)" }}>{label}</p>
      <p className="mt-1 truncate text-[16px] font-semibold tabular-nums" style={{ color: "var(--app-text)" }}>{value}</p>
    </div>
  );
}

function nextSkyGoal(sky: AnalyticsResponse["sky"], streak: number): { label: string } {
  if (sky.sessions < 5) return { label: `${5 - sky.sessions} more session${5 - sky.sessions === 1 ? "" : "s"} unlocks your first orbit.` };
  if (streak < 5) return { label: `${5 - streak} more consistent day${5 - streak === 1 ? "" : "s"} unlocks your streak star.` };
  if (sky.minutes < 600) return { label: `${formatMinutes(600 - sky.minutes)} until your 10-hour star.` };
  if (sky.sessions < 50) return { label: `${50 - sky.sessions} more sessions unlock your 50-session star.` };
  return { label: "Your next constellation is taking shape." };
}

const MISS_REASON_LABEL: Record<string, string> = {
  sick: "Sick",
  tired: "Too tired",
  other_plans: "Other plans",
  forgot: "Forgot",
  didnt_feel_like_it: "Didn't feel like it",
  other: "Something else",
};

function MissReasonBreakdown({ reasons }: { reasons: Array<{ reason: string; count: number }> }) {
  const max = Math.max(1, ...reasons.map((item) => item.count));
  return (
    <div className="rounded-lg p-6" style={{ background: "var(--app-surface)", boxShadow: "var(--elev-1)" }}>
      <p className="type-eyebrow" style={{ color: "var(--app-text-muted)" }}>Missed session reasons</p>
      <p className="mt-2 text-[13px]" style={{ color: "var(--app-text-muted)" }}>
        The reasons you logged over the last 30 days.
      </p>
      {reasons.length === 0 ? (
        <p className="mt-5 text-[13.5px]" style={{ color: "var(--app-text-muted)" }}>
          No reasons logged yet.
        </p>
      ) : (
        <ul className="mt-5 flex max-w-[620px] flex-col gap-3">
          {reasons.map((item) => (
            <li key={item.reason}>
              <div className="flex items-baseline justify-between gap-3 text-[13.5px]">
                <span style={{ color: "var(--app-text)" }}>{MISS_REASON_LABEL[item.reason] ?? "Other"}</span>
                <span className="tabular-nums" style={{ color: "var(--app-text-muted)" }}>{item.count}</span>
              </div>
              <div className="mt-1.5 h-2 overflow-hidden rounded-[1px]" style={{ background: "var(--app-border)" }}>
                <div
                  className="h-full"
                  style={{ width: `${(item.count / max) * 100}%`, background: "var(--app-accent)" }}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function StatCard({ label, value, unit, delta }: { label: string; value: string; unit?: string; delta?: number | null }) {
  const isUp = typeof delta === "number" && delta > 0;
  const isDown = typeof delta === "number" && delta < 0;
  return (
    <div className="rounded-lg p-5" style={{ background: "var(--app-surface)", boxShadow: "var(--elev-1)" }}>
      <p className="type-eyebrow" style={{ color: "var(--app-text-muted)" }}>{label}</p>
      <div className="mt-3 flex items-baseline gap-2">
        <p className="text-[32px] tabular-nums font-medium leading-none" style={{ color: "var(--app-text)" }}>{value}</p>
        {unit ? <p className="text-[13px]" style={{ color: "var(--app-text-muted)" }}>{unit}</p> : null}
      </div>
      {typeof delta === "number" ? (
        <p
          className="mt-2 text-[12px] font-medium"
          style={{ color: isUp ? "var(--app-success)" : isDown ? "var(--app-danger)" : "var(--app-text-muted)" }}
        >
          {isUp ? "↑" : isDown ? "↓" : "→"} {Math.abs(delta)}% vs. previous
        </p>
      ) : null}
    </div>
  );
}

function BarChart({ daily }: { daily: DailyBucket[] }) {
  const max = Math.max(1, ...daily.map((d) => d.minutes));
  return (
    <div className="flex h-[180px] items-end gap-2">
      {daily.map((d) => {
        const height = (d.minutes / max) * 100;
        return (
          <div key={d.date} className="flex flex-1 flex-col items-center gap-2">
            <div className="relative flex w-full flex-1 items-end">
              <div
                className="w-full rounded-t-[4px] transition-[height]"
                style={{
                  height: `${Math.max(2, height)}%`,
                  background: d.minutes > 0 ? "var(--app-accent)" : "var(--app-border)",
                }}
                title={`${formatMinutes(d.minutes)} · ${d.date}`}
              />
            </div>
            <span className="text-[11px] tabular-nums" style={{ color: "var(--app-text-muted)" }}>
              {shortDay(d.date)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function shortDay(iso: string): string {
  const d = new Date(`${iso}T12:00:00Z`);
  return new Intl.DateTimeFormat("en-AU", { weekday: "short" }).format(d).slice(0, 3);
}

function formatMinutes(m: number): string {
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r === 0 ? `${h} hr` : `${h}h ${r}m`;
}
