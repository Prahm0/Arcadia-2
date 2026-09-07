"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api/client";
import { useDashboardData } from "@/lib/app/DashboardProvider";
import type { DashboardResponse, PlannerEvent } from "@/lib/api/types";
import { formatClock } from "@/lib/api/time";
import AppButton from "./AppButton";

const STORAGE_PREFIX = "arcadia:missed:snoozed:";
/** Only surface blocks that ended in the last 24 hours. Older ones belong in a weekly review. */
const RECENT_WINDOW_MS = 24 * 60 * 60 * 1000;
/** Give a block a small grace period past its end time before we ask about it. */
const GRACE_MS = 2 * 60 * 1000;

interface RecoveryState {
  eventId: string;
  step: "ask" | "why" | "resolved";
  resolution: "done" | "missed" | null;
  saving: boolean;
  error: string | null;
}

/**
 * Zero or more "did you get to it?" cards for study blocks that ended in the
 * last 24h and are still marked planned. Cards appear at the top of the Arcad
 * chat surface — this is what the plan calls "Arcad DM-ing you" without the
 * dishonesty of injecting a fake AI message.
 */
export default function MissedRecoveryCards() {
  const { data, patch, reload } = useDashboardData();
  const timezone = data.profile?.timezone || data.user.timezone || "Australia/Sydney";
  const [states, setStates] = useState<Record<string, RecoveryState>>({});
  const [snoozed, setSnoozed] = useState<Set<string>>(() => new Set());

  const candidates = useMemo(() => findRecoveryCandidates(data.events), [data.events]);
  const visible = candidates.filter((event) => !snoozed.has(event.id));

  // Hydrate per-event snoozes from localStorage on mount. Snoozes are per-event
  // (not per-day) so a truly forgotten missed block keeps nagging tomorrow.
  useEffect(() => {
    const next = new Set<string>();
    for (const event of candidates) {
      try {
        if (window.localStorage.getItem(`${STORAGE_PREFIX}${event.id}`) === "1") {
          next.add(event.id);
        }
      } catch {
        /* ignore */
      }
    }
    setSnoozed(next);
  }, [candidates]);

  function snooze(eventId: string) {
    setSnoozed((prev) => new Set(prev).add(eventId));
    try {
      window.localStorage.setItem(`${STORAGE_PREFIX}${eventId}`, "1");
    } catch {
      /* ignore */
    }
  }

  function setState(eventId: string, partial: Partial<RecoveryState>) {
    setStates((prev) => {
      const base: RecoveryState = prev[eventId] ?? {
        eventId,
        step: "ask",
        resolution: null,
        saving: false,
        error: null,
      };
      return { ...prev, [eventId]: { ...base, ...partial } };
    });
  }

  async function respond(event: PlannerEvent, outcome: "completed" | "missed") {
    setState(event.id, { saving: true, error: null });
    // Optimistic
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
      setState(event.id, {
        saving: false,
        step: outcome === "missed" ? "why" : "resolved",
        resolution: outcome === "completed" ? "done" : "missed",
      });
    } catch (err) {
      // Roll back
      patch((prev: DashboardResponse) => ({
        ...prev,
        events: prev.events.map((existing) =>
          existing.id === event.id
            ? { ...existing, outcome: "planned", status: "planned" }
            : existing,
        ),
      }));
      setState(event.id, {
        saving: false,
        error: err instanceof Error ? err.message : "Couldn't save.",
      });
    }
  }

  if (visible.length === 0) return null;

  return (
    <div className="flex flex-col gap-2">
      {visible.map((event) => {
        const state: RecoveryState = states[event.id] ?? {
          eventId: event.id,
          step: "ask",
          resolution: null,
          saving: false,
          error: null,
        };
        const startClock = formatClock(event.startAt, timezone);
        const endClock = formatClock(event.endAt, timezone);
        const subject = event.subject || "Study";

        return (
          <div
            key={event.id}
            className="rounded-[14px] p-4"
            style={{
              background: "var(--app-accent-soft)",
              border: "1px solid color-mix(in oklab, var(--app-accent) 30%, var(--app-border))",
            }}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="type-eyebrow" style={{ color: "var(--app-accent-strong)" }}>
                  Arcad · Missed check-in
                </p>
                {state.step === "ask" ? (
                  <p className="mt-1.5 text-[14.5px] leading-snug" style={{ color: "var(--app-text)" }}>
                    <span className="font-medium">{subject}</span> at{" "}
                    <span className="font-mono">{startClock}–{endClock}</span> — did you get to it?
                  </p>
                ) : state.step === "why" ? (
                  <p className="mt-1.5 text-[14.5px] leading-snug" style={{ color: "var(--app-text)" }}>
                    Marked missed. The plan's re-checked around it. What got in the way?
                  </p>
                ) : (
                  <p className="mt-1.5 text-[14.5px] leading-snug" style={{ color: "var(--app-text)" }}>
                    Locked in. That's on the streak.
                  </p>
                )}
              </div>
              {state.step !== "resolved" ? (
                <button
                  type="button"
                  onClick={() => snooze(event.id)}
                  aria-label="Snooze this check-in"
                  className="shrink-0 rounded-full px-2 py-1 text-[11px] font-medium"
                  style={{ color: "var(--app-text-muted)" }}
                >
                  Later
                </button>
              ) : null}
            </div>

            {state.error ? (
              <p className="mt-2 text-[12.5px]" style={{ color: "var(--app-danger)" }}>
                {state.error}
              </p>
            ) : null}

            <div className="mt-3 flex flex-wrap items-center gap-2">
              {state.step === "ask" ? (
                <>
                  <AppButton
                    type="button"
                    variant="primary"
                    loading={state.saving && state.resolution === "done"}
                    onClick={() => respond(event, "completed")}
                  >
                    Yes, done
                  </AppButton>
                  <AppButton
                    type="button"
                    variant="secondary"
                    loading={state.saving && state.resolution === "missed"}
                    onClick={() => respond(event, "missed")}
                  >
                    No, didn't
                  </AppButton>
                </>
              ) : state.step === "why" ? (
                <>
                  {REASONS.map((reason) => (
                    <button
                      key={reason}
                      type="button"
                      onClick={() => {
                        // Reasons are logged locally for now — the outcome endpoint
                        // doesn't accept them yet. Backend enhancement later.
                        try {
                          window.localStorage.setItem(
                            `${STORAGE_PREFIX}reason:${event.id}`,
                            reason,
                          );
                        } catch {
                          /* ignore */
                        }
                        setState(event.id, { step: "resolved" });
                        snooze(event.id);
                      }}
                      className="rounded-full px-3 py-1.5 text-[12.5px] font-medium"
                      style={{
                        border: "1px solid var(--app-border-strong)",
                        color: "var(--app-text)",
                        background: "transparent",
                      }}
                    >
                      {reason}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => {
                      setState(event.id, { step: "resolved" });
                      snooze(event.id);
                    }}
                    className="ml-1 text-[12.5px] underline underline-offset-4"
                    style={{ color: "var(--app-text-muted)" }}
                  >
                    Skip
                  </button>
                </>
              ) : (
                <>
                  <Link
                    href="/app/schedule"
                    className="text-[12.5px] font-medium underline underline-offset-4"
                    style={{ color: "var(--app-accent-strong)" }}
                    onClick={() => snooze(event.id)}
                  >
                    Open Schedule
                  </Link>
                  <button
                    type="button"
                    onClick={() => snooze(event.id)}
                    className="text-[12.5px] font-medium"
                    style={{ color: "var(--app-text-muted)" }}
                  >
                    Dismiss
                  </button>
                </>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

const REASONS = [
  "Wasn't ready",
  "Got interrupted",
  "Ran out of time",
  "Something else",
] as const;

function findRecoveryCandidates(events: PlannerEvent[]): PlannerEvent[] {
  const nowMs = Date.now();
  return events
    .filter((event) => event.category === "study")
    .filter((event) => event.outcome === "planned")
    .filter((event) => {
      const endMs = Date.parse(event.endAt);
      return endMs + GRACE_MS <= nowMs && nowMs - endMs <= RECENT_WINDOW_MS;
    })
    .sort((a, b) => Date.parse(a.endAt) - Date.parse(b.endAt));
}
