"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api/client";
import { useDashboardData } from "@/lib/app/DashboardProvider";
import type { DashboardResponse, MissReason, PlannerEvent } from "@/lib/api/types";
import AppButton from "./AppButton";
import EventDetailSheet from "./EventDetailSheet";
import MissReasonPicker from "./MissReasonPicker";

interface SessionStartModalProps {
  event: PlannerEvent | null;
  timezone: string;
  onClose: () => void;
}

/** A focused check-in at the moment a planned study block begins. */
export default function SessionStartModal({ event, timezone, onClose }: SessionStartModalProps) {
  const router = useRouter();
  const { data, patch, reload } = useDashboardData();
  const [showReasons, setShowReasons] = useState(false);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!event) return null;

  const subject = event.subject || "your study session";
  const hasPaidPlan = data.user.tier === "pro" || data.user.tier === "max";

  function startFocus() {
    if (!event) return;
    const selectedEvent = event;
    onClose();
    router.push(`/app/focus?eventId=${encodeURIComponent(selectedEvent.id)}`);
  }

  function openReschedule() {
    setEditing(true);
  }

  async function logMiss(reason?: MissReason, note = "") {
    if (!event) return;
    const selectedEvent = event;
    setSaving(true);
    setError(null);

    try {
      await api(`/api/events/${encodeURIComponent(selectedEvent.id)}/outcome`, {
        method: "POST",
        body: JSON.stringify(reason ? { outcome: "missed", missReason: reason, missNote: note } : { outcome: "missed" }),
      });
      patch((previous: DashboardResponse) => ({
        ...previous,
        events: previous.events.map((existing) =>
          existing.id === selectedEvent.id
            ? { ...existing, outcome: "missed", status: "missed", missReason: reason ?? null, missNote: note.trim() || null }
            : existing,
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
            <MissReasonPicker
              onSubmit={(reason, note) => void logMiss(reason, note)}
              onBack={() => setShowReasons(false)}
              loading={saving}
              error={error}
              submitLabel="Log missed session"
            />
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
              onClick={() => hasPaidPlan ? setShowReasons(true) : void logMiss()}
              className="mt-1 h-9 rounded-md text-[13px] font-medium"
              style={{ color: "var(--app-text-muted)" }}
            >
              {hasPaidPlan ? "Skip and log why" : "Mark missed"}
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
