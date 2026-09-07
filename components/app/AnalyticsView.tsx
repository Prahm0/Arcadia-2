"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api/client";
import { useDashboardData } from "@/lib/app/DashboardProvider";
import PageHeader from "./PageHeader";
import { cn } from "@/lib/cn";
import { useStreak } from "@/lib/app/useStreak";
import { STREAK_MILESTONES } from "@/lib/app/streaks";
import ConsistencyHeatmap from "./ConsistencyHeatmap";

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
  const prevMinutes = analytics?.previous.minutes ?? 0;
  const delta = prevMinutes ? Math.round(((totalMinutes - prevMinutes) / prevMinutes) * 100) : null;

  return (
    <>
      <PageHeader
        eyebrow="Analytics"
        title={
          <>
            This <span className="accent-serif">{period === "week" ? "week" : "month"}</span>
          </>
        }
        meta={analytics ? `${formatMinutes(totalMinutes)} of focused study` : undefined}
        action={
          <div className="inline-flex rounded-[10px] p-1" style={{ background: "var(--app-surface-soft)", border: "1px solid var(--app-border)" }}>
            {(["week", "month"] as Period[]).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setPeriod(p)}
                className="rounded-[8px] px-3.5 py-1.5 text-[13px] font-medium capitalize"
                style={{
                  background: period === p ? "var(--app-surface)" : "transparent",
                  color: period === p ? "var(--app-text)" : "var(--app-text-muted)",
                  boxShadow: period === p ? "0 1px 3px rgba(0,0,0,0.05)" : "none",
                }}
              >
                {p}
              </button>
            ))}
          </div>
        }
      />

      <div className="mx-auto grid w-full max-w-[1140px] gap-6 px-6 py-8 sm:px-10 lg:grid-cols-3">
        <StatCard label="Focus time" value={formatMinutes(totalMinutes)} delta={delta} />
        <StatCard label="Sessions" value={String(analytics?.current.sessions ?? 0)} delta={
          analytics?.previous.sessions ? Math.round(((analytics.current.sessions - analytics.previous.sessions) / analytics.previous.sessions) * 100) : null
        } />
        <StatCard label="Current streak" value={`${streak.current}`} unit={streak.current === 1 ? "day" : "days"} />
      </div>

      <div className="mx-auto grid w-full max-w-[1140px] gap-6 px-6 pb-8 sm:px-10 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="rounded-[16px] p-6" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
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

        <div className="rounded-[16px] p-6" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
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
                      <span className="font-mono" style={{ color: "var(--app-text-muted)" }}>{formatMinutes(s.minutes)}</span>
                    </div>
                    <div className="mt-1.5 h-1.5 overflow-hidden rounded-full" style={{ background: "var(--app-border)" }}>
                      <div className="h-full rounded-full" style={{ width: `${pct}%`, background: "var(--app-accent)" }} />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      <div className="mx-auto w-full max-w-[1140px] px-6 pb-6 sm:px-10">
        <ConsistencyHeatmap />
      </div>

      <div className="mx-auto w-full max-w-[1140px] px-6 pb-16 sm:px-10">
        <div className="rounded-[16px] p-6" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
          <div className="flex items-baseline justify-between">
            <p className="type-eyebrow" style={{ color: "var(--app-text-muted)" }}>Streaks</p>
            <p className="type-mono-label" style={{ color: "var(--app-text-muted)" }}>
              ≥70% of planned study minutes = consistent day
            </p>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-6">
            <div>
              <p className="text-[32px] font-mono font-medium" style={{ color: "var(--app-text)" }}>
                {streak.current}
              </p>
              <p className="mt-1 text-[13px]" style={{ color: "var(--app-text-muted)" }}>
                Current
              </p>
            </div>
            <div>
              <p className="text-[32px] font-mono font-medium" style={{ color: "var(--app-text)" }}>
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
                    className="flex items-center gap-1.5 rounded-full px-3 py-1 text-[12.5px] font-medium"
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
                <span className="font-mono">{streak.daysToNext}</span> more consistent {streak.daysToNext === 1 ? "day" : "days"} to hit {streak.nextMilestone}.
              </p>
            ) : null}
          </div>

          {streak.current === 0 && streak.lastPlannedDay?.missReason ? (
            <p className="mt-4 rounded-[10px] px-3 py-2.5 text-[13px]"
              style={{
                background: "var(--app-surface-soft)",
                border: "1px solid var(--app-border)",
                color: "var(--app-text-soft)",
              }}
            >
              Streak reset — {streak.lastPlannedDay.missReason}.
            </p>
          ) : null}
        </div>
      </div>
    </>
  );
}

function StatCard({ label, value, unit, delta }: { label: string; value: string; unit?: string; delta?: number | null }) {
  const isUp = typeof delta === "number" && delta > 0;
  const isDown = typeof delta === "number" && delta < 0;
  return (
    <div className="rounded-[14px] p-5" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
      <p className="type-eyebrow" style={{ color: "var(--app-text-muted)" }}>{label}</p>
      <div className="mt-3 flex items-baseline gap-2">
        <p className="text-[32px] font-mono font-medium leading-none" style={{ color: "var(--app-text)" }}>{value}</p>
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
            <span className="text-[11px] font-mono" style={{ color: "var(--app-text-muted)" }}>
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
