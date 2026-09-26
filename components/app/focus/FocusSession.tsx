"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { api } from "@/lib/api/client";
import { setPresence } from "@/lib/api/presence";
import { useDashboardData } from "@/lib/app/DashboardProvider";
import type { DashboardResponse, PlannerEvent, SessionPlan } from "@/lib/api/types";
import { subjectColour } from "@/lib/app/subjectColour";
import { useReplaceEvent, useSessionPlan } from "@/lib/app/useSessionPlan";
import { useStudySessionSave } from "@/lib/app/useStudySessionSave";
import CheckoutSheet from "../CheckoutSheet";
import EventDetailSheet from "../EventDetailSheet";
import PipTimer, { PIP_COMPACT_HEIGHT, PIP_WIDTH } from "./PipTimer";
import { useOwnTodos, type TodoItem } from "./SessionTodos";
import { useDocumentPip } from "./useDocumentPip";

/**
 * The focus timer lives here, in the app layout, rather than on the Focus
 * page. Pages unmount when the student moves around the app; the timer, its
 * pop-out window and the session's to-dos keep going. The Focus page is a
 * view onto this session. Nothing runs until the Focus page is first opened.
 */

export const BUILT_IN_PRESETS = [
  { label: "Deep focus", focus: 50 * 60, break: 10 * 60 },
  { label: "Classic", focus: 25 * 60, break: 5 * 60 },
  { label: "Long block", focus: 90 * 60, break: 15 * 60 },
];

/** Free plan: Classic 25/5 (and a scheduled block's own length). The rest are Pro. */
const PRO_PRESETS = new Set(["Deep focus", "Long block", "Custom"]);
export const CLASSIC_INDEX = BUILT_IN_PRESETS.findIndex((preset) => preset.label === "Classic");

const CUSTOM_KEY = "arcadia:focus:custom";
const CUSTOM_DEFAULT = { focusMin: 30, breakMin: 5 };
// Skip the "you barely started" case: reset only logs a session if the user
// actually spent time in focus. Sub-30s pokes stay unlogged so the recents
// list doesn't fill with noise from misclicks.
const RESET_LOG_MIN_SECONDS = 30;
// Study-room presence keepalive. The server treats a timer quiet for 150s as
// gone, so this leaves room for one missed beat.
const PRESENCE_KEEPALIVE_MS = 60_000;

function readCustomPreset(): { focusMin: number; breakMin: number } {
  if (typeof window === "undefined") return CUSTOM_DEFAULT;
  try {
    const raw = window.localStorage.getItem(CUSTOM_KEY);
    if (!raw) return CUSTOM_DEFAULT;
    const parsed = JSON.parse(raw);
    return {
      focusMin: clampMinutes(parsed.focusMin, CUSTOM_DEFAULT.focusMin),
      breakMin: clampMinutes(parsed.breakMin, CUSTOM_DEFAULT.breakMin),
    };
  } catch {
    return CUSTOM_DEFAULT;
  }
}

function writeCustomPreset(value: { focusMin: number; breakMin: number }) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(CUSTOM_KEY, JSON.stringify(value));
  } catch {
    /* ignore */
  }
}

export function clampMinutes(v: unknown, fallback: number): number {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(240, Math.max(1, Math.round(n)));
}

export type Phase = "focus" | "break" | "idle";

const DONE_KEY = "arcadia:focus:done:";
const TIMER_KEY = "arcadia:focus:timer:";

interface SavedTimer {
  eventId: string | null;
  phase: Phase;
  running: boolean;
  remaining: number;
  endsAt: number | null;
  presetLabel: string;
  subject: string;
  goal: string;
  distractions: number;
  activityId: string | null;
}

function readSavedTimer(key: string): SavedTimer | null {
  if (typeof window === "undefined") return null;
  try {
    const value = JSON.parse(window.localStorage.getItem(key) ?? "null") as Partial<SavedTimer> | null;
    if (
      !value ||
      (value.phase !== "idle" && value.phase !== "focus" && value.phase !== "break") ||
      typeof value.running !== "boolean" ||
      typeof value.remaining !== "number" ||
      !Number.isFinite(value.remaining)
    ) return null;
    return value as SavedTimer;
  } catch {
    return null;
  }
}

