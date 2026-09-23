"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import type { PlannerEvent, PlannerTask } from "@/lib/api/types";
import { formatClock } from "@/lib/api/time";
import { studyTitle } from "@/lib/app/subjectColour";
import AppButton from "../AppButton";
import { addDays, eventMinutes, eventStatus, isDraggable, isExam, shortDate, shortMinutes, startOfDayMs } from "./calendar";
import { ExamWord, StatusWord, Tick } from "./bits";

export interface CellDetail {
  row: { id: string; label: ReactNode; subject: string | null; colour: string | null };
  day: string;
  blocks: PlannerEvent[];
  tasks: PlannerTask[];
}

interface CellPopoverProps {
  anchor: HTMLElement;
  detail: CellDetail;
  today: string;
  nowMs: number;
  timezone: string;
  /** refocus: put focus back on the square (Escape), not on a click elsewhere. */
  onClose: (refocus: boolean) => void;
  onOpenDay: (key: string) => void;
  onAddTask: (key: string, subject: string | null) => void;
  onOpenTask: (task: PlannerTask) => void;
  onOpenEvent: (event: PlannerEvent) => void;
  onSetEventDone: (event: PlannerEvent, done: boolean) => void;
  onMoveEvent: (event: PlannerEvent, startMs: number) => void;
  onSetTaskDone: (task: PlannerTask, done: boolean) => void;
  onMoveTask: (task: PlannerTask, dueKey: string) => void;
}

const WIDTH = 360;

/**
 * A day of one subject, from the term view: what was planned and due, how it
 * went, and the four things you'd do next without leaving the term.
 */
