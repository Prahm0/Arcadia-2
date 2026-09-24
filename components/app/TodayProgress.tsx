"use client";

import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api/client";
import { nextLevelUnlock } from "@/shared/progress";

type Progress = { xp: number; level: number; title: string; levelProgress: { current: number; needed: number }; todayRing: { doneMinutes: number; goalMinutes: number; closed: boolean } };

export default function TodayProgress({ refreshKey = 0 }: { refreshKey?: number }) {
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
  const ring = progress.todayRing; const ratio = Math.min(1, ring.doneMinutes / ring.goalMinutes);
  return <>
    <div className="mx-auto flex w-full max-w-[1160px] items-center gap-3 px-6 pt-4 sm:px-10">
    <div className={`relative grid h-11 w-11 shrink-0 place-items-center rounded-full ${ring.closed ? "app-pop" : ""}`} style={{ background: `conic-gradient(var(--app-arcad) ${ratio * 360}deg, var(--app-border) 0deg)` }}>
      <div className="grid h-8 w-8 place-items-center rounded-full text-[10px] font-semibold tabular-nums" style={{ background: "var(--app-bg)", color: "var(--app-text)" }}>{ring.doneMinutes}m</div>
    </div>
    <div className="min-w-0 flex-1"><p className="text-[12px] font-semibold" style={{ color: "var(--app-text)" }}>{ring.closed ? "Today’s ring is closed" : `${ring.doneMinutes} of ${ring.goalMinutes} min today`}</p><div className="mt-1 h-1.5 overflow-hidden rounded-full" style={{ background: "var(--app-border)" }}><div className="h-full rounded-full" style={{ width: `${ratio * 100}%`, background: "var(--app-arcad)", transition: "width 300ms ease" }} /></div></div>
    <div className="text-right"><p className="text-[12px] font-semibold" style={{ color: "var(--app-text)" }}>Lv {progress.level} · {progress.title}</p><p className="text-[11px] tabular-nums" style={{ color: "var(--app-text-muted)" }}>{progress.levelProgress.current}/{progress.levelProgress.needed} XP</p><p className="mt-0.5 hidden max-w-40 text-[10px] leading-3 sm:block" style={{ color: "var(--app-text-faint)" }}>{nextLevelUnlock(progress.level)}</p></div>
    </div>
    {levelUp ? <div className="fixed inset-0 z-[120] grid place-items-center bg-black/55 p-6" role="dialog" aria-modal="true" aria-label="Level up">
      <div className="app-pop w-full max-w-sm rounded-2xl p-7 text-center shadow-2xl" style={{ background: "var(--app-surface)", color: "var(--app-text)" }}>
        <p className="text-4xl">✦</p><p className="mt-3 text-sm font-semibold" style={{ color: "var(--app-arcad)" }}>Level up</p>
        <h2 className="mt-1 text-3xl font-semibold tracking-tight">Level {levelUp.level}</h2><p className="mt-2 text-sm" style={{ color: "var(--app-text-muted)" }}>{levelUp.title}</p>
        <button type="button" onClick={() => setLevelUp(null)} className="ui-press mt-6 rounded-lg px-5 py-2.5 text-sm font-semibold" style={{ background: "var(--app-arcad)", color: "white" }}>Keep going</button>
      </div>
    </div> : null}
  </>;
}
