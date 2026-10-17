"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { PlannerEvent } from "@/lib/api/types";
import { formatClock } from "@/lib/api/time";
import { useDashboardData } from "@/lib/app/DashboardProvider";
import { studyTitle, subjectColour } from "@/lib/app/subjectColour";
import { useSessionPlan } from "@/lib/app/useSessionPlan";
import SyllabusNudge from "./SyllabusNudge";

/**
 * The top of Today: the study session that's on now (or next), set up by
 * Arcad, with one button that takes you straight into it. Tapping it opens
 * Focus with the timer already running.
 */
export default function StartNowCard() {
  const { data } = useDashboardData();
  const timezone = data.profile?.timezone || data.user.timezone || "Australia/Brisbane";
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  const { target, isNow } = useMemo(() => pickSession(data.events, now, timezone), [data.events, now, timezone]);
  const { plan, loading } = useSessionPlan(target);

  if (!target) return null;

  const colour = subjectColour(data.subjects, target.subject);
  const minutes = Math.round((Date.parse(target.endAt) - Date.parse(target.startAt)) / 60000);
  const startsIn = Math.round((Date.parse(target.startAt) - now) / 60000);
  const when = isNow
    ? `Now · until ${formatClock(target.endAt, timezone)}`
    : startsIn <= 60
      ? `In ${Math.max(1, startsIn)} min · ${formatClock(target.startAt, timezone)}`
      : `Next · ${formatClock(target.startAt, timezone)}`;

  // The hero has its own colours (--app-hero*): deep sage by day, deep blue
  // with a starlight button by night.
  const on = "var(--app-hero-on)";
  const soft = "color-mix(in oklab, var(--app-hero-on) 72%, transparent)";
  const line = "color-mix(in oklab, var(--app-hero-on) 16%, transparent)";
  return (
    <section
      aria-label="Your next study session"
      className="mb-4 overflow-hidden rounded-[28px]"
      style={{ background: "var(--app-hero)", color: on, boxShadow: "inset 0 0 0 1px var(--app-border)" }}
    >
      <div className="min-w-0 p-6 sm:p-7">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-[13px] font-medium" style={{ color: soft }}>
            {isNow ? "On now" : "Up next"} · {when.replace(/^(Now|In|Next) · /, "").replace(/^In /, "in ")} · {minutes} min
          </span>
          <span
            className="rounded-full px-2.5 py-1 text-[12px] font-semibold"
            style={{ background: line, color: on }}
          >
            <span aria-hidden="true" className="mr-1.5 inline-block size-2 rounded-full align-middle" style={{ background: colour ?? soft }} />
            {target.subject ?? "Study"}
          </span>
        </div>

        {plan ? (
          <>
            <h2 className="mt-3 text-[26px] font-semibold leading-[1.1] tracking-[-0.02em] sm:text-[28px]">{plan.topic}</h2>
            {plan.why ? (
              <p className="mt-1.5 text-[14.5px]" style={{ color: soft }}>
                {plan.why}
              </p>
            ) : null}
            <ol className="mt-4 flex flex-col">
              {plan.steps.map((step, index) => (
                <li
                  key={index}
                  className="flex items-baseline gap-4 py-2 text-[14px]"
                  style={{ borderTop: `1px solid ${line}` }}
                >
                  <span className="min-w-0 flex-1">{step.text}</span>
                  <span className="shrink-0 tabular-nums text-[13px]" style={{ color: soft }}>
                    {step.minutes} min
                  </span>
                </li>
              ))}
            </ol>
            <SyllabusNudge plan={plan} />
          </>
        ) : (
          <div role="status">
            <h2 className="mt-3 text-[26px] font-semibold leading-[1.1] tracking-[-0.02em] sm:text-[28px]">{studyTitle(target)}</h2>
            <p className="mt-1.5 text-[14px]" style={{ color: soft }}>
              {loading ? "Arcad's setting this one up…" : "Arcad will set this up when you start."}
            </p>
          </div>
        )}

        <div className="mt-6 flex flex-wrap items-center gap-4">
          <Link
            href={`/app/sessions?eventId=${encodeURIComponent(target.id)}&start=1`}
            className="ui-press inline-flex h-12 items-center justify-center gap-2.5 rounded-full px-6 text-[16px] font-semibold transition-opacity hover:opacity-90"
            style={{ background: "var(--app-hero-cta)", color: "var(--app-hero-cta-on)" }}
          >
            <svg viewBox="0 0 20 20" width="14" height="14" fill="currentColor" aria-hidden="true">
              <path d="M6 4.5v11l9-5.5-9-5.5z" />
            </svg>
            {isNow ? (target.startedAt ? "Back to it" : "Start") : "Start early"}
          </Link>
          <Link
            href={`/app/sessions?eventId=${encodeURIComponent(target.id)}`}
            className="text-[14px] font-medium transition-opacity hover:opacity-80"
            style={{ color: soft }}
          >
            See the plan
          </Link>
        </div>
      </div>
    </section>
  );
}

/**
 * The session to put front and centre: one already started, else the one
 * on right now, else the next one today.
 */
export function pickSession(events: PlannerEvent[], now: number, timezone: string): { target: PlannerEvent | null; isNow: boolean } {
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(now);
  const open = events
    .filter(
      (event) =>
        event.category === "study" &&
        event.outcome === "planned" &&
        !event.checkout &&
        new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(Date.parse(event.startAt)) === day &&
        Date.parse(event.endAt) > now,
    )
    .sort((a, b) => Date.parse(a.startAt) - Date.parse(b.startAt));
  const started = open.find((event) => event.startedAt);
  if (started) return { target: started, isNow: true };
  const current = open.find((event) => Date.parse(event.startAt) <= now);
  if (current) return { target: current, isNow: true };
  return { target: open[0] ?? null, isNow: false };
}
