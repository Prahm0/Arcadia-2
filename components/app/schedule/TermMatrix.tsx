"use client";

import { useCallback, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import type { PlannerEvent, PlannerTask } from "@/lib/api/types";
import { dateKey } from "@/lib/api/time";
import { cn } from "@/lib/cn";
import { SubjectTag } from "../cards/shared";
import { eventMinutes, isExam, sameSubject, shortDate, shortMinutes, WEEKDAYS } from "./calendar";
import { ExamWord, FlameGlyph } from "./bits";
import CellPopover, { type CellDetail } from "./CellPopover";
import type { SubjectInfo } from "./ContextPanel";
import { HabitGlyph, useHabits } from "./habits";
import { isSchoolDay, type TermPeriod } from "./period";

export type MatrixView = "subjects" | "tasks" | "study" | "habits";

const MATRIX_VIEWS: Array<{ value: MatrixView; label: string }> = [
  { value: "subjects", label: "Subjects" },
  { value: "tasks", label: "Tasks" },
  { value: "study", label: "Study" },
  { value: "habits", label: "Habits" },
];

const FULL_LABEL_W = 208;
const SLOT = 22;
const CELL = 18;
const WEEK_GAP = 8;
const ROW_H = 28;

type CellState = "empty" | "inactive" | "scheduled" | "partial" | "complete" | "missed";

interface Row {
  id: string;
  label: ReactNode;
  aside: ReactNode;
  /** The row's colour: a subject's, or null for ink. */
  colour: string | null;
  subject: string | null;
  /** Narrows the day's blocks and deadlines to this row. */
  blocks: (event: PlannerEvent) => boolean;
  tasks: (task: PlannerTask) => boolean;
  /** Tasks view: the days between first work and the deadline. */
  span?: { from: string; to: string };
  total?: boolean;
}

interface TermMatrixProps {
  period: TermPeriod;
  view: MatrixView;
  onViewChange: (view: MatrixView) => void;
  subjects: SubjectInfo[];
  /** Includes an "Other" row for work with no matching subject. */
  showOther: boolean;
  studyEvents: PlannerEvent[];
  tasks: PlannerTask[];
  today: string;
  nowMs: number;
  timezone: string;
  /** The day to bring into view. */
  focusDay: string;
  onOpenDay: (key: string) => void;
  onAddTask: (key: string, subject: string | null) => void;
  onOpenTask: (task: PlannerTask) => void;
  onOpenEvent: (event: PlannerEvent) => void;
  onSetEventDone: (event: PlannerEvent, done: boolean) => void;
  onMoveEvent: (event: PlannerEvent, startMs: number) => void;
  onSetTaskDone: (task: PlannerTask, done: boolean) => void;
  onMoveTask: (task: PlannerTask, dueKey: string) => void;
  /** Phones: a narrower label column without the totals. */
  compact?: boolean;
}

/**
 * The whole term at a glance: a row per subject (or task, or habit), a square
 * per day, grouped into weeks. Each square says whether the day's study was
 * planned, part done or done, and a folded corner marks a deadline or exam.
 */
export default function TermMatrix(props: TermMatrixProps) {
  const { period, view, onViewChange, subjects, showOther, studyEvents, tasks, today, nowMs, timezone, focusDay, compact } = props;
  const LABEL_W = compact ? 124 : FULL_LABEL_W;
  const habits = useHabits();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [focus, setFocus] = useState<{ r: number; c: number } | null>(null);
  const [open, setOpen] = useState<{ rowId: string; day: string; anchor: HTMLElement } | null>(null);

  const days = useMemo(() => period.weeks.flatMap((week) => week.days), [period]);
  const blocksByDay = useMemo(() => groupBy(studyEvents, (event) => dateKey(event.startAt, timezone)), [studyEvents, timezone]);
  const tasksByDay = useMemo(
    () => groupBy(tasks.filter((task) => task.status !== "cancelled"), (task) => dateKey(task.dueAt, timezone)),
    [tasks, timezone],
  );

  const rows = useMemo<Row[]>(() => {
    const known = (name: string | null | undefined) => subjects.some((subject) => sameSubject(subject.name, name));
    const inPeriod = (key: string) => key >= period.start && key <= period.end;
    const periodBlocks = studyEvents.filter((event) => inPeriod(dateKey(event.startAt, timezone)));
    const subjectSummary = (match: (event: PlannerEvent) => boolean) => {
      const list = periodBlocks.filter(match);
      const planned = list.reduce((sum, event) => sum + eventMinutes(event), 0);
      const done = list.filter((event) => event.outcome === "completed").reduce((sum, event) => sum + eventMinutes(event), 0);
      return planned ? `${shortMinutes(done)} / ${shortMinutes(planned)}` : "";
    };

    if (view === "habits") {
      return habits.habits.map((habit) => ({
        id: habit.id,
        label: (
          <span className="flex min-w-0 items-center gap-2" style={{ color: "var(--app-text)" }}>
            <span style={{ color: "var(--app-text-muted)" }}><HabitGlyph icon={habit.icon} size={14} /></span>
            <span className="truncate text-[12.5px]">{habit.name}</span>
          </span>
        ),
        aside: habits.streak(habit.id, today) ? (
          <span className="flex items-center gap-0.5"><FlameGlyph size={10} />{habits.streak(habit.id, today)}</span>
        ) : null,
        colour: null,
        subject: null,
        blocks: () => false,
        tasks: () => false,
      }));
    }

    if (view === "tasks") {
      const withWork = new Set(periodBlocks.map((event) => event.taskId).filter(Boolean));
      return tasks
        .filter((task) => task.status !== "cancelled" && (inPeriod(dateKey(task.dueAt, timezone)) || withWork.has(task.id)))
        .map((task) => {
          const colour = subjects.find((subject) => sameSubject(subject.name, task.subject))?.colour ?? null;
          const due = dateKey(task.dueAt, timezone);
          const firstWork = periodBlocks.filter((event) => event.taskId === task.id).map((event) => dateKey(event.startAt, timezone)).sort()[0];
          return {
            id: task.id,
            label: (
              <span className="flex min-w-0 items-center gap-1.5">
                {isExam(task) ? <ExamWord /> : null}
                <span
                  className="truncate text-[12.5px]"
                  style={{ color: task.status === "complete" ? "var(--app-text-muted)" : "var(--app-text)", textDecoration: task.status === "complete" ? "line-through" : undefined }}
                >
                  {task.title}
                </span>
              </span>
            ),
            aside: shortDate(due).replace(/^\w+ /, ""),
            colour,
            subject: task.subject ?? null,
            blocks: (event: PlannerEvent) => event.taskId === task.id,
            tasks: (candidate: PlannerTask) => candidate.id === task.id,
            span: { from: firstWork && firstWork < due ? firstWork : due, to: due },
          };
        });
    }

    const subjectRows: Row[] = subjects.map((subject) => ({
      id: subject.name,
      label: <SubjectTag subject={subject} size="sm" />,
      aside: subjectSummary((event) => sameSubject(event.subject, subject.name)),
      colour: subject.colour,
      subject: subject.name,
      blocks: (event) => sameSubject(event.subject, subject.name),
      tasks: (task) => sameSubject(task.subject, subject.name),
    }));
    if (showOther) {
      const otherBlock = (event: PlannerEvent) => !known(event.subject);
      const otherTask = (task: PlannerTask) => !known(task.subject);
      if (periodBlocks.some(otherBlock) || tasks.some((task) => otherTask(task) && inPeriod(dateKey(task.dueAt, timezone)))) {
        subjectRows.push({
          id: "__other",
          label: <span className="text-[12.5px]" style={{ color: "var(--app-text-muted)" }}>No subject</span>,
          aside: subjectSummary(otherBlock),
          colour: null,
          subject: null,
          blocks: otherBlock,
          tasks: otherTask,
        });
      }
    }
    if (view === "study") {
      subjectRows.push({
        id: "__total",
        label: <span className="text-[12.5px] font-medium" style={{ color: "var(--app-text)" }}>All study</span>,
        aside: subjectSummary(() => true),
        colour: null,
        subject: null,
        blocks: () => true,
        tasks: () => false,
        total: true,
      });
    }
    return subjectRows;
  }, [view, subjects, showOther, studyEvents, tasks, habits, today, period, timezone]);

  const detailFor = useCallback(
    (row: Row, day: string): CellDetail => {
      const blocks = (blocksByDay.get(day) ?? []).filter(row.blocks);
      const due = (tasksByDay.get(day) ?? []).filter(row.tasks);
      return { row: { id: row.id, label: row.label, subject: row.subject, colour: row.colour }, day, blocks, tasks: due };
    },
    [blocksByDay, tasksByDay],
  );

  // Bring the focus day into view when the period or the jump target changes.
  useLayoutEffect(() => {
    const scroller = scrollRef.current;
    if (!scroller) return;
    const index = days.findIndex((day) => day.key === focusDay);
    if (index < 0) {
      scroller.scrollLeft = 0;
      return;
    }
    const week = Math.floor(index / 7);
    const x = week * (7 * SLOT + WEEK_GAP) + (index % 7) * SLOT;
    scroller.scrollLeft = Math.max(0, x - (scroller.clientWidth - LABEL_W) * 0.3);
  }, [period.id, focusDay, days, LABEL_W]);

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      const target = event.target as HTMLElement;
      const r = Number(target.dataset.r);
      const c = Number(target.dataset.c);
      if (!Number.isFinite(r) || !Number.isFinite(c)) return;
      const moves: Record<string, [number, number]> = {
        ArrowLeft: [0, -1],
        ArrowRight: [0, 1],
        ArrowUp: [-1, 0],
        ArrowDown: [1, 0],
        Home: [0, -c],
        End: [0, days.length - 1 - c],
      };
      const move = moves[event.key];
      if (!move) return;
      event.preventDefault();
      const next = { r: Math.max(0, Math.min(rows.length - 1, r + move[0])), c: Math.max(0, Math.min(days.length - 1, c + move[1])) };
      setFocus(next);
      scrollRef.current?.querySelector<HTMLElement>(`[data-r="${next.r}"][data-c="${next.c}"]`)?.focus();
    },
    [days.length, rows.length],
  );

  const todayIndex = days.findIndex((day) => day.key === today);
  const focusIndex = days.findIndex((day) => day.key === focusDay);
  const defaultCol = focusIndex >= 0 ? focusIndex : Math.max(0, todayIndex);
  const roving = focus ?? { r: 0, c: defaultCol };
  const openRow = open ? rows.find((row) => row.id === open.rowId) : null;
  const width = LABEL_W + period.weeks.length * 7 * SLOT + (period.weeks.length - 1) * WEEK_GAP + 16;

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 pb-2 pt-3">
        <div role="tablist" aria-label="Show" className="flex rounded-md p-[3px]" style={{ background: "var(--app-surface-soft)", boxShadow: "var(--elev-inset)" }}>
          {MATRIX_VIEWS.map((option) => {
            const active = view === option.value;
            return (
              <button
                key={option.value}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => {
                  setOpen(null);
                  onViewChange(option.value);
                }}
                className="h-7 rounded-[5px] px-3 text-[12.5px] font-medium transition-colors"
                style={{
                  background: active ? "var(--app-surface)" : "transparent",
                  color: active ? "var(--app-text)" : "var(--app-text-muted)",
                  boxShadow: active ? "var(--elev-1)" : undefined,
                }}
              >
                {option.label}
              </button>
            );
          })}
        </div>
        <Legend view={view} />
      </div>

      <div
        ref={scrollRef}
        className="relative min-h-0 flex-1 overflow-auto overscroll-contain [scrollbar-width:thin]"
        onScroll={() => open && setOpen(null)}
        onKeyDown={onKeyDown}
      >
        <div style={{ width, minWidth: "100%" }} role="grid" aria-label={`${period.name}, ${view}`} aria-rowcount={rows.length + 2}>
          {/* Weeks and dates stay on top while the rows scroll. */}
          <div className="sticky top-0 z-20" style={{ background: "var(--app-surface)" }} role="rowgroup">
            <div className="flex" role="row">
              <div className="sticky left-0 z-10 shrink-0" style={{ width: LABEL_W, background: "var(--app-surface)" }} />
              {period.weeks.map((week, wi) => {
                const current = week.days[0].key <= today && today <= week.days[6].key;
                return (
                  <button
                    key={week.days[0].key}
                    type="button"
                    onClick={() => props.onOpenDay(week.days[0].key)}
                    className="ui-hover shrink-0 truncate rounded-sm px-1 pb-1 pt-1.5 text-left text-[11px] font-medium"
                    style={{
                      width: 7 * SLOT,
                      marginLeft: wi ? WEEK_GAP : 0,
                      color: current ? "var(--app-text)" : week.number === null ? "var(--app-text-faint)" : "var(--app-text-muted)",
                      fontWeight: current ? 650 : 500,
                      borderBottom: `1px solid ${current ? "var(--app-border-strong)" : "var(--app-border)"}`,
                    }}
                    title={`Open ${week.label}`}
                  >
                    {week.label}
                  </button>
                );
              })}
            </div>
            <div className="flex border-b pb-1" style={{ borderColor: "var(--app-border)" }} role="row">
              <div className="sticky left-0 z-10 shrink-0" style={{ width: LABEL_W, background: "var(--app-surface)" }} />
              {period.weeks.map((week, wi) => (
                <div key={week.days[0].key} className="flex shrink-0" style={{ marginLeft: wi ? WEEK_GAP : 0 }}>
                  {week.days.map((day, di) => {
                    const isToday = day.key === today;
                    return (
                      <button
                        key={day.key}
                        type="button"
                        role="columnheader"
                        onClick={() => props.onOpenDay(day.key)}
                        title={`Open ${shortDate(day.key)}`}
                        className="flex flex-col items-center pt-1 leading-none"
                        style={{ width: SLOT }}
                      >
                        <span className="text-[9.5px]" style={{ color: di >= 5 ? "var(--app-text-faint)" : "var(--app-text-muted)" }}>
                          {WEEKDAYS[di][0]}
                        </span>
                        <span
                          className="mt-1 grid h-[17px] min-w-[17px] place-items-center rounded-full px-0.5 text-[10.5px] font-medium tabular-nums"
                          style={{
                            background: isToday ? "var(--app-text)" : undefined,
                            color: isToday ? "var(--app-bg)" : day.key < today ? "var(--app-text-faint)" : "var(--app-text-soft)",
                          }}
                        >
                          {day.date}
                        </span>
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>

          <div role="rowgroup" className="pb-3 pt-1">
            {rows.length === 0 ? (
              <EmptyRows view={view} />
            ) : (
              rows.map((row, r) => (
                <div key={row.id} className="group/row flex" style={{ height: ROW_H }} role="row">
                  <div
                    className={cn("sticky left-0 z-10 flex shrink-0 items-center justify-between gap-2 pr-3", compact ? "pl-3" : "pl-4")}
                    style={{
                      width: LABEL_W,
                      background: "var(--app-surface)",
                      boxShadow: view === "tasks" && row.colour ? `inset 2px 0 0 ${row.colour}` : undefined,
                      borderTop: row.total ? "1px solid var(--app-border)" : undefined,
                    }}
                    role="rowheader"
                  >
                    <span className="min-w-0">{row.label}</span>
                    {compact ? null : <span className="shrink-0 text-[10.5px] tabular-nums" style={{ color: "var(--app-text-faint)" }}>{row.aside}</span>}
                  </div>
                  {period.weeks.map((week, wi) => (
                    <div key={week.days[0].key} className="flex shrink-0" style={{ marginLeft: wi ? WEEK_GAP : 0, borderTop: row.total ? "1px solid var(--app-border)" : undefined }}>
                      {week.days.map((day, di) => {
                        const c = wi * 7 + di;
                        const school = isSchoolDay(period, day.key);
                        const isFocus = roving.r === r && roving.c === c;
                        const isOpen = open?.rowId === row.id && open.day === day.key;
                        const common = {
                          "data-r": r,
                          "data-c": c,
                          tabIndex: isFocus ? 0 : -1,
                          onFocus: () => setFocus({ r, c }),
                        };
                        return (
                          <div
                            key={day.key}
                            className="grid place-items-center"
                            style={{
                              width: SLOT,
                              height: ROW_H,
                              background: day.key === today ? "color-mix(in oklab, var(--app-text) 6%, transparent)" : undefined,
                            }}
                            role="gridcell"
                          >
                            {view === "habits" ? (
                              <HabitCell
                                {...common}
                                done={habits.isDone(row.id, day.key)}
                                future={day.key > today}
                                before={(habits.habits.find((h) => h.id === row.id)?.since ?? "") > day.key}
                                today={day.key === today}
                                label={`${habits.habits.find((h) => h.id === row.id)?.name ?? "Habit"}, ${shortDate(day.key)}`}
                                onToggle={() => habits.toggle(row.id, day.key)}
                              />
                            ) : (
                              <WorkCell
                                {...common}
                                detail={detailFor(row, day.key)}
                                view={view}
                                school={school}
                                today={today}
                                nowMs={nowMs}
                                colour={row.colour}
                                total={row.total}
                                inSpan={row.span ? day.key >= row.span.from && day.key <= row.span.to : false}
                                selected={isOpen}
                                onOpen={(anchor) => setOpen(isOpen ? null : { rowId: row.id, day: day.key, anchor })}
                              />
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {open && openRow ? (
        <CellPopover
          anchor={open.anchor}
          detail={detailFor(openRow, open.day)}
          today={today}
          nowMs={nowMs}
          timezone={timezone}
          onClose={(refocus) => {
            const anchor = open.anchor;
            setOpen(null);
            if (refocus) anchor.focus();
          }}
          onOpenDay={props.onOpenDay}
          onAddTask={props.onAddTask}
          onOpenTask={props.onOpenTask}
          onOpenEvent={props.onOpenEvent}
          onSetEventDone={props.onSetEventDone}
          onMoveEvent={props.onMoveEvent}
          onSetTaskDone={props.onSetTaskDone}
          onMoveTask={props.onMoveTask}
        />
      ) : null}
    </div>
  );
}

interface CellCommon {
  "data-r": number;
  "data-c": number;
  tabIndex: number;
  onFocus: () => void;
}

/** A day of study for a subject or task. */
function WorkCell({
  detail,
  view,
  school,
  today,
  nowMs,
  colour,
  total,
  inSpan,
  selected,
  onOpen,
  ...common
}: CellCommon & {
  detail: CellDetail;
  view: MatrixView;
  school: boolean;
  today: string;
  nowMs: number;
  colour: string | null;
  total?: boolean;
  inSpan: boolean;
  selected: boolean;
  onOpen: (anchor: HTMLElement) => void;
}) {
  const hue = colour ?? "var(--app-text)";
  const planned = detail.blocks.reduce((sum, event) => sum + eventMinutes(event), 0);
  const done = detail.blocks.filter((event) => event.outcome === "completed").reduce((sum, event) => sum + eventMinutes(event), 0);
  const state = cellState(detail, school, today, nowMs);
  const exam = detail.tasks.some(isExam);
  const allDone = detail.tasks.length > 0 && detail.tasks.every((task) => task.status === "complete");
  const notch = detail.tasks.length ? (allDone ? "var(--app-text-faint)" : exam ? "var(--app-danger)" : "var(--app-text)") : null;

  const style: CSSProperties =
    view === "study" ? studyStyle(done, planned, hue, state, total) : stateStyle(state, hue, planned ? done / planned : 0);
  if (inSpan && state === "empty") style.background = `color-mix(in oklab, ${hue} 12%, var(--app-surface-soft))`;

  const words = [
    shortDate(detail.day),
    planned ? `${shortMinutes(done)} of ${shortMinutes(planned)} done` : null,
    detail.tasks.length ? detail.tasks.map((task) => `${isExam(task) ? "Exam" : "Due"}: ${task.title}`).join(", ") : null,
    STATE_WORD[state],
  ].filter(Boolean);

  return (
    <button
      type="button"
      {...common}
      onClick={(event) => onOpen(event.currentTarget)}
      aria-label={words.join(". ")}
      aria-haspopup="dialog"
      aria-expanded={selected}
      className={cn(
        "relative overflow-hidden rounded-[4px] transition-transform duration-100 hover:scale-[1.18] focus-visible:scale-[1.18] focus-visible:outline-none",
        selected && "scale-[1.18]",
      )}
      style={{
        width: CELL,
        height: CELL,
        ...style,
        outline: selected ? "2px solid var(--app-text)" : undefined,
        outlineOffset: 1,
      }}
    >
      {notch ? (
        <span aria-hidden="true" className="absolute right-0 top-0 h-0 w-0" style={{ borderTop: `8px solid ${notch}`, borderLeft: "8px solid transparent" }} />
      ) : null}
    </button>
  );
}

function HabitCell({
  done,
  future,
  before,
  today,
  label,
  onToggle,
  ...common
}: CellCommon & { done: boolean; future: boolean; before: boolean; today: boolean; label: string; onToggle: () => void }) {
  return (
    <button
      type="button"
      {...common}
      role="checkbox"
      aria-checked={done}
      aria-label={label}
      disabled={future}
      onClick={onToggle}
      className="rounded-[4px] transition-transform duration-100 hover:scale-[1.18] focus-visible:scale-[1.18] focus-visible:outline-none disabled:hover:scale-100"
      style={{
        width: CELL,
        height: CELL,
        background: done ? "var(--app-text)" : future || before ? "transparent" : "var(--app-surface-soft)",
        boxShadow: done
          ? undefined
          : today
            ? "inset 0 0 0 1.5px var(--app-text-muted)"
            : future || before
              ? "inset 0 0 0 1px var(--app-border)"
              : undefined,
        opacity: future ? 0.5 : 1,
      }}
    />
  );
}

function cellState(detail: CellDetail, school: boolean, today: string, nowMs: number): CellState {
  const { blocks } = detail;
  if (!blocks.length) return school ? "empty" : "inactive";
  const planned = blocks.reduce((sum, event) => sum + eventMinutes(event), 0);
  const done = blocks.filter((event) => event.outcome === "completed").reduce((sum, event) => sum + eventMinutes(event), 0);
  if (done >= planned - 0.5) return "complete";
  if (done > 0) return "partial";
  const over = detail.day < today || blocks.every((event) => event.outcome === "missed" || Date.parse(event.endAt) < nowMs);
  return over ? "missed" : "scheduled";
}

const STATE_WORD: Record<CellState, string> = {
  empty: "Nothing planned",
  inactive: "Holidays",
  scheduled: "Scheduled",
  partial: "Part done",
  complete: "Done",
  missed: "Nothing done",
};

const HATCH = "repeating-linear-gradient(135deg, transparent 0 3px, color-mix(in oklab, var(--app-text) 9%, transparent) 3px 4px)";

function stateStyle(state: CellState, hue: string, fraction: number): CSSProperties {
  switch (state) {
    case "inactive":
      return { background: HATCH, boxShadow: "inset 0 0 0 1px var(--app-border)" };
    case "scheduled":
      return { background: "var(--app-surface)", boxShadow: `inset 0 0 0 1.5px color-mix(in oklab, ${hue} 75%, transparent)` };
    case "partial": {
      const pct = Math.round(Math.max(0.25, Math.min(0.8, fraction)) * 100);
      return {
        background: `linear-gradient(to top, ${hue} ${pct}%, color-mix(in oklab, ${hue} 14%, var(--app-surface)) ${pct}%)`,
        boxShadow: `inset 0 0 0 1.5px color-mix(in oklab, ${hue} 75%, transparent)`,
      };
    }
    case "complete":
      return { background: hue };
    case "missed":
      return { background: "var(--app-surface-soft)", boxShadow: "inset 0 0 0 1.5px color-mix(in oklab, var(--app-danger) 55%, transparent)" };
    default:
      return { background: "var(--app-surface-soft)" };
  }
}

/** Study view: shaded by minutes done, like the consistency heatmap; planned-only days outlined. */
function studyStyle(done: number, planned: number, hue: string, state: CellState, total?: boolean): CSSProperties {
  if (state === "inactive" && !planned) return { background: HATCH, boxShadow: "inset 0 0 0 1px var(--app-border)" };
  const tone = total ? "var(--app-accent)" : hue;
  if (done <= 0) {
    return planned
      ? { background: "var(--app-surface)", boxShadow: `inset 0 0 0 1.5px color-mix(in oklab, ${tone} 55%, transparent)` }
      : { background: "var(--app-surface-soft)" };
  }
  const level = done < 30 ? 22 : done < 60 ? 40 : done < 90 ? 60 : done < 120 ? 80 : 100;
  return { background: `color-mix(in oklab, ${tone} ${level}%, var(--app-surface-soft))` };
}

function Legend({ view }: { view: MatrixView }) {
  const item = (swatch: CSSProperties, label: string, notch?: string) => (
    <span key={label} className="flex items-center gap-1.5">
      <span className="relative overflow-hidden rounded-[3px]" style={{ width: 12, height: 12, ...swatch }}>
        {notch ? <span className="absolute right-0 top-0 h-0 w-0" style={{ borderTop: `6px solid ${notch}`, borderLeft: "6px solid transparent" }} /> : null}
      </span>
      {label}
    </span>
  );
  const ink = "var(--app-text-soft)";
  let items: ReactNode[];
  if (view === "habits") {
    items = [item({ background: "var(--app-text)" }, "Done"), item({ background: "var(--app-surface-soft)" }, "Not done"), item({ boxShadow: "inset 0 0 0 1px var(--app-border)", opacity: 0.6 }, "Still to come")];
  } else if (view === "study") {
    items = [
      <span key="scale" className="flex items-center gap-1">
        Less
        {[0, 22, 40, 60, 80, 100].map((level) => (
          <span key={level} className="rounded-[3px]" style={{ width: 12, height: 12, background: level ? `color-mix(in oklab, var(--app-accent) ${level}%, var(--app-surface-soft))` : "var(--app-surface-soft)" }} />
        ))}
        More
      </span>,
      item(stateStyle("scheduled", ink, 0), "Planned"),
      item(stateStyle("inactive", ink, 0), "Holidays"),
    ];
  } else {
    items = [
      item(stateStyle("scheduled", ink, 0), "Scheduled"),
      item(stateStyle("partial", ink, 0.5), "Part done"),
      item(stateStyle("complete", ink, 1), "Done"),
      item(stateStyle("missed", ink, 0), "Nothing done"),
      item({ background: "var(--app-surface-soft)" }, "Deadline", "var(--app-text)"),
      item({ background: "var(--app-surface-soft)" }, "Exam", "var(--app-danger)"),
      item(stateStyle("inactive", ink, 0), "Holidays"),
    ];
  }
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px]" style={{ color: "var(--app-text-muted)" }} aria-label="Legend">
      {items}
    </div>
  );
}

function EmptyRows({ view }: { view: MatrixView }) {
  const copy: Record<MatrixView, string> = {
    subjects: "Add subjects in your profile and they'll each get a row here.",
    tasks: "No deadlines this term yet. Add one and it gets a row, with its study laid out to the due date.",
    study: "Add subjects in your profile to see study by subject.",
    habits: "No habits yet. Add some in the habits panel and tick them off here day by day.",
  };
  return (
    <p className="sticky left-0 max-w-[420px] px-4 py-6 text-[13px] leading-relaxed" style={{ color: "var(--app-text-muted)" }}>
      {copy[view]}
    </p>
  );
}

function groupBy<T>(items: T[], key: (item: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const k = key(item);
    const list = map.get(k);
    if (list) list.push(item);
    else map.set(k, [item]);
  }
  return map;
}
