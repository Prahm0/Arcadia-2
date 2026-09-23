"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/lib/api/client";
import type { DashboardResponse, PlannerEvent, PlannerTask } from "@/lib/api/types";
import { useDashboardData } from "@/lib/app/DashboardProvider";
import { playCompletionTick } from "@/lib/app/completion";
import { addDays, startOfDayMs } from "./calendar";

interface Override<T> {
  patch: Partial<T>;
  /**
   * When the server confirmed it; a fetch that started later already
   * reflects it. Infinity while the save is still in flight.
   */
  at: number;
}

export interface Planner {
  /** Every block in the period, freshest copy first. */
  events: PlannerEvent[];
  /** Every task, done ones included. */
  tasks: PlannerTask[];
  loading: boolean;
  error: string | null;
  setEventDone: (event: PlannerEvent, done: boolean) => Promise<void>;
  moveEvent: (event: PlannerEvent, startMs: number) => Promise<void>;
  setTaskDone: (task: PlannerTask, done: boolean) => Promise<void>;
  moveTask: (task: PlannerTask, dueKey: string) => Promise<void>;
  removeEvent: (event: PlannerEvent) => Promise<void>;
  /** Deletes the task and its study blocks. */
  removeTask: (task: PlannerTask) => Promise<void>;
}

/**
 * The planner's data: the dashboard's live week, plus the rest of the period
 * from /api/events and every task (done ones too) from /api/tasks, so a term
 * can show what was finished as well as what's coming.
 *
 * Changes show at once and are kept as overrides until a fetch made after
 * them comes back, so nothing flickers back to its old state in between.
 */
