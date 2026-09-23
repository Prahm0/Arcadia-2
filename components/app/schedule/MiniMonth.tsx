"use client";

import { useState } from "react";
import type { PlannerTask } from "@/lib/api/types";
import { addDays, isExam, mondayOf, stepAnchor, WEEKDAYS } from "./calendar";

/**
 * The small month in the side panel. Jumps the calendar to a date, shades
 * the range on screen, and marks days with something due: exam days are
 * outlined, other due days are bold. No dots.
 */
export default function MiniMonth({
  anchor,
  today,
  selected,
  due,
  onPick,
}: {
  anchor: string;
  today: string;
  /** The days on screen, shaded. */
  selected: { from: string; to: string };
  due: Map<string, PlannerTask[]>;
  onPick: (key: string) => void;
}) {
  // The mini month browses on its own; it follows the calendar when that moves.
  const [shown, setShown] = useState({ month: anchor.slice(0, 7), anchor });
  const month = shown.anchor === anchor ? shown.month : anchor.slice(0, 7);
  if (shown.anchor !== anchor) setShown({ month: anchor.slice(0, 7), anchor });

  const first = `${month}-01`;
  const start = mondayOf(first);
  const cells = Array.from({ length: 42 }, (_, i) => addDays(start, i));
  const title = new Intl.DateTimeFormat("en-AU", { month: "long", year: "numeric", timeZone: "UTC" }).format(
    new Date(`${first}T12:00:00Z`),
  );

  return (
    <div>
      <div className="flex items-center justify-between pb-2 pl-1">
        <p className="text-[13.5px] font-semibold" style={{ color: "var(--app-text)" }}>{title}</p>
        <div className="flex items-center">
          <SmallArrow label="Previous month" direction={-1} onClick={() => setShown({ month: stepAnchor("month", first, -1).slice(0, 7), anchor })} />
          <SmallArrow label="Next month" direction={1} onClick={() => setShown({ month: stepAnchor("month", first, 1).slice(0, 7), anchor })} />
        </div>
      </div>
      <div className="grid grid-cols-7 text-center text-[10.5px] font-medium" style={{ color: "var(--app-text-faint)" }}>
        {WEEKDAYS.map((day) => (
          <span key={day} className="py-1">{day.slice(0, 1)}</span>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-y-0.5" role="grid" aria-label={title}>
        {cells.map((key, index) => {
          const inMonth = key.slice(0, 7) === month;
          const inRange = key >= selected.from && key <= selected.to;
          const dueHere = due.get(key) ?? [];
          const exam = dueHere.some(isExam);
          const isToday = key === today;
          const rowStart = index % 7 === 0 || key === selected.from;
          const rowEnd = index % 7 === 6 || key === selected.to;
          return (
            <div
              key={key}
              className="flex justify-center py-px"
              style={{
                background: inRange ? "var(--app-accent-soft)" : undefined,
                borderRadius: `${rowStart ? 6 : 0}px ${rowEnd ? 6 : 0}px ${rowEnd ? 6 : 0}px ${rowStart ? 6 : 0}px`,
              }}
            >
              <button
                type="button"
                onClick={() => onPick(key)}
                title={dueHere.length ? dueHere.map((task) => task.title).join(", ") : undefined}
                aria-label={`${key}${dueHere.length ? `, ${dueHere.length} due` : ""}${isToday ? ", today" : ""}`}
                className="ui-hover grid h-7 w-7 place-items-center rounded-full text-[12px] tabular-nums"
                style={{
                  color: isToday ? "var(--app-accent-on)" : inMonth ? "var(--app-text)" : "var(--app-text-faint)",
                  background: isToday ? "var(--app-accent)" : undefined,
                  fontWeight: dueHere.length || isToday ? 650 : 400,
                  textDecoration: dueHere.length && !exam && !isToday ? "underline" : undefined,
                  textUnderlineOffset: 3,
                  boxShadow: exam && !isToday ? "inset 0 0 0 1.5px var(--app-danger)" : undefined,
                }}
              >
                {Number(key.slice(8))}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SmallArrow({ label, direction, onClick }: { label: string; direction: -1 | 1; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="ui-hover grid h-7 w-7 place-items-center rounded-md"
      style={{ color: "var(--app-text-muted)" }}
    >
      <svg viewBox="0 0 20 20" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
        <path d={direction < 0 ? "M12 5l-5 5 5 5" : "M8 5l5 5-5 5"} strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  );
}
