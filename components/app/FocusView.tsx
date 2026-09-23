"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/lib/api/client";
import { setPresence } from "@/lib/api/presence";
import { useDashboardData } from "@/lib/app/DashboardProvider";
import type { DashboardResponse, PlannerEvent } from "@/lib/api/types";
import { cn } from "@/lib/cn";
import { formatClock as formatWallClock } from "@/lib/api/time";
import { subjectColour } from "@/lib/app/subjectColour";
import { useReplaceEvent, useSessionPlan } from "@/lib/app/useSessionPlan";
import CheckoutSheet from "./CheckoutSheet";
import EventDetailSheet from "./EventDetailSheet";
import PageHeader from "./PageHeader";
import AppButton from "./AppButton";
import SyllabusNudge from "./SyllabusNudge";
import PipTimer, { PIP_COMPACT_HEIGHT, PIP_WIDTH, PlayPauseIcon } from "./focus/PipTimer";
import SessionTodos, { useOwnTodos, type TodoItem } from "./focus/SessionTodos";
import { useDocumentPip } from "./focus/useDocumentPip";

const BUILT_IN_PRESETS = [
  { label: "Deep focus", focus: 50 * 60, break: 10 * 60 },
  { label: "Classic", focus: 25 * 60, break: 5 * 60 },
  { label: "Long block", focus: 90 * 60, break: 15 * 60 },
];

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

function clampMinutes(v: unknown, fallback: number): number {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(240, Math.max(1, Math.round(n)));
}

type Phase = "focus" | "break" | "idle";
type AsideTab = "setup" | "todo" | "recents";

interface StudySession {
  id: string;
  type: string;
  seconds: number;
  subject: string | null;
  goal: string | null;
  distractions: number;
  endedAt: string;
}

export default function FocusView() {
  return (
    <Suspense fallback={null}>
      <FocusViewInner />
    </Suspense>
  );
}

const DONE_KEY = "arcadia:focus:done:";

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

