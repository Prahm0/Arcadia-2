"use client";

import { useMemo, useState } from "react";
import { api } from "@/lib/api/client";
import { useDashboardData } from "@/lib/app/DashboardProvider";
import type { PlannerTask } from "@/lib/api/types";
import { dateKey, formatDurationMinutes, formatDueSoon } from "@/lib/api/time";
import { cn } from "@/lib/cn";
import PageHeader from "./PageHeader";
import AppButton from "./AppButton";
import NewTaskSheet from "./NewTaskSheet";

export default function DeadlinesView() {
  const { data, reload } = useDashboardData();
  const timezone = data.profile?.timezone || "Australia/Sydney";
  const [showTaskSheet, setShowTaskSheet] = useState(false);

  const subjectColor = useMemo(() => {
    const map = new Map<string, string>();
    for (const subject of data.subjects) {
      if (subject.name && subject.colour) map.set(subject.name.toLowerCase(), subject.colour);
    }
    return map;
  }, [data.subjects]);

  const grouped = useMemo(() => groupTasks(data.tasks, timezone), [data.tasks, timezone]);
  const total = data.tasks.filter((t) => t.status === "pending").length;
  const totalMinutes = data.tasks.filter((t) => t.status === "pending").reduce((s, t) => s + t.remainingMinutes, 0);

  return (
    <>
      <PageHeader
        eyebrow="Deadlines"
        title={total === 0 ? "All caught up." : `${total} open ${total === 1 ? "task" : "tasks"}`}
        meta={total > 0 ? `${formatDurationMinutes(totalMinutes)} of work remaining across ${data.subjects.length} subjects` : undefined}
        action={
          <AppButton
            variant="primary"
            onClick={() => setShowTaskSheet(true)}
            icon={<svg viewBox="0 0 20 20" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M10 4v12M4 10h12" strokeLinecap="round" /></svg>}
          >
            New task
          </AppButton>
        }
      />

      <div className="mx-auto flex w-full max-w-[820px] flex-col gap-8 px-6 py-8 sm:px-10">
        {total === 0 ? (
          <div
            className="rounded-[16px] p-10 text-center"
            style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}
          >
            <p className="text-[16px] font-medium" style={{ color: "var(--app-text)" }}>Nothing pending.</p>
            <p className="mt-2 text-[14px]" style={{ color: "var(--app-text-muted)" }}>
              Add a task and Arcadia will schedule it around your commitments.
            </p>
          </div>
        ) : null}

        {grouped.map((group) => (
          <section key={group.label}>
            <h2 className="type-eyebrow" style={{ color: "var(--app-text-muted)" }}>{group.label}</h2>
            <ul className="mt-3 flex flex-col gap-2">
              {group.tasks.map((task) => (
                <DeadlineRow
                  key={task.id}
                  task={task}
                  timezone={timezone}
                  color={subjectColor.get((task.subject || "").toLowerCase())}
                  onDelete={async () => {
                    if (!confirm(`Delete "${task.title}"?`)) return;
                    await api(`/api/tasks/${encodeURIComponent(task.id)}`, { method: "DELETE" }).catch(() => {});
                    await reload();
                  }}
                />
              ))}
            </ul>
          </section>
        ))}
      </div>

      <NewTaskSheet open={showTaskSheet} onClose={() => setShowTaskSheet(false)} />
    </>
  );
}

function DeadlineRow({
  task, timezone, color, onDelete,
}: {
  task: PlannerTask;
  timezone: string;
  color?: string;
  onDelete: () => void;
}) {
  return (
    <li
      className={cn("group flex items-center gap-4 rounded-[12px] px-4 py-4 transition-colors")}
      style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}
    >
      <span
        aria-hidden="true"
        className="h-10 w-1 shrink-0 rounded-full"
        style={{ background: color || "var(--app-accent)" }}
      />
      <div className="min-w-0 flex-1">
        <p className="text-[15px] font-medium tracking-[-0.005em]" style={{ color: "var(--app-text)" }}>
          {task.title}
        </p>
        <p className="mt-1 text-[12.5px] font-mono" style={{ color: "var(--app-text-muted)" }}>
          {task.subject ? `${task.subject} · ` : ""}
          {formatDueSoon(task.dueAt, timezone)} · {formatDurationMinutes(task.remainingMinutes)}
        </p>
      </div>
      <button
        type="button"
        onClick={onDelete}
        aria-label={`Delete ${task.title}`}
        className="grid h-8 w-8 place-items-center rounded-lg opacity-0 transition-opacity group-hover:opacity-100 hover:bg-black/5"
        style={{ color: "var(--app-text-muted)" }}
      >
        <svg viewBox="0 0 20 20" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M4 6h12M8 6V4h4v2M6 6l1 10h6l1-10" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </button>
    </li>
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
    .map(([label, list]) => ({ label, tasks: list }));
}

function daysBetween(fromKey: string, toKey: string): number {
  const from = new Date(`${fromKey}T00:00:00Z`).getTime();
  const to = new Date(`${toKey}T00:00:00Z`).getTime();
  return Math.round((to - from) / 86_400_000);
}
