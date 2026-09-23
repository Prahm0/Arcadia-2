"use client";

import { useState } from "react";
import { cn } from "@/lib/cn";
import { addDays, shortDate } from "./calendar";
import { Bar, ChevronIcon, FlameGlyph, PanelTitle, Ring, Tick } from "./bits";
import { HABIT_ICONS, HABIT_SUGGESTIONS, HabitGlyph, useHabits, type Habit, type HabitIcon } from "./habits";

interface PanelProps {
  /** The day being ticked off. */
  day: string;
  today: string;
  onDayChange: (day: string) => void;
}

/**
 * Habits beside the plan. Collapsed it's a rail of icons you can still tick,
 * open it's the full list with streaks. Day view opens it by default.
 */
export default function HabitsPanel({
  expanded,
  onExpandedChange,
  ...props
}: PanelProps & { expanded: boolean; onExpandedChange: (value: boolean) => void }) {
  return expanded ? (
    <aside
      className="hidden w-[272px] shrink-0 flex-col overflow-y-auto border-l [scrollbar-width:thin] md:flex"
      style={{ borderColor: "var(--app-border)" }}
      aria-label="Habits"
    >
      <div className="px-4 pt-4">
        <PanelTitle
          aside={
            <button
              type="button"
              onClick={() => onExpandedChange(false)}
              className="ui-hover grid h-7 w-7 place-items-center rounded-md"
              style={{ color: "var(--app-text-muted)" }}
              aria-label="Collapse habits"
              title="Collapse habits (H)"
            >
              <ChevronIcon direction="right" />
            </button>
          }
        >
          Habits
        </PanelTitle>
      </div>
      <HabitsBody {...props} />
    </aside>
  ) : (
    <HabitsRail {...props} onExpand={() => onExpandedChange(true)} />
  );
}

/** Collapsed: the day's score and one tickable icon per habit. */
function HabitsRail({ day, today, onExpand }: PanelProps & { onExpand: () => void }) {
  const { habits, isDone, toggle, dayScore, streak } = useHabits();
  const score = dayScore(day);
  const future = day > today;
  return (
    <aside
      className="hidden w-12 shrink-0 flex-col items-center gap-1.5 overflow-y-auto border-l py-3 [scrollbar-width:none] md:flex"
      style={{ borderColor: "var(--app-border)" }}
      aria-label="Habits"
    >
      <button
        type="button"
        onClick={onExpand}
        className="ui-hover grid h-9 w-9 place-items-center rounded-md"
        aria-label={`Open habits, ${score.done} of ${score.total} done`}
        title="Open habits (H)"
      >
        <span className="relative grid place-items-center">
          <Ring value={score.total ? score.done / score.total : 0} size={26} />
          <span className="absolute text-[9.5px] font-semibold tabular-nums" style={{ color: "var(--app-text)" }}>
            {score.done}
          </span>
        </span>
      </button>
      <span className="mb-1 h-px w-6" style={{ background: "var(--app-border)" }} aria-hidden="true" />
      {habits.filter((habit) => habit.since <= day).map((habit) => {
        const done = isDone(habit.id, day);
        return (
          <button
            key={habit.id}
            type="button"
            role="checkbox"
            aria-checked={done}
            disabled={future}
            onClick={() => toggle(habit.id, day)}
            title={`${habit.name}${streak(habit.id, today) ? `, ${streak(habit.id, today)} day streak` : ""}`}
            aria-label={habit.name}
            className={cn("grid h-8 w-8 place-items-center rounded-md transition-colors disabled:opacity-40", !done && "ui-hover")}
            style={{
              background: done ? "var(--app-text)" : undefined,
              color: done ? "var(--app-bg)" : "var(--app-text-muted)",
            }}
          >
            <HabitGlyph icon={habit.icon} />
          </button>
        );
      })}
      <button
        type="button"
        onClick={onExpand}
        className="ui-hover mt-1 grid h-8 w-8 place-items-center rounded-md text-[16px] leading-none"
        style={{ color: "var(--app-text-faint)" }}
        aria-label="Add a habit"
        title="Add a habit"
      >
        +
      </button>
    </aside>
  );
}

