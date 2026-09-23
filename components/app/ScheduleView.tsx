"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/lib/api/client";
import { useDashboardData } from "@/lib/app/DashboardProvider";
import type { DashboardResponse, PlannerEvent, PlannerTask } from "@/lib/api/types";
import { isTypingTarget } from "@/lib/app/commands";
import { formatClock } from "@/lib/api/time";
import { useMediaQuery } from "@/lib/hooks";
import { studyTitle } from "@/lib/app/subjectColour";
import PageHeader from "./PageHeader";
import AppButton from "./AppButton";
import NewTaskSheet from "./NewTaskSheet";
import EventDetailSheet from "./EventDetailSheet";
import PageTour from "./tour/PageTour";
import TimeGrid from "./schedule/TimeGrid";
import MonthGrid from "./schedule/MonthGrid";
import ScheduleSidebar, { ExamWord } from "./schedule/ScheduleSidebar";
import { MobileDaySchedule, MobileWeekSchedule } from "./schedule/MobileSchedule";
import { useRangeEvents } from "./schedule/useRangeEvents";
import {
  addDays,
  blockStyle,
  clockHours,
  dueIn,
  mondayOf,
  rangeTitle,
  stepAnchor,
  tasksByDay,
  todayKey,
  visibleDays,
  weekdayIndex,
  type ScheduleMode,
} from "./schedule/calendar";

const MODE_KEY = "arcadia:schedule:mode";
const EMPTY_KEY = "arcadia:schedule:first-deadline-dismissed";
const MODES: ScheduleMode[] = ["day", "week", "month"];

