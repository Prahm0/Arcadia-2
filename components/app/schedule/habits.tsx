"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { addDays } from "./calendar";

export interface Habit {
  id: string;
  name: string;
  icon: HabitIcon;
  /** The day it was added: earlier days don't count against it. */
  since: string;
}

interface Stored {
  habits: Habit[];
  /** Habit id to the days it was done, YYYY-MM-DD. */
  log: Record<string, string[]>;
}

interface HabitsValue {
  habits: Habit[];
  ready: boolean;
  isDone: (id: string, day: string) => boolean;
  toggle: (id: string, day: string) => void;
  add: (name: string, icon: HabitIcon) => void;
  update: (id: string, change: Partial<Pick<Habit, "name" | "icon">>) => void;
  remove: (id: string) => void;
  /** Days in a row, ending today, or yesterday while today is still open. */
  streak: (id: string, today: string) => number;
  /** Habits that existed on the day, and how many were done. */
  dayScore: (day: string) => { done: number; total: number };
}

const EMPTY: Stored = { habits: [], log: {} };
const HabitsContext = createContext<HabitsValue | null>(null);

/**
 * Habits live in this browser for now, per account, until they have a table
 * of their own. Everything reads them through this provider, so moving them
 * to the API later only changes this file.
 */
export function HabitsProvider({ userId, today, children }: { userId: string; today: string; children: ReactNode }) {
  const key = `arcadia:habits:v1:${userId}`;
  const [stored, setStored] = useState<Stored>(EMPTY);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const read = () => {
      try {
        const raw = window.localStorage.getItem(key);
        setStored(raw ? normalise(JSON.parse(raw)) : EMPTY);
      } catch {
        setStored(EMPTY);
      }
      setReady(true);
    };
    read();
    // Another tab ticked something off.
    const onStorage = (event: StorageEvent) => {
      if (event.key === key) read();
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [key]);

  const write = useCallback(
    (update: (current: Stored) => Stored) => {
      setStored((current) => {
        const next = update(current);
        try {
          window.localStorage.setItem(key, JSON.stringify(next));
        } catch {
          /* kept for this visit only */
        }
        return next;
      });
    },
    [key],
  );

  const value = useMemo<HabitsValue>(() => {
    const doneSets = new Map(Object.entries(stored.log).map(([id, days]) => [id, new Set(days)]));
    const isDone = (id: string, day: string) => doneSets.get(id)?.has(day) ?? false;
    return {
      habits: stored.habits,
      ready,
      isDone,
      toggle: (id, day) =>
        write((current) => {
          const days = new Set(current.log[id] ?? []);
          if (days.has(day)) days.delete(day);
          else days.add(day);
          return { ...current, log: { ...current.log, [id]: [...days].sort() } };
        }),
      add: (name, icon) =>
        write((current) => ({
          ...current,
          habits: [...current.habits, { id: newId(), name: name.trim().slice(0, 60), icon, since: today }],
        })),
      update: (id, change) =>
        write((current) => ({
          ...current,
          habits: current.habits.map((habit) =>
            habit.id === id ? { ...habit, ...change, name: (change.name ?? habit.name).trim().slice(0, 60) || habit.name } : habit,
          ),
        })),
      remove: (id) =>
        write((current) => {
          const log = { ...current.log };
          delete log[id];
          return { habits: current.habits.filter((habit) => habit.id !== id), log };
        }),
      streak: (id, today) => {
        let day = isDone(id, today) ? today : addDays(today, -1);
        let count = 0;
        while (isDone(id, day)) {
          count += 1;
          day = addDays(day, -1);
        }
        return count;
      },
      dayScore: (day) => {
        const live = stored.habits.filter((habit) => habit.since <= day);
        return { done: live.filter((habit) => isDone(habit.id, day)).length, total: live.length };
      },
    };
  }, [stored, ready, write, today]);

  return <HabitsContext.Provider value={value}>{children}</HabitsContext.Provider>;
}

export function useHabits(): HabitsValue {
  const value = useContext(HabitsContext);
  if (!value) throw new Error("useHabits must be used inside <HabitsProvider>");
  return value;
}

function normalise(input: unknown): Stored {
  if (!input || typeof input !== "object") return EMPTY;
  const raw = input as Partial<Stored>;
  const habits = Array.isArray(raw.habits)
    ? raw.habits.filter((h): h is Habit => Boolean(h && typeof h.id === "string" && typeof h.name === "string")).map((h) => ({
        ...h,
        icon: h.icon in HABIT_ICONS ? h.icon : "spark",
        since: typeof h.since === "string" ? h.since : "0000-00-00",
      }))
    : [];
  const log: Record<string, string[]> = {};
  if (raw.log && typeof raw.log === "object") {
    for (const [id, days] of Object.entries(raw.log)) if (Array.isArray(days)) log[id] = days.filter((d) => typeof d === "string");
  }
  return { habits, log };
}

