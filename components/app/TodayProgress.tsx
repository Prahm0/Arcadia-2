"use client";

import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api/client";
import { nextLevelUnlock } from "@/shared/progress";
import { useStreak } from "@/lib/app/useStreak";
import RewardStory from "./RewardStory";

type Progress = { xp: number; level: number; title: string; levelProgress: { current: number; needed: number }; todayRing: { doneMinutes: number; goalMinutes: number; closed: boolean; restDay?: boolean } };

/**
 * Today's study ring. Levels, XP and the reward explainer live on the
 * Progress page; on Today they were three more things to read before the
 * first block, so `compact` leaves them out.
 */
export default function TodayProgress({ refreshKey = 0, compact = false }: { refreshKey?: number; compact?: boolean }) {
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
  if (compact) return <><TodayRings ring={progress.todayRing} />{levelUpDialog(levelUp, () => setLevelUp(null))}</>;
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
    {compact ? null : <RewardStory className="mt-3" />}
    </div>
    {levelUpDialog(levelUp, () => setLevelUp(null))}
  </>;
}

function levelUpDialog(levelUp: Progress | null, onClose: () => void) {
  return levelUp ? (<div className="fixed inset-0 z-[120] grid place-items-center bg-black/55 p-6" role="dialog" aria-modal="true" aria-label="Level up">
      <div className="app-pop w-full max-w-sm rounded-2xl p-7 text-center shadow-2xl" style={{ background: "var(--app-surface)", color: "var(--app-text)" }}>
        <p className="text-4xl">✦</p><p className="mt-3 text-sm font-semibold" style={{ color: "var(--app-arcad)" }}>Level up</p>
        <h2 className="mt-1 text-3xl font-semibold tracking-tight">Level {levelUp.level}</h2><p className="mt-2 text-sm" style={{ color: "var(--app-text-muted)" }}>{levelUp.title}</p>
        <button type="button" onClick={() => onClose()} className="ui-press mt-6 rounded-lg px-5 py-2.5 text-sm font-semibold" style={{ background: "var(--app-arcad)", color: "white" }}>Keep going</button>
      </div>
    </div>) : null;
}

/**
 * Today's two small cards under the next block: the study ring (Apple
 * Fitness style, it fills as you go) and the streak.
 */
function TodayRings({ ring }: { ring: Progress["todayRing"] }) {
  const streak = useStreak();
  const goal = ring.restDay ? 0 : ring.goalMinutes;
  const ratio = goal <= 0 ? 0 : Math.min(1, ring.doneMinutes / goal);
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
        <svg role="img" aria-label={`${ring.doneMinutes} of ${goal} minutes studied today`} width="58" height="58" viewBox="0 0 58 58" className={ring.closed ? "app-pop shrink-0" : "shrink-0"}>
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
            style={{ transition: "stroke-dasharray 600ms cubic-bezier(0.22, 1, 0.36, 1)" }}
          />
        </svg>
        <div className="min-w-0">
          <p className="text-[20px] font-semibold leading-tight tracking-[-0.01em]" style={{ color: "var(--app-text)" }}>
            {ring.restDay ? "Rest" : formatShort(ring.doneMinutes)}
          </p>
          <p className="text-[12.5px]" style={{ color: "var(--app-text-muted)" }}>
            {ring.restDay ? "nothing planned" : ring.closed ? "ring closed today" : `of ${formatShort(goal)} today`}
          </p>
        </div>
      </section>
      <section
        aria-label="Streak"
        className="flex flex-col justify-center gap-1.5 rounded-[24px] p-4"
        style={{ background: "var(--app-surface)", boxShadow: "var(--elev-1)" }}
      >
        <p className="text-[20px] font-semibold leading-tight tracking-[-0.01em]" style={{ color: "var(--app-text)" }}>
          {streak.current} {streak.current === 1 ? "day" : "days"}
        </p>
        <div aria-hidden="true" className="flex gap-1.5">
          {Array.from({ length: dots }, (_, index) => (
            <span
              key={index}
              className="size-3.5 rounded-full"
              style={{ background: index < Math.min(streak.current, dots) ? "#e9c46a" : "var(--app-surface-soft)" }}
            />
          ))}
        </div>
        <p className="text-[12.5px]" style={{ color: "var(--app-text-muted)" }}>
          {streak.current === 0 ? "Finish today's plan to start one" : "Keep it going today"}
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
