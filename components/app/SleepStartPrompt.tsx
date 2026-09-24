"use client";

import { useEffect, useRef, useState } from "react";
import { useDashboardData } from "@/lib/app/DashboardProvider";
import { isGuestEmail } from "@/lib/auth/guest";
import AppButton from "./AppButton";

const CHECK_INTERVAL_MS = 15_000;
const START_WINDOW_MS = 60_000;
const DISPLAY_MS = 5 * 60_000;
const SHOWN_PREFIX = "arcadia:sleep-start:shown:";

/** A quiet, once-per-night prompt when the calendar's sleep block begins. */
export default function SleepStartPrompt({ blocked }: { blocked: boolean }) {
  const { data } = useDashboardData();
  const [shown, setShown] = useState<{ id: string; expiresAt: number } | null>(null);
  const shownThisVisit = useRef(new Set<string>());
  const isGuest = isGuestEmail(data.user.email);

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

  if (blocked || !shown || !data.events.some((event) => event.id === shown.id && event.outcome === "planned")) return null;

  return (
    <section
      role="status"
      className="fixed bottom-24 right-4 z-[65] w-[calc(100%-2rem)] max-w-sm rounded-xl p-5 lg:bottom-6 lg:right-6"
      style={{ background: "var(--app-elev)", boxShadow: "var(--elev-3)", color: "var(--app-text)" }}
    >
      <p className="type-eyebrow" style={{ color: "var(--app-accent-strong)" }}>Sleep reminder</p>
      <h2 className="mt-2 text-[19px] font-medium tracking-[-0.02em]">Time to wind down</h2>
      <p className="mt-2 text-[13.5px] leading-5" style={{ color: "var(--app-text-muted)" }}>
        Your sleep block has started. Rest helps you recharge for tomorrow.
      </p>
      <div className="mt-4 flex justify-end">
        <AppButton type="button" variant="secondary" onClick={() => setShown(null)}>Got it</AppButton>
      </div>
    </section>
  );
}
