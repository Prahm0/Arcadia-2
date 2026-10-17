"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api/client";
import { CATEGORY_COLOR } from "@/lib/app/categoryColors";
import { openArcad } from "@/lib/app/commands";
import { useDashboardData } from "@/lib/app/DashboardProvider";
import type { DayItem, PlannerEvent, PlannerTask } from "@/lib/api/types";
import { cn } from "@/lib/cn";
import {
  dateKey,
  formatClock,
  formatDurationMinutes,
  formatFriendlyDate,
} from "@/lib/api/time";
import PageHeader from "./PageHeader";
import AppButton from "./AppButton";
import CompletionBurst from "./CompletionBurst";
import { showContextMenu } from "./ContextMenu";
import DailyCheckInCard from "./DailyCheckInCard";
import HolidayCard from "./HolidayCard";
import NewTermCard from "./NewTermCard";
import EventDetailSheet from "./EventDetailSheet";
import LifeHappened from "./LifeHappened";
import ProactiveArcadCards from "./ProactiveArcadCards";
import StartNowCard from "./StartNowCard";
import TodayRail from "./TodayRail";
import SundayReviewInline from "./SundayReviewInline";
import { subjectColour } from "@/lib/app/subjectColour";
import { SubjectTag } from "./cards/shared";
import { playCompletionTick } from "@/lib/app/completion";
import { noteWin } from "@/lib/capacitor/ratingPrompt";
import BlockDoneMoment from "./BlockDoneMoment";
import { blockDoneDecision } from "@/lib/app/blockDone";
import { useFlip } from "@/lib/app/useFlip";
import { requestAddToToday } from "@/lib/app/addToToday";
import { noteEntries, type NoteEntry } from "@/lib/app/todayNote";
import { startOfDayMs } from "./schedule/calendar";
import AddLine, { type NoteTarget } from "./today/AddLine";
import LineRow from "./today/LineRow";
import TodayProgress from "./TodayProgress";

const CATEGORY_BAR = CATEGORY_COLOR;

type EventSheetMode = "details" | "reschedule" | "miss-reason";