function newId(): string {
  return `hab_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

/* ---- Icons: 16px, stroked in currentColor, like the rest of the app ------ */

export const HABIT_ICONS = {
  spark: <path d="M8 1.5c.5 3.6 2.4 5.5 6 6-3.6.5-5.5 2.4-6 6-.5-3.6-2.4-5.5-6-6 3.6-.5 5.5-2.4 6-6Z" />,
  sunrise: <><path d="M2 12.5h12M4.5 12.5a3.5 3.5 0 0 1 7 0" /><path d="M8 3v3M3.8 6.3l1.2 1.2M12.2 6.3 11 7.5" /></>,
  moon: <path d="M13 10.2A5.5 5.5 0 0 1 5.8 3a5.5 5.5 0 1 0 7.2 7.2Z" />,
  breath: <><path d="M2 6h7.5a2 2 0 1 0-2-2" /><path d="M2 10h10a2 2 0 1 1-2 2" /></>,
  dumbbell: <><path d="M2.5 6v4M4.5 4.5v7M11.5 4.5v7M13.5 6v4M4.5 8h7" /></>,
  drop: <path d="M8 2s4.5 4.6 4.5 7.7A4.5 4.5 0 0 1 3.5 9.7C3.5 6.6 8 2 8 2Z" />,
  briefcase: <><rect x="2" y="5" width="12" height="8.5" rx="1.5" /><path d="M5.5 5V3.5h5V5M2 8.5h12" /></>,
  book: <><path d="M8 4.2C6.6 3.1 4.6 2.8 2.5 3v9.5c2.1-.2 4.1.1 5.5 1.2 1.4-1.1 3.4-1.4 5.5-1.2V3c-2.1-.2-4.1.1-5.5 1.2Z" /><path d="M8 4.2v9.5" /></>,
  bulb: <><path d="M6 12.5h4M6.5 14.5h3" /><path d="M8 1.8a4.2 4.2 0 0 0-2.5 7.6c.4.3.6.8.6 1.3v.3h3.8v-.3c0-.5.2-1 .6-1.3A4.2 4.2 0 0 0 8 1.8Z" /></>,
  nosugar: <><circle cx="8" cy="8" r="6" /><path d="M3.8 3.8l8.4 8.4" /></>,
  phone: <><rect x="4.5" y="1.8" width="7" height="12.4" rx="1.5" /><path d="M7 12h2" /></>,
  list: <><path d="M6.5 4.5h7M6.5 8h7M6.5 11.5h7" /><path d="m2.5 4.5.8.8 1.4-1.6M2.5 8l.8.8 1.4-1.6M2.5 11.5l.8.8 1.4-1.6" /></>,
  run: <><circle cx="9.5" cy="2.8" r="1.2" /><path d="M6 14l1.8-3.6L10 12v2.5M4 8.5l2.2-2.3h3l1.8 2.3h2M7.8 10.4l1-4.2" /></>,
  water: <><path d="M4 2h8l-1 11.5a1 1 0 0 1-1 .9H6a1 1 0 0 1-1-.9L4 2Z" /><path d="M4.4 6.5h7.2" /></>,
  pen: <path d="M3 13l.8-3L10.6 3.2a1.4 1.4 0 0 1 2 2L5.8 12 3 13Z" />,
  heart: <path d="M8 13.5S2 10 2 5.9A3 3 0 0 1 8 4.6a3 3 0 0 1 6 1.3C14 10 8 13.5 8 13.5Z" />,
} as const;

export type HabitIcon = keyof typeof HABIT_ICONS;

export function HabitGlyph({ icon, size = 16 }: { icon: HabitIcon; size?: number }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
      {HABIT_ICONS[icon] ?? HABIT_ICONS.spark}
    </svg>
  );
}

/** Starting points a student can add in one tap. */
export const HABIT_SUGGESTIONS: Array<{ name: string; icon: HabitIcon }> = [
  { name: "Wake up at 6:00", icon: "sunrise" },
  { name: "Meditation", icon: "breath" },
  { name: "Gym", icon: "dumbbell" },
  { name: "Cold shower", icon: "drop" },
  { name: "Work", icon: "briefcase" },
  { name: "Read 10 pages", icon: "book" },
  { name: "Learn a skill", icon: "bulb" },
  { name: "No sugar", icon: "nosugar" },
  { name: "1h social media max", icon: "phone" },
  { name: "Planning", icon: "list" },
  { name: "Sleep before 11:00", icon: "moon" },
];
