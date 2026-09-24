"use client";

import { useMemo, useState, type CSSProperties } from "react";
import type { RecoveryDeadline, RecoverySessionChange } from "@/lib/app/recovery";
import { subjectColour } from "@/lib/app/subjectColour";
import type { DashboardResponse } from "@/lib/api/types";

const DAY_MS = 24 * 60 * 60 * 1000;
const STRIP_TOP = 34;
const STRIP_HEIGHT = 150;

type Slot = { startAt: string; endAt: string };
type Positioned = { day: number; lane: number };

function dateParts(iso: string, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-AU", {
    timeZone,
    year: "numeric",
    month: "numeric",
    day: "numeric",
    weekday: "short",
  }).formatToParts(new Date(iso));
  const get = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value ?? 0);
  return {
    day: Date.UTC(get("year"), get("month") - 1, get("day")),
    weekday: parts.find((part) => part.type === "weekday")?.value ?? "",
    date: get("day"),
  };
}

function dayIndex(iso: string, start: number, timeZone: string): number {
  return Math.round((dateParts(iso, timeZone).day - start) / DAY_MS);
}

function shortTime(iso: string, timeZone: string): string {
  return new Date(iso)
    .toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit", timeZone })
    .toLowerCase()
    .replace(/\s/g, "");
}

function slotPositions(changes: RecoverySessionChange[], slot: "before" | "after", start: number, timeZone: string) {
  const grouped = new Map<number, number[]>();
  changes.forEach((change, index) => {
    const value = change[slot];
    if (!value) return;
    const day = dayIndex(value.startAt, start, timeZone);
    if (day < 0 || day >= 7) return;
    const group = grouped.get(day) ?? [];
    group.push(index);
    grouped.set(day, group);
  });

  const positions = new Map<number, Positioned>();
  for (const [day, indexes] of grouped) {
    indexes.sort((a, b) => Date.parse(changes[a][slot]!.startAt) - Date.parse(changes[b][slot]!.startAt));
    indexes.forEach((index, lane) => positions.set(index, { day, lane }));
  }
  return positions;
}

function barStyle(position: Positioned, laneCount: number): CSSProperties {
  const gap = laneCount > 18 ? 1 : 4;
  const height = Math.min(17, Math.max(3, (STRIP_HEIGHT - Math.max(0, laneCount - 1) * gap) / laneCount));
  return {
    left: `calc(${(position.day / 7) * 100}% + 3px)`,
    top: STRIP_TOP + position.lane * (height + gap),
    width: "calc(14.2857% - 6px)",
    height,
  };
}

