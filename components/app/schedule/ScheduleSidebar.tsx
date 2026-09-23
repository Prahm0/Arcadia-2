"use client";

import Link from "next/link";
import type { DashboardResponse, PlannerEvent, PlannerTask } from "@/lib/api/types";
import { dateKey } from "@/lib/api/time";
import { SUBJECT_COLORS } from "@/lib/app/categoryColors";
import { SubjectTag } from "../cards/shared";
import MiniMonth from "./MiniMonth";
import { dueIn, isExam } from "./calendar";

interface SidebarProps {
  data: DashboardResponse;
  timezone: string;
  anchor: string;
  today: string;
  visible: { from: string; to: string };
  due: Map<string, PlannerTask[]>;
  /** Study blocks in the week on screen, for the subject totals. */
  weekEvents: PlannerEvent[];
  weekLabel: string;
  onPickDate: (key: string) => void;
  onOpenTask: (task: PlannerTask) => void;
  onAddDeadline: () => void;
}

/**
 * The calendar's left panel: where you are in the month, what's due, whether
 * the week's study adds up to each subject's target, and which calendars feed
 * in. Everything here is read off the student's own data.
 */
export default function ScheduleSidebar({
  data,
  timezone,
  anchor,
  today,
  visible,
  due,
  weekEvents,
  weekLabel,
  onPickDate,
  onOpenTask,
  onAddDeadline,
}: SidebarProps) {
  const upcoming = data.tasks
    .filter((task) => task.status === "pending" && dateKey(task.dueAt, timezone) >= today)
    .sort((a, b) => Date.parse(a.dueAt) - Date.parse(b.dueAt))
    .slice(0, 5);
  const overdue = data.tasks.filter((task) => task.status === "pending" && dateKey(task.dueAt, timezone) < today).length;
  const syllabusNotice = data.notices?.find((notice) => notice.kind === "syllabus");

  return (
    <aside
      className="hidden w-[264px] shrink-0 flex-col gap-3 overflow-y-auto border-r px-3 py-4 [scrollbar-width:thin] xl:flex"
      style={{ borderColor: "var(--app-border)" }}
      aria-label="Calendar tools"
    >
      <MiniMonth anchor={anchor} today={today} selected={visible} due={due} onPick={onPickDate} />

      <Panel
        title="Coming up"
        action={
          <button type="button" onClick={onAddDeadline} className="ui-hover rounded px-1.5 py-0.5 text-[12px] font-medium" style={{ color: "var(--app-text-muted)" }}>
            + Add
          </button>
        }
      >
        {upcoming.length ? (
          <ul className="flex flex-col">
            {upcoming.map((task) => {
              const key = dateKey(task.dueAt, timezone);
              const subject = data.subjects.find((s) => s.name.toLowerCase() === (task.subject ?? "").toLowerCase());
              const colour = subject ? subject.colour || SUBJECT_COLORS[data.subjects.indexOf(subject) % SUBJECT_COLORS.length] : null;
              const soon = key <= addDaysKey(today, 2);
              return (
                <li key={task.id}>
                  <div className="ui-hover -mx-1.5 flex items-start gap-2 rounded-md px-1.5 py-1.5">
                    <button type="button" onClick={() => onPickDate(key)} className="min-w-0 flex-1 text-left" aria-label={`Show ${task.title} on the calendar`}>
                      <span className="flex items-center gap-1.5">
                        {isExam(task) ? <ExamWord /> : null}
                        <span className="truncate text-[13px] font-medium" style={{ color: "var(--app-text)" }}>{task.title}</span>
                      </span>
                      <span className="mt-1 flex items-center gap-1.5">
                        {task.subject ? <SubjectTag subject={{ name: task.subject, colour: colour ?? "" }} size="sm" /> : null}
                        <span
                          className="text-[11.5px] tabular-nums"
                          style={{ color: soon ? "var(--app-warning)" : "var(--app-text-muted)", fontWeight: soon ? 600 : 400 }}
                        >
                          {dueIn(key, today)}
                        </span>
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => onOpenTask(task)}
                      aria-label={`Edit ${task.title}`}
                      className="ui-hover grid h-6 w-6 shrink-0 place-items-center rounded"
                      style={{ color: "var(--app-text-faint)" }}
                    >
                      <svg viewBox="0 0 20 20" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
                        <path d="M4 14.5V16h1.5L14 7.5 12.5 6 4 14.5zM12.5 6L14 4.5 15.5 6 14 7.5" strokeLinejoin="round" />
                      </svg>
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-[12.5px] leading-snug" style={{ color: "var(--app-text-muted)" }}>
            Nothing due. Add an exam or assignment and Arcad plans study time before it.
          </p>
        )}
        {overdue ? (
          <Link href="/app/deadlines" className="mt-2 block text-[12px] font-medium" style={{ color: "var(--app-danger)" }}>
            {overdue} overdue. Sort them out →
          </Link>
        ) : null}
      </Panel>

      <StudyTotals subjects={data.subjects} events={weekEvents} label={weekLabel} />

      {syllabusNotice ? (
        <Panel title="Add your syllabus">
          <p className="text-[12.5px] leading-snug" style={{ color: "var(--app-text-muted)" }}>
            {syllabusNotice.body}
          </p>
          <Link
            href={syllabusNotice.action.href}
            className="mt-2.5 flex h-8 items-center justify-center rounded-md text-[12.5px] font-medium"
            style={{ background: "var(--app-surface)", color: "var(--app-text)", boxShadow: "var(--elev-1)" }}
          >
            {syllabusNotice.action.label}
          </Link>
        </Panel>
      ) : null}

      <Calendars data={data} />
    </aside>
  );
}

function addDaysKey(key: string, days: number): string {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days, 12)).toISOString().slice(0, 10);
}

function Panel({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-lg p-3" style={{ background: "var(--app-surface-soft)" }}>
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-[12.5px] font-semibold" style={{ color: "var(--app-text-soft)" }}>{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

export function ExamWord() {
  return (
    <span
      className="shrink-0 rounded-[3px] px-1 text-[10px] font-semibold uppercase tracking-[0.04em]"
      style={{ color: "var(--app-danger)", boxShadow: "inset 0 0 0 1px color-mix(in oklab, var(--app-danger) 45%, transparent)" }}
    >
      Exam
    </span>
  );
}

/** Planned study for each subject against its weekly target. */
function StudyTotals({ subjects, events, label }: { subjects: DashboardResponse["subjects"]; events: PlannerEvent[]; label: string }) {
  const rows = subjects
    .map((subject, index) => {
      const key = subject.name.trim().toLowerCase();
      const mine = events.filter((event) => event.category === "study" && (event.subject ?? "").trim().toLowerCase() === key);
      const minutes = (list: PlannerEvent[]) =>
        list.reduce((sum, event) => sum + Math.max(0, (Date.parse(event.endAt) - Date.parse(event.startAt)) / 60_000), 0);
      return {
        subject,
        colour: subject.colour || SUBJECT_COLORS[index % SUBJECT_COLORS.length],
        planned: Math.round(minutes(mine.filter((event) => event.outcome !== "missed"))),
        done: Math.round(minutes(mine.filter((event) => event.outcome === "completed"))),
        target: subject.weeklyMinutes ?? 0,
      };
    })
    .filter((row) => row.planned || row.target);

  if (!rows.length) return null;
  return (
    <Panel title={`Study, ${label}`}>
      <ul className="flex flex-col gap-2.5">
        {rows.map((row) => {
          const scale = Math.max(row.target, row.planned, 1);
          const short = row.target > 0 && row.planned < row.target;
          return (
            <li key={row.subject.id}>
              <div className="flex items-center justify-between gap-2">
                <SubjectTag subject={{ name: row.subject.name, colour: row.colour }} size="sm" />
                <span className="shrink-0 text-[11.5px] tabular-nums" style={{ color: short ? "var(--app-warning)" : "var(--app-text-muted)" }}>
                  {hours(row.planned)}
                  {row.target ? ` / ${hours(row.target)}` : ""}
                </span>
              </div>
              <div
                className="relative mt-1.5 h-1 overflow-hidden rounded-full"
                style={{ background: "color-mix(in oklab, var(--app-border) 70%, transparent)" }}
                role="img"
                aria-label={`${hours(row.done)} done, ${hours(row.planned)} planned${row.target ? ` of ${hours(row.target)}` : ""}`}
              >
                <div className="absolute inset-y-0 left-0" style={{ width: `${(row.planned / scale) * 100}%`, background: `color-mix(in oklab, ${row.colour} 35%, transparent)` }} />
                <div className="absolute inset-y-0 left-0" style={{ width: `${(row.done / scale) * 100}%`, background: row.colour }} />
              </div>
            </li>
          );
        })}
      </ul>
      <p className="mt-2.5 text-[11px]" style={{ color: "var(--app-text-faint)" }}>
        Solid is done, pale is planned.
      </p>
    </Panel>
  );
}

function hours(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

/** Which calendars feed in, and a way to add Canvas, Google, Outlook or Apple. */
function Calendars({ data }: { data: DashboardResponse }) {
  const feeds = data.calendarFeeds ?? [];
  const google = data.google?.connected;
  const connected = Number(Boolean(google)) + feeds.length;
  return (
    <Panel title="Calendars">
      {connected ? (
        <ul className="mb-2 flex flex-col gap-1.5">
          {google ? <CalendarRow name="Google Calendar" error={null} /> : null}
          {feeds.map((feed) => (
            <CalendarRow key={feed.id} name={feed.name} error={feed.lastSyncError} />
          ))}
        </ul>
      ) : (
        <p className="mb-2.5 text-[12.5px] leading-snug" style={{ color: "var(--app-text-muted)" }}>
          Bring in classes and due dates from Canvas, Google, Outlook or Apple so study fits around them.
        </p>
      )}
      <Link
        href="/app/settings#calendars"
        className="flex h-8 items-center justify-center gap-1.5 rounded-md text-[12.5px] font-medium"
        style={{ background: "var(--app-surface)", color: "var(--app-text)", boxShadow: "var(--elev-1)" }}
      >
        <svg viewBox="0 0 20 20" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
          <path d="M8.5 11.5a3 3 0 004.2 0l2.6-2.6a3 3 0 00-4.2-4.2l-.9.9M11.5 8.5a3 3 0 00-4.2 0l-2.6 2.6a3 3 0 004.2 4.2l.9-.9" strokeLinecap="round" />
        </svg>
        {connected ? "Manage calendars" : "Connect a calendar"}
      </Link>
    </Panel>
  );
}

function CalendarRow({ name, error }: { name: string; error: string | null }) {
  return (
    <li className="flex items-center justify-between gap-2 text-[12.5px]">
      <span className="truncate" style={{ color: "var(--app-text-soft)" }}>{name}</span>
      <span className="shrink-0 text-[11px]" style={{ color: error ? "var(--app-danger)" : "var(--app-success)" }}>
        {error ? "Sync failed" : "Synced"}
      </span>
    </li>
  );
}
