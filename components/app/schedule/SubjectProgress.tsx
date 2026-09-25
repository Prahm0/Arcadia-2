"use client";

import type { PlannerEvent } from "@/lib/api/types";
import { dateKey } from "@/lib/api/time";
import type { SubjectInfo } from "./ContextPanel";
import { addDays, eventMinutes, mondayOf, sameSubject, shortMinutes } from "./calendar";

/**
 * The plan is only useful when students can see whether it is working. This
 * compact row keeps completed minutes next to the minutes Arcadia scheduled.
 */
export default function SubjectProgress({
  subjects,
  studyEvents,
  anchor,
  timezone,
}: {
  subjects: SubjectInfo[];
  studyEvents: PlannerEvent[];
  anchor: string;
  timezone: string;
}) {
  if (!subjects.length) return null;

  const weekStart = mondayOf(anchor);
  const weekEnd = addDays(weekStart, 6);
  const rows = subjects.map((subject) => {
    const events = studyEvents.filter((event) => {
      const key = dateKey(event.startAt, timezone);
      return sameSubject(event.subject, subject.name) && key >= weekStart && key <= weekEnd;
    });
    const planned = events.reduce((total, event) => total + eventMinutes(event), 0);
    const completed = events
      .filter((event) => event.outcome === "completed")
      .reduce((total, event) => total + eventMinutes(event), 0);
    return { ...subject, planned, completed };
  });

  return (
    <section
      className="overflow-hidden rounded-lg px-3 py-2.5 sm:px-3.5"
      style={{ background: "var(--app-surface)", boxShadow: "var(--elev-1)" }}
      aria-label="Subject progress this week"
    >
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <p className="text-[12px] font-medium" style={{ color: "var(--app-text-muted)" }}>Subject progress</p>
        <p className="text-[11.5px]" style={{ color: "var(--app-text-faint)" }}>Done of planned this week</p>
      </div>
      <div className="flex gap-2 overflow-x-auto pb-0.5 [scrollbar-width:none]">
        {rows.map((row) => {
          const ratio = row.planned ? Math.min(1, row.completed / row.planned) : 0;
          return (
            <div key={row.name} className="min-w-[156px] flex-1 rounded-md px-2.5 py-2" style={{ background: "var(--app-surface-soft)" }}>
              <div className="flex items-center justify-between gap-2">
                <span className="min-w-0 truncate text-[12px] font-medium" style={{ color: "var(--app-text)" }}>
                  <span className="mr-1.5 inline-block h-2 w-2 rounded-full" style={{ background: row.colour }} />
                  {row.name}
                </span>
                <span className="shrink-0 text-[11px] tabular-nums" style={{ color: "var(--app-text-muted)" }}>
                  {shortMinutes(row.completed)} of {shortMinutes(row.planned)}
                </span>
              </div>
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full" style={{ background: "var(--app-border)" }}>
                <div className="h-full rounded-full transition-[width] duration-300 motion-reduce:transition-none" style={{ width: `${ratio * 100}%`, background: row.colour }} />
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