function FocusViewInner() {
  const { data, reload, patch } = useDashboardData();
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const timezone = data.profile?.timezone || data.user.timezone || "Australia/Sydney";

  const eventId = params.get("eventId");
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
  const [presetIndex, setPresetIndex] = useState(0);
  const [phase, setPhase] = useState<Phase>("idle");
  const [remaining, setRemaining] = useState(PRESETS[presetIndex].focus);
  const [running, setRunning] = useState(false);
  const [subject, setSubject] = useState(
    linkedEvent?.subject || data.subjects[0]?.name || "General",
  );
  const [goal, setGoal] = useState(linkedEvent?.title ?? "");
  const [distractions, setDistractions] = useState(0);
  // A scheduled session already knows what it's on, so it opens on its to-dos.
  const [tab, setTab] = useState<AsideTab>(eventId ? "todo" : "setup");
  const [recents, setRecents] = useState<StudySession[] | null>(null);
  const [recentsError, setRecentsError] = useState(false);
  const intervalRef = useRef<number | null>(null);
  const preset = PRESETS[presetIndex] ?? PRESETS[0];

  // Scheduled sessions: Arcad's plan, the steps ticked off so far (kept per
  // session in this browser, in case the page reloads), and the check-out.
  const { plan, loading: planLoading, refresh: refreshPlan, refreshing: planRefreshing } = useSessionPlan(linkedEvent);
  const replaceEvent = useReplaceEvent();
  const [doneSteps, setDoneSteps] = useState<number[]>(() => readDoneSteps(eventId));
  const [checkout, setCheckout] = useState<{ minutes: number } | null>(null);
  const [missReasonEvent, setMissReasonEvent] = useState<PlannerEvent | null>(null);
  const hasPaidPlan = data.user.tier === "pro" || data.user.tier === "max";
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

  const pip = useDocumentPip();
  const [pipExpanded, setPipExpanded] = useState(false);
  const [pipBlocked, setPipBlocked] = useState(false);

  async function popOut() {
    setPipExpanded(false);
    const win = await pip.open({ width: PIP_WIDTH, height: PIP_COMPACT_HEIGHT });
    setPipBlocked(win === null);
  }

  const loadRecents = useCallback(async () => {
    try {
      const res = await api<{ sessions: StudySession[] }>("/api/study-sessions");
      // The endpoint returns the last 30 days unordered; newest first is what
      // a "recents" list means.
      setRecents(
        [...(res.sessions ?? [])].sort(
          (a, b) => Date.parse(b.endedAt) - Date.parse(a.endedAt),
        ),
      );
      setRecentsError(false);
    } catch {
      setRecentsError(true);
    }
  }, []);

  useEffect(() => {
    void loadRecents();
  }, [loadRecents]);

  // If the ?eventId= arrives after mount (rare but possible with client-side nav),
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

  // "Start now" from Today: the block moves to now, and the timer runs
  // straight away. The flag comes off the URL so a reload doesn't restart it.
  const autoStarted = useRef(false);
  const wantsStart = params.get("start") === "1";
  useEffect(() => {
    if (!wantsStart || !linkedEvent || autoStarted.current) return;
    autoStarted.current = true;
    const id = linkedEvent.id;
    void (async () => {
      try {
        const response = await api<{ event: PlannerEvent }>(`/api/events/${encodeURIComponent(id)}/start`, { method: "POST" });
        replaceEvent(response.event);
      } catch {
        /* the timer still runs; the block just isn't moved */
      }
      router.replace(`${pathname}?eventId=${encodeURIComponent(id)}`);
      setPhase("focus");
      setRunning(true);
    })();
  }, [wantsStart, linkedEvent, replaceEvent, router, pathname]);

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
    const endsAt = Date.now() + remainingRef.current * 1000;
    intervalRef.current = window.setInterval(() => {
      setRemaining(Math.max(0, Math.round((endsAt - Date.now()) / 1000)));
    }, 250);
    return () => {
      if (intervalRef.current) window.clearInterval(intervalRef.current);
    };
    // Restarts when the phase flips, so a break counts from its own length.
  }, [running, phase]);

  useEffect(() => {
    if (remaining !== 0) return;
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

  // Leaving the focus page stops the timer, so stop showing as studying.
  useEffect(() => () => publishPresence(false), [publishPresence]);

  async function logSession(
    type: string,
    seconds: number,
    opts: { markEvent?: "completed" | "missed" } = {},
  ) {
    try {
      await api("/api/study-sessions", {
        method: "POST",
        body: JSON.stringify([
          { type, seconds, subject, goal: sessionGoal, distractions, endedAt: new Date().toISOString() },
        ]),
      });
    } catch {
      /* swallow, the local timer stays truthful even if the log fails */
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
    void loadRecents();
  }

  function start() {
    if (phase === "idle") {
      setPhase("focus");
      setRemaining(preset.focus);
    }
    setRunning(true);
  }

  function pause() {
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
  }

  function skip() {
    if (phase === "focus") {
      // Skipping out of focus = you didn't finish. If linked, mark the block missed.
      if (linkedEvent && hasPaidPlan) {
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
    setRunning(false);
  }

  function detach() {
    setRunning(false);
    setPhase("idle");
    setPresetIndex(0);
    setRemaining(BUILT_IN_PRESETS[0].focus);
    router.replace("/app/focus");
  }

  const totalForPhase = phase === "break" ? preset.break : preset.focus;
  const progress = 1 - remaining / totalForPhase;
  const phaseColour = phase === "break" ? "var(--app-success)" : colour ?? "var(--app-accent)";
  const todosDone = todos.filter((item) => item.done).length;

  // A scheduled session is already set up, so it has no Setup tab.
  const tabs: AsideTab[] = linkedEvent ? ["todo", "recents"] : ["setup", "todo", "recents"];
  const activeTab = tabs.includes(tab) ? tab : tabs[0];

  const todayMinutes = Number(data.analytics?.todayMinutes ?? 0);

  return (
    <>
      <PageHeader width={960}
        eyebrow="Study"
        title="Focus"
        meta={`${phase === "break" ? "On a break · " : ""}${todayMinutes} min focused today`}
        // No tour popping up over a session that has just started.
        tour={linkedEvent ? undefined : "focus"}
      />

      {linkedEvent ? (
        // What this session is, in one glance: subject and time, Arcad's
        // topic, and why it's the thing to do now.
        <div className="border-b" style={{ borderColor: "var(--app-border)", background: "var(--app-surface)" }}>
          <div className="mx-auto flex max-w-[960px] gap-4 px-6 py-5 sm:px-10">
            <span aria-hidden="true" className="w-1 shrink-0 rounded-full" style={{ background: colour ?? "var(--app-accent)" }} />
            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-center gap-x-2 text-[12.5px] font-medium" style={{ color: "var(--app-text-muted)" }}>
                <span style={{ color: "var(--app-text-soft)" }}>{linkedEvent.subject ?? "Study"}</span>
                <span aria-hidden="true">·</span>
                <span className="tabular-nums">
                  {formatWallClock(linkedEvent.startAt, timezone)}–{formatWallClock(linkedEvent.endAt, timezone)}
                </span>
                {linkedMinutes ? (
                  <>
                    <span aria-hidden="true">·</span>
                    <span className="tabular-nums">{linkedMinutes} min</span>
                  </>
                ) : null}
              </p>
              <h2 className="mt-1 truncate text-[22px] font-semibold tracking-[-0.015em]" style={{ color: "var(--app-text)" }}>
                {plan?.topic ?? (linkedEvent.taskId ? linkedEvent.title : linkedEvent.subject ?? "Study session")}
              </h2>
              <p className="mt-0.5 text-[14px]" style={{ color: plan ? "var(--app-text-soft)" : "var(--app-text-muted)" }} role={plan ? undefined : "status"}>
                {plan ? plan.why : planLoading ? "Arcad's setting this one up…" : "No plan for this one."}
              </p>
            </div>
            <button
              type="button"
              onClick={detach}
              className="ui-press self-start rounded-md px-2 py-1 text-[12px] hover:bg-[color-mix(in_oklab,var(--app-text)_6%,transparent)]"
              style={{ color: "var(--app-text-muted)" }}
            >
              Detach
            </button>
          </div>
        </div>
      ) : null}

      <div className="mx-auto grid w-full max-w-[960px] gap-6 px-6 py-8 sm:px-10 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div
          className="relative flex flex-col items-center rounded-xl px-6 pb-8 pt-12"
          style={{ background: "var(--app-surface)", boxShadow: "var(--elev-1)" }}
        >
          {pip.supported ? (
            <button
              type="button"
              onClick={pip.pipWindow ? pip.close : () => void popOut()}
              title={pip.pipWindow ? "Put the timer back on this page" : "Float the timer over your other windows"}
              className="ui-press absolute right-3 top-3 flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[12.5px] font-medium hover:bg-[color-mix(in_oklab,var(--app-text)_6%,transparent)]"
              style={{ color: pip.pipWindow ? "var(--app-text)" : "var(--app-text-muted)" }}
            >
              <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <rect x="1.75" y="2.75" width="12.5" height="10.5" rx="2" />
                {pip.pipWindow ? <path d="M10.5 6.5h-3v3M7.5 6.5l3.5 3.5" /> : <rect x="8" y="8" width="4.5" height="3.5" rx="0.75" fill="currentColor" stroke="none" />}
              </svg>
              {pip.pipWindow ? "Bring back" : "Pop out"}
            </button>
          ) : null}
          {pipBlocked && !pip.pipWindow ? (
            <p role="status" className="app-enter absolute right-4 top-12 max-w-[220px] text-right text-[12px]" style={{ color: "var(--app-text-muted)" }}>
              This browser wouldn&rsquo;t open the pop-out. Try Chrome or Edge.
            </p>
          ) : null}

          <div className="relative aspect-square w-full max-w-[300px]">
            <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90">
              <circle cx="50" cy="50" r="45" fill="none" stroke="var(--app-border)" strokeWidth="3" />
              <circle
                cx="50" cy="50" r="45" fill="none"
                stroke={phaseColour}
                strokeWidth="3"
                strokeLinecap="round"
                strokeDasharray={`${2 * Math.PI * 45}`}
                strokeDashoffset={`${2 * Math.PI * 45 * (1 - progress)}`}
                style={{ transition: "stroke-dashoffset 1s linear, stroke 400ms ease-out" }}
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span
                className={cn("type-eyebrow", running && "app-breathe")}
                style={{ color: running ? phaseColour : "var(--app-text-muted)" }}
              >
                {phase === "break" ? "Break" : phase === "focus" ? "Focus" : "Ready"}
              </span>
              {/* Keyed on the minute so the digits give one beat per minute
                  elapsed, enough to read as live without being a distraction. */}
              <span
                key={Math.floor(remaining / 60)}
                className={cn(
                  "mt-2 text-[60px] font-medium tabular-nums tracking-[-0.03em]",
                  running && "app-tick",
                )}
                style={{ color: "var(--app-text)" }}
              >
                {formatClock(remaining)}
              </span>
              <span className="mt-1 max-w-[70%] truncate text-[13px]" style={{ color: "var(--app-text-muted)" }}>
                {subject}
              </span>
              {pip.pipWindow ? (
                <span className="app-enter mt-3 rounded-full px-2.5 py-1 text-[11.5px] font-medium" style={{ background: "var(--app-accent-soft)", color: "var(--app-text-soft)" }}>
                  Popped out
                </span>
              ) : null}
            </div>
          </div>

          <div className="mt-8 flex items-start justify-center gap-6">
            <TimerControl label="Reset" onClick={reset}>
              <svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M2.75 8a5.25 5.25 0 1 0 1.6-3.77M2.75 2.5v2.75H5.5" />
              </svg>
            </TimerControl>
            <div className="flex flex-col items-center gap-1.5">
              <button
                type="button"
                onClick={running ? pause : start}
                aria-label={running ? "Pause" : phase === "idle" ? "Start" : "Resume"}
                className="ui-press grid h-16 w-16 place-items-center rounded-full shadow-[var(--elev-2)]"
                style={{ background: phaseColour, color: "var(--app-accent-on)" }}
              >
                <PlayPauseIcon running={running} size={20} />
              </button>
              <span className="text-[12px] font-medium" style={{ color: "var(--app-text-soft)" }}>
                {running ? "Pause" : phase === "idle" ? "Start" : "Resume"}
              </span>
            </div>
            <TimerControl label={phase === "break" ? "Skip break" : "Skip"} onClick={skip} disabled={phase === "idle"}>
              <svg viewBox="0 0 16 16" width="15" height="15" fill="currentColor" aria-hidden="true">
                <path d="M3 3.25v9.5L9.5 8zM10.75 3.25h2v9.5h-2z" />
              </svg>
            </TimerControl>
          </div>

          {phase !== "idle" ? (
            <button
              type="button"
              onClick={() => setDistractions((d) => d + 1)}
              className="ui-press app-enter mt-7 rounded-full px-4 py-1.5 text-[12.5px] font-medium hover:text-[var(--app-text)]"
              style={{ boxShadow: "inset 0 0 0 1px var(--app-border-strong)", color: "var(--app-text-muted)" }}
            >
              Distraction ·{" "}
              {/* Keyed so each tap visibly registers on the count itself. */}
              <span key={distractions} className="app-pop tabular inline-block">
                {distractions}
              </span>
            </button>
          ) : null}

          {!linkedEvent && data.events.some((e) => e.category === "study" && e.outcome === "planned") ? (
            <Link
              href="/app"
              className="mt-6 text-[12.5px] underline underline-offset-4 transition-colors hover:text-[var(--app-text)]"
              style={{ color: "var(--app-text-muted)" }}
            >
              Focus on a scheduled study block
            </Link>
          ) : null}
        </div>

        <aside className="flex flex-col gap-4">
          {/* The timer stays put; only the panel beside it swaps. */}
          <div
            role="tablist"
            aria-label="Focus panel"
            className="inset-ring relative grid gap-1 rounded-lg p-1"
            style={{ background: "var(--app-surface-soft)", gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}
          >
            <span
              aria-hidden="true"
              className="absolute bottom-1 left-1 top-1 rounded-md transition-transform duration-300 ease-[var(--ease-out-expo)]"
              style={{
                width: `calc((100% - 0.5rem - ${(tabs.length - 1) * 0.25}rem) / ${tabs.length})`,
                transform: `translateX(calc(${tabs.indexOf(activeTab)} * (100% + 0.25rem)))`,
                background: "var(--app-surface)",
                boxShadow: "var(--elev-1)",
              }}
            />
            {tabs.map((t) => (
              <button
                key={t}
                type="button"
                role="tab"
                aria-selected={activeTab === t}
                onClick={() => setTab(t)}
                className="ui-press relative z-[1] flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-[12.5px] font-medium"
                style={{ color: activeTab === t ? "var(--app-text)" : "var(--app-text-muted)" }}
              >
                {TAB_LABELS[t]}
                {t === "todo" && todos.length > 0 ? (
                  <span key={todosDone} className="app-pop inline-block tabular-nums text-[11px]" style={{ color: "var(--app-text-muted)" }}>
                    {todosDone}/{todos.length}
                  </span>
                ) : null}
              </button>
            ))}
          </div>

          {activeTab === "recents" ? (
            <RecentSessions
              sessions={recents}
              failed={recentsError}
              timezone={timezone}
            />
          ) : activeTab === "todo" ? (
            <div className="app-enter rounded-lg p-5" style={{ background: "var(--app-surface)", boxShadow: "var(--elev-1)" }}>
              <div className="flex items-center justify-between gap-3">
                <p className="type-eyebrow" style={{ color: "var(--app-text-muted)" }}>
                  {linkedEvent ? "The plan" : "This session"}
                </p>
                {plan && linkedEvent && !linkedEvent.checkout ? (
                  <button
                    type="button"
                    onClick={() => void refreshPlan()}
                    disabled={planRefreshing || running}
                    className="ui-press rounded-md px-2 py-1 text-[12px] ui-hover disabled:opacity-50"
                    style={{ color: "var(--app-text-muted)" }}
                    title={running ? "Pause first to get a new plan" : undefined}
                  >
                    {planRefreshing ? "Thinking…" : "New plan"}
                  </button>
                ) : null}
              </div>
              {linkedEvent && !plan ? (
                <p className="mt-2 text-[13.5px]" style={{ color: "var(--app-text-muted)" }} role="status">
                  {planLoading ? "Arcad's setting this one up…" : "No plan yet. Add your own to-dos, and check out at the end."}
                </p>
              ) : null}
              <SessionTodos
                className="mt-3"
                items={todos}
                accent={colour ?? "var(--app-accent)"}
                onToggle={toggleTodo}
                onAdd={ownTodos.add}
                onRemove={removeTodo}
              />
              {plan && linkedEvent && !linkedEvent.checkout ? <SyllabusNudge plan={plan} /> : null}
              {linkedEvent ? (
                linkedEvent.checkout ? (
                  <p className="mt-4 text-[13px]" style={{ color: "var(--app-success)" }}>
                    Done and checked out.
                  </p>
                ) : (
                  <div className="mt-4">
                    <AppButton variant="secondary" onClick={finishSession} className="ui-press w-full">
                      {phase === "focus" ? "Finish session" : "Check out"}
                    </AppButton>
                  </div>
                )
              ) : null}
            </div>
          ) : (
            <div className="app-enter flex flex-col gap-4">
          <div className="rounded-lg p-5" style={{ background: "var(--app-surface)", boxShadow: "var(--elev-1)" }}>
            <p className="type-eyebrow" style={{ color: "var(--app-text-muted)" }}>Preset</p>
            <div className="mt-3 flex flex-col gap-1.5">
              {PRESETS.map((p, i) => (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => {
                    setPresetIndex(i);
                    setPhase("idle");
                    setRemaining(p.focus);
                    setRunning(false);
                  }}
                  className={cn(
                    "ui-press flex items-center justify-between rounded-md px-3 py-2.5 text-[13.5px] font-medium",
                    i === presetIndex ? "inset-ring" : "hover:bg-[color-mix(in_oklab,var(--app-text)_6%,transparent)]",
                  )}
                  style={{
                    background: i === presetIndex ? "var(--app-accent-soft)" : "transparent",
                    color: i === presetIndex ? "var(--app-accent-strong)" : "var(--app-text-soft)",
                  }}
                >
                  <span>{p.label}</span>
                  <span className="tabular-nums text-[12px]" style={{ color: "var(--app-text-muted)" }}>
                    {p.focus / 60}m · {p.break / 60}m
                  </span>
                </button>
              ))}
            </div>
            {presetIndex === customIndex ? (
              <div className="mt-3 flex gap-2">
                <label className="flex-1">
                  <span className="mb-1 block text-[11.5px]" style={{ color: "var(--app-text-muted)" }}>
                    Focus (min)
                  </span>
                  <input
                    type="number"
                    min={1}
                    max={240}
                    value={customPreset.focusMin}
                    onChange={(e) => {
                      const next = { ...customPreset, focusMin: clampMinutes(e.target.value, customPreset.focusMin) };
                      setCustomPreset(next);
                      writeCustomPreset(next);
                      if (phase === "idle") setRemaining(next.focusMin * 60);
                    }}
                    className="w-full rounded-md px-2 py-1.5 text-[13.5px] outline-none"
                    style={{ background: "var(--app-surface-soft)", boxShadow: "var(--elev-inset)", color: "var(--app-text)" }}
                  />
                </label>
                <label className="flex-1">
                  <span className="mb-1 block text-[11.5px]" style={{ color: "var(--app-text-muted)" }}>
                    Break (min)
                  </span>
                  <input
                    type="number"
                    min={1}
                    max={60}
                    value={customPreset.breakMin}
                    onChange={(e) => {
                      const next = { ...customPreset, breakMin: clampMinutes(e.target.value, customPreset.breakMin) };
                      setCustomPreset(next);
                      writeCustomPreset(next);
                    }}
                    className="w-full rounded-md px-2 py-1.5 text-[13.5px] outline-none"
                    style={{ background: "var(--app-surface-soft)", boxShadow: "var(--elev-inset)", color: "var(--app-text)" }}
                  />
                </label>
              </div>
            ) : null}
          </div>

          <div className="rounded-lg p-5" style={{ background: "var(--app-surface)", boxShadow: "var(--elev-1)" }}>
            <p className="type-eyebrow" style={{ color: "var(--app-text-muted)" }}>Working on</p>
            <div className="mt-3 flex flex-col gap-3">
              <label className="block">
                <span className="mb-1 block text-[12px]" style={{ color: "var(--app-text-muted)" }}>Subject</span>
                <select
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  className="w-full rounded-md px-3 py-2 text-[14px] outline-none"
                  style={{ background: "var(--app-surface-soft)", boxShadow: "var(--elev-inset)", color: "var(--app-text)" }}
                >
                  {data.subjects.map((s) => (
                    <option key={s.id} value={s.name}>{s.name}</option>
                  ))}
                  {data.subjects.length === 0 ? <option value="General">General</option> : null}
                </select>
              </label>
              <label className="block">
                <span className="mb-1 block text-[12px]" style={{ color: "var(--app-text-muted)" }}>Goal (optional)</span>
                <input
                  type="text"
                  value={goal}
                  onChange={(e) => setGoal(e.target.value)}
                  placeholder="e.g. Finish complex numbers set"
                  className="w-full rounded-md px-3 py-2 text-[14px] outline-none"
                  style={{ background: "var(--app-surface-soft)", boxShadow: "var(--elev-inset)", color: "var(--app-text)" }}
                />
              </label>
            </div>
          </div>
            </div>
          )}
        </aside>
      </div>

      {pip.pipWindow ? (
        <PipTimer
          win={pip.pipWindow}
          phase={phase}
          clock={formatClock(remaining)}
          progress={progress}
          running={running}
          subject={linkedEvent ? sessionGoal || subject : subject}
          accent={colour ?? "var(--app-accent)"}
          expanded={pipExpanded}
          onExpandedChange={setPipExpanded}
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

const TAB_LABELS: Record<AsideTab, string> = { setup: "Setup", todo: "To-do", recents: "Recents" };

/** A round secondary timer button with its name underneath. */
function TimerControl({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-1.5 pt-2">
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        aria-label={label}
        className="ui-press grid h-12 w-12 place-items-center rounded-full hover:bg-[var(--app-surface-soft)] disabled:opacity-40"
        style={{ boxShadow: "inset 0 0 0 1px var(--app-border-strong)", color: "var(--app-text-soft)" }}
      >
        {children}
      </button>
      <span aria-hidden="true" className="text-[12px]" style={{ color: disabled ? "var(--app-text-faint)" : "var(--app-text-muted)" }}>
        {label}
      </span>
    </div>
  );
}

/**
 * The last month of logged focus and break sessions, newest first, grouped by
 * day. Reads GET /api/study-sessions, which already scopes itself to 30 days.
 */
function RecentSessions({
  sessions,
  failed,
  timezone,
}: {
  sessions: StudySession[] | null;
  failed: boolean;
  timezone: string;
}) {
  const groups = useMemo(() => {
    if (!sessions) return [];
    const byDay = new Map<string, StudySession[]>();
    for (const s of sessions) {
      const key = dayLabel(s.endedAt, timezone);
      const bucket = byDay.get(key);
      if (bucket) bucket.push(s);
      else byDay.set(key, [s]);
    }
    return [...byDay.entries()];
  }, [sessions, timezone]);

  const totalSeconds = useMemo(
    () =>
      (sessions ?? [])
        .filter((s) => s.type === "focus")
        .reduce((sum, s) => sum + s.seconds, 0),
    [sessions],
  );

  return (
    <div
      className="app-enter rounded-lg p-5"
      style={{ background: "var(--app-surface)", boxShadow: "var(--elev-1)" }}
    >
      <div className="flex items-baseline justify-between gap-3">
        <p className="type-eyebrow" style={{ color: "var(--app-text-muted)" }}>
          Recent sessions
        </p>
        {sessions && sessions.length > 0 ? (
          <span className="tabular text-[12px]" style={{ color: "var(--app-accent)" }}>
            {formatDuration(totalSeconds)}
          </span>
        ) : null}
      </div>

      {failed ? (
        <p className="mt-3 text-[13px]" style={{ color: "var(--app-text-muted)" }}>
          Couldn&rsquo;t load your history.
        </p>
      ) : sessions === null ? (
        <div className="mt-4 flex flex-col gap-2" aria-hidden="true">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="app-enter h-11 rounded-md"
              style={{ background: "var(--app-surface-soft)", "--d": `${i * 70}ms` } as React.CSSProperties}
            />
          ))}
        </div>
      ) : sessions.length === 0 ? (
        <p className="mt-3 text-[13px] leading-[1.5]" style={{ color: "var(--app-text-muted)" }}>
          Nothing logged yet. Finish a block and it lands here.
        </p>
      ) : (
        <div className="mt-4 flex max-h-[420px] flex-col gap-4 overflow-y-auto pr-1">
          {groups.map(([day, rows], groupIndex) => (
            <div key={day}>
              <p className="type-mono-label" style={{ color: "var(--app-text-faint)" }}>
                {day}
              </p>
              <ul className="mt-2 flex flex-col gap-1.5">
                {rows.map((s, i) => (
                  <li
                    key={s.id}
                    className="app-enter ui-hover flex items-center gap-3 rounded-md px-3 py-2"
                    style={{ "--d": `${(groupIndex * 3 + i) * 45}ms` } as React.CSSProperties}
                  >
                    <span
                      aria-hidden="true"
                      className="h-7 w-[3px] shrink-0 rounded-full"
                      style={{
                        background: s.type === "break" ? "var(--app-success)" : "var(--app-accent)",
                      }}
                    />
                    <span className="min-w-0 flex-1">
                      <span
                        className="block truncate text-[13px] font-medium"
                        style={{ color: "var(--app-text)" }}
                      >
                        {s.goal || s.subject || (s.type === "break" ? "Break" : "Focus")}
                      </span>
                      <span
                        className="block truncate text-[11.5px]"
                        style={{ color: "var(--app-text-muted)" }}
                      >
                        {s.subject ? `${s.subject} · ` : ""}
                        {formatWallClock(s.endedAt, timezone)}
                        {s.distractions > 0
                          ? ` · ${s.distractions} distraction${s.distractions === 1 ? "" : "s"}`
                          : ""}
                      </span>
                    </span>
                    <span
                      className="tabular shrink-0 text-[12px]"
                      style={{ color: "var(--app-text-soft)" }}
                    >
                      {formatDuration(s.seconds)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** Seconds in, shortest readable unit out, a skipped block is seconds long,
 *  not "0m". */
function formatDuration(seconds: number): string {
  if (seconds < 60) return `${Math.max(1, Math.round(seconds))}s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

function dayLabel(iso: string, timezone: string): string {
  const fmt = (d: Date) =>
    new Intl.DateTimeFormat("en-AU", { timeZone: timezone, dateStyle: "medium" }).format(d);
  const when = new Date(iso);
  const today = new Date();
  const yesterday = new Date(today.getTime() - 86_400_000);
  if (fmt(when) === fmt(today)) return "Today";
  if (fmt(when) === fmt(yesterday)) return "Yesterday";
  return fmt(when);
}

function formatClock(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}
