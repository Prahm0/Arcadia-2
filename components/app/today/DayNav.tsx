"use client";

import { useRef } from "react";

/** Days loaded with the plan: Today can go this far back, and a week forward. */
const DAYS_BACK = 60;
const DAYS_FORWARD = 6;

/** YYYY-MM-DD moved by whole days. */
export function shiftDay(day: string, by: number): string {
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + by);
  return date.toISOString().slice(0, 10);
}

/** "Tuesday 6 October" and "Yesterday" / "3 days ago" / "Tomorrow" for a day key. */
export function dayLabel(day: string, today: string): { full: string; short: string; relative: string } {
  const date = new Date(`${day}T12:00:00Z`);
  const full = new Intl.DateTimeFormat("en-AU", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).format(date);
  const short = new Intl.DateTimeFormat("en-AU", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(date);
  const diff = Math.round((Date.parse(`${day}T12:00:00Z`) - Date.parse(`${today}T12:00:00Z`)) / 86_400_000);
  const relative = diff === 0 ? "Today" : diff === -1 ? "Yesterday" : diff === 1 ? "Tomorrow" : diff < 0 ? `${-diff} days ago` : `In ${diff} days`;
  return { full, short, relative };
}

/**
 * The day switcher above Today's note: back a day, the date (tap it for a
 * calendar), forward a day, and a way home when you've wandered off.
 */
export default function DayNav({ day, today, onChange }: { day: string; today: string; onChange: (day: string) => void }) {
  const picker = useRef<HTMLInputElement>(null);
  const min = shiftDay(today, -DAYS_BACK);
  const max = shiftDay(today, DAYS_FORWARD);
  const go = (next: string) => {
    if (next >= min && next <= max) onChange(next);
  };
  const label = day === today ? `Today · ${dayLabel(day, today).short}` : dayLabel(day, today).short;

  return (
    <nav aria-label="Choose a day" className="mb-4 flex items-center gap-1.5">
      <button
        type="button"
        aria-label="Previous day"
        onClick={() => go(shiftDay(day, -1))}
        disabled={day <= min}
        className="ui-press grid size-9 place-items-center rounded-full disabled:opacity-30"
        style={{ background: "var(--app-surface)", color: "var(--app-text)", boxShadow: "var(--elev-1)" }}
      >
        <svg viewBox="0 0 20 20" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 4l-6 6 6 6" /></svg>
      </button>
      <label
        className="ui-press relative flex h-9 cursor-pointer items-center rounded-full px-4 text-[14px] font-semibold"
        style={{ background: "var(--app-surface)", color: "var(--app-text)", boxShadow: "var(--elev-1)" }}
      >
        {label}
        <input
          ref={picker}
          id="today-day-picker"
          type="date"
          aria-label="Pick a day"
          value={day}
          min={min}
          max={max}
          onChange={(event) => event.target.value && go(event.target.value)}
          onClick={() => {
            try { picker.current?.showPicker(); } catch { /* the native control opens itself */ }
          }}
          className="absolute inset-0 cursor-pointer opacity-0"
        />
      </label>
      <button
        type="button"
        aria-label="Next day"
        onClick={() => go(shiftDay(day, 1))}
        disabled={day >= max}
        className="ui-press grid size-9 place-items-center rounded-full disabled:opacity-30"
        style={{ background: "var(--app-surface)", color: "var(--app-text)", boxShadow: "var(--elev-1)" }}
      >
        <svg viewBox="0 0 20 20" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M8 4l6 6-6 6" /></svg>
      </button>
      {day !== today ? (
        <button
          type="button"
          onClick={() => onChange(today)}
          className="ui-press ml-1 h-9 rounded-full px-3.5 text-[13.5px] font-semibold"
          style={{ background: "var(--app-accent)", color: "var(--app-accent-on)" }}
        >
          Back to today
        </button>
      ) : null}
    </nav>
  );
}
