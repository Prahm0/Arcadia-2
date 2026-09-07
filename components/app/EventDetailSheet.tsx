"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/api/client";
import { useDashboardData } from "@/lib/app/DashboardProvider";
import type { DashboardResponse, PlannerEvent } from "@/lib/api/types";
import { formatClock } from "@/lib/api/time";
import { playCompletionTick } from "@/lib/app/completion";
import AppButton from "./AppButton";

interface EventDetailSheetProps {
  event: PlannerEvent | null;
  timezone: string;
  onClose: () => void;
}

const CATEGORY_LABEL: Record<string, string> = {
  study: "Study",
  school: "School",
  sport: "Sport",
  extracurricular: "Extracurricular",
  sleep: "Sleep",
  other: "Other",
};

export default function EventDetailSheet({ event, timezone, onClose }: EventDetailSheetProps) {
  const { data, patch, reload } = useDashboardData();
  const [busy, setBusy] = useState<"complete" | "miss" | "delete" | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!event) return;
    const listener = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, [event, onClose]);

  useEffect(() => {
    if (event) setError(null);
  }, [event]);

  if (!event) return null;

  const linkedTask = event.taskId ? data.tasks.find((task) => task.id === event.taskId) : null;
  const minutes = Math.round((Date.parse(event.endAt) - Date.parse(event.startAt)) / 60000);
  const isCompleted = event.outcome === "completed";
  const isMissed = event.outcome === "missed";
  const canAct = !isCompleted && !isMissed;
  const isStudy = event.category === "study";
  const isEditable = event.editable !== false;

  async function markOutcome(outcome: "completed" | "missed") {
    if (!event) return;
    setBusy(outcome === "completed" ? "complete" : "miss");
    setError(null);
    if (outcome === "completed") playCompletionTick();
    const previousOutcome = event.outcome;
    // Optimistic update
    patch((prev: DashboardResponse) => ({
      ...prev,
      events: prev.events.map((existing) =>
        existing.id === event.id
          ? {
              ...existing,
              outcome,
              status: outcome === "completed" ? "completed" : "missed",
            }
          : existing,
      ),
    }));
    try {
      await api(`/api/events/${encodeURIComponent(event.id)}/outcome`, {
        method: "POST",
        body: JSON.stringify({ outcome }),
      });
      await reload();
      onClose();
    } catch (err) {
      patch((prev: DashboardResponse) => ({
        ...prev,
        events: prev.events.map((existing) =>
          existing.id === event.id
            ? { ...existing, outcome: previousOutcome, status: previousOutcome }
            : existing,
        ),
      }));
      setError(err instanceof Error ? err.message : "Couldn't update.");
    } finally {
      setBusy(null);
    }
  }

  async function remove() {
    if (!event) return;
    if (!confirm(`Remove "${event.title}" from your schedule?`)) return;
    setBusy("delete");
    setError(null);
    try {
      await api(`/api/events/${encodeURIComponent(event.id)}`, { method: "DELETE" });
      patch((prev: DashboardResponse) => ({
        ...prev,
        events: prev.events.filter((existing) => existing.id !== event.id),
      }));
      await reload();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't remove.");
    } finally {
      setBusy(null);
    }
  }

  const stateChip =
    event.outcome === "completed"
      ? { label: "Done", tone: "success" as const }
      : event.outcome === "missed"
        ? { label: "Missed", tone: "muted" as const }
        : { label: "Planned", tone: "accent" as const };

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
        aria-labelledby="event-detail-title"
        className="relative w-full max-w-[480px] rounded-t-[16px] p-6 shadow-[0_40px_120px_-40px_rgba(0,0,0,0.35)] sm:rounded-[16px]"
        style={{
          background: "var(--app-surface)",
          border: "1px solid var(--app-border)",
          color: "var(--app-text)",
        }}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <p className="type-eyebrow" style={{ color: "var(--app-text-muted)" }}>
                {CATEGORY_LABEL[event.category] ?? "Event"}
              </p>
              <span
                className="rounded-full px-1.5 py-0.5 text-[10.5px] font-medium"
                style={{
                  background:
                    stateChip.tone === "success"
                      ? "color-mix(in oklab, var(--app-success) 15%, transparent)"
                      : stateChip.tone === "muted"
                        ? "var(--app-surface-soft)"
                        : "var(--app-accent-soft)",
                  color:
                    stateChip.tone === "success"
                      ? "var(--app-success)"
                      : stateChip.tone === "muted"
                        ? "var(--app-text-muted)"
                        : "var(--app-accent-strong)",
                }}
              >
                {stateChip.label}
              </span>
            </div>
            <h2
              id="event-detail-title"
              className="mt-1 text-[22px] font-medium tracking-[-0.015em]"
            >
              {event.title}
            </h2>
            {event.subject ? (
              <p className="mt-0.5 text-[13.5px]" style={{ color: "var(--app-text-muted)" }}>
                {event.subject}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="grid h-8 w-8 place-items-center rounded-lg transition-colors hover:bg-black/5"
            style={{ color: "var(--app-text-muted)" }}
          >
            <svg viewBox="0 0 20 20" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.6">
              <path d="M5 5l10 10M15 5L5 15" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <dl className="mt-5 grid grid-cols-2 gap-4 text-[13px]">
          <div>
            <dt className="type-eyebrow" style={{ color: "var(--app-text-muted)" }}>When</dt>
            <dd className="type-mono-label mt-1.5" style={{ color: "var(--app-text)" }}>
              {formatClock(event.startAt, timezone)}–{formatClock(event.endAt, timezone)}
            </dd>
          </div>
          <div>
            <dt className="type-eyebrow" style={{ color: "var(--app-text-muted)" }}>Length</dt>
            <dd className="type-mono-label mt-1.5" style={{ color: "var(--app-text)" }}>
              {minutes} min
            </dd>
          </div>
          {linkedTask ? (
            <div className="col-span-2">
              <dt className="type-eyebrow" style={{ color: "var(--app-text-muted)" }}>Part of</dt>
              <dd className="mt-1.5">
                <Link
                  href="/app/deadlines"
                  onClick={onClose}
                  className="text-[13.5px] font-medium underline underline-offset-4"
                  style={{ color: "var(--app-text)" }}
                >
                  {linkedTask.title}
                </Link>
              </dd>
            </div>
          ) : null}
        </dl>

        {error ? (
          <p className="mt-4 text-[13px]" style={{ color: "var(--app-danger)" }}>
            {error}
          </p>
        ) : null}

        <div className="mt-6 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            {isEditable && !isCompleted && !isMissed ? (
              <AppButton
                type="button"
                variant="ghost"
                onClick={remove}
                loading={busy === "delete"}
              >
                Remove
              </AppButton>
            ) : (
              <span />
            )}
          </div>
          <div className="flex items-center gap-2">
            {isStudy && canAct ? (
              <Link href={`/app/focus?eventId=${encodeURIComponent(event.id)}`} onClick={onClose}>
                <AppButton type="button" variant="secondary">
                  Start focus
                </AppButton>
              </Link>
            ) : null}
            {canAct ? (
              <>
                <AppButton
                  type="button"
                  variant="ghost"
                  onClick={() => markOutcome("missed")}
                  loading={busy === "miss"}
                >
                  Missed
                </AppButton>
                <AppButton
                  type="button"
                  variant="primary"
                  onClick={() => markOutcome("completed")}
                  loading={busy === "complete"}
                >
                  Mark done
                </AppButton>
              </>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
