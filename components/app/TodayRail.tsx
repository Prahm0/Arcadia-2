"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import type { CompanionProfile, PlannerTask } from "@/lib/api/types";
import { formatDueSoon, formatDurationMinutes } from "@/lib/api/time";
import { useDashboardData } from "@/lib/app/DashboardProvider";
import { START_STREAK_HINT } from "@/lib/app/streaks";
import { useStreak } from "@/lib/app/useStreak";
import Companion from "./Companion";
import CompanionSheet from "./CompanionSheet";

/**
 * The column beside Today: one panel, read top to bottom. Your companion and
 * how close it is to growing, the week's focus by day, the streak, and
 * what's due next. Everything in it is a real number from the dashboard.
 */
export default function TodayRail() {
  const { data } = useDashboardData();
  const timezone = data.profile?.timezone || data.user.timezone || "Australia/Brisbane";

  return (
    <aside
      aria-label="Your progress"
      className="self-start overflow-hidden rounded-xl @3xl/main:sticky @3xl/main:top-6"
      style={{ background: "var(--app-surface)", boxShadow: "var(--elev-1)" }}
    >
      <CompanionSection />
      <WeekSection days={data.analytics.days ?? []} todayMinutes={Number(data.analytics.todayMinutes ?? 0)} />
      <StreakSection />
      <DeadlinesSection tasks={data.focusTasks} timezone={timezone} />
      <Link
        href="/app/analytics"
        className="ui-hover flex items-center justify-between border-t px-5 py-3 text-[13px] font-medium"
        style={{ borderColor: "var(--app-border)", color: "var(--app-text-soft)" }}
      >
        All analytics
        <Chevron />
      </Link>
    </aside>
  );
}

function Section({ title, aside, children }: { title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className="border-t px-5 py-4 first:border-t-0" style={{ borderColor: "var(--app-border)" }}>
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-[12.5px] font-medium" style={{ color: "var(--app-text-muted)" }}>
          {title}
        </h3>
        {aside ? (
          <span className="text-[12.5px] tabular-nums" style={{ color: "var(--app-text-muted)" }}>
            {aside}
          </span>
        ) : null}
      </div>
      {children}
    </section>
  );
}

function CompanionSection() {
  const { data } = useDashboardData();
  const [open, setOpen] = useState(false);
  const companion = data.companion;
  const profile = normalizeProfile(companion?.profile);
  const level = Math.max(1, Math.min(4, Number(companion?.level ?? 1)));
  const focused = Number(companion?.focusedMinutes ?? 0);
  const next = companion?.nextLevelMinutes ?? null;
  const previous = [0, 300, 1200, 3000][level - 1];
  const progress = next ? Math.min(1, (focused - previous) / (next - previous)) : 1;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="ui-hover flex w-full items-center gap-4 px-5 pb-4 pt-5 text-left"
        aria-label={`${profile.name}, stage ${level}. Customise your companion`}
      >
        <Companion
          form={profile.form}
          palette={profile.palette}
          accessory={profile.accessory}
          level={level}
          state={companion?.state === "recovering" ? "recovering" : "ready"}
          size={72}
        />
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline justify-between gap-2">
            <span className="truncate text-[16px] font-semibold tracking-[-0.01em]" style={{ color: "var(--app-text)" }}>
              {profile.name}
            </span>
            <span className="shrink-0 text-[12.5px]" style={{ color: "var(--app-text-muted)" }}>
              Stage {level}
            </span>
          </span>
          <span
            className="mt-2.5 block h-[3px] overflow-hidden rounded-[1px]"
            style={{ background: "var(--app-border)" }}
            aria-hidden="true"
          >
            <span
              className="block h-full"
              style={{ width: `${Math.max(2, progress * 100)}%`, background: "var(--app-text)", transition: "width 0.5s var(--ease-out-expo)" }}
            />
          </span>
          <span className="mt-1.5 block text-[12.5px] tabular-nums" style={{ color: "var(--app-text-muted)" }}>
            {next
              ? `${formatDurationMinutes(Math.max(1, next - focused))} of focus to stage ${level + 1}`
              : `${formatDurationMinutes(focused)} focused, fully grown`}
          </span>
        </span>
      </button>
      <CompanionSheet open={open} onClose={() => setOpen(false)} initial={profile} />
    </>
  );
}

