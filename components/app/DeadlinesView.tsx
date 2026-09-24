"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api/client";
import { useDashboardData } from "@/lib/app/DashboardProvider";
import type { PlannerTask } from "@/lib/api/types";
import { dateKey, formatDurationMinutes, formatDueSoon } from "@/lib/api/time";
import { playCompletionTick } from "@/lib/app/completion";
import { cn } from "@/lib/cn";
import { flashMenuNotice, showContextMenu } from "./ContextMenu";
import PageHeader from "./PageHeader";
import AppButton from "./AppButton";
import EmptyState, { ExampleRow } from "./EmptyState";
import NewTaskSheet from "./NewTaskSheet";
import TaskDetailSheet from "./TaskDetailSheet";
import { categoryColor } from "@/lib/app/categoryColors";

export default function DeadlinesView() {
  const { data, patch, reload } = useDashboardData();
  const timezone = data.profile?.timezone || "Australia/Sydney";
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<PlannerTask | null>(null);
  const [detailTask, setDetailTask] = useState<PlannerTask | null>(null);

  // Search links here with ?task=<id>: open that task's sheet once per link.
  const taskParam = useSearchParams().get("task");
  const [openedParam, setOpenedParam] = useState<string | null>(null);
  if (taskParam !== openedParam) {
    setOpenedParam(taskParam);
    const linked = taskParam ? data.tasks.find((task) => task.id === taskParam) : undefined;
    if (linked) setDetailTask(linked);
  }
  useEffect(() => {
    if (!taskParam) return;
    const url = new URL(window.location.href);
    url.searchParams.delete("task");
    window.history.replaceState(window.history.state, "", url.toString());
  }, [taskParam]);

  // Track the freshest copy of the open task so optimistic patches (add-time,
  // notes, complete) flow into the sheet without waiting for reload.
  const liveDetailTask = useMemo(() => {
    if (!detailTask) return null;
    return data.tasks.find((task) => task.id === detailTask.id) ?? null;
  }, [data.tasks, detailTask]);

  const subjectColor = useMemo(() => {
    const map = new Map<string, string>();
    for (const subject of data.subjects) {
      if (subject.name && subject.colour) map.set(subject.name.toLowerCase(), subject.colour);
    }
    return map;
  }, [data.subjects]);

  const grouped = useMemo(() => groupTasks(data.tasks, timezone), [data.tasks, timezone]);
  const pending = useMemo(
    () => data.tasks.filter((task) => task.status === "pending").sort((a, b) => Date.parse(a.dueAt) - Date.parse(b.dueAt)),
    [data.tasks],
  );
  const total = pending.length;
  const totalMinutes = pending.reduce((sum, task) => sum + task.remainingMinutes, 0);
  const nextTask = pending[0] ?? null;
  const thisWeek = pending.filter((task) => {
    const days = daysUntil(task.dueAt, timezone);
    return days >= 0 && days <= 7;
  });
  const overdue = pending.filter((task) => daysUntil(task.dueAt, timezone) < 0);

  function edit(task: PlannerTask) {
    setEditing(task);
    setSheetOpen(true);
  }

  // The right-click menu's versions of the detail sheet's buttons.
  async function complete(task: PlannerTask) {
    playCompletionTick();
    patch((prev) => ({
      ...prev,
      tasks: prev.tasks.map((existing) =>
        existing.id === task.id ? { ...existing, status: "complete", remainingMinutes: 0 } : existing,
      ),
    }));
    try {
      await api(`/api/tasks/${encodeURIComponent(task.id)}`, {
        method: "PATCH",
        body: JSON.stringify({ status: "complete" }),
      });
    } catch (err) {
      flashMenuNotice(err instanceof Error ? err.message : "Couldn't mark it done.");
    }
    await reload();
  }

  async function remove(task: PlannerTask) {
    if (!confirm(`Delete "${task.title}"? This also removes its scheduled study blocks.`)) return;
    try {
      await api(`/api/tasks/${encodeURIComponent(task.id)}`, { method: "DELETE" });
      patch((prev) => ({
        ...prev,
        tasks: prev.tasks.filter((existing) => existing.id !== task.id),
        events: prev.events.filter((event) => event.taskId !== task.id),
      }));
    } catch (err) {
      flashMenuNotice(err instanceof Error ? err.message : "Couldn't delete it.");
    }
    await reload();
  }

  const taskMenu = (task: PlannerTask) => (event: React.MouseEvent) =>
    showContextMenu(
      event,
      [
        { kind: "item", label: "Open", onSelect: () => setDetailTask(task) },
        { kind: "item", label: "Edit details…", onSelect: () => edit(task) },
        { kind: "separator" },
        { kind: "item", label: "Mark done", onSelect: () => void complete(task) },
        { kind: "separator" },
        { kind: "item", label: "Delete…", danger: true, onSelect: () => void remove(task) },
      ],
      task.title,
    );

  return (
    <>
      <PageHeader width={820}
        eyebrow="Plan"
        title="Deadlines"
        meta={
          total === 0
            ? "No open tasks"
            : `${total} open ${total === 1 ? "task" : "tasks"} · ${formatDurationMinutes(totalMinutes)} of work across ${data.subjects.length} ${data.subjects.length === 1 ? "subject" : "subjects"}`
        }
        tour="deadlines"
        action={
          <AppButton
            variant="primary"
            onClick={() => { setEditing(null); setSheetOpen(true); }}
            icon={<svg viewBox="0 0 20 20" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M10 4v12M4 10h12" strokeLinecap="round" /></svg>}
          >
            New task
          </AppButton>
        }
      />

      <div className="mx-auto flex w-full max-w-[820px] flex-col gap-8 px-6 py-8 sm:px-10">
        {total === 0 && data.tasks.length === 0 ? (
          <EmptyState
            title={<>Nothing due <span className="accent-serif">yet</span>.</>}
            body="Add an assessment and Arcadia books the prep before it, around the rest of your week."
            example={
              <>
                <ExampleRow title="Chemistry lab report" meta="Chem · Due Fri · 90 min" />
                <ExampleRow title="Complex numbers set" meta="Maths · Due next Wed · 60 min" bar={categoryColor("school")} />
                <ExampleRow title="English essay draft" meta="English · Due 12 Sep · 120 min" bar={categoryColor("extracurricular")} />
              </>
            }
            action={
              <AppButton
                variant="primary"
                onClick={() => { setEditing(null); setSheetOpen(true); }}
                icon={<svg viewBox="0 0 20 20" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M10 4v12M4 10h12" strokeLinecap="round" /></svg>}
              >
                Add a deadline
              </AppButton>
            }
            hint="You can also just tell Arcad in chat, it'll add and schedule for you."
          />
        ) : total === 0 ? (
          <EmptyState
            title={<>All <span className="accent-serif">caught up</span>.</>}
            body="Nothing open right now. Add the next thing whenever it appears, Arcadia will slot it in."
            action={
              <AppButton variant="secondary" onClick={() => { setEditing(null); setSheetOpen(true); }}>
                Add a task
              </AppButton>
            }
          />
        ) : null}

        {nextTask ? (
          <DeadlineOverview
            task={nextTask}
            timezone={timezone}
            color={subjectColor.get((nextTask.subject || "").toLowerCase())}
            dueThisWeek={thisWeek.length}
            overdue={overdue.length}
            minutesThisWeek={thisWeek.reduce((sum, task) => sum + task.remainingMinutes, 0)}
            onOpen={() => setDetailTask(nextTask)}
            onContextMenu={taskMenu(nextTask)}
          />
        ) : null}

        {grouped.map((group) => (
          <section key={group.label}>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="type-eyebrow" style={{ color: "var(--app-text-muted)" }}>{group.label}</h2>
              <p className="text-[12px] tabular-nums" style={{ color: "var(--app-text-faint)" }}>
                {group.tasks.length} {group.tasks.length === 1 ? "task" : "tasks"} · {formatDurationMinutes(group.minutes)} left
              </p>
            </div>
            <ul className="mt-3 flex flex-col gap-2">
              {group.tasks.map((task) => (
                <DeadlineRow
                  key={task.id}
                  task={task}
                  timezone={timezone}
                  color={subjectColor.get((task.subject || "").toLowerCase())}
                  onClick={() => setDetailTask(task)}
                  onContextMenu={taskMenu(task)}
                />
              ))}
            </ul>
          </section>
        ))}
      </div>

      <TaskDetailSheet
        task={liveDetailTask}
        timezone={timezone}
        onClose={() => setDetailTask(null)}
        onEdit={(task) => {
          setDetailTask(null);
          edit(task);
        }}
      />
      <NewTaskSheet
        open={sheetOpen}
        editing={editing}
        onClose={() => { setSheetOpen(false); setEditing(null); }}
      />
    </>
  );
}

function DeadlineOverview({
  task,
  timezone,
  color,
  dueThisWeek,
  overdue,
  minutesThisWeek,
  onOpen,
  onContextMenu,
}: {
  task: PlannerTask;
  timezone: string;
  color?: string;
  dueThisWeek: number;
  overdue: number;
  minutesThisWeek: number;
  onOpen: () => void;
  onContextMenu: (event: React.MouseEvent) => void;
}) {
  const state = deadlineState(task.dueAt, timezone);
  const attention = state.days <= 1 || state.days < 0;

  return (
    <section
      onContextMenu={onContextMenu}
      className="overflow-hidden rounded-xl border"
      style={{
        background: attention
          ? "linear-gradient(135deg, color-mix(in oklab, var(--app-danger) 10%, var(--app-surface)), var(--app-surface))"
          : "linear-gradient(135deg, color-mix(in oklab, var(--app-accent) 10%, var(--app-surface)), var(--app-surface))",
        borderColor: attention
          ? "color-mix(in oklab, var(--app-danger) 24%, var(--app-border))"
          : "color-mix(in oklab, var(--app-accent) 22%, var(--app-border))",
        boxShadow: "var(--elev-1)",
      }}
      aria-label="Next deadline"
    >
      <div className="grid @3xl/main:grid-cols-[minmax(0,1fr)_210px]">
        <div className="min-w-0 px-5 py-5 sm:px-6 sm:py-6">
          <p className="type-eyebrow" style={{ color: attention ? "var(--app-danger)" : "var(--app-accent-strong)" }}>
            {state.days < 0 ? "Needs attention" : "Next deadline"}
          </p>
          <div className="mt-3 flex items-start gap-3">
            <span className="mt-1 h-3 w-3 shrink-0 rounded-full" style={{ background: color || "var(--app-accent)" }} aria-hidden="true" />
            <div className="min-w-0">
              <h2 className="truncate text-[21px] font-semibold tracking-[-0.02em] sm:text-[24px]" style={{ color: "var(--app-text)" }}>
                {task.title}
              </h2>
              <p className="mt-1 text-[13.5px]" style={{ color: "var(--app-text-muted)" }}>
                {task.subject ? `${task.subject} · ` : ""}{formatDueSoon(task.dueAt, timezone)} · {formatDurationMinutes(task.remainingMinutes)} left
              </p>
            </div>
          </div>
          <div className="mt-5">
            <AppButton variant={attention ? "danger" : "primary"} onClick={onOpen}>
              Open deadline
            </AppButton>
          </div>
        </div>
        <div className="grid grid-cols-2 border-t px-5 py-4 sm:px-6 @3xl/main:grid-cols-1 @3xl/main:border-l @3xl/main:border-t-0" style={{ borderColor: "var(--app-border)" }}>
          <DeadlineSnapshot label={overdue > 0 ? "Overdue" : "Due this week"} value={String(overdue > 0 ? overdue : dueThisWeek)} detail={overdue > 0 ? "needs a new plan" : "tasks to prepare for"} tone={overdue > 0 ? "danger" : "default"} />
          <DeadlineSnapshot label="This week" value={formatDurationMinutes(minutesThisWeek)} detail="of work left" />
        </div>
      </div>
    </section>
  );
}

function DeadlineSnapshot({ label, value, detail, tone = "default" }: { label: string; value: string; detail: string; tone?: "default" | "danger" }) {
  return (
    <div className="py-1.5 lg:py-2.5">
      <p className="text-[11.5px] font-medium" style={{ color: "var(--app-text-muted)" }}>{label}</p>
      <p className="mt-1 text-[20px] font-semibold leading-none tabular-nums tracking-[-0.025em]" style={{ color: tone === "danger" ? "var(--app-danger)" : "var(--app-text)" }}>{value}</p>
      <p className="mt-1 text-[11.5px]" style={{ color: "var(--app-text-faint)" }}>{detail}</p>
    </div>
  );
}

function DeadlineRow({
  task, timezone, color, onClick, onContextMenu,
}: {
  task: PlannerTask;
  timezone: string;
  color?: string;
  onClick: () => void;
  onContextMenu: (event: React.MouseEvent) => void;
}) {
  const state = deadlineState(task.dueAt, timezone);
  const estimated = Math.max(task.estimatedMinutes ?? task.remainingMinutes, task.remainingMinutes, 1);
  const complete = Math.max(0, estimated - task.remainingMinutes);
  const progress = Math.min(1, complete / estimated);

  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        onContextMenu={onContextMenu}
        className={cn("group flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left transition-colors sm:gap-4 sm:px-4")}
        style={{ background: "var(--app-surface)", boxShadow: "var(--elev-1)" }}
      >
        <DeadlineDateBadge state={state} />
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-medium tracking-[-0.005em]" style={{ color: "var(--app-text)" }}>
            {task.title}
          </p>
          <p className="mt-1 text-[12.5px] tabular-nums" style={{ color: "var(--app-text-muted)" }}>
            {task.subject ? (
              <>
                <span className="font-medium" style={{ color: color ? `color-mix(in oklab, ${color} 70%, var(--app-text))` : "var(--app-text-soft)" }}>
                  {task.subject}
                </span>
                {" · "}
              </>
            ) : null}
            {formatDueSoon(task.dueAt, timezone)} · {formatDurationMinutes(task.remainingMinutes)}
          </p>
          <div className="mt-2 h-1 overflow-hidden rounded-full sm:hidden" style={{ background: "var(--app-border)" }} aria-label={`${formatDurationMinutes(task.remainingMinutes)} of work left`}>
            <div className="h-full rounded-full" style={{ width: `${Math.max(3, progress * 100)}%`, background: color || "var(--app-accent)" }} />
          </div>
        </div>
        <div className="hidden w-24 shrink-0 sm:block">
          <p className="text-right text-[11px] tabular-nums" style={{ color: "var(--app-text-muted)" }}>
            {formatDurationMinutes(task.remainingMinutes)} left
          </p>
          <div className="mt-1.5 h-1 overflow-hidden rounded-full" style={{ background: "var(--app-border)" }} aria-label={`${formatDurationMinutes(task.remainingMinutes)} of work left`}>
            <div className="h-full rounded-full" style={{ width: `${Math.max(3, progress * 100)}%`, background: color || "var(--app-accent)" }} />
          </div>
        </div>
        <span
          aria-hidden="true"
          className="text-[14px] transition-transform group-hover:translate-x-0.5"
          style={{ color: "var(--app-text-muted)" }}
        >
          →
        </span>
      </button>
    </li>
  );
}

function DeadlineDateBadge({ state }: { state: ReturnType<typeof deadlineState> }) {
  const urgent = state.days <= 1;
  return (
    <span
      className="flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-md"
      style={{
        background: urgent ? "color-mix(in oklab, var(--app-danger) 11%, var(--app-surface-soft))" : "var(--app-surface-soft)",
        color: urgent ? "var(--app-danger)" : "var(--app-text-soft)",
        boxShadow: "var(--elev-inset)",
      }}
      aria-hidden="true"
    >
      <span className="text-[10px] font-semibold uppercase tracking-[0.08em]">{state.month}</span>
      <span className="text-[17px] font-semibold leading-[0.9] tabular-nums">{state.day}</span>
    </span>
  );
}

function groupTasks(tasks: PlannerTask[], timezone: string) {
  const now = new Date();
  const todayKey = dateKey(now.toISOString(), timezone);
  const groups: Record<string, PlannerTask[]> = { "Overdue": [], "This week": [], "Next week": [], "Later": [] };
  const pending = tasks.filter((t) => t.status === "pending").sort((a, b) => Date.parse(a.dueAt) - Date.parse(b.dueAt));
  for (const task of pending) {
    const dueKey = dateKey(task.dueAt, timezone);
    const days = daysBetween(todayKey, dueKey);
    if (days < 0) groups["Overdue"].push(task);
    else if (days <= 7) groups["This week"].push(task);
    else if (days <= 14) groups["Next week"].push(task);
    else groups["Later"].push(task);
  }
  return Object.entries(groups)
    .filter(([, list]) => list.length > 0)
    .map(([label, list]) => ({ label, tasks: list, minutes: list.reduce((sum, task) => sum + task.remainingMinutes, 0) }));
}

function deadlineState(iso: string, timezone: string) {
  const days = daysUntil(iso, timezone);
  const parts = new Intl.DateTimeFormat("en-AU", { month: "short", day: "numeric", timeZone: timezone }).formatToParts(new Date(iso));
  return {
    days,
    month: parts.find((part) => part.type === "month")?.value ?? "",
    day: parts.find((part) => part.type === "day")?.value ?? "",
  };
}

function daysUntil(iso: string, timezone: string) {
  return daysBetween(dateKey(new Date().toISOString(), timezone), dateKey(iso, timezone));
}

function daysBetween(fromKey: string, toKey: string): number {
  const from = new Date(`${fromKey}T00:00:00Z`).getTime();
  const to = new Date(`${toKey}T00:00:00Z`).getTime();
  return Math.round((to - from) / 86_400_000);
}
