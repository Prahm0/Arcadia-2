"use client";

import { useState } from "react";
import { dateKey } from "@/lib/api/time";
import { remakeMonthPlan, useMonthPlan, type MonthPlan, type MonthPlanWeek } from "@/lib/api/plan";
import type { DashboardResponse } from "@/lib/api/types";
import { useDashboardData } from "@/lib/app/DashboardProvider";
import { formatWeekly } from "@/lib/app/studyTargets";
import AppButton from "./AppButton";

type Subject = DashboardResponse["subjects"][number];

const DAY_MS = 86_400_000;
const key = (name: string) => name.trim().toLowerCase();

/** Plain YYYY-MM-DD maths, so no timezone can shift a day. */
const addDays = (date: string, days: number) =>
  new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);

function shortDate(date: string, options: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" }) {
  return new Intl.DateTimeFormat("en-AU", { ...options, timeZone: "UTC" }).format(Date.parse(`${date}T12:00:00Z`));
}

/**
 * A subject's minutes in one week, worked out the same way the scheduler
 * does: the plan's minutes, scaled if the usual week has changed since, or
 * just the usual week for a subject added after the plan was made.
 */
function minutesFor(plan: MonthPlan, week: MonthPlanWeek, subject: Subject): number {
  const usual = subject.weeklyMinutes ?? 0;
  const planned = week.subjects.find((entry) => key(entry.name) === key(subject.name))?.minutes;
  const base = plan.base[key(subject.name)];
  if (planned === undefined || !base) return usual;
  return Math.round((usual * planned) / base / 5) * 5;
}

/** "+1h 30m" / "−30m", or null when it's the usual week. */
function difference(minutes: number, usual: number): string | null {
  const delta = minutes - usual;
  if (Math.abs(delta) < 15) return null;
  return `${delta > 0 ? "+" : "−"}${formatWeekly(Math.abs(delta))}`;
}

/**
 * Arcad's month on the Arcad page: what the next four weeks are about, how
 * much time each subject gets each week against its usual week, and what's
 * due. Replanning rewrites the month and lays the sessions out again.
 */
