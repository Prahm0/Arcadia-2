"use client";

import { useMemo, type CSSProperties } from "react";
import type { RecoverySessionChange } from "@/lib/app/recovery";
import { subjectColour } from "@/lib/app/subjectColour";
import type { DashboardResponse } from "@/lib/api/types";

const DAY_MS = 24 * 60 * 60 * 1000;
const START_MINUTE = 7 * 60;
const END_MINUTE = 22 * 60;

type Slot = { startAt: string; endAt: string };

function dateParts(iso: string, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-AU", {
    timeZone,
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    weekday: "short",
  }).formatToParts(new Date(iso));
  const get = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value ?? 0);
  return {
    day: Date.UTC(get("year"), get("month") - 1, get("day")),
    minutes: get("hour") * 60 + get("minute"),
    weekday: parts.find((part) => part.type === "weekday")?.value ?? "",
    date: get("day"),
  };
}

function dayIndex(iso: string, start: number, timeZone: string): number {
  return Math.round((dateParts(iso, timeZone).day - start) / DAY_MS);
}

function pillStyle(slot: Slot, start: number, timeZone: string) {
  const parts = dateParts(slot.startAt, timeZone);
  const duration = Math.max(10, (Date.parse(slot.endAt) - Date.parse(slot.startAt)) / 60000);
  const range = END_MINUTE - START_MINUTE;
  const top = Math.max(0, Math.min(100, ((parts.minutes - START_MINUTE) / range) * 100));
  const height = Math.max(10, Math.min(42, (duration / range) * 100));
  return { left: `${(dayIndex(slot.startAt, start, timeZone) / 7) * 100}%`, top: `${top}%`, height: `${height}%` };
}

function label(slot: Slot, timeZone: string) {
  const hour = new Date(slot.startAt).toLocaleTimeString("en-AU", { hour: "numeric", timeZone }).toLowerCase();
  return hour.replace(/\s/g, "");
}

/** A compact, honest before-and-after week. CSS keyframes do the FLIP without state effects. */
export default function RecoveryWeekStrip({
  changes,
  subjects,
  timeZone,
  className = "",
}: {
  changes: RecoverySessionChange[];
  subjects: DashboardResponse["subjects"];
  timeZone: string;
  className?: string;
}) {
  const start = useMemo(() => dateParts(new Date().toISOString(), timeZone).day, [timeZone]);
  const days = useMemo(
    () => Array.from({ length: 7 }, (_, index) => {
      const date = new Date(start + index * DAY_MS);
      const parts = new Intl.DateTimeFormat("en-AU", { timeZone: "UTC", weekday: "narrow", day: "numeric" }).formatToParts(date);
      return { weekday: parts.find((part) => part.type === "weekday")?.value ?? "", date: parts.find((part) => part.type === "day")?.value ?? "" };
    }),
    [start],
  );
  const visible = changes.filter((change) => {
    const slot = change.after ?? change.before;
    if (!slot) return false;
    const index = dayIndex(slot.startAt, start, timeZone);
    return index >= 0 && index < 7;
  });

  if (!visible.length) return null;

  return (
    <section className={`recovery-week-strip overflow-hidden rounded-xl border p-3 ${className}`} style={{ background: "var(--app-surface-soft)", borderColor: "var(--app-border)" }} aria-label="Your week rebuilding">
      <div className="mb-2 flex items-center justify-between">
        <p className="type-mono-label" style={{ color: "var(--app-text-muted)" }}>Your week, rebuilt</p>
        <span className="text-[11px]" style={{ color: "var(--app-text-faint)" }}>Today onward</span>
      </div>
      <div className="relative h-[142px] overflow-hidden rounded-lg border" style={{ background: "color-mix(in oklab, var(--app-bg) 65%, var(--app-surface))", borderColor: "var(--app-border)" }}>
        <div className="absolute inset-x-0 top-0 flex h-6 border-b" style={{ borderColor: "var(--app-border)" }}>
          {days.map((day, index) => <div key={`${day.weekday}-${index}`} className="flex-1 border-r text-center text-[10px] leading-3 last:border-r-0" style={{ borderColor: "var(--app-border)", color: "var(--app-text-muted)" }}><span className="block pt-1 font-semibold">{day.weekday}</span><span>{day.date}</span></div>)}
        </div>
        <div className="absolute inset-x-0 bottom-0 top-6 flex">
          {days.map((_, index) => <div key={index} className="flex-1 border-r last:border-r-0" style={{ borderColor: "color-mix(in oklab, var(--app-border) 80%, transparent)" }} />)}
        </div>
        <div className="absolute inset-x-0 bottom-0 top-6">
          {visible.map((change, index) => <RebuildPills key={`${change.subject}-${change.title}-${index}`} change={change} index={index} start={start} timeZone={timeZone} colour={subjectColour(subjects, change.subject) ?? "var(--app-arcad)"} />)}
        </div>
      </div>
      <div className="mt-2 flex items-center gap-3 text-[10.5px]" style={{ color: "var(--app-text-muted)" }}>
        <span className="flex items-center gap-1"><i className="h-2 w-2 rounded-sm opacity-40" style={{ background: "var(--app-text-muted)" }} /> Before</span>
        <span className="flex items-center gap-1"><i className="h-2 w-2 rounded-sm" style={{ background: "var(--app-arcad)" }} /> Updated plan</span>
      </div>
    </section>
  );
}

function RebuildPills({ change, index, start, timeZone, colour }: { change: RecoverySessionChange; index: number; start: number; timeZone: string; colour: string }) {
  const before = change.before;
  const after = change.after;
  const beforeStyle = before ? pillStyle(before, start, timeZone) : null;
  const afterStyle = after ? pillStyle(after, start, timeZone) : null;
  const beforeSlot = before && beforeStyle ? { ...beforeStyle, width: "calc(14.2857% - 4px)" } : null;
  const afterSlot = after && afterStyle ? { ...afterStyle, width: "calc(14.2857% - 4px)" } : null;
  const fromX = beforeStyle && afterStyle ? `calc(${beforeStyle.left} - ${afterStyle.left})` : "0px";
  const fromY = beforeStyle && afterStyle ? `calc(${beforeStyle.top} - ${afterStyle.top})` : "0px";
  const title = change.subject || change.title;

  return (
    <>
      {beforeSlot ? <div className={`recovery-before-pill ${after ? "recovery-before-fade" : "recovery-before-stay"}`} style={{ ...beforeSlot, marginLeft: 2, animationDelay: `${index * 55}ms` }}><span>{title}</span></div> : null}
      {afterSlot ? <div className={before ? "recovery-after-pill recovery-after-glide" : "recovery-after-pill recovery-after-pop"} style={{ ...afterSlot, marginLeft: 2, background: colour, "--recovery-from-x": fromX, "--recovery-from-y": fromY, animationDelay: `${140 + index * 70}ms` } as CSSProperties}><span>{title}</span><small>{label(after!, timeZone)}</small></div> : null}
    </>
  );
}
