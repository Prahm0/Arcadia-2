"use client";

import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api/client";
import { nextLevelUnlock } from "@/shared/progress";
import { useStreak } from "@/lib/app/useStreak";
import CompletionBurst from "./CompletionBurst";
import { flameScale } from "@/lib/app/celebrate";

type Progress = { xp: number; level: number; title: string; levelProgress: { current: number; needed: number }; todayRing: { doneMinutes: number; goalMinutes: number; closed: boolean; restDay?: boolean } };

/**
 * Today's study ring. Levels, XP and the reward explainer live on the
 * Progress page; on Today they were three more things to read before the
 * first block, so `compact` leaves them out.
 */
export default function TodayProgress({ refreshKey = 0, compact = false, localDoneMinutes = 0 }: { refreshKey?: number; compact?: boolean; localDoneMinutes?: number }) {
  const [progress, setProgress] = useState<Progress | null>(null);
  const [levelUp, setLevelUp] = useState<Progress | null>(null);
  const previousLevel = useRef<number | null>(null);
  useEffect(() => {
    void api<Progress>("/api/progress").then((next) => {
      if (previousLevel.current !== null && next.level > previousLevel.current) setLevelUp(next);
      previousLevel.current = next.level;
      setProgress(next);
    }).catch(() => {});
  }, [refreshKey]);
  if (!progress) return null;
  // Ticks fill the ring straight away; the server's count catches up on the next fetch.
  const live = { ...progress.todayRing, doneMinutes: Math.max(progress.todayRing.doneMinutes, localDoneMinutes) };
  if (compact) return <><TodayRings ring={live} />{levelUpToast(levelUp, () => setLevelUp(null))}</>;
  const ring = progress.todayRing; const ratio = ring.restDay || ring.goalMinutes <= 0 ? 0 : Math.min(1, ring.doneMinutes / ring.goalMinutes);
  const ringLabel = ring.restDay ? "Rest day, nothing planned" : ring.closed ? "Today’s ring is closed" : `${ring.doneMinutes} of ${ring.goalMinutes} min today`;
  return <>
    <div className="mx-auto w-full max-w-[1160px] px-6 pt-4 sm:px-10">
    <div className="flex items-center gap-3">
    <div className={`relative grid h-11 w-11 shrink-0 place-items-center rounded-full ${ring.closed ? "app-pop" : ""}`} style={{ background: `conic-gradient(var(--app-arcad) ${ratio * 360}deg, var(--app-border) 0deg)` }}>
      <div className="grid h-8 w-8 place-items-center rounded-full text-[10px] font-semibold tabular-nums" style={{ background: "var(--app-bg)", color: "var(--app-text)" }}>{ring.doneMinutes}m</div>
    </div>
    <div className="min-w-0 flex-1"><p className="text-[12px] font-semibold" style={{ color: "var(--app-text)" }}>{ringLabel}</p><div className="mt-1 h-1.5 overflow-hidden rounded-full" style={{ background: "var(--app-border)" }}><div className="h-full rounded-full" style={{ width: `${ratio * 100}%`, background: "var(--app-arcad)", transition: "width 300ms ease" }} /></div></div>
    {compact ? null : <div className="text-right"><p className="text-[12px] font-semibold" style={{ color: "var(--app-text)" }}>Lv {progress.level} · {progress.title}</p><p className="text-[11px] tabular-nums" style={{ color: "var(--app-text-muted)" }}>{progress.levelProgress.current}/{progress.levelProgress.needed} XP</p><p className="mt-0.5 hidden max-w-40 text-[10px] leading-3 sm:block" style={{ color: "var(--app-text-faint)" }}>{nextLevelUnlock(progress.level)}</p></div>}
    </div>
    </div>
    {levelUpToast(levelUp, () => setLevelUp(null))}
  </>;
}

