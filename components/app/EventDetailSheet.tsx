"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/api/client";
import { useDashboardData } from "@/lib/app/DashboardProvider";
import type { DashboardResponse, MissReason, PlannerEvent } from "@/lib/api/types";
import { formatClock, formatDurationMinutes, formatFriendlyDate } from "@/lib/api/time";
import { playCompletionTick } from "@/lib/app/completion";
import AppButton from "./AppButton";
import MissReasonPicker from "./MissReasonPicker";

interface EventDetailSheetProps {
  event: PlannerEvent | null;
  timezone: string;
  initialMode?: "details" | "reschedule" | "miss-reason";
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

export default function EventDetailSheet({
  event,
  timezone,
  initialMode = "details",
  onClose,
}: EventDetailSheetProps) {
  const { data, patch, reload } = useDashboardData();
  const [busy, setBusy] = useState<"complete" | "miss" | "delete" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rescheduling, setRescheduling] = useState(initialMode === "reschedule");
  const [reasoning, setReasoning] = useState(false);
  const [draftStart, setDraftStart] = useState("");
  const [draftEnd, setDraftEnd] = useState("");
  const [savingReschedule, setSavingReschedule] = useState(false);
  const [savingSleepDelay, setSavingSleepDelay] = useState(false);
  const [confirmedSleepEvent, setConfirmedSleepEvent] = useState<PlannerEvent | null>(null);

