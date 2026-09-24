"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { api } from "@/lib/api/client";
import { useDashboardData } from "@/lib/app/DashboardProvider";
import PageHeader from "./PageHeader";
import ConsistencyHeatmap from "./ConsistencyHeatmap";
import { formatMinutes } from "@/lib/api/time";

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

/**
 * The numbers: focus time, sessions, when and what you studied. The study
 * sky and streaks live on their own page (/app/streaks).
 */
export default function AnalyticsView() {
  const { data } = useDashboardData();
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

  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const hasPaidPlan = data.user.tier === "pro" || data.user.tier === "max";
  const current = analytics?.current ?? { minutes: 0, sessions: 0, averageMinutes: 0 };
  const previous = analytics?.previous ?? { minutes: 0, sessions: 0, averageMinutes: 0 };
  const daily = analytics?.daily ?? [];
  const previousDaily = analytics?.previousDaily ?? [];
  const activeDays = daily.filter((day) => day.minutes > 0).length;
  const previousActiveDays = previousDaily.filter((day) => day.minutes > 0).length;
  const lastLabel = period === "week" ? "last week" : "last month";
  const show = (value: string) => (loading && !analytics ? "–" : value);
  const hasFocusData = Boolean(analytics && (current.minutes > 0 || current.sessions > 0 || daily.some((day) => day.minutes > 0)));
  const showFirstRun = !loading && !error && analytics !== null && !hasFocusData;
  const insight = analytics && hasFocusData ? getAnalyticsInsight(analytics, period) : null;

  return (
    <>
      <PageHeader width={1140}
        eyebrow="Progress"
        title="Analytics"
        meta={`${period === "week" ? "Last 7 days" : "Last 30 days"}${analytics ? ` · ${formatMinutes(current.minutes)} of focused study` : ""}`}
        tour="analytics"
        action={<AnalyticsPeriodPicker period={period} setPeriod={setPeriod} />}
      />

      {error ? (
        <p className="mx-auto w-full max-w-[1140px] px-6 pt-4 text-[13px] sm:px-10" style={{ color: "var(--app-danger)" }}>{error}</p>
      ) : null}

      {showFirstRun ? (
        <FirstRunAnalytics />
      ) : (
        <>
          {insight ? <AnalyticsInsight insight={insight} /> : null}

          <div className="mx-auto grid w-full max-w-[1140px] grid-cols-2 gap-3 px-6 pt-4 sm:px-10 @3xl/main:grid-cols-4 @3xl/main:gap-4">
            <StatCard label="Focus time" value={show(formatMinutes(current.minutes))} delta={change(current.minutes, previous.minutes)} was={`${formatMinutes(previous.minutes)} ${lastLabel}`} />
            <StatCard label="Sessions" value={show(String(current.sessions))} delta={change(current.sessions, previous.sessions)} was={`${previous.sessions} ${lastLabel}`} />
            <StatCard label="Avg session" value={show(formatMinutes(current.averageMinutes))} delta={change(current.averageMinutes, previous.averageMinutes)} was={`${formatMinutes(previous.averageMinutes)} ${lastLabel}`} />
            <StatCard label="Active days" value={show(`${activeDays}/${daily.length || (period === "week" ? 7 : 30)}`)} delta={change(activeDays, previousActiveDays)} was={`${previousActiveDays} ${lastLabel}`} />
          </div>

          <div className="mx-auto grid w-full max-w-[1140px] gap-4 px-6 pt-4 sm:px-10 @3xl/main:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
            <Panel title="Daily focus" note={<Legend />}>
              {loading && !analytics ? <Muted>Loading…</Muted> : (
                <Bars
                  height={200}
                  label={`Minutes focused per day, last ${daily.length} days`}
                  bars={daily.map((day, index) => {
                    const before = previousDaily[index];
                    return {
                      key: day.date,
                      value: day.minutes,
                      ghost: before?.minutes ?? 0,
                      label: period === "week" ? shortDay(day.date) : index % 5 === 0 || index === daily.length - 1 ? dayOfMonth(day.date) : "",
                      tip: (
                        <>
                          <TipTitle>{longDay(day.date)}</TipTitle>
                          <TipLine>{formatMinutes(day.minutes)} · {day.sessions} session{day.sessions === 1 ? "" : "s"}</TipLine>
                          {before ? <TipLine muted>{formatMinutes(before.minutes)} same day {lastLabel}</TipLine> : null}
                        </>
                      ),
                    };
                  })}
                />
              )}
            </Panel>

            <Panel title="By subject" note={analytics?.subjects.length ? <span className="tabular-nums">{analytics.subjects.length} subject{analytics.subjects.length === 1 ? "" : "s"}</span> : null}>
              {loading && !analytics ? <Muted>Loading…</Muted> : !analytics || analytics.subjects.length === 0 ? (
                <Muted>No focus time logged this {period}.</Muted>
              ) : (
                <SubjectBreakdown subjects={analytics.subjects} total={current.minutes} />
              )}
            </Panel>
          </div>

          <div className="mx-auto w-full max-w-[1140px] px-6 pt-4 sm:px-10">
            <Panel title="Time of day" note={<PeakHour hourly={analytics?.hourly ?? []} />}>
              {loading && !analytics ? <Muted>Loading…</Muted> : (
                <Bars
                  height={140}
                  label="Minutes focused by hour of day"
                  bars={(analytics?.hourly ?? []).map((slot) => ({
                    key: String(slot.hour),
                    value: slot.minutes,
                    label: slot.hour % 3 === 0 ? hourLabel(slot.hour) : "",
                    tip: (
                      <>
                        <TipTitle>{hourLabel(slot.hour)}–{hourLabel((slot.hour + 1) % 24)}</TipTitle>
                        <TipLine>{formatMinutes(slot.minutes)}</TipLine>
                      </>
                    ),
                  }))}
                />
              )}
            </Panel>
          </div>

          {hasPaidPlan ? (
            <div className="mx-auto w-full max-w-[1140px] px-6 pt-4 sm:px-10">
              <MissReasonBreakdown reasons={analytics?.missReasons ?? []} />
            </div>
          ) : null}

          <div className="mx-auto w-full max-w-[1140px] px-6 pb-16 pt-4 sm:px-10">
            <ConsistencyHeatmap />
          </div>
        </>
      )}
    </>
  );
}