/** A level earned shows the moment it happens, without getting in the way. */
function levelUpToast(levelUp: Progress | null, onDone: () => void) {
  return levelUp ? (
    <div
      role="status"
      className="arcadia-toast top-36 flex items-center gap-2 rounded-full px-5 py-2.5 text-[15px] font-semibold shadow-lg"
      style={{ background: "var(--app-arcad)", color: "var(--app-arcad-on)", animationDuration: "2200ms" }}
      onAnimationEnd={onDone}
    >
      <span aria-hidden="true">✦</span> Level {levelUp.level} · {levelUp.title}
    </div>
  ) : null;
}

/**
 * Today's two small cards under the next block: the study ring (Apple
 * Fitness style, it fills as you go) and the streak.
 */
function TodayRings({ ring }: { ring: Progress["todayRing"] }) {
  const streak = useStreak();
  const goal = ring.restDay ? 0 : ring.goalMinutes;
  const ratio = goal <= 0 ? 0 : Math.min(1, ring.doneMinutes / goal);
  const closed = goal > 0 && ring.doneMinutes >= goal;
  const r = 23;
  const circumference = 2 * Math.PI * r;
  const dots = Math.max(5, Math.min(7, (streak.nextMilestone ?? 5)));
  return (
    <div className="mb-4 grid grid-cols-2 gap-3">
      <section
        aria-label="Today's study"
        className="flex items-center gap-3 rounded-[24px] p-4"
        style={{ background: "var(--app-surface)", boxShadow: "var(--elev-1)" }}
      >
        <CompletionBurst trigger={closed ? 1 : 0} className="shrink-0">
        <svg role="img" aria-label={`${ring.doneMinutes} of ${goal} minutes studied today`} width="58" height="58" viewBox="0 0 58 58" className={closed ? "app-pop" : undefined}>
          <circle cx="29" cy="29" r={r} fill="none" stroke="var(--app-accent-soft)" strokeWidth="9" />
          <circle
            cx="29"
            cy="29"
            r={r}
            fill="none"
            stroke="var(--app-accent)"
            strokeWidth="9"
            strokeLinecap="round"
            strokeDasharray={`${ratio * circumference} ${circumference}`}
            transform="rotate(-90 29 29)"
            style={{ transition: "stroke-dasharray 380ms cubic-bezier(0.22, 1, 0.36, 1)" }}
          />
        </svg>
        </CompletionBurst>
        <div className="min-w-0">
          <p className="text-[20px] font-semibold leading-tight tracking-[-0.01em]" style={{ color: "var(--app-text)" }}>
            {ring.restDay ? "Rest" : formatShort(ring.doneMinutes)}
          </p>
          <p className="text-[12.5px]" style={{ color: "var(--app-text-muted)" }}>
            {ring.restDay ? "nothing planned" : closed ? "ring closed today ✦" : `of ${formatShort(goal)} today`}
          </p>
        </div>
      </section>
      <section
        aria-label="Streak"
        className="flex flex-col justify-center gap-1.5 rounded-[24px] p-4"
        style={{ background: "var(--app-surface)", boxShadow: "var(--elev-1)" }}
      >
        <p className="flex items-center justify-between gap-2 text-[13px] font-semibold leading-tight" style={{ color: "var(--app-text)" }}>
          <span>Study days</span>
          {streak.current > 0 ? <span className="text-[12px] tabular-nums"><span aria-hidden="true" className="arcadia-flame mr-1" style={{ ["--flame" as string]: flameScale(streak.current) }}>🔥</span>{streak.current}</span> : null}
        </p>
        <div aria-hidden="true" className="flex gap-1.5 text-[15px] leading-none">
          {Array.from({ length: dots }, (_, index) => (
            <span
              key={index}
              style={{ color: index < Math.min(streak.current, dots) ? "var(--app-gold)" : "var(--app-text-faint)" }}
            >✦</span>
          ))}
        </div>
        <p className="text-[12.5px]" style={{ color: "var(--app-text-muted)" }}>
          {streak.current === 0 ? "Your first star is waiting" : "Keep your stars lit"}
        </p>
      </section>
    </div>
  );
}

function formatShort(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours}h ${rest}m` : `${hours}h`;
}
