"use client";

import { useState } from "react";
import type { DashboardResponse, PlannerEvent, PlannerTask } from "@/lib/api/types";
import { dateKey, formatClock } from "@/lib/api/time";
import { studyTitle } from "@/lib/app/subjectColour";
import AppButton from "../AppButton";
import { SubjectTag } from "../cards/shared";
import { addDays, blockStyle, eventMinutes, eventStatus, isDraggable, isExam, shortDate, shortMinutes, startOfDayMs, taskStatus } from "./calendar";
import { Bar, ExamWord, PanelTitle, StatusWord, Tick } from "./bits";
import type { SubjectInfo } from "./ContextPanel";
import { showContextMenu } from "../ContextMenu";
import type { ScheduleMenus } from "./TimeGrid";

interface DayPanelProps {
  day: string;
  today: string;
  nowMs: number;
  timezone: string;
  /** Everything touching the day, study narrowed to the subject filter. */
  events: PlannerEvent[];
  tasks: PlannerTask[];
  subjects: SubjectInfo[];
  data: DashboardResponse;
  onOpenEvent: (event: PlannerEvent) => void;
  onOpenTask: (task: PlannerTask) => void;
  onSetEventDone: (event: PlannerEvent, done: boolean) => void;
  onMoveEvent: (event: PlannerEvent, startMs: number) => void;
  onSetTaskDone: (task: PlannerTask, done: boolean) => void;
  onMoveTask: (task: PlannerTask, dueKey: string) => void;
  menus?: ScheduleMenus;
}

/**
 * Day view's working list: the study to do, what's due (and overdue), and
 * the fixed things around it. Each item says where it stands and can be
 * ticked off or moved from here.
 */
export default function DayPanel({
  day,
  today,
  nowMs,
  timezone,
  events,
  tasks,
  subjects,
  data,
  onOpenEvent,
  onOpenTask,
  onSetEventDone,
  onMoveEvent,
  onSetTaskDone,
  onMoveTask,
  menus,
}: DayPanelProps) {
  const study = events.filter((event) => event.category === "study");
  const fixed = events.filter((event) => event.category !== "study" && event.category !== "sleep" && event.kind !== "all-day");
  const allDay = events.filter((event) => event.kind === "all-day");
  const dueToday = tasks.filter((task) => task.status !== "cancelled" && dateKey(task.dueAt, timezone) === day);
  // Overdue work follows you to today, so it's handled rather than forgotten.
  const overdue = day === today ? tasks.filter((task) => task.status === "pending" && dateKey(task.dueAt, timezone) < today) : [];
  const planned = study.reduce((sum, event) => sum + eventMinutes(event), 0);
  const done = study.filter((event) => event.outcome === "completed").reduce((sum, event) => sum + eventMinutes(event), 0);
  const items = study.length + dueToday.length;
  const itemsDone = study.filter((event) => event.outcome === "completed").length + dueToday.filter((task) => task.status === "complete").length;
  const colourOf = (name: string | null | undefined) => subjects.find((subject) => subject.name.toLowerCase() === (name ?? "").toLowerCase())?.colour ?? "";
  const eventMenu = (event: PlannerEvent) =>
    menus ? (e: React.MouseEvent) => showContextMenu(e, menus.event(event), event.category === "study" ? studyTitle(event) : event.title) : undefined;
  const taskMenu = (task: PlannerTask) =>
    menus ? (e: React.MouseEvent) => showContextMenu(e, menus.task(task), task.title) : undefined;

  return (
    <aside
      className="hidden w-[320px] shrink-0 flex-col gap-5 overflow-y-auto border-l px-4 py-4 [scrollbar-width:thin] lg:flex"
      style={{ borderColor: "var(--app-border)" }}
      aria-label={`${shortDate(day)} as a list`}
    >
      <section>
        <div className="flex items-baseline justify-between">
          <p className="text-[15px] font-semibold tabular-nums" style={{ color: "var(--app-text)" }}>
            {items ? `${itemsDone} of ${items} done` : "A free day"}
          </p>
          {planned ? (
            <p className="text-[12.5px] tabular-nums" style={{ color: "var(--app-text-muted)" }}>
              {shortMinutes(done)} / {shortMinutes(planned)} study
            </p>
          ) : null}
        </div>
        <div className="mt-2">
          <Bar value={items ? itemsDone / items : 0} />
        </div>
      </section>

      {overdue.length ? (
        <Section title="Overdue" count={overdue.length}>
          {overdue.map((task) => (
            <TaskRow key={task.id} task={task} nowMs={nowMs} today={today} colour={colourOf(task.subject)} onOpen={onOpenTask} onDone={onSetTaskDone} onMove={onMoveTask} onContextMenu={taskMenu(task)} />
          ))}
        </Section>
      ) : null}

      <Section title="Study" count={study.length}>
        {study.length ? (
          study.map((event) => {
            const status = eventStatus(event, nowMs);
            return (
              <Row
                key={event.id}
                done={event.outcome === "completed"}
                onToggle={() => onSetEventDone(event, event.outcome !== "completed")}
                label={studyTitle(event)}
                onOpen={() => onOpenEvent(event)}
                onContextMenu={eventMenu(event)}
                meta={
                  <>
                    <span className="tabular-nums">{formatClock(event.startAt, timezone)}–{formatClock(event.endAt, timezone)}</span>
                    {event.subject && studyTitle(event) !== event.subject ? <SubjectTag subject={{ name: event.subject, colour: colourOf(event.subject) }} size="sm" /> : null}
                  </>
                }
                status={status}
                move={isDraggable(event) ? { kind: "time", initial: event, onMove: (ms) => onMoveEvent(event, ms), timezone, day } : null}
              />
            );
          })
        ) : (
          <Empty>No study planned{day >= today ? ". Arcad fills free time as deadlines come in." : "."}</Empty>
        )}
      </Section>

      <Section title="Due" count={dueToday.length}>
        {dueToday.length ? (
          dueToday.map((task) => (
            <TaskRow key={task.id} task={task} nowMs={nowMs} today={today} colour={colourOf(task.subject)} onOpen={onOpenTask} onDone={onSetTaskDone} onMove={onMoveTask} onContextMenu={taskMenu(task)} />
          ))
        ) : (
          <Empty>Nothing due.</Empty>
        )}
      </Section>

      {fixed.length || allDay.length ? (
        <Section title="Classes and commitments" count={fixed.length + allDay.length}>
          {allDay.map((event) => (
            <FixedRow key={event.id} event={event} time="All day" data={data} onOpen={onOpenEvent} onContextMenu={eventMenu(event)} />
          ))}
          {fixed.map((event) => (
            <FixedRow key={event.id} event={event} time={`${formatClock(event.startAt, timezone)}–${formatClock(event.endAt, timezone)}`} data={data} onOpen={onOpenEvent} onContextMenu={eventMenu(event)} />
          ))}
        </Section>
      ) : null}
    </aside>
  );
}

