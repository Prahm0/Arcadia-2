"use client";

import Link from "next/link";
import { useMemo, useSyncExternalStore } from "react";
import type { PlannerEvent } from "@/lib/api/types";
import { dateKey, formatClock, formatDueSoon, formatMinutes } from "@/lib/api/time";
import { useDashboardData } from "@/lib/app/DashboardProvider";
import { subjectColour } from "@/lib/app/subjectColour";
import { useStreak } from "@/lib/app/useStreak";
import ActivityRings from "./ActivityRings";

const listeners = new Set<() => void>();
let clock = 0;
let timer: number | null = null;

function refreshClock() {
  clock = Date.now();
  listeners.forEach((listener) => listener());
}

function subscribeClock(listener: () => void) {
  listeners.add(listener);
  if (!timer) {
    timer = window.setInterval(refreshClock, 30_000);
    window.setTimeout(refreshClock, 0);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && timer) {
      window.clearInterval(timer);
      timer = null;
    }
  };
}

function useSidebarClock() {
  return useSyncExternalStore(subscribeClock, () => clock, () => 0);
}

function minutesBetween(startAt: string, endAt: string) {
  return Math.max(0, Math.round((Date.parse(endAt) - Date.parse(startAt)) / 60_000));
}

function nextStudyEvent(events: PlannerEvent[], now: number) {
  const upcoming = events
    .filter((event) => event.category === "study" && event.status !== "cancelled" && event.outcome !== "missed" && Date.parse(event.endAt) > now)
    .sort((a, b) => Date.parse(a.startAt) - Date.parse(b.startAt));
  const current = upcoming.find((event) => Boolean(event.startedAt) || Date.parse(event.startAt) <= now);
  return { event: current ?? upcoming[0] ?? null, isNow: Boolean(current) };
}