function FirstRunAnalytics() {
  return (
    <section className="mx-auto w-full max-w-[1140px] px-6 pb-16 pt-8 sm:px-10" aria-label="Your future study insights">
      <div
        className="relative overflow-hidden rounded-xl border px-6 py-8 sm:px-10 sm:py-10"
        style={{
          background: "linear-gradient(135deg, color-mix(in oklab, var(--app-arcad) 14%, var(--app-surface)), var(--app-surface))",
          borderColor: "color-mix(in oklab, var(--app-arcad) 24%, var(--app-border))",
          boxShadow: "var(--elev-1)",
        }}
      >
        <div className="relative z-10 max-w-[470px]">
          <p className="type-eyebrow" style={{ color: "var(--app-arcad-strong)" }}>Your progress starts here</p>
          <h2 className="mt-3 text-[24px] font-semibold tracking-[-0.025em] sm:text-[30px]" style={{ color: "var(--app-text)" }}>
            Your study insights will grow here.
          </h2>
          <p className="mt-3 max-w-[420px] text-[14px] leading-6" style={{ color: "var(--app-text-soft)" }}>
            Each focus block reveals your best study times, your strongest days, and the progress you are building.
          </p>
          <Link
            href="/app/focus"
            className="mt-6 inline-flex h-10 items-center justify-center gap-2 rounded-md px-4 text-[13px] font-semibold transition-opacity hover:opacity-90"
            style={{ background: "var(--app-arcad)", color: "var(--app-arcad-on)" }}
          >
            Start a focus session
            <span aria-hidden="true">→</span>
          </Link>
        </div>
        <AnalyticsPreview />
      </div>
    </section>
  );
}

