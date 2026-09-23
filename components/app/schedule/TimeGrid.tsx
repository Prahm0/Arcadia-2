"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { DashboardResponse, PlannerEvent, PlannerTask } from "@/lib/api/types";
import { dateKey, formatClock } from "@/lib/api/time";
import { cn } from "@/lib/cn";
import { studyTitle } from "@/lib/app/subjectColour";
import {
  allDayEvents,
  blockStyle,
  CATEGORY_LABEL,
  DAY_MS,
  hourLabel,
  isDraggable,
  isExam,
  placeBlocks,
  type DayColumn,
  type PlacedBlock,
} from "./calendar";
import { SUBJECT_COLORS } from "@/lib/app/categoryColors";
import { showContextMenu, type ContextMenuEntry } from "../ContextMenu";

const HOUR_PX = 52;
const GUTTER = 60;
const SNAP_MINUTES = 15;
const MAX_DUE_CHIPS = 3;

type Subjects = DashboardResponse["subjects"];

interface TimeGridProps {
  days: DayColumn[];
  events: PlannerEvent[];
  due: Map<string, PlannerTask[]>;
  subjects: Subjects;
  timezone: string;
  now: Date;
  /** The student's day, in hours: outside it is shaded. */
  wake: number;
  bed: number;
  onSelectEvent: (event: PlannerEvent) => void;
  onOpenTask: (task: PlannerTask) => void;
  onAddDeadline: (dayKey: string) => void;
  onOpenDay?: (dayKey: string) => void;
  onReschedule: (eventId: string, newStartMs: number) => void | Promise<void>;
  /** Tick a block done, or back to planned. */
  onToggleDone?: (event: PlannerEvent) => void;
  /** Tick a deadline done, or reopen it. */
  onToggleTask?: (task: PlannerTask) => void;
  /** A deadline dragged to another day. */
  onMoveTask?: (task: PlannerTask, dayKey: string) => void;
  /** A row under Due for each day's habits. */
  habitsRow?: (day: DayColumn) => React.ReactNode;
  /** Shown over the grid, e.g. the first-deadline prompt. */
  overlay?: React.ReactNode;
  /** Right-click menus for a block, a deadline, and a day's empty space. */
  menus?: ScheduleMenus;
}

export interface ScheduleMenus {
  event: (event: PlannerEvent) => ContextMenuEntry[];
  task: (task: PlannerTask) => ContextMenuEntry[];
  day: (dayKey: string) => ContextMenuEntry[];
}

interface DragState {
  eventId: string;
  startMs: number;
  x: number;
  y: number;
  moved: boolean;
  dayIndex: number;
}

/**
 * The day and week views: a Due row for deadlines and all-day events, then a
 * scrolling 24-hour grid. Overlapping blocks sit side by side, sleep is a
 * quiet band behind everything, and study blocks can be dragged to another
 * time or day.
 */