/** On phones: a card that folds away. */
export function HabitsCard({ defaultOpen, ...props }: PanelProps & { defaultOpen: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const { dayScore } = useHabits();
  const score = dayScore(props.day);
  return (
    <section className="overflow-hidden rounded-lg" style={{ background: "var(--app-surface)", boxShadow: "var(--elev-1)" }} aria-label="Habits">
      <button type="button" onClick={() => setOpen((value) => !value)} className="flex w-full items-center gap-3 px-4 py-3 text-left" aria-expanded={open}>
        <Ring value={score.total ? score.done / score.total : 0} size={22} />
        <span className="flex-1 text-[14px] font-medium" style={{ color: "var(--app-text)" }}>Habits</span>
        <span className="text-[12.5px] tabular-nums" style={{ color: "var(--app-text-muted)" }}>
          {score.total ? `${score.done} of ${score.total}` : "None yet"}
        </span>
        <span className={cn("transition-transform", open && "rotate-180")} style={{ color: "var(--app-text-muted)" }}>
          <ChevronIcon direction="down" />
        </span>
      </button>
      {open ? (
        <div className="border-t" style={{ borderColor: "var(--app-border)" }}>
          <HabitsBody {...props} />
        </div>
      ) : null}
    </section>
  );
}

function HabitsBody({ day, today, onDayChange }: PanelProps) {
  const { habits, ready, isDone, toggle, dayScore, streak, add } = useHabits();
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const shown = habits.filter((habit) => habit.since <= day);
  const score = dayScore(day);
  const future = day > today;
  const unused = HABIT_SUGGESTIONS.filter((s) => !habits.some((habit) => habit.name.toLowerCase() === s.name.toLowerCase()));

  return (
    <div className="flex flex-col px-4 pb-4">
      <div className="mt-2 flex items-center gap-1">
        <button type="button" onClick={() => onDayChange(addDays(day, -1))} className="ui-hover grid h-7 w-7 place-items-center rounded-md" style={{ color: "var(--app-text-muted)" }} aria-label="Previous day">
          <ChevronIcon direction="left" />
        </button>
        <button
          type="button"
          onClick={() => onDayChange(today)}
          className="min-w-0 flex-1 truncate text-center text-[13px] font-medium"
          style={{ color: "var(--app-text)" }}
          title="Back to today"
        >
          {day === today ? `Today, ${shortDate(day).replace(/^\w+ /, "")}` : shortDate(day)}
        </button>
        <button
          type="button"
          onClick={() => onDayChange(addDays(day, 1))}
          disabled={day >= today}
          className="ui-hover grid h-7 w-7 place-items-center rounded-md disabled:opacity-30"
          style={{ color: "var(--app-text-muted)" }}
          aria-label="Next day"
        >
          <ChevronIcon direction="right" />
        </button>
      </div>

      {shown.length ? (
        <div className="mt-3">
          <div className="flex items-baseline justify-between text-[12.5px] tabular-nums" style={{ color: "var(--app-text-muted)" }}>
            <span>
              <span className="text-[15px] font-semibold" style={{ color: "var(--app-text)" }}>{score.done}</span> of {score.total} done
            </span>
            <span>{score.total ? Math.round((score.done / score.total) * 100) : 0}%</span>
          </div>
          <div className="mt-1.5">
            <Bar value={score.total ? score.done / score.total : 0} />
          </div>
        </div>
      ) : null}

      <ul className="mt-3 flex flex-col">
        {shown.map((habit) =>
          editing === habit.id ? (
            <li key={habit.id}>
              <HabitEditor habit={habit} onDone={() => setEditing(null)} />
            </li>
          ) : (
            <li key={habit.id} className="group -mx-2 flex items-center gap-2.5 rounded-md px-2 py-1.5 ui-hover">
              <Tick checked={isDone(habit.id, day)} onChange={() => toggle(habit.id, day)} label={habit.name} disabled={future} />
              <button
                type="button"
                disabled={future}
                onClick={() => toggle(habit.id, day)}
                className="flex min-w-0 flex-1 items-center gap-2 text-left"
                tabIndex={-1}
              >
                <span style={{ color: isDone(habit.id, day) ? "var(--app-text)" : "var(--app-text-muted)" }}>
                  <HabitGlyph icon={habit.icon} size={15} />
                </span>
                <span
                  className="truncate text-[13px]"
                  style={{ color: isDone(habit.id, day) ? "var(--app-text-muted)" : "var(--app-text)", textDecoration: isDone(habit.id, day) ? "line-through" : undefined }}
                >
                  {habit.name}
                </span>
              </button>
              {streak(habit.id, today) > 0 ? (
                <span className="flex shrink-0 items-center gap-0.5 text-[11.5px] tabular-nums" style={{ color: "var(--app-text-muted)" }} title={`${streak(habit.id, today)} days in a row`}>
                  <FlameGlyph size={11} />
                  {streak(habit.id, today)}
                </span>
              ) : null}
              <button
                type="button"
                onClick={() => setEditing(habit.id)}
                className="grid h-6 w-6 shrink-0 place-items-center rounded opacity-0 transition-opacity focus:opacity-100 group-hover:opacity-100"
                style={{ color: "var(--app-text-faint)" }}
                aria-label={`Edit ${habit.name}`}
              >
                <svg viewBox="0 0 16 16" width="12" height="12" fill="currentColor" aria-hidden="true">
                  <circle cx="3.5" cy="8" r="1.3" /><circle cx="8" cy="8" r="1.3" /><circle cx="12.5" cy="8" r="1.3" />
                </svg>
              </button>
            </li>
          ),
        )}
      </ul>

      {ready && habits.length === 0 ? (
        <p className="mt-1 text-[12.5px] leading-snug" style={{ color: "var(--app-text-muted)" }}>
          Track the small things that make study days work. Tap one to start, or add your own.
        </p>
      ) : null}

      {adding ? (
        <HabitEditor onDone={() => setAdding(false)} />
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="ui-hover -mx-2 mt-1 flex h-8 items-center gap-2 rounded-md px-2 text-[13px] font-medium"
          style={{ color: "var(--app-text-muted)" }}
        >
          <span className="grid h-[18px] w-[18px] place-items-center text-[15px] leading-none">+</span>
          Add a habit
        </button>
      )}

      {ready && unused.length && habits.length < 6 ? (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {unused.slice(0, habits.length ? 4 : unused.length).map((suggestion) => (
            <button
              key={suggestion.name}
              type="button"
              onClick={() => add(suggestion.name, suggestion.icon)}
              className="ui-hover flex items-center gap-1.5 rounded-[5px] px-2 py-1 text-[12px]"
              style={{ color: "var(--app-text-soft)", boxShadow: "inset 0 0 0 1px var(--app-border)" }}
            >
              <HabitGlyph icon={suggestion.icon} size={13} />
              {suggestion.name}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/** Add a habit, or rename, re-icon or remove one. */
function HabitEditor({ habit, onDone }: { habit?: Habit; onDone: () => void }) {
  const { add, update, remove } = useHabits();
  const [name, setName] = useState(habit?.name ?? "");
  const [icon, setIcon] = useState<HabitIcon>(habit?.icon ?? "spark");

  function save(event: React.FormEvent) {
    event.preventDefault();
    if (!name.trim()) return;
    if (habit) update(habit.id, { name, icon });
    else add(name, icon);
    onDone();
  }

  return (
    <form onSubmit={save} className="mt-1 rounded-md p-2.5" style={{ background: "var(--app-surface-soft)", boxShadow: "var(--elev-inset)" }}>
      <input
        autoFocus
        value={name}
        onChange={(event) => setName(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape") onDone();
        }}
        placeholder="e.g. Read 10 pages"
        maxLength={60}
        aria-label="Habit name"
        className="h-8 w-full rounded-md px-2 text-[13px] outline-none"
        style={{ background: "var(--app-surface)", color: "var(--app-text)", boxShadow: "var(--elev-inset)" }}
      />
      <div className="mt-2 grid grid-cols-8 gap-1" role="radiogroup" aria-label="Icon">
        {(Object.keys(HABIT_ICONS) as HabitIcon[]).map((key) => (
          <button
            key={key}
            type="button"
            role="radio"
            aria-checked={icon === key}
            aria-label={key}
            onClick={() => setIcon(key)}
            className={cn("grid h-7 place-items-center rounded-md", icon !== key && "ui-hover")}
            style={{
              background: icon === key ? "var(--app-text)" : undefined,
              color: icon === key ? "var(--app-bg)" : "var(--app-text-muted)",
            }}
          >
            <HabitGlyph icon={key} size={14} />
          </button>
        ))}
      </div>
      <div className="mt-2.5 flex items-center gap-1.5">
        <button type="submit" disabled={!name.trim()} className="h-7 rounded-md px-3 text-[12.5px] font-medium disabled:opacity-40" style={{ background: "var(--app-text)", color: "var(--app-bg)" }}>
          {habit ? "Save" : "Add"}
        </button>
        <button type="button" onClick={onDone} className="ui-hover h-7 rounded-md px-2.5 text-[12.5px]" style={{ color: "var(--app-text-muted)" }}>
          Cancel
        </button>
        {habit ? (
          <button
            type="button"
            onClick={() => {
              if (confirm(`Remove "${habit.name}" and its history?`)) {
                remove(habit.id);
                onDone();
              }
            }}
            className="ui-hover ml-auto h-7 rounded-md px-2.5 text-[12.5px]"
            style={{ color: "var(--app-danger)" }}
          >
            Remove
          </button>
        ) : null}
      </div>
    </form>
  );
}
