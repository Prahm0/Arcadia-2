"use client";

import Link from "next/link";
import type { PlannerEvent } from "@/lib/api/types";
import { dateKey } from "@/lib/api/time";
import { SubjectTag } from "../cards/shared";
import { eventMinutes, shortMinutes } from "./calendar";
import { Bar, PanelTitle, Sparkle } from "./bits";
import type { TermPeriod } from "./period";

export interface SubjectInfo {
  name: string;
  colour: string;
}

interface ContextPanelProps {
  today: string;
  timezone: string;
  /** The period on screen, for its progress. */
  period: TermPeriod;
  studyEvents: PlannerEvent[];
  subjects: SubjectInfo[];
  selected: Set<string>;
  onToggleSubject: (name: string | null) => void;
  onJump: (key: string) => void;
  /** Day view has its own list and habits open, so this only shows on very wide screens there. */
  roomy?: boolean;
  /** The term's progress bar and week stars: only in the term view. */
  showProgress?: boolean;
}

/**
 * Beside the grid: today's date, how the term's plan is going (term view)
 * and which subjects the page is showing. What's due lives on Deadlines and
 * the term and week in the page header.
 */
export default function ContextPanel({
  today,
  timezone,
  period,
  studyEvents,
  subjects,
  selected,
  onToggleSubject,
  onJump,
  roomy = true,
  showProgress = true,
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
      </div>

      {showProgress ? <section>
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
      </section> : null}


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

