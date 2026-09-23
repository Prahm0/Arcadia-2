"use client";

import { useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";
import Link from "next/link";
import ArcadiaMark from "@/components/ui/ArcadiaMark";
import { SubjectTag } from "./cards/shared";
import { appButtonClass } from "./AppButton";
import { SUBJECT_COLORS } from "@/lib/app/categoryColors";
import { CONSISTENCY_THRESHOLD, STREAK_MILESTONES, type StreakSummary } from "@/lib/app/streaks";

export interface SkyTotals {
  sessions: number;
  minutes: number;
  subjects: Array<{ subject: string; minutes: number; sessions: number }>;
}

/**
 * The constellation, in a 1000 x 400 box. Positions are percentages of the
 * sky, so the lines (a stretched SVG) and the stars (fixed-size HTML) stay
 * lined up at every width. Stars light in array order, one per session.
 */
const STARS: Array<{ x: number; y: number; from?: number; name?: string; keystone?: boolean }> = [
  { x: 70, y: 340, name: "First light" },
  { x: 150, y: 300 },
  { x: 235, y: 272 },
  { x: 318, y: 230 },
  { x: 392, y: 186, name: "First orbit" },
  { x: 452, y: 132 },
  { x: 516, y: 58, name: "Keystone", keystone: true },
  { x: 574, y: 124 },
  { x: 612, y: 184 },
  { x: 668, y: 238 },
  { x: 742, y: 232 },
  { x: 792, y: 290 },
  { x: 862, y: 300 },
  { x: 928, y: 352 },
  { x: 776, y: 146, from: 10 },
  { x: 858, y: 94, from: 14, name: "Full sky" },
];
const EDGES = STARS.flatMap((star, index) => (index === 0 ? [] : [[star.from ?? index - 1, index] as const]));

/** A scatter of background stars. Seeded, so the sky is the same every visit. */
const FIELD = (() => {
  let seed = 20260923;
  const rand = () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return Array.from({ length: 110 }, () => ({
    x: rand() * 100,
    y: rand() * 100,
    size: rand() < 0.14 ? 2 : rand() < 0.5 ? 1.5 : 1,
    opacity: 0.2 + rand() * 0.55,
    twinkle: rand() < 0.3,
    delay: Math.round(rand() * 5000),
    duration: 3 + rand() * 4,
  }));
})();
const FIELD_SPARKS = [
  { x: 23, y: 17, size: 9 }, { x: 5, y: 34, size: 6 }, { x: 88, y: 26, size: 9 },
  { x: 55, y: 58, size: 7 }, { x: 81, y: 73, size: 7 }, { x: 94, y: 88, size: 6 },
];

const SPARKLE = "M12 0C12 7.6 16.4 12 24 12C16.4 12 12 16.4 12 24C12 16.4 7.6 12 0 12C7.6 12 12 7.6 12 0Z";
const INK = "var(--app-arcad)";
const INK_BRIGHT = "var(--app-arcad-strong)";
const FIELD_INK = "color-mix(in oklab, var(--app-arcad-strong) 55%, var(--app-text))";

export default function StudySky({
  sky,
  streak,
  loading,
  subjectColours,
}: {
  sky: SkyTotals;
  /** The plan streak, the one streak the app counts everywhere. */
  streak: StreakSummary;
  loading: boolean;
  subjectColours: Map<string, string>;
}) {
  const lit = loading ? 0 : Math.min(STARS.length, sky.sessions);
  const complete = !loading && sky.sessions >= STARS.length;
  const milestones = useMemo(() => buildMilestones(sky, streak), [sky, streak]);

  return (
    <div className="mx-auto w-full max-w-[1140px] px-6 pb-1 pt-8 sm:px-10">
      <section className="overflow-hidden rounded-xl" style={{ background: "var(--app-surface)", boxShadow: "var(--elev-1)" }}>
        <div className="grid lg:grid-cols-[minmax(0,1.55fr)_minmax(360px,0.85fr)]">
          <SkyPanel sky={sky} lit={lit} loading={loading} complete={complete} next={nextSkyGoal(sky, streak)} />

          <aside className="border-t px-5 py-6 sm:px-8 sm:py-8 lg:border-l lg:border-t-0" style={{ borderColor: "var(--app-border)" }}>
            <h3 className="text-[15px] font-semibold tracking-[-0.01em]" style={{ color: "var(--app-text)" }}>Sky progress</h3>
            <div className="mt-4 grid grid-cols-3 gap-2">
              <SkyStat icon={<BarsIcon />} label="Sessions" value={loading ? "–" : String(sky.sessions)} />
              <SkyStat icon={<ClockIcon />} label="Focused" value={loading ? "–" : formatMinutes(sky.minutes)} />
              <SkyStat icon={<FlameIcon />} label="Streak" value={loading ? "–" : `${streak.current}d`} hint={`best ${streak.longest}d`} />
            </div>
            {!loading && streak.current === 0 && streak.lastPlannedDay?.missReason ? (
              <p className="mt-2 text-[12px]" style={{ color: "var(--app-text-muted)" }}>Streak reset, {streak.lastPlannedDay.missReason}.</p>
            ) : null}

            <div className="mt-6 border-t pt-6" style={{ borderColor: "var(--app-border)" }}>
              <Milestones milestones={milestones} loading={loading} />
            </div>

            {sky.subjects.length > 0 ? (
              <div className="mt-6 border-t pt-5" style={{ borderColor: "var(--app-border)" }}>
                <p className="text-[12.5px] font-medium" style={{ color: "var(--app-text-muted)" }}>Subject clusters</p>
                <ul className="mt-2.5 flex flex-wrap gap-1.5">
                  {sky.subjects.map((subject, index) => (
                    <li key={subject.subject} className="max-w-full">
                      <SubjectTag
                        size="sm"
                        subject={{
                          name: `${subject.subject} · ${formatMinutes(subject.minutes)}`,
                          colour: subjectColours.get(subject.subject) ?? SUBJECT_COLORS[index % SUBJECT_COLORS.length],
                        }}
                      />
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </aside>
        </div>
      </section>
    </div>
  );
}

/* ---- The sky ------------------------------------------------------------ */

function SkyPanel({
  sky,
  lit,
  loading,
  complete,
  next,
}: {
  sky: SkyTotals;
  lit: number;
  loading: boolean;
  complete: boolean;
  next: string;
}) {
  const panelRef = useRef<HTMLDivElement>(null);

  // Drift the background layers a few pixels with the pointer. Written
  // straight to CSS variables so moving the mouse never re-renders React.
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const panel = panelRef.current;
    if (!panel || event.pointerType !== "mouse") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const rect = panel.getBoundingClientRect();
    panel.style.setProperty("--sky-x", (((event.clientX - rect.left) / rect.width) * 2 - 1).toFixed(3));
    panel.style.setProperty("--sky-y", (((event.clientY - rect.top) / rect.height) * 2 - 1).toFixed(3));
  };
  const onPointerLeave = () => {
    panelRef.current?.style.setProperty("--sky-x", "0");
    panelRef.current?.style.setProperty("--sky-y", "0");
  };

  return (
    <div
      ref={panelRef}
      onPointerMove={onPointerMove}
      onPointerLeave={onPointerLeave}
      className="relative isolate min-w-0 overflow-hidden px-5 pb-6 pt-6 sm:px-8 sm:pb-8 sm:pt-8"
      style={{
        background: [
          "radial-gradient(55% 60% at 18% 75%, color-mix(in oklab, var(--app-arcad) 20%, transparent), transparent 72%)",
          "radial-gradient(45% 55% at 82% 30%, color-mix(in oklab, var(--app-arcad) 16%, transparent), transparent 72%)",
          "radial-gradient(32% 38% at 52% 14%, color-mix(in oklab, var(--app-arcad) 16%, transparent), transparent 70%)",
          "linear-gradient(180deg, color-mix(in oklab, var(--app-arcad) 13%, var(--app-surface)), color-mix(in oklab, var(--app-arcad) 9%, var(--app-surface)))",
        ].join(", "),
      }}
    >
      <SkyBackdrop />

      <div className="relative flex flex-wrap items-center justify-between gap-3">
        <p className="flex items-center gap-2 text-[15px] font-medium" style={{ color: "var(--app-text)" }}>
          <ArcadiaMark size={14} animate="twinkle" className="text-[var(--app-arcad)]" />
          Your study sky
        </p>
        <p
          className="rounded-full px-3 py-1 text-[12.5px] font-medium tabular-nums"
          style={{
            color: "var(--app-text-soft)",
            background: "color-mix(in oklab, var(--app-surface) 55%, transparent)",
            boxShadow: "inset 0 0 0 1px var(--app-border-strong)",
          }}
        >
          {loading ? "Reading your sky" : (
            <><span key={lit} className="app-pop inline-block font-semibold" style={{ color: INK_BRIGHT }}>{lit}/{STARS.length}</span> stars lit</>
          )}
        </p>
      </div>

      <Constellation lit={lit} loading={loading} />

      <div className="relative mt-2 flex flex-wrap items-end justify-between gap-5">
        <div className="min-w-0">
          <h2 className="text-[24px] font-semibold leading-[1.15] tracking-[-0.03em] sm:text-[30px]" style={{ color: "var(--app-text)" }}>
            {loading
              ? "Reading your sky…"
              : sky.sessions === 0
                ? "Your first star is waiting."
                : complete
                  ? "Your constellation is alive."
                  : "Your sky is growing."}
          </h2>
          <p className="mt-2 max-w-[520px] text-[14px] leading-[1.55]" style={{ color: "var(--app-text-muted)" }}>
            {loading
              ? " "
              : sky.sessions === 0
                ? "Finish a focus session to light the first star. Every session adds another point to your sky."
                : complete
                  ? `${sky.sessions} focus sessions power this constellation. Keep studying to build your next one.`
                  : `${sky.sessions} focus session${sky.sessions === 1 ? "" : "s"} ${sky.sessions === 1 ? "has" : "have"} lit ${lit} star${lit === 1 ? "" : "s"}. ${next}`}
          </p>
          {!loading && sky.sessions === 0 ? (
            <Link href="/app/focus" className={appButtonClass("primary", "md", "mt-5 h-10 gap-2 px-4 text-[14px]")}>
              Light your first star
              <ArrowIcon />
            </Link>
          ) : null}
        </div>
        {!loading && sky.sessions > 0 && !complete ? (
          <Link href="/app/focus" className={appButtonClass("secondary", "md", "h-9 gap-2 px-3.5")}>
            Light star {lit + 1}
            <ArrowIcon />
          </Link>
        ) : null}
      </div>
    </div>
  );
}

function SkyBackdrop() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10">
      {/* Nebula dust: noise tinted Arcad violet, faded out towards the edges. */}
      <svg
        className="absolute -inset-4 h-[calc(100%+2rem)] w-[calc(100%+2rem)] opacity-40 transition-transform duration-700 ease-out"
        style={{ transform: "translate3d(calc(var(--sky-x, 0) * -4px), calc(var(--sky-y, 0) * -4px), 0)" }}
        preserveAspectRatio="none"
        viewBox="0 0 100 100"
      >
        <defs>
          <filter id="sky-dust" x="0" y="0" width="100%" height="100%">
            <feTurbulence type="fractalNoise" baseFrequency="0.05" numOctaves="4" seed="7" />
            <feColorMatrix values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1.6 -0.72" />
            <feComposite in="SourceGraphic" operator="in" />
          </filter>
          <radialGradient id="sky-dust-fade" cx="0.45" cy="0.55" r="0.62">
            <stop offset="0" stopColor="white" />
            <stop offset="1" stopColor="white" stopOpacity="0" />
          </radialGradient>
          <mask id="sky-dust-mask">
            <rect width="100" height="100" fill="url(#sky-dust-fade)" />
          </mask>
        </defs>
        <rect width="100" height="100" style={{ fill: INK }} filter="url(#sky-dust)" mask="url(#sky-dust-mask)" />
      </svg>

      <div
        className="absolute inset-0 transition-transform duration-500 ease-out"
        style={{ transform: "translate3d(calc(var(--sky-x, 0) * -10px), calc(var(--sky-y, 0) * -8px), 0)" }}
      >
        {FIELD.map((star, index) => (
          <span
            key={index}
            className={star.twinkle ? "sky-twinkle absolute rounded-full" : "absolute rounded-full"}
            style={{
              left: `${star.x}%`,
              top: `${star.y}%`,
              width: star.size,
              height: star.size,
              background: FIELD_INK,
              opacity: star.opacity,
              "--o": star.opacity,
              "--d": `${star.delay}ms`,
              "--t": `${star.duration}s`,
            } as CSSProperties}
          />
        ))}
        {FIELD_SPARKS.map((spark) => (
          <svg
            key={`${spark.x}-${spark.y}`}
            className="sky-twinkle absolute -translate-x-1/2 -translate-y-1/2"
            style={{ left: `${spark.x}%`, top: `${spark.y}%`, width: spark.size, height: spark.size, "--o": 0.7, "--t": "5s", "--d": `${spark.x * 40}ms` } as CSSProperties}
            viewBox="0 0 24 24"
          >
            <path d={SPARKLE} fill={FIELD_INK} />
          </svg>
        ))}
      </div>
    </div>
  );
}

function Constellation({ lit, loading }: { lit: number; loading: boolean }) {
  const nextIndex = lit < STARS.length ? lit : -1;
  const [hovered, setHovered] = useState<number | null>(null);
  const [pinned, setPinned] = useState<number | null>(null);
  const [cursor, setCursor] = useState<number | null>(null);
  const buttons = useRef<Array<HTMLButtonElement | null>>([]);
  // The one star in the tab order: wherever the student last was, else the
  // star their next session lights.
  const tabStop = cursor ?? (nextIndex === -1 ? STARS.length - 1 : nextIndex);
  const shown = hovered ?? pinned;

  const move = (to: number) => {
    const index = (to + STARS.length) % STARS.length;
    setCursor(index);
    buttons.current[index]?.focus();
  };
  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const moves: Record<string, number> = {
      ArrowRight: index + 1, ArrowDown: index + 1, ArrowLeft: index - 1, ArrowUp: index - 1, Home: 0, End: STARS.length - 1,
    };
    if (event.key in moves) {
      event.preventDefault();
      move(moves[event.key]);
    } else if (event.key === "Escape") {
      setPinned(null);
      setHovered(null);
    }
  };

  return (
    <div
      role="group"
      aria-label={`Study sky: ${lit} of ${STARS.length} stars lit. Use the arrow keys to move between stars.`}
      className="relative mt-3 aspect-[1000/620] w-full sm:aspect-[1000/420]"
      onPointerDown={(event) => { if (event.target === event.currentTarget) setPinned(null); }}
    >
      <svg aria-hidden="true" className="absolute inset-0 h-full w-full overflow-visible" viewBox="0 0 1000 400" preserveAspectRatio="none" fill="none">
        {EDGES.map(([a, b]) => {
          const on = b < lit;
          const touched = shown === a || shown === b;
          return (
            <line
              key={`${a}-${b}`}
              x1={STARS[a].x} y1={STARS[a].y} x2={STARS[b].x} y2={STARS[b].y}
              stroke={INK}
              strokeWidth={on ? 1.4 : 1}
              strokeLinecap="round"
              strokeDasharray={on ? undefined : "2 5"}
              vectorEffect="non-scaling-stroke"
              opacity={on ? (touched ? 0.95 : 0.6) : touched ? 0.55 : 0.28}
              style={{ transition: "opacity 300ms ease-out" }}
            />
          );
        })}
      </svg>

      {STARS.map((star, index) => (
        <SkyStar
          key={index}
          ref={(node) => { buttons.current[index] = node; }}
          index={index}
          state={loading ? "locked" : index < lit ? "lit" : index === nextIndex ? "next" : "locked"}
          active={shown === index}
          tabIndex={index === tabStop ? 0 : -1}
          label={starLabel(index, lit, loading)}
          onEnter={() => setHovered(index)}
          onLeave={() => setHovered((current) => (current === index ? null : current))}
          onFocus={() => { setCursor(index); setHovered(index); }}
          onBlur={() => setHovered(null)}
          onClick={() => setPinned((current) => (current === index ? null : index))}
          onKeyDown={(event) => onKeyDown(event, index)}
        />
      ))}

      {shown !== null ? <StarTooltip index={shown} lit={lit} loading={loading} /> : null}
    </div>
  );
}

function SkyStar({
  ref,
  index,
  state,
  active,
  tabIndex,
  label,
  onEnter,
  onLeave,
  onFocus,
  onBlur,
  onClick,
  onKeyDown,
}: {
  ref: (node: HTMLButtonElement | null) => void;
  index: number;
  state: "lit" | "next" | "locked";
  active: boolean;
  tabIndex: number;
  label: string;
  onEnter: () => void;
  onLeave: () => void;
  onFocus: () => void;
  onBlur: () => void;
  onClick: () => void;
  onKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => void;
}) {
  const star = STARS[index];
  const keystone = Boolean(star.keystone);
  const size = state === "lit" ? (keystone ? 30 : 18) : state === "next" ? 14 : keystone ? 13 : 9;
  const glow = keystone ? 88 : 48;

  return (
    <button
      ref={ref}
      type="button"
      tabIndex={tabIndex}
      aria-label={label}
      aria-pressed={active}
      onPointerEnter={onEnter}
      onPointerLeave={onLeave}
      onFocus={onFocus}
      onBlur={onBlur}
      onClick={onClick}
      onKeyDown={onKeyDown}
      className="group absolute flex size-10 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-arcad)]"
      style={{ left: `${star.x / 10}%`, top: `${star.y / 4}%` }}
    >
      {state === "lit" ? (
        <span
          aria-hidden="true"
          className="sky-ignite pointer-events-none absolute rounded-full"
          style={{
            width: glow,
            height: glow,
            background: `radial-gradient(circle, color-mix(in oklab, ${INK} ${keystone ? 42 : 36}%, transparent) 0%, transparent 68%)`,
            "--d": `${index * 70}ms`,
          } as CSSProperties}
        />
      ) : null}
      {state === "lit" && keystone ? (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute size-[74px] rounded-full"
          style={{ boxShadow: `inset 0 0 0 1px color-mix(in oklab, ${INK} 22%, transparent)` }}
        />
      ) : null}
      {state === "next" ? (
        <>
          <span aria-hidden="true" className="sky-pulse pointer-events-none absolute size-8 rounded-full" style={{ boxShadow: `inset 0 0 0 1.5px ${INK}` }} />
          <span aria-hidden="true" className="pointer-events-none absolute size-7 rounded-full" style={{ boxShadow: `inset 0 0 0 1px color-mix(in oklab, ${INK} 45%, transparent)` }} />
        </>
      ) : null}
      <span
        aria-hidden="true"
        className={"relative flex " + (state === "lit" ? "sky-ignite" : "")}
        style={{ "--d": `${index * 70}ms` } as CSSProperties}
      >
        <svg
          viewBox="0 0 24 24"
          className={"transition-transform duration-200 ease-out group-hover:scale-125 " + (active ? "scale-125" : "")}
          style={{
            width: size,
            height: size,
            filter: state === "lit" ? `drop-shadow(0 0 6px color-mix(in oklab, ${INK} 80%, transparent))` : undefined,
          }}
        >
          <path
            d={SPARKLE}
            fill={state === "lit" ? INK_BRIGHT : INK}
            opacity={state === "lit" ? 1 : state === "next" ? 0.9 : 0.55}
          />
        </svg>
      </span>
    </button>
  );
}

function StarTooltip({ index, lit, loading }: { index: number; lit: number; loading: boolean }) {
  const star = STARS[index];
  const x = star.x / 10;
  const y = star.y / 4;
  const below = y < 30;
  const align = x < 16 ? "0%" : x > 84 ? "-100%" : "-50%";
  const { title, body } = starCopy(index, lit, loading);

  return (
    <div
      role="status"
      className="app-enter pointer-events-none absolute z-10 w-max max-w-[220px]"
      style={{
        left: `${x}%`,
        top: `${y}%`,
        transform: `translate(${align}, ${below ? "26px" : "calc(-100% - 26px)"})`,
        "--d": "0ms",
      } as CSSProperties}
    >
      <div className="rounded-md px-3 py-2" style={{ background: "var(--app-elev)", boxShadow: "var(--elev-2)" }}>
        <p className="flex items-center gap-1.5 text-[12.5px] font-semibold" style={{ color: "var(--app-text)" }}>
          <ArcadiaMark size={9} className={index < lit ? "text-[var(--app-arcad)]" : "text-[var(--app-text-faint)]"} />
          {title}
        </p>
        <p className="mt-0.5 text-[12px] leading-[1.45]" style={{ color: "var(--app-text-muted)" }}>{body}</p>
      </div>
    </div>
  );
}

function starCopy(index: number, lit: number, loading: boolean): { title: string; body: string } {
  const star = STARS[index];
  const title = star.name ? `${star.name} · star ${index + 1}` : `Star ${index + 1}`;
  if (loading) return { title, body: "Reading your sky…" };
  if (index < lit) return { title, body: `Lit by your ${ordinal(index + 1)} focus session.` };
  const away = index + 1 - lit;
  if (away === 1) return { title, body: "Your next focus session lights this one." };
  return { title, body: `${away} more focus sessions away.` };
}

function starLabel(index: number, lit: number, loading: boolean): string {
  const { title, body } = starCopy(index, lit, loading);
  return `${title}. ${body}`;
}

/* ---- Progress ----------------------------------------------------------- */

interface Milestone {
  id: string;
  label: string;
  icon: ReactNode;
  progress: number;
  done: boolean;
  detail: string;
}

function buildMilestones(sky: SkyTotals, streak: StreakSummary): Milestone[] {
  const hours = (m: number) => formatMinutes(Math.max(0, m));
  // One tile walks the streak milestones (3, 7, 30 days) in turn.
  const target = streak.nextMilestone ?? STREAK_MILESTONES[STREAK_MILESTONES.length - 1];
  const streakDone = streak.nextMilestone === null;
  const rule = `A day counts when you do ${Math.round(CONSISTENCY_THRESHOLD * 100)}% of the study you planned.`;
  return [
    {
      id: "first-light",
      label: "First light",
      icon: <StarIcon />,
      progress: Math.min(1, sky.sessions),
      done: sky.sessions >= 1,
      detail: sky.sessions >= 1 ? "Your first star is lit." : "One focus session lights it.",
    },
    {
      id: "streak",
      label: `${target}-day streak`,
      icon: <BoltIcon />,
      progress: streakDone ? 1 : Math.min(1, streak.current / target),
      done: streakDone,
      detail: streakDone
        ? `${streak.current} consistent days in a row.`
        : `${streak.current} of ${target} consistent days. ${target - streak.current} to go. ${rule}`,
    },
    {
      id: "hours",
      label: "10 hours focused",
      icon: <ClockIcon />,
      progress: Math.min(1, sky.minutes / 600),
      done: sky.minutes >= 600,
      detail: sky.minutes >= 600 ? `${hours(sky.minutes)} focused so far.` : `${hours(sky.minutes)} of 10 hr. ${hours(600 - sky.minutes)} to go.`,
    },
    {
      id: "sessions",
      label: "50 sessions",
      icon: <BarsIcon />,
      progress: Math.min(1, sky.sessions / 50),
      done: sky.sessions >= 50,
      detail: sky.sessions >= 50 ? `${sky.sessions} sessions and counting.` : `${sky.sessions} of 50 sessions. ${50 - sky.sessions} to go.`,
    },
  ];
}

function Milestones({ milestones, loading }: { milestones: Milestone[]; loading: boolean }) {
  const [picked, setPicked] = useState<string | null>(null);
  // Until the student picks one, show the milestone they're closest to next.
  const fallback = milestones.find((item) => !item.done) ?? milestones[milestones.length - 1];
  const selected = milestones.find((item) => item.id === picked) ?? fallback;
  const unlocked = milestones.filter((item) => item.done).length;

  return (
    <>
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-[15px] font-semibold tracking-[-0.01em]" style={{ color: "var(--app-text)" }}>Milestones</h3>
        <p className="text-[13px] tabular-nums" style={{ color: "var(--app-text-muted)" }}>{loading ? "–" : unlocked}/4 unlocked</p>
      </div>
      <ul className="mt-3 grid grid-cols-2 gap-2">
        {milestones.map((milestone) => {
          const isSelected = milestone.id === selected.id;
          const done = !loading && milestone.done;
          return (
            <li key={milestone.id}>
              <button
                type="button"
                aria-pressed={isSelected}
                onClick={() => setPicked(milestone.id)}
                className="flex min-h-14 w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-[13px] font-medium leading-[1.3] transition-[background-color,box-shadow,color] duration-150 ease-out hover:bg-[color-mix(in_oklab,var(--app-arcad)_8%,var(--app-surface-soft))]"
                style={{
                  background: done ? "var(--app-arcad-soft)" : "var(--app-surface-soft)",
                  color: done ? "var(--app-arcad-strong)" : "var(--app-text-soft)",
                  boxShadow: isSelected
                    ? `inset 0 0 0 1px color-mix(in oklab, ${INK} 55%, transparent)`
                    : done
                      ? `inset 0 0 0 1px color-mix(in oklab, ${INK} 25%, transparent)`
                      : "var(--elev-inset)",
                }}
              >
                <ProgressRing progress={loading ? 0 : milestone.progress} done={done} />
                <span className="shrink-0" style={{ color: INK }}>{milestone.icon}</span>
                <span className="min-w-0">{milestone.label}</span>
              </button>
            </li>
          );
        })}
      </ul>

      <div key={selected.id} className="app-enter mt-3 rounded-lg px-3.5 py-3" style={{ background: "var(--app-surface-soft)", boxShadow: "var(--elev-inset)" }}>
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-[12.5px] font-semibold" style={{ color: "var(--app-text)" }}>{selected.label}</p>
          <p className="text-[12px] font-medium tabular-nums" style={{ color: selected.done ? INK_BRIGHT : "var(--app-text-muted)" }}>
            {loading ? "–" : selected.done ? "Unlocked" : `${Math.floor(selected.progress * 100)}%`}
          </p>
        </div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full" style={{ background: "var(--app-border)" }}>
          <div
            className="h-full rounded-full transition-[width] duration-700 ease-out"
            style={{ width: `${loading ? 0 : Math.max(selected.progress * 100, selected.progress > 0 ? 3 : 0)}%`, background: INK }}
          />
        </div>
        <p className="mt-2 text-[12px] leading-[1.45]" style={{ color: "var(--app-text-muted)" }}>{loading ? " " : selected.detail}</p>
      </div>
    </>
  );
}

function ProgressRing({ progress, done }: { progress: number; done: boolean }) {
  const r = 7.5;
  const c = 2 * Math.PI * r;
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" className="size-[18px] shrink-0 -rotate-90">
      <circle cx="10" cy="10" r={r} stroke="var(--app-border-strong)" strokeWidth="1.5" fill={done ? INK : "none"} />
      {!done && progress > 0 ? (
        <circle
          cx="10" cy="10" r={r} fill="none" stroke={INK} strokeWidth="1.5" strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - progress)}
          style={{ transition: "stroke-dashoffset 700ms var(--ease-out-expo)" }}
        />
      ) : null}
      {done ? (
        <path d="M6.6 10.2l2.2 2.2 4.6-4.8" fill="none" stroke="var(--app-arcad-on)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" transform="rotate(90 10 10)" />
      ) : null}
    </svg>
  );
}

