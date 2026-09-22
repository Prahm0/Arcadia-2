"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/lib/api/client";
import { setPresence } from "@/lib/api/presence";
import { useDashboardData } from "@/lib/app/DashboardProvider";
import type { DashboardResponse, PlannerEvent } from "@/lib/api/types";
import { cn } from "@/lib/cn";
import { formatClock as formatWallClock } from "@/lib/api/time";
import PageHeader from "./PageHeader";
import AppButton from "./AppButton";

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
type AsideTab = "session" | "recents";

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

function pickPresetForMinutes(minutes: number): number {
  let best = 0;
  let bestDelta = Infinity;
  BUILT_IN_PRESETS.forEach((p, i) => {
    const delta = Math.abs(p.focus / 60 - minutes);
    if (delta < bestDelta) {
      best = i;
      bestDelta = delta;
    }
  });
  return best;
}

function FocusViewInner() {
  const { data, reload, patch } = useDashboardData();
  const params = useSearchParams();
  const router = useRouter();
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
  const PRESETS = useMemo(
    () => [
      ...BUILT_IN_PRESETS,
      {
        label: "Custom",
        focus: customPreset.focusMin * 60,
        break: customPreset.breakMin * 60,
      },
    ],
    [customPreset],
  );
  const customIndex = PRESETS.length - 1;
  const [presetIndex, setPresetIndex] = useState(() =>
    linkedMinutes ? pickPresetForMinutes(linkedMinutes) : 0,
  );
  const [phase, setPhase] = useState<Phase>("idle");
  const [remaining, setRemaining] = useState(PRESETS[presetIndex].focus);
  const [running, setRunning] = useState(false);
  const [subject, setSubject] = useState(
    linkedEvent?.subject || data.subjects[0]?.name || "General",
  );
  const [goal, setGoal] = useState(linkedEvent?.title ?? "");
  const [distractions, setDistractions] = useState(0);
  const [tab, setTab] = useState<AsideTab>("session");
  const [recents, setRecents] = useState<StudySession[] | null>(null);
  const [recentsError, setRecentsError] = useState(false);
  const intervalRef = useRef<number | null>(null);
  const preset = PRESETS[presetIndex];

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
    const nextIdx = linkedMinutes ? pickPresetForMinutes(linkedMinutes) : 0;
    setPresetIndex(nextIdx);
    setRemaining(BUILT_IN_PRESETS[nextIdx].focus);
    setSubject(linkedEvent.subject || data.subjects[0]?.name || "General");
    setGoal(linkedEvent.title);
  }, [linkedEvent, linkedMinutes, data.subjects]);

  useEffect(() => {
    if (!running) return;
    intervalRef.current = window.setInterval(() => {
      setRemaining((r) => (r <= 1 ? 0 : r - 1));
    }, 1000);
    return () => {
      if (intervalRef.current) window.clearInterval(intervalRef.current);
    };
  }, [running]);

  useEffect(() => {
    if (remaining !== 0) return;
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
          { type, seconds, subject, goal, distractions, endedAt: new Date().toISOString() },
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
      void logSession("focus", preset.focus - remaining, {
        markEvent: linkedEvent ? "missed" : undefined,
      });
      setPhase("break");
      setRemaining(preset.break);
    } else {
      setPhase("focus");
      setRemaining(preset.focus);
    }
    setRunning(false);
  }

  function detach() {
    router.replace("/app/focus");
  }

  const totalForPhase = phase === "break" ? preset.break : preset.focus;
  const progress = 1 - remaining / totalForPhase;

  const todayMinutes = Number(data.analytics?.todayMinutes ?? 0);

  return (
    <>
      <PageHeader
        eyebrow="Study"
        title="Focus"
        meta={`${phase === "break" ? "On a break · " : ""}${todayMinutes} min focused today`}
        tour="focus"
      />

      {linkedEvent ? (
        <div className="border-b px-6 py-3 sm:px-10" style={{ borderColor: "var(--app-border)", background: "var(--app-accent-soft)" }}>
          <div className="mx-auto flex max-w-[960px] flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <span
                aria-hidden="true"
                className="h-1.5 w-1.5 rounded-full"
                style={{ background: "var(--app-accent)" }}
              />
              <span className="type-eyebrow" style={{ color: "var(--app-accent-strong)" }}>
                Focusing on
              </span>
              <span className="truncate text-[14px] font-medium" style={{ color: "var(--app-text)" }}>
                {linkedEvent.title}
              </span>
              <span className="type-mono-label hidden sm:inline" style={{ color: "var(--app-text-muted)" }}>
                {linkedEvent.subject ? `${linkedEvent.subject} · ` : ""}
                {formatWallClock(linkedEvent.startAt, timezone)}–{formatWallClock(linkedEvent.endAt, timezone)}
                {linkedMinutes ? ` · ${linkedMinutes} min` : ""}
              </span>
            </div>
            <button
              type="button"
              onClick={detach}
              className="rounded-full px-2.5 py-1 text-[12px] hover:underline"
              style={{ color: "var(--app-text-muted)" }}
            >
              Detach
            </button>
          </div>
        </div>
      ) : null}

      <div className="mx-auto grid w-full max-w-[960px] gap-8 px-6 py-10 sm:px-10 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div
          className="flex flex-col items-center rounded-lg px-6 py-12"
          style={{ background: "var(--app-surface)", boxShadow: "var(--elev-1)" }}
        >
          <div className="relative aspect-square w-full max-w-[320px]">
            <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90">
              <circle cx="50" cy="50" r="46" fill="none" stroke="var(--app-border)" strokeWidth="2" />
              <circle
                cx="50" cy="50" r="46" fill="none"
                stroke={phase === "break" ? "var(--app-success)" : "var(--app-accent)"}
                strokeWidth="2"
                strokeLinecap="round"
                strokeDasharray={`${2 * Math.PI * 46}`}
                strokeDashoffset={`${2 * Math.PI * 46 * (1 - progress)}`}
                style={{ transition: "stroke-dashoffset 1s linear" }}
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span
                className={cn("type-eyebrow", running && "app-breathe")}
                style={{ color: running ? "var(--app-accent)" : "var(--app-text-muted)" }}
              >
                {phase === "break" ? "Break" : phase === "focus" ? "Focus" : "Ready"}
              </span>
              {/* Keyed on the minute so the digits give one beat per minute
                  elapsed, enough to read as live without being a distraction. */}
              <span
                key={Math.floor(remaining / 60)}
                className={cn(
                  "mt-3 text-[64px] font-medium tabular-nums tracking-[-0.03em]",
                  running && "app-tick",
                )}
                style={{ color: "var(--app-text)" }}
              >
                {formatClock(remaining)}
              </span>
              <span className="mt-1 text-[12px]" style={{ color: "var(--app-text-muted)" }}>
                {subject}
              </span>
            </div>
          </div>

          <div className="mt-8 flex items-center gap-2">
            {!running ? (
              <AppButton variant="primary" onClick={start}>
                {phase === "idle" ? "Start" : "Resume"}
              </AppButton>
            ) : (
              <AppButton variant="primary" onClick={pause}>Pause</AppButton>
            )}
            <AppButton variant="secondary" onClick={skip} disabled={phase === "idle"}>Skip</AppButton>
            <AppButton variant="ghost" onClick={reset}>Reset</AppButton>
          </div>

          {phase !== "idle" ? (
            <button
              type="button"
              onClick={() => setDistractions((d) => d + 1)}
              className="ui-pressable mt-6 rounded-full px-4 py-2 text-[12.5px] font-medium"
              style={{ border: "1px dashed var(--app-border-strong)", color: "var(--app-text-muted)" }}
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
              className="mt-6 text-[12.5px] underline underline-offset-4"
              style={{ color: "var(--app-text-muted)" }}
            >
              Focus on a scheduled study block
            </Link>
          ) : null}
        </div>

        <aside className="flex flex-col gap-6">
          {/* The timer stays put; only the panel beside it swaps. */}
          <div
            role="tablist"
            aria-label="Focus panel"
            className="inset-ring grid grid-cols-2 gap-1 rounded-md p-1"
            style={{ background: "var(--app-surface-soft)" }}
          >
            {(["session", "recents"] as AsideTab[]).map((t) => (
              <button
                key={t}
                type="button"
                role="tab"
                aria-selected={tab === t}
                onClick={() => setTab(t)}
                className="rounded-sm px-3 py-1.5 text-[12.5px] font-medium capitalize transition-all duration-200 ease-[var(--ease-out-expo)]"
                style={{
                  background: tab === t ? "var(--app-surface)" : "transparent",
                  color: tab === t ? "var(--app-text)" : "var(--app-text-muted)",
                  boxShadow: tab === t ? "var(--elev-1)" : "none",
                }}
              >
                {t}
              </button>
            ))}
          </div>

          {tab === "recents" ? (
            <RecentSessions
              sessions={recents}
              failed={recentsError}
              timezone={timezone}
            />
          ) : (
            <div className="app-enter flex flex-col gap-6">
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
                    "flex items-center justify-between rounded-md px-3 py-2.5 text-[13.5px] font-medium",
                    "transition-all duration-200 ease-[var(--ease-out-expo)]",
                    i === presetIndex ? "inset-ring" : "ui-hover",
                  )}
                  style={{
                    background: i === presetIndex ? "var(--app-accent-soft)" : "transparent",
                    color: i === presetIndex ? "var(--app-accent-strong)" : "var(--app-text-soft)",
                  }}
                >
                  <span>{p.label}</span>
                  <span className="font-mono text-[12px]" style={{ color: "var(--app-text-muted)" }}>
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
    </>
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
