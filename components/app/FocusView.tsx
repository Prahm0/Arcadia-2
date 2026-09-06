"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/lib/api/client";
import { useDashboardData } from "@/lib/app/DashboardProvider";
import type { DashboardResponse, PlannerEvent } from "@/lib/api/types";
import { cn } from "@/lib/cn";
import { formatClock as formatWallClock } from "@/lib/api/time";
import PageHeader from "./PageHeader";
import AppButton from "./AppButton";

const PRESETS = [
  { label: "Deep focus", focus: 50 * 60, break: 10 * 60 },
  { label: "Classic", focus: 25 * 60, break: 5 * 60 },
  { label: "Long block", focus: 90 * 60, break: 15 * 60 },
];

type Phase = "focus" | "break" | "idle";

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
  PRESETS.forEach((p, i) => {
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
  const intervalRef = useRef<number | null>(null);
  const preset = PRESETS[presetIndex];

  // If the ?eventId= arrives after mount (rare but possible with client-side nav),
  // sync the visible fields once — do not clobber values the user already edited.
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
    setRemaining(PRESETS[nextIdx].focus);
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
      /* swallow — the local timer stays truthful even if the log fails */
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
        eyebrow="Focus"
        title={
          phase === "break" ? (
            <>Take a <span className="accent-serif">breather</span>.</>
          ) : (
            <><span className="accent-serif">Lock</span> in.</>
          )
        }
        meta={`${todayMinutes} min of focused study today`}
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
          className="flex flex-col items-center rounded-[20px] px-6 py-12"
          style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}
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
              <span className="type-eyebrow" style={{ color: "var(--app-text-muted)" }}>
                {phase === "break" ? "Break" : phase === "focus" ? "Focus" : "Ready"}
              </span>
              <span className="mt-3 text-[64px] font-medium tabular-nums tracking-[-0.03em]" style={{ color: "var(--app-text)" }}>
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
              className="mt-6 rounded-full px-4 py-2 text-[12.5px] font-medium transition-colors"
              style={{ border: "1px dashed var(--app-border-strong)", color: "var(--app-text-muted)" }}
            >
              Distraction · {distractions}
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
          <div className="rounded-[14px] p-5" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
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
                  className={cn("flex items-center justify-between rounded-[10px] px-3 py-2.5 text-[13.5px] font-medium transition-colors")}
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
          </div>

          <div className="rounded-[14px] p-5" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
            <p className="type-eyebrow" style={{ color: "var(--app-text-muted)" }}>Working on</p>
            <div className="mt-3 flex flex-col gap-3">
              <label className="block">
                <span className="mb-1 block text-[12px]" style={{ color: "var(--app-text-muted)" }}>Subject</span>
                <select
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  className="w-full rounded-[10px] px-3 py-2 text-[14px] outline-none"
                  style={{ background: "var(--app-surface-soft)", border: "1px solid var(--app-border)", color: "var(--app-text)" }}
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
                  className="w-full rounded-[10px] px-3 py-2 text-[14px] outline-none"
                  style={{ background: "var(--app-surface-soft)", border: "1px solid var(--app-border)", color: "var(--app-text)" }}
                />
              </label>
            </div>
          </div>
        </aside>
      </div>
    </>
  );
}

function formatClock(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}
