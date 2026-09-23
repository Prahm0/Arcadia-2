"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api/client";
import { useDashboardData } from "@/lib/app/DashboardProvider";
import PageHeader from "./PageHeader";
import { useStreak } from "@/lib/app/useStreak";
import { STREAK_MILESTONES } from "@/lib/app/streaks";
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
  const isFirstTime =
    !loading &&
    analytics !== null &&
    analytics.current.sessions === 0 &&
    analytics.previous.sessions === 0 &&
    analytics.missReasons.length === 0 &&
    streak.longest === 0;

  return (
    <>
      <PageHeader width={1140}
        eyebrow="Progress"
        title="Analytics"
        meta={`${period === "week" ? "This week" : "This month"}${analytics ? ` · ${formatMinutes(totalMinutes)} of focused study` : ""}`}
        tour="analytics"
        action={
          isFirstTime ? <EmptyRangePreview /> : <AnalyticsPeriodPicker period={period} setPeriod={setPeriod} />
        }
      />

      {isFirstTime ? (
        <AnalyticsEmptyState />
      ) : (
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
      )}
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

function EmptyRangePreview() {
  return (
    <div
      aria-label="Time ranges available when you start studying"
      className="inline-flex max-w-full rounded-md p-1"
      style={{ background: "var(--app-surface-soft)", boxShadow: "var(--elev-inset)" }}
    >
      {["Today", "This week", "This month", "Year"].map((label) => {
        const selected = label === "This week";
        return (
          <span
            key={label}
            className="whitespace-nowrap rounded-sm px-2 py-1.5 text-[11px] font-medium sm:px-3 sm:text-[12px]"
            style={{
              background: selected ? "var(--app-surface)" : "transparent",
              color: selected ? "var(--app-text)" : "var(--app-text-muted)",
              boxShadow: selected ? "var(--elev-1)" : "none",
            }}
          >
            {label}
          </span>
        );
      })}
    </div>
  );
}

const MILESTONE_PREVIEWS = [
  "First session",
  "5-day streak",
  "10 hours focused",
  "50 sessions",
] as const;

function AnalyticsEmptyState() {
  return (
    <div className="mx-auto w-full max-w-[820px] px-6 py-8 sm:px-10 sm:py-10">
      <section
        className="overflow-hidden rounded-lg p-5 sm:p-8"
        style={{ background: "var(--app-surface)", boxShadow: "var(--elev-1)" }}
      >
        <div
          className="rounded-md px-4 py-5 sm:px-8 sm:py-7"
          style={{
            background: "color-mix(in oklab, var(--app-arcad-soft) 70%, var(--app-surface-soft))",
            boxShadow: "var(--elev-inset)",
          }}
        >
          <div className="mx-auto max-w-[480px] text-center">
            <StudyConstellation />
            <p className="type-eyebrow mt-4 flex items-center justify-center gap-1.5" style={{ color: "var(--app-text-muted)" }}>
              <ArcadiaMark size={10} className="text-[var(--app-arcad)]" />
              Your study sky
            </p>
            <h2 className="mt-2 text-[24px] font-semibold tracking-[-0.025em] sm:text-[28px]" style={{ color: "var(--app-text)" }}>
              Your <span className="accent-serif">constellation</span> is ready.
            </h2>
            <p className="mx-auto mt-2 max-w-[360px] text-[14px] leading-[1.55]" style={{ color: "var(--app-text-muted)" }}>
              Start a focus session and your first star lights up.
            </p>
            <Link href="/app/focus" className="mt-6 inline-flex">
              <AppButton variant="primary">Start a focus session</AppButton>
            </Link>
          </div>
        </div>

        <div className="mt-6">
          <div className="flex items-center justify-between gap-3">
            <p className="type-eyebrow" style={{ color: "var(--app-text-muted)" }}>Milestones to unlock</p>
            <p className="text-[12px]" style={{ color: "var(--app-text-faint)" }}>Study to light them up</p>
          </div>
          <ul className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {MILESTONE_PREVIEWS.map((milestone) => (
              <li
                key={milestone}
                className="flex min-h-16 items-center gap-2 rounded-md px-3 py-2.5"
                style={{
                  background: "var(--app-surface-soft)",
                  border: "1px solid var(--app-border)",
                  color: "var(--app-text-muted)",
                }}
              >
                <LockIcon />
                <span className="text-[12.5px] font-medium leading-[1.25]">{milestone}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </div>
  );
}

function StudyConstellation() {
  const starPath = "M12 0C12 7.6 16.4 12 24 12C16.4 12 12 16.4 12 24C12 16.4 7.6 12 0 12C7.6 12 12 7.6 12 0Z";

  return (
    <svg aria-hidden="true" className="mx-auto h-auto w-full max-w-[390px]" viewBox="0 0 390 160" fill="none">
      <g stroke="var(--app-arcad)" strokeLinecap="round" strokeWidth="1.25" opacity="0.3">
        <path d="M44 106L102 63L166 100L232 42L306 80L350 37" />
        <path d="M102 63L130 27" />
        <path d="M166 100L211 125L306 80" />
      </g>
      <g fill="var(--app-arcad)" opacity="0.45">
        <circle cx="44" cy="106" r="3" />
        <circle cx="102" cy="63" r="2.5" />
        <circle cx="166" cy="100" r="3" />
        <circle cx="211" cy="125" r="2.5" />
        <circle cx="306" cy="80" r="3" />
        <circle cx="350" cy="37" r="2.5" />
        <circle cx="130" cy="27" r="2" />
      </g>
      <g fill="var(--app-arcad)" opacity="0.8">
        <path d={starPath} transform="translate(220 30) scale(0.75)" />
        <path d={starPath} transform="translate(92 51) scale(0.56)" />
        <path d={starPath} transform="translate(295 69) scale(0.56)" />
      </g>
      <g fill="var(--app-text-faint)" opacity="0.7">
        <circle cx="69" cy="34" r="1.5" />
        <circle cx="183" cy="30" r="1.5" />
        <circle cx="274" cy="119" r="1.5" />
        <circle cx="345" cy="121" r="1.5" />
      </g>
    </svg>
  );
}

function LockIcon() {
  return (
    <span
      aria-hidden="true"
      className="grid size-6 shrink-0 place-items-center rounded-full"
      style={{ background: "var(--app-border)", color: "var(--app-text-faint)" }}
    >
      <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.5">
        <rect x="3.5" y="7" width="9" height="6" rx="1.25" />
        <path d="M5.5 7V5.25a2.5 2.5 0 0 1 5 0V7" strokeLinecap="round" />
      </svg>
    </span>
  );
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