function compactCountdown(minutes: number) {
  if (minutes < 1) return "starting now";
  if (minutes < 60) return `in ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `in ${hours}h ${rest}m` : `in ${hours}h`;
}

/** A quiet dashboard for the space below the desktop and iPad navigation. */
export default function SidebarMomentum({ compact = false }: { compact?: boolean }) {
  const { data } = useDashboardData();
  const streak = useStreak();
  const now = useSidebarClock();
  const timezone = data.profile?.timezone || data.user.timezone || "Australia/Brisbane";

  const summary = useMemo(() => {
    if (!now) return null;
    const today = dateKey(new Date(now).toISOString(), timezone);
    const todayEvents = data.events.filter(
      (event) => event.category === "study" && event.status !== "cancelled" && dateKey(event.startAt, timezone) === today,
    );
    const planned = todayEvents.reduce((total, event) => total + minutesBetween(event.startAt, event.endAt), 0);
    const completed = todayEvents
      .filter((event) => event.outcome === "completed")
      .reduce((total, event) => total + minutesBetween(event.startAt, event.endAt), 0);
    const studied = Math.max(data.analytics.todayMinutes ?? 0, completed);
    const session = nextStudyEvent(data.events, now);
    const deadline = [...data.focusTasks]
      .filter((task) => task.status === "pending" && Date.parse(task.dueAt) >= now - 86_400_000)
      .sort((a, b) => Date.parse(a.dueAt) - Date.parse(b.dueAt))[0] ?? null;
    return { today, planned, studied, session, deadline };
  }, [data.analytics.todayMinutes, data.events, data.focusTasks, now, timezone]);

  if (!summary) return null;

  const activeDays = data.analytics.days ?? [];
  const ringRatio = summary.planned > 0 ? Math.min(1, summary.studied / summary.planned) : 0;
  const session = summary.session.event;
  const sessionColour = session ? (subjectColour(data.subjects, session.subject) ?? "var(--app-accent)") : "var(--app-accent)";
  const startAt = session ? Date.parse(session.startAt) : 0;
  const endAt = session ? Date.parse(session.endAt) : 0;
  const elapsed = session && summary.session.isNow ? Math.max(0, Math.min(1, (now - startAt) / Math.max(1, endAt - startAt))) : 0;

  if (compact) {
    return (
      <Link
        href="/app/progress"
        aria-label={`${formatMinutes(summary.studied)} studied today. ${streak.current} day streak.`}
        className="mt-3 flex flex-col items-center gap-1 rounded-lg py-1.5 ui-hover"
        style={{ color: "var(--app-text-muted)" }}
      >
        <div className="relative grid size-8 place-items-center">
          <ActivityRings
            rings={[{ key: "today", colour: "var(--app-accent)", ratio: ringRatio, label: "Today", value: formatMinutes(summary.studied), of: `of ${formatMinutes(summary.planned)}` }]}
            size={32}
            stroke={4}
            gap={0}
          />
          <span className="absolute text-[9px] font-semibold tabular-nums" style={{ color: "var(--app-text)" }}>
            {Math.round(ringRatio * 100)}
          </span>
        </div>
        <span className="text-[10px] font-semibold tabular-nums">🔥 {streak.current}</span>
      </Link>
    );
  }

  return (
    <section aria-label="Your study momentum" className="rounded-xl border p-3" style={{ background: "var(--app-surface)", borderColor: "var(--app-border)" }}>
      <Link href="/app/progress" className="group flex items-center gap-3 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-accent)]">
        <div className="relative grid size-[52px] shrink-0 place-items-center">
          <ActivityRings
            rings={[{ key: "today", colour: "var(--app-accent)", ratio: ringRatio, label: "Today", value: formatMinutes(summary.studied), of: `of ${formatMinutes(summary.planned)}` }]}
            size={52}
            stroke={6}
            gap={0}
          />
          <span className="absolute text-[10px] font-semibold tabular-nums" style={{ color: "var(--app-text)" }}>
            {formatMinutes(summary.studied)}
          </span>
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[12px] font-semibold" style={{ color: "var(--app-text)" }}>Today</p>
          <p className="mt-0.5 text-[11px] tabular-nums" style={{ color: "var(--app-text-muted)" }}>
            {summary.planned ? `${formatMinutes(summary.studied)} of ${formatMinutes(summary.planned)}` : "Start when you are ready"}
          </p>
          <div className="mt-2 flex items-center gap-1.5" aria-label={`${streak.current} day streak`}>
            <span className="text-[12px]" aria-hidden="true">🔥</span>
            <span className="text-[11px] font-semibold tabular-nums" style={{ color: "var(--app-text)" }}>{streak.current}</span>
            <div className="ml-1 flex gap-1">
              {activeDays.map((day) => {
                const isToday = day.date === summary.today;
                const active = day.minutes > 0;
                return <span key={day.date} title={`${day.date}: ${formatMinutes(day.minutes)}`} className="size-1.5 rounded-full" style={{ background: active ? "var(--app-gold)" : "var(--app-border-strong)", boxShadow: isToday ? "0 0 0 1px var(--app-accent)" : undefined }} />;
              })}
            </div>
          </div>
        </div>
      </Link>

      <div className="my-3 h-px" style={{ background: "var(--app-border)" }} />

      {session ? (
        <Link href={`/app/sessions?eventId=${encodeURIComponent(session.id)}&start=1`} className="block rounded-lg px-1 py-0.5 transition-colors hover:bg-[var(--app-surface-soft)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-accent)]">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-[0.08em]" style={{ color: "var(--app-text-muted)" }}>
              {summary.session.isNow ? "Now" : "Up next"}
            </span>
            <span className="truncate text-[11px] tabular-nums" style={{ color: "var(--app-text-muted)" }}>
              {summary.session.isNow ? `${Math.max(0, Math.ceil((endAt - now) / 60_000))} min left` : compactCountdown(Math.round((startAt - now) / 60_000))}
            </span>
          </div>
          <div className="mt-1.5 flex min-w-0 items-center gap-2">
            <span aria-hidden="true" className="size-2 shrink-0 rounded-full" style={{ background: sessionColour }} />
            <span className="truncate text-[12px] font-medium" style={{ color: "var(--app-text)" }}>{session.title}</span>
          </div>
          {summary.session.isNow ? (
            <div className="mt-2 h-1 overflow-hidden rounded-full" style={{ background: "var(--app-border)" }}>
              <div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${elapsed * 100}%`, background: sessionColour }} />
            </div>
          ) : (
            <p className="mt-1 pl-4 text-[11px]" style={{ color: "var(--app-text-muted)" }}>{formatClock(session.startAt, timezone)}</p>
          )}
        </Link>
      ) : (
        <div className="px-1 py-0.5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em]" style={{ color: "var(--app-text-muted)" }}>Up next</p>
          <p className="mt-1 text-[12px]" style={{ color: "var(--app-text-muted)" }}>No study blocks coming up</p>
        </div>
      )}

      {summary.deadline ? (
        <>
          <div className="my-3 h-px" style={{ background: "var(--app-border)" }} />
          <Link href="/app/priorities" className="block rounded-lg px-1 py-0.5 transition-colors hover:bg-[var(--app-surface-soft)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-accent)]">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-semibold uppercase tracking-[0.08em]" style={{ color: "var(--app-text-muted)" }}>Due soon</span>
              <span className="shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium" style={{ background: "var(--app-accent-soft)", color: "var(--app-accent-strong)" }}>{formatDueSoon(summary.deadline.dueAt, timezone)}</span>
            </div>
            <p className="mt-1 truncate text-[12px] font-medium" style={{ color: "var(--app-text)" }}>{summary.deadline.title}</p>
          </Link>
        </>
      ) : null}
    </section>
  );
}
