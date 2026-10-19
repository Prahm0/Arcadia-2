"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api/client";
import { openArcad } from "@/lib/app/commands";
import { useDashboardData } from "@/lib/app/DashboardProvider";
import type { DayItem, PlannerEvent, PlannerTask, PriorityPick } from "@/lib/api/types";
import { cn } from "@/lib/cn";
import {
  dateKey,
  formatClock,
  formatDurationMinutes,
  formatFriendlyDate,
} from "@/lib/api/time";
import PageHeader from "./PageHeader";
import AppButton from "./AppButton";
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
import { playCompletionTick } from "@/lib/app/completion";
import { noteWin } from "@/lib/capacitor/ratingPrompt";
import { success } from "@/lib/capacitor/haptics";
import { comboCount, isPerfectDay, splitDone } from "@/lib/app/celebrate";
import { parseLoggedLine } from "@/lib/app/dayLine";
import BlockDoneMoment from "./BlockDoneMoment";
import { blockDoneDecision } from "@/lib/app/blockDone";
import { finishBlock, useFocusGuardStatus, type BlockReport } from "@/lib/capacitor/focusGuard";
import { useFlip } from "@/lib/app/useFlip";
import { requestAddToToday } from "@/lib/app/addToToday";
import { noteEntries, type NoteEntry } from "@/lib/app/todayNote";
import { startOfDayMs } from "./schedule/calendar";
import AddLine, { type NoteTarget } from "./today/AddLine";
import LineRow from "./today/LineRow";
import { matchSubject } from "@/lib/app/quickAdd";
import GapSuggestion from "./today/GapSuggestion";
import TimeSheet from "./today/TimeSheet";
import LaterOffer from "./LaterOffer";
import BlockingBar from "./today/BlockingBar";
import TodayProgress from "./TodayProgress";
import EmptyArt from "./EmptyArt";
import DayNav, { dayLabel } from "./today/DayNav";
import { headlineText, isDayHeading, sectionText } from "@/shared/dayHeading";


type EventSheetMode = "details" | "reschedule" | "miss-reason";

const readNow = () => Date.now();