  useEffect(() => {
    if (!event) return;
    const listener = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, [event, onClose]);

  useEffect(() => {
    if (!event) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setError(null);
    setRescheduling(initialMode === "reschedule");
    setReasoning(
      event.category === "study" && initialMode === "miss-reason" && (data.user.tier === "pro" || data.user.tier === "max"),
    );
    setDraftStart(toZonedDateTimeInput(event.startAt, timezone));
    setDraftEnd(toZonedDateTimeInput(event.endAt, timezone));
  }, [event, initialMode, timezone, data.user.tier]);

  if (!event) return null;

  const displayedEvent = event.category === "sleep" && confirmedSleepEvent?.id === event.id ? confirmedSleepEvent : event;
  const linkedTask = event.taskId ? data.tasks.find((task) => task.id === event.taskId) : null;
  const minutes = Math.round((Date.parse(displayedEvent.endAt) - Date.parse(displayedEvent.startAt)) / 60000);
  const isCompleted = event.outcome === "completed";
  const isMissed = event.outcome === "missed";
  const canAct = !isCompleted && !isMissed;
  const isStudy = event.category === "study";
  const isSleep = event.category === "sleep";
  const sleepPast = isSleep && Date.parse(displayedEvent.endAt) <= Date.now();
  const sleepStarted = isSleep && Date.parse(displayedEvent.startAt) <= Date.now() && !sleepPast;
  const isEditable = event.editable !== false;
  const canReschedule = !isSleep && isEditable && canAct;
  const canAdjustSleep = isSleep && canAct && !sleepPast && (event.source === "sleep" || isEditable);
  const hasPaidPlan = data.user.tier === "pro" || data.user.tier === "max";
  const canCaptureMissReason = isStudy && hasPaidPlan;

  async function markOutcome(outcome: "completed" | "missed", missReason?: MissReason, missNote = "") {
    if (!event) return;
    setBusy(outcome === "completed" ? "complete" : "miss");
    setError(null);
    if (outcome === "completed") playCompletionTick();
    const previousOutcome = event.outcome;
    const previousMissReason = event.missReason ?? null;
    const previousMissNote = event.missNote ?? null;
    // Optimistic update
    patch((prev: DashboardResponse) => ({
      ...prev,
      events: prev.events.map((existing) =>
        existing.id === event.id
          ? {
              ...existing,
              outcome,
              status: outcome === "completed" ? "completed" : "missed",
              missReason: outcome === "missed" ? missReason ?? existing.missReason ?? null : null,
              missNote: outcome === "missed" ? missNote.trim() || null : null,
            }
          : existing,
      ),
    }));
    try {
      await api(`/api/events/${encodeURIComponent(event.id)}/outcome`, {
        method: "POST",
        body: JSON.stringify(
          missReason ? { outcome, missReason, missNote } : { outcome },
        ),
      });
      await reload();
      onClose();
    } catch (err) {
      patch((prev: DashboardResponse) => ({
        ...prev,
        events: prev.events.map((existing) =>
          existing.id === event.id
            ? {
                ...existing,
                outcome: previousOutcome,
                status: previousOutcome,
                missReason: previousMissReason,
                missNote: previousMissNote,
              }
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

  async function saveReschedule() {
    if (!event) return;
    const selectedEvent = event;
    const nextStart = parseZonedDateTimeInput(draftStart, timezone);
    if (!nextStart) {
      setError("Choose a valid new time.");
      return;
    }
    const duration = Date.parse(selectedEvent.endAt) - Date.parse(selectedEvent.startAt);
    const nextEnd = new Date(Date.parse(nextStart) + duration).toISOString();
    const previousStart = selectedEvent.startAt;
    const previousEnd = selectedEvent.endAt;
    setSavingReschedule(true);
    setError(null);
    patch((prev: DashboardResponse) => ({
      ...prev,
      events: prev.events.map((existing) =>
        existing.id === selectedEvent.id ? { ...existing, startAt: nextStart, endAt: nextEnd } : existing,
      ),
    }));
    try {
      await api(`/api/events/${encodeURIComponent(selectedEvent.id)}`, {
        method: "PATCH",
        body: JSON.stringify({ startAt: nextStart, endAt: nextEnd }),
      });
      await reload();
      onClose();
    } catch (err) {
      patch((prev: DashboardResponse) => ({
        ...prev,
        events: prev.events.map((existing) =>
          existing.id === selectedEvent.id ? { ...existing, startAt: previousStart, endAt: previousEnd } : existing,
        ),
      }));
      setError(err instanceof Error ? err.message : "Couldn't reschedule this session.");
    } finally {
      setSavingReschedule(false);
    }
  }

  async function saveSleepTime() {
    if (!event || !canAdjustSleep) return;
    const nextStart = parseZonedDateTimeInput(draftStart, timezone);
    const nextEnd = parseZonedDateTimeInput(draftEnd, timezone);
    if (!nextStart || !nextEnd || Date.parse(nextEnd) <= Date.parse(nextStart) || Date.parse(nextEnd) <= Date.now()) {
      setError("Choose a valid bedtime and wake-up time for this night.");
      return;
    }
    setSavingReschedule(true);
    setError(null);
    try {
      const response = await api<{ event: PlannerEvent }>(`/api/events/${encodeURIComponent(event.id)}/sleep-time`, {
        method: "PATCH",
        body: JSON.stringify({ startAt: nextStart, endAt: nextEnd }),
      });
      setConfirmedSleepEvent(response.event);
      patch((previous) => ({
        ...previous,
        events: previous.events.map((candidate) => candidate.id === event.id ? response.event : candidate),
      }));
      try {
        window.localStorage.removeItem(`arcadia:sleep-start:shown:${event.id}`);
      } catch {
        /* The time still saves if this browser blocks local storage. */
      }
      await reload().catch(() => {});
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't adjust this sleep block.");
    } finally {
      setSavingReschedule(false);
    }
  }

  async function delaySleep(minutes: 15 | 30 | 60) {
    if (!event || !canAdjustSleep || event.source !== "sleep" || savingSleepDelay) return;
    setSavingSleepDelay(true);
    setError(null);
    try {
      const response = await api<{ event: PlannerEvent }>(`/api/events/${encodeURIComponent(event.id)}/snooze`, {
        method: "POST",
        body: JSON.stringify({ minutes }),
      });
      setConfirmedSleepEvent(response.event);
      setDraftStart(toZonedDateTimeInput(response.event.startAt, timezone));
      setDraftEnd(toZonedDateTimeInput(response.event.endAt, timezone));
      patch((previous) => ({
        ...previous,
        events: previous.events.map((candidate) => candidate.id === event.id ? response.event : candidate),
      }));
      try {
        window.localStorage.removeItem(`arcadia:sleep-start:shown:${event.id}`);
      } catch {
        /* The new time still saves if this browser blocks local storage. */
      }
      await reload().catch(() => {});
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't delay this sleep block.");
    } finally {
      setSavingSleepDelay(false);
    }
  }

  const stateChip =
    isSleep
      ? sleepPast
        ? { label: "Past sleep block", tone: "muted" as const }
        : sleepStarted
          ? { label: "Happening now", tone: "accent" as const }
          : { label: "Scheduled", tone: "accent" as const }
      : event.outcome === "completed"
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
        className="relative w-full max-w-[480px] rounded-t-xl p-6 sm:rounded-lg"
        style={{
          background: "var(--app-elev)", boxShadow: "var(--elev-3)",
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
                className="rounded-md px-1.5 py-0.5 text-[10.5px] font-medium"
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
              {event.source === "google" ? (
                <span
                  className="rounded-md px-1.5 py-0.5 text-[10.5px] font-medium"
                  style={{
                    background: "var(--app-surface-soft)",
                    color: "var(--app-text-muted)",
                    border: "1px solid var(--app-border)",
                  }}
                >
                  Google · read-only
                </span>
              ) : null}
            </div>
            <h2
              id="event-detail-title"
              className="mt-1 text-[22px] font-medium tracking-[-0.015em]"
            >
              {event.title}
            </h2>
            {isSleep ? (
              <p className="mt-0.5 text-[13.5px]" style={{ color: "var(--app-text-muted)" }}>
                {formatFriendlyDate(displayedEvent.startAt, timezone)}
              </p>
            ) : null}
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
            className="grid h-8 w-8 place-items-center rounded-md transition-colors ui-hover"
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
              {formatClock(displayedEvent.startAt, timezone)}–{formatClock(displayEvent.endAt, timezone)}
            </dd>
          </div>
          <div>
            <dt className="type-eyebrow" style={{ color: "var(--app-text-muted)" }}>Length</dt>
            <dd className="type-mono-label mt-1.5" aria-live={isSleep ? "polite" : undefined} style={{ color: "var(--app-text)" }}>
              {isSleep ? formatDurationMinutes(minutes) : `${minutes} min`}
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

        {isSleep ? (
          <p className="mt-4 text-[13px] leading-5" style={{ color: "var(--app-text-muted)" }}>
            {sleepPast
              ? "This was the sleep time on your schedule. Arcadia doesn't track whether you slept."
              : "Adjust this night without changing your usual bedtime."}
          </p>
        ) : null}

        {error ? (
          <p className="mt-4 text-[13px]" style={{ color: "var(--app-danger)" }}>
            {error}
          </p>
        ) : null}

        {rescheduling && (!isSleep || canAdjustSleep) ? (
          <div
            className="mt-5 rounded-md p-4"
            style={{ background: "var(--app-surface-soft)", boxShadow: "var(--elev-inset)" }}
          >
            <label className="block text-[13px] font-medium" htmlFor="reschedule-start">
              {isSleep ? "Bedtime for this night" : "New start time"}
            </label>
            <input
              id="reschedule-start"
              type="datetime-local"
              value={draftStart}
              onChange={(input) => setDraftStart(input.target.value)}
              className="mt-2 h-9 w-full rounded-md px-3 text-[13px] outline-none"
              style={{ background: "var(--app-elev)", color: "var(--app-text)", border: "1px solid var(--app-border-strong)" }}
            />
            {isSleep ? (
              <>
                <label className="mt-4 block text-[13px] font-medium" htmlFor="reschedule-end">
                  Wake-up time for this night
                </label>
                <input
                  id="reschedule-end"
                  type="datetime-local"
                  value={draftEnd}
                  onChange={(input) => setDraftEnd(input.target.value)}
                  className="mt-2 h-9 w-full rounded-md px-3 text-[13px] outline-none"
                  style={{ background: "var(--app-elev)", color: "var(--app-text)", border: "1px solid var(--app-border-strong)" }}
                />
              </>
            ) : null}
            <p className="mt-2 text-[12px]" style={{ color: "var(--app-text-muted)" }}>
              {isSleep
                ? "Only this night changes. Your usual bedtime and wake-up time stay the same."
                : "The session keeps its current length and is pinned at the new time."}
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <AppButton type="button" variant="ghost" onClick={() => setRescheduling(false)} disabled={savingReschedule}>
                Cancel
              </AppButton>
              <AppButton type="button" variant="primary" onClick={() => void (isSleep ? saveSleepTime() : saveReschedule())} loading={savingReschedule}>
                {isSleep ? "Save this night" : "Save time"}
              </AppButton>
            </div>
          </div>
        ) : null}

        {reasoning ? (
          <div
            className="mt-5 rounded-md p-4"
            style={{ background: "var(--app-surface-soft)", boxShadow: "var(--elev-inset)" }}
          >
            <MissReasonPicker
              onSubmit={(reason, note) => void markOutcome("missed", reason, note)}
              onBack={() => setReasoning(false)}
              loading={busy === "miss"}
              error={error}
              submitLabel="Log missed session"
            />
          </div>
        ) : null}

        {canAdjustSleep && event.source === "sleep" && !rescheduling ? (
          <div className="mt-5">
            <p className="mb-2 text-[13px] font-medium">Delay this night</p>
            <div className="flex flex-wrap gap-2">
              {([15, 30, 60] as const).map((delay) => (
                <AppButton
                  key={delay}
                  type="button"
                  variant="secondary"
                  disabled={savingSleepDelay}
                  loading={savingSleepDelay}
                  onClick={() => void delaySleep(delay)}
                >
                  +{delay} min
                </AppButton>
              ))}
            </div>
          </div>
        ) : null}

        <div className="mt-6 flex flex-wrap items-center justify-between gap-2">
          {isSleep ? (
            <Link href="/app/profile#routine" onClick={onClose} className="text-[13px] underline underline-offset-4" style={{ color: "var(--app-text-muted)" }}>
              Edit usual sleep schedule
            </Link>
          ) : (
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
          )}
          <div className="flex items-center gap-2">
            {isSleep && !rescheduling ? (
              <AppButton type="button" variant="secondary" onClick={onClose}>Close</AppButton>
            ) : null}
            {isSleep && canAdjustSleep && !rescheduling ? (
              <AppButton type="button" variant="primary" disabled={savingSleepDelay} onClick={() => setRescheduling(true)}>
                Adjust this night
              </AppButton>
            ) : null}
            {canReschedule && !rescheduling && !reasoning ? (
              <AppButton type="button" variant="secondary" onClick={() => setRescheduling(true)}>
                Reschedule
              </AppButton>
            ) : null}
            {isStudy && canAct && !rescheduling && !reasoning ? (
              <Link href={`/app/focus?eventId=${encodeURIComponent(event.id)}`} onClick={onClose}>
                <AppButton type="button" variant="secondary">
                  Start focus
                </AppButton>
              </Link>
            ) : null}
            {!isSleep && canAct && !rescheduling && !reasoning ? (
              <>
                <AppButton
                  type="button"
                  variant="ghost"
                  onClick={() => canCaptureMissReason ? setReasoning(true) : void markOutcome("missed")}
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
            {isMissed && canCaptureMissReason && !event.missReason && !reasoning ? (
              <AppButton type="button" variant="secondary" onClick={() => setReasoning(true)}>
                Add reason
              </AppButton>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

function zonedParts(iso: string, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(iso));
  return Object.fromEntries(parts.map((part) => [part.type, part.value]));
}

function toZonedDateTimeInput(iso: string, timezone: string): string {
  const parts = zonedParts(iso, timezone);
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

function parseZonedDateTimeInput(value: string, timezone: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;
  const [, year, month, day, hour, minute] = match;
  const desired = Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute));
  if (!Number.isFinite(desired)) return null;

  let timestamp = desired;
  // Repeating handles offsets on either side of a daylight-saving change.
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const parts = zonedParts(new Date(timestamp).toISOString(), timezone);
    const actual = Date.UTC(
      Number(parts.year),
      Number(parts.month) - 1,
      Number(parts.day),
      Number(parts.hour),
      Number(parts.minute),
    );
    timestamp += desired - actual;
  }
  return new Date(timestamp).toISOString();
}
