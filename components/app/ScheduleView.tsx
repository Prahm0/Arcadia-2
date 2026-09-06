"use client";

import { useEffect, useMemo, useState } from "react";
import { useDashboardData } from "@/lib/app/DashboardProvider";
import type { PlannerEvent } from "@/lib/api/types";
import { cn } from "@/lib/cn";
import { dateKey, formatClock } from "@/lib/api/time";
import PageHeader from "./PageHeader";
import AppButton from "./AppButton";
import NewTaskSheet from "./NewTaskSheet";

const DAY_MS = 86_400_000;
const HOUR_START = 7;
const HOUR_END = 23;
const HOUR_SPAN = HOUR_END - HOUR_START;
const HOUR_MARKS = [7, 9, 11, 13, 15, 17, 19, 21, 23];

const CATEGORY_STYLE: Record<string, { bg: string; text: string; border: string }> = {
  study: {
    bg: "var(--app-surface)",
    text: "var(--app-text)",
    border: "var(--app-border-strong)",
  },
  school: {
    bg: "var(--app-surface-soft)",
    text: "var(--app-text-muted)",
    border: "var(--app-border)",
  },
  sport: {
    bg: "#171717",
    text: "#fafafa",
    border: "#171717",
  },
  extracurricular: {
    bg: "#fef3c7",
    text: "#78350f",
    border: "#fcd34d",
  },
  sleep: {
    bg: "transparent",
    text: "var(--app-text-muted)",
    border: "var(--app-border)",
  },
  other: {
    bg: "var(--app-surface-soft)",
    text: "var(--app-text-soft)",
    border: "var(--app-border)",
  },
};