/** A replayable, honest before-and-after of the visible week. */
export default function RecoveryWeekStrip({
  changes,
  subjects,
  timeZone,
  deadline = null,
  affectedDay = null,
  className = "",
}: {
  changes: RecoverySessionChange[];
  subjects: DashboardResponse["subjects"];
  timeZone: string;
  deadline?: RecoveryDeadline | null;
  affectedDay?: string | null;
  className?: string;
}) {
  const [run, setRun] = useState(0);
  const [tooltip, setTooltip] = useState<{ id: string; title: string; time: string; style: CSSProperties } | null>(null);
  const start = useMemo(() => dateParts(new Date().toISOString(), timeZone).day, [timeZone]);
  const days = useMemo(
    () => Array.from({ length: 7 }, (_, index) => dateParts(new Date(start + index * DAY_MS).toISOString(), "UTC")),
    [start],
  );
  const visible = useMemo(
    () => changes.filter((change) => [change.before, change.after].some((slot) => slot && dayIndex(slot.startAt, start, timeZone) >= 0 && dayIndex(slot.startAt, start, timeZone) < 7)),
    [changes, start, timeZone],
  );
  const beforePositions = useMemo(() => slotPositions(visible, "before", start, timeZone), [visible, start, timeZone]);
  const afterPositions = useMemo(() => slotPositions(visible, "after", start, timeZone), [visible, start, timeZone]);
  const laneCount = Math.max(1, ...Array.from(beforePositions.values(), (position) => position.lane + 1), ...Array.from(afterPositions.values(), (position) => position.lane + 1));
  const shownSubjects = Array.from(new Set(visible.map((change) => change.subject).filter((subject): subject is string => Boolean(subject))));
  const deadlineDay = deadline ? dayIndex(deadline.dueAt, start, timeZone) : -1;
  const affectedIndex = affectedDay ? Math.round((Date.parse(`${affectedDay}T12:00:00Z`) - start) / DAY_MS) : -1;

  if (!visible.length) return null;

  function revealTooltip(id: string, change: RecoverySessionChange, slot: Slot, style: CSSProperties) {
    const top = Number(style.top);
    const height = Number(style.height);
    setTooltip({
      id,
      title: change.subject || change.title,
      time: `${shortTime(slot.startAt, timeZone)} to ${shortTime(slot.endAt, timeZone)}`,
      style: { left: style.left, top: top > 148 ? top - 36 : top + height + 7 },
    });
  }

  return (
    <section className={`recovery-week-strip overflow-hidden rounded-xl border p-3 ${className}`} style={{ background: "var(--app-surface-soft)", borderColor: "var(--app-border)" }} aria-label="Your week rebuilding">
      <div className="mb-2 flex items-center justify-between gap-3">
        <div>
          <p className="type-mono-label" style={{ color: "var(--app-text-muted)" }}>Your week, rebuilt</p>
          <p className="mt-0.5 text-[11px]" style={{ color: "var(--app-text-faint)" }}>Watch the changes settle into place</p>
        </div>
        <button
          type="button"
          onClick={() => {
            setTooltip(null);
            setRun((current) => current + 1);
          }}
          className="recovery-replay grid h-8 w-8 shrink-0 place-items-center rounded-full border"
          style={{ borderColor: "var(--app-border)", color: "var(--app-arcad-strong)", background: "var(--app-surface)" }}
          aria-label="Replay rebuild animation"
          title="Replay"
        >
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path d="M20 11a8 8 0 10-2.34 5.66" strokeLinecap="round" />
            <path d="M20 4v7h-7" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>
      <div className="relative h-[190px] overflow-hidden rounded-lg border" style={{ background: "color-mix(in oklab, var(--app-bg) 65%, var(--app-surface))", borderColor: "var(--app-border)" }}>
        <div className="absolute inset-x-0 top-0 flex h-[34px] border-b" style={{ borderColor: "var(--app-border)" }}>
          {days.map((day, index) => (
            <div key={`${day.weekday}-${index}`} className="relative flex-1 border-r text-center text-[10px] leading-3 last:border-r-0" style={{ borderColor: "var(--app-border)", color: index === 0 ? "var(--app-arcad-strong)" : "var(--app-text-muted)", background: index === 0 ? "var(--app-arcad-soft)" : undefined }}>
              <span className="block pt-1.5 font-semibold">{day.weekday.slice(0, 1)}</span>
              <span>{day.date}</span>
            </div>
          ))}
        </div>
        <div className="absolute inset-x-0 bottom-0 top-[34px] flex">
          {days.map((_, index) => (
            <div key={index} className={`relative flex-1 border-r last:border-r-0 ${index === affectedIndex ? "recovery-affected-day" : ""}`} style={{ borderColor: "color-mix(in oklab, var(--app-border) 80%, transparent)", background: index === 0 ? "color-mix(in oklab, var(--app-arcad-soft) 38%, transparent)" : undefined }} />
          ))}
        </div>
        {deadline && deadlineDay >= 0 && deadlineDay < 7 ? (
          <div key={`flag-${run}`} className="recovery-deadline-flag" style={{ left: `calc(${(deadlineDay / 7) * 100}% + 4px)` }} title={`${deadline.title} due ${shortTime(deadline.dueAt, timeZone)}`} aria-label={`${deadline.title} deadline`}>
            <svg viewBox="0 0 16 18" width="14" height="16" aria-hidden="true"><path d="M3 1v16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /><path d="M4 2h9l-2.4 3.5L13 9H4z" fill="currentColor" /></svg>
          </div>
        ) : null}
        {visible.map((change, index) => {
          const before = change.before;
          const after = change.after;
          const beforePosition = beforePositions.get(index);
          const afterPosition = afterPositions.get(index);
          const beforeStyle = beforePosition ? barStyle(beforePosition, laneCount) : null;
          const afterStyle = afterPosition ? barStyle(afterPosition, laneCount) : null;
          const colour = subjectColour(subjects, change.subject) ?? "var(--app-arcad)";
          const fromX = beforeStyle && afterStyle ? `calc(${beforeStyle.left} - ${afterStyle.left})` : "0px";
          const fromY = beforeStyle && afterStyle ? `${Number(beforeStyle.top) - Number(afterStyle.top)}px` : "0px";
          return (
            <div key={`${run}-${change.subject}-${change.title}-${index}`}>
              {before && beforeStyle ? <button type="button" className="recovery-bar recovery-bar-before" style={{ ...beforeStyle, "--bar-colour": colour, animationDelay: `${index * 55}ms` } as CSSProperties} aria-label={`Before: ${change.subject || change.title}, ${shortTime(before.startAt, timeZone)}`} onMouseEnter={() => revealTooltip(`before-${index}`, change, before, beforeStyle)} onMouseLeave={() => setTooltip(null)} onFocus={() => revealTooltip(`before-${index}`, change, before, beforeStyle)} onBlur={() => setTooltip(null)} onClick={() => revealTooltip(`before-${index}`, change, before, beforeStyle)} /> : null}
              {after && afterStyle ? <button type="button" className={`recovery-bar recovery-bar-after ${before ? "recovery-bar-glide" : "recovery-bar-pop"}`} style={{ ...afterStyle, "--bar-colour": colour, "--recovery-from-x": fromX, "--recovery-from-y": fromY, animationDelay: `${180 + index * 65}ms` } as CSSProperties} aria-label={`Updated: ${change.subject || change.title}, ${shortTime(after.startAt, timeZone)}`} onMouseEnter={() => revealTooltip(`after-${index}`, change, after, afterStyle)} onMouseLeave={() => setTooltip(null)} onFocus={() => revealTooltip(`after-${index}`, change, after, afterStyle)} onBlur={() => setTooltip(null)} onClick={() => revealTooltip(`after-${index}`, change, after, afterStyle)} /> : null}
            </div>
          );
        })}
        {tooltip ? <div key={tooltip.id} role="tooltip" className="recovery-bar-tooltip" style={tooltip.style}><strong>{tooltip.title}</strong><span>{tooltip.time}</span></div> : null}
      </div>
      {shownSubjects.length ? (
        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1.5 text-[10.5px]" style={{ color: "var(--app-text-muted)" }}>
          {shownSubjects.map((subject) => <span key={subject} className="flex items-center gap-1.5"><i className="h-2 w-2 rounded-full" style={{ background: subjectColour(subjects, subject) ?? "var(--app-arcad)" }} />{subject}</span>)}
        </div>
      ) : null}
    </section>
  );
}