export default function MonthPlanPanel() {
  const { data, reload } = useDashboardData();
  const { state, refresh, replace } = useMonthPlan();
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const timezone = data.profile?.timezone || "Australia/Brisbane";
  const today = dateKey(new Date().toISOString(), timezone);

  async function replan() {
    setWorking(true);
    setError(null);
    try {
      replace(await remakeMonthPlan());
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't replan. Try again in a sec.");
    } finally {
      setWorking(false);
    }
  }

  if (state.status === "loading") {
    return (
      <Card>
        <div className="grid min-h-[200px] place-items-center">
          <div
            aria-label="Loading your plan"
            className="h-6 w-6 animate-spin rounded-full border-2"
            style={{ borderColor: "var(--app-border)", borderTopColor: "var(--app-arcad)" }}
          />
        </div>
      </Card>
    );
  }

  if (state.status === "error") {
    return (
      <Card>
        <p className="text-[14px]" style={{ color: "var(--app-text)" }}>
          Couldn&apos;t load your plan.
        </p>
        <p className="mt-1 text-[13px]" style={{ color: "var(--app-text-muted)" }}>
          {state.error}
        </p>
        <AppButton className="mt-4" variant="secondary" onClick={() => void refresh()}>
          Try again
        </AppButton>
      </Card>
    );
  }

  const plan = state.plan;
  const weeks = plan ? plan.weeks.filter((week) => addDays(week.weekOf, 6) >= today) : [];

  if (!plan || weeks.length === 0) {
    return (
      <Card>
        <Eyebrow />
        <h2 className="mt-2 text-[20px] font-medium tracking-[-0.01em]" style={{ color: "var(--app-text)" }}>
          {plan ? "Your month plan has run out." : "No month plan yet."}
        </h2>
        <p className="mt-2 max-w-[520px] text-[14px]" style={{ color: "var(--app-text-muted)" }}>
          Arcad looks at your deadlines, your subjects and how each is going, and the school holidays, then splits your
          study time across the next four weeks.
        </p>
        {error ? <ErrorLine text={error} /> : null}
        <AppButton className="mt-5" variant="primary" loading={working} onClick={() => void replan()}>
          Plan my month
        </AppButton>
      </Card>
    );
  }

  const subjects = data.subjects.filter((subject) => (subject.weeklyMinutes ?? 0) > 0 || plan.base[key(subject.name)]);
  const busiest = Math.max(
    60,
    ...weeks.flatMap((week) => subjects.map((subject) => minutesFor(plan, week, subject))),
  );
  const thisMonday = weeks[0].weekOf;
  const pending = data.tasks.filter((task) => task.status === "pending");

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 max-w-[620px]">
            <Eyebrow />
            <p className="mt-2 text-[16px] leading-[1.5]" style={{ color: "var(--app-text)" }}>
              {plan.summary}
            </p>
            <p className="mt-2 text-[12.5px]" style={{ color: "var(--app-text-muted)" }}>
              {plan.by === "arcad" ? "Planned by Arcad" : "Built from your deadlines and subjects"} on{" "}
              {new Intl.DateTimeFormat("en-AU", { day: "numeric", month: "short", timeZone: timezone }).format(
                new Date(plan.createdAt),
              )}
              . Replan after adding deadlines or changing subjects.
            </p>
          </div>
          <AppButton variant="secondary" loading={working} onClick={() => void replan()}>
            Replan
          </AppButton>
        </div>
        {error ? <ErrorLine text={error} /> : null}
      </Card>

      <ol className="flex flex-col gap-3">
        {weeks.map((week) => {
          const end = addDays(week.weekOf, 6);
          const due = pending
            .map((task) => ({ task, on: dateKey(task.dueAt, timezone) }))
            .filter(({ on }) => on >= week.weekOf && on <= end)
            .sort((a, b) => a.on.localeCompare(b.on));
          const rows = subjects.map((subject) => ({
            subject,
            minutes: minutesFor(plan, week, subject),
            usual: subject.weeklyMinutes ?? 0,
          }));
          const total = rows.reduce((sum, row) => sum + row.minutes, 0);
          const current = week.weekOf === thisMonday && week.weekOf <= today;
          const heading = current
            ? "This week"
            : week.weekOf === addDays(thisMonday, 7) && thisMonday <= today
              ? "Next week"
              : `Week of ${shortDate(week.weekOf)}`;

          return (
            <li
              key={week.weekOf}
              className="rounded-lg p-5"
              style={{
                background: "var(--app-surface)",
                boxShadow: current ? "inset 3px 0 0 var(--app-arcad), var(--elev-1)" : "var(--elev-1)",
              }}
            >
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <h3 className="text-[15px] font-medium" style={{ color: "var(--app-text)" }}>
                  {heading}
                  <span className="ml-2 text-[12.5px] font-normal" style={{ color: "var(--app-text-muted)" }}>
                    {shortDate(week.weekOf)} – {shortDate(end)}
                    {week.label ? ` · ${week.label}` : ""}
                  </span>
                </h3>
                <span className="tabular-nums text-[12.5px]" style={{ color: "var(--app-text-muted)" }}>
                  {formatWeekly(total)} of study
                </span>
              </div>
              <p className="mt-1.5 text-[14px]" style={{ color: "var(--app-text-soft)" }}>
                {week.focus}
              </p>

              <ul className="mt-4 grid grid-cols-1 gap-x-6 gap-y-2.5 sm:grid-cols-2">
                {rows.map(({ subject, minutes, usual }) => {
                  const change = difference(minutes, usual);
                  const colour = subject.colour || "var(--app-text-muted)";
                  return (
                    <li key={subject.id} className="min-w-0">
                      <div className="flex items-baseline justify-between gap-2 text-[13px]">
                        <span
                          className="truncate font-medium"
                          style={{ color: `color-mix(in oklab, ${colour} 70%, var(--app-text))` }}
                        >
                          {subject.name}
                        </span>
                        <span className="shrink-0 tabular-nums" style={{ color: "var(--app-text)" }}>
                          {formatWeekly(minutes)}
                          {change ? (
                            <span
                              className="ml-1.5 text-[12px]"
                              style={{ color: "var(--app-text-muted)" }}
                              title={`Usually ${formatWeekly(usual)}`}
                            >
                              {change}
                            </span>
                          ) : null}
                        </span>
                      </div>
                      <div
                        className="mt-1.5 h-1 overflow-hidden rounded-full"
                        style={{ background: "var(--app-surface-soft)" }}
                        aria-hidden="true"
                      >
                        <div
                          className="h-full rounded-full"
                          style={{ width: `${Math.min(100, (minutes / busiest) * 100)}%`, background: colour }}
                        />
                      </div>
                    </li>
                  );
                })}
              </ul>

              {due.length ? (
                <div className="mt-4 border-t pt-3" style={{ borderColor: "var(--app-border)" }}>
                  <p className="text-[12px] font-medium" style={{ color: "var(--app-text-muted)" }}>
                    Due this week
                  </p>
                  <ul className="mt-1.5 flex flex-col gap-1">
                    {due.map(({ task, on }) => (
                      <li key={task.id} className="flex items-baseline justify-between gap-3 text-[13.5px]">
                        <span className="min-w-0 truncate" style={{ color: "var(--app-text)" }}>
                          {task.title}
                          {task.subject ? (
                            <span style={{ color: "var(--app-text-muted)" }}> · {task.subject}</span>
                          ) : null}
                        </span>
                        <span className="shrink-0 tabular-nums text-[12.5px]" style={{ color: "var(--app-text-muted)" }}>
                          {shortDate(on, { weekday: "short", day: "numeric", month: "short" })}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg p-6" style={{ background: "var(--app-surface)", boxShadow: "var(--elev-1)" }}>
      {children}
    </div>
  );
}

function Eyebrow() {
  return (
    <p className="type-eyebrow" style={{ color: "var(--app-arcad-strong)" }}>
      Arcad&apos;s plan
    </p>
  );
}

function ErrorLine({ text }: { text: string }) {
  return (
    <p role="alert" className="mt-3 text-[13px]" style={{ color: "var(--app-danger)" }}>
      {text}
    </p>
  );
}
