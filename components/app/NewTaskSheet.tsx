"use client";

import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api/client";
import { useDashboardData } from "@/lib/app/DashboardProvider";
import type { DashboardResponse, PlannerTask } from "@/lib/api/types";
import AppButton from "./AppButton";

interface NewTaskSheetProps {
  open: boolean;
  onClose: () => void;
  editing?: PlannerTask | null;
  /** YYYY-MM-DD to pre-fill the Due field when creating a task (ignored when editing). */
  defaultDueDate?: string | null;
}

const TASK_TYPES = [
  { value: "homework", label: "Homework" },
  { value: "assignment", label: "Assignment" },
  { value: "exam", label: "Exam" },
  { value: "revision", label: "Revision" },
  { value: "project", label: "Project" },
];

export default function NewTaskSheet({ open, onClose, editing, defaultDueDate: initialDue }: NewTaskSheetProps) {
  const { data, patch, reload } = useDashboardData();
  const [title, setTitle] = useState("");
  const [subject, setSubject] = useState(data.subjects[0]?.name ?? "");
  const [taskType, setTaskType] = useState("homework");
  const [dueDate, setDueDate] = useState(() => defaultDueDate());
  const [minutes, setMinutes] = useState(60);
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const isEditing = Boolean(editing);

  useEffect(() => {
    if (open) {
      setError(null);
      if (editing) {
        setTitle(editing.title);
        setSubject(editing.subject || data.subjects[0]?.name || "");
        setTaskType(editing.taskType || "homework");
        setDueDate(editing.dueAt.slice(0, 10));
        setMinutes(editing.remainingMinutes || 60);
      } else {
        setTitle("");
        setSubject(data.subjects[0]?.name || "");
        setTaskType("homework");
        setDueDate(initialDue || defaultDueDate());
        setMinutes(60);
      }
      setTimeout(() => titleRef.current?.focus(), 40);
    }
  }, [open, editing, data.subjects, initialDue]);

  useEffect(() => {
    if (!open) return;
    const listener = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, [open, onClose]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    const body = {
      title,
      subject,
      taskType,
      dueAt: new Date(`${dueDate}T23:59:00`).toISOString(),
      estimatedMinutes: minutes,
      priority: 2,
    };
    // Snapshot for rollback on edit.
    const previousTask = isEditing && editing
      ? data.tasks.find((task) => task.id === editing.id) ?? null
      : null;
    if (isEditing && editing) {
      // Optimistic edit: reflect the new values immediately in the dashboard cache.
      patch((prev: DashboardResponse) => ({
        ...prev,
        tasks: prev.tasks.map((task) =>
          task.id === editing.id
            ? {
                ...task,
                title: body.title,
                subject: body.subject,
                taskType: body.taskType,
                dueAt: body.dueAt,
                estimatedMinutes: body.estimatedMinutes,
                // Only widen remaining if the estimate went up; the scheduler
                // will recompute properly on reload().
                remainingMinutes:
                  body.estimatedMinutes > (task.estimatedMinutes ?? 0)
                    ? task.remainingMinutes + (body.estimatedMinutes - (task.estimatedMinutes ?? 0))
                    : task.remainingMinutes,
              }
            : task,
        ),
      }));
    }
    try {
      if (isEditing && editing) {
        await api(`/api/tasks/${encodeURIComponent(editing.id)}`, {
          method: "PATCH",
          body: JSON.stringify(body),
        });
      } else {
        await api("/api/tasks", { method: "POST", body: JSON.stringify(body) });
      }
      await reload();
      onClose();
    } catch (err) {
      // Rollback the optimistic edit — create doesn't touch the cache
      // pre-response, so there's nothing to undo for the create branch.
      if (isEditing && editing && previousTask) {
        patch((prev: DashboardResponse) => ({
          ...prev,
          tasks: prev.tasks.map((task) => (task.id === editing.id ? previousTask : task)),
        }));
      }
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  async function remove() {
    if (!editing) return;
    if (!confirm(`Delete "${editing.title}"? This also removes its scheduled study blocks.`)) return;
    setDeleting(true);
    setError(null);
    // Snapshot the task + its events for rollback.
    const previousTask = data.tasks.find((task) => task.id === editing.id) ?? null;
    const previousEvents = data.events.filter((event) => event.taskId === editing.id);
    // Optimistic prune
    patch((prev: DashboardResponse) => ({
      ...prev,
      tasks: prev.tasks.filter((task) => task.id !== editing.id),
      events: prev.events.filter((event) => event.taskId !== editing.id),
    }));
    try {
      await api(`/api/tasks/${encodeURIComponent(editing.id)}`, { method: "DELETE" });
      await reload();
      onClose();
    } catch (err) {
      // Rollback
      if (previousTask) {
        patch((prev: DashboardResponse) => ({
          ...prev,
          tasks: [...prev.tasks, previousTask],
          events: [...prev.events, ...previousEvents],
        }));
      }
      setError(err instanceof Error ? err.message : "Failed to delete.");
    } finally {
      setDeleting(false);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <div
        className="absolute inset-0"
        style={{ background: "color-mix(in oklab, black 45%, transparent)" }}
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="new-task-title"
        className="relative w-full max-w-[520px] rounded-t-[16px] p-6 shadow-[0_40px_120px_-40px_rgba(0,0,0,0.35)] sm:rounded-[16px]"
        style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)", color: "var(--app-text)" }}
      >
        <div className="flex items-start justify-between">
          <div>
            <p className="type-eyebrow" style={{ color: "var(--app-text-muted)" }}>{isEditing ? "Edit" : "Add"}</p>
            <h2 id="new-task-title" className="mt-1 text-[22px] font-medium tracking-[-0.015em]">
              {isEditing ? editing?.title : "New task"}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="grid h-8 w-8 place-items-center rounded-lg transition-colors hover:bg-black/5"
            style={{ color: "var(--app-text-muted)" }}
          >
            <svg viewBox="0 0 20 20" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M5 5l10 10M15 5L5 15" strokeLinecap="round" /></svg>
          </button>
        </div>

        <form onSubmit={submit} className="mt-5 space-y-4">
          <Field label="Title">
            <input
              ref={titleRef}
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Chemistry lab report"
              className="w-full rounded-[10px] px-3 py-2.5 text-[15px] outline-none"
              style={{ background: "var(--app-surface-soft)", border: "1px solid var(--app-border)", color: "var(--app-text)" }}
            />
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Subject">
              <select
                required
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                className="w-full rounded-[10px] px-3 py-2.5 text-[15px] outline-none"
                style={{ background: "var(--app-surface-soft)", border: "1px solid var(--app-border)", color: "var(--app-text)" }}
              >
                {data.subjects.map((s) => (
                  <option key={s.id} value={s.name}>{s.name}</option>
                ))}
              </select>
            </Field>
            <Field label="Type">
              <select
                value={taskType}
                onChange={(e) => setTaskType(e.target.value)}
                className="w-full rounded-[10px] px-3 py-2.5 text-[15px] outline-none"
                style={{ background: "var(--app-surface-soft)", border: "1px solid var(--app-border)", color: "var(--app-text)" }}
              >
                {TASK_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Due">
              <input
                required
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="w-full rounded-[10px] px-3 py-2.5 text-[15px] outline-none"
                style={{ background: "var(--app-surface-soft)", border: "1px solid var(--app-border)", color: "var(--app-text)" }}
              />
            </Field>
            <Field label={`Estimated time · ${formatMinutes(minutes)}`}>
              <input
                type="range"
                min={15}
                max={360}
                step={15}
                value={minutes}
                onChange={(e) => setMinutes(Number(e.target.value))}
                className="mt-3 w-full"
                style={{ accentColor: "var(--app-accent)" }}
              />
            </Field>
          </div>

          {error ? (
            <p className="text-[13.5px]" style={{ color: "var(--app-danger)" }}>{error}</p>
          ) : null}

          <div className="flex items-center justify-between gap-2 pt-2">
            {isEditing ? (
              <AppButton type="button" variant="ghost" onClick={remove} loading={deleting}>
                Delete
              </AppButton>
            ) : (
              <span />
            )}
            <div className="flex items-center gap-2">
              <AppButton type="button" variant="ghost" onClick={onClose}>Cancel</AppButton>
              <AppButton type="submit" variant="primary" loading={loading}>
                {isEditing ? "Save" : "Add & schedule"}
              </AppButton>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-2 block text-[12.5px] font-medium" style={{ color: "var(--app-text-muted)" }}>{label}</span>
      {children}
    </label>
  );
}

function defaultDueDate(): string {
  const d = new Date();
  d.setDate(d.getDate() + 3);
  return d.toISOString().slice(0, 10);
}

function formatMinutes(m: number): string {
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (h === 0) return `${r} min`;
  if (r === 0) return `${h} hr`;
  return `${h} hr ${r} min`;
}
