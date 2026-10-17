"use client";

import Link from "next/link";
import { useMemo, type ReactNode } from "react";
import type { PlannerTask } from "@/lib/api/types";
import { formatDueSoon, formatDurationMinutes } from "@/lib/api/time";
import { useDashboardData } from "@/lib/app/DashboardProvider";
import { upcomingExamReadiness, type ExamReadiness } from "@/lib/app/examReadiness";
import RailStreakCard from "./sky/RailStreakCard";

/**
 * The column beside Today: one panel, read top to bottom. The next streak
 * card and what's due next. Everything in it is a real number
 * from the dashboard.
 */
export default function TodayRail() {
  const { data } = useDashboardData();
  const timezone = data.profile?.timezone || data.user.timezone || "Australia/Brisbane";
  const urgency = useMemo(() => new Map(upcomingExamReadiness(data).map((item) => [item.taskId, item])), [data]);
  const deadlines = useMemo(
    () => [...data.focusTasks].sort((a, b) => {
      const urgentA = urgency.get(a.id);
      const urgentB = urgency.get(b.id);
      if (Boolean(urgentA) !== Boolean(urgentB)) return urgentA ? -1 : 1;
      if (urgentA && urgentB && urgentA.behindMinutes !== urgentB.behindMinutes) return urgentB.behindMinutes - urgentA.behindMinutes;
      return Date.parse(a.dueAt) - Date.parse(b.dueAt);
    }),
    [data.focusTasks, urgency],
  );

  return (
    <aside
      aria-label="Your progress"
      className="self-start overflow-hidden rounded-xl @3xl/main:sticky @3xl/main:top-6"
      style={{ background: "var(--app-surface)", boxShadow: "var(--elev-1)" }}
    >
      {/* The streak itself is the card beside today's ring; this keeps the
          next streak card and what's due. */}
      <RailStreakCard />
      <DeadlinesSection tasks={deadlines} timezone={timezone} urgency={urgency} />
      <Link
        href="/app/analytics"
        className="ui-hover flex items-center justify-between border-t px-5 py-3 text-[13px] font-medium"
        style={{ borderColor: "var(--app-border)", color: "var(--app-text-soft)" }}
      >
        Your progress
        <Chevron />
      </Link>
    </aside>
  );
}

function Section({ title, aside, children }: { title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className="border-t px-5 py-4 first:border-t-0" style={{ borderColor: "var(--app-border)" }}>
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-[12.5px] font-medium" style={{ color: "var(--app-text-muted)" }}>
          {title}
        </h3>
        {aside ? (
          <span className="text-[12.5px] tabular-nums" style={{ color: "var(--app-text-muted)" }}>
            {aside}
          </span>
        ) : null}
      </div>
      {children}
    </section>
  );
}


function DeadlinesSection({ tasks, timezone, urgency }: { tasks: PlannerTask[]; timezone: string; urgency: Map<string, ExamReadiness> }) {
  return (
    <Section title="Due next">
      {tasks.length === 0 ? (
        <p className="mt-2 text-[13px]" style={{ color: "var(--app-text-muted)" }}>
          Nothing due. Add a deadline and it&apos;s planned in.
        </p>
      ) : (
        <ul className="mt-2.5 flex flex-col gap-3">
          {tasks.slice(0, 3).map((task) => (
            <li key={task.id} className="min-w-0">
              <p className="truncate text-[13.5px] font-medium" style={{ color: "var(--app-text)" }}>
                {task.title}{urgency.has(task.id) ? <span className="ml-1.5 rounded-full px-1.5 py-0.5 text-[9.5px] font-semibold" style={{ background: "color-mix(in oklab, var(--app-danger) 11%, var(--app-surface))", color: "var(--app-danger)" }}>Urgent</span> : null}
              </p>
              <p className="mt-0.5 truncate text-[12px] tabular-nums" style={{ color: "var(--app-text-muted)" }}>
                {task.subject ? `${task.subject} · ` : ""}
                {formatDueSoon(task.dueAt, timezone)} · {formatDurationMinutes(task.remainingMinutes)} left
              </p>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}


function Chevron() {
  return (
    <svg viewBox="0 0 20 20" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ color: "var(--app-text-faint)" }}>
      <path d="M8 5l5 5-5 5" />
    </svg>
  );
}
