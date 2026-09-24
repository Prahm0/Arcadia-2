"use client";

import { useMemo, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import Link from "next/link";
import { formatMinutes } from "@/lib/api/time";
import { STREAK_GOLD } from "@/shared/constellations";
import { CONSISTENCY_THRESHOLD, type DayConsistency, type StreakSummary } from "@/lib/app/streaks";

/** Two weeks: enough to see a run form and where the last one broke. */
const DAYS = 14;
/** A gentle wave, so the run of days reads as a constellation rather than a chart. */
const WAVE = [68, 50, 62, 40, 56, 44, 66, 48, 60, 38, 54, 42, 64, 46];
const GOLD = STREAK_GOLD;
// Recovered days keep the same gold; the caption says what happened.
const SAGE = GOLD;
const STAR = "#fff8ea";
/** The panel is always night-dark, so its buttons don't follow the app theme. */
const BUTTON = "inline-flex h-9 shrink-0 items-center justify-center whitespace-nowrap rounded-md px-3.5 text-[13px] font-medium transition-colors duration-100";
const SPARKLE = "M12 0C12 7.6 16.4 12 24 12C16.4 12 12 16.4 12 24C12 16.4 7.6 12 0 12C7.6 12 12 7.6 12 0Z";

type State = "kept" | "recovered" | "missed" | "pending" | "rest";

interface ChainDay {
  key: string;
  state: State;
  record: DayConsistency | null;
  isToday: boolean;
}

/**
 * The plan streak drawn as a chain of stars, one per day. A day that counts
 * lights its star and joins the chain; a day under 70% of its plan breaks it;
 * a day with nothing planned is a faint point the chain passes straight over,
 * the same way the streak itself does.
 */
export default function StreakChain({ streak, today }: { streak: StreakSummary; today: string }) {
  const days = useMemo(() => buildDays(streak, today), [streak, today]);
  const links = useMemo(() => buildLinks(days, streak, today), [days, streak, today]);
  const [selected, setSelected] = useState(DAYS - 1);
  const buttons = useRef<Array<HTMLButtonElement | null>>([]);
  const shown = days[selected];

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const moves: Record<string, number> = {
      ArrowRight: index + 1, ArrowDown: index + 1, ArrowLeft: index - 1, ArrowUp: index - 1, Home: 0, End: DAYS - 1,
    };
    if (!(event.key in moves)) return;
    event.preventDefault();
    const next = Math.max(0, Math.min(DAYS - 1, moves[event.key]));
    setSelected(next);
    buttons.current[next]?.focus();
  };

  const target = streak.nextMilestone;
  const progress = target ? Math.min(1, streak.current / target) : 1;

  return (
    <section
      aria-label="Your streak"
      className="relative isolate overflow-hidden rounded-xl text-[#f1f3f6]"
      style={{ background: "#0c1017", boxShadow: "var(--elev-1)" }}
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          background: `radial-gradient(60% 90% at 78% 40%, color-mix(in srgb, ${GOLD} 9%, transparent), transparent 70%), radial-gradient(40% 70% at 12% 90%, #26334770, transparent 70%)`,
        }}
      />
      <div className="grid gap-6 px-6 pb-4 pt-6 sm:px-8 sm:pt-8 lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-10">
        <div>
          <p className="text-[10px] uppercase tracking-[.16em] text-[#a8b4c4]">Current streak</p>
          <p className="mt-3 flex items-baseline gap-2">
            <span key={streak.current} className="app-pop inline-block text-[56px] font-semibold leading-none tracking-[-0.04em] tabular-nums">
              {streak.current}
            </span>
            <span className="text-[15px] text-[#b6bfcb]">{streak.current === 1 ? "day" : "days"}</span>
          </p>
          <p className="mt-3 text-[13px] leading-[1.5] text-[#b6bfcb]">
            {streak.current === 0
              ? streak.lastPlannedDay?.missReason
                ? `Reset, ${streak.lastPlannedDay.missReason}. Do 70% of a day's plan to restart it.`
                : "Do 70% of a day's plan to start one."
              : target && streak.daysToNext
                ? `${streak.daysToNext} more ${streak.daysToNext === 1 ? "day" : "days"} to a ${target}-day streak.`
                : "Past every milestone. Keep the chain going."}
          </p>
          {streak.current > 0 && target ? (
            <span className="mt-3 block h-[3px] overflow-hidden rounded-full bg-[#ffffff1a]" aria-hidden="true">
              <span className="block h-full rounded-full transition-[width] duration-700" style={{ width: `${progress * 100}%`, background: GOLD }} />
            </span>
          ) : null}
          {streak.longest > 0 ? (
            <p className="mt-3 text-[12px] tabular-nums text-[#99a7ba]">Best {streak.longest} {streak.longest === 1 ? "day" : "days"}</p>
          ) : null}
        </div>

        <div className="min-w-0">
          <div
            role="group"
            aria-label={`The last ${DAYS} days. Use the arrow keys to move between days.`}
            className="relative aspect-[1000/190] min-h-[96px] w-full"
          >
            <svg aria-hidden="true" className="absolute inset-0 h-full w-full overflow-visible" viewBox="0 0 1000 100" preserveAspectRatio="none" fill="none">
              {links.map((link, index) => {
                const [a, b] = [point(index), point(index + 1)];
                return (
                  <line
                    key={index}
                    x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                    stroke={link === "recovered" ? SAGE : link === "off" ? "#dce5f4" : GOLD}
                    strokeWidth={link === "off" ? 1 : 1.6}
                    strokeOpacity={link === "off" ? 0.16 : link === "pending" ? 0.5 : 0.75}
                    strokeDasharray={link === "on" || link === "recovered" ? undefined : "2 6"}
                    strokeLinecap="round"
                    vectorEffect="non-scaling-stroke"
                  />
                );
              })}
            </svg>
            {days.map((day, index) => (
              <DayStar
                key={day.key}
                ref={(node) => { buttons.current[index] = node; }}
                day={day}
                index={index}
                active={index === selected}
                onSelect={() => setSelected(index)}
                onKeyDown={(event) => onKeyDown(event, index)}
              />
            ))}
          </div>
          <ol aria-hidden="true" className="mt-1 grid text-center text-[10px] tabular-nums text-[#7f8ca0]" style={{ gridTemplateColumns: `repeat(${DAYS}, minmax(0, 1fr))` }}>
            {days.map((day, index) => (
              <li key={day.key} style={{ color: index === selected ? "#f1f3f6" : undefined }}>
                {day.isToday ? "Today" : weekdayInitial(day.key)}
              </li>
            ))}
          </ol>
        </div>
      </div>

      {/* Fixed height so picking a day without an action doesn't shift the page. */}
      <div className="flex min-h-[68px] flex-wrap items-center justify-between gap-x-6 gap-y-3 border-t border-[#ffffff14] px-6 py-4 sm:px-8">
        <p aria-live="polite" className="min-w-0 text-[13px] leading-[1.5] text-[#d5dbe3]">
          <span className="font-medium text-[#f1f3f6]">{shown.isToday ? "Today" : longDate(shown.key)}</span>
          {" · "}
          {caption(shown)}
        </p>
        {shown.isToday && shown.state !== "kept" && shown.state !== "recovered" ? (
          shown.state === "rest" ? (
            <Link href="/app/schedule" className={`${BUTTON} bg-[#ffffff14] text-[#f1f3f6] hover:bg-[#ffffff24]`}>Plan today</Link>
          ) : (
            <Link href="/app/focus" className={`${BUTTON} bg-[#f1f3f6] text-[#0c1017] hover:bg-white`}>Start focus</Link>
          )
        ) : null}
      </div>
    </section>
  );
}

