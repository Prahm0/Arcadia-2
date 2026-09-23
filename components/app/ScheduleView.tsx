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
import { categoryBlock, hueBlock, type CategoryBlockStyle } from "@/lib/app/categoryColors";
import { studyTitle, subjectColour } from "@/lib/app/subjectColour";

const DAY_MS = 86_400_000;
const HOUR_START = 7;
const HOUR_END = 23;
const HOUR_SPAN = HOUR_END - HOUR_START;
const HOUR_MARKS = [7, 9, 11, 13, 15, 17, 19, 21, 23];
const SNAP_MINUTES = 15;

// Every block is now mixed from the one shared category hue. `sport` used to
// be hardcoded near-black on white and `extracurricular` a fixed amber pair,
// neither of which responded to the theme at all.
const CATEGORY_STYLE: Record<string, CategoryBlockStyle> = Object.fromEntries(
  ["study", "school", "sport", "extracurricular", "sleep", "other"].map((c) => [
    c,
    categoryBlock(c),
  ]),
);

export default function ScheduleView() {
  const { data, patch, reload } = useDashboardData();
  const timezone = data.profile?.timezone || "Australia/Sydney";
  const [weekOffset, setWeekOffset] = useState(0);
  const [mobileDayIndex, setMobileDayIndex] = useState(() => (new Date().getDay() + 6) % 7);
  const [mobileView, setMobileView] = useState<"day" | "week">("day");
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
  const todayDayIndex = (new Date(`${dateKey(now.toISOString(), timezone)}T12:00:00Z`).getUTCDay() + 6) % 7;

  const moveMobileDay = useCallback((direction: -1 | 1) => {
    const next = mobileDayIndex + direction;
    if (next < 0) {
      setWeekOffset((value) => value - 1);
      setMobileDayIndex(6);
    } else if (next > 6) {
      setWeekOffset((value) => value + 1);
      setMobileDayIndex(0);
    } else {
      setMobileDayIndex(next);
    }
  }, [mobileDayIndex]);

  const goToToday = useCallback(() => {
    setWeekOffset(0);
    setMobileDayIndex(todayDayIndex);
    setMobileView("day");
  }, [todayDayIndex]);

  const openMobileDay = useCallback((index: number) => {
    setMobileDayIndex(index);
    setMobileView("day");
  }, []);

  return (
    <>
      <PageHeader width={"full"}
        eyebrow="Plan"
        title="Schedule"
        meta={`${weekLabel.title} ${weekLabel.subtitle}`}
        tour="schedule"
        action={
          <div className="flex flex-wrap items-center justify-end gap-2">
            <div className="hidden items-center rounded-md md:flex" style={{ background: "var(--app-surface)", boxShadow: "var(--elev-1)" }}>
              <IconButton label="Previous week" onClick={() => setWeekOffset((v) => v - 1)}>
                <svg viewBox="0 0 20 20" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M12 5l-5 5 5 5" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </IconButton>
              <button
                type="button"
                onClick={goToToday}
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

      <div className="px-4 py-6 md:hidden">
        <div
          role="tablist"
          aria-label="Schedule view"
          className="inline-flex rounded-md p-1"
          style={{ background: "var(--app-surface)", boxShadow: "var(--elev-1)" }}
        >
          {(["day", "week"] as const).map((view) => {
            const active = mobileView === view;
            return (
              <button
                key={view}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setMobileView(view)}
                className="h-8 rounded-[4px] px-3.5 text-[12.5px] font-medium capitalize transition-colors"
                style={{
                  background: active ? "var(--app-accent-soft)" : "transparent",
                  color: active ? "var(--app-accent-strong)" : "var(--app-text-muted)",
                }}
              >
                {view}
              </button>
            );
          })}
        </div>

        {mobileView === "day" ? (
          <MobileDaySchedule
            days={week}
            events={events}
            subjects={data.subjects}
            timezone={timezone}
            selectedDayIndex={mobileDayIndex}
            currentPosition={currentPosition}
            onSelectDay={setMobileDayIndex}
            onPreviousDay={() => moveMobileDay(-1)}
            onNextDay={() => moveMobileDay(1)}
            onToday={goToToday}
            onSelectEvent={setSelectedEvent}
            onCreateAtDay={openNewTaskForDay}
          />
        ) : (
          <MobileWeekSchedule
            days={week}
            events={events}
            subjects={data.subjects}
            timezone={timezone}
            onOpenDay={openMobileDay}
            onSelectEvent={setSelectedEvent}
            onCreateAtDay={openNewTaskForDay}
          />
        )}
      </div>

      <div className="hidden px-4 py-6 md:block md:px-10 md:py-8">
        <div
          className="overflow-x-auto rounded-lg"
          style={{ background: "var(--app-surface)", boxShadow: "var(--elev-1)" }}
        >
          <div className="min-w-[760px]">
          <div
            className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 py-3 sm:px-6"
            style={{ borderBottom: "1px solid var(--app-border)" }}
          >
            <div className="flex items-center gap-4">
              <span className="text-[14px] font-medium" style={{ color: "var(--app-text)" }}>{weekLabel.range}</span>
              <span className="text-[13px] tabular-nums" style={{ color: "var(--app-text-muted)" }}>{week[0].label} – {week[6].label}</span>
            </div>
            <div className="hidden lg:flex items-center gap-2 text-[12.5px]" style={{ color: "var(--app-text-muted)" }}>
              <span style={{ color: upToDate ? "var(--app-success)" : undefined }}>
                {upToDate ? "Up to date" : "Historical"}
              </span>
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
  const { subjects } = useDashboardData().data;
  const HEIGHT = 720;
  const canvasRef = useRef<HTMLDivElement>(null);

  // Drag state, tracked in a ref so pointermove listeners don't force React re-renders.
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
      // Only study blocks are draggable, school/sport/sleep/extracurricular
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
            <span className="tabular-nums" style={{ color: "var(--app-text-muted)" }}>{day.date}</span>
          </div>
        ))}
      </div>

      <div className="relative" style={{ height: HEIGHT }} ref={canvasRef}>
        {HOUR_MARKS.map((hour) => {
          const top = ((hour - HOUR_START) / HOUR_SPAN) * 100;
          return (
            <div key={hour} className="pointer-events-none absolute inset-x-0" style={{ top: `${top}%` }}>
              <span
                className="absolute -top-[8px] left-4 text-[11px] tabular-nums"
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
            // Study blocks take their subject's colour; everything else its category's.
            const hue = event.category === "study" ? subjectColour(subjects, event.subject) : null;
            const styles = hue ? hueBlock(hue) : CATEGORY_STYLE[event.category] ?? CATEGORY_STYLE.other;
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
                    "block h-full w-full overflow-hidden rounded-sm px-2.5 py-1.5 text-left leading-tight transition-shadow duration-150",
                    isCompleted && "opacity-55",
                    isMissed && "opacity-40",
                    draggable && "cursor-grab",
                    isBeingDragged && "cursor-grabbing surface-raised",
                  )}
                  style={{
                    background: styles.bg,
                    color: styles.text,
                    border: `1px ${isSleep ? "dashed" : "solid"} ${styles.border}`,
                  }}
                >
                  <div className="flex items-start justify-between gap-1">
                    <span className="truncate text-[12px] font-medium">
                      {event.category === "study" ? studyTitle(event) : event.title}
                    </span>
                    {isCompleted ? (
                      <span aria-hidden="true" className="mt-0.5 shrink-0">
                        <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                          <path d="M1 5l2.5 2.5L9 1.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </span>
                    ) : null}
                  </div>
                  {showTime ? (
                    <div className="mt-0.5 text-[10.5px] tabular-nums opacity-70">
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

/** A whole-week phone view that stays readable by using a compact agenda. */
function MobileWeekSchedule({
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
function MobileDaySchedule({
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
  // The event startAt values are already ISO strings, day boundaries use the
  // client's own timezone here just to bracket the week, which is fine for filtering.
  const offsetMinutes = new Date().getTimezoneOffset();
  const sign = offsetMinutes <= 0 ? "+" : "-";
  const abs = Math.abs(offsetMinutes);
  return `${sign}${String(Math.floor(abs / 60)).padStart(2, "0")}:${String(abs % 60).padStart(2, "0")}`;
}
