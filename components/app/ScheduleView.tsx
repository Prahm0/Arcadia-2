"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/lib/api/client";
import { useDashboardData } from "@/lib/app/DashboardProvider";
import type { DashboardResponse, PlannerEvent } from "@/lib/api/types";
import { cn } from "@/lib/cn";
import { dateKey, formatClock } from "@/lib/api/time";
import PageHeader from "./PageHeader";
import AppButton from "./AppButton";
import NewTaskSheet from "./NewTaskSheet";
import EventDetailSheet from "./EventDetailSheet";

const DAY_MS = 86_400_000;
const HOUR_START = 7;
const HOUR_END = 23;
const HOUR_SPAN = HOUR_END - HOUR_START;
const HOUR_MARKS = [7, 9, 11, 13, 15, 17, 19, 21, 23];
const SNAP_MINUTES = 15;

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
  const { data, patch, reload } = useDashboardData();
  const timezone = data.profile?.timezone || "Australia/Sydney";
  const [weekOffset, setWeekOffset] = useState(0);
  const [now, setNow] = useState(new Date());
  const [showTaskSheet, setShowTaskSheet] = useState(false);
  const [newTaskDefaultDate, setNewTaskDefaultDate] = useState<string | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<PlannerEvent | null>(null);

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

  // The selected event needs to track the freshest copy from the dashboard cache
  // so optimistic outcome/reschedule updates flow into the open sheet.
  const liveSelectedEvent = useMemo(() => {
    if (!selectedEvent) return null;
    return data.events.find((event) => event.id === selectedEvent.id) ?? null;
  }, [data.events, selectedEvent]);

  const openNewTaskForDay = useCallback((dayKey: string) => {
    setNewTaskDefaultDate(dayKey);
    setShowTaskSheet(true);
  }, []);

  const reschedule = useCallback(
    async (eventId: string, newStartMs: number) => {
      const existing = data.events.find((event) => event.id === eventId);
      if (!existing) return;
      const durationMs = Date.parse(existing.endAt) - Date.parse(existing.startAt);
      const nextStart = new Date(newStartMs).toISOString();
      const nextEnd = new Date(newStartMs + durationMs).toISOString();
      const previousStart = existing.startAt;
      const previousEnd = existing.endAt;

      // Optimistic
      patch((prev: DashboardResponse) => ({
        ...prev,
        events: prev.events.map((event) =>
          event.id === eventId ? { ...event, startAt: nextStart, endAt: nextEnd } : event,
        ),
      }));

      try {
        await api(`/api/events/${encodeURIComponent(eventId)}`, {
          method: "PATCH",
          body: JSON.stringify({ startAt: nextStart, endAt: nextEnd }),
        });
        await reload();
      } catch (err) {
        patch((prev: DashboardResponse) => ({
          ...prev,
          events: prev.events.map((event) =>
            event.id === eventId ? { ...event, startAt: previousStart, endAt: previousEnd } : event,
          ),
        }));
        console.warn("Reschedule failed", err);
      }
    },
    [data.events, patch, reload],
  );

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
              onClick={() => {
                setNewTaskDefaultDate(null);
                setShowTaskSheet(true);
              }}
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
              <span className="mx-2" style={{ color: "var(--app-text-faint)" }}>·</span>
              <span>Click a block to open · drag study blocks to move · click empty to add</span>
            </div>
          </div>

          <WeekGrid
            days={week}
            events={events}
            timezone={timezone}
            currentPosition={currentPosition}
            onSelectEvent={setSelectedEvent}
            onCreateAtDay={openNewTaskForDay}
            onReschedule={reschedule}
          />
        </div>
      </div>

      <NewTaskSheet
        open={showTaskSheet}
        onClose={() => {
          setShowTaskSheet(false);
          setNewTaskDefaultDate(null);
        }}
        defaultDueDate={newTaskDefaultDate}
      />
      <EventDetailSheet
        event={liveSelectedEvent}
        timezone={timezone}
        onClose={() => setSelectedEvent(null)}
      />
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
  onSelectEvent: (event: PlannerEvent) => void;
  onCreateAtDay: (dayKey: string) => void;
  onReschedule: (eventId: string, newStartMs: number) => void | Promise<void>;
}