export default function TodayView() {
  const { data, patch, reload } = useDashboardData();
  const timezone = data.profile?.timezone || data.user.timezone || "Australia/Sydney";
  const now = new Date();
  const today = dateKey(now.toISOString(), timezone);
  // The day on screen: today, or a day before or after it read back like a journal.
  const [viewDay, setViewDay] = useState<string | null>(null);
  const day = viewDay ?? today;
  const isToday = day === today;
  const [busyId, setBusyId] = useState<string | null>(null);
  const [showLife, setShowLife] = useState(false);
  const [lifeAutoReason, setLifeAutoReason] = useState<string | null>(null);
  const [lifeAutoDeadline, setLifeAutoDeadline] = useState<{ title: string; subject: string | null; dueAt: string } | null>(null);
  const [celebrateId, setCelebrateId] = useState<{ id: string; at: number } | null>(null);
  // One floating line at a time: "+10 XP", "2 in a row", "Perfect day".
  const [toast, setToast] = useState<{ text: string; big?: boolean; at: number } | null>(null);
  const tickTimes = useRef<number[]>([]);
  // Rows ticked a moment ago stay put while their burst plays, then join Done.
  const [settling, setSettling] = useState<ReadonlySet<string>>(new Set());
  // The full-screen "block done" moment, with the data it was opened from.
  const lastMomentAt = useRef(0);
  const [doneMoment, setDoneMoment] = useState<{ event: PlannerEvent; task: PlannerTask | undefined; blocks: PlannerEvent[]; report?: BlockReport } | null>(null);
  const [guardStatus] = useFocusGuardStatus();
  const [progressRefresh, setProgressRefresh] = useState(0);
  const [openEventId, setOpenEventId] = useState<string | null>(null);
  const [openEventMode, setOpenEventMode] = useState<EventSheetMode>("details");
  // One of the student's own lines getting a time from the time picker.
  const [timeFor, setTimeFor] = useState<NoteEntry | null>(null);

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
    .filter((event) => dateKey(event.startAt, timezone) === day)
    .sort((a, b) => Date.parse(a.startAt) - Date.parse(b.startAt));

  const studyBlocks = todaysEvents.filter((event) => event.category === "study");
  // Today's note: Arcadia's blocks and the student's own lines, timed or not, in one list.
  const dayStartMs = startOfDayMs(day, timezone);
  const entries = noteEntries(
    todaysEvents.filter((event) => event.category === "study" || event.source === "note"),
    (data.dayItems ?? []).filter((item) => item.day === day),
    dayStartMs,
  );
  const laterCandidates = todaysEvents.filter(
    (event) => isToday && event.category !== "study" && event.source !== "note" && Date.parse(event.endAt) >= now.getTime(),
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

  function showToast(text: string, big = false) {
    const at = readNow();
    setToast({ text, big, at });
    window.setTimeout(() => setToast((current) => (current?.at === at ? null : current)), 1150);
  }

  /** Everything a tick sets off, on top of the burst: haptic, settle, then combo, perfect day or XP. */
  function celebrateTick(key: string, xp: number) {
    void success();
    setSettling((current) => new Set(current).add(key));
    window.setTimeout(() => setSettling((current) => {
      const next = new Set(current);
      next.delete(key);
      return next;
    }), 650);
    const at = readNow();
    tickTimes.current = [...tickTimes.current.filter((time) => at - time < 3 * 3_600_000), at];
    const rows = entries.filter((entry) => !isHeading(entry)).map((entry) => ({
      done: entry.kind === "item" ? entry.item.done || entry.key === key : entry.event.outcome === "completed" || entry.key === key,
    }));
    const combo = comboCount(tickTimes.current);
    if (isPerfectDay(rows)) showToast("Perfect day ✦", true);
    else if (combo >= 2) showToast(`${combo} in a row${xp ? ` · +${xp} XP` : ""}`);
    else if (xp) showToast(`+${xp} XP`);
  }

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
      // Ticking a study block unlocks the apps now, and the phone says how
      // often they were reached for: shown on the moment, kept for Arcad.
      if (event.category === "study") {
        void finishBlock(event.id, guardStatus).then((report) => {
          if (!report) return;
          setDoneMoment((moment) => (moment && moment.event.id === event.id ? { ...moment, report } : moment));
          void api(`/api/events/${encodeURIComponent(event.id)}/focus-report`, { method: "POST", body: JSON.stringify(report) }).catch(() => undefined);
        });
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
      if (outcome === "completed") celebrateTick(entries.find((entry) => entry.kind === "block" && entry.event.id === event.id)?.key ?? event.id, earned);
      setProgressRefresh((value) => value + 1);
    } catch (error) {
      // The tick didn't save, so there's nothing to celebrate.
      setDoneMoment(null);
      throw error;
    } finally {
      setBusyId(null);
    }
  }

  // On today a line moves to tomorrow; on any other day it comes to today.
  const moveKey = isToday ? nextDayKey(today) : today;

  // The student's own lines: tick, move to tomorrow, delete, note.
  const lineActions: LineActions = {
    toggle: async (entry) => {
      if (entry.kind === "item") {
        const done = !entry.item.done;
        if (done) {
          playCompletionTick();
          setCelebrateId((previous) => ({ id: entry.item.id, at: (previous?.at ?? 0) + 1 }));
        }
        patchItem(entry.item.id, { done });
        const result = await api<{ rewards?: Array<{ xp: number }> }>(`/api/today/items/${encodeURIComponent(entry.item.id)}`, { method: "PATCH", body: JSON.stringify({ done }) });
        if (done) celebrateTick(entry.key, result.rewards?.reduce((sum, reward) => sum + reward.xp, 0) ?? 0);
        setProgressRefresh((value) => value + 1);
        return;
      }
      if (entry.event.outcome !== "completed") return markOutcome(entry.event, "completed");
      patch((prev) => ({ ...prev, events: prev.events.map((event) => (event.id === entry.event.id ? { ...event, outcome: "planned", status: "planned" } : event)) }));
      await api(`/api/events/${encodeURIComponent(entry.event.id)}/outcome`, { method: "POST", body: JSON.stringify({ outcome: "planned" }) });
      setProgressRefresh((value) => value + 1);
    },
    tomorrow: async (entry) => {
      if (entry.kind === "item") {
        patch((prev) => ({ ...prev, dayItems: (prev.dayItems ?? []).map((item) => (item.id === entry.item.id ? { ...item, day: moveKey } : item)) }));
        await api(`/api/today/items/${encodeURIComponent(entry.item.id)}`, { method: "PATCH", body: JSON.stringify({ day: moveKey }) });
        return;
      }
      const days = Math.round((startOfDayMs(moveKey, timezone) - dayStartMs) / 86_400_000);
      const shift = (iso: string) => new Date(Date.parse(iso) + days * 86_400_000).toISOString();
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
    edit: async (entry, text) => {
      const parsed = parseLoggedLine(text, data.subjects.map((subject) => subject.name));
      const kind = entry.kind === "item" ? "item" : "event";
      const id = entry.kind === "item" ? entry.item.id : entry.event.id;
      await api(`/api/today/lines/${kind}/${encodeURIComponent(id)}`, {
        method: "PUT",
        body: JSON.stringify({ day, title: parsed.title, subject: parsed.subject, start: parsed.start, end: parsed.end, evening: parsed.evening }),
      });
      void reload();
    },
    time: (entry) => setTimeFor(entry),
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
  const lineCount = entries.filter((entry) => !isHeading(entry)).length;
  const doneCount = entries.filter((entry) => !isHeading(entry) && (entry.kind === "item" ? entry.item.done : entry.event.outcome === "completed")).length;
  const summary = !isToday
    ? lineCount === 0
      ? day < today ? "Nothing written down this day." : "Nothing planned yet. Add a line below."
      : `${doneCount} of ${lineCount} done.`
    : studyBlocks.length === 0
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
        eyebrow={isToday ? formatFriendlyDate(now.toISOString(), timezone) : dayLabel(day, today).relative}
        title={isToday ? `${greeting}, ${firstName}` : dayLabel(day, today).full}
        meta={summary}
        action={!isToday ? undefined :
          <>
            <AppButton
              variant="secondary"
              onClick={() => setShowLife(true)}
              icon={<svg viewBox="0 0 20 20" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M4 10a6 6 0 0 1 10.5-4M16 10a6 6 0 0 1-10.5 4M14 3v3.5h-3.5M6 17v-3.5h3.5" strokeLinecap="round" strokeLinejoin="round" /></svg>}
            >
              Life happened
            </AppButton>
          </>
        }
      />
      {toast ? (
        <div
          key={toast.at}
          role="status"
          className={`arcadia-toast top-24 rounded-full font-semibold shadow-lg ${toast.big ? "px-6 py-3 text-[17px]" : "px-4 py-2 text-sm"}`}
          style={{ background: "var(--app-arcad)", color: "var(--app-arcad-on)" }}
        >
          {toast.text}
        </div>
      ) : null}

      <div className={`mx-auto grid w-full gap-8 px-6 pb-10 pt-6 sm:px-10 ${data.focusTasks.length > 0 ? "max-w-[1160px] @3xl/main:grid-cols-[minmax(0,1fr)_260px]" : "max-w-[720px]"}`}>
        <section className="min-w-0">
          <DayNav day={day} today={today} onChange={(next) => setViewDay(next === today ? null : next)} />
          {isToday ? (
            <>
              <StartNowCard />
              <TodayProgress refreshKey={progressRefresh} localDoneMinutes={completed.reduce((sum, event) => sum + Math.round((Date.parse(event.endAt) - Date.parse(event.startAt)) / 60000), 0)} compact />
            </>
          ) : null}
          <TodayCard
            laterEvents={laterEvents}
            inProgressIds={inProgressIds}
            busyId={busyId}
            celebrate={celebrateId}
            settling={settling}
            timezone={timezone}
            hasTasks={data.tasks.length > 0}
            entries={entries}
            today={day}
            isToday={isToday}
            dayStartMs={dayStartMs}
            priorityPicks={data.priorityPicks ?? []}
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
          {isToday ? (
            <>
              <div className="mt-6 empty:hidden [&>*~*]:hidden">
                <HolidayCard />
                <NewTermCard onAdd={requestAddToToday} />
                <DailyCheckInCard />
                <SundayReviewInline />
                <ProactiveArcadCards limit={1} />
              </div>
              <TellArcad />
            </>
          ) : null}
        </section>

        <TodayRail />
      </div>

      {doneMoment ? (
        <BlockDoneMoment
          event={doneMoment.event}
          task={doneMoment.task}
          blocks={doneMoment.blocks}
          breakMinutes={Math.max(5, Number(data.preferences?.breakMinutes ?? 10) || 10)}
          report={doneMoment.report ?? null}
          timezone={timezone}
          onClose={() => setDoneMoment(null)}
        />
      ) : null}
      {timeFor ? (
        <TimeSheet
          title={timeFor.kind === "item" ? timeFor.item.text : timeFor.event.title}
          start={timeFor.kind === "block" ? Math.round((Date.parse(timeFor.event.startAt) - dayStartMs) / 60000) : null}
          end={timeFor.kind === "block" && timeFor.event.kind === "note-range" ? Math.round((Date.parse(timeFor.event.endAt) - dayStartMs) / 60000) : null}
          onClose={() => setTimeFor(null)}
          onSave={async (start, end) => {
            const entry = timeFor;
            const kind = entry.kind === "item" ? "item" : "event";
            const id = entry.kind === "item" ? entry.item.id : entry.event.id;
            await api(`/api/today/lines/${kind}/${encodeURIComponent(id)}`, {
              method: "PUT",
              body: JSON.stringify({
                day,
                title: entry.kind === "item" ? entry.item.text : entry.event.title,
                subject: entry.kind === "item" ? entry.item.subject : entry.event.subject,
                start,
                end,
                evening: false,
              }),
            });
            void reload();
          }}
        />
      ) : null}
      {isToday ? <LaterOffer /> : null}
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
  laterEvents: PlannerEvent[];
  inProgressIds: Set<string>;
  busyId: string | null;
  celebrate: { id: string; at: number } | null;
  settling: ReadonlySet<string>;
  timezone: string;
  hasTasks: boolean;
  onNewTask: () => void;
  /** Today's note, in order: blocks and the student's own lines. */
  entries: NoteEntry[];
  /** The day on screen (YYYY-MM-DD). */
  today: string;
  isToday: boolean;
  dayStartMs: number;
  priorityPicks: PriorityPick[];
  onLine: LineActions;
  onComplete: (event: PlannerEvent) => void;
  onMiss: (event: PlannerEvent) => void;
  onOpen: (event: PlannerEvent, mode: EventSheetMode) => void;
}

function TodayCard(props: TodayCardProps) {
  const {
    laterEvents, inProgressIds, busyId, celebrate, settling, timezone, hasTasks,
    onNewTask, onComplete, onMiss, onOpen, entries, today, isToday, onLine, dayStartMs, priorityPicks,
  } = props;
  const { subjects, rolledOver: justRolled } = useDashboardData().data;
  // "3 things moved over from yesterday": kept from the load that moved them, not cleared by the next reload.
  const [rolledOver, setRolledOver] = useState(0);
  if (justRolled && justRolled !== rolledOver) setRolledOver(justRolled);
  // Lines added after the page opened drop in; the ones already there just stagger in.
  const [mountedAt] = useState(readNow);
  // A day with sections, or any day but today, reads top to bottom like the note it is.
  const journal = !isToday || entries.some(isHeading);
  const headline = entries.find((entry) => entry.kind === "item" && headlineText(entry.item.text) !== null);
  const { open, done } = splitDone(
    entries.filter((entry) => entry !== headline).map((entry) => ({
      key: entry.key,
      done: !journal && (entry.kind === "item" ? entry.item.done : entry.event.outcome !== "planned"),
      entry,
    })),
    settling,
  );
  // When Arcad replans or a line moves the plan, everything slides into its new place.
  const blockList = useRef<HTMLUListElement>(null);
  useFlip(blockList, entries.map((entry) => (entry.kind === "block" ? `${entry.key}@${entry.event.startAt}` : entry.key)).join("|"));
  // A "- note" typed into the line attaches to the last of the student's own lines.
  const lastMine = [...entries].reverse().find((entry) => !isHeading(entry) && (entry.kind === "item" || entry.mine));
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
      {headline && headline.kind === "item" ? (
        <div className="group flex items-start gap-3 px-5 pt-5 sm:px-6">
          <p className="min-w-0 flex-1 text-[19px] font-semibold leading-snug tracking-[-0.01em]" style={{ color: "var(--app-text)" }}>
            {headlineText(headline.item.text)}
          </p>
          <button
            type="button"
            aria-label="Remove headline"
            onClick={() => void onLine.remove(headline)}
            className="ui-press mt-1 rounded-full px-2 text-[13px] opacity-60 hover:opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
            style={{ color: "var(--app-text-muted)" }}
          >
            ✕
          </button>
        </div>
      ) : null}
      <div className="pt-3">
        <AddLine today={today} timezone={timezone} lastLine={lastLine} empty={entries.length === 0} />
        {isToday && rolledOver ? (
          <p className="px-5 pb-1 pl-[58px] text-[12.5px]" style={{ color: "var(--app-text-muted)" }}>
            {rolledOver === 1 ? "One thing" : `${rolledOver} things`} moved over from yesterday.
          </p>
        ) : null}
      </div>
      {isToday ? <BlockingBar timezone={timezone} /> : null}
      {isToday ? <GapSuggestion
        events={[...entries.flatMap((entry) => (entry.kind === "block" ? [entry.event] : [])), ...laterEvents]}
        picks={priorityPicks}
        today={today}
        timezone={timezone}
        dayStartMs={dayStartMs}
      /> : null}

      {entries.length === 0 && !hasTasks && isToday ? (
        // Fresh account: a few concrete ways to seed a plan under the line.
        <FirstRunActions onNewTask={onNewTask} />
      ) : (
        <ul ref={blockList} className="arcadia-stagger flex flex-col px-2 pb-3 sm:px-3" aria-label="Today">
          {[...open, ...(done.length ? [null] : []), ...done].map((row, index) => {
            if (!row) {
              return (
                <li key="done-heading" data-flip-id="done-heading" className="px-3 pb-1 pt-4 text-[12px] font-medium" style={{ color: "var(--app-text-muted)", ["--i" as string]: index }}>
                  Done
                </li>
              );
            }
            const entry = row.entry;
            const section = entry.kind === "item" ? sectionText(entry.item.text) : null;
            if (section !== null && entry.kind === "item") {
              return (
                <li
                  key={entry.key}
                  data-flip-id={entry.key}
                  className="px-3 pb-1 pt-4 text-[12.5px] font-semibold uppercase tracking-[0.06em]"
                  style={{ color: "var(--app-text-muted)", ["--i" as string]: index }}
                  onContextMenu={(e) => showContextMenu(e, [{ kind: "item", label: "Delete", onSelect: () => void onLine.remove(entry), danger: true }])}
                >
                  {section}
                </li>
              );
            }
            const fresh = Date.parse((entry.kind === "item" ? entry.item.createdAt : entry.event.createdAt) ?? "") > mountedAt;
            if (entry.kind === "block" && !entry.mine) {
              const event = entry.event;
              const actionable = event.outcome === "planned";
              const minutes = Math.round((Date.parse(event.endAt) - Date.parse(event.startAt)) / 60000);
              return (
                <LineRow
                  key={entry.key}
                  flipId={event.id}
                  // Arcad's topic once it's set up, a deadline's name, else the subject.
                  title={event.plan?.topic ?? (event.taskId ? event.title : event.subject || event.title)}
                  time={formatClock(event.startAt, timezone)}
                  subtime={formatDurationMinutes(minutes)}
                  dot={subjectColour(subjects, event.subject)}
                  note=""
                  done={event.outcome === "completed"}
                  muted={event.outcome === "missed"}
                  busy={busyId === event.id}
                  href={actionable ? `/app/sessions?eventId=${encodeURIComponent(event.id)}` : undefined}
                  celebrate={celebrate?.id === event.id ? celebrate.at : 0}
                  index={index}
                  actions={actionable ? [
                    { label: "Missed", onSelect: () => onMiss(event) },
                    ...(event.editable !== false ? [
                      { label: "Move", onSelect: () => onOpen(event, "reschedule") },
                      { label: "Remove", onSelect: () => void onLine.remove(entry), danger: true },
                    ] : []),
                  ] : [{ label: "Details", onSelect: () => onOpen(event, "details") }]}
                  onToggle={() => onComplete(event)}
                />
              );
            }
            const title = entry.kind === "item" ? entry.item.text : entry.event.title;
            const subject = entry.kind === "item" ? entry.item.subject : entry.event.subject;
            return (
              <LineRow
                key={entry.key}
                flipId={entry.key}
                title={title}
                time={lineTime(entry, timezone)}
                dot={subjectColour(subjects, subject ?? matchSubject(title, subjects.map((item) => item.name)))}
                note={entry.kind === "item" ? entry.item.note : entry.event.note ?? ""}
                done={entry.kind === "item" ? entry.item.done : entry.event.outcome === "completed"}
                busy={entry.kind === "block" && busyId === entry.event.id}
                celebrate={celebrate && celebrate.id === (entry.kind === "item" ? entry.item.id : entry.event.id) ? celebrate.at : 0}
                fresh={fresh}
                index={index}
                actions={[
                  { label: entry.kind === "item" ? "Set time" : "Change time", onSelect: () => onLine.time(entry) },
                  { label: isToday ? "Tomorrow" : "Move to today", onSelect: () => void onLine.tomorrow(entry) },
                  { label: "Delete", onSelect: () => void onLine.remove(entry), danger: true },
                ]}
                onToggle={() => void onLine.toggle(entry)}
                onNote={(note) => void onLine.note(entry, note)}
                editText={editableText(entry, timezone)}
                onEdit={(text) => void onLine.edit(entry, text)}
              />
            );
          })}
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
      <EmptyArt className="mx-auto mb-2" />
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
  edit: (entry: NoteEntry, text: string) => Promise<void>;
  /** Opens the time picker for one of the student's own lines. */
  time: (entry: NoteEntry) => void;
}

/** A line as the student would type it, so editing shows "SLC 10:50", not just "SLC". */
function editableText(entry: NoteEntry, timezone: string): string {
  if (entry.kind === "item") return entry.item.evening ? `${entry.item.text} tonight` : entry.item.text;
  const clock = (iso: string) => formatClock(iso, timezone).replace(/:00(?=[ap]m)/, "");
  return entry.event.kind === "note-range"
    ? `${entry.event.title} ${clock(entry.event.startAt)} to ${clock(entry.event.endAt)}`
    : `${entry.event.title} ${clock(entry.event.startAt)}`;
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

/** A headline ("!...") or section heading ("School:"): part of the note, never a thing to tick. */
function isHeading(entry: NoteEntry): boolean {
  return entry.kind === "item" && isDayHeading(entry.item.text);
}
