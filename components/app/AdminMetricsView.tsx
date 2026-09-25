"use client";

import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { api } from "@/lib/api/client";
import { formatMinutes } from "@/lib/api/time";
import { useDashboardData } from "@/lib/app/DashboardProvider";
import {
  METRIC_PERIODS,
  type AdminDay,
  type AdminMetrics,
  type AiSpendRow,
  type MetricPeriod,
  type PeriodCount,
} from "@/shared/adminMetrics";
import AppButton, { appButtonClass } from "./AppButton";
import PageHeader from "./PageHeader";

const WIDTH = 1140;
const POSTHOG_URL = "https://eu.posthog.com";

/**
 * Developers' view of how Arcadia is doing: accounts, actives, plans, the
 * signup funnel, feature use, retention and AI spend, straight from D1.
 * What people click and where they get stuck lives in PostHog.
 */
export default function AdminMetricsView() {
  const { data } = useDashboardData();
  const developer = Boolean(data.user.developerAccess);
  const [days, setDays] = useState<MetricPeriod>(30);
  const [metrics, setMetrics] = useState<AdminMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const request = useRef(0);

  const load = useCallback(async () => {
    const id = ++request.current;
    setLoading(true);
    setError(null);
    try {
      const response = await api<AdminMetrics>(`/api/admin/metrics?days=${days}`);
      if (request.current === id) setMetrics(response);
    } catch (err) {
      if (request.current === id) setError(err instanceof Error ? err.message : "Couldn't load the numbers.");
    } finally {
      if (request.current === id) setLoading(false);
    }
  }, [days]);

  useEffect(() => {
    if (!developer) return;
    const timer = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(timer);
  }, [developer, load]);

  if (!developer) {
    return (
      <>
        <PageHeader width={WIDTH} eyebrow="Developer" title="Metrics" />
        <Section>
          <Muted>This page is for Arcadia developers.</Muted>
        </Section>
      </>
    );
  }

  const m = metrics;
  const periodLabel = `last ${days} days`;
  const updated = m ? new Date(m.generatedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : null;

  return (
    <>
      <PageHeader
        width={WIDTH}
        eyebrow="Developer"
        title="Metrics"
        meta={`Students only, developers left out · UTC days${updated ? ` · updated ${updated}` : ""}`}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <PeriodPicker days={days} setDays={setDays} />
            <AppButton variant="ghost" onClick={() => void load()} disabled={loading}>Refresh</AppButton>
            <a href={POSTHOG_URL} target="_blank" rel="noreferrer" className={appButtonClass("secondary")}>
              PostHog <span aria-hidden="true">↗</span>
            </a>
          </div>
        }
      />

      {error ? (
        <Section>
          <p role="alert" className="text-[13px]" style={{ color: "var(--app-danger)" }}>{error}</p>
        </Section>
      ) : null}

      {!m ? (
        <Section>
          <Muted>{loading ? "Loading…" : "No numbers yet."}</Muted>
        </Section>
      ) : (
        // Hold the last numbers, dimmed, while a new period loads.
        <div className="pb-16 transition-opacity" style={{ opacity: loading ? 0.55 : 1 }} aria-busy={loading}>
          <div className="mx-auto grid w-full grid-cols-2 gap-3 px-6 pt-4 sm:px-10 @3xl/main:grid-cols-4 @3xl/main:gap-4" style={{ maxWidth: WIDTH }}>
            <StatTile
              label="Accounts"
              value={count(m.users.total)}
              detail={`${count(m.users.verified)} verified · ${count(m.users.guests)} guests`}
            />
            <StatTile
              label="Signups"
              value={count(m.users.signups.current)}
              delta={change(m.users.signups)}
              detail={`${count(m.users.signups.previous)} the ${days} days before`}
            />
            <StatTile
              label="Active this week"
              value={count(m.active.week)}
              detail={`${count(m.active.today)} today · ${count(m.active.month)} in 30 days`}
            />
            <StatTile
              label="Paying"
              value={count(m.plans.pro + m.plans.max)}
              detail={`${percent(m.plans.pro + m.plans.max, m.users.verified)} of verified`}
            />
          </div>

          <div className="mx-auto grid w-full gap-4 px-6 pt-4 sm:px-10 @3xl/main:grid-cols-3" style={{ maxWidth: WIDTH }}>
            <DailyBars title="Active students" series={m.series.map(({ day, active }) => ({ day, value: active }))} format={count} summary="average" />
            <DailyBars title="Signups" series={m.series.map(({ day, signups }) => ({ day, value: signups }))} format={count} />
            <DailyBars title="Focus time" series={m.series.map(({ day, focusMinutes }) => ({ day, value: focusMinutes }))} format={formatMinutes} />
          </div>
          <Section>
            <DailyTable series={m.series} />
          </Section>

          <div className="mx-auto grid w-full gap-4 px-6 pt-4 sm:px-10 @3xl/main:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]" style={{ maxWidth: WIDTH }}>
            <Panel title="Signup funnel" note={`${count(m.funnel.signedUp)} accounts made, ${periodLabel}`}>
              <Funnel funnel={m.funnel} />
            </Panel>
            <Panel title="Plans" note="Everyone, now">
              <Plans metrics={m} />
            </Panel>
          </div>

          <Section>
            <Panel title="Feature use" note={`${periodLabel} vs the ${days} before`}>
              <UsageTable usage={m.usage} />
            </Panel>
          </Section>

          <Section>
            <Panel title="Retention" note="Share of each signup week active in later weeks">
              <Retention cohorts={m.retention} />
            </Panel>
          </Section>

          <Section>
            <AiSpend ai={m.ai} activeMonth={m.active.month} days={days} periodDays={m.series.map((day) => day.day)} />
          </Section>
        </div>
      )}
    </>
  );
}

