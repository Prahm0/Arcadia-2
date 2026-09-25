"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useDashboardData } from "@/lib/app/DashboardProvider";
import type { PlannerEvent, PlannerTask } from "@/lib/api/types";
import { isTypingTarget } from "@/lib/app/commands";
import { SUBJECT_COLORS } from "@/lib/app/categoryColors";
import { studyTitle } from "@/lib/app/subjectColour";
import { useMediaQuery } from "@/lib/hooks";
import { cn } from "@/lib/cn";
import PageHeader from "./PageHeader";
import AppButton from "./AppButton";
import NewTaskSheet from "./NewTaskSheet";
import TaskDetailSheet from "./TaskDetailSheet";
import EventDetailSheet from "./EventDetailSheet";
import PageTour from "./tour/PageTour";
import TimeGrid, { type ScheduleMenus } from "./schedule/TimeGrid";
import TermMatrix, { type MatrixView } from "./schedule/TermMatrix";
import AnalyticsStrip from "./schedule/AnalyticsStrip";
import SubjectProgress from "./schedule/SubjectProgress";
import ContextPanel, { type SubjectInfo } from "./schedule/ContextPanel";
import DayPanel from "./schedule/DayPanel";
import { MobileDaySchedule, MobileWeekSchedule } from "./schedule/MobileSchedule";
import { usePlanner } from "./schedule/usePlanner";
import { periodFor, periodPosition, rollingPeriodFor } from "./schedule/period";
import { ChevronIcon } from "./schedule/bits";
import {
  addDays,
  clockHours,
  dayTitle,
  mondayOf,
  sameSubject,
  tasksByDay,
  todayKey,
  visibleDays,
  weekTitle,
  weekdayIndex,
  type DayColumn,
  type ScheduleMode,
} from "./schedule/calendar";

const PREFS_KEY = "arcadia:planner:v1";
const MODES: Array<{ value: ScheduleMode; label: string; key: string }> = [
  { value: "term", label: "Term", key: "1" },
  { value: "week", label: "Week", key: "2" },
  { value: "day", label: "Day", key: "3" },
];

interface Prefs {
  mode: ScheduleMode;
  matrix: MatrixView;
  subjects: string[];
}

const DEFAULT_PREFS: Prefs = {
  mode: "term",
  matrix: "subjects",
  subjects: [],
};

export default function ScheduleView() {
  const { data } = useDashboardData();
  const timezone = data.profile?.timezone || "Australia/Sydney";
  const [now, setNow] = useState(() => new Date());
  const today = todayKey(now, timezone);

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  return <Planner now={now} today={today} timezone={timezone} />;
}

