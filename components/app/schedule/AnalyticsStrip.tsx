"use client";

import type { ReactNode } from "react";
import type { PlannerEvent, PlannerTask } from "@/lib/api/types";
import { dateKey } from "@/lib/api/time";
import { useStreak } from "@/lib/app/useStreak";
import { addDays, eventMinutes, mondayOf, shortMinutes, WEEKDAYS } from "./calendar";
import { Bar, FlameGlyph, MiniBars, Ring } from "./bits";
import { useHabits } from "./habits";

interface StripProps {
  /** The day the numbers are about: today, or the day open in Day view. */
  day: string;
  today: string;
  /** Study blocks already narrowed to the subjects in the filter. */
  studyEvents: PlannerEvent[];
  tasks: PlannerTask[];
  /** The period on screen, for the study-hours tile. */
  range: { from: string; to: string; label: string };
  timezone: string;
}

/**
 * How the plan is going, in one compact row: today, this week, the week's
 * completion, study hours for what's on screen, the streak and habits. It
 * reads the same data as the views, so ticking anything off moves it.
 */
export default function AnalyticsStrip({ day, today, studyEvents, tasks, range, timezone }: StripProps) {
  const streak = useStreak();
  const { habits, dayScore } = useHabits();
  const weekStart = mondayOf(day);
  const weekEnd = addDays(weekStart, 6);
  const byDay = (key: string) => studyEvents.filter((event) => dateKey(event.startAt, timezone) === key);
  // Planned counts every block, missed ones too: they were part of the plan.
  const sum = (list: PlannerEvent[], doneOnly = false) =>
    list.filter((event) => !doneOnly || event.outcome === "completed").reduce((total, event) => total + eventMinutes(event), 0);

  // The day: blocks done and deadlines ticked off, out of everything on it.
  const dayBlocks = byDay(day);
  const dayTasks = tasks.filter((task) => task.status !== "cancelled" && dateKey(task.dueAt, timezone) === day);
  const dayItems = dayBlocks.length + dayTasks.length;
  const dayDone = dayBlocks.filter((event) => event.outcome === "completed").length + dayTasks.filter((task) => task.status === "complete").length;

  // The week: minutes per day, and the share of its items done.
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const weekBars = weekDays.map((key) => ({ key, planned: sum(byDay(key)), done: sum(byDay(key), true), current: key === today }));
  const weekPlanned = weekBars.reduce((total, bar) => total + bar.planned, 0);
  const weekDone = weekBars.reduce((total, bar) => total + bar.done, 0);
  const weekBlocks = studyEvents.filter((event) => {
    const key = dateKey(event.startAt, timezone);
    return key >= weekStart && key <= weekEnd;
  });
  const weekTasks = tasks.filter((task) => {
    const key = dateKey(task.dueAt, timezone);
    return task.status !== "cancelled" && key >= weekStart && key <= weekEnd;
  });
  const weekItems = weekBlocks.length + weekTasks.length;
  const weekItemsDone = weekBlocks.filter((event) => event.outcome === "completed").length + weekTasks.filter((task) => task.status === "complete").length;
  const weekPct = weekItems ? weekItemsDone / weekItems : 0;

  // Study hours for the period on screen.
  const rangeEvents = studyEvents.filter((event) => {
    const key = dateKey(event.startAt, timezone);
    return key >= range.from && key <= range.to;
  });
  const rangePlanned = sum(rangeEvents);
  const rangeDone = sum(rangeEvents, true);

  // Habits: the day's share, and each of the week's days.
  const habitToday = dayScore(day);
  const habitBars = weekDays.map((key) => {
    const score = key > today ? { done: 0, total: 0 } : dayScore(key);
    return { key, planned: score.total, done: score.done, current: key === today };
  });
  const dayLabel = day === today ? "Today" : WEEKDAYS[(new Date(`${day}T12:00:00Z`).getUTCDay() + 6) % 7];
  const weekLabel = weekStart <= today && today <= weekEnd ? "This week" : "That week";

  return (
    <section
      aria-label="Progress"
      className="flex overflow-x-auto rounded-lg [scrollbar-width:none]"
      style={{ background: "var(--app-surface)", boxShadow: "var(--elev-1)" }}
    >
      <Tile label={dayLabel} value={dayItems ? `${dayDone} of ${dayItems}` : "Nothing on"} hint="blocks + deadlines">
        <Bar value={dayItems ? dayDone / dayItems : 0} />
      </Tile>
      <Tile label={weekLabel} value={shortMinutes(weekDone)} hint={`of ${shortMinutes(weekPlanned)} planned`}>
        <MiniBars days={weekBars} label={weekBars.map((bar) => `${bar.key}: ${Math.round(bar.done)} of ${Math.round(bar.planned)} minutes`).join(", ")} />
      </Tile>
      <Tile label="Week done" value={`${Math.round(weekPct * 100)}%`} hint={`${weekItemsDone} of ${weekItems} items`} inline={<Ring value={weekPct} size={26} />} />
      <Tile label={`Study, ${range.label}`} value={`${hours(rangeDone)} / ${hours(rangePlanned)}`} hint="done / planned">
        <div className="flex flex-col gap-[3px]">
          <Bar value={rangePlanned ? 1 : 0} tone="var(--app-text-faint)" />
          <Bar value={rangePlanned ? rangeDone / rangePlanned : 0} />
        </div>
      </Tile>
      <Tile
        label="Streak"
        value={`${streak.current} ${streak.current === 1 ? "day" : "days"}`}
        hint={streak.longest > streak.current ? `Best ${streak.longest}` : streak.current ? "Your best yet" : "70% of a day starts one"}
        inline={
          <span style={{ color: streak.current ? "var(--app-text)" : "var(--app-text-faint)" }}>
            <FlameGlyph size={20} />
          </span>
        }
      />
      <Tile
        label={`Habits, ${dayLabel.toLowerCase() === "today" ? "today" : dayLabel}`}
        value={habits.length ? `${habitToday.total ? Math.round((habitToday.done / habitToday.total) * 100) : 0}%` : "None yet"}
        hint={habits.length ? `${habitToday.done} of ${habitToday.total}` : "Add some on the right"}
        last
      >
        {habits.length ? <MiniBars days={habitBars} label="Habits done each day this week" /> : null}
      </Tile>
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
      className="flex min-w-[136px] flex-1 flex-col justify-between gap-2 px-3.5 py-3"
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

function hours(minutes: number): string {
  if (minutes === 0) return "0h";
  const h = minutes / 60;
  return `${h < 10 ? Math.round(h * 10) / 10 : Math.round(h)}h`;
}