// ────────── Pieces ──────────

function Section({ children }: { children: ReactNode }) {
  return <div className="mx-auto w-full px-6 pt-4 sm:px-10" style={{ maxWidth: WIDTH }}>{children}</div>;
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

function PeriodPicker({ days, setDays }: { days: MetricPeriod; setDays: (days: MetricPeriod) => void }) {
  return (
    <div className="inline-flex rounded-md p-1" role="group" aria-label="Period" style={{ background: "var(--app-surface-soft)", boxShadow: "var(--elev-inset)" }}>
      {METRIC_PERIODS.map((option) => (
        <button
          key={option}
          type="button"
          onClick={() => setDays(option)}
          aria-pressed={days === option}
          className="rounded-sm px-3 py-1.5 text-[13px] font-medium"
          style={{
            background: days === option ? "var(--app-surface)" : "transparent",
            color: days === option ? "var(--app-text)" : "var(--app-text-muted)",
            boxShadow: days === option ? "var(--elev-1)" : "none",
          }}
        >
          {option} days
        </button>
      ))}
    </div>
  );
}

/** A headline number. `delta` is a % change, coloured by whether it's good news. */
function StatTile({ label, value, detail, delta, upIsGood = true }: {
  label: string;
  value: string;
  detail: string;
  delta?: number | null;
  upIsGood?: boolean;
}) {
  const good = typeof delta === "number" && delta !== 0 && (delta > 0) === upIsGood;
  const bad = typeof delta === "number" && delta !== 0 && !good;
  return (
    <div className="min-w-0 rounded-lg p-4 sm:p-5" style={{ background: "var(--app-surface)", boxShadow: "var(--elev-1)" }}>
      <p className="type-eyebrow" style={{ color: "var(--app-text-muted)" }}>{label}</p>
      <p className="mt-3 truncate text-[26px] font-medium leading-none sm:text-[30px]" style={{ color: "var(--app-text)" }}>{value}</p>
      <p className="mt-2.5 truncate text-[12px]" style={{ color: "var(--app-text-muted)" }}>
        {typeof delta === "number" ? (
          <span className="mr-1.5 font-medium" style={{ color: good ? "var(--app-success)" : bad ? "var(--app-danger)" : "var(--app-text-muted)" }}>
            {delta > 0 ? "↑" : delta < 0 ? "↓" : "→"} {Math.abs(delta)}%
          </span>
        ) : null}
        {detail}
      </p>
    </div>
  );
}

/**
 * One measure per day as bars, with a readout on hover or arrow keys. Each
 * measure gets its own chart and scale; they're never stacked on one axis.
 * Counts of people can't be summed across days, so those show an average.
 */
function DailyBars({ title, series, format, summary = "total", height = 128 }: {
  title: string;
  series: Array<{ day: string; value: number }>;
  format: (value: number) => string;
  summary?: "total" | "average";
  height?: number;
}) {
  const [active, setActive] = useState<number | null>(null);
  const values = series.map((point) => point.value);
  const total = values.reduce((sum, item) => sum + item, 0);
  const note = summary === "average"
    ? `${(total / Math.max(1, series.length)).toFixed(1)} a day`
    : `${format(Math.round(total))} total`;
  const top = niceCeil(Math.max(1, ...values));
  const gap = series.length > 31 ? "gap-px" : "gap-[2px]";
  const shown = active === null ? null : series[active];

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const step = event.key === "ArrowLeft" ? -1 : 1;
    setActive((current) => Math.min(series.length - 1, Math.max(0, (current ?? series.length) + step)));
  }

  return (
    <Panel title={title} note={<span className="tabular-nums">{note}</span>}>
      <div className="flex gap-2">
        <div className="relative w-8 shrink-0" style={{ height }}>
          {[top, 0].map((tick) => (
            <span key={tick} className="absolute right-0 -translate-y-1/2 text-[10.5px] tabular-nums" style={{ top: `${(1 - tick / top) * 100}%`, color: "var(--app-text-faint)" }}>
              {compact(tick, format)}
            </span>
          ))}
        </div>
        <div className="min-w-0 flex-1">
          <div
            className="relative rounded-[2px] outline-offset-4"
            style={{ height }}
            tabIndex={0}
            role="img"
            aria-label={`${title} per day over ${series.length} days, ${note}. Use the arrow keys to read each day.`}
            onKeyDown={onKeyDown}
            onBlur={() => setActive(null)}
            onPointerLeave={() => setActive(null)}
          >
            {[1, 0.5, 0].map((line) => (
              <div key={line} className="absolute inset-x-0 border-t" style={{ top: `${(1 - line) * 100}%`, borderColor: line === 0 ? "var(--app-border-strong)" : "var(--app-border)" }} />
            ))}
            <div className={`absolute inset-0 flex items-end ${gap}`}>
              {values.map((item, index) => (
                <div
                  key={series[index].day}
                  className="flex h-full flex-1 items-end"
                  onPointerEnter={() => setActive(index)}
                >
                  <div
                    className="w-full rounded-t-[3px]"
                    style={{
                      height: item > 0 ? `max(2px, ${(item / top) * 100}%)` : 0,
                      background: "var(--app-accent)",
                      opacity: active === null || active === index ? 1 : 0.45,
                    }}
                  />
                </div>
              ))}
            </div>
            {shown && active !== null ? (
              <div
                className="pointer-events-none absolute bottom-full z-10 mb-2 w-max rounded-md px-2.5 py-1.5"
                style={{
                  background: "var(--app-elev)",
                  boxShadow: "var(--elev-2)",
                  ...(active < series.length * 0.25 ? { left: 0 } : active > series.length * 0.75 ? { right: 0 } : { left: `${((active + 0.5) / series.length) * 100}%`, transform: "translateX(-50%)" }),
                }}
              >
                <p className="text-[12px] font-semibold" style={{ color: "var(--app-text)" }}>{longDay(shown.day)}</p>
                <p className="text-[12px] tabular-nums" style={{ color: "var(--app-text-soft)" }}>{format(values[active])}</p>
              </div>
            ) : null}
          </div>
          <div className="mt-2 flex justify-between text-[11px] tabular-nums" style={{ color: "var(--app-text-muted)" }}>
            <span>{shortDay(series[0]?.day)}</span>
            <span>{shortDay(series[series.length - 1]?.day)}</span>
          </div>
        </div>
      </div>
    </Panel>
  );
}