function SkyStat({ icon, label, value, hint }: { icon: ReactNode; label: string; value: string; hint?: string }) {
  return (
    <div className="min-w-0 rounded-lg px-2 py-3 sm:px-2.5" style={{ background: "var(--app-surface-soft)", boxShadow: "var(--elev-inset)" }}>
      <p className="flex min-w-0 items-center gap-1 text-[11.5px] font-medium sm:gap-1.5 sm:text-[12px] [&_svg]:size-3.5 sm:[&_svg]:size-4" style={{ color: "var(--app-text-muted)" }}>
        <span className="shrink-0" style={{ color: INK }}>{icon}</span>
        <span className="truncate">{label}</span>
      </p>
      <p className="mt-2 truncate text-[18px] font-semibold leading-none tabular-nums tracking-[-0.02em]" style={{ color: "var(--app-text)" }}>{value}</p>
      {hint ? <p className="mt-1.5 truncate text-[11px] font-medium tabular-nums" style={{ color: "var(--app-text-faint)" }}>{hint}</p> : null}
    </div>
  );
}

function nextSkyGoal(sky: SkyTotals, streak: StreakSummary): string {
  if (sky.sessions < 5) return `${5 - sky.sessions} more session${5 - sky.sessions === 1 ? "" : "s"} unlocks your first orbit.`;
  if (streak.nextMilestone && streak.daysToNext) return `${streak.daysToNext} more consistent day${streak.daysToNext === 1 ? "" : "s"} to a ${streak.nextMilestone}-day streak.`;
  if (sky.minutes < 600) return `${formatMinutes(600 - sky.minutes)} until your 10-hour star.`;
  if (sky.sessions < 50) return `${50 - sky.sessions} more sessions unlock your 50-session star.`;
  return "Your next constellation is taking shape.";
}

