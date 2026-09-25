"use client";

import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api/client";
import { formatClock } from "@/lib/api/time";
import type { DashboardResponse, PlannerEvent } from "@/lib/api/types";
import { useDashboardData } from "@/lib/app/DashboardProvider";
import { isGuestEmail } from "@/lib/auth/guest";
import AppButton from "./AppButton";

const CHECK_INTERVAL_MS = 15_000;
const START_WINDOW_MS = 60_000;
const DISPLAY_MS = 5 * 60_000;
const SHOWN_PREFIX = "arcadia:sleep-start:shown:";

/** A centered, dismissible prompt when the calendar's sleep block begins. */
export default function SleepStartPrompt({ blocked }: { blocked: boolean }) {
  const { data, patch, reload } = useDashboardData();
  const [shown, setShown] = useState<{ id: string; expiresAt: number } | null>(null);
  const [delayError, setDelayError] = useState<string | null>(null);
  const [savingDelay, setSavingDelay] = useState(false);
  const shownThisVisit = useRef(new Set<string>());
  const isGuest = isGuestEmail(data.user.email);
  const timezone = data.profile?.timezone || data.user.timezone || "Australia/Sydney";
  const event = shown ? data.events.find((candidate) => candidate.id === shown.id) ?? null : null;

  async function delayTonight(minutes: 15 | 30 | 60) {
    if (!event || savingDelay) return;
    const selectedEvent = event;
    const previousStart = selectedEvent.startAt;
    const previousEnd = selectedEvent.endAt;
    const previousPinned = selectedEvent.pinned;
    const nextStart = new Date(Date.parse(previousStart) + minutes * 60_000).toISOString();
    const nextEnd = new Date(Date.parse(previousEnd) + minutes * 60_000).toISOString();
    setSavingDelay(true);
    setDelayError(null);
    patch((previous: DashboardResponse) => ({
      ...previous,
      events: previous.events.map((candidate) => candidate.id === selectedEvent.id
        ? { ...candidate, startAt: nextStart, endAt: nextEnd, pinned: true }
        : candidate),
    }));
    try {
      await api<{ event: PlannerEvent }>(`/api/events/${encodeURIComponent(selectedEvent.id)}/snooze`, {
        method: "POST",
        body: JSON.stringify({ minutes }),
      });
      await reload();
      // The snoozed time is a new opportunity to remind, including if the
      // student uses another +15/+30/+60 choice before dismissing this card.
      shownThisVisit.current.delete(selectedEvent.id);
      try {
        window.localStorage.removeItem(`${SHOWN_PREFIX}${selectedEvent.id}`);
      } catch {
        /* The in-memory marker is enough for this visit. */
      }
      setShown({ id: selectedEvent.id, expiresAt: Date.now() + DISPLAY_MS });
    } catch (error) {
      patch((previous: DashboardResponse) => ({
        ...previous,
        events: previous.events.map((candidate) => candidate.id === selectedEvent.id
          ? { ...candidate, startAt: previousStart, endAt: previousEnd, pinned: previousPinned }
          : candidate),
      }));
      setDelayError(error instanceof Error ? error.message : "Couldn't delay tonight's sleep block.");
    } finally {
      setSavingDelay(false);
    }
  }

  useEffect(() => {
    if (isGuest || blocked) return;

    function check() {
      if (document.visibilityState === "hidden" || shown) return;
      const now = Date.now();
      const next = data.events
        .filter((event) => event.category === "sleep" && event.outcome === "planned")
        .filter((event) => {
          const start = Date.parse(event.startAt);
          return start <= now && now - start <= START_WINDOW_MS;
        })
        .sort((a, b) => Date.parse(a.startAt) - Date.parse(b.startAt))
        .find((event) => {
          if (shownThisVisit.current.has(event.id)) return false;
          try {
            return window.localStorage.getItem(`${SHOWN_PREFIX}${event.id}`) !== "1";
          } catch {
            return true;
          }
        });
      if (!next) return;

      shownThisVisit.current.add(next.id);
      try {
        window.localStorage.setItem(`${SHOWN_PREFIX}${next.id}`, "1");
      } catch {
        /* Keep the in-memory marker if storage is unavailable. */
      }
      setShown({ id: next.id, expiresAt: Date.parse(next.startAt) + DISPLAY_MS });
    }

    check();
    const interval = window.setInterval(check, CHECK_INTERVAL_MS);
    document.addEventListener("visibilitychange", check);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", check);
    };
  }, [blocked, data.events, isGuest, shown]);

  useEffect(() => {
    if (!shown) return;
    const timer = window.setTimeout(() => setShown(null), Math.max(0, shown.expiresAt - Date.now()));
    const dismissIfStale = () => {
      if (document.visibilityState === "visible" && Date.now() >= shown.expiresAt) setShown(null);
    };
    document.addEventListener("visibilitychange", dismissIfStale);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", dismissIfStale);
    };
  }, [shown]);

  if (blocked || !shown || !event || event.outcome !== "planned") return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center p-0 sm:items-center sm:p-6">
      <div
        aria-hidden="true"
        className="absolute inset-0 cursor-default"
        style={{ background: "color-mix(in oklab, black 52%, transparent)" }}
        onClick={() => { if (!savingDelay) setShown(null); }}
      />
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="sleep-start-title"
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
        <p className="mt-5 type-eyebrow" style={{ color: "var(--app-accent-strong)" }}>Sleep reminder</p>
        <h2 id="sleep-start-title" className="mt-1.5 text-[24px] font-medium tracking-[-0.02em]">
          Time to wind down
        </h2>
        <p className="mt-2 text-[14px] leading-6" style={{ color: "var(--app-text-muted)" }}>
          Your sleep block has started. Rest helps you recharge for tomorrow.
        </p>
        <p className="mt-3 text-[13.5px] font-medium">
          Tonight&apos;s sleep starts at {formatClock(event.startAt, timezone)}.
        </p>
        <div className="mt-6">
          <p className="mb-2 text-[13px] font-medium">Need a little more time?</p>
          <div className="flex flex-wrap gap-2">
            {([15, 30, 60] as const).map((minutes) => (
              <AppButton
                key={minutes}
                type="button"
                variant="secondary"
                loading={savingDelay}
                disabled={savingDelay}
                onClick={() => void delayTonight(minutes)}
              >
                +{minutes} min
              </AppButton>
            ))}
          </div>
          {delayError ? <p role="alert" className="mt-2 text-[13px]" style={{ color: "var(--app-danger)" }}>{delayError}</p> : null}
        </div>
        <div className="mt-5 flex justify-end">
          <AppButton type="button" variant="primary" disabled={savingDelay} onClick={() => setShown(null)}>Got it</AppButton>
        </div>
      </section>
    </div>
  );
}
