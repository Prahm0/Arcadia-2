"use client";

import Link from "next/link";
import type { DashboardResponse, PlannerEvent, PlannerTask } from "@/lib/api/types";
import { dateKey } from "@/lib/api/time";
import { SubjectTag } from "../cards/shared";
import { addDays, dueIn, eventMinutes, isExam, shortMinutes } from "./calendar";
import { Bar, ExamWord, PanelTitle, Sparkle } from "./bits";
import { periodPosition, type TermPeriod } from "./period";

export interface SubjectInfo {
  name: string;
  colour: string;
}

interface ContextPanelProps {
  data: DashboardResponse;
  today: string;
  timezone: string;
  /** The period containing today, for "Term 3 · Week 10". */
  todayPeriod: TermPeriod;
  /** The period on screen, for its progress. */
  period: TermPeriod;
  studyEvents: PlannerEvent[];
  tasks: PlannerTask[];
  subjects: SubjectInfo[];
  selected: Set<string>;
  onToggleSubject: (name: string | null) => void;
  onOpenTask: (task: PlannerTask) => void;
  onJump: (key: string) => void;
  /** Day view has its own list and habits open, so this only shows on very wide screens there. */
  roomy?: boolean;
}

/**
 * Where you are and what's next: the date, the term and week, how the term's
 * plan is going, what's due, and which subjects the page is showing.
 */