function WeekGrid({
  days,
  events,
  timezone,
  currentPosition,
  onSelectEvent,
  onCreateAtDay,
  onReschedule,
}: WeekGridProps) {
  const HEIGHT = 720;
  const canvasRef = useRef<HTMLDivElement>(null);

  // Drag state — tracked in a ref so pointermove listeners don't force React re-renders.
  const dragRef = useRef<{
    eventId: string;
    startMs: number;
    pointerY: number;
    hasMoved: boolean;
  } | null>(null);
  const [dragOffsetPct, setDragOffsetPct] = useState(0);
  const [draggingId, setDraggingId] = useState<string | null>(null);

  const beginDrag = useCallback(
    (event: PlannerEvent, e: React.PointerEvent) => {
      // Only study blocks are draggable — school/sport/sleep/extracurricular
      // are usually driven by commitments, so moving them from here would
      // desync the source.
      if (event.category !== "study") return;
      if (event.editable === false) return;
      if (event.outcome !== "planned") return;
      e.preventDefault();
      e.stopPropagation();
      dragRef.current = {
        eventId: event.id,
        startMs: Date.parse(event.startAt),
        pointerY: e.clientY,
        hasMoved: false,
      };
      setDraggingId(event.id);
      setDragOffsetPct(0);
      (e.currentTarget as Element).setPointerCapture(e.pointerId);
    },
    [],
  );

  useEffect(() => {
    if (!draggingId) return;
    const pixelsPerHour = HEIGHT / HOUR_SPAN;
    const pixelsPerMinute = pixelsPerHour / 60;

    function onMove(e: PointerEvent) {
      const drag = dragRef.current;
      if (!drag) return;
      const rawDeltaPx = e.clientY - drag.pointerY;
      if (Math.abs(rawDeltaPx) > 3) drag.hasMoved = true;
      // Snap to SNAP_MINUTES grid
      const deltaMin = Math.round(rawDeltaPx / pixelsPerMinute / SNAP_MINUTES) * SNAP_MINUTES;
      const snappedPx = deltaMin * pixelsPerMinute;
      setDragOffsetPct((snappedPx / HEIGHT) * 100);
    }

    function onUp() {
      const drag = dragRef.current;
      if (!drag) return;
      const pxPerMin = HEIGHT / HOUR_SPAN / 60;
      // Read the latest offset via the setState callback (a plain ref would race
      // with the last pointermove tick).
      setDragOffsetPct((offset) => {
        if (drag.hasMoved) {
          const deltaMinutes = Math.round((offset / 100) * HEIGHT / pxPerMin);
          if (deltaMinutes !== 0) {
            const nextStart = drag.startMs + deltaMinutes * 60 * 1000;
            void onReschedule(drag.eventId, nextStart);
          }
        }
        return 0;
      });
      dragRef.current = null;
      setDraggingId(null);
    }

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [draggingId, onReschedule]);

  const handleDayClick = useCallback(
    (day: DayColumn, e: React.MouseEvent) => {
      // Only fire when the click hit the day surface itself, not an event.
      if (e.target !== e.currentTarget) return;
      onCreateAtDay(day.key);
    },
    [onCreateAtDay],
  );

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

      <div className="relative" style={{ height: HEIGHT }} ref={canvasRef}>
        {HOUR_MARKS.map((hour) => {
          const top = ((hour - HOUR_START) / HOUR_SPAN) * 100;
          return (
            <div key={hour} className="pointer-events-none absolute inset-x-0" style={{ top: `${top}%` }}>
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
            className="pointer-events-none absolute bottom-0 top-0 w-px"
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
              className="pointer-events-none absolute inset-y-0"
              style={{
                left: `calc(64px + (100% - 64px) * ${dayIndex / 7})`,
                width: `calc((100% - 64px) / 7)`,
                background: "color-mix(in oklab, var(--app-accent) 5%, transparent)",
              }}
              aria-hidden="true"
            />
          );
        })}

        {/* Day surfaces underlay events so clicking the empty grid opens New Task */}
        <div className="absolute inset-y-0 left-16 right-0">
          {days.map((day, dayIndex) => (
            <button
              key={`bg-${day.key}`}
              type="button"
              aria-label={`Add a task due ${day.label}`}
              onClick={(e) => handleDayClick(day, e)}
              className="absolute h-full cursor-copy hover:bg-[color:var(--app-accent-soft)]/40"
              style={{
                left: `${(dayIndex / 7) * 100}%`,
                width: `${100 / 7}%`,
                background: "transparent",
              }}
            />
          ))}

          {events.map((event) => {
            const { dayIndex, top, height, visible } = positionFor(event, days, timezone);
            if (!visible) return null;
            const styles = CATEGORY_STYLE[event.category] ?? CATEGORY_STYLE.other;
            const durationMinutes = Math.max(0, (Date.parse(event.endAt) - Date.parse(event.startAt)) / 60000);
            const showTime = durationMinutes >= 35;
            const isCompleted = event.outcome === "completed";
            const isMissed = event.outcome === "missed";
            const isSleep = event.category === "sleep";
            const isBeingDragged = draggingId === event.id;
            const draggable = event.category === "study" && event.editable !== false && event.outcome === "planned";
            const topPct = top + (isBeingDragged ? dragOffsetPct : 0);
            return (
              <div
                key={event.id}
                className={cn(
                  "absolute px-1",
                  isBeingDragged && "z-20",
                )}
                style={{
                  top: `${topPct}%`,
                  height: `${Math.max(height, 3.5)}%`,
                  left: `${(dayIndex / 7) * 100}%`,
                  width: `${100 / 7}%`,
                  zIndex: isBeingDragged
                    ? 20
                    : event.category === "sport" || event.category === "extracurricular"
                      ? 2
                      : 1,
                  transition: isBeingDragged ? "none" : "top 0.18s var(--ease-out-expo)",
                }}
              >
                <button
                  type="button"
                  onPointerDown={draggable ? (e) => beginDrag(event, e) : undefined}
                  onClick={(e) => {
                    // Suppress the click that a drag would otherwise fire on release
                    if (dragRef.current || draggingId === event.id) {
                      e.preventDefault();
                      return;
                    }
                    onSelectEvent(event);
                  }}
                  className={cn(
                    "block h-full w-full overflow-hidden rounded-[8px] px-2.5 py-1.5 text-left leading-tight transition-shadow duration-150",
                    isCompleted && "opacity-55",
                    isMissed && "opacity-40",
                    draggable && "cursor-grab",
                    isBeingDragged && "cursor-grabbing shadow-[0_16px_40px_-12px_rgba(0,0,0,0.35)]",
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
                </button>
              </div>
            );
          })}

          {currentPosition ? (
            <div
              aria-hidden="true"
              className="pointer-events-none absolute z-10"
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
