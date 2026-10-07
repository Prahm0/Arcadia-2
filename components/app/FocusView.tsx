"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/lib/api/client";
import { useDashboardData } from "@/lib/app/DashboardProvider";
import type { PlannerEvent } from "@/lib/api/types";
import { cn } from "@/lib/cn";
import { formatClock as formatWallClock } from "@/lib/api/time";
import { useReplaceEvent } from "@/lib/app/useSessionPlan";
import PageHeader from "./PageHeader";
import AppButton from "./AppButton";
import SyllabusNudge from "./SyllabusNudge";
import SessionSheetLink from "./sheets/SessionSheetLink";
import { PlayPauseIcon } from "./focus/PipTimer";
import SessionTodos from "./focus/SessionTodos";
import FocusGuardHint from "./focus/FocusGuardHint";
import SessionsSwitch from "./focus/SessionsSwitch";
import { clampMinutes, formatClock, useFocusSession, type FocusSession } from "./focus/FocusSession";
import { isNative } from "@/lib/capacitor/platform";
import StudyWithMe from "./focus/StudyWithMe";
import SessionRating from "./focus/SessionRating";
import TopicSelect from "./focus/TopicSelect";

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
      <FocusViewRoute />
    </Suspense>
  );
}

/**
 * The timer itself runs in FocusSessionProvider, so it and its pop-out keep
 * going on other pages. This page points that session at the study block in
 * the URL, and shows it once it's the one running.
 */
function FocusViewRoute() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const { session, select } = useFocusSession();
  const eventId = params.get("eventId");

  useEffect(() => {
    // Coming back through a plain Focus link mid-session returns to that
    // session rather than quietly starting a free timer beside it.
    if (!eventId && session?.eventId && session.phase !== "idle") {
      router.replace(`${pathname}?eventId=${encodeURIComponent(session.eventId)}`);
      return;
    }
    if (session?.eventId !== eventId) select(eventId);
  }, [eventId, session?.eventId, session?.phase, select, router, pathname]);

  if (!session || session.eventId !== eventId) return null;
  return <FocusViewInner session={session} />;
}