function Section({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  return (
    <section>
      <PanelTitle aside={count ? <span className="text-[12px] tabular-nums" style={{ color: "var(--app-text-faint)" }}>{count}</span> : null}>{title}</PanelTitle>
      <ul className="mt-1.5 flex flex-col">{children}</ul>
    </section>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <li className="py-1 text-[12.5px]" style={{ color: "var(--app-text-muted)" }}>
      {children}
    </li>
  );
}

type Move =
  | { kind: "time"; initial: PlannerEvent; onMove: (startMs: number) => void; timezone: string; day: string }
  | { kind: "date"; initial: string; onMove: (dayKey: string) => void };

function Row({
  done,
  onToggle,
  label,
  onOpen,
  onContextMenu,
  meta,
  status,
  move,
  prefix,
}: {
  done: boolean;
  onToggle: () => void;
  label: string;
  onOpen: () => void;
  onContextMenu?: (event: React.MouseEvent) => void;
  meta: React.ReactNode;
  status: ReturnType<typeof eventStatus>;
  move: Move | null;
  prefix?: React.ReactNode;
}) {
  const [moving, setMoving] = useState(false);
  return (
    <li className="group -mx-2 rounded-md px-2 py-1.5 ui-hover" onContextMenu={onContextMenu}>
      <div className="flex items-start gap-2.5">
        <span className="pt-px">
          <Tick checked={done} onChange={onToggle} label={done ? `Mark ${label} not done` : `Mark ${label} done`} />
        </span>
        <button type="button" onClick={onOpen} className="min-w-0 flex-1 text-left">
          <span className="flex items-center gap-1.5">
            {prefix}
            <span
              className="truncate text-[13.5px] font-medium"
              style={{ color: done ? "var(--app-text-muted)" : "var(--app-text)", textDecoration: done ? "line-through" : undefined }}
            >
              {label}
            </span>
          </span>
          <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11.5px]" style={{ color: "var(--app-text-muted)" }}>
            {meta}
          </span>
        </button>
        <span className="flex shrink-0 flex-col items-end gap-1">
          <StatusWord status={status} />
          {move && !done ? (
            <button
              type="button"
              onClick={() => setMoving((value) => !value)}
              className="text-[11.5px] font-medium opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100"
              style={{ color: "var(--app-text-muted)", opacity: moving ? 1 : undefined }}
              aria-expanded={moving}
            >
              Move
            </button>
          ) : null}
        </span>
      </div>
      {moving && move ? <MoveForm move={move} onDone={() => setMoving(false)} /> : null}
    </li>
  );
}