/** The daily charts as a table, newest first. */
function DailyTable({ series }: { series: AdminDay[] }) {
  return (
    <details className="rounded-lg px-5 py-3" style={{ background: "var(--app-surface)", boxShadow: "var(--elev-1)" }}>
      <summary className="cursor-pointer text-[13px] font-medium" style={{ color: "var(--app-text-soft)" }}>Daily numbers as a table</summary>
      <div className="mt-3 max-h-[320px] overflow-auto">
        <table className="w-full text-[13px] tabular-nums">
          <thead>
            <tr style={{ color: "var(--app-text-muted)" }}>
              <Th align="left">Day</Th>
              <Th>Active</Th>
              <Th>Signups</Th>
              <Th>Focus</Th>
            </tr>
          </thead>
          <tbody>
            {[...series].reverse().map((day) => (
              <tr key={day.day} className="border-t" style={{ borderColor: "var(--app-border)", color: "var(--app-text)" }}>
                <Td align="left">{longDay(day.day)}</Td>
                <Td>{count(day.active)}</Td>
                <Td>{count(day.signups)}</Td>
                <Td>{formatMinutes(day.focusMinutes)}</Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

function Funnel({ funnel }: { funnel: AdminMetrics["funnel"] }) {
  const steps: Array<[string, number]> = [
    ["Made an account", funnel.signedUp],
    ["Verified their email", funnel.verified],
    ["Finished onboarding", funnel.onboarded],
    ["Did a focus session", funnel.focused],
    ["Came back another day", funnel.returned],
    ["Paying now", funnel.paid],
  ];
  if (funnel.signedUp === 0) return <Muted>No new accounts in this period.</Muted>;
  return (
    <ol className="flex flex-col gap-3">
      {steps.map(([label, value]) => (
        <li key={label}>
          <div className="flex items-baseline justify-between gap-3 text-[13.5px]">
            <span className="min-w-0 truncate" style={{ color: "var(--app-text)" }}>{label}</span>
            <span className="shrink-0 tabular-nums" style={{ color: "var(--app-text-muted)" }}>
              {count(value)}
              <span className="ml-2 inline-block w-10 text-right" style={{ color: "var(--app-text-faint)" }}>{percent(value, funnel.signedUp)}</span>
            </span>
          </div>
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-[2px]" style={{ background: "var(--app-border)" }}>
            <div className="h-full rounded-[2px]" style={{ width: `${(value / funnel.signedUp) * 100}%`, background: "var(--app-accent)" }} />
          </div>
        </li>
      ))}
    </ol>
  );
}

function Plans({ metrics }: { metrics: AdminMetrics }) {
  const { plans, users } = metrics;
  const rows: Array<[string, number, string?]> = [
    ["Free", plans.free],
    ["Pro", plans.pro],
    ["Max", plans.max],
  ];
  const billing: Array<[string, number, string?]> = [
    ["Paying through Stripe", plans.stripe],
    ["Paying through the App Store", plans.appStore],
    ["Payment overdue", plans.pastDue, "Stripe past_due: still on their plan while Stripe retries"],
    ["Free with Pro from invites", plans.referralPro],
    ["Developers (not counted)", users.developers],
  ];
  return (
    <div className="flex flex-col gap-4">
      <List rows={rows} />
      <div className="border-t pt-4" style={{ borderColor: "var(--app-border)" }}>
        <List rows={billing} />
      </div>
    </div>
  );
}

function List({ rows }: { rows: Array<[string, number, string?]> }) {
  return (
    <dl className="flex flex-col gap-2 text-[13.5px]">
      {rows.map(([label, value, title]) => (
        <div key={label} className="flex items-baseline justify-between gap-3" title={title}>
          <dt style={{ color: "var(--app-text-soft)" }}>{label}</dt>
          <dd className="tabular-nums" style={{ color: "var(--app-text)" }}>{count(value)}</dd>
        </div>
      ))}
    </dl>
  );
}

const USAGE_ROWS: Array<[keyof AdminMetrics["usage"], string, (value: number) => string]> = [
  ["focusMinutes", "Focus time", formatMinutes],
  ["focusSessions", "Focus sessions", count],
  ["arcadMessages", "Messages to Arcad", count],
  ["tasksCompleted", "Tasks completed", count],
  ["decksCreated", "Flashcard decks made", count],
  ["cardsReviewed", "Cards reviewed¹", count],
  ["sheetsCreated", "Summary sheets saved", count],
  ["filesAdded", "Files added", count],
  ["roomJoins", "Room joins", count],
  ["feedback", "Feedback sent", count],
];

function UsageTable({ usage }: { usage: AdminMetrics["usage"] }) {
  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[420px] text-[13.5px] tabular-nums">
          <thead>
            <tr style={{ color: "var(--app-text-muted)" }}>
              <Th align="left">Feature</Th>
              <Th>This period</Th>
              <Th>Before</Th>
              <Th>Change</Th>
            </tr>
          </thead>
          <tbody>
            {USAGE_ROWS.map(([key, label, format]) => {
              const row = usage[key];
              const delta = change(row);
              return (
                <tr key={key} className="border-t" style={{ borderColor: "var(--app-border)" }}>
                  <Td align="left"><span style={{ color: "var(--app-text)" }}>{label}</span></Td>
                  <Td><span style={{ color: "var(--app-text)" }}>{format(row.current)}</span></Td>
                  <Td><span style={{ color: "var(--app-text-muted)" }}>{format(row.previous)}</span></Td>
                  <Td>
                    {delta === null ? (
                      <span style={{ color: "var(--app-text-faint)" }}>–</span>
                    ) : (
                      <span style={{ color: delta > 0 ? "var(--app-success)" : delta < 0 ? "var(--app-danger)" : "var(--app-text-muted)" }}>
                        {delta > 0 ? "↑" : delta < 0 ? "↓" : "→"} {Math.abs(delta)}%
                      </span>
                    )}
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-[12px]" style={{ color: "var(--app-text-faint)" }}>
        ¹ Each card counts once, in the period of its latest review.
      </p>
    </>
  );
}

function Retention({ cohorts }: { cohorts: AdminMetrics["retention"] }) {
  const columns = Math.max(0, ...cohorts.map((cohort) => cohort.weeks.length));
  if (cohorts.every((cohort) => cohort.size === 0)) return <Muted>No signups in the last eight weeks.</Muted>;
  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] text-[13px] tabular-nums">
          <thead>
            <tr style={{ color: "var(--app-text-muted)" }}>
              <Th align="left">Signed up week of</Th>
              <Th>Students</Th>
              {Array.from({ length: columns }, (_, index) => <Th key={index}>Week {index + 1}</Th>)}
            </tr>
          </thead>
          <tbody>
            {cohorts.map((cohort) => (
              <tr key={cohort.week} className="border-t" style={{ borderColor: "var(--app-border)" }}>
                <Td align="left"><span style={{ color: "var(--app-text)" }}>{shortDay(cohort.week)}</span></Td>
                <Td><span style={{ color: "var(--app-text)" }}>{count(cohort.size)}</span></Td>
                {Array.from({ length: columns }, (_, index) => {
                  const share = cohort.weeks[index];
                  if (share === undefined || share === null || cohort.size === 0) {
                    const unfinished = share === null && cohort.size > 0;
                    return <Td key={index}><span style={{ color: "var(--app-text-faint)" }}>{unfinished ? "…" : ""}</span></Td>;
                  }
                  return (
                    <td key={index} className="px-1 py-1">
                      {/* One hue, stronger for a bigger share; capped so the text keeps its contrast in both themes. */}
                      <span
                        className="block rounded-[3px] px-2 py-1 text-right"
                        style={{ background: `color-mix(in oklab, var(--app-accent) ${Math.round(share * 35)}%, var(--app-surface))`, color: "var(--app-text)" }}
                      >
                        {Math.round(share * 100)}%
                      </span>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-[12px]" style={{ color: "var(--app-text-faint)" }}>
        Weeks run Monday to Sunday. “…” is a week that hasn&apos;t finished yet.
      </p>
    </>
  );
}

function AiSpend({ ai, activeMonth, days, periodDays }: {
  ai: AdminMetrics["ai"];
  activeMonth: number;
  days: MetricPeriod;
  periodDays: string[];
}) {
  if (!ai) {
    return (
      <Panel title="AI spend">
        <Muted>This starts once the AI cost PR (#217) is merged. It adds the ai_usage table these numbers come from.</Muted>
      </Panel>
    );
  }
  const spendByDay = new Map(ai.series.map((point) => [point.day, point.costMicros]));
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 @3xl/main:grid-cols-3 @3xl/main:gap-4">
        <StatTile
          label="AI spend"
          value={money(ai.costMicros.current)}
          delta={change(ai.costMicros)}
          upIsGood={false}
          detail={`${money(ai.costMicros.previous)} the ${days} days before`}
        />
        <StatTile label="AI calls" value={count(ai.calls)} detail={`${money(ai.calls ? ai.costMicros.current / ai.calls : 0)} a call`} />
        <StatTile
          label="Per active student"
          value={money(activeMonth ? ai.costMicros.current / activeMonth : 0)}
          detail={`Over ${count(activeMonth)} active in 30 days`}
        />
      </div>
      <DailyBars
        title="AI spend per day"
        series={periodDays.map((day) => ({ day, value: spendByDay.get(day) ?? 0 }))}
        format={money}
        height={112}
      />
      <div className="grid gap-4 @3xl/main:grid-cols-2">
        <Panel title="By feature" note="US$, includes developers">
          <SpendBars rows={ai.byFeature} />
        </Panel>
        <Panel title="By plan">
          <SpendBars rows={ai.byTier} />
        </Panel>
      </div>
    </div>
  );
}

function SpendBars({ rows }: { rows: AiSpendRow[] }) {
  const top = Math.max(1, ...rows.map((row) => row.costMicros));
  if (rows.length === 0) return <Muted>No AI calls in this period.</Muted>;
  return (
    <ul className="flex flex-col gap-3">
      {rows.map((row) => (
        <li key={row.key}>
          <div className="flex items-baseline justify-between gap-3 text-[13.5px]">
            <span className="min-w-0 truncate" style={{ color: "var(--app-text)" }}>{label(row.key)}</span>
            <span className="shrink-0 tabular-nums" style={{ color: "var(--app-text-muted)" }}>
              {money(row.costMicros)}
              <span className="ml-2" style={{ color: "var(--app-text-faint)" }}>{count(row.calls)} calls</span>
            </span>
          </div>
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-[2px]" style={{ background: "var(--app-border)" }}>
            <div className="h-full rounded-[2px]" style={{ width: `${(row.costMicros / top) * 100}%`, background: "var(--app-accent)" }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

function Th({ children, align = "right" }: { children: ReactNode; align?: "left" | "right" }) {
  return <th className="px-2 pb-2 text-[12px] font-medium" style={{ textAlign: align }}>{children}</th>;
}

function Td({ children, align = "right" }: { children: ReactNode; align?: "left" | "right" }) {
  return <td className="px-2 py-2" style={{ textAlign: align }}>{children}</td>;
}

// ────────── Formatting ──────────

const counter = new Intl.NumberFormat("en-AU");
function count(value: number): string {
  return counter.format(Math.round(value));
}

function percent(part: number, whole: number): string {
  return whole ? `${Math.round((part / whole) * 100)}%` : "–";
}

/** Percentage change, or null when there's nothing to compare against. */
function change({ current, previous }: PeriodCount): number | null {
  return previous ? Math.round(((current - previous) / previous) * 100) : null;
}

function money(micros: number): string {
  const dollars = micros / 1_000_000;
  if (dollars > 0 && dollars < 0.01) return "<$0.01";
  return `$${dollars.toFixed(2)}`;
}

function label(key: string): string {
  const text = key.replace(/[_-]+/g, " ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** Round a chart's top up to 1, 2 or 5 times a power of ten. */
function niceCeil(value: number): number {
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const scaled = value / magnitude;
  return (scaled <= 1 ? 1 : scaled <= 2 ? 2 : scaled <= 5 ? 5 : 10) * magnitude;
}

/** Axis ticks stay short: 1.2k, 3h. */
function compact(value: number, format: (value: number) => string): string {
  if (format === formatMinutes) return value >= 60 ? `${Math.round(value / 60)}h` : `${value}m`;
  if (format === money) return value ? money(value) : "$0";
  return value >= 1000 ? `${(value / 1000).toFixed(value >= 10_000 ? 0 : 1)}k` : String(value);
}

function parseDay(day: string): Date {
  return new Date(`${day}T00:00:00Z`);
}

function shortDay(day: string | undefined): string {
  if (!day) return "";
  return parseDay(day).toLocaleDateString("en-AU", { day: "numeric", month: "short", timeZone: "UTC" });
}

function longDay(day: string): string {
  return parseDay(day).toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
}