function ordinal(n: number): string {
  const tail = n % 100;
  if (tail >= 11 && tail <= 13) return `${n}th`;
  return `${n}${n % 10 === 1 ? "st" : n % 10 === 2 ? "nd" : n % 10 === 3 ? "rd" : "th"}`;
}

export function formatMinutes(m: number): string {
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r === 0 ? `${h} hr` : `${h}h ${r}m`;
}

/* ---- Icons (16px, stroked in currentColor) ------------------------------ */

function Icon({ children }: { children: ReactNode }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      {children}
    </svg>
  );
}
function BarsIcon() {
  return <Icon><path d="M3 13.5V9M6.3 13.5V4M9.7 13.5V7M13 13.5V2.5" /></Icon>;
}
function ClockIcon() {
  return <Icon><circle cx="8" cy="8" r="6" /><path d="M8 4.8V8l2.2 1.4" /></Icon>;
}
function FlameIcon() {
  return <Icon><path d="M8 14.2c2.7 0 4.5-1.8 4.5-4.4 0-2.9-2.3-4.5-3.3-7.6C7.4 3.6 6.8 5.3 7 7 5.9 6.6 5.3 5.6 5.2 4.8 4 6 3.5 7.6 3.5 9.8c0 2.6 1.8 4.4 4.5 4.4Z" /><path d="M8 14.2c-1.2 0-2-.8-2-2 0-1.4 1-2 1.4-3.1.9.7 2.6 1.6 2.6 3.1 0 1.2-.8 2-2 2Z" /></Icon>;
}
function StarIcon() {
  return <Icon><path d="m8 1.8 1.9 3.9 4.3.6-3.1 3 .7 4.3L8 11.6l-3.8 2 .7-4.3-3.1-3 4.3-.6L8 1.8Z" /></Icon>;
}
function BoltIcon() {
  return <Icon><path d="M9 1.5 3.5 9H8l-1 5.5L12.5 7H8l1-5.5Z" /></Icon>;
}
function ArrowIcon() {
  return <Icon><path d="M3 8h10M9 4l4 4-4 4" /></Icon>;
}