/** Pick a new time (blocks) or day (deadlines) inline. */
function MoveForm({ move, onDone }: { move: Move; onDone: () => void }) {
  const initialDate = move.kind === "time" ? move.day : addDays(move.initial, 1);
  const initialTime =
    move.kind === "time"
      ? new Intl.DateTimeFormat("en-GB", { timeZone: move.timezone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(move.initial.startAt))
      : "";
  const [date, setDate] = useState(initialDate);
  const [time, setTime] = useState(initialTime);

  function save(event: React.FormEvent) {
    event.preventDefault();
    if (!date) return;
    if (move.kind === "time") {
      const [h, m] = time.split(":").map(Number);
      if (!Number.isFinite(h) || !Number.isFinite(m)) return;
      move.onMove(startOfDayMs(date, move.timezone) + (h * 60 + m) * 60_000);
    } else {
      move.onMove(date);
    }
    onDone();
  }

  const input = "h-7 rounded-md px-1.5 text-[12.5px]";
  const inputStyle = { background: "var(--app-surface)", color: "var(--app-text)", boxShadow: "var(--elev-inset)" };
  return (
    <form onSubmit={save} className="ml-7 mt-2 flex flex-wrap items-center gap-1.5">
      <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={input} style={inputStyle} aria-label="New date" autoFocus />
      {move.kind === "time" ? (
        <input type="time" value={time} step={900} onChange={(e) => setTime(e.target.value)} className={input} style={inputStyle} aria-label="New start time" />
      ) : null}
      <AppButton size="sm" variant="primary" type="submit">
        Move
      </AppButton>
      <AppButton size="sm" variant="ghost" type="button" onClick={onDone}>
        Cancel
      </AppButton>
    </form>
  );
}

function TaskRow({
  task,
  nowMs,
  today,
  colour,
  onOpen,
  onDone,
  onMove,
  onContextMenu,
}: {
  task: PlannerTask;
  nowMs: number;
  today: string;
  colour: string;
  onOpen: (task: PlannerTask) => void;
  onDone: (task: PlannerTask, done: boolean) => void;
  onMove: (task: PlannerTask, dueKey: string) => void;
  onContextMenu?: (event: React.MouseEvent) => void;
}) {
  const done = task.status === "complete";
  return (
    <Row
      done={done}
      onToggle={() => onDone(task, !done)}
      label={task.title}
      onOpen={() => onOpen(task)}
      onContextMenu={onContextMenu}
      prefix={isExam(task) ? <ExamWord /> : null}
      meta={
        <>
          {task.subject ? <SubjectTag subject={{ name: task.subject, colour }} size="sm" /> : null}
          {!done && task.remainingMinutes ? <span className="tabular-nums">{shortMinutes(task.remainingMinutes)} left</span> : null}
        </>
      }
      status={taskStatus(task, nowMs)}
      move={{ kind: "date", initial: today, onMove: (key) => onMove(task, key) }}
    />
  );
}

function FixedRow({
  event,
  time,
  data,
  onOpen,
  onContextMenu,
}: {
  event: PlannerEvent;
  time: string;
  data: DashboardResponse;
  onOpen: (event: PlannerEvent) => void;
  onContextMenu?: (event: React.MouseEvent) => void;
}) {
  const style = blockStyle(event, data.subjects);
  return (
    <li onContextMenu={onContextMenu}>
      <button type="button" onClick={() => onOpen(event)} className="ui-hover -mx-2 flex w-[calc(100%+1rem)] items-center gap-3 rounded-md px-2 py-1.5 text-left">
        <span className="w-[92px] shrink-0 text-[11.5px] tabular-nums" style={{ color: "var(--app-text-muted)" }}>{time}</span>
        <span className="min-w-0 truncate text-[13px]" style={{ color: style.text }}>{event.title}</span>
      </button>
    </li>
  );
}