export default function ScheduleView() {
  const { data } = useDashboardData();
  const timezone = data.profile?.timezone || "Australia/Sydney";
  const [weekOffset, setWeekOffset] = useState(0);
  const [now, setNow] = useState(new Date());
  const [showTaskSheet, setShowTaskSheet] = useState(false);

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  const week = useMemo(() => buildWeek(now, weekOffset, timezone), [now, weekOffset, timezone]);
  const events = useMemo(() => data.events.filter((event) => filterInWeek(event, week, timezone)), [data.events, week, timezone]);
  const currentPosition = useMemo(() => {
    const todayIndex = week.findIndex((day) => day.key === dateKey(now.toISOString(), timezone));
    if (todayIndex === -1) return null;
    const localHour = Number(new Intl.DateTimeFormat("en-AU", { timeZone: timezone, hour: "2-digit", hour12: false }).format(now));
    const localMinute = Number(new Intl.DateTimeFormat("en-AU", { timeZone: timezone, minute: "2-digit" }).format(now));
    const totalHours = localHour + localMinute / 60;
    if (totalHours < HOUR_START || totalHours > HOUR_END) return null;
    return {
      dayIndex: todayIndex,
      top: ((totalHours - HOUR_START) / HOUR_SPAN) * 100,
    };
  }, [now, week, timezone]);

  const weekLabel = weekLabelFor(week);
  const upToDate = weekOffset === 0;

  return (
    <>
      <PageHeader
        eyebrow="Schedule"
        title={weekLabel.title}
        meta={weekLabel.subtitle}
        action={
          <div className="flex items-center gap-2">
            <div className="flex items-center rounded-[10px]" style={{ border: "1px solid var(--app-border)", background: "var(--app-surface)" }}>
              <IconButton label="Previous week" onClick={() => setWeekOffset((v) => v - 1)}>
                <svg viewBox="0 0 20 20" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M12 5l-5 5 5 5" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </IconButton>
              <button
                type="button"
                onClick={() => setWeekOffset(0)}
                className="h-9 border-x px-3 text-[13px] font-medium"
                style={{ borderColor: "var(--app-border)", color: "var(--app-text-soft)" }}
              >
                Today
              </button>
              <IconButton label="Next week" onClick={() => setWeekOffset((v) => v + 1)}>
                <svg viewBox="0 0 20 20" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M8 5l5 5-5 5" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </IconButton>
            </div>
            <AppButton
              variant="primary"
              onClick={() => setShowTaskSheet(true)}
              icon={<svg viewBox="0 0 20 20" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M10 4v12M4 10h12" strokeLinecap="round" /></svg>}
            >
              New task
            </AppButton>
          </div>
        }
      />

      <div className="px-6 py-8 sm:px-10">
        <div
          className="overflow-hidden rounded-[16px]"
          style={{ border: "1px solid var(--app-border)", background: "var(--app-surface)" }}
        >
          <div
            className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 py-3 sm:px-6"
            style={{ borderBottom: "1px solid var(--app-border)" }}
          >
            <div className="flex items-center gap-4">
              <span className="text-[14px] font-medium" style={{ color: "var(--app-text)" }}>{weekLabel.range}</span>
              <span className="text-[13px] font-mono" style={{ color: "var(--app-text-muted)" }}>{week[0].label} – {week[6].label}</span>
            </div>
            <div className="flex items-center gap-2 text-[12.5px]" style={{ color: "var(--app-text-muted)" }}>
              <span
                aria-hidden="true"
                className="size-1.5 rounded-full"
                style={{ background: upToDate ? "var(--app-success)" : "var(--app-text-faint)" }}
              />
              <span>Live · {upToDate ? "Up to date" : "Historical"}</span>
            </div>
          </div>

          <WeekGrid
            days={week}
            events={events}
            timezone={timezone}
            currentPosition={currentPosition}
          />
        </div>
      </div>

      <NewTaskSheet open={showTaskSheet} onClose={() => setShowTaskSheet(false)} />
    </>
  );
}

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

interface DayColumn {
  key: string;
  weekday: string;
  label: string;
  date: number;
  isToday: boolean;
  startMs: number;
  endMs: number;
}

interface WeekGridProps {
  days: DayColumn[];
  events: PlannerEvent[];
  timezone: string;
  currentPosition: { dayIndex: number; top: number } | null;
}

function WeekGrid({ days, events, timezone, currentPosition }: WeekGridProps) {
  const HEIGHT = 720;
  return (
    <div className="relative">
      <div
        className="flex h-11 items-center pl-16"
        style={{ borderBottom: "1px solid var(--app-border)" }}
      >
        {days.map((day) => (
          <div key={day.key} className="flex-1 px-3 text-[13px]">
            <span className="font-medium" style={{ color: day.isToday ? "var(--app-accent-strong)" : "var(--app-text)" }}>
              {day.weekday}
            </span>{" "}
            <span className="font-mono" style={{ color: "var(--app-text-muted)" }}>{day.date}</span>
          </div>
        ))}
      </div>

      <div className="relative" style={{ height: HEIGHT }}>
        {HOUR_MARKS.map((hour) => {
          const top = ((hour - HOUR_START) / HOUR_SPAN) * 100;
          return (
            <div key={hour} className="absolute inset-x-0" style={{ top: `${top}%` }}>
              <span
                className="absolute -top-[8px] left-4 text-[11px] font-mono"
                style={{ color: "var(--app-text-muted)" }}
              >
                {formatHourLabel(hour)}
              </span>
              <div className="ml-16 h-px" style={{ background: "color-mix(in oklab, var(--app-border) 80%, transparent)" }} />
            </div>
          );
        })}

        {days.slice(1).map((day, i) => (
          <div
            key={day.key}
            className="absolute bottom-0 top-0 w-px"
            style={{
              left: `calc(64px + (100% - 64px) * ${(i + 1) / 7})`,
              background: "color-mix(in oklab, var(--app-border) 70%, transparent)",
            }}
          />
        ))}

        {days.map((day, dayIndex) => {
          if (!day.isToday) return null;
          return (
            <div
              key={`today-${day.key}`}
              className="absolute inset-y-0 pointer-events-none"
              style={{
                left: `calc(64px + (100% - 64px) * ${dayIndex / 7})`,
                width: `calc((100% - 64px) / 7)`,
                background: "color-mix(in oklab, var(--app-accent) 5%, transparent)",
              }}
              aria-hidden="true"
            />
          );
        })}

        <div className="absolute inset-y-0 left-16 right-0">
          {events.map((event) => {
            const { dayIndex, top, height, visible } = positionFor(event, days, timezone);
            if (!visible) return null;
            const styles = CATEGORY_STYLE[event.category] ?? CATEGORY_STYLE.other;
            const durationMinutes = Math.max(0, (Date.parse(event.endAt) - Date.parse(event.startAt)) / 60000);
            const showTime = durationMinutes >= 35;
            const isCompleted = event.outcome === "completed";
            const isMissed = event.outcome === "missed";
            const isSleep = event.category === "sleep";
            return (
              <div
                key={event.id}
                className="absolute px-1"
                style={{
                  top: `${top}%`,
                  height: `${Math.max(height, 3.5)}%`,
                  left: `${(dayIndex / 7) * 100}%`,
                  width: `${100 / 7}%`,
                  zIndex: event.category === "sport" || event.category === "extracurricular" ? 2 : 1,
                }}
              >
                <div
                  className={cn(
                    "h-full overflow-hidden rounded-[8px] px-2.5 py-1.5 leading-tight",
                    isCompleted && "opacity-55",
                    isMissed && "opacity-40",
                  )}
                  style={{
                    background: styles.bg,
                    color: styles.text,
                    border: `1px ${isSleep ? "dashed" : "solid"} ${styles.border}`,
                  }}
                >
                  <div className="flex items-start justify-between gap-1">
                    <span className="truncate text-[12px] font-medium">{event.title}</span>
                    {isCompleted ? (
                      <span aria-hidden="true" className="mt-0.5 shrink-0">
                        <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                          <path d="M1 5l2.5 2.5L9 1.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </span>
                    ) : null}
                  </div>
                  {showTime ? (
                    <div className="mt-0.5 text-[10.5px] font-mono opacity-70">
                      {formatClock(event.startAt, timezone)}–{formatClock(event.endAt, timezone)}
                    </div>
                  ) : null}
                </div>
              </div>
            );
          })}

          {currentPosition ? (
            <div
              aria-hidden="true"
              className="absolute z-10"
              style={{
                top: `${currentPosition.top}%`,
                left: `${(currentPosition.dayIndex / 7) * 100}%`,
                width: `${100 / 7}%`,
              }}
            >
              <div className="relative">
                <span
                  className="absolute -left-1.5 -top-1.5 h-3 w-3 rounded-full"
                  style={{ background: "var(--app-accent)", boxShadow: "0 0 0 3px color-mix(in oklab, var(--app-accent) 25%, transparent)" }}
                />
                <div className="h-px" style={{ background: "var(--app-accent)" }} />
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function positionFor(event: PlannerEvent, days: DayColumn[], timezone: string) {
  const startMs = Date.parse(event.startAt);
  const endMs = Date.parse(event.endAt);
  const startKey = dateKey(event.startAt, timezone);
  const dayIndex = days.findIndex((day) => day.key === startKey);
  if (dayIndex === -1) return { dayIndex: 0, top: 0, height: 0, visible: false };
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

function buildWeek(now: Date, offset: number, timezone: string): DayColumn[] {
  const todayKey = dateKey(now.toISOString(), timezone);
  const [year, month, day] = todayKey.split("-").map(Number);
  const utcNoon = Date.UTC(year, month - 1, day, 12, 0, 0);
  const jsDate = new Date(utcNoon);
  const weekday = new Date(`${todayKey}T12:00:00Z`).getUTCDay();
  const daysFromMonday = (weekday + 6) % 7;
  const mondayNoon = utcNoon - daysFromMonday * DAY_MS + offset * 7 * DAY_MS;

  const weekdays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  return Array.from({ length: 7 }, (_, i) => {
    const noon = mondayNoon + i * DAY_MS;
    const key = new Date(noon).toISOString().slice(0, 10);
    const dateNumber = new Date(noon).getUTCDate();
    return {
      key,
      weekday: weekdays[i],
      label: new Intl.DateTimeFormat("en-AU", { month: "short", day: "numeric" }).format(new Date(noon)),
      date: dateNumber,
      isToday: key === todayKey && offset === 0,
      startMs: Date.parse(`${key}T00:00:00${localTimezoneOffset(timezone, key)}`),
      endMs: Date.parse(`${key}T23:59:59${localTimezoneOffset(timezone, key)}`),
    };
  });
}

function filterInWeek(event: PlannerEvent, week: DayColumn[], _timezone: string): boolean {
  const startMs = Date.parse(event.startAt);
  const endMs = Date.parse(event.endAt);
  return endMs >= week[0].startMs && startMs <= week[6].endMs;
}

function weekLabelFor(week: DayColumn[]): { title: string; subtitle: string; range: string } {
  const first = week[0];
  const last = week[6];
  const firstDate = new Date(`${first.key}T12:00:00Z`);
  const lastDate = new Date(`${last.key}T12:00:00Z`);
  const sameMonth = firstDate.getUTCMonth() === lastDate.getUTCMonth();
  const monthFmt = new Intl.DateTimeFormat("en-AU", { month: "short" });
  const yearFmt = new Intl.DateTimeFormat("en-AU", { year: "numeric" });
  const range = sameMonth
    ? `${first.date} – ${last.date} ${monthFmt.format(lastDate)}`
    : `${first.date} ${monthFmt.format(firstDate)} – ${last.date} ${monthFmt.format(lastDate)}`;
  return {
    title: range,
    subtitle: yearFmt.format(lastDate),
    range,
  };
}

function formatHourLabel(hour: number): string {
  const suffix = hour >= 12 ? "pm" : "am";
  const display = hour % 12 === 0 ? 12 : hour % 12;
  return `${display} ${suffix}`;
}

function localTimezoneOffset(_timezone: string, _dateKey: string): string {
  // The event startAt values are already ISO strings — day boundaries use the
  // client's own timezone here just to bracket the week, which is fine for filtering.
  const offsetMinutes = new Date().getTimezoneOffset();
  const sign = offsetMinutes <= 0 ? "+" : "-";
  const abs = Math.abs(offsetMinutes);
  return `${sign}${String(Math.floor(abs / 60)).padStart(2, "0")}:${String(abs % 60).padStart(2, "0")}`;
}