export default function ScheduleView() {
  const { data, patch, reload } = useDashboardData();
  const timezone = data.profile?.timezone || "Australia/Sydney";
  const [now, setNow] = useState(() => new Date());
  const today = todayKey(now, timezone);
  const [mode, setModeState] = useState<ScheduleMode>("week");
  const [anchor, setAnchor] = useState(today);
  const [mobileView, setMobileView] = useState<"day" | "week">("day");
  const [taskSheet, setTaskSheet] = useState<{ due: string | null; editing: PlannerTask | null } | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<PlannerEvent | null>(null);
  const [emptyDismissed, setEmptyDismissed] = useState(true);

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  // Per-viewer conveniences: the last view, and whether the first-deadline card was waved off.
  useEffect(() => {
    const restore = () => {
      try {
        const saved = window.localStorage.getItem(MODE_KEY) as ScheduleMode | null;
        if (saved && MODES.includes(saved)) setModeState(saved);
        setEmptyDismissed(window.localStorage.getItem(EMPTY_KEY) === "1");
      } catch {
        setEmptyDismissed(false);
      }
    };
    restore();
  }, []);

  const setMode = useCallback((next: ScheduleMode) => {
    setModeState(next);
    try {
      window.localStorage.setItem(MODE_KEY, next);
    } catch {
      /* not saved */
    }
  }, []);

  const days = useMemo(() => visibleDays(mode, anchor, today, timezone), [mode, anchor, today, timezone]);
  const week = useMemo(() => visibleDays("week", anchor, today, timezone), [anchor, today, timezone]);
  // One fetch covers whichever is wider, so switching the phone's day/week or the desktop's view doesn't flicker.
  const fromMs = Math.min(days[0].startMs, week[0].startMs);
  const toMs = Math.max(days[days.length - 1].endMs, week[6].endMs);
  const { events, loading } = useRangeEvents(fromMs, toMs, data.events, data.range);
  const due = useMemo(() => tasksByDay(data.tasks, timezone), [data.tasks, timezone]);
  const weekEvents = useMemo(
    () => events.filter((event) => Date.parse(event.startAt) >= week[0].startMs && Date.parse(event.startAt) < week[6].endMs),
    [events, week],
  );

  const wake = clockHours(data.profile?.wakeTime, 7);
  const bed = clockHours(data.profile?.bedtime, 22.5);
  const title = rangeTitle(mode, anchor, days);
  const showingToday = days.some((day) => day.key === today);

  const liveSelectedEvent = useMemo(() => {
    if (!selectedEvent) return null;
    return data.events.find((event) => event.id === selectedEvent.id) ?? events.find((event) => event.id === selectedEvent.id) ?? null;
  }, [data.events, events, selectedEvent]);

  const addDeadline = useCallback((dayKey: string | null) => setTaskSheet({ due: dayKey, editing: null }), []);
  const openTask = useCallback((task: PlannerTask) => setTaskSheet({ due: null, editing: task }), []);
  const openDay = useCallback(
    (key: string) => {
      setAnchor(key);
      setMode("day");
    },
    [setMode],
  );
  const goToToday = useCallback(() => setAnchor(today), [today]);
  const step = useCallback((direction: -1 | 1) => setAnchor((current) => stepAnchor(mode, current, direction)), [mode]);

  const reschedule = useCallback(
    async (eventId: string, newStartMs: number) => {
      const existing = data.events.find((event) => event.id === eventId) ?? events.find((event) => event.id === eventId);
      if (!existing) return;
      const durationMs = Date.parse(existing.endAt) - Date.parse(existing.startAt);
      const nextStart = new Date(newStartMs).toISOString();
      const nextEnd = new Date(newStartMs + durationMs).toISOString();
      const moveTo = (startAt: string, endAt: string) =>
        patch((prev: DashboardResponse) => ({
          ...prev,
          events: prev.events.map((event) => (event.id === eventId ? { ...event, startAt, endAt } : event)),
        }));

      moveTo(nextStart, nextEnd);
      try {
        await api(`/api/events/${encodeURIComponent(eventId)}`, {
          method: "PATCH",
          body: JSON.stringify({ startAt: nextStart, endAt: nextEnd }),
        });
        await reload();
      } catch (err) {
        moveTo(existing.startAt, existing.endAt);
        console.warn("Reschedule failed", err);
      }
    },
    [data.events, events, patch, reload],
  );

  // T for today, D/W/M for the view, arrows or J/K to move. G-sequences
  // (G then D goes to Deadlines) belong to the app, so a key right after G is left alone.
  const lastKey = useRef({ key: "", at: 0 });
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const previous = lastKey.current;
      lastKey.current = { key: event.key.toLowerCase(), at: Date.now() };
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
      if (isTypingTarget(event.target) || document.querySelector('[aria-modal="true"]')) return;
      if (previous.key === "g" && Date.now() - previous.at < 1200) return;
      const key = event.key.toLowerCase();
      const actions: Record<string, () => void> = {
        t: goToToday,
        d: () => setMode("day"),
        w: () => setMode("week"),
        m: () => setMode("month"),
        arrowleft: () => step(-1),
        k: () => step(-1),
        arrowright: () => step(1),
        j: () => step(1),
      };
      const action = actions[key];
      if (!action) return;
      event.preventDefault();
      action();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [goToToday, setMode, step]);

  const hasDeadlines = data.tasks.some((task) => task.status === "pending");
  const firstDeadline =
    !hasDeadlines && !emptyDismissed && mode !== "month" ? (
      <FirstDeadlineCard
        onAdd={() => addDeadline(null)}
        onDismiss={() => {
          setEmptyDismissed(true);
          try {
            window.localStorage.setItem(EMPTY_KEY, "1");
          } catch {
            /* shows again next time */
          }
        }}
      />
    ) : null;

  const mobileDayIndex = weekdayIndex(anchor);
  // One tour at a time: the phone header and the desktop toolbar would each auto-open it.
  const wide = useMediaQuery("(min-width: 768px)");

  return (
    <>
      {/* Phones: one day or a week agenda. */}
      <div className="md:hidden">
        <PageHeader
          eyebrow="Plan"
          title="Schedule"
          meta={rangeTitle("week", anchor, week)}
          tour={wide ? undefined : "schedule"}
          action={
            <AppButton variant="primary" onClick={() => addDeadline(null)} icon={<PlusIcon />}>
              New task
            </AppButton>
          }
        />
        <div className="px-4 py-6">
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
              events={weekEvents}
              subjects={data.subjects}
              timezone={timezone}
              selectedDayIndex={mobileDayIndex}
              currentPosition={mobileNowPosition(week, now, timezone)}
              onSelectDay={(index) => setAnchor(addDays(mondayOf(anchor), index))}
              onPreviousDay={() => setAnchor((current) => addDays(current, -1))}
              onNextDay={() => setAnchor((current) => addDays(current, 1))}
              onToday={() => {
                goToToday();
                setMobileView("day");
              }}
              onSelectEvent={setSelectedEvent}
              onCreateAtDay={addDeadline}
            />
          ) : (
            <MobileWeekSchedule
              days={week}
              events={weekEvents}
              subjects={data.subjects}
              timezone={timezone}
              onOpenDay={(index) => {
                setAnchor(addDays(mondayOf(anchor), index));
                setMobileView("day");
              }}
              onSelectEvent={setSelectedEvent}
              onCreateAtDay={addDeadline}
            />
          )}
        </div>
      </div>

      {/* Tablets and up: a full calendar that fills the window. */}
      <div className="hidden md:flex md:h-[calc(100svh-3rem-72px)] md:flex-col lg:h-[calc(100svh-2.5rem)]">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b px-4 py-3 lg:px-5" style={{ borderColor: "var(--app-border)" }}>
          <button
            type="button"
            onClick={goToToday}
            disabled={showingToday && anchor === today}
            title="Today (T)"
            className="ui-hover h-9 rounded-full px-4 text-[13.5px] font-medium disabled:cursor-default"
            style={{ color: "var(--app-text)", boxShadow: "inset 0 0 0 1px var(--app-border-strong)" }}
          >
            Today
          </button>
          <div className="flex items-center">
            <RoundIcon label={`Previous ${mode} (←)`} onClick={() => step(-1)}>
              <path d="M12 5l-5 5 5 5" />
            </RoundIcon>
            <RoundIcon label={`Next ${mode} (→)`} onClick={() => step(1)}>
              <path d="M8 5l5 5-5 5" />
            </RoundIcon>
          </div>
          <h1 className="min-w-0 truncate text-[20px] font-semibold tracking-[-0.02em]" style={{ color: "var(--app-text)" }}>
            <span className="sr-only">Schedule, </span>
            {title}
          </h1>
          {loading ? (
            <span className="text-[12px]" style={{ color: "var(--app-text-faint)" }}>
              Loading…
            </span>
          ) : null}

          <div className="ml-auto flex items-center gap-2">
            {wide ? <PageTour id="schedule" /> : null}
            <div
              role="tablist"
              aria-label="Calendar view"
              className="flex rounded-full p-[3px]"
              style={{ background: "var(--app-surface-soft)", boxShadow: "inset 0 0 0 1px var(--app-border)" }}
            >
              {MODES.map((value) => {
                const active = mode === value;
                return (
                  <button
                    key={value}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => setMode(value)}
                    title={`${value[0].toUpperCase()}${value.slice(1)} (${value[0].toUpperCase()})`}
                    className="h-8 rounded-full px-3.5 text-[13px] font-medium capitalize transition-colors"
                    style={{
                      background: active ? "var(--app-surface)" : "transparent",
                      color: active ? "var(--app-text)" : "var(--app-text-muted)",
                      boxShadow: active ? "var(--elev-1), inset 0 0 0 1px var(--app-border-strong)" : undefined,
                    }}
                  >
                    {value}
                  </button>
                );
              })}
            </div>
            <AddMenu onAddDeadline={() => addDeadline(mode === "day" ? anchor : null)} />
          </div>
        </div>

        <div className="flex min-h-0 flex-1">
          <ScheduleSidebar
            data={data}
            timezone={timezone}
            anchor={anchor}
            today={today}
            visible={{ from: days[0].key, to: days[days.length - 1].key }}
            due={due}
            weekEvents={weekEvents}
            weekLabel={week.some((day) => day.key === today) ? "this week" : rangeTitle("week", anchor, week).replace(/ \d{4}$/, "")}
            onPickDate={setAnchor}
            onOpenTask={openTask}
            onAddDeadline={() => addDeadline(null)}
          />

          <div className="flex min-h-0 min-w-0 flex-1">
            {mode === "month" ? (
              <MonthGrid
                days={days}
                month={anchor.slice(0, 7)}
                events={events}
                due={due}
                subjects={data.subjects}
                timezone={timezone}
                nowMs={now.getTime()}
                onOpenDay={openDay}
                onOpenTask={openTask}
                onSelectEvent={setSelectedEvent}
                onAddDeadline={addDeadline}
              />
            ) : (
              <>
                <TimeGrid
                  days={days}
                  events={events}
                  due={due}
                  subjects={data.subjects}
                  timezone={timezone}
                  now={now}
                  wake={wake}
                  bed={bed}
                  onSelectEvent={setSelectedEvent}
                  onOpenTask={openTask}
                  onAddDeadline={addDeadline}
                  onOpenDay={openDay}
                  onReschedule={reschedule}
                  overlay={firstDeadline}
                />
                {mode === "day" ? (
                  <DayAgenda
                    dayKey={anchor}
                    today={today}
                    events={events.filter((event) => days[0] && Date.parse(event.startAt) < days[0].endMs && Date.parse(event.endAt) > days[0].startMs)}
                    due={due}
                    data={data}
                    timezone={timezone}
                    onSelectEvent={setSelectedEvent}
                    onOpenTask={openTask}
                  />
                ) : null}
              </>
            )}
          </div>
        </div>
      </div>

      <NewTaskSheet
        open={taskSheet !== null}
        editing={taskSheet?.editing ?? null}
        defaultDueDate={taskSheet?.due ?? null}
        onClose={() => setTaskSheet(null)}
      />
      <EventDetailSheet event={liveSelectedEvent} timezone={timezone} onClose={() => setSelectedEvent(null)} />
    </>
  );
}