function writeSavedTimer(key: string, value: SavedTimer) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* The timer still works for this visit when storage is unavailable. */
  }
}

/** Plan steps ticked off in this browser, so a reload mid-session keeps them. */
function readDoneSteps(eventId: string | null): number[] {
  if (!eventId || typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(DONE_KEY + eventId) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((item) => Number.isInteger(item)) : [];
  } catch {
    return [];
  }
}

function writeDoneSteps(eventId: string | null, done: number[]) {
  if (!eventId) return;
  try {
    window.localStorage.setItem(DONE_KEY + eventId, JSON.stringify(done));
  } catch {
    /* storage blocked; the ticks just won't survive a reload */
  }
}

export function formatClock(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

interface Preset {
  label: string;
  focus: number;
  break: number;
}

export interface FocusSession {
  /** The study block this timer is for, or null for a free timer. */
  eventId: string | null;
  linkedEvent: PlannerEvent | null;
  linkedMinutes: number | null;
  studySave: ReturnType<typeof useStudySessionSave>;
  /** Goes up each time a session is logged, so lists of them can refetch. */
  logged: number;

  presets: Preset[];
  preset: Preset;
  presetIndex: number;
  customIndex: number;
  customPreset: { focusMin: number; breakMin: number };
  presetLocked: (label: string) => boolean;
  choosePreset: (index: number) => void;
  changeCustomPreset: (next: { focusMin: number; breakMin: number }) => void;

  phase: Phase;
  remaining: number;
  running: boolean;
  progress: number;
  totalForPhase: number;
  phaseColour: string;
  colour: string | null;
  subject: string;
  setSubject: (subject: string) => void;
  goal: string;
  setGoal: (goal: string) => void;
  sessionGoal: string;
  distractions: number;
  addDistraction: () => void;

  plan: SessionPlan | null;
  planLoading: boolean;
  planRefreshing: boolean;
  refreshPlan: () => Promise<void>;
  todos: TodoItem[];
  toggleTodo: (key: string) => void;
  addTodo: (text: string) => void;
  removeTodo: (key: string) => void;

  /** The timer reached zero, for Study with me's end screen. */
  complete: boolean;
  clearComplete: () => void;

  start: () => void;
  pause: () => void;
  reset: () => void;
  skip: () => void;
  finishSession: () => void;
  /** "Start now" from Today: straight into a running focus block. */
  beginNow: () => void;
  /** Back to an idle free timer, before the page drops the study block. */
  detach: () => void;

  pip: {
    supported: boolean;
    open: boolean;
    blocked: boolean;
    popOut: () => Promise<void>;
    close: () => void;
  };
}

type Store = {
  get: () => FocusSession | null;
  set: (value: FocusSession | null) => void;
  subscribe: (listener: () => void) => () => void;
};

function createStore(): Store {
  let value: FocusSession | null = null;
  const listeners = new Set<() => void>();
  return {
    get: () => value,
    set(next) {
      value = next;
      listeners.forEach((listener) => listener());
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

interface FocusSessionContext {
  store: Store;
  select: (eventId: string | null) => void;
}

const Context = createContext<FocusSessionContext | null>(null);

/** The running focus session (null until the Focus page first opens one), and a way to switch it. */
export function useFocusSession() {
  const context = useContext(Context);
  if (!context) throw new Error("useFocusSession needs a FocusSessionProvider");
  const session = useSyncExternalStore(context.store.subscribe, context.store.get, () => null);
  return { session, select: context.select };
}

export function FocusSessionProvider({ children }: { children: ReactNode }) {
  const [store] = useState(createStore);
  // undefined: the Focus page hasn't been opened yet, so no timer runs.
  const [eventId, setEventId] = useState<string | null | undefined>(undefined);
  const select = useCallback((next: string | null) => setEventId(next), []);
  const context = useMemo(() => ({ store, select }), [store, select]);

  // The pop-out window belongs to the app, not the session, so it survives
  // moving between pages and between sessions.
  const pipWindow = useDocumentPip();
  const [pipExpanded, setPipExpanded] = useState(false);
  const [pipBlocked, setPipBlocked] = useState(false);
  const { open: openPip } = pipWindow;
  const popOut = useCallback(async () => {
    setPipExpanded(false);
    const win = await openPip({ width: PIP_WIDTH, height: PIP_COMPACT_HEIGHT });
    setPipBlocked(win === null);
  }, [openPip]);

  return (
    <Context.Provider value={context}>
      {children}
      {eventId !== undefined ? (
        // Keyed so a different study block starts from its own saved state,
        // as the page used to when it remounted.
        <FocusEngine
          key={eventId ?? "free"}
          eventId={eventId}
          store={store}
          pipWindow={pipWindow.pipWindow}
          pip={{ supported: pipWindow.supported, open: pipWindow.pipWindow !== null, blocked: pipBlocked, popOut, close: pipWindow.close }}
          pipExpanded={pipExpanded}
          onPipExpandedChange={setPipExpanded}
        />
      ) : null}
    </Context.Provider>
  );
}

interface EngineProps {
  eventId: string | null;
  store: Store;
  pipWindow: Window | null;
  pip: FocusSession["pip"];
  pipExpanded: boolean;
  onPipExpandedChange: (expanded: boolean) => void;
}

function FocusEngine({ eventId, store, pipWindow, pip, pipExpanded, onPipExpandedChange }: EngineProps) {
  const { data, reload, patch } = useDashboardData();
  const studySave = useStudySessionSave(data.user.id);
  const activityId = useRef<string | null>(null);
  const timezone = data.profile?.timezone || data.user.timezone || "Australia/Sydney";

  const timerSessionEventId = useRef(eventId);
  const timerStorageKey = useRef(`${TIMER_KEY}${data.user.id}:${eventId ?? "free"}`).current;
  const linkedEvent = useMemo<PlannerEvent | null>(() => {
    if (!eventId) return null;
    return data.events.find((event) => event.id === eventId) ?? null;
  }, [data.events, eventId]);

  const linkedMinutes = linkedEvent
    ? Math.round((Date.parse(linkedEvent.endAt) - Date.parse(linkedEvent.startAt)) / 60000)
    : null;

  const [customPreset, setCustomPreset] = useState(CUSTOM_DEFAULT);
  useEffect(() => {
    setCustomPreset(readCustomPreset());
  }, []);
  const breakSeconds = Math.max(5, Number(data.preferences?.breakMinutes ?? 10) || 10) * 60;
  const PRESETS = useMemo(
    () => [
      // A scheduled session runs for its own length, not the nearest preset's.
      ...(linkedMinutes ? [{ label: "This session", focus: linkedMinutes * 60, break: breakSeconds }] : []),
      ...BUILT_IN_PRESETS,
      {
        label: "Custom",
        focus: customPreset.focusMin * 60,
        break: customPreset.breakMin * 60,
      },
    ],
    [customPreset, linkedMinutes, breakSeconds],
  );
  const customIndex = PRESETS.length - 1;
  const paidPlan = data.user.tier === "pro" || data.user.tier === "max";
  const presetLocked = (label: string) => !paidPlan && PRO_PRESETS.has(label);
  // Free students start on Classic; a scheduled block always opens on its own length.
  const [presetIndex, setPresetIndex] = useState(() => (linkedMinutes || paidPlan ? 0 : CLASSIC_INDEX));
  const [phase, setPhase] = useState<Phase>("idle");
  useEffect(() => { if (phase === "focus") activityId.current = crypto.randomUUID(); }, [phase]);
  const [remaining, setRemaining] = useState(PRESETS[presetIndex].focus);
  const [running, setRunning] = useState(false);
  const [subject, setSubject] = useState(
    linkedEvent?.subject || data.subjects[0]?.name || "General",
  );
  const [goal, setGoal] = useState(linkedEvent?.title ?? "");
  const [distractions, setDistractions] = useState(0);
  const [complete, setComplete] = useState(false);
  const [logged, setLogged] = useState(0);
  const intervalRef = useRef<number | null>(null);
  const timerEndsAtRef = useRef<number | null>(null);
  const [timerRestored, setTimerRestored] = useState(false);
  const preset = PRESETS[presetIndex] ?? PRESETS[0];

  // Scheduled sessions: Arcad's plan, the steps ticked off so far (kept per
  // session in this browser, in case the page reloads), and the check-out.
  const { plan, loading: planLoading, refresh: refreshPlan, refreshing: planRefreshing } = useSessionPlan(linkedEvent);
  const replaceEvent = useReplaceEvent();
  const [doneSteps, setDoneSteps] = useState<number[]>(() => readDoneSteps(eventId));
  const [checkout, setCheckout] = useState<{ minutes: number } | null>(null);
  const [missReasonEvent, setMissReasonEvent] = useState<PlannerEvent | null>(null);
  const sessionGoal = plan?.topic ?? goal;
  const colour = linkedEvent ? subjectColour(data.subjects, linkedEvent.subject) ?? "var(--app-accent)" : null;

  function toggleStep(index: number) {
    setDoneSteps((prev) => {
      const next = prev.includes(index) ? prev.filter((item) => item !== index) : [...prev, index];
      writeDoneSteps(eventId, next);
      return next;
    });
  }

  // One to-do list for the session: Arcad's plan steps first, then whatever
  // the student adds. Same list on the page and in the pop-out.
  const ownTodos = useOwnTodos(eventId ?? "free");
  const todos = useMemo<TodoItem[]>(() => [
    ...(plan?.steps ?? []).map((step, index) => ({
      key: `step:${index}`,
      text: step.text,
      minutes: step.minutes,
      done: doneSteps.includes(index),
      removable: false,
    })),
    ...ownTodos.items.map((item) => ({ key: `own:${item.id}`, text: item.text, done: item.done, removable: true })),
  ], [plan, doneSteps, ownTodos.items]);

  function toggleTodo(key: string) {
    if (key.startsWith("step:")) toggleStep(Number(key.slice(5)));
    else ownTodos.toggle(key.slice(4));
  }

  function removeTodo(key: string) {
    if (key.startsWith("own:")) ownTodos.remove(key.slice(4));
  }

  // If the linked event arrives after mount (the dashboard was still loading),
  // sync the visible fields once, do not clobber values the user already edited.
  const hasHydrated = useRef(false);
  useEffect(() => {
    if (hasHydrated.current) return;
    if (!linkedEvent) {
      hasHydrated.current = true;
      return;
    }
    hasHydrated.current = true;
    setPresetIndex(0);
    // A session already under way (the page was reloaded) picks up the clock.
    const left = linkedEvent.startedAt ? Math.round((Date.parse(linkedEvent.endAt) - Date.now()) / 1000) : 0;
    setRemaining(left > 60 ? left : (linkedMinutes ?? 50) * 60);
    if (left > 60) setPhase("focus");
    setSubject(linkedEvent.subject || data.subjects[0]?.name || "General");
    setGoal(linkedEvent.plan?.topic ?? linkedEvent.title);
  }, [linkedEvent, linkedMinutes, data.subjects]);

  // A reload, or switching to another study block and back, starts this
  // session over. Keep it in this browser so its deadline and setup survive.
  const didRestoreTimer = useRef(false);
  useEffect(() => {
    if (didRestoreTimer.current) return;
    didRestoreTimer.current = true;
    const saved = readSavedTimer(timerStorageKey);
    if (saved && saved.eventId === timerSessionEventId.current) {
      const savedPresetIndex = PRESETS.findIndex((item) => item.label === saved.presetLabel);
      if (savedPresetIndex >= 0) setPresetIndex(savedPresetIndex);
      setPhase(saved.phase);
      setSubject(saved.subject || linkedEvent?.subject || data.subjects[0]?.name || "General");
      setGoal(saved.goal ?? linkedEvent?.title ?? "");
      setDistractions(Number.isInteger(saved.distractions) ? saved.distractions : 0);
      activityId.current = saved.activityId ?? null;
      const left = saved.running && typeof saved.endsAt === "number"
        ? Math.max(0, Math.ceil((saved.endsAt - Date.now()) / 1000))
        : Math.max(0, Math.round(saved.remaining));
      setRemaining(left);
      setRunning(saved.running);
      timerEndsAtRef.current = saved.running && typeof saved.endsAt === "number"
        ? saved.endsAt
        : null;
    }
    setTimerRestored(true);
  // Restore once for the session key. The linked event is used only as a
  // fallback for old or incomplete saved values.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Ends a scheduled session now: log the time spent and check out. */
  function finishSession() {
    const elapsed = phase === "focus" ? preset.focus - remaining : 0;
    if (elapsed >= RESET_LOG_MIN_SECONDS) void logSession("focus", elapsed);
    setRunning(false);
    setPhase("idle");
    setRemaining(preset.focus);
    setCheckout({ minutes: Math.max(1, Math.round((elapsed || preset.focus) / 60)) });
  }

  // Counts down against the wall clock rather than by one per tick: once the
  // timer is popped out the tab sits in the background, where the browser
  // throttles timers, and a tick-counted clock would fall behind.
  const remainingRef = useRef(remaining);
  useEffect(() => {
    remainingRef.current = remaining;
  });
  useEffect(() => {
    if (!running) return;
    const endsAt = timerEndsAtRef.current ?? (Date.now() + remainingRef.current * 1000);
    timerEndsAtRef.current = endsAt;
    intervalRef.current = window.setInterval(() => {
      const next = Math.max(0, Math.round((endsAt - Date.now()) / 1000));
      if (next === 0) setComplete(true);
      setRemaining(next);
    }, 250);
    return () => {
      if (intervalRef.current) window.clearInterval(intervalRef.current);
    };
    // Restarts when the phase flips, so a break counts from its own length.
  }, [running, phase]);

  // Persist on session changes and every five seconds while counting down.
  // The absolute deadline keeps elapsed time accurate across a reload.
  useEffect(() => {
    if (!timerRestored || (running && remaining % 5 !== 0)) return;
    writeSavedTimer(timerStorageKey, {
      eventId: timerSessionEventId.current,
      phase,
      running,
      remaining,
      endsAt: running ? timerEndsAtRef.current : null,
      presetLabel: preset.label,
      subject,
      goal,
      distractions,
      activityId: activityId.current,
    });
  }, [timerRestored, timerStorageKey, phase, running, remaining, preset.label, subject, goal, distractions]);

  useEffect(() => {
    if (remaining !== 0) return;
    // This phase's deadline has passed. Drop it so whatever runs next (the
    // break, straight away) counts from its own length.
    timerEndsAtRef.current = null;
    // A scheduled session ends in a check-out rather than a break.
    if (phase === "focus" && linkedEvent && !linkedEvent.checkout) {
      void logSession("focus", preset.focus);
      setRunning(false);
      setPhase("idle");
      setRemaining(preset.focus);
      setCheckout({ minutes: Math.round(preset.focus / 60) });
      return;
    }
    if (phase === "focus") {
      void logSession("focus", preset.focus, { markEvent: "completed" });
      setPhase("break");
      setRemaining(preset.break);
    } else if (phase === "break") {
      setPhase("focus");
      setRemaining(preset.focus);
      setRunning(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remaining, phase, preset]);

  // Study rooms: publish what this timer is doing. Sent when it starts, stops
  // or changes phase, then once a minute while it runs so the server can tell
  // a live timer from a closed tab. A paused timer reads as idle.
  const presenceRef = useRef({ phase, remaining, subject, total: preset.focus });
  // Declared before the effects that read it, so it is current when they run.
  useEffect(() => {
    presenceRef.current = {
      phase,
      remaining,
      subject,
      total: phase === "break" ? preset.break : preset.focus,
    };
  });
  const wasLive = useRef(false);

  const publishPresence = useCallback((live: boolean) => {
    if (!live) {
      // Only an actual stop is worth a write; opening the page idle isn't.
      if (wasLive.current) setPresence({ activity: "idle" });
      wasLive.current = false;
      return;
    }
    const { phase: current, remaining: left, subject: on, total } = presenceRef.current;
    if (current === "idle") return;
    wasLive.current = true;
    setPresence({
      activity: current,
      subject: on,
      // Back-dated by the time already on the clock, so a resumed timer shows
      // the right "min in" to friends.
      startedAt: new Date(Date.now() - (total - left) * 1000).toISOString(),
      durationSeconds: total,
    });
  }, []);

  useEffect(() => {
    publishPresence(running);
    if (!running) return;
    const id = window.setInterval(() => publishPresence(true), PRESENCE_KEEPALIVE_MS);
    return () => window.clearInterval(id);
  }, [running, phase, presetIndex, publishPresence]);

  // A subject edit mid-session reaches the room once typing settles.
  useEffect(() => {
    if (!wasLive.current) return;
    const id = window.setTimeout(() => publishPresence(true), 1500);
    return () => window.clearTimeout(id);
  }, [subject, publishPresence]);

  // Switching to another session or leaving the app stops this timer, so
  // stop showing as studying.
  useEffect(() => () => publishPresence(false), [publishPresence]);

  async function logSession(
    type: string,
    seconds: number,
    opts: { markEvent?: "completed" | "missed" } = {},
  ) {
    if (seconds > 0) {
      activityId.current ??= crypto.randomUUID();
      await studySave.save({ activityId: activityId.current, type, seconds, subject, goal: sessionGoal, distractions, endedAt: new Date().toISOString() });
    }

    if (linkedEvent && opts.markEvent) {
      const outcome = opts.markEvent;
      try {
        await api(`/api/events/${encodeURIComponent(linkedEvent.id)}/outcome`, {
          method: "POST",
          body: JSON.stringify({ outcome }),
        });
        patch((prev: DashboardResponse) => ({
          ...prev,
          events: prev.events.map((existing) =>
            existing.id === linkedEvent.id
              ? {
                  ...existing,
                  outcome,
                  status: outcome === "completed" ? "completed" : "missed",
                }
              : existing,
          ),
        }));
      } catch {
        /* ignore */
      }
    }

    try {
      await reload();
    } catch {
      /* ignore */
    }

    // A session that just finished should be at the top of Recents already.
    setLogged((count) => count + 1);
  }

  function start() {
    setComplete(false);
    timerEndsAtRef.current = null;
    if (phase === "idle") {
      setPhase("focus");
      setRemaining(preset.focus);
    }
    setRunning(true);
  }

  function pause() {
    if (running && timerEndsAtRef.current !== null) {
      setRemaining(Math.max(0, Math.ceil((timerEndsAtRef.current - Date.now()) / 1000)));
    }
    timerEndsAtRef.current = null;
    setRunning(false);
  }

  function reset() {
    // If the user pressed reset mid-focus after actually working for a bit,
    // log the effort so it isn't lost. Shorter pokes stay unlogged so recents
    // don't fill with misclick noise (see RESET_LOG_MIN_SECONDS).
    if (phase === "focus") {
      const elapsed = preset.focus - remaining;
      if (elapsed >= RESET_LOG_MIN_SECONDS) {
        void logSession("focus", elapsed);
      }
    }
    setRunning(false);
    setPhase("idle");
    setRemaining(preset.focus);
    setDistractions(0);
    setComplete(false);
  }

  function skip() {
    if (phase === "focus") {
      // Skipping out of focus = you didn't finish. If linked, mark the block missed.
      if (linkedEvent && paidPlan) {
        void logSession("focus", preset.focus - remaining);
        setMissReasonEvent(linkedEvent);
      } else {
        void logSession("focus", preset.focus - remaining, {
          markEvent: linkedEvent ? "missed" : undefined,
        });
      }
      setPhase("break");
      setRemaining(preset.break);
    } else {
      setPhase("focus");
      setRemaining(preset.focus);
    }
    timerEndsAtRef.current = null;
    setRunning(false);
    setComplete(false);
  }

  function beginNow() {
    setPhase("focus");
    setRunning(true);
  }

  function detach() {
    setRunning(false);
    setPhase("idle");
    const index = paidPlan ? 0 : CLASSIC_INDEX;
    setPresetIndex(index);
    setRemaining(BUILT_IN_PRESETS[index].focus);
  }

  function choosePreset(index: number) {
    setPresetIndex(index);
    setPhase("idle");
    setRemaining(PRESETS[index].focus);
    setRunning(false);
  }

  function changeCustomPreset(next: { focusMin: number; breakMin: number }) {
    setCustomPreset(next);
    writeCustomPreset(next);
    if (phase === "idle" && next.focusMin !== customPreset.focusMin) setRemaining(next.focusMin * 60);
  }

  const totalForPhase = phase === "break" ? preset.break : preset.focus;
  const progress = 1 - remaining / totalForPhase;
  const phaseColour = phase === "break" ? "var(--app-success)" : colour ?? "var(--app-accent)";

  const session: FocusSession = {
    eventId,
    linkedEvent,
    linkedMinutes,
    studySave,
    logged,
    presets: PRESETS,
    preset,
    presetIndex,
    customIndex,
    customPreset,
    presetLocked,
    choosePreset,
    changeCustomPreset,
    phase,
    remaining,
    running,
    progress,
    totalForPhase,
    phaseColour,
    colour,
    subject,
    setSubject,
    goal,
    setGoal,
    sessionGoal,
    distractions,
    addDistraction: () => setDistractions((d) => d + 1),
    plan,
    planLoading,
    planRefreshing,
    refreshPlan,
    todos,
    toggleTodo,
    addTodo: ownTodos.add,
    removeTodo,
    complete,
    clearComplete: () => setComplete(false),
    start,
    pause,
    reset,
    skip,
    finishSession,
    beginNow,
    detach,
    pip,
  };

  // Hand the latest state to the Focus page, if it's open.
  useLayoutEffect(() => {
    store.set(session);
  });
  useLayoutEffect(() => () => store.set(null), [store]);

  return (
    <>
      {pipWindow ? (
        <PipTimer
          win={pipWindow}
          phase={phase}
          clock={formatClock(remaining)}
          progress={progress}
          running={running}
          subject={linkedEvent ? sessionGoal || subject : subject}
          accent={colour ?? "var(--app-accent)"}
          expanded={pipExpanded}
          onExpandedChange={onPipExpandedChange}
          onPlay={start}
          onPause={pause}
          onSkip={skip}
          todos={todos}
          onToggleTodo={toggleTodo}
          onAddTodo={ownTodos.add}
          onRemoveTodo={removeTodo}
        />
      ) : null}

      {linkedEvent ? (
        <CheckoutSheet
          open={checkout !== null}
          event={linkedEvent}
          initialDone={doneSteps}
          minutes={checkout?.minutes ?? linkedMinutes ?? 0}
          onClose={() => setCheckout(null)}
          onSaved={async (updated) => {
            replaceEvent(updated);
            writeDoneSteps(linkedEvent.id, []);
            await reload();
          }}
        />
      ) : null}
      <EventDetailSheet
        event={missReasonEvent}
        timezone={timezone}
        initialMode="miss-reason"
        onClose={() => setMissReasonEvent(null)}
      />
    </>
  );
}