export default function ContextPanel({
  data,
  today,
  timezone,
  todayPeriod,
  period,
  studyEvents,
  tasks,
  subjects,
  selected,
  onToggleSubject,
  onOpenTask,
  onJump,
  roomy = true,
}: ContextPanelProps) {
  const at = new Date(`${today}T12:00:00Z`);
  const month = new Intl.DateTimeFormat("en-AU", { month: "short", timeZone: "UTC" }).format(at).slice(0, 3).toUpperCase();
  const weekday = new Intl.DateTimeFormat("en-AU", { weekday: "long", timeZone: "UTC" }).format(at).toUpperCase();

  // Term progress: of the study planned up to today, how much got done.
  const toDate = studyEvents.filter((event) => dateKey(event.startAt, timezone) <= today);
  const planned = toDate.reduce((sum, event) => sum + eventMinutes(event), 0);
  const done = toDate.filter((event) => event.outcome === "completed").reduce((sum, event) => sum + eventMinutes(event), 0);
  const pct = planned ? done / planned : 0;
  const weekStars = period.weeks
    .filter((week) => week.number !== null)
    .map((week) => {
      const from = week.days[0].key;
      const to = week.days[6].key;
      const list = studyEvents.filter((event) => {
        const key = dateKey(event.startAt, timezone);
        return key >= from && key <= to && key <= today;
      });
      const weekPlanned = list.reduce((sum, event) => sum + eventMinutes(event), 0);
      const weekDone = list.filter((event) => event.outcome === "completed").reduce((sum, event) => sum + eventMinutes(event), 0);
      return { label: week.label, from, lit: weekPlanned > 0 && weekDone / weekPlanned >= 0.7, current: from <= today && today <= to };
    });

  const upcoming = tasks
    .filter((task) => task.status === "pending" && dateKey(task.dueAt, timezone) >= today)
    .slice(0, 5);
  const overdue = tasks.filter((task) => task.status === "pending" && dateKey(task.dueAt, timezone) < today).length;
  const all = selected.size === 0;

  return (
    <aside
      className={`hidden w-[248px] shrink-0 flex-col gap-5 overflow-y-auto border-r px-4 py-4 [scrollbar-width:thin] ${roomy ? "xl:flex" : "min-[1600px]:flex"}`}
      style={{ borderColor: "var(--app-border)" }}
      aria-label="Where you are"
    >
      <div>
        <p className="text-[30px] font-semibold leading-none tracking-[-0.03em] tabular-nums" style={{ color: "var(--app-text)" }}>
          {month} {at.getUTCDate()}
        </p>
        <p className="mt-1.5 text-[11.5px] font-medium tracking-[0.08em]" style={{ color: "var(--app-text-muted)" }}>{weekday}</p>
        <p className="mt-3 text-[13px] font-medium" style={{ color: "var(--app-text)" }}>{periodPosition(todayPeriod, today)}</p>
        {!todayPeriod.isTerm ? (
          <Link href="/app/profile" className="mt-1 block text-[12px]" style={{ color: "var(--app-text-muted)" }}>
            Add your state for real term dates →
          </Link>
        ) : null}
      </div>

      <section>
        <PanelTitle aside={<span className="text-[12.5px] tabular-nums" style={{ color: "var(--app-text)" }}>{Math.round(pct * 100)}%</span>}>
          {period.name} progress
        </PanelTitle>
        <div className="mt-2">
          <Bar value={pct} />
        </div>
        <p className="mt-1.5 text-[12px] tabular-nums" style={{ color: "var(--app-text-muted)" }}>
          {planned ? `${shortMinutes(done)} of ${shortMinutes(planned)} planned so far` : "Nothing planned yet"}
        </p>
        {weekStars.length ? (
          <div className="mt-2.5 flex flex-wrap items-center gap-[5px]" aria-label="Weeks where you did 70% of the plan">
            {weekStars.map((week) => (
              <button
                key={week.from}
                type="button"
                onClick={() => onJump(week.from)}
                title={`${week.label}${week.lit ? ": 70% or more of the plan done" : ""}`}
                aria-label={`${week.label}${week.lit ? ", on plan" : ""}`}
                className="grid h-4 w-4 place-items-center rounded-sm"
                style={{ boxShadow: week.current ? "0 0 0 1px var(--app-border-strong)" : undefined }}
              >
                <Sparkle lit={week.lit} size={week.current ? 11 : 9} />
              </button>
            ))}
          </div>
        ) : null}
      </section>

      <section>
        <PanelTitle>Upcoming</PanelTitle>
        {upcoming.length ? (
          <ul className="mt-2 flex flex-col">
            {upcoming.map((task) => {
              const key = dateKey(task.dueAt, timezone);
              const soon = key <= addDays(today, 2);
              return (
                <li key={task.id} className="group -mx-2 flex items-center gap-2 rounded-md px-2 py-1.5 ui-hover">
                  <button type="button" onClick={() => onOpenTask(task)} className="flex min-w-0 flex-1 items-center gap-1.5 text-left">
                    {isExam(task) ? <ExamWord /> : null}
                    <span className="truncate text-[13px]" style={{ color: "var(--app-text)" }}>{task.title}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onJump(key)}
                    title="Show on the calendar"
                    className="shrink-0 text-[11.5px] tabular-nums"
                    style={{ color: soon ? "var(--app-warning)" : "var(--app-text-muted)", fontWeight: soon ? 600 : 400 }}
                  >
                    {dueIn(key, today).replace(/^in /, "")}
                  </button>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="mt-2 text-[12.5px] leading-snug" style={{ color: "var(--app-text-muted)" }}>Nothing due. Add a deadline and Arcad plans the study.</p>
        )}
        {overdue ? (
          <Link href="/app/deadlines" className="mt-1.5 block text-[12px] font-medium" style={{ color: "var(--app-danger)" }}>
            {overdue} overdue →
          </Link>
        ) : null}
      </section>

      {subjects.length ? (
        <section>
          <PanelTitle>Subjects</PanelTitle>
          <ul className="mt-2 flex flex-col gap-0.5">
            <li>
              <FilterRow active={all} onClick={() => onToggleSubject(null)}>
                <span className="text-[13px]" style={{ color: all ? "var(--app-text)" : "var(--app-text-muted)" }}>All subjects</span>
              </FilterRow>
            </li>
            {subjects.map((subject) => {
              const on = selected.has(subject.name);
              return (
                <li key={subject.name}>
                  <FilterRow active={on} onClick={() => onToggleSubject(subject.name)} dim={!all && !on}>
                    <SubjectTag subject={subject} size="sm" />
                  </FilterRow>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      <div className="mt-auto flex flex-col gap-1 border-t pt-3 text-[12.5px]" style={{ borderColor: "var(--app-border)" }}>
        <Link href="/app/commitments" className="ui-hover -mx-2 rounded-md px-2 py-1" style={{ color: "var(--app-text-muted)" }}>
          Weekly commitments
        </Link>
        <Link href="/app/settings#calendars" className="ui-hover -mx-2 rounded-md px-2 py-1" style={{ color: "var(--app-text-muted)" }}>
          {data.google?.connected || data.calendarFeeds?.length ? "Connected calendars" : "Connect a calendar"}
        </Link>
      </div>
    </aside>
  );
}

function FilterRow({ active, dim, onClick, children }: { active: boolean; dim?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={active}
      onClick={onClick}
      className="ui-hover -mx-2 flex w-[calc(100%+1rem)] items-center gap-2.5 rounded-md px-2 py-1.5 text-left"
      style={{ opacity: dim ? 0.55 : 1 }}
    >
      <span
        className="grid h-[14px] w-[14px] shrink-0 place-items-center rounded-[4px]"
        style={{ background: active ? "var(--app-text)" : undefined, boxShadow: active ? undefined : "inset 0 0 0 1.5px var(--app-border-strong)", color: "var(--app-bg)" }}
        aria-hidden="true"
      >
        {active ? (
          <svg width="8" height="8" viewBox="0 0 10 10" fill="none">
            <path d="M1.5 5.2l2.3 2.3L8.6 2.4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        ) : null}
      </span>
      {children}
    </button>
  );
}