function mobileNowPosition(week: ReturnType<typeof visibleDays>, now: Date, timezone: string) {
  const dayIndex = week.findIndex((day) => now.getTime() >= day.startMs && now.getTime() < day.endMs);
  if (dayIndex === -1) return null;
  const parts = new Intl.DateTimeFormat("en-AU", { timeZone: timezone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(now);
  const hours = Number(parts.find((p) => p.type === "hour")?.value ?? 0) + Number(parts.find((p) => p.type === "minute")?.value ?? 0) / 60;
  // The phone's day view draws 7am to 11pm.
  if (hours < 7 || hours > 23) return null;
  return { dayIndex, top: ((hours - 7) / 16) * 100 };
}

function PlusIcon() {
  return (
    <svg viewBox="0 0 20 20" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path d="M10 4v12M4 10h12" strokeLinecap="round" />
    </svg>
  );
}

function RoundIcon({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="ui-hover grid h-9 w-9 place-items-center rounded-full"
      style={{ color: "var(--app-text-soft)" }}
    >
      <svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {children}
      </svg>
    </button>
  );
}

/** + Add: a deadline is the common case, the rest are one step away. */
function AddMenu({ onAddDeadline }: { onAddDeadline: () => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent | KeyboardEvent) => {
      if (event instanceof KeyboardEvent ? event.key === "Escape" : !ref.current?.contains(event.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", close);
    window.addEventListener("keydown", close);
    return () => {
      window.removeEventListener("mousedown", close);
      window.removeEventListener("keydown", close);
    };
  }, [open]);

  const item = "ui-hover flex w-full flex-col items-start rounded-md px-3 py-2 text-left";
  return (
    <div ref={ref} className="relative">
      <AppButton variant="primary" onClick={() => setOpen((value) => !value)} icon={<PlusIcon />} aria-haspopup="menu" aria-expanded={open}>
        Add
      </AppButton>
      {open ? (
        <div
          role="menu"
          className="absolute right-0 top-[calc(100%+6px)] z-40 w-[260px] rounded-lg p-1"
          style={{ background: "var(--app-surface)", boxShadow: "var(--elev-2, var(--elev-1)), inset 0 0 0 1px var(--app-border)" }}
        >
          <button
            type="button"
            role="menuitem"
            className={item}
            onClick={() => {
              setOpen(false);
              onAddDeadline();
            }}
          >
            <span className="text-[13.5px] font-medium" style={{ color: "var(--app-text)" }}>Exam or deadline</span>
            <span className="text-[12px]" style={{ color: "var(--app-text-muted)" }}>Arcad plans study time before it</span>
          </button>
          <Link role="menuitem" href="/app/commitments" className={item} onClick={() => setOpen(false)}>
            <span className="text-[13.5px] font-medium" style={{ color: "var(--app-text)" }}>Weekly commitment</span>
            <span className="text-[12px]" style={{ color: "var(--app-text-muted)" }}>Classes, training, work, clubs</span>
          </Link>
          <Link role="menuitem" href="/app/settings#calendars" className={item} onClick={() => setOpen(false)}>
            <span className="text-[13.5px] font-medium" style={{ color: "var(--app-text)" }}>Connect a calendar</span>
            <span className="text-[12px]" style={{ color: "var(--app-text-muted)" }}>Canvas, Google, Outlook or Apple</span>
          </Link>
        </div>
      ) : null}
    </div>
  );
}

/** Shown over an empty week until the student adds a deadline or waves it off. */
function FirstDeadlineCard({ onAdd, onDismiss }: { onAdd: () => void; onDismiss: () => void }) {
  return (
    <div className="pointer-events-none absolute inset-0 z-40 grid place-items-center p-6">
      <div
        className="pointer-events-auto relative w-full max-w-[440px] rounded-xl px-8 pb-7 pt-8 text-center"
        style={{ background: "var(--app-surface)", boxShadow: "0 18px 48px -18px rgb(0 0 0 / 0.35), inset 0 0 0 1px var(--app-border)" }}
      >
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Not now"
          className="ui-hover absolute right-3 top-3 grid h-7 w-7 place-items-center rounded-md"
          style={{ color: "var(--app-text-faint)" }}
        >
          <svg viewBox="0 0 20 20" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
            <path d="M5 5l10 10M15 5L5 15" strokeLinecap="round" />
          </svg>
        </button>
        <svg viewBox="0 0 32 32" width="34" height="34" fill="none" stroke="currentColor" strokeWidth="1.6" className="mx-auto" style={{ color: "var(--app-text)" }} aria-hidden="true">
          <rect x="5" y="7" width="22" height="20" rx="3" />
          <path d="M5 13h22M11 4v5M21 4v5" strokeLinecap="round" />
          <path d="M11 18h2M15 18h2M19 18h2M11 22h2M15 22h2" strokeLinecap="round" />
        </svg>
        <h2 className="mt-4 text-[20px] font-semibold tracking-[-0.02em]" style={{ color: "var(--app-text)" }}>
          Add your first exam
        </h2>
        <p className="mx-auto mt-2 max-w-[340px] text-[14px] leading-relaxed" style={{ color: "var(--app-text-muted)" }}>
          Tell us when it is and what it covers. Arcad books study time for it in the hours you&apos;re free.
        </p>
        <div className="mt-5 flex justify-center">
          <AppButton variant="primary" onClick={onAdd} icon={<PlusIcon />}>
            Add an exam or deadline
          </AppButton>
        </div>
      </div>
    </div>
  );
}

/** Day view's right column: the day as a list, and what's due soon after it. */
function DayAgenda({
  dayKey,
  today,
  events,
  due,
  data,
  timezone,
  onSelectEvent,
  onOpenTask,
}: {
  dayKey: string;
  today: string;
  events: PlannerEvent[];
  due: Map<string, PlannerTask[]>;
  data: DashboardResponse;
  timezone: string;
  onSelectEvent: (event: PlannerEvent) => void;
  onOpenTask: (task: PlannerTask) => void;
}) {
  const timed = events.filter((event) => event.category !== "sleep" && event.kind !== "all-day");
  const studyMinutes = timed
    .filter((event) => event.category === "study" && event.outcome !== "missed")
    .reduce((sum, event) => sum + (Date.parse(event.endAt) - Date.parse(event.startAt)) / 60_000, 0);
  const soon: Array<{ key: string; task: PlannerTask }> = [];
  for (let offset = 0; offset <= 7; offset++) {
    const key = addDays(dayKey, offset);
    for (const task of due.get(key) ?? []) soon.push({ key, task });
  }

  return (
    <aside className="hidden w-[300px] shrink-0 overflow-y-auto border-l px-4 py-4 lg:block" style={{ borderColor: "var(--app-border)" }} aria-label="The day as a list">
      <p className="text-[12.5px] font-semibold" style={{ color: "var(--app-text-soft)" }}>
        {Math.round(studyMinutes) ? `${formatMinutes(Math.round(studyMinutes))} of study` : "No study planned"}
      </p>
      <ul className="mt-3 flex flex-col gap-1">
        {timed.length ? (
          timed.map((event) => {
            const style = blockStyle(event, data.subjects);
            return (
              <li key={event.id}>
                <button
                  type="button"
                  onClick={() => onSelectEvent(event)}
                  className="ui-hover -mx-2 flex w-[calc(100%+1rem)] items-start gap-3 rounded-md px-2 py-1.5 text-left"
                  style={{ opacity: event.outcome === "missed" ? 0.5 : 1 }}
                >
                  <span className="w-[62px] shrink-0 pt-px text-[11.5px] tabular-nums" style={{ color: "var(--app-text-muted)" }}>
                    {formatClock(event.startAt, timezone)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-medium" style={{ color: style.text }}>
                      {event.category === "study" ? studyTitle(event) : event.title}
                    </span>
                    <span className="block text-[11.5px]" style={{ color: "var(--app-text-faint)" }}>
                      {event.outcome === "completed" ? "Done" : event.outcome === "missed" ? "Missed" : `until ${formatClock(event.endAt, timezone)}`}
                    </span>
                  </span>
                </button>
              </li>
            );
          })
        ) : (
          <li className="text-[12.5px]" style={{ color: "var(--app-text-muted)" }}>Nothing on this day.</li>
        )}
      </ul>

      <p className="mt-6 text-[12.5px] font-semibold" style={{ color: "var(--app-text-soft)" }}>Due in the next week</p>
      <ul className="mt-2 flex flex-col gap-1">
        {soon.length ? (
          soon.map(({ key, task }) => (
            <li key={task.id}>
              <button type="button" onClick={() => onOpenTask(task)} className="ui-hover -mx-2 flex w-[calc(100%+1rem)] items-center gap-2 rounded-md px-2 py-1.5 text-left">
                {task.taskType === "exam" ? <ExamWord /> : null}
                <span className="min-w-0 flex-1 truncate text-[13px]" style={{ color: "var(--app-text)" }}>{task.title}</span>
                <span className="shrink-0 text-[11.5px]" style={{ color: "var(--app-text-muted)" }}>{dueIn(key, today)}</span>
              </button>
            </li>
          ))
        ) : (
          <li className="text-[12.5px]" style={{ color: "var(--app-text-muted)" }}>Nothing due.</li>
        )}
      </ul>
    </aside>
  );
}

function formatMinutes(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}
