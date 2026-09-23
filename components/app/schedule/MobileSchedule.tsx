"use client";

import { useRef } from "react";
import type { DashboardResponse, PlannerEvent } from "@/lib/api/types";
import { cn } from "@/lib/cn";
import { dateKey, formatClock } from "@/lib/api/time";
import { categoryBlock, hueBlock, type CategoryBlockStyle } from "@/lib/app/categoryColors";
import { studyTitle, subjectColour } from "@/lib/app/subjectColour";
import type { DayColumn } from "./calendar";

const HOUR_START = 7;
const HOUR_END = 23;
const HOUR_SPAN = HOUR_END - HOUR_START;
const HOUR_MARKS = [7, 9, 11, 13, 15, 17, 19, 21, 23];

const CATEGORY_STYLE: Record<string, CategoryBlockStyle> = Object.fromEntries(
  ["study", "school", "sport", "extracurricular", "sleep", "other"].map((c) => [
    c,
    categoryBlock(c),
  ]),
);

function IconButton({ children, onClick, label }: { children: React.ReactNode; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="grid h-9 w-9 place-items-center"
      style={{ color: "var(--app-text-soft)" }}
    >
      {children}
    </button>
  );
}

/** A whole-week phone view that stays readable by using a compact agenda. */
export function MobileWeekSchedule({
  days,
  events,
  subjects,
  timezone,
  onOpenDay,
  onSelectEvent,
  onCreateAtDay,
}: {
  days: DayColumn[];
  events: PlannerEvent[];
  subjects: DashboardResponse["subjects"];
  timezone: string;
  onOpenDay: (index: number) => void;
  onSelectEvent: (event: PlannerEvent) => void;
  onCreateAtDay: (dayKey: string) => void;
}) {
  const eventsForDay = (day: DayColumn) =>
    events
      .filter((event) => dateKey(event.startAt, timezone) === day.key)
      .sort((a, b) => Date.parse(a.startAt) - Date.parse(b.startAt));

  return (
    <section className="mt-4" aria-label="Week schedule">
      <p className="mb-3 text-[12px]" style={{ color: "var(--app-text-muted)" }}>
        Your full week at a glance. Tap a day for its timeline.
      </p>
      <div className="flex flex-col gap-3">
        {days.map((day, index) => {
          const dayEvents = eventsForDay(day);
          return (
            <article
              key={day.key}
              className="overflow-hidden rounded-lg"
              style={{
                background: "var(--app-surface)",
                boxShadow: "var(--elev-1)",
                outline: day.isToday ? "1px solid color-mix(in oklab, var(--app-accent) 34%, transparent)" : undefined,
              }}
            >
              <div className="flex items-center justify-between gap-3 border-b px-4 py-3" style={{ borderColor: "var(--app-border)" }}>
                <button
                  type="button"
                  onClick={() => onOpenDay(index)}
                  className="flex min-w-0 items-baseline gap-2 text-left"
                  aria-label={`Open ${day.weekday}, ${day.label}`}
                >
                  <span className="text-[14px] font-medium" style={{ color: "var(--app-text)" }}>{day.weekday}</span>
                  <span className="text-[12px]" style={{ color: "var(--app-text-muted)" }}>{day.label}</span>
                  {day.isToday ? <span className="text-[11px] font-medium" style={{ color: "var(--app-accent-strong)" }}>Today</span> : null}
                </button>
                <button
                  type="button"
                  onClick={() => onCreateAtDay(day.key)}
                  className="grid h-8 w-8 shrink-0 place-items-center rounded-md text-[18px] leading-none"
                  style={{ color: "var(--app-text-soft)" }}
                  aria-label={`Add a task due ${day.label}`}
                >
                  +
                </button>
              </div>

              {dayEvents.length ? (
                <div className="flex flex-col gap-1.5 p-2">
                  {dayEvents.map((event) => {
                    const hue = event.category === "study" ? subjectColour(subjects, event.subject) : null;
                    const styles = hue ? hueBlock(hue) : CATEGORY_STYLE[event.category] ?? CATEGORY_STYLE.other;
                    const completed = event.outcome === "completed";
                    const missed = event.outcome === "missed";
                    const time = event.kind === "all-day" ? "All day" : `${formatClock(event.startAt, timezone)} to ${formatClock(event.endAt, timezone)}`;
                    return (
                      <button
                        key={event.id}
                        type="button"
                        onClick={() => onSelectEvent(event)}
                        className={cn("flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left active:scale-[0.99]", completed && "opacity-55", missed && "opacity-40")}
                        style={{ background: styles.bg, color: styles.text, border: `1px ${event.category === "sleep" ? "dashed" : "solid"} ${styles.border}` }}
                      >
                        <span className="w-[72px] shrink-0 text-[11px] tabular-nums opacity-70">{time}</span>
                        <span className="min-w-0 truncate text-[13px] font-medium">
                          {event.category === "study" ? studyTitle(event) : event.title}
                        </span>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => onCreateAtDay(day.key)}
                  className="w-full px-4 py-4 text-left text-[12.5px]"
                  style={{ color: "var(--app-text-muted)" }}
                >
                  Nothing planned. Add a task for this day.
                </button>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}

/**
 * A full seven-day grid is useful on a laptop but makes every column too
 * narrow on a phone. The mobile view keeps the same schedule data, with one
 * large, tappable day at a time and a date strip for jumping around the week.
 */
export function MobileDaySchedule({
  days,
  events,
  subjects,
  timezone,
  selectedDayIndex,
  currentPosition,
  onSelectDay,
  onPreviousDay,
  onNextDay,
  onToday,
  onSelectEvent,
  onCreateAtDay,
}: {
  days: DayColumn[];
  events: PlannerEvent[];
  subjects: DashboardResponse["subjects"];
  timezone: string;
  selectedDayIndex: number;
  currentPosition: { dayIndex: number; top: number } | null;
  onSelectDay: (index: number) => void;
  onPreviousDay: () => void;
  onNextDay: () => void;
  onToday: () => void;
  onSelectEvent: (event: PlannerEvent) => void;
  onCreateAtDay: (dayKey: string) => void;
}) {
  const HEIGHT = 960;
  const selectedDay = days[selectedDayIndex];
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const blocks = events
    .map((event) => ({ event, position: positionFor(event, days, timezone) }))
    .filter(({ position }) => position.visible && position.dayIndex === selectedDayIndex);

  function handleTouchEnd(event: React.TouchEvent<HTMLDivElement>) {
    const start = touchStart.current;
    touchStart.current = null;
    const touch = event.changedTouches[0];
    if (!start || !touch) return;
    const x = touch.clientX - start.x;
    const y = touch.clientY - start.y;
    if (Math.abs(x) < 56 || Math.abs(x) <= Math.abs(y)) return;
    if (x > 0) onPreviousDay();
    else onNextDay();
  }

  return (
    <section aria-label="Daily schedule">
      <div className="flex items-center justify-between gap-2">
        <IconButton label="Previous day" onClick={onPreviousDay}>
          <svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M12 5l-5 5 5 5" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </IconButton>
        <button
          type="button"
          onClick={onToday}
          className="h-10 rounded-md px-3 text-[13px] font-medium"
          style={{ color: "var(--app-text-soft)", background: "var(--app-surface)", boxShadow: "var(--elev-1)" }}
        >
          Today
        </button>
        <IconButton label="Next day" onClick={onNextDay}>
          <svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M8 5l5 5-5 5" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </IconButton>
      </div>

      <div className="mt-4 grid grid-cols-7 gap-1" role="tablist" aria-label="Days this week">
        {days.map((day, index) => {
          const active = index === selectedDayIndex;
          return (
            <button
              key={day.key}
              type="button"
              role="tab"
              aria-selected={active}
              aria-label={`${day.label}${day.isToday ? ", today" : ""}`}
              onClick={() => onSelectDay(index)}
              className="flex min-h-12 flex-col items-center justify-center rounded-md text-[11px] transition-colors"
              style={{
                background: active ? "var(--app-accent-soft)" : "transparent",
                color: active ? "var(--app-accent-strong)" : "var(--app-text-muted)",
                boxShadow: active ? "inset 0 0 0 1px color-mix(in oklab, var(--app-accent) 28%, transparent)" : undefined,
              }}
            >
              <span className="font-medium">{day.weekday}</span>
              <span className="mt-0.5 text-[13px] tabular-nums">{day.date}</span>
            </button>
          );
        })}
      </div>

      <div className="mt-5 overflow-hidden rounded-lg" style={{ background: "var(--app-surface)", boxShadow: "var(--elev-1)" }}>
        <div className="flex items-center justify-between gap-3 border-b px-4 py-3" style={{ borderColor: "var(--app-border)" }}>
          <div>
            <p className="text-[14px] font-medium" style={{ color: "var(--app-text)" }}>{selectedDay.weekday}, {selectedDay.label}</p>
            <p className="mt-0.5 text-[12px]" style={{ color: "var(--app-text-muted)" }}>Swipe between days. Tap a block for details.</p>
          </div>
          {selectedDay.isToday ? <span className="text-[11px] font-medium" style={{ color: "var(--app-accent-strong)" }}>Today</span> : null}
        </div>

        <div
          className="relative touch-pan-y select-none"
          style={{ height: HEIGHT }}
          onTouchStart={(event) => {
            const touch = event.touches[0];
            if (touch) touchStart.current = { x: touch.clientX, y: touch.clientY };
          }}
          onTouchEnd={handleTouchEnd}
        >
          {HOUR_MARKS.map((hour) => {
            const top = ((hour - HOUR_START) / HOUR_SPAN) * 100;
            return (
              <div key={hour} className="pointer-events-none absolute inset-x-0" style={{ top: `${top}%` }}>
                <span className="absolute -top-[8px] left-3 text-[11px] tabular-nums" style={{ color: "var(--app-text-muted)" }}>
                  {formatHourLabel(hour)}
                </span>
                <div className="ml-14 h-px" style={{ background: "color-mix(in oklab, var(--app-border) 80%, transparent)" }} />
              </div>
            );
          })}

          <button
            type="button"
            aria-label={`Add a task due ${selectedDay.label}`}
            onClick={() => onCreateAtDay(selectedDay.key)}
            className="absolute bottom-0 left-14 right-0 top-0 z-0 cursor-copy active:bg-[color:var(--app-accent-soft)]/40"
          />

          {blocks.map(({ event, position }) => {
            const hue = event.category === "study" ? subjectColour(subjects, event.subject) : null;
            const styles = hue ? hueBlock(hue) : CATEGORY_STYLE[event.category] ?? CATEGORY_STYLE.other;
            const completed = event.outcome === "completed";
            const missed = event.outcome === "missed";
            return (
              <button
                key={event.id}
                type="button"
                onClick={() => onSelectEvent(event)}
                className={cn("absolute left-[60px] right-2 z-10 overflow-hidden rounded-md px-3 py-2 text-left active:scale-[0.99]", completed && "opacity-55", missed && "opacity-40")}
                style={{
                  top: `${position.top}%`,
                  height: `${Math.max(position.height, 4.4)}%`,
                  background: styles.bg,
                  color: styles.text,
                  border: `1px ${event.category === "sleep" ? "dashed" : "solid"} ${styles.border}`,
                }}
              >
                <span className="block truncate text-[13px] font-medium">{event.category === "study" ? studyTitle(event) : event.title}</span>
                <span className="mt-0.5 block text-[11px] tabular-nums opacity-70">{formatClock(event.startAt, timezone)}–{formatClock(event.endAt, timezone)}</span>
              </button>
            );
          })}

          {currentPosition?.dayIndex === selectedDayIndex ? (
            <div aria-hidden="true" className="pointer-events-none absolute left-14 right-0 z-20" style={{ top: `${currentPosition.top}%` }}>
              <span className="absolute -left-1.5 -top-1.5 h-3 w-3 rounded-full" style={{ background: "var(--app-accent)", boxShadow: "0 0 0 3px color-mix(in oklab, var(--app-accent) 25%, transparent)" }} />
              <div className="h-px" style={{ background: "var(--app-accent)" }} />
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function positionFor(event: PlannerEvent, days: DayColumn[], timezone: string) {
  const startKey = dateKey(event.startAt, timezone);
  const dayIndex = days.findIndex((day) => day.key === startKey);
  if (dayIndex === -1) return { dayIndex: 0, top: 0, height: 0, visible: false };

  // All-day events from external calendars (Google, Apple, Canvas, …) don't
  // belong on the time grid, Google Calendar itself pins them to a strip
  // at the top of the day. We approximate that here: a short 4%-tall chip
  // anchored to the top of the day column, out of the way of study blocks.
  if (event.kind === "all-day") {
    return { dayIndex, top: 0, height: 4, visible: true };
  }

  const startMs = Date.parse(event.startAt);
  const endMs = Date.parse(event.endAt);
  const dayStart = days[dayIndex].startMs;
  const startHours = (startMs - dayStart) / 3_600_000;
  const endHours = (endMs - dayStart) / 3_600_000;
  const top = Math.max(0, ((startHours - HOUR_START) / HOUR_SPAN) * 100);
  const bottom = Math.min(100, ((endHours - HOUR_START) / HOUR_SPAN) * 100);
  return {
    dayIndex,
    top,
    height: Math.max(0, bottom - top),
    visible: endHours > HOUR_START && startHours < HOUR_END,
  };
}

function formatHourLabel(hour: number): string {
  const suffix = hour >= 12 ? "pm" : "am";
  const display = hour % 12 === 0 ? 12 : hour % 12;
  return `${display} ${suffix}`;
}
