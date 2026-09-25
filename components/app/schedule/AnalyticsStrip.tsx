"use client";

import type { ReactNode } from "react";
import type { PlannerEvent } from "@/lib/api/types";
import { dateKey } from "@/lib/api/time";
import { useStreak } from "@/lib/app/useStreak";
import { addDays, eventMinutes, mondayOf, shortMinutes, WEEKDAYS } from "./calendar";
import { Bar, FlameGlyph, MiniBars } from "./bits";

interface StripProps {
  /** The day the numbers are about: today, or the day open in Day view. */
  day: string;
  today: string;
  /** Study blocks already narrowed to the subjects in the filter. */
  studyEvents: PlannerEvent[];
  timezone: string;
}

/**
 * Three plain answers to the only questions a schedule needs to answer:
 * what is done today, how the week is going, and the current study streak.
 */
export default function AnalyticsStrip({ day, today, studyEvents, timezone }: StripProps) {
  const streak = useStreak();
  const weekStart = mondayOf(day);
  const weekEnd = addDays(weekStart, 6);
  const byDay = (key: string) => studyEvents.filter((event) => dateKey(event.startAt, timezone) === key);
  // Planned counts every block, missed ones too: they were part of the plan.
  const sum = (list: PlannerEvent[], doneOnly = false) =>
    list.filter((event) => !doneOnly || event.outcome === "completed").reduce((total, event) => total + eventMinutes(event), 0);

  // The day: focus blocks done, out of the blocks Arcadia planned.
  const dayBlocks = byDay(day);
  const dayItems = dayBlocks.length;
  const dayDone = dayBlocks.filter((event) => event.outcome === "completed").length;

  // The week: minutes per day, and the share of its items done.
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const weekBars = weekDays.map((key) => ({ key, planned: sum(byDay(key)), done: sum(byDay(key), true), current: key === today }));
  const weekPlanned = weekBars.reduce((total, bar) => total + bar.planned, 0);
  const weekDone = weekBars.reduce((total, bar) => total + bar.done, 0);
  const dayLabel = day === today ? "Today" : WEEKDAYS[(new Date(`${day}T12:00:00Z`).getUTCDay() + 6) % 7];
  const weekLabel = weekStart <= today && today <= weekEnd ? "This week" : "That week";

  return (
    <section
      aria-label="Progress"
      className="grid grid-cols-3 overflow-hidden rounded-lg"
      style={{ background: "var(--app-surface)", boxShadow: "var(--elev-1)" }}
    >
      <Tile label={dayLabel} value={dayItems ? `${dayDone} of ${dayItems}` : "No blocks"} hint="focus blocks">
        <Bar value={dayItems ? dayDone / dayItems : 0} />
      </Tile>
      <Tile label={weekLabel} value={shortMinutes(weekDone)} hint={`of ${shortMinutes(weekPlanned)} planned`}>
        <MiniBars days={weekBars} label={weekBars.map((bar) => `${bar.key}: ${Math.round(bar.done)} of ${Math.round(bar.planned)} minutes`).join(", ")} />
      </Tile>
      <Tile
        label="Streak"
        value={`${streak.current} ${streak.current === 1 ? "day" : "days"}`}
        hint={streak.longest > streak.current ? `Best ${streak.longest}` : streak.current ? "Your best yet" : "70% of a day starts one"}
        last
        inline={
          <span style={{ color: streak.current ? "var(--app-text)" : "var(--app-text-faint)" }}>
            <FlameGlyph size={20} />
          </span>
        }
      />
    </section>
  );
}

function Tile({
  label,
  value,
  hint,
  inline,
  children,
  last,
}: {
  label: string;
  value: string;
  hint: string;
  /** A chart beside the number, rather than under it. */
  inline?: ReactNode;
  children?: ReactNode;
  last?: boolean;
}) {
  return (
    <div
      className="flex min-w-0 flex-col justify-between gap-2 px-3 py-3 sm:px-3.5"
      style={{ borderRight: last ? undefined : "1px solid var(--app-border)" }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-[12px] font-medium" style={{ color: "var(--app-text-muted)" }}>{label}</p>
          <p className="mt-0.5 truncate text-[16px] font-semibold tabular-nums tracking-[-0.01em]" style={{ color: "var(--app-text)" }}>
            {value}
          </p>
        </div>
        {inline}
      </div>
      {children}
      <p className="truncate text-[11.5px] tabular-nums" style={{ color: "var(--app-text-faint)" }}>{hint}</p>
    </div>
  );
}