function WeekSection({ days, todayMinutes }: { days: Array<{ date: string; minutes: number }>; todayMinutes: number }) {
  const total = days.reduce((sum, day) => sum + day.minutes, 0);
  // An hour is the floor for the scale, so one short session doesn't fill the chart.
  const max = Math.max(60, ...days.map((day) => day.minutes));

  return (
    <Section title="Last 7 days" aside={`${formatDurationMinutes(total)} focused`}>
      <div className="mt-4 flex h-[88px] items-end gap-2" role="img" aria-label={days.map((day) => `${weekday(day.date)} ${day.minutes} minutes`).join(", ")}>
        {days.map((day, index) => {
          const isToday = index === days.length - 1;
          return (
            <div key={day.date} className="flex h-full flex-1 flex-col items-center justify-end gap-1.5">
              <div className="flex w-full flex-1 items-end">
                <div
                  className="w-full rounded-t-[2px]"
                  style={{
                    height: day.minutes > 0 ? `${Math.max(6, (day.minutes / max) * 100)}%` : 3,
                    background: isToday ? "var(--app-text)" : day.minutes > 0 ? "var(--app-text-faint)" : "var(--app-border)",
                    opacity: isToday || day.minutes > 0 ? 1 : 0.9,
                  }}
                />
              </div>
              <span
                className="text-[11px]"
                style={{ color: isToday ? "var(--app-text)" : "var(--app-text-faint)", fontWeight: isToday ? 600 : 400 }}
              >
                {weekday(day.date).charAt(0)}
              </span>
            </div>
          );
        })}
      </div>
      <p className="mt-3 text-[12.5px] tabular-nums" style={{ color: "var(--app-text-muted)" }}>
        Today <span style={{ color: "var(--app-text)" }}>{formatDurationMinutes(todayMinutes)}</span>
      </p>
    </Section>
  );
}

function StreakSection() {
  const streak = useStreak();
  const pct = streak.nextMilestone ? Math.min(1, streak.current / streak.nextMilestone) : 1;

  return (
    <Section title="Streak" aside={streak.longest > streak.current ? `Best ${streak.longest}` : undefined}>
      <p className="mt-2 flex items-baseline gap-1.5">
        <span className="text-[28px] font-semibold leading-none tracking-[-0.02em] tabular-nums" style={{ color: "var(--app-text)" }}>
          {streak.current}
        </span>
        <span className="text-[13px]" style={{ color: "var(--app-text-muted)" }}>
          {streak.current === 1 ? "day" : "days"}
        </span>
      </p>
      <p className="mt-2 text-[12.5px] leading-snug" style={{ color: "var(--app-text-muted)" }}>
        {streak.current === 0
          ? START_STREAK_HINT
          : streak.nextMilestone && streak.daysToNext
            ? `${streak.daysToNext} more to ${streak.nextMilestone}`
            : "Past every milestone"}
      </p>
      {streak.current > 0 && streak.nextMilestone ? (
        <span className="mt-2 block h-[3px] overflow-hidden rounded-[1px]" style={{ background: "var(--app-border)" }} aria-hidden="true">
          <span className="block h-full" style={{ width: `${pct * 100}%`, background: "var(--app-text)" }} />
        </span>
      ) : null}
    </Section>
  );
}

function DeadlinesSection({ tasks, timezone }: { tasks: PlannerTask[]; timezone: string }) {
  return (
    <Section title="Due next">
      {tasks.length === 0 ? (
        <p className="mt-2 text-[13px]" style={{ color: "var(--app-text-muted)" }}>
          Nothing due. Add a deadline and it&apos;s planned in.
        </p>
      ) : (
        <ul className="mt-2.5 flex flex-col gap-3">
          {tasks.slice(0, 3).map((task) => (
            <li key={task.id} className="min-w-0">
              <p className="truncate text-[13.5px] font-medium" style={{ color: "var(--app-text)" }}>
                {task.title}
              </p>
              <p className="mt-0.5 truncate text-[12px] tabular-nums" style={{ color: "var(--app-text-muted)" }}>
                {task.subject ? `${task.subject} · ` : ""}
                {formatDueSoon(task.dueAt, timezone)} · {formatDurationMinutes(task.remainingMinutes)} left
              </p>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

function weekday(date: string): string {
  return new Intl.DateTimeFormat("en-AU", { weekday: "short", timeZone: "UTC" }).format(Date.parse(`${date}T12:00:00Z`));
}

function Chevron() {
  return (
    <svg viewBox="0 0 20 20" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ color: "var(--app-text-faint)" }}>
      <path d="M8 5l5 5-5 5" />
    </svg>
  );
}

function normalizeProfile(input: unknown): CompanionProfile {
  const raw = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
  const name = typeof raw.name === "string" && raw.name.trim() ? raw.name.slice(0, 40) : "Star";
  const form = raw.form === "comet" || raw.form === "nebula" ? raw.form : "orb";
  const palette = raw.palette === "aqua" || raw.palette === "coral" || raw.palette === "gold" ? raw.palette : "violet";
  const accessory =
    raw.accessory === "ring" || raw.accessory === "star" || raw.accessory === "book" || raw.accessory === "headphones"
      ? raw.accessory
      : "none";
  return { name, form, palette, accessory };
}