function AnalyticsPreview() {
  return (
    <svg
      viewBox="0 0 430 230"
      aria-hidden="true"
      className="pointer-events-none absolute -bottom-8 -right-[110px] h-[185px] w-[345px] opacity-30 sm:-bottom-5 sm:-right-20 sm:h-[235px] sm:w-[440px] sm:opacity-80"
    >
      <defs>
        <linearGradient id="analytics-preview-fill" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="var(--app-arcad)" stopOpacity="0.3" />
          <stop offset="100%" stopColor="var(--app-arcad)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d="M34 185H402M34 130H402M34 75H402" stroke="var(--app-border)" strokeDasharray="4 6" />
      <path d="M42 185C78 171 95 174 124 144S175 161 205 115 252 133 284 82 337 99 394 38V185H42Z" fill="url(#analytics-preview-fill)" />
      <path d="M42 185C78 171 95 174 124 144S175 161 205 115 252 133 284 82 337 99 394 38" fill="none" stroke="var(--app-arcad)" strokeLinecap="round" strokeWidth="3" />
      {[[42, 185], [124, 144], [205, 115], [284, 82], [394, 38]].map(([cx, cy], index) => (
        <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r={index === 4 ? 7 : 4} fill="var(--app-arcad)" className={index === 4 ? "motion-safe:animate-pulse motion-reduce:animate-none" : ""} />
      ))}
    </svg>
  );
}

interface AnalyticsInsight {
  headline: string;
  detail: string;
}

function AnalyticsInsight({ insight }: { insight: AnalyticsInsight }) {
  return (
    <section className="mx-auto w-full max-w-[1140px] px-6 pt-8 sm:px-10" aria-label="Focus insight">
      <div className="flex items-start gap-3 rounded-lg border px-4 py-3.5 sm:px-5" style={{ background: "var(--app-surface)", borderColor: "var(--app-border)", boxShadow: "var(--elev-1)" }}>
        <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full text-[14px]" style={{ background: "var(--app-arcad-soft)", color: "var(--app-arcad-strong)" }} aria-hidden="true">✦</span>
        <div>
          <p className="text-[14px] font-semibold" style={{ color: "var(--app-text)" }}>{insight.headline}</p>
          <p className="mt-0.5 text-[12.5px]" style={{ color: "var(--app-text-muted)" }}>{insight.detail}</p>
        </div>
      </div>
    </section>
  );
}

function getAnalyticsInsight(analytics: AnalyticsResponse, period: Period): AnalyticsInsight {
  const strongestDay = analytics.daily.reduce<DailyBucket | null>(
    (best, day) => (day.minutes > (best?.minutes ?? 0) ? day : best),
    null,
  );
  const strongestHour = (analytics.hourly ?? []).reduce<{ hour: number; minutes: number } | null>(
    (best, slot) => (slot.minutes > (best?.minutes ?? 0) ? slot : best),
    null,
  );

  if (analytics.current.sessions >= 3 && strongestHour && strongestHour.minutes > 0) {
    const window = focusWindow(strongestHour.hour);
    return {
      headline: `Your strongest focus window is the ${window}.`,
      detail: `${formatMinutes(strongestHour.minutes)} of your focus time landed there this ${period}.`,
    };
  }

  if (strongestDay && strongestDay.minutes > 0) {
    return {
      headline: `Your strongest focus day this ${period} was ${shortDay(strongestDay.date)}.`,
      detail: `${formatMinutes(strongestDay.minutes)} across ${strongestDay.sessions} session${strongestDay.sessions === 1 ? "" : "s"}.`,
    };
  }

  return {
    headline: "Your focus pattern is taking shape.",
    detail: "A few more sessions will reveal your strongest study rhythm.",
  };
}

