"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { PlannerEvent } from "@/lib/api/types";
import { formatClock } from "@/lib/api/time";
import { useDashboardData } from "@/lib/app/DashboardProvider";
import { studyTitle, subjectColour } from "@/lib/app/subjectColour";
import { useSessionPlan } from "@/lib/app/useSessionPlan";
import { SubjectTag } from "./cards/shared";
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

  return (
    <section
      aria-label="Your next study session"
      className="mb-8 overflow-hidden rounded-xl"
      style={{ background: "var(--app-surface)", boxShadow: "var(--elev-1)" }}
    >
      <div>
        <div className="min-w-0 p-6 sm:p-7">
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px]" style={{ color: "var(--app-text-muted)" }}>
            <SubjectTag subject={{ name: target.subject ?? "Study", colour: colour ?? "" }} />
            <span className="ml-1">{when}</span>
            <span aria-hidden="true">·</span>
            <span className="tabular-nums">{minutes} min</span>
          </p>

          {plan ? (
            <>
              <h2 className="mt-4 text-[28px] font-semibold leading-[1.1] tracking-[-0.025em]" style={{ color: "var(--app-text)" }}>
                {plan.topic}
              </h2>
              {plan.why ? (
                <p className="mt-1.5 text-[15px]" style={{ color: "var(--app-text-muted)" }}>
                  {plan.why}
                </p>
              ) : null}
              <ol className="mt-5 flex flex-col">
                {plan.steps.map((step, index) => (
                  <li
                    key={index}
                    className="flex items-baseline gap-4 border-t py-2.5 text-[14px]"
                    style={{ borderColor: "var(--app-border)" }}
                  >
                    <span style={{ color: "var(--app-text)" }} className="min-w-0 flex-1">{step.text}</span>
                    <span className="shrink-0 tabular-nums text-[13px]" style={{ color: "var(--app-text-muted)" }}>
                      {step.minutes} min
                    </span>
                  </li>
                ))}
              </ol>
              <SyllabusNudge plan={plan} />
            </>
          ) : (
            <div className="mt-2" role="status">
              <h2 className="mt-2 text-[28px] font-semibold leading-[1.1] tracking-[-0.025em]" style={{ color: "var(--app-text)" }}>
                {studyTitle(target)}
              </h2>
              <p className="mt-1 text-[14px]" style={{ color: "var(--app-text-muted)" }}>
                {loading ? "Arcad's setting this one up…" : "Arcad will set this up when you start."}
              </p>
            </div>
          )}

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <Link
              href={`/app/sessions?eventId=${encodeURIComponent(target.id)}&start=1`}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-md px-5 text-[14px] font-medium transition-colors hover:bg-[var(--app-accent-strong)]"
              style={{ background: "var(--app-accent)", color: "var(--app-accent-on)" }}
            >
              <svg viewBox="0 0 20 20" width="14" height="14" fill="currentColor" aria-hidden="true">
                <path d="M6 4.5v11l9-5.5-9-5.5z" />
              </svg>
              {isNow ? (target.startedAt ? "Back to it" : "Start now") : "Start early"}
            </Link>
            <Link
              href={`/app/sessions?eventId=${encodeURIComponent(target.id)}`}
              className="text-[13px] ui-hover rounded-md px-2 py-1"
              style={{ color: "var(--app-text-muted)" }}
            >
              See the plan
            </Link>
          </div>
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