export default function TimeGrid({
  days,
  events,
  due,
  subjects,
  timezone,
  now,
  wake,
  bed,
  onSelectEvent,
  onOpenTask,
  onAddDeadline,
  onOpenDay,
  onReschedule,
  onToggleDone,
  onToggleTask,
  onMoveTask,
  habitsRow,
  overlay,
  menus,
}: TimeGridProps) {
  const [dropDay, setDropDay] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const columnsRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState | null>(null);
  // The latest snapped offset, and whether a drag just ended so its click is swallowed.
  const offsetRef = useRef({ minutes: 0, days: 0 });
  const justDragged = useRef(false);
  const [drag, setDrag] = useState<{ id: string; minutes: number; days: number } | null>(null);
  const [hover, setHover] = useState<{ day: number; hour: number } | null>(null);
  const [dueExpanded, setDueExpanded] = useState(false);
  const single = days.length === 1;

  const placed = days.map((day) => placeBlocks(events, day));
  const nowMs = now.getTime();
  const todayIndex = days.findIndex((day) => nowMs >= day.startMs && nowMs < day.endMs);
  const nowHours = todayIndex >= 0 ? (nowMs - days[todayIndex].startMs) / 3_600_000 : null;

  // Open on the part of the day that matters: just before the first block or
  // wake-up, whichever is earlier, rather than at midnight.
  const firstKey = days[0]?.key;
  useLayoutEffect(() => {
    const scroller = scrollRef.current;
    if (!scroller) return;
    const earliest = placed
      .flatMap((day) => day.blocks.map((block) => block.start))
      .reduce((min, start) => Math.min(min, start), wake);
    const focus = nowHours !== null && nowHours > earliest + 6 ? nowHours - 2 : earliest - 0.5;
    scroller.scrollTop = Math.max(0, focus * HOUR_PX);
    // Only when the range changes, not on every data refresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firstKey, days.length]);

  const beginDrag = useCallback((event: PlannerEvent, dayIndex: number, e: React.PointerEvent) => {
    if (!isDraggable(event) || e.button !== 0) return;
    e.stopPropagation();
    dragRef.current = { eventId: event.id, startMs: Date.parse(event.startAt), x: e.clientX, y: e.clientY, moved: false, dayIndex };
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
  }, []);

  useEffect(() => {
    function onMove(e: PointerEvent) {
      const state = dragRef.current;
      if (!state) return;
      const dx = e.clientX - state.x;
      const dy = e.clientY - state.y;
      if (!state.moved && Math.hypot(dx, dy) < 4) return;
      state.moved = true;
      const width = (columnsRef.current?.getBoundingClientRect().width ?? 1) / days.length;
      const minutes = Math.round((dy / HOUR_PX) * 60 / SNAP_MINUTES) * SNAP_MINUTES;
      const dayShift = single ? 0 : Math.max(-state.dayIndex, Math.min(days.length - 1 - state.dayIndex, Math.round(dx / width)));
      offsetRef.current = { minutes, days: dayShift };
      setDrag({ id: state.eventId, minutes, days: dayShift });
    }
    function onUp() {
      const state = dragRef.current;
      if (!state) return;
      dragRef.current = null;
      const offset = offsetRef.current;
      offsetRef.current = { minutes: 0, days: 0 };
      setDrag(null);
      if (!state.moved) return;
      justDragged.current = true;
      setTimeout(() => {
        justDragged.current = false;
      }, 0);
      if (offset.minutes || offset.days) {
        void onReschedule(state.eventId, state.startMs + offset.days * DAY_MS + offset.minutes * 60_000);
      }
    }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [days.length, single, onReschedule]);

  const eventMenu = (event: PlannerEvent) =>
    menus ? (e: React.MouseEvent) => showContextMenu(e, menus.event(event), event.category === "study" ? studyTitle(event) : event.title) : undefined;
  const dayMenu = (day: DayColumn) =>
    menus ? (e: React.MouseEvent) => showContextMenu(e, menus.day(day.key), `${day.weekday} ${day.label}`) : undefined;

  const dueRows = days.map((day) => [...(due.get(day.key) ?? []).map((task) => ({ task })), ...allDayEvents(events, day).map((event) => ({ event }))]);
  // With deadlines movable the row is always there, so any day can take a drop.
  const hasDueRow = Boolean(onMoveTask) || dueRows.some((row) => row.length > 0);
  const columns = `${GUTTER}px repeat(${days.length}, minmax(0, 1fr))`;

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div ref={scrollRef} className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain [scrollbar-width:thin]">
        {/* Day names and the Due row stay pinned while the hours scroll. */}
        <div className="sticky top-0 z-30" style={{ background: "var(--app-surface)" }}>
          <div className="grid" style={{ gridTemplateColumns: columns, borderBottom: hasDueRow ? undefined : "1px solid var(--app-border)" }}>
            <div className="flex items-end justify-end pb-1.5 pr-2 text-[10px] font-medium" style={{ color: "var(--app-text-faint)" }}>
              {shortZone(timezone, now)}
            </div>
            {days.map((day) => {
              const past = day.endMs <= nowMs;
              const header = (
                <>
                  <span className="text-[11px] font-medium uppercase tracking-[0.06em]" style={{ color: day.isToday ? "var(--app-text)" : "var(--app-text-muted)" }}>
                    {single ? new Intl.DateTimeFormat("en-AU", { weekday: "long", timeZone: "UTC" }).format(new Date(`${day.key}T12:00:00Z`)) : day.weekday}
                  </span>
                  <span
                    className="mt-0.5 grid h-9 min-w-9 place-items-center rounded-full px-1 text-[21px] font-semibold tabular-nums tracking-[-0.02em]"
                    style={{
                      background: day.isToday ? "var(--app-accent)" : undefined,
                      color: day.isToday ? "var(--app-accent-on)" : past ? "var(--app-text-muted)" : "var(--app-text)",
                    }}
                  >
                    {day.date}
                  </span>
                </>
              );
              return onOpenDay && !single ? (
                <button
                  key={day.key}
                  type="button"
                  onClick={() => onOpenDay(day.key)}
                  onContextMenu={dayMenu(day)}
                  className="ui-hover flex flex-col items-center rounded-md py-2"
                  aria-label={`Open ${day.weekday} ${day.label}`}
                >
                  {header}
                </button>
              ) : (
                <div key={day.key} onContextMenu={dayMenu(day)} className={cn("flex flex-col py-2", single ? "items-start pl-3" : "items-center")}>{header}</div>
              );
            })}
          </div>

          {hasDueRow ? (
            <div className="grid" style={{ gridTemplateColumns: columns, borderBottom: "1px solid var(--app-border)" }}>
              <div className="pr-2 pt-1.5 text-right text-[10.5px] font-medium" style={{ color: "var(--app-text-faint)" }}>Due</div>
              {dueRows.map((row, index) => {
                const shown = dueExpanded ? row : row.slice(0, MAX_DUE_CHIPS);
                const hidden = row.length - shown.length;
                return (
                  <div
                    key={days[index].key}
                    className="flex min-h-[30px] min-w-0 flex-col gap-1 px-1 pb-1.5 pt-1 transition-colors"
                    style={{
                      borderLeft: "1px solid color-mix(in oklab, var(--app-border) 70%, transparent)",
                      background: dropDay === days[index].key ? "var(--app-accent-soft)" : undefined,
                    }}
                    onDragOver={
                      onMoveTask
                        ? (event) => {
                            if (!event.dataTransfer.types.includes(TASK_DRAG)) return;
                            event.preventDefault();
                            event.dataTransfer.dropEffect = "move";
                            setDropDay(days[index].key);
                          }
                        : undefined
                    }
                    onDragLeave={() => setDropDay((current) => (current === days[index].key ? null : current))}
                    onContextMenu={dayMenu(days[index])}
                    onDrop={
                      onMoveTask
                        ? (event) => {
                            const id = event.dataTransfer.getData(TASK_DRAG);
                            setDropDay(null);
                            const task = [...due.values()].flat().find((candidate) => candidate.id === id);
                            if (!task) return;
                            event.preventDefault();
                            if (dateKeyOf(task, timezone) !== days[index].key) onMoveTask(task, days[index].key);
                          }
                        : undefined
                    }
                  >
                    {shown.map((item) =>
                      "task" in item ? (
                        <DueChip
                          key={item.task.id}
                          task={item.task}
                          subjects={subjects}
                          onOpen={() => onOpenTask(item.task)}
                          onToggle={onToggleTask ? () => onToggleTask(item.task) : undefined}
                          onContextMenu={menus ? (e) => showContextMenu(e, menus.task(item.task), item.task.title) : undefined}
                          draggable={Boolean(onMoveTask) && item.task.status !== "complete"}
                        />
                      ) : (
                        <button
                          key={item.event.id}
                          type="button"
                          onClick={() => onSelectEvent(item.event)}
                          onContextMenu={eventMenu(item.event)}
                          className="truncate rounded-[4px] px-1.5 py-0.5 text-left text-[11.5px] font-medium"
                          style={{ background: "var(--app-surface-soft)", color: "var(--app-text-soft)", boxShadow: "inset 0 0 0 1px var(--app-border)" }}
                        >
                          {item.event.title}
                        </button>
                      ),
                    )}
                    {hidden > 0 ? (
                      <button type="button" onClick={() => setDueExpanded(true)} className="text-left text-[11px] font-medium" style={{ color: "var(--app-text-muted)" }}>
                        +{hidden} more
                      </button>
                    ) : null}
                  </div>
                );
              })}
            </div>
          ) : null}

          {habitsRow ? (
            <div className="grid" style={{ gridTemplateColumns: columns, borderBottom: "1px solid var(--app-border)" }}>
              <div className="pr-2 pt-1.5 text-right text-[10.5px] font-medium" style={{ color: "var(--app-text-faint)" }}>Habits</div>
              {days.map((day) => (
                <div key={day.key} className="min-w-0 px-1 py-1" style={{ borderLeft: "1px solid color-mix(in oklab, var(--app-border) 70%, transparent)" }}>
                  {habitsRow(day)}
                </div>
              ))}
            </div>
          ) : null}
        </div>

        <div className="relative grid" style={{ gridTemplateColumns: columns, height: 24 * HOUR_PX }}>
          {/* Hour labels */}
          <div className="relative">
            {Array.from({ length: 23 }, (_, i) => i + 1).map((hour) => (
              <span
                key={hour}
                className="absolute right-2 -translate-y-1/2 text-[10.5px] tabular-nums"
                style={{ top: hour * HOUR_PX, color: "var(--app-text-faint)" }}
              >
                {hourLabel(hour)}
              </span>
            ))}
            {nowHours !== null ? (
              <span
                className="absolute right-1 z-20 -translate-y-1/2 rounded-[4px] px-1 text-[10.5px] font-semibold tabular-nums"
                style={{ top: nowHours * HOUR_PX, background: "var(--app-danger)", color: "#fff" }}
              >
                {formatClock(now.toISOString(), timezone)}
              </span>
            ) : null}
          </div>

          <div ref={columnsRef} className="relative" style={{ gridColumn: `2 / span ${days.length}` }}>
            {/* Hour and half-hour lines */}
            {Array.from({ length: 24 }, (_, hour) => (
              <div key={hour} className="pointer-events-none absolute inset-x-0" style={{ top: hour * HOUR_PX }}>
                {hour > 0 ? <div className="h-px" style={{ background: "color-mix(in oklab, var(--app-border) 85%, transparent)" }} /> : null}
                <div className="h-px" style={{ marginTop: HOUR_PX / 2 - 1, background: "color-mix(in oklab, var(--app-border) 35%, transparent)" }} />
              </div>
            ))}

            <div className="absolute inset-0 grid" style={{ gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))` }}>
              {days.map((day, dayIndex) => (
                <DayColumnView
                  key={day.key}
                  day={day}
                  dayIndex={dayIndex}
                  placed={placed[dayIndex]}
                  subjects={subjects}
                  timezone={timezone}
                  wake={wake}
                  bed={bed}
                  past={day.endMs <= nowMs}
                  single={single}
                  drag={drag}
                  hoverHour={hover?.day === dayIndex ? hover.hour : null}
                  onHover={(hour) => setHover(hour === null ? null : { day: dayIndex, hour })}
                  onBeginDrag={beginDrag}
                  onSelectEvent={(event) => {
                    if (justDragged.current) return;
                    onSelectEvent(event);
                  }}
                  onAddDeadline={() => onAddDeadline(day.key)}
                  onToggleDone={onToggleDone}
                  eventMenu={eventMenu}
                  dayMenu={dayMenu(day)}
                />
              ))}
            </div>

            {/* Now */}
            {nowHours !== null ? (
              <div
                aria-hidden="true"
                className="pointer-events-none absolute z-20"
                style={{
                  top: nowHours * HOUR_PX,
                  left: `${(todayIndex / days.length) * 100}%`,
                  width: `${100 / days.length}%`,
                }}
              >
                <span className="absolute -left-[5px] -top-[4.5px] h-[10px] w-[10px] rounded-full" style={{ background: "var(--app-danger)" }} />
                <div className="h-[1.5px]" style={{ background: "var(--app-danger)" }} />
              </div>
            ) : null}
          </div>
        </div>
      </div>
      {overlay}
    </div>
  );
}

function DayColumnView({
  day,
  dayIndex,
  placed,
  subjects,
  timezone,
  wake,
  bed,
  past,
  single,
  drag,
  hoverHour,
  onHover,
  onBeginDrag,
  onSelectEvent,
  onAddDeadline,
  onToggleDone,
  eventMenu,
  dayMenu,
}: {
  day: DayColumn;
  dayIndex: number;
  placed: { sleep: PlacedBlock[]; blocks: PlacedBlock[] };
  subjects: Subjects;
  timezone: string;
  wake: number;
  bed: number;
  past: boolean;
  single: boolean;
  drag: { id: string; minutes: number; days: number } | null;
  hoverHour: number | null;
  onHover: (hour: number | null) => void;
  onBeginDrag: (event: PlannerEvent, dayIndex: number, e: React.PointerEvent) => void;
  onSelectEvent: (event: PlannerEvent) => void;
  onAddDeadline: () => void;
  onToggleDone?: (event: PlannerEvent) => void;
  eventMenu: (event: PlannerEvent) => ((e: React.MouseEvent) => void) | undefined;
  dayMenu?: (e: React.MouseEvent) => void;
}) {
  const asleepBands = bed > wake ? [[0, wake], [bed, 24]] : [[bed, wake]];
  return (
    <div
      className="relative h-full"
      style={{
        borderLeft: "1px solid color-mix(in oklab, var(--app-border) 70%, transparent)",
        background: day.isToday && !single ? "color-mix(in oklab, var(--app-accent) 2.5%, transparent)" : undefined,
      }}
    >
      {/* Outside waking hours, from the profile, sits back. */}
      {asleepBands.map(([from, to]) =>
        to > from ? (
          <div
            key={from}
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0"
            style={{ top: from * HOUR_PX, height: (to - from) * HOUR_PX, background: "color-mix(in oklab, var(--app-text) 2.5%, transparent)" }}
          />
        ) : null,
      )}

      {/* Empty space adds a deadline for this day. */}
      <button
        type="button"
        aria-label={`Add a deadline on ${day.weekday} ${day.label}`}
        className="absolute inset-0 cursor-cell"
        onMouseMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          onHover(Math.floor(((e.clientY - rect.top) / HOUR_PX) * 2) / 2);
        }}
        onMouseLeave={() => onHover(null)}
        onClick={onAddDeadline}
        onContextMenu={dayMenu}
      />
      {hoverHour !== null && !drag ? (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-1 z-[5] flex items-center rounded-[5px] px-2 text-[11px] font-medium"
          style={{
            top: hoverHour * HOUR_PX + 1,
            height: HOUR_PX / 2 - 2,
            color: "var(--app-text-muted)",
            boxShadow: "inset 0 0 0 1px var(--app-border-strong)",
            background: "var(--app-surface)",
          }}
        >
          + Deadline on {day.weekday}
        </div>
      ) : null}

      {placed.sleep.map((block) => (
        <button
          key={`${block.event.id}-sleep`}
          type="button"
          onClick={() => onSelectEvent(block.event)}
          onContextMenu={eventMenu(block.event)}
          className="absolute inset-x-0 z-[1] flex items-start justify-end px-2 pt-1 text-[10.5px]"
          style={{
            top: block.start * HOUR_PX,
            height: Math.max(0, (block.end - block.start) * HOUR_PX),
            color: "var(--app-text-faint)",
            backgroundImage:
              "repeating-linear-gradient(135deg, transparent 0 7px, color-mix(in oklab, var(--app-text) 5%, transparent) 7px 8px)",
          }}
        >
          {block.continuesBefore ? "" : "Sleep"}
        </button>
      ))}

      {placed.blocks.map((block) => {
        const moving = drag?.id === block.event.id;
        return (
          <Block
            key={block.event.id}
            block={block}
            subjects={subjects}
            timezone={timezone}
            past={past}
            offsetMinutes={moving ? drag.minutes : 0}
            offsetDays={moving ? drag.days : 0}
            onPointerDown={(e) => onBeginDrag(block.event, dayIndex, e)}
            onClick={() => onSelectEvent(block.event)}
            onContextMenu={eventMenu(block.event)}
            onToggleDone={onToggleDone && block.event.category === "study" && !moving ? () => onToggleDone(block.event) : undefined}
          />
        );
      })}
    </div>
  );
}

function Block({
  block,
  subjects,
  timezone,
  past,
  offsetMinutes,
  offsetDays,
  onPointerDown,
  onClick,
  onContextMenu,
  onToggleDone,
}: {
  block: PlacedBlock;
  subjects: Subjects;
  timezone: string;
  past: boolean;
  offsetMinutes: number;
  offsetDays: number;
  onPointerDown: (e: React.PointerEvent) => void;
  onClick: () => void;
  onContextMenu?: (e: React.MouseEvent) => void;
  onToggleDone?: () => void;
}) {
  const { event } = block;
  const movedByStudent = event.category === "study" && event.pinned && event.editable !== false && !event.startedAt && event.outcome === "planned";
  const styles = blockStyle(event, subjects);
  const moving = offsetMinutes !== 0 || offsetDays !== 0;
  const heightPx = Math.max(18, (block.end - block.start) * HOUR_PX - 2);
  const roomy = heightPx >= 40;
  const completed = event.outcome === "completed";
  const missed = event.outcome === "missed";
  const draggable = isDraggable(event);
  const width = 100 / block.columns;
  const start = new Date(Date.parse(event.startAt) + offsetMinutes * 60_000).toISOString();
  const end = new Date(Date.parse(event.endAt) + offsetMinutes * 60_000).toISOString();
  const title = event.category === "study" ? studyTitle(event) : event.title;
  const detail = event.category === "study" && event.plan?.topic && event.subject ? event.subject : CATEGORY_LABEL[event.category] ?? null;

  return (
    <div
      onContextMenu={onContextMenu}
      className={cn("group/block absolute px-[3px]", moving ? "z-30" : "z-10")}
      style={{
        top: block.start * HOUR_PX + 1 + (offsetMinutes / 60) * HOUR_PX,
        height: heightPx,
        left: `calc(${block.column * width}% + ${offsetDays * 100}%)`,
        width: `${width}%`,
        transition: moving ? "none" : "top 0.18s var(--ease-out-expo), left 0.18s var(--ease-out-expo)",
      }}
    >
      <button
        type="button"
        onPointerDown={draggable ? onPointerDown : undefined}
        onClick={onClick}
        title={`${title}, ${formatClock(start, timezone)}–${formatClock(end, timezone)}${draggable ? ". Drag to move." : ""}`}
        className={cn(
          "flex h-full w-full flex-col overflow-hidden rounded-[6px] px-2 text-left leading-tight transition-shadow",
          roomy ? "py-1.5" : "justify-center py-0",
          draggable && "cursor-grab touch-none",
          moving && "cursor-grabbing",
          past && !moving && event.outcome === "planned" && "opacity-70",
          completed && "opacity-60",
          missed && "opacity-45",
        )}
        style={{
          background: styles.bg,
          color: styles.text,
          boxShadow: moving
            ? "0 8px 24px -8px rgb(0 0 0 / 0.35), inset 0 0 0 1.5px currentColor"
            : `inset 0 0 0 1px ${styles.border === "transparent" ? "color-mix(in oklab, currentColor 14%, transparent)" : styles.border}`,
          borderLeft: event.category === "study" ? "3px solid currentColor" : undefined,
        }}
      >
        <span className={cn("flex items-center gap-1 truncate text-[12px] font-semibold", missed && "line-through")}>
          {completed && !onToggleDone ? (
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-label="Done" className="shrink-0">
              <path d="M1 5l2.5 2.5L9 1.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          ) : null}
          <span className="truncate">{title}</span>
          {!roomy ? <span className="shrink-0 font-normal tabular-nums opacity-70">{formatClock(start, timezone)}</span> : null}
        </span>
        {roomy ? (
          <span className="mt-0.5 truncate text-[11px] tabular-nums opacity-75">
            {formatClock(start, timezone)}–{formatClock(end, timezone)}
            {movedByStudent ? " · Moved" : detail && heightPx >= 58 ? ` · ${detail}` : ""}
          </span>
        ) : null}
      </button>
      {onToggleDone ? (
        <button
          type="button"
          role="checkbox"
          aria-checked={completed}
          aria-label={completed ? `Mark ${title} not done` : `Mark ${title} done`}
          title={completed ? "Done. Click to undo" : "Mark done"}
          onClick={(e) => {
            e.stopPropagation();
            onToggleDone();
          }}
          className={cn(
            "absolute right-[7px] grid h-4 w-4 place-items-center rounded-[4px] transition-opacity",
            roomy ? "top-[5px]" : "top-1/2 -translate-y-1/2",
            completed ? "opacity-100" : "opacity-0 focus-visible:opacity-100 group-hover/block:opacity-100",
          )}
          style={{
            background: completed ? "currentColor" : "var(--app-surface)",
            color: styles.text,
            boxShadow: completed ? undefined : "inset 0 0 0 1.5px currentColor",
          }}
        >
          {completed ? (
            <svg width="9" height="9" viewBox="0 0 10 10" fill="none" aria-hidden="true">
              <path d="M1.5 5.2l2.3 2.3L8.6 2.4" stroke="var(--app-surface)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          ) : null}
        </button>
      ) : null}
    </div>
  );
}

const TASK_DRAG = "application/x-arcadia-task";

function dateKeyOf(task: PlannerTask, timezone: string): string {
  return dateKey(task.dueAt, timezone);
}

/**
 * A deadline in the Due row: exams outlined in red, the rest tagged by
 * subject. Tick it off in place, or drag it to another day to move it.
 */
function DueChip({
  task,
  subjects,
  onOpen,
  onToggle,
  onContextMenu,
  draggable,
}: {
  task: PlannerTask;
  subjects: Subjects;
  onOpen: () => void;
  onToggle?: () => void;
  onContextMenu?: (e: React.MouseEvent) => void;
  draggable: boolean;
}) {
  const index = subjects.findIndex((s) => s.name.toLowerCase() === (task.subject ?? "").toLowerCase());
  const colour = index >= 0 ? subjects[index].colour || SUBJECT_COLORS[index % SUBJECT_COLORS.length] : null;
  const exam = isExam(task);
  const done = task.status === "complete";
  const tone = exam ? "var(--app-danger)" : colour;
  return (
    <div
      draggable={draggable}
      onContextMenu={onContextMenu}
      onDragStart={(event) => {
        event.dataTransfer.setData(TASK_DRAG, task.id);
        event.dataTransfer.effectAllowed = "move";
      }}
      title={`${exam ? "Exam" : "Due"}: ${task.title}${task.subject ? ` (${task.subject})` : ""}${draggable ? ". Drag to another day to move it." : ""}`}
      className={cn("flex min-w-0 items-center gap-1 rounded-[4px] py-0.5 pl-1 pr-1.5 text-[11.5px] font-medium", draggable && "cursor-grab active:cursor-grabbing")}
      style={
        done
          ? { color: "var(--app-text-faint)", boxShadow: "inset 0 0 0 1px var(--app-border)" }
          : tone
            ? {
                color: `color-mix(in oklab, ${tone} 72%, var(--app-text))`,
                background: `color-mix(in oklab, ${tone} ${exam ? 9 : 12}%, transparent)`,
                boxShadow: `inset 0 0 0 1px color-mix(in oklab, ${tone} ${exam ? 45 : 35}%, transparent)`,
              }
            : { color: "var(--app-text-soft)", background: "var(--app-surface-soft)", boxShadow: "inset 0 0 0 1px var(--app-border)" }
      }
    >
      {onToggle ? (
        <button
          type="button"
          role="checkbox"
          aria-checked={done}
          aria-label={done ? `Reopen ${task.title}` : `Mark ${task.title} done`}
          onClick={onToggle}
          className="grid h-3 w-3 shrink-0 place-items-center rounded-[3px]"
          style={{ background: done ? "currentColor" : undefined, boxShadow: done ? undefined : "inset 0 0 0 1.25px currentColor" }}
        >
          {done ? (
            <svg width="7" height="7" viewBox="0 0 10 10" fill="none" aria-hidden="true">
              <path d="M1.5 5.2l2.3 2.3L8.6 2.4" stroke="var(--app-surface)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          ) : null}
        </button>
      ) : null}
      <button type="button" onClick={onOpen} className="flex min-w-0 flex-1 items-center gap-1 text-left">
        {exam ? <span className="shrink-0 text-[9.5px] font-bold uppercase tracking-[0.05em]">Exam</span> : null}
        <span className="truncate" style={{ textDecoration: done ? "line-through" : undefined }}>{task.title}</span>
      </button>
    </div>
  );
}

/** "AEST", "GMT+10": the zone the hours are in, like the reference's UTC label. */
function shortZone(timezone: string, at: Date): string {
  const part = new Intl.DateTimeFormat("en-AU", { timeZone: timezone, timeZoneName: "short" })
    .formatToParts(at)
    .find((p) => p.type === "timeZoneName");
  return part?.value ?? "";
}