function DayStar({
  ref,
  day,
  index,
  active,
  onSelect,
  onKeyDown,
}: {
  ref: (node: HTMLButtonElement | null) => void;
  day: ChainDay;
  index: number;
  active: boolean;
  onSelect: () => void;
  onKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => void;
}) {
  const { x, y } = point(index);
  const lit = day.state === "kept" || day.state === "recovered";
  const colour = day.state === "recovered" ? SAGE : GOLD;
  return (
    <button
      ref={ref}
      type="button"
      tabIndex={active ? 0 : -1}
      aria-pressed={active}
      aria-label={`${day.isToday ? "Today" : longDate(day.key)}. ${caption(day)}`}
      onClick={onSelect}
      onPointerEnter={onSelect}
      onFocus={onSelect}
      onKeyDown={onKeyDown}
      className="group absolute flex size-10 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-[#ffffff80]"
      style={{ left: `${x / 10}%`, top: `${y}%` }}
    >
      {active ? <span aria-hidden="true" className="absolute size-9 rounded-full bg-[#ffffff0d] ring-1 ring-[#ffffff40]" /> : null}
      {lit ? (
        <span
          aria-hidden="true"
          className="absolute size-9 rounded-full"
          style={{ background: `radial-gradient(circle, color-mix(in srgb, ${colour} 38%, transparent) 0%, transparent 68%)` }}
        />
      ) : null}
      {day.state === "pending" ? (
        <span aria-hidden="true" className="sky-pulse absolute size-6 rounded-full" style={{ boxShadow: `inset 0 0 0 1.5px ${GOLD}` } as CSSProperties} />
      ) : null}
      {lit || day.state === "pending" ? (
        <svg aria-hidden="true" viewBox="0 0 24 24" className="relative transition-transform duration-200 group-hover:scale-125" style={{ width: lit ? 16 : 11, height: lit ? 16 : 11 }}>
          <path d={SPARKLE} fill={lit ? STAR : GOLD} opacity={lit ? 1 : 0.85} style={lit ? { filter: `drop-shadow(0 0 5px ${colour})` } : undefined} />
        </svg>
      ) : day.state === "missed" ? (
        <span aria-hidden="true" className="relative size-[9px] rounded-full" style={{ boxShadow: "inset 0 0 0 1px #dce5f4", opacity: 0.45 }} />
      ) : (
        <span aria-hidden="true" className="relative size-[3px] rounded-full bg-[#dce5f4] opacity-40" />
      )}
    </button>
  );
}