export default function TodayView() {
  const { data, patch, reload } = useDashboardData();
  const timezone = data.profile?.timezone || data.user.timezone || "Australia/Sydney";
  const now = new Date();
  const today = dateKey(now.toISOString(), timezone);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [showLife, setShowLife] = useState(false);
  const [lifeAutoReason, setLifeAutoReason] = useState<string | null>(null);
  const [lifeAutoDeadline, setLifeAutoDeadline] = useState<{ title: string; subject: string | null; dueAt: string } | null>(null);
  const [celebrateId, setCelebrateId] = useState<{ id: string; at: number } | null>(null);
  const [xpReward, setXpReward] = useState<number | null>(null);
  // The full-screen "block done" moment, with the data it was opened from.
  const lastMomentAt = useRef(0);
  const [doneMoment, setDoneMoment] = useState<{ event: PlannerEvent; task: PlannerTask | undefined; blocks: PlannerEvent[] } | null>(null);
  const [progressRefresh, setProgressRefresh] = useState(0);
  const [openEventId, setOpenEventId] = useState<string | null>(null);
  const [openEventMode, setOpenEventMode] = useState<EventSheetMode>("details");

  // ?new=1 and ?add=1 (links from elsewhere) focus the "Add to today..." line; AddLine handles both.

  // A browser push notification returns here with the relevant event. Remove
  // the parameter once it has opened so a refresh does not repeat the sheet.
  const handledOpenEventParam = useRef(false);
  useEffect(() => {
    if (handledOpenEventParam.current) return;
    const params = new URLSearchParams(window.location.search);
    const eventId = params.get("openEvent");
    if (!eventId) {
      handledOpenEventParam.current = true;
      return;
    }
    handledOpenEventParam.current = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOpenEventId(eventId);
    setOpenEventMode(params.get("missReason") === "1" ? "miss-reason" : "details");
    const url = new URL(window.location.href);
    url.searchParams.delete("openEvent");
    url.searchParams.delete("missReason");
    window.history.replaceState({}, "", url.toString());
  }, []);

  // A proactive "your day slipped" card (or anywhere else) can ask Today to
  // open the recovery sheet pre-run, so the fix is one tap from the nudge.
  useEffect(() => {
    const onLife = (event: Event) => {
      const detail = (event as CustomEvent<{ reason?: unknown; deadline?: unknown } | string>).detail;
      const reason = typeof detail === "string" ? detail : detail?.reason;
      const deadline = typeof detail === "object" && detail?.deadline && typeof detail.deadline === "object"
        ? detail.deadline as { title: string; subject: string | null; dueAt: string }
        : null;
      setLifeAutoReason(typeof reason === "string" ? reason : null);
      setLifeAutoDeadline(deadline);
      setShowLife(true);
    };
    window.addEventListener("arcadia:life", onLife);
    return () => window.removeEventListener("arcadia:life", onLife);
  }, []);

  const openedEvent = openEventId ? data.events.find((event) => event.id === openEventId) ?? null : null;

  // The React Compiler memoizes this; a manual useMemo made it skip the component.
  const todaysEvents = data.events
    .filter((event) => dateKey(event.startAt, timezone) === today)
    .sort((a, b) => Date.parse(a.startAt) - Date.parse(b.startAt));

  const studyBlocks = todaysEvents.filter((event) => event.category === "study");
  // Today's note: Arcadia's blocks and the student's own lines, timed or not, in one list.
  const dayStartMs = startOfDayMs(today, timezone);
  const entries = noteEntries(
    todaysEvents.filter((event) => event.category === "study" || event.source === "note"),
    (data.dayItems ?? []).filter((item) => item.day === today),
    dayStartMs,
  );
  const laterCandidates = todaysEvents.filter(
    (event) => event.category !== "study" && event.source !== "note" && Date.parse(event.endAt) >= now.getTime(),
  );
  // Old or overlapping schedule rebuilds may have left several sleep rows.
  // Show the generated nightly target once while leaving other events alone.
  const sleepEvent = laterCandidates.find((event) => event.category === "sleep" && event.source === "sleep")
    ?? laterCandidates.find((event) => event.category === "sleep");
  const laterEvents = laterCandidates.filter(
    (event) => event.category !== "sleep" || event === sleepEvent,
  );
  // Already under way (school, practice): shown as "Now", not by start time.
  const inProgressIds = new Set(
    laterEvents.filter((event) => Date.parse(event.startAt) <= now.getTime()).map((event) => event.id),
  );

  const remaining = studyBlocks.filter((event) => event.outcome === "planned");
  const completed = studyBlocks.filter((event) => event.outcome === "completed");
  const totalMinutes = remaining.reduce(
    (sum, event) => sum + Math.round((Date.parse(event.endAt) - Date.parse(event.startAt)) / 60000),
    0,
  );
  const weekProgress = clampWeekProgress(now);

  async function markOutcome(event: PlannerEvent, outcome: "completed" | "missed") {
    setBusyId(event.id);
    if (outcome === "completed") {
      // `at` only retriggers the burst, so a counter will do.
      setCelebrateId((previous) => ({ id: event.id, at: (previous?.at ?? 0) + 1 }));
      playCompletionTick();
      noteWin();
      // Shown straight away; the moment's ring fill carries the haptic. Only
      // the first of several quick ticks gets it, and old blocks tick quietly.
      const decision = event.category === "study" ? blockDoneDecision(event, lastMomentAt.current) : null;
      if (decision?.show) {
        lastMomentAt.current = decision.at;
        setDoneMoment({ event, task: data.tasks.find((task) => task.id === event.taskId), blocks: studyBlocks });
      }
    }
    try {
      const result = await api<{ rewards?: Array<{ xp: number }> }>(`/api/events/${encodeURIComponent(event.id)}/outcome`, {
        method: "POST",
        body: JSON.stringify({ outcome }),
      });
      patch((prev) => ({
        ...prev,
        events: prev.events.map((existing) =>
          existing.id === event.id
            ? { ...existing, outcome, status: outcome === "completed" ? "completed" : "missed" }
            : existing,
        ),
      }));
      const earned = result.rewards?.reduce((sum, reward) => sum + reward.xp, 0) ?? 0;
      if (earned > 0) {
        setXpReward(earned);
        window.setTimeout(() => setXpReward(null), 1200);
      }
      setProgressRefresh((value) => value + 1);
    } catch (error) {
      // The tick didn't save, so there's nothing to celebrate.
      setDoneMoment(null);
      throw error;
    } finally {
      setBusyId(null);
    }
  }

  const tomorrowKey = nextDayKey(today);

  // The student's own lines: tick, move to tomorrow, delete, note.
  const lineActions: LineActions = {
    toggle: async (entry) => {
      if (entry.kind === "item") {
        const done = !entry.item.done;
        if (done) playCompletionTick();
        patchItem(entry.item.id, { done });
        await api(`/api/today/items/${encodeURIComponent(entry.item.id)}`, { method: "PATCH", body: JSON.stringify({ done }) });
        return;
      }
      if (entry.event.outcome !== "completed") return markOutcome(entry.event, "completed");
      patch((prev) => ({ ...prev, events: prev.events.map((event) => (event.id === entry.event.id ? { ...event, outcome: "planned", status: "planned" } : event)) }));
      await api(`/api/events/${encodeURIComponent(entry.event.id)}/outcome`, { method: "POST", body: JSON.stringify({ outcome: "planned" }) });
      setProgressRefresh((value) => value + 1);
    },
    tomorrow: async (entry) => {
      if (entry.kind === "item") {
        patch((prev) => ({ ...prev, dayItems: (prev.dayItems ?? []).map((item) => (item.id === entry.item.id ? { ...item, day: tomorrowKey } : item)) }));
        await api(`/api/today/items/${encodeURIComponent(entry.item.id)}`, { method: "PATCH", body: JSON.stringify({ day: tomorrowKey }) });
        return;
      }
      const shift = (iso: string) => new Date(Date.parse(iso) + 86_400_000).toISOString();
      patch((prev) => ({ ...prev, events: prev.events.map((event) => (event.id === entry.event.id ? { ...event, startAt: shift(event.startAt), endAt: shift(event.endAt) } : event)) }));
      await api(`/api/events/${encodeURIComponent(entry.event.id)}`, {
        method: "PATCH",
        body: JSON.stringify({ startAt: shift(entry.event.startAt), endAt: shift(entry.event.endAt) }),
      });
      void reload();
    },
    remove: async (entry) => {
      if (entry.kind === "item") {
        patch((prev) => ({ ...prev, dayItems: (prev.dayItems ?? []).filter((item) => item.id !== entry.item.id) }));
        await api(`/api/today/items/${encodeURIComponent(entry.item.id)}`, { method: "DELETE" });
        return;
      }
      patch((prev) => ({ ...prev, events: prev.events.filter((event) => event.id !== entry.event.id) }));
      await api(`/api/events/${encodeURIComponent(entry.event.id)}`, { method: "DELETE" });
      void reload();
    },
    note: async (entry, note) => {
      if (entry.kind === "item") {
        patchItem(entry.item.id, { note });
        await api(`/api/today/items/${encodeURIComponent(entry.item.id)}`, { method: "PATCH", body: JSON.stringify({ note }) });
        return;
      }
      patch((prev) => ({ ...prev, events: prev.events.map((event) => (event.id === entry.event.id ? { ...event, note } : event)) }));
      await api(`/api/today/events/${encodeURIComponent(entry.event.id)}/note`, { method: "PATCH", body: JSON.stringify({ note }) });
    },
  };

  function patchItem(id: string, change: Partial<DayItem>) {
    patch((prev) => ({ ...prev, dayItems: (prev.dayItems ?? []).map((item) => (item.id === id ? { ...item, ...change } : item)) }));
  }

  const greeting = timeOfDayGreeting(now, timezone);
  const firstName = data.user.name.split(" ")[0];
  // One line that reads the day back, like a friend would.
  const nextDue = data.tasks
    .filter((task) => task.status === "pending" && Date.parse(task.dueAt) > now.getTime())
    .sort((a, b) => Date.parse(a.dueAt) - Date.parse(b.dueAt))[0];
  const summary =
    studyBlocks.length === 0
      ? "Nothing planned today. Enjoy it."
      : remaining.length === 0
        ? "All done for today. Nice work."
        : `${remaining.length === 1 ? "One block" : `${numberWord(remaining.length)} blocks`} ${completed.length ? "left" : "today"}${
            nextDue ? `. ${nextDue.title} is due ${formatDueDay(nextDue.dueAt, timezone, now)}.` : "."
          }`;

  return (
    <>
      <DaylightGlow hour={localHour(now, timezone)} />
      <PageHeader
        eyebrow={formatFriendlyDate(now.toISOString(), timezone)}
        title={`${greeting}, ${firstName}`}
        meta={summary}
        tour="today"
        action={
          <>
            <AppButton
              variant="secondary"
              onClick={() => setShowLife(true)}
              icon={<svg viewBox="0 0 20 20" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M4 10a6 6 0 0 1 10.5-4M16 10a6 6 0 0 1-10.5 4M14 3v3.5h-3.5M6 17v-3.5h3.5" strokeLinecap="round" strokeLinejoin="round" /></svg>}
            >
              Life happened
            </AppButton>
            {/* Phones have Add in the tab bar, so this would be a second copy. */}
            <AppButton
              variant="primary"
              className="max-lg:hidden"
              onClick={requestAddToToday}
              icon={<svg viewBox="0 0 20 20" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M10 4v12M4 10h12" strokeLinecap="round" /></svg>}
            >
              Add
            </AppButton>
          </>
        }
      />
      {xpReward !== null ? (
        <div className="pointer-events-none fixed left-1/2 top-24 z-[100] -translate-x-1/2 app-pop rounded-full px-4 py-2 text-sm font-semibold shadow-lg" style={{ background: "var(--app-arcad)", color: "white" }}>
          +{xpReward} XP
        </div>
      ) : null}

      <div className={`mx-auto grid w-full gap-8 px-6 pb-10 pt-6 sm:px-10 ${data.focusTasks.length > 0 ? "max-w-[1160px] @3xl/main:grid-cols-[minmax(0,1fr)_260px]" : "max-w-[720px]"}`}>
        <section className="min-w-0">
          <StartNowCard />
          <TodayProgress refreshKey={progressRefresh} compact />
          <TodayCard
            date={formatFriendlyDate(now.toISOString(), timezone)}
            weekProgress={weekProgress}
            totalMinutes={totalMinutes}
            remainingCount={remaining.length}
            completedCount={completed.length}
            studyBlocks={studyBlocks}
            laterEvents={laterEvents}
            inProgressIds={inProgressIds}
            busyId={busyId}
            celebrate={celebrateId}
            timezone={timezone}
            hasTasks={data.tasks.length > 0}
            entries={entries}
            today={today}
            onNewTask={requestAddToToday}
            onLine={lineActions}
            onComplete={(event) => markOutcome(event, "completed")}
            onMiss={(event) => {
              setOpenEventId(event.id);
              setOpenEventMode("miss-reason");
            }}
            onOpen={(event, mode) => {
              setOpenEventId(event.id);
              setOpenEventMode(mode);
            }}
          />
          {/* Then one suggestion at most, most useful first. Each card renders
              nothing when it has nothing to say, so only the first that does
              shows. Up to four used to stack above the student's next block. */}
          <div className="mt-6 empty:hidden [&>*~*]:hidden">
            <HolidayCard />
            <NewTermCard onAdd={requestAddToToday} />
            <DailyCheckInCard />
            <SundayReviewInline />
            <ProactiveArcadCards limit={1} />
          </div>
          <TellArcad />
        </section>

        <TodayRail />
      </div>

      {doneMoment ? (
        <BlockDoneMoment
          event={doneMoment.event}
          task={doneMoment.task}
          blocks={doneMoment.blocks}
          breakMinutes={Math.max(5, Number(data.preferences?.breakMinutes ?? 10) || 10)}
          timezone={timezone}
          onClose={() => setDoneMoment(null)}
        />
      ) : null}
      <LifeHappened
        open={showLife}
        autoReason={lifeAutoReason}
        autoDeadline={lifeAutoDeadline}
        onClose={() => {
          setShowLife(false);
          setLifeAutoReason(null);
          setLifeAutoDeadline(null);
        }}
      />
      <EventDetailSheet
        event={openedEvent}
        timezone={timezone}
        initialMode={openEventMode}
        onClose={() => {
          setOpenEventId(null);
          setOpenEventMode("details");
        }}
      />
    </>
  );
}

interface TodayCardProps {
  date: string;
  weekProgress: number;
  totalMinutes: number;
  remainingCount: number;
  completedCount: number;
  studyBlocks: PlannerEvent[];
  laterEvents: PlannerEvent[];
  inProgressIds: Set<string>;
  busyId: string | null;
  celebrate: { id: string; at: number } | null;
  timezone: string;
  hasTasks: boolean;
  onNewTask: () => void;
  /** Today's note, in order: blocks and the student's own lines. */
  entries: NoteEntry[];
  today: string;
  onLine: LineActions;
  onComplete: (event: PlannerEvent) => void;
  onMiss: (event: PlannerEvent) => void;
  onOpen: (event: PlannerEvent, mode: EventSheetMode) => void;
}

function TodayCard(props: TodayCardProps) {
  const {
    date, weekProgress, totalMinutes, remainingCount, completedCount,
    studyBlocks, laterEvents, inProgressIds, busyId, celebrate, timezone, hasTasks,
    onNewTask, onComplete, onMiss, onOpen, entries, today, onLine,
  } = props;
  // When Arcad replans or a line moves the plan, everything slides into its new place.
  const blockList = useRef<HTMLUListElement>(null);
  useFlip(blockList, entries.map((entry) => (entry.kind === "block" ? `${entry.key}@${entry.event.startAt}` : entry.key)).join("|"));
  // A "- note" typed into the line attaches to the last of the student's own lines.
  const lastMine = [...entries].reverse().find((entry) => entry.kind === "item" || entry.mine);
  const lastLine: NoteTarget | null = !lastMine
    ? null
    : lastMine.kind === "item"
      ? { kind: "item", id: lastMine.item.id, note: lastMine.item.note }
      : { kind: "event", id: lastMine.event.id, note: lastMine.event.note ?? "" };

  return (
    <div
      className="w-full rounded-[24px] surface-card"
      style={{ background: "var(--app-surface)", boxShadow: "var(--elev-1)" }}
    >
      {/* The page header already carries the date on phones. */}
      <div
        className="flex items-center justify-between px-5 py-4 max-lg:hidden sm:px-6"
        style={{ borderBottom: "1px solid var(--app-border)" }}
      >
        <p className="text-[13px] font-medium" style={{ color: "var(--app-text-muted)" }}>
          {date}
        </p>
        <div className="flex items-center gap-3 text-[12px]" style={{ color: "var(--app-text-muted)" }}>
          <span>Week {Math.round(weekProgress * 100)}%</span>
          <span
            className="relative h-1 w-16 overflow-hidden rounded-[1px]"
            style={{ background: "var(--app-border)" }}
            aria-hidden="true"
          >
            <span
              className="absolute inset-y-0 left-0"
              style={{ width: `${weekProgress * 100}%`, background: "var(--app-accent)" }}
            />
          </span>
        </div>
      </div>

      <div className="px-5 pt-6 sm:px-6">
        <h2 className="text-[18px] font-semibold leading-none tracking-[-0.01em]" style={{ color: "var(--app-text)" }}>
          Today&apos;s plan
        </h2>
        <p className="mt-1.5 text-[14px]" style={{ color: "var(--app-text-muted)" }}>
          {studyBlocks.length === 0
            ? hasTasks
              ? "Nothing scheduled today, the plan is clear."
              : "Let's build your first week. Pick where you want to start."
            : (
              <>
                {remainingCount === 0
                  ? "You're done for today."
                  : `${remainingCount} ${remainingCount === 1 ? "thing" : "things"} to focus on today.`}
                {remainingCount > 0 && (
                  <span className="tabular-nums"> · {formatDurationMinutes(totalMinutes)}</span>
                )}
                {completedCount > 0 && (
                  <span className="ml-1" style={{ color: "var(--app-success)" }}>
                    · {completedCount} done
                  </span>
                )}
              </>
            )}
        </p>
      </div>

      <div className="mt-4">
        <AddLine today={today} timezone={timezone} lastLine={lastLine} />
      </div>

      {entries.length === 0 && !hasTasks ? (
        // Fresh account: a few concrete ways to seed a plan under the line.
        <FirstRunActions onNewTask={onNewTask} />
      ) : (
        <ul ref={blockList} className="flex flex-col px-2 pb-3 sm:px-3" aria-label="Today">
          {entries.map((entry) =>
            entry.kind === "block" && !entry.mine ? (
              <FocusRow
                key={entry.key}
                event={entry.event}
                timezone={timezone}
                busy={busyId === entry.event.id}
                celebrateTrigger={celebrate?.id === entry.event.id ? celebrate.at : 0}
                onComplete={() => onComplete(entry.event)}
                onMiss={() => onMiss(entry.event)}
                onOpen={(mode) => onOpen(entry.event, mode)}
              />
            ) : (
              <LineRow
                key={entry.key}
                flipId={entry.key}
                title={entry.kind === "item" ? entry.item.text : entry.event.title}
                time={lineTime(entry, timezone)}
                note={entry.kind === "item" ? entry.item.note : entry.event.note ?? ""}
                done={entry.kind === "item" ? entry.item.done : entry.event.outcome === "completed"}
                busy={entry.kind === "block" && busyId === entry.event.id}
                onToggle={() => void onLine.toggle(entry)}
                onTomorrow={() => void onLine.tomorrow(entry)}
                onDelete={() => void onLine.remove(entry)}
                onNote={(note) => void onLine.note(entry, note)}
              />
            ),
          )}
        </ul>
      )}

      {laterEvents.length > 0 ? (
        <div className="mt-2 px-5 py-4 sm:px-6" style={{ borderTop: "1px solid var(--app-border)" }}>
          <p className="text-[12px] font-medium" style={{ color: "var(--app-text-muted)" }}>Later today</p>
          <ul className="mt-3 flex flex-col gap-2">
            {laterEvents.map((event) => (
              <li
                key={event.id}
                className="text-[13.5px]"
                onContextMenu={(e) =>
                  showContextMenu(
                    e,
                    [
                      { kind: "item", label: "Details", onSelect: () => onOpen(event, "details") },
                      (event.category === "sleep"
                        ? event.outcome === "planned" && Date.parse(event.endAt) > Date.now() && (event.source === "sleep" || event.editable !== false)
                        : event.editable !== false && event.outcome === "planned") && {
                        kind: "item",
                        label: event.category === "sleep" ? "Adjust this night…" : "Reschedule…",
                        onSelect: () => onOpen(event, "reschedule"),
                      },
                    ],
                    event.title,
                  )
                }
              >
                <button type="button" onClick={() => onOpen(event, "details")} className="flex w-full items-center gap-4 text-left">
                  <span
                    className="tabular-nums w-[80px] shrink-0"
                    style={{ color: "var(--app-text-muted)" }}
                  >
                    {inProgressIds.has(event.id) ? "Now" : formatClock(event.startAt, timezone)}
                  </span>
                  <span className="truncate" style={{ color: "var(--app-text)" }}>
                    {event.title}
                    {inProgressIds.has(event.id) ? (
                      <span style={{ color: "var(--app-text-muted)" }}> · until {formatClock(event.endAt, timezone)}</span>
                    ) : null}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function FocusRow({
  event, timezone, busy, celebrateTrigger, onComplete, onMiss, onOpen,
}: {
  event: PlannerEvent;
  timezone: string;
  busy: boolean;
  celebrateTrigger: number;
  onComplete: () => void;
  onMiss: () => void;
  onOpen: (mode: EventSheetMode) => void;
}) {
  const { subjects } = useDashboardData().data;
  const router = useRouter();
  const isDone = event.outcome === "completed";
  const isMissed = event.outcome === "missed";
  const isActionable = !isDone && !isMissed;
  const minutes = Math.round((Date.parse(event.endAt) - Date.parse(event.startAt)) / 60000);
  const startClock = formatClock(event.startAt, timezone);
  const focusHref = `/app/sessions?eventId=${encodeURIComponent(event.id)}`;
  const colour = subjectColour(subjects, event.subject) ?? CATEGORY_BAR[event.category] ?? "";
  // Arcad's topic once it's set up; a deadline's own name; otherwise the
  // subject label above says it all until Arcad sets the session up.
  const title = event.plan?.topic ?? (event.taskId ? event.title : null);

  const rowContent = (
    <>
      <span className="min-w-0 flex-1">
        <span className="block" style={{ opacity: isDone || isMissed ? 0.5 : 1 }}>
          <SubjectTag size="sm" subject={{ name: event.subject || "Study", colour: event.category === "study" ? colour : "" }} />
        </span>
        {title ? (
          <span
            className={cn(
              "mt-0.5 block truncate text-[16px] font-medium transition-opacity",
              (isDone || isMissed) && "line-through",
            )}
            style={{
              color: "var(--app-text)",
              opacity: isDone ? 0.4 : isMissed ? 0.35 : 1,
            }}
          >
            {title}
          </span>
        ) : (
          <span className="mt-0.5 block truncate text-[14px]" style={{ color: "var(--app-text-muted)", opacity: isDone || isMissed ? 0.5 : 1 }}>
            Arcad sets this up when you start
          </span>
        )}
      </span>
      <span className="flex shrink-0 flex-col items-end gap-1">
        <span className="tabular-nums text-[13px]" style={{ color: "var(--app-text)" }}>
          {formatDurationMinutes(minutes)}
        </span>
        <span className="text-[11px] tabular-nums" style={{ color: "var(--app-text-muted)" }}>
          {startClock}
        </span>
      </span>
      {isActionable ? (
        <span
          aria-hidden="true"
          className="ml-2 hidden shrink-0 text-[11px] opacity-0 transition-opacity group-hover:opacity-100 sm:block"
          style={{ color: "var(--app-text-muted)" }}
        >
          Focus →
        </span>
      ) : null}
    </>
  );

  return (
    <li
      data-flip-id={event.id}
      className="group flex items-center gap-1 rounded-md pr-2 transition-colors duration-200 hover:bg-[color:var(--app-surface-soft)]"
      onContextMenu={(e) =>
        showContextMenu(
          e,
          [
            isActionable && { kind: "item", label: "Start session", onSelect: () => router.push(focusHref) },
            isActionable && { kind: "item", label: "Open in new tab", onSelect: () => window.open(focusHref, "_blank", "noopener") },
            { kind: "item", label: "Session details", onSelect: () => onOpen("details") },
            { kind: "separator" },
            isActionable && !busy && { kind: "item", label: "Mark done", onSelect: onComplete },
            isActionable && !busy && { kind: "item", label: "Missed…", onSelect: onMiss },
            isActionable && event.editable !== false && { kind: "item", label: "Reschedule…", onSelect: () => onOpen("reschedule") },
          ],
          title ?? event.subject ?? event.title,
        )
      }
    >
      {isActionable ? (
        <Link
          href={focusHref}
          className="flex min-w-0 flex-1 items-center gap-4 rounded-md px-3 py-3.5 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--app-accent)]"
          aria-label={`Open ${event.subject ?? "study"} session${title ? `: ${title}` : ""}`}
        >
          {rowContent}
        </Link>
      ) : (
        <div className="flex min-w-0 flex-1 items-center gap-4 rounded-md px-3 py-3.5 text-left">
          {rowContent}
        </div>
      )}
      <span className="flex shrink-0 items-center">
        {isMissed ? (
          <span className="mr-1 text-[11px] font-medium" style={{ color: "var(--app-text-muted)" }}>Missed</span>
        ) : !isDone ? (
          <button
            type="button"
            onClick={onMiss}
            disabled={busy}
            className="mr-1 text-[11px] opacity-0 transition-opacity group-hover:opacity-100 hover:underline"
            style={{ color: "var(--app-text-muted)" }}
          >
            Missed
          </button>
        ) : null}

        <button
          type="button"
          onClick={onComplete}
          disabled={busy || isDone || isMissed}
          aria-label={`Mark ${title ?? event.subject ?? event.title} as done`}
          className="flex size-11 items-center justify-center rounded-md transition-colors sm:size-9"
        >
          <CompletionBurst trigger={celebrateTrigger}>
            <span
              aria-hidden="true"
              className="grid size-[24px] place-items-center rounded-full transition-colors duration-200 sm:size-[20px]"
              style={{
                background: isDone ? "var(--app-accent)" : "var(--app-surface)",
                border: `1.5px solid ${isDone ? "var(--app-accent)" : "var(--app-border-strong)"}`,
                color: isDone ? "var(--app-accent-on)" : "transparent",
              }}
            >
              <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                <path d="M1 4l2.5 2.5L9 1" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
          </CompletionBurst>
        </button>
      </span>
    </li>
  );
}

/**
 * A soft wash of light at the top of Today that follows the student's day:
 * fresh green in the morning, warm gold in the afternoon, peach in the
 * evening, starlight at night. Decoration only, behind everything.
 */
function DaylightGlow({ hour }: { hour: number }) {
  const tint =
    hour >= 5 && hour < 11
      ? "rgba(127, 176, 132, 0.22)"
      : hour >= 11 && hour < 17
        ? "rgba(233, 196, 106, 0.2)"
        : hour >= 17 && hour < 21
          ? "rgba(238, 150, 112, 0.18)"
          : "rgba(140, 156, 255, 0.16)";
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-x-0 top-0 -z-[1] h-[420px]"
      style={{ background: `radial-gradient(90% 100% at 70% 0%, ${tint}, transparent 70%)` }}
    />
  );
}

function localHour(now: Date, timezone: string): number {
  return Number(new Intl.DateTimeFormat("en-AU", { timeZone: timezone, hour: "2-digit", hour12: false }).format(now)) % 24;
}

/** "Something changed? Tell Arcad": the fix-my-plan entry point, on Today itself. */
function TellArcad() {
  return (
    <button
      type="button"
      onClick={() => openArcad()}
      className="mt-6 flex h-[52px] w-full items-center gap-3 rounded-full px-5 text-left text-[15px] font-medium transition-opacity hover:opacity-90"
      style={{ background: "var(--app-arcad-soft)", color: "var(--app-arcad-strong)" }}
    >
      <svg aria-hidden="true" width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><path d="M9 2.5v13M2.5 9h13" /></svg>
      <span className="flex-1">Something changed? Tell Arcad</span>
      <svg aria-hidden="true" width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><rect x="6.5" y="2" width="5" height="9" rx="2.5" /><path d="M3.5 8.5a5.5 5.5 0 0 0 11 0M9 14v2" /></svg>
    </button>
  );
}

const NUMBER_WORDS = ["Zero", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten"];
function numberWord(count: number): string {
  return NUMBER_WORDS[count] ?? String(count);
}

/** "today", "tomorrow", "Wednesday" within a week, else "Wed 28 Oct". */
function formatDueDay(iso: string, timezone: string, now: Date): string {
  const day = (at: Date) => dateKey(at.toISOString(), timezone);
  const due = new Date(iso);
  if (day(due) === day(now)) return "today";
  if (day(due) === day(new Date(now.getTime() + 86_400_000))) return "tomorrow";
  const days = (Date.parse(iso) - now.getTime()) / 86_400_000;
  return new Intl.DateTimeFormat("en-AU", days < 6 ? { weekday: "long", timeZone: timezone } : { weekday: "short", day: "numeric", month: "short", timeZone: timezone }).format(due);
}

function timeOfDayGreeting(now: Date, timezone: string): string {
  const hour = Number(
    new Intl.DateTimeFormat("en-AU", { timeZone: timezone, hour: "2-digit", hour12: false }).format(now),
  );
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

function clampWeekProgress(now: Date): number {
  const day = now.getDay(); // 0 = Sun
  const dayOfWeekMon = (day + 6) % 7;
  const hour = now.getHours() + now.getMinutes() / 60;
  return Math.min(1, (dayOfWeekMon * 24 + hour) / (7 * 24));
}

/**
 * Three-way empty-state on Today for a fresh account (no tasks, no
 * events yet). Each row is a real starting path, not a link to a
 * "getting started" doc: add a task inline, open Arcad with a starter
 * prompt, or head to Settings for calendar sync. Compact enough that
 * the "Later today" strip below stays visible on a phone.
 */
function FirstRunActions({ onNewTask }: { onNewTask: () => void }) {
  return (
    <div className="px-5 pb-6 pt-4 sm:px-6">
      <ul className="flex flex-col divide-y" style={{ borderColor: "var(--app-border)" }}>
        <FirstRunRow
          onClick={onNewTask}
          icon={
            <svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
              <path d="M10 4v12M4 10h12" />
            </svg>
          }
          title="Add your first task"
          hint="Type a name and a due date. Arcadia plans the time for you."
        />
        <FirstRunRow
          onClick={openArcad}
          icon={
            <svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 5h12v9H8l-4 3z" />
            </svg>
          }
          title="Ask Arcad to plan your week"
          hint="Tell it what's coming up. It builds the plan around you."
        />
        <FirstRunRow
          href="/app/settings"
          icon={
            <svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="5" width="14" height="12" rx="2" />
              <path d="M3 9h14M8 3v4M12 3v4" />
            </svg>
          }
          title="Connect your calendar"
          hint="Google, Apple or Canvas. Events land straight in your schedule."
        />
      </ul>
    </div>
  );
}

function FirstRunRow({
  icon,
  title,
  hint,
  onClick,
  href,
}: {
  icon: React.ReactNode;
  title: string;
  hint: string;
  onClick?: () => void;
  href?: string;
}) {
  const inner = (
    <>
      <span
        aria-hidden="true"
        className="grid size-9 shrink-0 place-items-center rounded-lg"
        style={{ background: "var(--app-accent-soft)", color: "var(--app-accent-strong)" }}
      >
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[14px] font-semibold" style={{ color: "var(--app-text)" }}>
          {title}
        </span>
        <span className="mt-0.5 block text-[12.5px]" style={{ color: "var(--app-text-muted)" }}>
          {hint}
        </span>
      </span>
      <span aria-hidden="true" className="shrink-0 opacity-60">
        <svg viewBox="0 0 20 20" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
          <path d="M7 5l5 5-5 5" />
        </svg>
      </span>
    </>
  );
  const className =
    "flex items-center gap-3.5 py-3.5 text-left transition-colors ui-hover rounded-md -mx-1 px-1";
  if (href) {
    return (
      <li>
        <Link href={href} className={className}>
          {inner}
        </Link>
      </li>
    );
  }
  return (
    <li>
      <button type="button" onClick={onClick} className={cn(className, "w-full")}>
        {inner}
      </button>
    </li>
  );
}

interface LineActions {
  toggle: (entry: NoteEntry) => Promise<void>;
  tomorrow: (entry: NoteEntry) => Promise<void>;
  remove: (entry: NoteEntry) => Promise<void>;
  note: (entry: NoteEntry, note: string) => Promise<void>;
}

/** "10:50am", "2:15pm to 2:45pm" for a timed line, "Tonight" for an evening one. */
function lineTime(entry: NoteEntry, timezone: string): string | null {
  if (entry.kind === "item") return entry.item.evening ? "Tonight" : null;
  const start = formatClock(entry.event.startAt, timezone);
  // A line typed with only a start ("SLC 10:50") shows just that; one typed with an end shows both.
  return entry.event.kind === "note-range" ? `${start} to ${formatClock(entry.event.endAt, timezone)}` : start;
}

/** The local day after `day` ("YYYY-MM-DD"). */
function nextDayKey(day: string): string {
  const at = new Date(`${day}T12:00:00Z`);
  at.setUTCDate(at.getUTCDate() + 1);
  return at.toISOString().slice(0, 10);
}