function Planner({ now, today, timezone }: { now: Date; today: string; timezone: string }) {
  const { data } = useDashboardData();
  const router = useRouter();
  const [prefs, setPrefs] = useState<Prefs>(DEFAULT_PREFS);
  const [anchor, setAnchor] = useState(today);
  const [mobileWeek, setMobileWeek] = useState(false);
  const [taskSheet, setTaskSheet] = useState<{ due: string | null; subject: string | null; editing: PlannerTask | null } | null>(null);
  const [detailTask, setDetailTask] = useState<PlannerTask | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<PlannerEvent | null>(null);
  const [eventMode, setEventMode] = useState<"details" | "reschedule">("details");
  const wide = useMediaQuery("(min-width: 768px)");
  const { mode, matrix } = prefs;

  // The view, matrix tab, subject filter and panel state are this browser's conveniences.
  useEffect(() => {
    const restore = () => {
      try {
        const raw = window.localStorage.getItem(PREFS_KEY);
        if (!raw) return;
        const saved = JSON.parse(raw) as Partial<Prefs>;
        setPrefs({
          ...DEFAULT_PREFS,
          ...saved,
          subjects: Array.isArray(saved.subjects) ? saved.subjects : [],
        });
      } catch {
        /* defaults */
      }
    };
    restore();
  }, []);

  const updatePrefs = useCallback((change: Partial<Prefs>) => {
    setPrefs((current) => {
      const next = { ...current, ...change };
      try {
        window.localStorage.setItem(PREFS_KEY, JSON.stringify(next));
      } catch {
        /* not kept */
      }
      return next;
    });
  }, []);

  const setMode = useCallback(
    (next: ScheduleMode) => {
      updatePrefs({ mode: next });
    },
    [updatePrefs],
  );

  const terms = useMemo(() => data.terms ?? [], [data.terms]);
  const period = useMemo(() => periodFor(anchor, terms, today, timezone), [anchor, terms, today, timezone]);
  const rollingPeriod = useMemo(() => rollingPeriodFor(anchor, terms, today, timezone), [anchor, terms, today, timezone]);
  const displayPeriod = mode === "term" ? rollingPeriod : period;
  const todayPeriod = useMemo(() => periodFor(today, terms, today, timezone), [terms, today, timezone]);
  const planner = usePlanner(displayPeriod, timezone);

  const subjects = useMemo<SubjectInfo[]>(
    () => data.subjects.map((subject, index) => ({ name: subject.name, colour: subject.colour || SUBJECT_COLORS[index % SUBJECT_COLORS.length] })),
    [data.subjects],
  );
  // A saved filter only keeps subjects that still exist.
  const selected = useMemo(
    () => new Set(prefs.subjects.filter((name) => subjects.some((subject) => sameSubject(subject.name, name)))),
    [prefs.subjects, subjects],
  );
  const filtering = selected.size > 0;
  const inFilter = useCallback(
    (name: string | null | undefined) => !filtering || [...selected].some((chosen) => sameSubject(chosen, name)),
    [filtering, selected],
  );
  const shownSubjects = useMemo(() => subjects.filter((subject) => inFilter(subject.name)), [subjects, inFilter]);
  const toggleSubject = useCallback(
    (name: string | null) => {
      if (name === null) return updatePrefs({ subjects: [] });
      const next = new Set(selected);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      // Everything ticked is the same as no filter.
      updatePrefs({ subjects: next.size === subjects.length ? [] : [...next] });
    },
    [selected, subjects.length, updatePrefs],
  );

  const studyEvents = useMemo(() => planner.events.filter((event) => event.category === "study" && inFilter(event.subject)), [planner.events, inFilter]);
  const gridEvents = useMemo(() => planner.events.filter((event) => event.category !== "study" || inFilter(event.subject)), [planner.events, inFilter]);
  const tasks = useMemo(() => planner.tasks.filter((task) => task.status !== "cancelled" && inFilter(task.subject)), [planner.tasks, inFilter]);
  const due = useMemo(() => tasksByDay(tasks, timezone), [tasks, timezone]);

  const days = useMemo<DayColumn[]>(() => visibleDays(mode === "day" ? "day" : "week", anchor, today, timezone), [mode, anchor, today, timezone]);
  const week = useMemo(() => visibleDays("week", anchor, today, timezone), [anchor, today, timezone]);

  const step = useCallback(
    (direction: -1 | 1) => {
      setAnchor((current) => addDays(current, direction * (mode === "term" ? 28 : mode === "week" ? 7 : 1)));
    },
    [mode],
  );
  const goToday = useCallback(() => {
    setAnchor(today);
  }, [today]);
  const openDay = useCallback(
    (key: string) => {
      setAnchor(key);
      updatePrefs({ mode: "day" });
    },
    [updatePrefs],
  );
  const addTask = useCallback((due: string | null, subject: string | null = null) => setTaskSheet({ due, subject, editing: null }), []);
  const reschedule = useCallback(
    (eventId: string, startMs: number) => {
      const event = planner.events.find((candidate) => candidate.id === eventId);
      if (event) void planner.moveEvent(event, startMs);
    },
    [planner],
  );

  // 1/2/3 or D/W for the view, T for today, arrows or J/K to move.
  // A key right after G belongs to the app's go-to shortcuts.
  const lastKey = useRef({ key: "", at: 0 });
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const previous = lastKey.current;
      lastKey.current = { key: event.key.toLowerCase(), at: Date.now() };
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
      if (isTypingTarget(event.target) || document.querySelector('[aria-modal="true"], [role="dialog"]')) return;
      if (previous.key === "g" && Date.now() - previous.at < 1200) return;
      // Arrow keys inside the term grid move between squares instead.
      if (event.key.startsWith("Arrow") && (event.target as HTMLElement).closest?.('[role="grid"]')) return;
      const actions: Record<string, () => void> = {
        "1": () => setMode("term"),
        "2": () => setMode("week"),
        "3": () => setMode("day"),
        w: () => setMode("week"),
        d: () => setMode("day"),
        t: goToday,
        arrowleft: () => step(-1),
        k: () => step(-1),
        arrowright: () => step(1),
        j: () => step(1),
      };
      const action = actions[event.key.toLowerCase()];
      if (!action) return;
      event.preventDefault();
      action();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [goToday, setMode, step]);

  const liveEvent = useMemo(
    () => (selectedEvent ? planner.events.find((event) => event.id === selectedEvent.id) ?? data.events.find((event) => event.id === selectedEvent.id) ?? null : null),
    [selectedEvent, planner.events, data.events],
  );
  const liveTask = useMemo(() => (detailTask ? planner.tasks.find((task) => task.id === detailTask.id) ?? null : null), [detailTask, planner.tasks]);

  // Right-click menus: what the blocks' and deadlines' sheets offer, one step closer.
  const menus: ScheduleMenus = {
    event: (event) => {
      const study = event.category === "study";
      const planned = event.outcome === "planned";
      const editable = event.editable !== false;
      const name = study ? studyTitle(event) : event.title;
      return [
        { kind: "item", label: "Open", onSelect: () => setSelectedEvent(event) },
        study && planned && {
          kind: "item",
          label: "Start focus",
          onSelect: () => router.push(`/app/focus?eventId=${encodeURIComponent(event.id)}`),
        },
        { kind: "separator" },
        study && event.outcome !== "missed" && {
          kind: "item",
          label: event.outcome === "completed" ? "Mark not done" : "Mark done",
          onSelect: () => void planner.setEventDone(event, event.outcome !== "completed"),
        },
        editable && planned && {
          kind: "item",
          label: "Reschedule…",
          onSelect: () => {
            setEventMode("reschedule");
            setSelectedEvent(event);
          },
        },
        { kind: "separator" },
        editable && planned && {
          kind: "item",
          label: "Remove from schedule…",
          danger: true,
          onSelect: () => {
            if (confirm(`Remove "${name}" from your schedule?`)) void planner.removeEvent(event);
          },
        },
      ];
    },
    task: (task) => {
      const done = task.status === "complete";
      return [
        { kind: "item", label: "Open", onSelect: () => setDetailTask(task) },
        { kind: "item", label: "Edit details…", onSelect: () => setTaskSheet({ due: null, subject: null, editing: task }) },
        { kind: "separator" },
        { kind: "item", label: done ? "Reopen" : "Mark done", onSelect: () => void planner.setTaskDone(task, !done) },
        { kind: "separator" },
        {
          kind: "item",
          label: "Delete…",
          danger: true,
          onSelect: () => {
            if (confirm(`Delete "${task.title}"? This also removes its scheduled study blocks.`)) void planner.removeTask(task);
          },
        },
      ];
    },
    day: (key) => [
      { kind: "item", label: "Add a deadline…", onSelect: () => addTask(key) },
      mode !== "day" && { kind: "item", label: "Open day", onSelect: () => openDay(key) },
    ],
  };

  const title = mode === "term" ? "Term view" : mode === "week" ? weekTitle(days) : dayTitle(anchor);
  const meta = mode === "term" ? `${periodPosition(todayPeriod, today)} · 5 weeks before and 6 ahead` : periodPosition(period, anchor);
  const stripDay = mode === "day" ? anchor : today;
  const showingToday = mode === "term" ? anchor === today : days.some((day) => day.key === today) && (mode !== "day" || anchor === today);
  const noDeadlines = !data.tasks.length && !planner.tasks.some((task) => task.status === "pending");

  const sheets = (
    <>
      <NewTaskSheet
        open={taskSheet !== null}
        editing={taskSheet?.editing ?? null}
        defaultDueDate={taskSheet?.due ?? null}
        defaultSubject={taskSheet?.subject ?? null}
        onClose={() => setTaskSheet(null)}
      />
      <TaskDetailSheet
        task={liveTask}
        timezone={timezone}
        onClose={() => setDetailTask(null)}
        onEdit={(task) => {
          setDetailTask(null);
          setTaskSheet({ due: null, subject: null, editing: task });
        }}
      />
      <EventDetailSheet
        event={liveEvent}
        timezone={timezone}
        initialMode={eventMode}
        onClose={() => {
          setSelectedEvent(null);
          setEventMode("details");
        }}
      />
    </>
  );

  const matrixProps = {
    period: displayPeriod,
    view: matrix,
    onViewChange: (value: MatrixView) => updatePrefs({ matrix: value }),
    subjects: shownSubjects,
    showOther: !filtering,
    studyEvents,
    tasks,
    today,
    nowMs: now.getTime(),
    timezone,
    focusDay: anchor >= displayPeriod.start && anchor <= displayPeriod.end ? anchor : displayPeriod.start,
    onOpenDay: openDay,
    onAddTask: (key: string, subject: string | null) => addTask(key, subject),
    onOpenTask: setDetailTask,
    onOpenEvent: setSelectedEvent,
    onSetEventDone: (event: PlannerEvent, done: boolean) => void planner.setEventDone(event, done),
    onMoveEvent: (event: PlannerEvent, ms: number) => void planner.moveEvent(event, ms),
    onSetTaskDone: (task: PlannerTask, done: boolean) => void planner.setTaskDone(task, done),
    onMoveTask: (task: PlannerTask, key: string) => void planner.moveTask(task, key),
  };

  const strip = (
    <AnalyticsStrip day={stripDay} today={today} studyEvents={studyEvents} timezone={timezone} />
  );
  const subjectProgress = mode !== "day" ? (
    <SubjectProgress subjects={shownSubjects} studyEvents={studyEvents} anchor={anchor} timezone={timezone} />
  ) : null;

  return (
    <>
      {/* Phones: the same three views, stacked. Only one layout is mounted, so
          there's one matrix and one set of keyboard targets. */}
      {!wide ? (
        <div className="md:hidden">
          <PageHeader
            eyebrow="Plan"
            title="Schedule"
            meta={`${title} · ${meta}`}
            tour="schedule"
            action={
              <AppButton variant="primary" onClick={() => addTask(mode === "day" ? anchor : null)} icon={<PlusIcon />}>
                Add task
              </AppButton>
            }
          />
          <div className="flex flex-col gap-4 px-4 pb-6 pt-4">
            <div className="flex items-center justify-between gap-2">
              <ModeSwitch mode={mode} onChange={setMode} />
              <div className="flex items-center">
                <RoundIcon label="Previous" onClick={() => step(-1)} direction="left" />
                <button type="button" onClick={goToday} className="h-8 rounded-md px-2.5 text-[13px] font-medium" style={{ color: "var(--app-text-soft)" }}>
                  Today
                </button>
                <RoundIcon label="Next" onClick={() => step(1)} direction="right" />
              </div>
            </div>
            {strip}
            {subjectProgress}
            {mode === "term" ? (
              <>
                {subjects.length ? <SubjectChips subjects={subjects} selected={selected} onToggle={toggleSubject} /> : null}
                <div className="flex h-[62svh] overflow-hidden rounded-lg" style={{ background: "var(--app-surface)", boxShadow: "var(--elev-1)" }}>
                  <TermMatrix {...matrixProps} compact />
                </div>
              </>
            ) : (
              <div>
                <div className="mb-3 flex items-center gap-2">
                  <span className="text-[12.5px]" style={{ color: "var(--app-text-muted)" }}>{mode === "week" || mobileWeek ? "Agenda" : "Timeline"}</span>
                  {mode === "day" ? (
                    <button type="button" onClick={() => setMobileWeek((value) => !value)} className="text-[12.5px] font-medium underline underline-offset-2" style={{ color: "var(--app-text-soft)" }}>
                      {mobileWeek ? "Show the day" : "Show the week"}
                    </button>
                  ) : null}
                </div>
                {mode === "day" && !mobileWeek ? (
                  <MobileDaySchedule
                    days={week}
                    events={gridEvents.filter((event) => Date.parse(event.startAt) < week[6].endMs && Date.parse(event.endAt) > week[0].startMs)}
                    subjects={data.subjects}
                    timezone={timezone}
                    selectedDayIndex={weekdayIndex(anchor)}
                    currentPosition={mobileNowPosition(week, now, timezone)}
                    onSelectDay={(index) => setAnchor(addDays(mondayOf(anchor), index))}
                    onPreviousDay={() => setAnchor((current) => addDays(current, -1))}
                    onNextDay={() => setAnchor((current) => addDays(current, 1))}
                    onToday={goToday}
                    onSelectEvent={setSelectedEvent}
                    onCreateAtDay={(key) => addTask(key)}
                  />
                ) : (
                  <MobileWeekSchedule
                    days={week}
                    events={gridEvents.filter((event) => Date.parse(event.startAt) < week[6].endMs && Date.parse(event.endAt) > week[0].startMs)}
                    subjects={data.subjects}
                    timezone={timezone}
                    onOpenDay={(index) => {
                      setMobileWeek(false);
                      openDay(addDays(mondayOf(anchor), index));
                    }}
                    onSelectEvent={setSelectedEvent}
                    onCreateAtDay={(key) => addTask(key)}
                  />
                )}
              </div>
            )}
          </div>
        </div>

      ) : (
        /* Tablets and up: the planner fills the window. */
        <div className="hidden md:flex md:h-[calc(100svh-3rem-72px)] md:flex-col lg:h-[calc(100svh-2.5rem)]">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b px-4 py-3 lg:px-5" style={{ borderColor: "var(--app-border)" }}>
            <button
              type="button"
              onClick={goToday}
              disabled={showingToday && anchor === today}
              title="Today (T)"
              className="ui-hover h-9 rounded-full px-4 text-[13.5px] font-medium disabled:cursor-default"
              style={{ color: "var(--app-text)", boxShadow: "inset 0 0 0 1px var(--app-border-strong)" }}
            >
              Today
            </button>
            <div className="flex items-center">
              <RoundIcon label={`Previous ${mode} (←)`} onClick={() => step(-1)} direction="left" />
              <RoundIcon label={`Next ${mode} (→)`} onClick={() => step(1)} direction="right" />
            </div>
            <div className="min-w-0">
              <h1 className="truncate text-[20px] font-semibold leading-tight tracking-[-0.02em]" style={{ color: "var(--app-text)" }}>
                <span className="sr-only">Schedule, </span>
                {title}
              </h1>
              <p className="truncate text-[12.5px] tabular-nums" style={{ color: "var(--app-text-muted)" }}>{meta}</p>
            </div>
            {planner.error ? (
              <span role="alert" className="text-[12.5px]" style={{ color: "var(--app-danger)" }}>{planner.error}</span>
            ) : planner.loading ? (
              <span className="text-[12px]" style={{ color: "var(--app-text-faint)" }}>Loading…</span>
            ) : null}

            <div className="ml-auto flex items-center gap-2">
              <PageTour id="schedule" />
              {subjects.length ? <SubjectMenu subjects={subjects} selected={selected} onToggle={toggleSubject} hideAt={mode === "day" ? "wide" : "xl"} /> : null}
              <ModeSwitch mode={mode} onChange={setMode} />
              <AppButton variant="primary" onClick={() => addTask(mode === "day" ? anchor : null)} icon={<PlusIcon />} title="Add task (N)">
                Add task
              </AppButton>
            </div>
          </div>

          <div className="flex min-h-0 flex-1">
            <ContextPanel
              data={data}
              today={today}
              timezone={timezone}
              todayPeriod={todayPeriod}
              period={displayPeriod}
              studyEvents={studyEvents}
              tasks={tasks}
              subjects={subjects}
              selected={selected}
              onToggleSubject={toggleSubject}
              roomy={mode !== "day"}
              onOpenTask={setDetailTask}
              onJump={setAnchor}
            />

            <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3 p-3 lg:p-4">
              {strip}
              {subjectProgress}
              <div className="relative flex min-h-0 flex-1 overflow-hidden rounded-lg" style={{ background: "var(--app-surface)", boxShadow: "var(--elev-1)" }}>
                {mode === "term" ? (
                  <TermMatrix {...matrixProps} />
                ) : (
                  <TimeGrid
                    days={days}
                    events={gridEvents}
                    due={due}
                    subjects={data.subjects}
                    timezone={timezone}
                    now={now}
                    wake={clockHours(data.profile?.wakeTime, 7)}
                    bed={clockHours(data.profile?.bedtime, 22.5)}
                    onSelectEvent={setSelectedEvent}
                    onOpenTask={setDetailTask}
                    onAddDeadline={(key) => addTask(key)}
                    onOpenDay={openDay}
                    onReschedule={reschedule}
                    onToggleDone={(event) => void planner.setEventDone(event, event.outcome !== "completed")}
                    onToggleTask={(task) => void planner.setTaskDone(task, task.status !== "complete")}
                    onMoveTask={(task, key) => void planner.moveTask(task, key)}
                    overlay={noDeadlines ? <FirstDeadline onAdd={() => addTask(null)} /> : null}
                    menus={menus}
                  />
                )}
              </div>
            </div>

            {mode === "day" ? (
              <DayPanel
                day={anchor}
                today={today}
                nowMs={now.getTime()}
                timezone={timezone}
                events={gridEvents.filter((event) => Date.parse(event.startAt) < days[0].endMs && Date.parse(event.endAt) > days[0].startMs)}
                tasks={tasks}
                subjects={subjects}
                data={data}
                onOpenEvent={setSelectedEvent}
                onOpenTask={setDetailTask}
                onSetEventDone={(event, done) => void planner.setEventDone(event, done)}
                onMoveEvent={(event, ms) => void planner.moveEvent(event, ms)}
                onSetTaskDone={(task, done) => void planner.setTaskDone(task, done)}
                onMoveTask={(task, key) => void planner.moveTask(task, key)}
                menus={menus}
              />
            ) : null}

            {/* TODO: reminders replace the former habits panel. Keep habit data intact. */}
          </div>
        </div>
      )}

      {sheets}
    </>
  );
}

