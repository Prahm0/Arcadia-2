"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/lib/api/client";
import { useDashboardData } from "@/lib/app/DashboardProvider";
import type { DashboardResponse, PlannerTask } from "@/lib/api/types";
import { formatDueSoon, formatDurationMinutes } from "@/lib/api/time";
import { playCompletionTick } from "@/lib/app/completion";
import AppButton from "./AppButton";

interface TaskDetailSheetProps {
  task: PlannerTask | null;
  timezone: string;
  onClose: () => void;
  onEdit: (task: PlannerTask) => void;
}

const TASK_TYPE_LABEL: Record<string, string> = {
  homework: "Homework",
  assignment: "Assignment",
  exam: "Exam",
  revision: "Revision",
  project: "Project",
};

const ADD_TIME_PRESETS = [15, 30, 60];

export default function TaskDetailSheet({ task, timezone, onClose, onEdit }: TaskDetailSheetProps) {
  const { data, patch, reload } = useDashboardData();
  const [notes, setNotes] = useState(task?.notes ?? "");
  const [dirtyNotes, setDirtyNotes] = useState(false);
  const [busy, setBusy] = useState<"complete" | "reopen" | "delete" | "notes" | number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const notesRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (task) {
      setNotes(task.notes ?? "");
      setDirtyNotes(false);
      setError(null);
    }
  }, [task]);

  useEffect(() => {
    if (!task) return;
    const listener = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, [task, onClose]);

  const scheduledMinutes = useMemo(() => {
    if (!task) return 0;
    return data.events
      .filter((event) => event.taskId === task.id && event.outcome !== "missed")
      .reduce((total, event) => {
        return total + Math.max(0, (Date.parse(event.endAt) - Date.parse(event.startAt)) / 60000);
      }, 0);
  }, [data.events, task]);

  if (!task) return null;

  const estimated = task.estimatedMinutes ?? task.remainingMinutes + scheduledMinutes;
  const scheduled = Math.min(estimated, Math.round(scheduledMinutes));
  const progress = estimated > 0 ? Math.min(1, scheduled / estimated) : 0;
  const isComplete = task.status === "complete";

  async function patchTask(body: Record<string, unknown>, kind: NonNullable<typeof busy>) {
    setBusy(kind);
    setError(null);
    try {
      await api(`/api/tasks/${encodeURIComponent(task!.id)}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      });
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save changes.");
    } finally {
      setBusy(null);
    }
  }

  async function saveNotes() {
    await patchTask({ notes }, "notes");
    // reload above refreshes the task; keep the sheet open and clear dirty flag
    setDirtyNotes(false);
  }

  async function addMinutes(delta: number) {
    // Bump the task's estimated_minutes; the backend recomputes remaining from
    // scheduled minutes so this always widens the runway.
    const next = Math.max(15, (task!.estimatedMinutes ?? task!.remainingMinutes + Math.round(scheduledMinutes)) + delta);
    // Optimistic
    patch((prev: DashboardResponse) => ({
      ...prev,
      tasks: prev.tasks.map((existing) =>
        existing.id === task!.id
          ? {
              ...existing,
              estimatedMinutes: next,
              remainingMinutes: existing.remainingMinutes + delta,
            }
          : existing,
      ),
    }));
    await patchTask({ estimatedMinutes: next }, delta);
  }

  async function markComplete() {
    // Nudging estimatedMinutes to the already-scheduled amount is safer than
    // implying zero remaining if the backend flips a completion flag later.
    setBusy("complete");
    setError(null);
    playCompletionTick();
    try {
      await api(`/api/tasks/${encodeURIComponent(task!.id)}`, {
        method: "PATCH",
        body: JSON.stringify({ status: "complete" }),
      });
      patch((prev: DashboardResponse) => ({
        ...prev,
        tasks: prev.tasks.map((existing) =>
          existing.id === task!.id ? { ...existing, status: "complete", remainingMinutes: 0 } : existing,
        ),
      }));
      await reload();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't mark complete.");
    } finally {
      setBusy(null);
    }
  }

  async function reopen() {
    setBusy("reopen");
    setError(null);
    try {
      await api(`/api/tasks/${encodeURIComponent(task!.id)}`, {
        method: "PATCH",
        body: JSON.stringify({ status: "pending" }),
      });
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't reopen.");
    } finally {
      setBusy(null);
    }
  }

  async function remove() {
    if (!confirm(`Delete "${task!.title}"? This also removes its scheduled study blocks.`)) return;
    setBusy("delete");
    setError(null);
    try {
      await api(`/api/tasks/${encodeURIComponent(task!.id)}`, { method: "DELETE" });
      patch((prev: DashboardResponse) => ({
        ...prev,
        tasks: prev.tasks.filter((existing) => existing.id !== task!.id),
        events: prev.events.filter((event) => event.taskId !== task!.id),
      }));
      await reload();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't delete.");
    } finally {
      setBusy(null);
    }
  }

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
        aria-labelledby="task-detail-title"
        className="relative w-full max-w-[560px] rounded-t-[16px] p-6 shadow-[0_40px_120px_-40px_rgba(0,0,0,0.35)] sm:rounded-[16px]"
        style={{
          background: "var(--app-surface)",
          border: "1px solid var(--app-border)",
          color: "var(--app-text)",
        }}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <p className="type-eyebrow" style={{ color: "var(--app-text-muted)" }}>
                {TASK_TYPE_LABEL[task.taskType || "homework"] ?? "Task"}
              </p>
              {isComplete ? (
                <span
                  className="rounded-full px-1.5 py-0.5 text-[10.5px] font-medium"
                  style={{
                    background: "color-mix(in oklab, var(--app-success) 15%, transparent)",
                    color: "var(--app-success)",
                  }}
                >
                  Done
                </span>
              ) : null}
            </div>
            <h2 id="task-detail-title" className="mt-1 text-[22px] font-medium tracking-[-0.015em]">
              {task.title}
            </h2>
            <p className="mt-1.5 type-mono-label" style={{ color: "var(--app-text-muted)" }}>
              {task.subject ? `${task.subject} · ` : ""}
              {formatDueSoon(task.dueAt, timezone)}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="grid h-8 w-8 shrink-0 place-items-center rounded-lg transition-colors hover:bg-black/5"
            style={{ color: "var(--app-text-muted)" }}
          >
            <svg viewBox="0 0 20 20" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.6">
              <path d="M5 5l10 10M15 5L5 15" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {/* Progress */}
        <div className="mt-5">
          <div className="flex items-baseline justify-between">
            <p className="type-eyebrow" style={{ color: "var(--app-text-muted)" }}>
              Scheduled
            </p>
            <p className="type-mono-label" style={{ color: "var(--app-text)" }}>
              {formatDurationMinutes(scheduled)} of {formatDurationMinutes(estimated)}
              {task.remainingMinutes > 0 ? (
                <span style={{ color: "var(--app-text-muted)" }}>
                  {" "}
                  · {formatDurationMinutes(task.remainingMinutes)} left
                </span>
              ) : null}
            </p>
          </div>
          <div
            className="mt-2 h-1.5 w-full overflow-hidden rounded-full"
            style={{ background: "var(--app-surface-soft)", border: "1px solid var(--app-border)" }}
            aria-hidden="true"
          >
            <div
              className="h-full rounded-full"
              style={{
                width: `${progress * 100}%`,
                background: "var(--app-accent)",
                transition: "width 0.3s var(--ease-out-expo, ease-out)",
              }}
            />
          </div>
        </div>

        {/* Add time */}
        {!isComplete ? (
          <div className="mt-5">
            <p className="type-eyebrow" style={{ color: "var(--app-text-muted)" }}>
              Add time
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {ADD_TIME_PRESETS.map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => addMinutes(n)}
                  disabled={busy !== null}
                  className="rounded-full px-3 py-1.5 text-[13px] font-medium transition-colors disabled:opacity-50"
                  style={{
                    border: "1px solid var(--app-border-strong)",
                    color: "var(--app-text)",
                    background: busy === n ? "var(--app-accent-soft)" : "transparent",
                  }}
                >
                  +{n} min
                </button>
              ))}
              <span className="ml-1 self-center text-[12px]" style={{ color: "var(--app-text-muted)" }}>
                bumps the estimate and re-plans around it
              </span>
            </div>
          </div>
        ) : null}

        {/* Notes */}
        <div className="mt-5">
          <div className="flex items-center justify-between">
            <p className="type-eyebrow" style={{ color: "var(--app-text-muted)" }}>
              Notes
            </p>
            {dirtyNotes ? (
              <button
                type="button"
                onClick={saveNotes}
                disabled={busy === "notes"}
                className="text-[12px] font-medium"
                style={{ color: "var(--app-accent-strong)" }}
              >
                {busy === "notes" ? "Saving…" : "Save"}
              </button>
            ) : null}
          </div>
          <textarea
            ref={notesRef}
            value={notes}
            onChange={(e) => {
              setNotes(e.target.value);
              setDirtyNotes(true);
            }}
            onBlur={() => {
              if (dirtyNotes) void saveNotes();
            }}
            rows={3}
            placeholder="Anything to remember about this task — links, page numbers, why it matters."
            className="mt-2 w-full resize-y rounded-[10px] px-3 py-2.5 text-[13.5px] outline-none"
            style={{
              background: "var(--app-surface-soft)",
              border: "1px solid var(--app-border)",
              color: "var(--app-text)",
              minHeight: 72,
            }}
          />
        </div>

        {error ? (
          <p className="mt-3 text-[13px]" style={{ color: "var(--app-danger)" }}>
            {error}
          </p>
        ) : null}

        <div className="mt-6 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <AppButton type="button" variant="ghost" onClick={remove} loading={busy === "delete"}>
              Delete
            </AppButton>
            <AppButton type="button" variant="ghost" onClick={() => onEdit(task)}>
              Edit full details
            </AppButton>
          </div>
          <div className="flex items-center gap-2">
            {isComplete ? (
              <AppButton type="button" variant="secondary" onClick={reopen} loading={busy === "reopen"}>
                Reopen
              </AppButton>
            ) : (
              <AppButton type="button" variant="primary" onClick={markComplete} loading={busy === "complete"}>
                Mark complete
              </AppButton>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
