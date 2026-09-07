"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { api } from "@/lib/api/client";
import { useDashboardData } from "@/lib/app/DashboardProvider";
import type { PlannerEvent } from "@/lib/api/types";
import { cn } from "@/lib/cn";
import {
  dateKey,
  formatClock,
  formatDueSoon,
  formatDurationMinutes,
  formatFriendlyDate,
} from "@/lib/api/time";
import PageHeader from "./PageHeader";
import AppButton from "./AppButton";
import DailyCheckInCard from "./DailyCheckInCard";
import NewTaskSheet from "./NewTaskSheet";
import { useStreak } from "@/lib/app/useStreak";

const CATEGORY_BAR: Record<string, string> = {
  study: "var(--app-accent)",
  school: "#38bdf8",
  sport: "#34d399",
  extracurricular: "#f59e0b",
  sleep: "var(--app-text-faint)",
  other: "var(--app-text-muted)",
};

export default function TodayView() {
  const { data, patch } = useDashboardData();
  const timezone = data.profile?.timezone || data.user.timezone || "Australia/Sydney";
  const now = new Date();
  const today = dateKey(now.toISOString(), timezone);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [showTaskSheet, setShowTaskSheet] = useState(false);

  const todaysEvents = useMemo(
    () =>
      data.events
        .filter((event) => dateKey(event.startAt, timezone) === today)
        .sort((a, b) => Date.parse(a.startAt) - Date.parse(b.startAt)),
    [data.events, timezone, today],
  );

  const studyBlocks = todaysEvents.filter((event) => event.category === "study");
  const laterEvents = todaysEvents.filter(
    (event) => event.category !== "study" && Date.parse(event.endAt) >= now.getTime(),
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
    try {
      await api(`/api/events/${encodeURIComponent(event.id)}/outcome`, {
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
    } finally {
      setBusyId(null);
    }
  }

  const greeting = timeOfDayGreeting(now, timezone);
  const firstName = data.user.name.split(" ")[0];

  return (
    <>
      <PageHeader
        eyebrow="Today"
        title={
          <>
            {greeting}, <span className="accent-serif">{firstName}</span>.
          </>
        }
        meta={formatFriendlyDate(now.toISOString(), timezone)}
        action={
          <AppButton
            variant="primary"
            onClick={() => setShowTaskSheet(true)}
            icon={<svg viewBox="0 0 20 20" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M10 4v12M4 10h12" strokeLinecap="round" /></svg>}
          >
            New task
          </AppButton>
        }
      />

      <div className="mx-auto grid w-full max-w-[1160px] gap-8 px-6 py-8 sm:px-10 sm:py-10 lg:grid-cols-[minmax(0,1fr)_320px]">
        <section className="min-w-0">
          <DailyCheckInCard />
          <TodayCard
            date={formatFriendlyDate(now.toISOString(), timezone)}
            weekProgress={weekProgress}
            totalMinutes={totalMinutes}
            remainingCount={remaining.length}
            completedCount={completed.length}
            studyBlocks={studyBlocks}
            laterEvents={laterEvents}
            busyId={busyId}
            timezone={timezone}
            hasTasks={data.tasks.length > 0}
            onNewTask={() => setShowTaskSheet(true)}
            onComplete={(event) => markOutcome(event, "completed")}
            onMiss={(event) => markOutcome(event, "missed")}
          />
        </section>

        <aside className="flex flex-col gap-6">
          <NextDeadlinesCard tasks={data.focusTasks} timezone={timezone} />
          <StatsCard analytics={data.analytics} />
          <StreakCard />
        </aside>
      </div>

      <NewTaskSheet open={showTaskSheet} onClose={() => setShowTaskSheet(false)} />
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
  busyId: string | null;
  timezone: string;
  hasTasks: boolean;
  onNewTask: () => void;
  onComplete: (event: PlannerEvent) => void;
  onMiss: (event: PlannerEvent) => void;
}

function TodayCard(props: TodayCardProps) {
  const {
    date, weekProgress, totalMinutes, remainingCount, completedCount,
    studyBlocks, laterEvents, busyId, timezone, hasTasks,
    onNewTask, onComplete, onMiss,
  } = props;

  return (
    <div
      className="w-full rounded-[16px] shadow-[0_20px_60px_-30px_rgba(0,0,0,0.18)]"
      style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}
    >
      <div
        className="flex items-center justify-between px-5 py-4 sm:px-6"
        style={{ borderBottom: "1px solid var(--app-border)" }}
      >
        <p className="text-[13px] font-medium" style={{ color: "var(--app-text-muted)" }}>
          {date}
        </p>
        <div className="flex items-center gap-3 text-[12px]" style={{ color: "var(--app-text-muted)" }}>
          <span>Week {Math.round(weekProgress * 100)}%</span>
          <span
            className="relative h-1 w-16 overflow-hidden rounded-full"
            style={{ background: "var(--app-border)" }}
            aria-hidden="true"
          >
            <span
              className="absolute inset-y-0 left-0 rounded-full"
              style={{ width: `${weekProgress * 100}%`, background: "var(--app-text)" }}
            />
          </span>
        </div>
      </div>

      <div className="px-5 pt-6 sm:px-6">
        <h2 className="text-[26px] font-medium leading-none tracking-[-0.02em] sm:text-[30px]" style={{ color: "var(--app-text)" }}>
          Focus
        </h2>
        <p className="mt-2 text-[15px]" style={{ color: "var(--app-text-muted)" }}>
          {studyBlocks.length === 0
            ? hasTasks
              ? "Nothing scheduled today — the plan is clear."
              : "Add your first task to build a plan."
            : (
              <>
                {remainingCount === 0
                  ? "You're done for today."
                  : `${remainingCount} ${remainingCount === 1 ? "thing" : "things"} to focus on today.`}
                {remainingCount > 0 && (
                  <span className="font-mono"> · {formatDurationMinutes(totalMinutes)}</span>
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

      {studyBlocks.length === 0 ? (
        <div className="px-5 pb-6 pt-6 sm:px-6">
          <AppButton variant="secondary" onClick={onNewTask}>
            Add your first task
          </AppButton>
        </div>
      ) : (
        <ul className="mt-5 flex flex-col px-2 pb-3 sm:px-3" aria-label="Focus for today">
          {studyBlocks.map((event) => (
            <FocusRow
              key={event.id}
              event={event}
              timezone={timezone}
              busy={busyId === event.id}
              onComplete={() => onComplete(event)}
              onMiss={() => onMiss(event)}
            />
          ))}
        </ul>
      )}

      {laterEvents.length > 0 ? (
        <div className="mt-2 px-5 py-4 sm:px-6" style={{ borderTop: "1px solid var(--app-border)" }}>
          <p className="text-[12px] font-medium" style={{ color: "var(--app-text-muted)" }}>Later today</p>
          <ul className="mt-3 flex flex-col gap-2">
            {laterEvents.map((event) => (
              <li key={event.id} className="flex items-center gap-4 text-[13.5px]">
                <span
                  className="font-mono w-[80px] shrink-0"
                  style={{ color: "var(--app-text-muted)" }}
                >
                  {formatClock(event.startAt, timezone)}
                </span>
                <span className="truncate" style={{ color: "var(--app-text)" }}>{event.title}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function FocusRow({
  event, timezone, busy, onComplete, onMiss,
}: {
  event: PlannerEvent;
  timezone: string;
  busy: boolean;
  onComplete: () => void;
  onMiss: () => void;
}) {
  const isDone = event.outcome === "completed";
  const isMissed = event.outcome === "missed";
  const isActionable = !isDone && !isMissed;
  const minutes = Math.round((Date.parse(event.endAt) - Date.parse(event.startAt)) / 60000);
  const startClock = formatClock(event.startAt, timezone);
  const focusHref = `/app/focus?eventId=${encodeURIComponent(event.id)}`;

  const rowContent = (
    <>
      <span
        aria-hidden="true"
        className="h-8 w-[3px] shrink-0 rounded-full transition-colors duration-200"
        style={{
          background: isDone || isMissed ? "var(--app-border)" : CATEGORY_BAR[event.category] ?? "var(--app-accent)",
        }}
      />
      <span className="min-w-0 flex-1">
        <span className="block text-[12px]" style={{ color: "var(--app-text-muted)" }}>
          {event.subject || "Study"}
        </span>
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
          {event.title}
        </span>
      </span>
      <span className="flex shrink-0 flex-col items-end gap-1">
        <span className="font-mono text-[13px]" style={{ color: "var(--app-text)" }}>
          {formatDurationMinutes(minutes)}
        </span>
        <span className="text-[11px] font-mono" style={{ color: "var(--app-text-muted)" }}>
          {startClock}
        </span>
      </span>
      {isActionable ? (
        <span
          aria-hidden="true"
          className="ml-2 hidden shrink-0 text-[11px] opacity-0 transition-opacity group-hover:opacity-100 sm:block"
          style={{ color: "var(--app-accent-strong)" }}
        >
          Focus →
        </span>
      ) : null}
    </>
  );

  return (
    <li
      className="group flex items-center gap-1 rounded-[10px] pr-2 transition-colors duration-200 hover:bg-[color:var(--app-surface-soft)]"
    >
      {isActionable ? (
        <Link
          href={focusHref}
          className="flex min-w-0 flex-1 items-center gap-4 rounded-[10px] px-3 py-3.5 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--app-accent)]"
          aria-label={`Start focus on ${event.title}`}
        >
          {rowContent}
        </Link>
      ) : (
        <div className="flex min-w-0 flex-1 items-center gap-4 rounded-[10px] px-3 py-3.5 text-left">
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
          aria-label={`Mark ${event.title} as done`}
          className="flex size-9 items-center justify-center rounded-lg transition-colors"
        >
          <span
            aria-hidden="true"
            className="grid size-[18px] place-items-center rounded-[5px] transition-colors duration-200"
            style={{
              background: isDone ? "var(--app-text)" : "var(--app-surface)",
              border: `1px solid ${isDone ? "var(--app-text)" : "var(--app-border-strong)"}`,
              color: isDone ? "var(--app-bg)" : "transparent",
            }}
          >
            <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
              <path d="M1 4l2.5 2.5L9 1" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
        </button>
      </span>
    </li>
  );
}

function NextDeadlinesCard({ tasks, timezone }: { tasks: any[]; timezone: string }) {
  if (!tasks?.length) {
    return (
      <div className="rounded-[14px] p-5" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
        <p className="type-eyebrow" style={{ color: "var(--app-text-muted)" }}>Next deadlines</p>
        <p className="mt-3 text-[13.5px]" style={{ color: "var(--app-text-muted)" }}>
          Nothing due yet.
        </p>
      </div>
    );
  }
  return (
    <div className="rounded-[14px] p-5" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
      <p className="type-eyebrow" style={{ color: "var(--app-text-muted)" }}>Next deadlines</p>
      <ul className="mt-3 flex flex-col gap-3.5">
        {tasks.slice(0, 4).map((task) => (
          <li key={task.id}>
            <p className="text-[14.5px] font-medium tracking-[-0.005em]" style={{ color: "var(--app-text)" }}>
              {task.title}
            </p>
            <p className="mt-1 text-[12.5px] font-mono" style={{ color: "var(--app-text-muted)" }}>
              {task.subject ? `${task.subject} · ` : ""}
              {formatDueSoon(task.dueAt, timezone)} · {formatDurationMinutes(task.remainingMinutes)}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}

function StatsCard({ analytics }: { analytics: any }) {
  const streak = useStreak();
  const current = streak.current;
  const week = Number(analytics?.weekMinutes ?? 0);
  const today = Number(analytics?.todayMinutes ?? 0);
  return (
    <div className="rounded-[14px] p-5" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
      <p className="type-eyebrow" style={{ color: "var(--app-text-muted)" }}>Progress</p>
      <div className="mt-4 grid grid-cols-3 gap-4">
        <Stat label="Streak" value={String(current)} unit={current === 1 ? "day" : "days"} />
        <Stat label="Today" value={formatShort(today)} unit={today < 60 ? "min" : "hr"} />
        <Stat label="Week" value={formatShort(week)} unit={week < 60 ? "min" : "hr"} />
      </div>
    </div>
  );
}

function StreakCard() {
  const streak = useStreak();

  if (streak.current === 0 && !streak.lastPlannedDay) return null;

  if (streak.current === 0 && streak.lastPlannedDay?.missReason) {
    return (
      <div
        className="rounded-[14px] p-5"
        style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}
      >
        <p className="type-eyebrow" style={{ color: "var(--app-text-muted)" }}>Streak</p>
        <p className="mt-2 text-[15px] leading-snug" style={{ color: "var(--app-text)" }}>
          Reset — {streak.lastPlannedDay.missReason}.
        </p>
        <p className="mt-1.5 text-[12.5px]" style={{ color: "var(--app-text-muted)" }}>
          Hit 70% of planned study time in a day and it starts counting again.
        </p>
        {streak.longest > 0 ? (
          <p className="mt-3 type-mono-label" style={{ color: "var(--app-text-muted)" }}>
            Longest so far · {streak.longest} {streak.longest === 1 ? "day" : "days"}
          </p>
        ) : null}
      </div>
    );
  }

  const progressPct =
    streak.nextMilestone && streak.daysToNext
      ? Math.min(1, streak.current / streak.nextMilestone)
      : 1;

  return (
    <div
      className="rounded-[14px] p-5"
      style={{
        background: "var(--app-surface)",
        border: "1px solid var(--app-border)",
      }}
    >
      <div className="flex items-center justify-between">
        <p className="type-eyebrow" style={{ color: "var(--app-text-muted)" }}>Streak</p>
        {streak.hitMilestone ? (
          <span
            className="rounded-full px-2 py-0.5 text-[10.5px] font-medium uppercase tracking-[0.06em]"
            style={{ background: "var(--app-accent)", color: "white" }}
          >
            {streak.hitMilestone}-day
          </span>
        ) : null}
      </div>
      <p className="mt-2 text-[26px] font-medium leading-none tabular-nums" style={{ color: "var(--app-text)" }}>
        {streak.current} <span className="text-[13.5px] font-normal" style={{ color: "var(--app-text-muted)" }}>consistent {streak.current === 1 ? "day" : "days"}</span>
      </p>
      {streak.nextMilestone ? (
        <>
          <div
            className="mt-4 h-1.5 w-full overflow-hidden rounded-full"
            style={{ background: "var(--app-surface-soft)", border: "1px solid var(--app-border)" }}
            aria-hidden="true"
          >
            <div
              className="h-full rounded-full"
              style={{
                width: `${progressPct * 100}%`,
                background: "var(--app-accent)",
                transition: "width 0.4s var(--ease-out-expo, ease-out)",
              }}
            />
          </div>
          <p className="mt-2 type-mono-label" style={{ color: "var(--app-text-muted)" }}>
            {streak.daysToNext} more to {streak.nextMilestone}
          </p>
        </>
      ) : (
        <p className="mt-3 type-mono-label" style={{ color: "var(--app-text-muted)" }}>
          Past every milestone · keep going
        </p>
      )}
      {streak.longest > streak.current ? (
        <p className="mt-2 text-[11.5px]" style={{ color: "var(--app-text-faint)" }}>
          Longest {streak.longest} days
        </p>
      ) : null}
    </div>
  );
}

function Stat({ label, value, unit }: { label: string; value: string; unit: string }) {
  return (
    <div>
      <p className="text-[11px]" style={{ color: "var(--app-text-muted)" }}>{label}</p>
      <p className="mt-1 text-[22px] font-medium leading-none font-mono" style={{ color: "var(--app-text)" }}>{value}</p>
      <p className="mt-0.5 text-[11px]" style={{ color: "var(--app-text-muted)" }}>{unit}</p>
    </div>
  );
}

function formatShort(minutes: number): string {
  if (minutes < 60) return String(minutes);
  const h = Math.floor(minutes / 60);
  const r = minutes % 60;
  return r === 0 ? `${h}` : `${h}.${Math.round((r / 60) * 10)}`;
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