function ModeSwitch({ mode, onChange }: { mode: ScheduleMode; onChange: (mode: ScheduleMode) => void }) {
  return (
    <div role="tablist" aria-label="Plan view" className="flex rounded-full p-[3px]" style={{ background: "var(--app-surface-soft)", boxShadow: "inset 0 0 0 1px var(--app-border)" }}>
      {MODES.map((option) => {
        const active = mode === option.value;
        return (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(option.value)}
            title={`${option.label} (${option.key})`}
            className="h-8 rounded-full px-3.5 text-[13px] font-medium transition-colors"
            style={{
              background: active ? "var(--app-surface)" : "transparent",
              color: active ? "var(--app-text)" : "var(--app-text-muted)",
              boxShadow: active ? "var(--elev-1), inset 0 0 0 1px var(--app-border-strong)" : undefined,
            }}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

/** Below the width where the context panel shows, the subject filter lives in the toolbar. */
function SubjectMenu({
  subjects,
  selected,
  onToggle,
  hideAt,
}: {
  subjects: SubjectInfo[];
  selected: Set<string>;
  onToggle: (name: string | null) => void;
  /** Where the context panel takes over the filter. */
  hideAt: "xl" | "wide";
}) {
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
  return (
    <div ref={ref} className={cn("relative", hideAt === "xl" ? "xl:hidden" : "min-[1600px]:hidden")}>
      <AppButton variant="secondary" onClick={() => setOpen((value) => !value)} aria-expanded={open} aria-haspopup="true">
        {selected.size ? `${selected.size} subject${selected.size === 1 ? "" : "s"}` : "All subjects"}
      </AppButton>
      {open ? (
        <div className="absolute right-0 top-[calc(100%+6px)] z-40 w-[240px] rounded-lg p-2" style={{ background: "var(--app-surface)", boxShadow: "var(--elev-3)" }}>
          <SubjectChips subjects={subjects} selected={selected} onToggle={onToggle} />
        </div>
      ) : null}
    </div>
  );
}

function SubjectChips({ subjects, selected, onToggle }: { subjects: SubjectInfo[]; selected: Set<string>; onToggle: (name: string | null) => void }) {
  const all = selected.size === 0;
  const chip = (active: boolean, colour: string | null) =>
    colour && active
      ? {
          color: `color-mix(in oklab, ${colour} 70%, var(--app-text))`,
          background: `color-mix(in oklab, ${colour} 13%, transparent)`,
          boxShadow: `inset 0 0 0 1px color-mix(in oklab, ${colour} 45%, transparent)`,
        }
      : {
          color: active ? "var(--app-text)" : "var(--app-text-muted)",
          boxShadow: `inset 0 0 0 1px ${active ? "var(--app-border-strong)" : "var(--app-border)"}`,
        };
  return (
    <div className="flex flex-wrap gap-1.5" role="group" aria-label="Subjects">
      <button type="button" aria-pressed={all} onClick={() => onToggle(null)} className="rounded-[5px] px-2 py-1 text-[12.5px] font-medium" style={chip(all, null)}>
        All subjects
      </button>
      {subjects.map((subject) => {
        const on = selected.has(subject.name);
        return (
          <button key={subject.name} type="button" aria-pressed={on} onClick={() => onToggle(subject.name)} className="rounded-[5px] px-2 py-1 text-[12.5px] font-medium" style={chip(on, subject.colour)}>
            {subject.name}
          </button>
        );
      })}
    </div>
  );
}

function RoundIcon({ label, onClick, direction }: { label: string; onClick: () => void; direction: "left" | "right" }) {
  return (
    <button type="button" onClick={onClick} aria-label={label} title={label} className="ui-hover grid h-9 w-9 place-items-center rounded-full" style={{ color: "var(--app-text-soft)" }}>
      <ChevronIcon direction={direction} />
    </button>
  );
}

function PlusIcon() {
  return (
    <svg viewBox="0 0 20 20" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path d="M10 4v12M4 10h12" strokeLinecap="round" />
    </svg>
  );
}

/** Shown over an empty week until there's a deadline to plan around. */
function FirstDeadline({ onAdd }: { onAdd: () => void }) {
  const [hidden, setHidden] = useState(false);
  if (hidden) return null;
  return (
    <div className="pointer-events-none absolute inset-0 z-40 grid place-items-center p-6">
      <div
        className={cn("pointer-events-auto relative w-full max-w-[420px] rounded-xl px-8 pb-7 pt-8 text-center")}
        style={{ background: "var(--app-surface)", boxShadow: "var(--elev-3)" }}
      >
        <button type="button" onClick={() => setHidden(true)} aria-label="Not now" className="ui-hover absolute right-3 top-3 grid h-7 w-7 place-items-center rounded-md" style={{ color: "var(--app-text-faint)" }}>
          <svg viewBox="0 0 20 20" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
            <path d="M5 5l10 10M15 5L5 15" strokeLinecap="round" />
          </svg>
        </button>
        <h2 className="text-[19px] font-semibold tracking-[-0.02em]" style={{ color: "var(--app-text)" }}>Add your first exam</h2>
        <p className="mx-auto mt-2 max-w-[330px] text-[14px] leading-relaxed" style={{ color: "var(--app-text-muted)" }}>
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

function mobileNowPosition(week: DayColumn[], now: Date, timezone: string) {
  const dayIndex = week.findIndex((day) => now.getTime() >= day.startMs && now.getTime() < day.endMs);
  if (dayIndex === -1) return null;
  const parts = new Intl.DateTimeFormat("en-AU", { timeZone: timezone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(now);
  const hours = Number(parts.find((p) => p.type === "hour")?.value ?? 0) + Number(parts.find((p) => p.type === "minute")?.value ?? 0) / 60;
  // The phone's day view draws 7am to 11pm.
  if (hours < 7 || hours > 23) return null;
  return { dayIndex, top: ((hours - 7) / 16) * 100 };
}