function focusWindow(hour: number): string {
  if (hour < 12) return "morning";
  if (hour < 17) return "afternoon";
  if (hour < 22) return "evening";
  return "late night";
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

function Panel({ title, note, children }: { title: string; note?: ReactNode; children: ReactNode }) {
  return (
    <section className="min-w-0 rounded-lg p-5 sm:p-6" style={{ background: "var(--app-surface)", boxShadow: "var(--elev-1)" }}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="type-eyebrow" style={{ color: "var(--app-text-muted)" }}>{title}</h2>
        {note ? <div className="text-[12px]" style={{ color: "var(--app-text-muted)" }}>{note}</div> : null}
      </div>
      <div className="mt-5">{children}</div>
    </section>
  );
}

function Muted({ children }: { children: ReactNode }) {
  return <p className="text-[13.5px]" style={{ color: "var(--app-text-muted)" }}>{children}</p>;
}

function Legend() {
  return (
    <span className="flex items-center gap-3">
      <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-[2px]" style={{ background: "var(--app-accent)" }} />This period</span>
      <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-[2px]" style={{ boxShadow: "inset 0 0 0 1px var(--app-border-strong)" }} />Previous</span>
    </span>
  );
}

interface Bar {
  key: string;
  value: number;
  /** The same slot in the previous period, drawn as an outline behind. */
  ghost?: number;
  label: string;
  tip: ReactNode;
}

/** Bar chart with a minute scale, previous-period outlines and hover readouts. */
function Bars({ bars, height, label }: { bars: Bar[]; height: number; label: string }) {
  const [hovered, setHovered] = useState<number | null>(null);
  const top = niceMax(Math.max(1, ...bars.map((bar) => Math.max(bar.value, bar.ghost ?? 0))));
  const ticks = [top, top / 2, 0];
  const gap = bars.length > 12 ? "gap-[3px]" : "gap-2 sm:gap-3";

  return (
    <div className="flex gap-2" role="img" aria-label={label}>
      <div className="relative w-9 shrink-0" style={{ height }}>
        {ticks.map((tick) => (
          <span
            key={tick}
            className="absolute right-0 -translate-y-1/2 text-[10.5px] tabular-nums"
            style={{ top: `${(1 - tick / top) * 100}%`, color: "var(--app-text-faint)" }}
          >
            {tick === 0 ? "0" : formatAxis(tick)}
          </span>
        ))}
      </div>
      <div className="min-w-0 flex-1">
        <div className="relative" style={{ height }} onPointerLeave={() => setHovered(null)}>
          {ticks.map((tick) => (
            <div
              key={tick}
              className="absolute inset-x-0 border-t"
              style={{ top: `${(1 - tick / top) * 100}%`, borderColor: "var(--app-border)", borderTopStyle: tick === 0 ? "solid" : "dashed" }}
            />
          ))}
          <div className={`absolute inset-0 flex items-end ${gap}`}>
            {bars.map((bar, index) => {
              const active = hovered === index;
              return (
                <div
                  key={bar.key}
                  className="relative flex h-full flex-1 items-end justify-center rounded-t-[3px]"
                  style={{ background: active ? "var(--app-accent-soft)" : "transparent" }}
                  onPointerEnter={() => setHovered(index)}
                >
                  {bar.ghost ? (
                    <div
                      className="absolute bottom-0 w-full rounded-t-[3px]"
                      style={{ height: `${(bar.ghost / top) * 100}%`, boxShadow: "inset 0 0 0 1px var(--app-border-strong)" }}
                    />
                  ) : null}
                  <div
                    className={`relative rounded-t-[3px] transition-[height,opacity] duration-500 ease-out ${bar.ghost !== undefined ? "w-[64%]" : "w-full"}`}
                    style={{
                      height: bar.value > 0 ? `max(2px, ${(bar.value / top) * 100}%)` : 0,
                      background: "var(--app-accent)",
                      opacity: hovered === null || active ? 1 : 0.55,
                    }}
                  />
                  {active ? (
                    <div
                      className="pointer-events-none absolute bottom-full z-10 mb-2 w-max max-w-[200px] rounded-md px-2.5 py-1.5"
                      style={{
                        background: "var(--app-elev)",
                        boxShadow: "var(--elev-2)",
                        ...(index < bars.length * 0.2 ? { left: 0 } : index > bars.length * 0.8 ? { right: 0 } : { left: "50%", transform: "translateX(-50%)" }),
                      }}
                    >
                      {bar.tip}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
        <div className={`mt-2 flex ${gap}`}>
          {bars.map((bar, index) => (
            <span
              key={bar.key}
              className="flex-1 whitespace-nowrap text-center text-[11px] tabular-nums"
              style={{ color: hovered === index ? "var(--app-text)" : "var(--app-text-muted)" }}
            >
              {bar.label}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

function TipTitle({ children }: { children: ReactNode }) {
  return <p className="text-[12px] font-semibold" style={{ color: "var(--app-text)" }}>{children}</p>;
}

function TipLine({ children, muted }: { children: ReactNode; muted?: boolean }) {
  return <p className="text-[12px] tabular-nums" style={{ color: muted ? "var(--app-text-muted)" : "var(--app-text-soft)" }}>{children}</p>;
}

function PeakHour({ hourly }: { hourly: Array<{ hour: number; minutes: number }> }) {
  const peak = hourly.reduce<{ hour: number; minutes: number } | null>((best, slot) => (slot.minutes > (best?.minutes ?? 0) ? slot : best), null);
  if (!peak) return null;
  return <span className="tabular-nums">Peak {hourLabel(peak.hour)}–{hourLabel((peak.hour + 1) % 24)} · {formatMinutes(peak.minutes)}</span>;
}

function SubjectBreakdown({ subjects, total }: { subjects: SubjectBucket[]; total: number }) {
  const top = subjects[0]?.minutes || 1;
  return (
    <ul className="flex flex-col gap-3.5">
      {subjects.map((s) => (
        <li key={s.subject}>
          <div className="flex items-baseline justify-between gap-3 text-[13.5px]">
            <span className="min-w-0 truncate" style={{ color: "var(--app-text)" }}>{s.subject}</span>
            <span className="shrink-0 tabular-nums" style={{ color: "var(--app-text-muted)" }}>
              {formatMinutes(s.minutes)}
              <span className="ml-2 inline-block w-9 text-right" style={{ color: "var(--app-text-faint)" }}>
                {total ? Math.round((s.minutes / total) * 100) : 0}%
              </span>
            </span>
          </div>
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-[1px]" style={{ background: "var(--app-border)" }}>
            <div className="h-full" style={{ width: `${(s.minutes / top) * 100}%`, background: "var(--app-accent)" }} />
          </div>
          <p className="mt-1 text-[11.5px] tabular-nums" style={{ color: "var(--app-text-faint)" }}>
            {s.sessions} session{s.sessions === 1 ? "" : "s"} · avg {formatMinutes(s.sessions ? Math.round(s.minutes / s.sessions) : 0)}
          </p>
        </li>
      ))}
    </ul>
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

function StatCard({ label, value, delta, was }: { label: string; value: string; delta: number | null; was: string }) {
  const isUp = typeof delta === "number" && delta > 0;
  const isDown = typeof delta === "number" && delta < 0;
  return (
    <div className="min-w-0 rounded-lg p-4 sm:p-5" style={{ background: "var(--app-surface)", boxShadow: "var(--elev-1)" }}>
      <p className="type-eyebrow" style={{ color: "var(--app-text-muted)" }}>{label}</p>
      <p className="mt-3 truncate text-[26px] font-medium leading-none tabular-nums sm:text-[30px]" style={{ color: "var(--app-text)" }}>{value}</p>
      <p className="mt-2.5 truncate text-[12px] tabular-nums" style={{ color: "var(--app-text-muted)" }}>
        {typeof delta === "number" ? (
          <span className="mr-1.5 font-medium" style={{ color: isUp ? "var(--app-success)" : isDown ? "var(--app-danger)" : "var(--app-text-muted)" }}>
            {isUp ? "↑" : isDown ? "↓" : "→"} {Math.abs(delta)}%
          </span>
        ) : null}
        {was}
      </p>
    </div>
  );
}

/** Percentage change, or null when there's nothing to compare against. */
function change(now: number, before: number): number | null {
  return before ? Math.round(((now - before) / before) * 100) : null;
}

/** Round a chart's top up to a readable minute value. */
function niceMax(value: number): number {
  const step = value <= 60 ? 15 : value <= 180 ? 30 : value <= 600 ? 60 : 120;
  return Math.ceil(value / step) * step;
}

function formatAxis(minutes: number): string {
  if (minutes < 60) return `${Math.round(minutes)}m`;
  const hours = minutes / 60;
  return `${Number.isInteger(hours) ? hours : hours.toFixed(1)}h`;
}

function hourLabel(hour: number): string {
  const suffix = hour < 12 ? "am" : "pm";
  const h = hour % 12 === 0 ? 12 : hour % 12;
  return `${h}${suffix}`;
}

function shortDay(iso: string): string {
  const d = new Date(`${iso}T12:00:00Z`);
  return new Intl.DateTimeFormat("en-AU", { weekday: "short" }).format(d).slice(0, 3);
}

function dayOfMonth(iso: string): string {
  return String(Number(iso.slice(8, 10)));
}

function longDay(iso: string): string {
  const d = new Date(`${iso}T12:00:00Z`);
  return new Intl.DateTimeFormat("en-AU", { weekday: "short", day: "numeric", month: "short" }).format(d);
}