function buildDays(streak: StreakSummary, today: string): ChainDay[] {
  const byKey = new Map(streak.history.map((day) => [day.key, day]));
  return Array.from({ length: DAYS }, (_, index) => {
    const key = shiftKey(today, index - (DAYS - 1));
    const record = byKey.get(key) ?? null;
    const isToday = key === today;
    let state: State = "rest";
    if (record && record.plannedMinutes > 0) {
      if (record.consistent) state = record.recovered ? "recovered" : "kept";
      else if (isToday || record.isInProgress) state = "pending";
      else state = "missed";
    }
    return { key, state, record, isToday };
  });
}

/**
 * A link is lit when the days on either side of it sit in one unbroken run:
 * the nearest decided day behind it and the nearest one ahead both counted.
 * Rest days are transparent, as they are to the streak. The last stretch up
 * to a still-open today is drawn dashed: the chain is waiting on it.
 */
function buildLinks(days: ChainDay[], streak: StreakSummary, today: string): Array<"on" | "recovered" | "pending" | "off"> {
  const decided = (day: ChainDay) =>
    day.state === "kept" || day.state === "recovered" ? true : day.state === "missed" ? false : null;
  const windowStart = shiftKey(today, -(DAYS - 1));
  // Carry the run in from before the window, so a long streak doesn't start mid-air.
  const before = [...streak.history].reverse().find((day) => day.key < windowStart && day.plannedMinutes > 0 && !day.isInProgress);
  const seed = before ? before.consistent : null;

  return days.slice(1).map((_, index) => {
    let behind: boolean | null = seed;
    for (let i = index; i >= 0; i -= 1) {
      const value = decided(days[i]);
      if (value !== null) { behind = value; break; }
    }
    let ahead: boolean | null = null;
    let aheadDay: ChainDay | null = null;
    for (let i = index + 1; i < days.length; i += 1) {
      const value = decided(days[i]);
      if (value !== null) { ahead = value; aheadDay = days[i]; break; }
    }
    if (behind && ahead) return aheadDay?.state === "recovered" && days[index + 1] === aheadDay ? "recovered" : "on";
    if (behind && ahead === null && streak.current > 0) return "pending";
    return "off";
  });
}

function caption(day: ChainDay): string {
  const record = day.record;
  const threshold = Math.round(CONSISTENCY_THRESHOLD * 100);
  if (!record || record.plannedMinutes === 0) {
    return day.isToday
      ? "Nothing planned, so your streak is safe. Plan a block to add today to the chain."
      : "Nothing planned. Rest days don't break a streak.";
  }
  const done = `${formatMinutes(record.actualMinutes)} of ${formatMinutes(record.plannedMinutes)} planned`;
  if (day.state === "recovered") return `${done}. A block slipped, but you still did ${Math.round(record.ratio * 100)}%, so it counted.`;
  if (day.state === "kept") return `${done}. Counted.`;
  if (day.state === "pending") {
    const need = Math.max(0, Math.ceil(record.plannedMinutes * CONSISTENCY_THRESHOLD) - record.actualMinutes);
    return `${done}. ${formatMinutes(need)} more locks it in.`;
  }
  return `${done}. Under ${threshold}%, so the chain broke here.`;
}

function point(index: number) {
  return { x: 36 + index * (928 / (DAYS - 1)), y: WAVE[index % WAVE.length] };
}

function shiftKey(key: string, days: number): string {
  const [y, m, d] = key.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function weekdayInitial(key: string): string {
  return new Intl.DateTimeFormat("en-AU", { weekday: "narrow", timeZone: "UTC" }).format(Date.parse(`${key}T12:00:00Z`));
}

function longDate(key: string): string {
  return new Intl.DateTimeFormat("en-AU", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(Date.parse(`${key}T12:00:00Z`));
}