function FocusViewInner({ session }: { session: FocusSession }) {
  const { data } = useDashboardData();
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const timezone = data.profile?.timezone || data.user.timezone || "Australia/Sydney";

  const {
    eventId, linkedEvent, linkedMinutes, studySave,
    presets: PRESETS, presetIndex, customIndex, customPreset, presetLocked,
    phase, remaining, running, progress, totalForPhase, phaseColour, colour,
    subject, goal, sessionGoal, distractions,
    plan, planLoading, planRefreshing, refreshPlan, todos,
    start, pause, reset, skip, finishSession, pip,
  } = session;

  // A scheduled session already knows what it's on, so it opens on its to-dos.
  const [tab, setTab] = useState<AsideTab>(eventId ? "todo" : "setup");
  const [recents, setRecents] = useState<StudySession[] | null>(null);
  const [recentsError, setRecentsError] = useState(false);
  const replaceEvent = useReplaceEvent();
  const [studyWithMeOpen, setStudyWithMeOpen] = useState(false);

  function openStudyWithMe() {
    if (!isNative() && document.documentElement.requestFullscreen) {
      void document.documentElement.requestFullscreen().catch(() => {});
    }
    session.clearComplete();
    setStudyWithMeOpen(true);
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

  // Again each time the session logs one, so it's at the top already.
  useEffect(() => {
    void loadRecents();
  }, [loadRecents, session.logged]);

  // "Start now" from Today: the block moves to now, and the timer runs
  // straight away. The flag comes off the URL so a reload doesn't restart it.
  const autoStarted = useRef(false);
  const wantsStart = params.get("start") === "1";
  const beginNow = useRef(session.beginNow);
  useEffect(() => {
    beginNow.current = session.beginNow;
  });
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
      beginNow.current();
    })();
  }, [wantsStart, linkedEvent, replaceEvent, router, pathname]);

  function detach() {
    session.detach();
    router.replace("/app/sessions");
  }

  const todosDone = todos.filter((item) => item.done).length;

  // A scheduled session is already set up, so it has no Setup tab.
  const tabs: AsideTab[] = linkedEvent ? ["todo", "recents"] : ["setup", "todo", "recents"];
  const activeTab = tabs.includes(tab) ? tab : tabs[0];

  const todayMinutes = Number(data.analytics?.todayMinutes ?? 0);

  return (
    <>
      <PageHeader width={960}
        title="Sessions"
        meta={`${phase === "break" ? "On a break · " : ""}${todayMinutes} min focused today`}
        // No tour popping up over a session that has just started.
        tour={linkedEvent ? undefined : "focus"}
        action={<SessionsSwitch />}
      />

      {studySave.status !== "idle" && <div className="mx-auto max-w-[960px] px-6 pt-4 sm:px-10"><div role="status" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border px-4 py-3 text-[13px]" style={{ borderColor: "var(--app-border)", background: "var(--app-surface)", color: "var(--app-text)" }}><span>{studySave.status === "saving" ? "Saving your study progress…" : studySave.status === "pending" ? "Your session is waiting to sync. Keep this browser’s data to retry later." : studySave.receipt.cards.length ? `✦ ${studySave.receipt.cards.length === 1 ? "New constellation unlocked" : "New constellations unlocked"}${studySave.receipt.xp ? ` · +${studySave.receipt.xp} XP` : ""}` : studySave.receipt.stars ? `✦ ${studySave.receipt.stars} new ${studySave.receipt.stars === 1 ? "star" : "stars"} on your streak cards${studySave.receipt.xp ? ` · +${studySave.receipt.xp} XP` : ""}` : studySave.receipt.xp ? `✦ +${studySave.receipt.xp} XP earned.` : "Your study session is saved."}</span>{studySave.status === "pending" ? <AppButton onClick={() => void studySave.retry()}>Retry save</AppButton> : studySave.status === "saved" ? <Link href={studySave.receipt.cards.length ? "/app/streaks#constellations" : "/app/streaks#sky"} className="text-[12px] underline underline-offset-4">{studySave.receipt.cards.length ? "View streak cards" : "View streaks"}</Link> : null}</div></div>}

      {session.rateable ? (
        <div className="mx-auto max-w-[960px] px-6 pt-3 sm:px-10">
          <SessionRating
            key={session.rateable.activityId}
            activityId={session.rateable.activityId}
            topic={session.rateable.topic}
            onDone={session.clearRateable}
          />
        </div>
      ) : null}

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

      <div className="mx-auto grid w-full max-w-[960px] gap-6 px-6 py-8 sm:px-10 @3xl/main:grid-cols-[minmax(0,1fr)_340px]">
        <div
          className="relative flex flex-col items-center rounded-xl px-6 pb-8 pt-12"
          style={{ background: "var(--app-surface)", boxShadow: "var(--elev-1)" }}
        >
          <button
            type="button"
            onClick={openStudyWithMe}
            className="ui-press absolute left-3 top-3 flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[12.5px] font-medium hover:bg-[color-mix(in_oklab,var(--app-text)_6%,transparent)]"
            style={{ color: "var(--app-text-muted)" }}
          >
            <span aria-hidden="true">✦</span>
            Study with me
          </button>
          {pip.supported ? (
            <button
              type="button"
              onClick={pip.open ? pip.close : () => void pip.popOut()}
              title={pip.open ? "Put the timer back on this page" : "Float the timer over your other windows"}
              className="ui-press absolute right-3 top-3 flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[12.5px] font-medium hover:bg-[color-mix(in_oklab,var(--app-text)_6%,transparent)]"
              style={{ color: pip.open ? "var(--app-text)" : "var(--app-text-muted)" }}
            >
              <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <rect x="1.75" y="2.75" width="12.5" height="10.5" rx="2" />
                {pip.open ? <path d="M10.5 6.5h-3v3M7.5 6.5l3.5 3.5" /> : <rect x="8" y="8" width="4.5" height="3.5" rx="0.75" fill="currentColor" stroke="none" />}
              </svg>
              {pip.open ? "Bring back" : "Pop out"}
            </button>
          ) : null}
          {pip.blocked && !pip.open ? (
            <p role="status" className="app-enter absolute right-4 top-12 max-w-[220px] text-right text-[12px]" style={{ color: "var(--app-text-muted)" }}>
              Your browser blocked the pop-out. Allow pop-ups for this site and try again.
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
              {pip.open ? (
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
              onClick={session.addDistraction}
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

          <FocusGuardHint />

          {!linkedEvent && data.events.some((e) => e.category === "study" && e.outcome === "planned") ? (
            <Link
              href="/app"
              className="mt-6 text-[12.5px] underline underline-offset-4 transition-colors hover:text-[var(--app-text)]"
              style={{ color: "var(--app-text-muted)" }}
            >
              Pick a scheduled study block
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
                onToggle={session.toggleTodo}
                onAdd={session.addTodo}
                onRemove={session.removeTodo}
              />
              {plan && linkedEvent && !linkedEvent.checkout ? <SyllabusNudge plan={plan} /> : null}
              {linkedEvent ? <SessionSheetLink subject={linkedEvent.subject} topic={plan?.topic ?? linkedEvent.title} /> : null}
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
                    if (presetLocked(p.label)) {
                      router.push("/app/pricing");
                      return;
                    }
                    session.choosePreset(i);
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
                  {presetLocked(p.label) ? (
                    <span className="rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ background: "var(--app-arcad-soft)", color: "var(--app-arcad-strong)" }}>
                      Pro
                    </span>
                  ) : (
                    <span className="tabular-nums text-[12px]" style={{ color: "var(--app-text-muted)" }}>
                      {p.focus / 60}m · {p.break / 60}m
                    </span>
                  )}
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
                      session.changeCustomPreset(next);
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
                      session.changeCustomPreset(next);
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
                  onChange={(e) => session.setSubject(e.target.value)}
                  className="w-full rounded-md px-3 py-2 text-[14px] outline-none"
                  style={{ background: "var(--app-surface-soft)", boxShadow: "var(--elev-inset)", color: "var(--app-text)" }}
                >
                  {data.subjects.map((s) => (
                    <option key={s.id} value={s.name}>{s.name}</option>
                  ))}
                  {data.subjects.length === 0 ? <option value="General">General</option> : null}
                </select>
              </label>
              <TopicSelect subject={subject} value={session.topic} onChange={session.setTopic} />
              <label className="block">
                <span className="mb-1 block text-[12px]" style={{ color: "var(--app-text-muted)" }}>Goal (optional)</span>
                <input
                  type="text"
                  value={goal}
                  onChange={(e) => session.setGoal(e.target.value)}
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

      <StudyWithMe
        open={studyWithMeOpen}
        onExit={() => setStudyWithMeOpen(false)}
        onToggle={running ? pause : start}
        running={running}
        remaining={remaining}
        total={totalForPhase}
        subject={subject}
        goal={sessionGoal}
        todosDone={todosDone}
        todosTotal={todos.length}
        complete={session.complete}
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