export default function CellPopover({
  anchor,
  detail,
  today,
  nowMs,
  timezone,
  onClose,
  onOpenDay,
  onAddTask,
  onOpenTask,
  onOpenEvent,
  onSetEventDone,
  onMoveEvent,
  onSetTaskDone,
  onMoveTask,
}: CellPopoverProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [moving, setMoving] = useState(false);
  const [target, setTarget] = useState(() => addDays(detail.day < today ? today : detail.day, 1));

  // Sit under the square, or above it when there's no room, inside the window.
  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;
    const rect = anchor.getBoundingClientRect();
    const height = node.offsetHeight;
    const below = rect.bottom + 8 + height <= window.innerHeight - 8;
    node.style.top = `${below ? rect.bottom + 8 : Math.max(8, rect.top - 8 - height)}px`;
    node.style.left = `${Math.min(Math.max(8, rect.left + rect.width / 2 - WIDTH / 2), window.innerWidth - WIDTH - 8)}px`;
    node.style.visibility = "visible";
  });

  // The parent passes a fresh onClose each render; listen once per square.
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  });

  useEffect(() => {
    ref.current?.focus();
  }, [anchor]);

  useEffect(() => {
    const onDown = (event: MouseEvent) => {
      const node = event.target as Node;
      if (!ref.current?.contains(node) && !anchor.contains(node)) closeRef.current(false);
    };
    const onKey = (event: KeyboardEvent) => {
      // A sheet opened from here handles its own Escape.
      if (event.key === "Escape" && !document.querySelector('[aria-modal="true"]')) {
        event.stopPropagation();
        closeRef.current(true);
      }
    };
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey, true);
    };
  }, [anchor]);

  const { blocks, tasks, day } = detail;
  const planned = blocks.reduce((sum, event) => sum + eventMinutes(event), 0);
  const done = blocks.filter((event) => event.outcome === "completed").reduce((sum, event) => sum + eventMinutes(event), 0);
  const openBlocks = blocks.filter((event) => event.outcome !== "completed");
  const openTasks = tasks.filter((task) => task.status !== "complete");
  const movable = blocks.filter(isDraggable);
  const status =
    !blocks.length && !tasks.length
      ? "Nothing planned"
      : !openBlocks.length && !openTasks.length
        ? "Done"
        : done > 0
          ? "Part done"
          : day < today
            ? "Nothing done"
            : "To do";

  function completeAll() {
    for (const event of openBlocks) onSetEventDone(event, true);
    for (const task of openTasks) onSetTaskDone(task, true);
  }

  function move() {
    if (!target || target === day) return;
    const shift = startOfDayMs(target, timezone) - startOfDayMs(day, timezone);
    if (movable.length) {
      for (const event of movable) onMoveEvent(event, Date.parse(event.startAt) + shift);
    } else {
      for (const task of openTasks) onMoveTask(task, target);
    }
    setMoving(false);
    onClose(false);
  }

  const moveWhat = movable.length
    ? `${movable.length} study ${movable.length === 1 ? "block" : "blocks"}`
    : openTasks.length
      ? "the due date"
      : null;

  return (
    <div
      ref={ref}
      role="dialog"
      aria-label={`${detail.row.subject ?? "Day"}, ${shortDate(day)}`}
      tabIndex={-1}
      className="fixed z-50 rounded-lg outline-none"
      style={{ width: WIDTH, visibility: "hidden", background: "var(--app-surface)", boxShadow: "var(--elev-3)" }}
    >
      <div className="flex items-start justify-between gap-3 border-b px-4 pb-3 pt-3.5" style={{ borderColor: "var(--app-border)" }}>
        <div className="min-w-0">
          <div className="min-w-0 truncate">{detail.row.label}</div>
          <p className="mt-1.5 text-[12.5px] tabular-nums" style={{ color: "var(--app-text-muted)" }}>
            {shortDate(day)}
            {day === today ? " · Today" : ""}
          </p>
        </div>
        <span className="shrink-0 pt-0.5 text-[12px] font-medium" style={{ color: status === "Done" ? "var(--app-success)" : status === "Nothing done" ? "var(--app-danger)" : "var(--app-text-soft)" }}>
          {status}
        </span>
      </div>

      <div className="max-h-[260px] overflow-y-auto px-4 py-2.5 [scrollbar-width:thin]">
        {tasks.map((task) => (
          <div key={task.id} className="flex items-center gap-2.5 py-1.5">
            <Tick checked={task.status === "complete"} onChange={() => onSetTaskDone(task, task.status !== "complete")} label={`${task.title} done`} />
            {isExam(task) ? <ExamWord /> : <span className="shrink-0 text-[10px] font-semibold uppercase tracking-[0.04em]" style={{ color: "var(--app-text-muted)" }}>Due</span>}
            <button
              type="button"
              onClick={() => {
                onClose(false);
                onOpenTask(task);
              }}
              className="min-w-0 flex-1 truncate text-left text-[13px] font-medium hover:underline"
              style={{ color: task.status === "complete" ? "var(--app-text-muted)" : "var(--app-text)", textDecoration: task.status === "complete" ? "line-through" : undefined }}
            >
              {task.title}
            </button>
          </div>
        ))}
        {blocks.map((event) => {
          const state = eventStatus(event, nowMs);
          return (
            <div key={event.id} className="flex items-center gap-2.5 py-1.5">
              <Tick checked={event.outcome === "completed"} onChange={() => onSetEventDone(event, event.outcome !== "completed")} label={`${studyTitle(event)} done`} />
              <button
                type="button"
                onClick={() => {
                  onClose(false);
                  onOpenEvent(event);
                }}
                className="min-w-0 flex-1 text-left"
              >
                <span className="block truncate text-[13px] hover:underline" style={{ color: event.outcome === "completed" ? "var(--app-text-muted)" : "var(--app-text)" }}>
                  {studyTitle(event)}
                </span>
                <span className="block text-[11.5px] tabular-nums" style={{ color: "var(--app-text-faint)" }}>
                  {formatClock(event.startAt, timezone)}–{formatClock(event.endAt, timezone)} · {shortMinutes(eventMinutes(event))}
                </span>
              </button>
              {state === "rescheduled" || state === "overdue" || state === "missed" ? <StatusWord status={state} /> : null}
            </div>
          );
        })}
        {!blocks.length && !tasks.length ? (
          <p className="py-1.5 text-[12.5px]" style={{ color: "var(--app-text-muted)" }}>Nothing planned or due for this subject on this day.</p>
        ) : null}
        {planned ? (
          <p className="mt-1 text-[12px] tabular-nums" style={{ color: "var(--app-text-muted)" }}>
            {shortMinutes(done)} of {shortMinutes(planned)} done
          </p>
        ) : null}
      </div>

      {moving && moveWhat ? (
        <div className="flex items-center gap-2 border-t px-4 py-2.5" style={{ borderColor: "var(--app-border)" }}>
          <label className="text-[12.5px]" style={{ color: "var(--app-text-muted)" }} htmlFor="cell-move-date">
            Move {moveWhat} to
          </label>
          <input
            id="cell-move-date"
            type="date"
            value={target}
            min={today}
            onChange={(event) => setTarget(event.target.value)}
            className="h-7 min-w-0 flex-1 rounded-md px-1.5 text-[12.5px]"
            style={{ background: "var(--app-surface-soft)", color: "var(--app-text)", boxShadow: "var(--elev-inset)" }}
            autoFocus
          />
          <AppButton size="sm" variant="primary" onClick={move} disabled={!target || target === day}>
            Move
          </AppButton>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-1.5 border-t px-3 py-2.5" style={{ borderColor: "var(--app-border)" }}>
        <AppButton size="sm" variant="secondary" onClick={completeAll} disabled={!openBlocks.length && !openTasks.length}>
          Complete
        </AppButton>
        <AppButton size="sm" variant="secondary" onClick={() => setMoving((value) => !value)} disabled={!moveWhat} aria-expanded={moving}>
          Reschedule
        </AppButton>
        <AppButton
          size="sm"
          variant="ghost"
          onClick={() => {
            onClose(false);
            onOpenDay(day);
          }}
        >
          Open day
        </AppButton>
        <AppButton
          size="sm"
          variant="ghost"
          onClick={() => {
            onClose(false);
            onAddTask(day, detail.row.subject);
          }}
        >
          Add task
        </AppButton>
      </div>
    </div>
  );
}
