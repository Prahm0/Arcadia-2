"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api/client";
import { useDashboardData } from "@/lib/app/DashboardProvider";
import type { DashboardResponse, PlannerEvent } from "@/lib/api/types";
import AppButton from "./AppButton";
import EventDetailSheet from "./EventDetailSheet";

type MissReason = "sick" | "tired" | "other_plans" | "forgot" | "didnt_feel_like_it" | "other";

const REASONS: Array<{ value: MissReason; label: string }> = [
  { value: "sick", label: "Sick" },
  { value: "tired", label: "Too tired" },
  { value: "other_plans", label: "Other plans" },
  { value: "forgot", label: "Forgot" },
  { value: "didnt_feel_like_it", label: "Didn't feel like it" },
  { value: "other", label: "Something else" },
];

interface SessionStartModalProps {
  event: PlannerEvent | null;
  timezone: string;
  onClose: () => void;
}

/** A focused check-in at the moment a planned study block begins. */
export default function SessionStartModal({ event, timezone, onClose }: SessionStartModalProps) {
  const router = useRouter();
  const { patch, reload } = useDashboardData();
  const [showReasons, setShowReasons] = useState(false);
  const [editing, setEditing] = useState(false);
  const [reason, setReason] = useState<MissReason | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!event) return null;

  const subject = event.subject || "your study session";

  function startFocus() {
    if (!event) return;
    const selectedEvent = event;
    onClose();
    router.push(`/app/focus?eventId=${encodeURIComponent(selectedEvent.id)}`);
  }

  function openReschedule() {
    setEditing(true);
  }

  async function logMiss() {
    if (!reason) return;
    if (!event) return;
    const selectedEvent = event;
    setSaving(true);
    setError(null);

    try {
      // A3 promotes this locally-captured reason into the event record. Keep
      // it now so the student does not need to answer the same question twice.
      try {
        window.localStorage.setItem(`arcadia:session-start:miss-reason:${selectedEvent.id}`, reason);
      } catch {
        /* The outcome still matters if storage is unavailable. */
      }
      await api(`/api/events/${encodeURIComponent(selectedEvent.id)}/outcome`, {
        method: "POST",
        body: JSON.stringify({ outcome: "missed" }),
      });
      patch((previous: DashboardResponse) => ({
        ...previous,
        events: previous.events.map((existing) =>
          existing.id === selectedEvent.id ? { ...existing, outcome: "missed", status: "missed" } : existing,
        ),
      }));
      await reload();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't log this session.");
    } finally {
      setSaving(false);
    }
  }

  if (editing) {
    return (
      <EventDetailSheet
        event={event}
        timezone={timezone}
        initialMode="reschedule"
        onClose={() => {
          setEditing(false);
          onClose();
        }}
      />
    );
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center p-0 sm:items-center sm:p-6">
      <div
        aria-hidden="true"
        className="absolute inset-0 cursor-default"
        style={{ background: "color-mix(in oklab, black 52%, transparent)" }}
        onClick={onClose}
      />
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="session-start-title"
        className="relative w-full max-w-[460px] rounded-t-xl p-6 sm:rounded-xl"
        style={{ background: "var(--app-elev)", boxShadow: "var(--elev-3)", color: "var(--app-text)" }}
      >
        <div
          aria-hidden="true"
          className="grid size-10 place-items-center rounded-full"
          style={{ background: "var(--app-accent-soft)", color: "var(--app-accent-strong)" }}
        >
          <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7">
            <path d="M10 3v7l4 2" strokeLinecap="round" strokeLinejoin="round" />
            <circle cx="10" cy="10" r="7" />
          </svg>
        </div>
        <p className="mt-5 type-eyebrow" style={{ color: "var(--app-accent-strong)" }}>Arcad check-in</p>
        <h2 id="session-start-title" className="mt-1.5 text-[24px] font-medium tracking-[-0.02em]">
          You&apos;re on {subject} now. Ready to go?
        </h2>
        <p className="mt-2 text-[14px] leading-6" style={{ color: "var(--app-text-muted)" }}>
          {event.title}
        </p>

        {showReasons ? (
          <div className="mt-6">
            <p className="text-[14px] font-medium">What got in the way?</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {REASONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setReason(option.value)}
                  className="rounded-full px-3 py-1.5 text-[12.5px] font-medium transition-colors"
                  style={{
                    background: reason === option.value ? "var(--app-accent)" : "var(--app-surface-soft)",
                    color: reason === option.value ? "var(--app-accent-on)" : "var(--app-text)",
                    boxShadow: reason === option.value ? undefined : "var(--elev-inset)",
                  }}
                >
                  {option.label}
                </button>
              ))}
            </div>
            {error ? <p className="mt-3 text-[13px]" style={{ color: "var(--app-danger)" }}>{error}</p> : null}
            <div className="mt-6 flex items-center justify-between gap-3">
              <AppButton type="button" variant="ghost" onClick={() => setShowReasons(false)} disabled={saving}>
                Back
              </AppButton>
              <AppButton type="button" variant="primary" onClick={() => void logMiss()} loading={saving} disabled={!reason}>
                Log missed session
              </AppButton>
            </div>
          </div>
        ) : (
          <div className="mt-6 flex flex-col gap-2">
            <AppButton type="button" variant="primary" className="h-10" onClick={startFocus}>
              Start focus mode
            </AppButton>
            <AppButton type="button" variant="secondary" className="h-10" onClick={openReschedule}>
              Reschedule
            </AppButton>
            <button
              type="button"
              onClick={() => setShowReasons(true)}
              className="mt-1 h-9 rounded-md text-[13px] font-medium"
              style={{ color: "var(--app-text-muted)" }}
            >
              Skip and log why
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
