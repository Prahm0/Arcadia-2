"use client";

import type { DashboardResponse, PlannerEvent, PlannerTask } from "@/lib/api/types";
import { formatClock } from "@/lib/api/time";
import { SUBJECT_COLORS } from "@/lib/app/categoryColors";
import { studyTitle } from "@/lib/app/subjectColour";
import { allDayEvents, blockStyle, isExam, placeBlocks, WEEKDAYS, type DayColumn } from "./calendar";

const MAX_LINES = 4;

type Subjects = DashboardResponse["subjects"];

/**
 * The month: what's due is the point, so deadlines lead each day, then the
 * day's study rolled up by subject, then fixed events. Tapping a date opens
 * that day.
 */
export default function MonthGrid({
  days,
  month,
  events,
  due,
  subjects,
  timezone,
  nowMs,
  onOpenDay,
  onOpenTask,
  onSelectEvent,
  onAddDeadline,
}: {
  days: DayColumn[];
  /** YYYY-MM of the month shown. */
  month: string;
  events: PlannerEvent[];
  due: Map<string, PlannerTask[]>;
  subjects: Subjects;
  timezone: string;
  nowMs: number;
  onOpenDay: (key: string) => void;
  onOpenTask: (task: PlannerTask) => void;
  onSelectEvent: (event: PlannerEvent) => void;
  onAddDeadline: (key: string) => void;
}) {
  const weeks = days.length / 7;
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="grid grid-cols-7" style={{ borderBottom: "1px solid var(--app-border)" }}>
        {WEEKDAYS.map((day) => (
          <div key={day} className="py-2 text-center text-[11px] font-medium uppercase tracking-[0.06em]" style={{ color: "var(--app-text-muted)" }}>
            {day}
          </div>
        ))}
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-7 overflow-y-auto [scrollbar-width:thin]" style={{ gridTemplateRows: `repeat(${weeks}, minmax(112px, 1fr))` }}>
        {days.map((day, index) => {
          const inMonth = day.key.slice(0, 7) === month;
          const dueHere = due.get(day.key) ?? [];
          const lines = dayLines(day, events, subjects, timezone);
          const items = [
            ...dueHere.map((task) => ({ kind: "task" as const, task })),
            ...lines.map((line) => ({ kind: "line" as const, line })),
          ];
          const shown = items.slice(0, items.length > MAX_LINES ? MAX_LINES - 1 : MAX_LINES);
          const hidden = items.length - shown.length;
          return (
            <div
              key={day.key}
              className="group relative flex min-w-0 flex-col gap-0.5 px-1.5 pb-1.5 pt-1"
              style={{
                borderLeft: index % 7 ? "1px solid color-mix(in oklab, var(--app-border) 70%, transparent)" : undefined,
                borderTop: index >= 7 ? "1px solid color-mix(in oklab, var(--app-border) 70%, transparent)" : undefined,
                background: inMonth ? undefined : "color-mix(in oklab, var(--app-text) 2%, transparent)",
              }}
            >
              <button
                type="button"
                aria-label={`Add a deadline on ${day.weekday} ${day.label}`}
                onClick={() => onAddDeadline(day.key)}
                className="absolute inset-0 cursor-cell"
              />
              <div className="relative flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => onOpenDay(day.key)}
                  aria-label={`Open ${day.weekday} ${day.label}`}
                  className="ui-hover grid h-7 min-w-7 place-items-center rounded-full px-1 text-[12.5px] font-semibold tabular-nums"
                  style={{
                    background: day.isToday ? "var(--app-accent)" : undefined,
                    color: day.isToday
                      ? "var(--app-accent-on)"
                      : !inMonth || day.endMs <= nowMs
                        ? "var(--app-text-faint)"
                        : "var(--app-text)",
                  }}
                >
                  {day.date === 1 ? day.label : day.date}
                </button>
                <span aria-hidden="true" className="pr-1 text-[14px] opacity-0 transition-opacity group-hover:opacity-100" style={{ color: "var(--app-text-faint)" }}>
                  +
                </span>
              </div>
              {shown.map((item) =>
                item.kind === "task" ? (
                  <DueLine key={item.task.id} task={item.task} subjects={subjects} onOpen={() => onOpenTask(item.task)} />
                ) : (
                  <button
                    key={item.line.key}
                    type="button"
                    onClick={() => (item.line.event ? onSelectEvent(item.line.event) : onOpenDay(day.key))}
                    className="relative flex min-w-0 items-center gap-1 rounded-[4px] px-1.5 py-px text-left text-[11.5px]"
                    style={{ background: item.line.bg, color: item.line.text }}
                  >
                    <span className="truncate font-medium">{item.line.label}</span>
                    {item.line.meta ? <span className="ml-auto shrink-0 tabular-nums opacity-70">{item.line.meta}</span> : null}
                  </button>
                ),
              )}
              {hidden > 0 ? (
                <button
                  type="button"
                  onClick={() => onOpenDay(day.key)}
                  className="relative self-start px-1.5 text-[11px] font-medium"
                  style={{ color: "var(--app-text-muted)" }}
                >
                  +{hidden} more
                </button>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

interface Line {
  key: string;
  label: string;
  meta: string | null;
  bg: string;
  text: string;
  event: PlannerEvent | null;
}

/**
 * One line per subject for the day's study ("Maths 1h 30m") and one per fixed
 * event, so a month cell reads as a summary rather than a pile of blocks.
 */
function dayLines(day: DayColumn, events: PlannerEvent[], subjects: Subjects, timezone: string): Line[] {
  const { blocks } = placeBlocks(events, day);
  const lines: Line[] = allDayEvents(events, day).map((event) => ({
    key: event.id,
    label: event.title,
    meta: null,
    bg: "var(--app-surface-soft)",
    text: "var(--app-text-soft)",
    event,
  }));
  const study = new Map<string, { minutes: number; event: PlannerEvent }>();
  for (const block of blocks) {
    const { event } = block;
    if (block.continuesBefore) continue;
    if (event.category === "study") {
      const key = event.subject ?? studyTitle(event);
      const entry = study.get(key) ?? { minutes: 0, event };
      entry.minutes += (block.end - block.start) * 60;
      study.set(key, entry);
      continue;
    }
    const style = blockStyle(event, subjects);
    lines.push({
      key: event.id,
      label: event.title,
      meta: formatClock(event.startAt, timezone),
      bg: style.bg === "transparent" ? "transparent" : style.bg,
      text: style.text,
      event,
    });
  }
  const studyLines: Line[] = [...study.entries()].map(([name, { minutes, event }]) => {
    const style = blockStyle(event, subjects);
    return {
      key: `study-${name}`,
      label: name,
      meta: minutesLabel(Math.round(minutes)),
      bg: style.bg,
      text: style.text,
      // One block opens its details; several open the day.
      event: [...blocks].filter((b) => b.event.category === "study" && (b.event.subject ?? studyTitle(b.event)) === name).length === 1 ? event : null,
    };
  });
  return [...studyLines, ...lines];
}

function minutesLabel(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

function DueLine({ task, subjects, onOpen }: { task: PlannerTask; subjects: Subjects; onOpen: () => void }) {
  const exam = isExam(task);
  const index = subjects.findIndex((s) => s.name.toLowerCase() === (task.subject ?? "").toLowerCase());
  const colour = index >= 0 ? subjects[index].colour || SUBJECT_COLORS[index % SUBJECT_COLORS.length] : null;
  const tone = exam ? "var(--app-danger)" : colour;
  return (
    <button
      type="button"
      onClick={onOpen}
      title={`${exam ? "Exam" : "Due"}: ${task.title}`}
      className="relative flex min-w-0 items-center gap-1 rounded-[4px] px-1.5 py-px text-left text-[11.5px] font-semibold"
      style={
        tone
          ? {
              color: `color-mix(in oklab, ${tone} 75%, var(--app-text))`,
              boxShadow: `inset 0 0 0 1px color-mix(in oklab, ${tone} 45%, transparent)`,
            }
          : { color: "var(--app-text)", boxShadow: "inset 0 0 0 1px var(--app-border-strong)" }
      }
    >
      <span className="shrink-0 text-[9.5px] font-bold uppercase tracking-[0.05em] opacity-80">{exam ? "Exam" : "Due"}</span>
      <span className="truncate">{task.title}</span>
    </button>
  );
}