export function usePlanner(period: { start: string; end: string }, timezone: string): Planner {
  const { data, patch, reload } = useDashboardData();
  const fromMs = startOfDayMs(period.start, timezone);
  const toMs = startOfDayMs(addDays(period.end, 1), timezone);
  const rangeKey = `${fromMs}:${toMs}`;

  const [fetched, setFetched] = useState<{ key: string; events: PlannerEvent[] } | null>(null);
  const [allTasks, setAllTasks] = useState<PlannerTask[] | null>(null);
  const [eventOverrides, setEventOverrides] = useState<Record<string, Override<PlannerEvent>>>({});
  const [taskOverrides, setTaskOverrides] = useState<Record<string, Override<PlannerTask>>>({});
  // Deleted here; hidden at once, before the fetches catch up.
  const [removed, setRemoved] = useState<ReadonlySet<string>>(() => new Set());
  const [version, setVersion] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const errorTimer = useRef<number | null>(null);

  // Refetch when the range changes, after a change of ours, and whenever the
  // dashboard reloads (another tab, a sheet, the auto refresh).
  useEffect(() => {
    let cancelled = false;
    const startedAt = Date.now();
    const from = new Date(fromMs).toISOString();
    const to = new Date(toMs).toISOString();
    api<{ events: PlannerEvent[] }>(`/api/events?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`)
      .then((response) => {
        if (cancelled) return;
        setFetched({ key: rangeKey, events: response.events });
        setEventOverrides((current) => dropOlder(current, startedAt));
      })
      .catch((err) => {
        console.warn("Couldn't load the period's events", err);
        if (!cancelled) setFetched({ key: rangeKey, events: [] });
      });
    return () => {
      cancelled = true;
    };
  }, [rangeKey, fromMs, toMs, version, data.events]);

  useEffect(() => {
    let cancelled = false;
    const startedAt = Date.now();
    api<{ tasks: PlannerTask[] }>("/api/tasks")
      .then((response) => {
        if (cancelled) return;
        setAllTasks(response.tasks);
        setTaskOverrides((current) => dropOlder(current, startedAt));
      })
      .catch((err) => console.warn("Couldn't load tasks", err));
    return () => {
      cancelled = true;
    };
  }, [version, data.tasks]);

  const dashStart = Date.parse(data.range.start);
  const dashEnd = Date.parse(data.range.end);

  const events = useMemo(() => {
    const inRange = (event: PlannerEvent) => Date.parse(event.endAt) > fromMs && Date.parse(event.startAt) < toMs;
    const live = data.events.filter(inRange);
    const ids = new Set(live.map((event) => event.id));
    // Blocks inside the dashboard's week are replanned by it; take those from the dashboard only.
    const stored = fetched?.key === rangeKey
      ? fetched.events.filter((event) => {
          const start = Date.parse(event.startAt);
          return !ids.has(event.id) && inRange(event) && !(start >= dashStart && start <= dashEnd);
        })
      : [];
    return [...live, ...stored]
      .filter((event) => !removed.has(event.id) && !(event.taskId && removed.has(event.taskId)))
      .map((event) => (eventOverrides[event.id] ? { ...event, ...eventOverrides[event.id].patch } : event))
      .sort((a, b) => Date.parse(a.startAt) - Date.parse(b.startAt));
  }, [data.events, fetched, rangeKey, fromMs, toMs, dashStart, dashEnd, eventOverrides, removed]);

  const tasks = useMemo(() => {
    const byId = new Map<string, PlannerTask>();
    for (const task of allTasks ?? []) byId.set(task.id, task);
    // The dashboard's pending tasks are the freshest copy of those.
    for (const task of data.tasks) byId.set(task.id, task);
    return [...byId.values()]
      .filter((task) => !removed.has(task.id))
      .map((task) => (taskOverrides[task.id] ? { ...task, ...taskOverrides[task.id].patch } : task))
      .sort((a, b) => Date.parse(a.dueAt) - Date.parse(b.dueAt));
  }, [allTasks, data.tasks, taskOverrides, removed]);

  const fail = useCallback((message: string) => {
    setError(message);
    if (errorTimer.current) window.clearTimeout(errorTimer.current);
    errorTimer.current = window.setTimeout(() => setError(null), 5000);
  }, []);

  useEffect(() => () => {
    if (errorTimer.current) window.clearTimeout(errorTimer.current);
  }, []);

  /** Shows a change on the event at once, in the planner and the dashboard. */
  const overrideEvent = useCallback(
    (id: string, change: Partial<PlannerEvent> | null) => {
      setEventOverrides((current) => {
        const next = { ...current };
        if (change) next[id] = { patch: { ...current[id]?.patch, ...change }, at: Infinity };
        else delete next[id];
        return next;
      });
      if (change) {
        patch((prev: DashboardResponse) => ({
          ...prev,
          events: prev.events.map((event) => (event.id === id ? { ...event, ...change } : event)),
        }));
      }
    },
    [patch],
  );

  const overrideTask = useCallback((id: string, change: Partial<PlannerTask> | null) => {
    setTaskOverrides((current) => {
      const next = { ...current };
      if (change) next[id] = { patch: { ...current[id]?.patch, ...change }, at: Infinity };
      else delete next[id];
      return next;
    });
  }, []);

  /** The save landed: the next fetch will carry it, so the override can go then. */
  const confirm = useCallback((kind: "event" | "task", id: string) => {
    const stamp = <T,>(current: Record<string, Override<T>>) =>
      current[id] ? { ...current, [id]: { ...current[id], at: Date.now() } } : current;
    if (kind === "event") setEventOverrides(stamp);
    else setTaskOverrides(stamp);
  }, []);

  const settle = useCallback(async () => {
    await reload();
    setVersion((value) => value + 1);
  }, [reload]);

  const setEventDone = useCallback(
    async (event: PlannerEvent, done: boolean) => {
      const outcome = done ? "completed" : "planned";
      if (done) playCompletionTick();
      overrideEvent(event.id, { outcome, status: outcome });
      try {
        await api(`/api/events/${encodeURIComponent(event.id)}/outcome`, {
          method: "POST",
          body: JSON.stringify({ outcome }),
        });
        confirm("event", event.id);
      } catch (err) {
        overrideEvent(event.id, null);
        fail(err instanceof Error ? err.message : "Couldn't save that.");
      }
      await settle();
    },
    [overrideEvent, confirm, fail, settle],
  );

  const moveEvent = useCallback(
    async (event: PlannerEvent, startMs: number) => {
      const length = Date.parse(event.endAt) - Date.parse(event.startAt);
      const startAt = new Date(startMs).toISOString();
      const endAt = new Date(startMs + length).toISOString();
      overrideEvent(event.id, { startAt, endAt, pinned: true });
      try {
        await api(`/api/events/${encodeURIComponent(event.id)}`, {
          method: "PATCH",
          body: JSON.stringify({ startAt, endAt }),
        });
        confirm("event", event.id);
      } catch (err) {
        overrideEvent(event.id, null);
        fail(err instanceof Error ? err.message : "Couldn't move that block.");
      }
      await settle();
    },
    [overrideEvent, confirm, fail, settle],
  );

  const setTaskDone = useCallback(
    async (task: PlannerTask, done: boolean) => {
      const status = done ? "complete" : "pending";
      if (done) playCompletionTick();
      overrideTask(task.id, { status });
      try {
        await api(`/api/tasks/${encodeURIComponent(task.id)}`, {
          method: "PATCH",
          body: JSON.stringify({ status }),
        });
        confirm("task", task.id);
      } catch (err) {
        overrideTask(task.id, null);
        fail(err instanceof Error ? err.message : "Couldn't save that.");
      }
      await settle();
    },
    [overrideTask, confirm, fail, settle],
  );

  const moveTask = useCallback(
    async (task: PlannerTask, dueKey: string) => {
      // Due at the end of the day in the student's timezone, like a new task.
      const dueAt = new Date(startOfDayMs(addDays(dueKey, 1), timezone) - 60_000).toISOString();
      overrideTask(task.id, { dueAt });
      try {
        await api(`/api/tasks/${encodeURIComponent(task.id)}`, {
          method: "PATCH",
          body: JSON.stringify({ dueAt }),
        });
        confirm("task", task.id);
      } catch (err) {
        overrideTask(task.id, null);
        fail(err instanceof Error ? err.message : "Couldn't move that deadline.");
      }
      await settle();
    },
    [overrideTask, confirm, fail, settle, timezone],
  );

  const hide = useCallback((id: string, hidden: boolean) => {
    setRemoved((current) => {
      const next = new Set(current);
      if (hidden) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  const removeEvent = useCallback(
    async (event: PlannerEvent) => {
      hide(event.id, true);
      try {
        await api(`/api/events/${encodeURIComponent(event.id)}`, { method: "DELETE" });
        patch((prev: DashboardResponse) => ({ ...prev, events: prev.events.filter((existing) => existing.id !== event.id) }));
      } catch (err) {
        hide(event.id, false);
        fail(err instanceof Error ? err.message : "Couldn't remove that block.");
      }
      await settle();
    },
    [hide, patch, fail, settle],
  );

  const removeTask = useCallback(
    async (task: PlannerTask) => {
      hide(task.id, true);
      try {
        await api(`/api/tasks/${encodeURIComponent(task.id)}`, { method: "DELETE" });
        patch((prev: DashboardResponse) => ({
          ...prev,
          tasks: prev.tasks.filter((existing) => existing.id !== task.id),
          events: prev.events.filter((event) => event.taskId !== task.id),
        }));
      } catch (err) {
        hide(task.id, false);
        fail(err instanceof Error ? err.message : "Couldn't delete that deadline.");
      }
      await settle();
    },
    [hide, patch, fail, settle],
  );

  return {
    events,
    tasks,
    loading: fetched?.key !== rangeKey,
    error,
    setEventDone,
    moveEvent,
    setTaskDone,
    moveTask,
    removeEvent,
    removeTask,
  };
}

function dropOlder<T>(overrides: Record<string, Override<T>>, before: number): Record<string, Override<T>> {
  const kept = Object.entries(overrides).filter(([, override]) => override.at >= before);
  return kept.length === Object.keys(overrides).length ? overrides : Object.fromEntries(kept);
}
