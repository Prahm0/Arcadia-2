"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { StatusBar } from "@capacitor/status-bar";
import { analytics } from "@/lib/analytics/events";
import { isNative } from "@/lib/capacitor/platform";
import { useStudySky } from "@/lib/app/StudySkyProvider";
import { CONSTELLATIONS, constellationById, type ConstellationDefinition } from "@/shared/constellations";
import { starSizes } from "@/components/app/sky/skyArt";

type Scene = "night" | "paper" | "dusk";
const SCENE_KEY = "arcadia:study-with-me:scene";

const SCENES: Record<Scene, { label: string; background: string; text: string; muted: string; panel: string }> = {
  night: { label: "Night", background: "radial-gradient(circle at 50% 30%, #1a1640 0%, #09091c 42%, #04040e 100%)", text: "#f8f7ff", muted: "rgba(235,232,255,.62)", panel: "rgba(255,255,255,.07)" },
  paper: { label: "Paper", background: "linear-gradient(145deg, #f8f6ef, #e9edf4)", text: "#22222b", muted: "rgba(34,34,43,.58)", panel: "rgba(34,34,43,.07)" },
  dusk: { label: "Dusk", background: "radial-gradient(circle at 75% 12%, #d896b5 0%, transparent 31%), linear-gradient(145deg, #291b4b, #ad5e8b 57%, #ef9a83)", text: "#fff9fb", muted: "rgba(255,249,251,.72)", panel: "rgba(255,255,255,.13)" },
};

function readScene(): Scene {
  try {
    const value = window.localStorage.getItem(SCENE_KEY);
    return value === "paper" || value === "dusk" || value === "night" ? value : "night";
  } catch {
    return "night";
  }
}

function clock(seconds: number) {
  const safe = Math.max(0, seconds);
  return `${String(Math.floor(safe / 60)).padStart(2, "0")}:${String(safe % 60).padStart(2, "0")}`;
}

function pickConstellation(subject: string): ConstellationDefinition {
  const seed = [...subject].reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return CONSTELLATIONS[seed % CONSTELLATIONS.length];
}

export default function StudyWithMe({
  open,
  onExit,
  running,
  remaining,
  total,
  subject,
  goal,
  todosDone,
  todosTotal,
  complete,
  onToggle,
}: {
  open: boolean;
  onExit: () => void;
  /** Start, pause or resume the session without leaving the scene. */
  onToggle: () => void;
  running: boolean;
  remaining: number;
  total: number;
  subject: string;
  goal: string;
  todosDone: number;
  todosTotal: number;
  complete: boolean;
}) {
  const [scene, setScene] = useState<Scene>(() => readScene());
  const [controls, setControls] = useState(true);
  const [shareOpen, setShareOpen] = useState(false);
  const hideTimer = useRef<number | null>(null);
  const started = useRef(false);
  const { sky } = useStudySky();
  const definition = useMemo(() => constellationById(sky?.preferences.followed) ?? pickConstellation(subject), [sky?.preferences.followed, subject]);
  const elapsed = Math.max(0, Math.min(total, total - remaining));
  const progress = complete ? 1 : total ? elapsed / total : 0;

  const revealControls = useCallback(() => {
    setControls(true);
    if (hideTimer.current) window.clearTimeout(hideTimer.current);
    hideTimer.current = window.setTimeout(() => setControls(false), 3000);
  }, []);

  useEffect(() => {
    if (!open) {
      started.current = false;
      return;
    }
    if (!started.current) {
      started.current = true;
      analytics.studyWithMeStarted(scene);
    }
    hideTimer.current = window.setTimeout(() => setControls(false), 3000);
    const key = (event: KeyboardEvent) => { if (event.key === "Escape") onExit(); };
    window.addEventListener("keydown", key);
    return () => {
      window.removeEventListener("keydown", key);
      if (hideTimer.current) window.clearTimeout(hideTimer.current);
    };
  }, [open, onExit, revealControls, scene]);

  useEffect(() => {
    if (!open || !running || !("wakeLock" in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    void navigator.wakeLock.request("screen").then((result) => { lock = result; }).catch(() => {});
    return () => { void lock?.release().catch(() => {}); };
  }, [open, running]);

  useEffect(() => {
    if (!open || !isNative()) return;
    void StatusBar.hide().catch(() => {});
    return () => { void StatusBar.show().catch(() => {}); };
  }, [open]);

  function chooseScene(next: Scene) {
    setScene(next);
    try { window.localStorage.setItem(SCENE_KEY, next); } catch { /* storage is optional */ }
  }

  function leave() {
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
    onExit();
  }

  if (!open) return null;
  const palette = SCENES[scene];

  return (
    <div className="fixed inset-0 z-[90] overflow-hidden" style={{ background: palette.background, color: palette.text }} onPointerMove={revealControls} onPointerDown={revealControls}>
      <div className="absolute inset-0 opacity-50" aria-hidden="true" style={{ backgroundImage: "radial-gradient(circle at 20% 20%, rgba(255,255,255,.6) 0 1px, transparent 1.5px), radial-gradient(circle at 70% 35%, rgba(255,255,255,.45) 0 1px, transparent 1.5px)", backgroundSize: "93px 109px, 137px 149px" }} />
      <div className="relative mx-auto flex min-h-svh w-full max-w-[1200px] flex-col justify-between px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-[max(1.5rem,env(safe-area-inset-top))] sm:px-10">
        <header className={`flex items-center justify-between transition-opacity duration-300 ${controls ? "opacity-100" : "opacity-0"}`}>
          <div className="flex rounded-full p-1" style={{ background: palette.panel }}>
            {(Object.keys(SCENES) as Scene[]).map((option) => <button key={option} type="button" onClick={() => chooseScene(option)} className="rounded-full px-3 py-1.5 text-[12px] font-medium" style={{ background: scene === option ? "rgba(255,255,255,.18)" : "transparent", color: palette.text }}>{SCENES[option].label}</button>)}
          </div>
          <button type="button" onClick={leave} aria-label="Exit Study with me" className="grid h-10 w-10 place-items-center rounded-full" style={{ background: palette.panel, color: palette.text }}>
            <svg viewBox="0 0 20 20" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M5 5l10 10M15 5L5 15" strokeLinecap="round" /></svg>
          </button>
        </header>

        <main className="relative flex flex-1 flex-col items-center justify-center py-8 text-center">
          <p className="text-[12px] font-semibold uppercase tracking-[.2em]" style={{ color: palette.muted }}>{subject || "Focus session"}</p>
          <h1 className="mt-3 max-w-2xl text-balance text-[18px] font-medium sm:text-[22px]" style={{ color: palette.text }}>{goal || "One focused block at a time"}</h1>
          <Constellation definition={definition} progress={progress} scene={scene} />
          <div className="mt-4 text-[clamp(76px,18vw,210px)] font-medium leading-none tracking-[-.07em] tabular-nums" style={{ color: palette.text }}>{clock(remaining)}</div>
          {!complete ? (
            <button
              type="button"
              onClick={onToggle}
              aria-label={running ? "Pause" : "Start"}
              className={`mt-6 grid h-14 w-14 place-items-center rounded-full transition-opacity duration-300 ${controls || !running ? "opacity-100" : "opacity-0"}`}
              style={{ background: palette.panel, color: palette.text }}
            >
              {running ? (
                <svg viewBox="0 0 20 20" width="20" height="20" fill="currentColor" aria-hidden="true"><rect x="5" y="4" width="3.5" height="12" rx="1" /><rect x="11.5" y="4" width="3.5" height="12" rx="1" /></svg>
              ) : (
                <svg viewBox="0 0 20 20" width="20" height="20" fill="currentColor" aria-hidden="true"><path d="M6.5 4.2v11.6a.6.6 0 0 0 .9.5l9-5.8a.6.6 0 0 0 0-1L7.4 3.7a.6.6 0 0 0-.9.5Z" /></svg>
              )}
            </button>
          ) : null}
          {todosTotal ? <p className="mt-5 rounded-full px-4 py-2 text-[13px]" style={{ background: palette.panel, color: palette.muted }}>{todosDone} of {todosTotal} session steps</p> : null}
          {complete ? <div className="mt-6"><p className="text-[17px] font-semibold">Session complete · {Math.round(total / 60)} min · {subject}</p><button type="button" onClick={() => setShareOpen(true)} className="mt-3 rounded-full px-5 py-2.5 text-[13px] font-semibold" style={{ background: palette.text, color: scene === "paper" ? "#22222b" : "#11111a" }}>Share</button></div> : null}
        </main>

        <footer className="flex items-center justify-between text-[11px] font-medium tracking-[.08em]" style={{ color: palette.muted }}>
          <span className="flex items-center gap-2 opacity-60"><i aria-hidden="true" className="h-5 w-5 rounded-sm bg-cover" style={{ backgroundImage: "url(/brand/arcadia-mark.png)" }} />arcadiahq.app</span>
          <span className={`${controls ? "opacity-60" : "opacity-0"} transition-opacity`}>{running ? "studying" : "paused"}</span>
        </footer>
      </div>
      {shareOpen ? <StudyShare definition={definition} subject={subject} minutes={Math.round(total / 60)} scene={scene} onClose={() => setShareOpen(false)} /> : null}
    </div>
  );
}

function Constellation({ definition, progress, scene }: { definition: ConstellationDefinition; progress: number; scene: Scene }) {
  const count = progress >= 1 ? definition.points.length : Math.floor(progress * definition.points.length);
  const sizes = starSizes(definition, 1.05);
  const paper = scene === "paper";
  return <svg viewBox="0 0 100 100" className="mt-8 h-[min(38vh,330px)] w-[min(76vw,540px)] overflow-visible" aria-label={`${definition.name} constellation`}>
    <defs><filter id="study-glow"><feGaussianBlur stdDeviation="1.5" result="blur" /><feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge></filter></defs>
    {definition.edges.map(([from, to]) => {
      const [x1, y1] = definition.points[from]; const [x2, y2] = definition.points[to];
      const lit = from < count && to < count;
      return <line key={`${from}-${to}`} x1={x1} y1={y1} x2={x2} y2={y2} stroke={definition.colour} strokeWidth=".7" strokeLinecap="round" style={{ opacity: lit ? .9 : .16, strokeDasharray: lit ? "0" : "1.2 4", transition: "opacity 700ms ease, stroke-dasharray 700ms ease" }} />;
    })}
    {definition.points.map(([x, y], index) => {
      const lit = index < count; const size = sizes[index] / 2.6;
      return <g key={index} style={{ opacity: lit ? 1 : .4, transition: "opacity 700ms ease" }}>
        {lit ? <circle cx={x} cy={y} r={size * 2.6} fill={definition.colour} opacity={paper ? .18 : .3} filter="url(#study-glow)" /> : null}
        <circle cx={x} cy={y} r={size} fill={lit ? "#fff8ea" : "transparent"} stroke={definition.colour} strokeWidth=".55" />
      </g>;
    })}
  </svg>;
}

function StudyShare({ definition, subject, minutes, scene, onClose }: { definition: ConstellationDefinition; subject: string; minutes: number; scene: Scene; onClose: () => void }) {
  const [sharing, setSharing] = useState(false);
  const canvas = useRef<HTMLCanvasElement>(null);
  const palette = SCENES[scene];

  useEffect(() => { if (canvas.current) drawShare(canvas.current, definition, subject, minutes, scene); }, [definition, subject, minutes, scene]);
  async function file() {
    if (!canvas.current) throw new Error("Image is still preparing.");
    const blob = await new Promise<Blob>((resolve, reject) => canvas.current!.toBlob((value) => value ? resolve(value) : reject(new Error("Couldn't make image.")), "image/png"));
    return new File([blob], "my-arcadia-study-session.png", { type: "image/png" });
  }
  async function share() {
    setSharing(true);
    try {
      const image = await file();
      if (!navigator.share || (navigator.canShare && !navigator.canShare({ files: [image] }))) download(image);
      else await navigator.share({ title: "My Arcadia study session", text: "Studying with Arcadia", files: [image] });
      analytics.studyWithMeShared();
    } catch (error) { if (!(error instanceof DOMException && error.name === "AbortError")) console.error(error); }
    finally { setSharing(false); }
  }
  return <div className="absolute inset-0 z-10 flex items-end justify-center bg-black/50 p-4 sm:items-center" onPointerDown={onClose}><section className="w-full max-w-sm rounded-2xl p-4" style={{ background: "var(--app-surface)" }} onPointerDown={(event) => event.stopPropagation()}><div className="flex items-center justify-between"><strong style={{ color: "var(--app-text)" }}>Your session</strong><button onClick={onClose} aria-label="Close">×</button></div><canvas ref={canvas} className="mt-3 aspect-[9/16] w-full rounded-xl" aria-label="Study session share image" /><button type="button" onClick={() => void share()} disabled={sharing} className="mt-3 h-11 w-full rounded-xl font-semibold" style={{ background: palette.text, color: scene === "paper" ? "#22222b" : "#11111a" }}>{sharing ? "Preparing" : "Share image"}</button></section></div>;
}

function drawShare(canvas: HTMLCanvasElement, definition: ConstellationDefinition, subject: string, minutes: number, scene: Scene) {
  const width = 1080, height = 1920, ctx = canvas.getContext("2d"); if (!ctx) return;
  canvas.width = width; canvas.height = height;
  const bg = scene === "paper" ? "#f4f2ec" : scene === "dusk" ? "#51285f" : "#04040e";
  ctx.fillStyle = bg; ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = scene === "paper" ? "#22222b" : "#fff8ea"; ctx.font = "600 42px system-ui"; ctx.fillText("ARCADIA", 80, 110);
  ctx.globalAlpha = .68; ctx.font = "500 28px system-ui"; ctx.fillText("STUDY WITH ME", 80, 158); ctx.globalAlpha = 1;
  ctx.font = "700 78px system-ui"; ctx.fillText(`${minutes} min`, 80, 300); ctx.font = "500 38px system-ui"; ctx.fillText(subject || "Focus session", 80, 358);
  const ox = 120, oy = 520, scale = 8;
  ctx.strokeStyle = definition.colour; ctx.lineWidth = 7; ctx.globalAlpha = .85;
  definition.edges.forEach(([from, to]) => { const a = definition.points[from], b = definition.points[to]; ctx.beginPath(); ctx.moveTo(ox + a[0] * scale, oy + a[1] * scale); ctx.lineTo(ox + b[0] * scale, oy + b[1] * scale); ctx.stroke(); });
  definition.points.forEach(([x, y]) => { ctx.beginPath(); ctx.fillStyle = "#fff8ea"; ctx.arc(ox + x * scale, oy + y * scale, 11, 0, Math.PI * 2); ctx.fill(); });
  ctx.globalAlpha = .62; ctx.font = "500 30px system-ui"; ctx.fillText("arcadiahq.app", 80, 1810); ctx.fillText("Your study plan survives real life.", 80, 1860); ctx.globalAlpha = 1;
}

function download(file: File) { const url = URL.createObjectURL(file); const link = document.createElement("a"); link.href = url; link.download = file.name; link.click(); window.setTimeout(() => URL.revokeObjectURL(url), 1000); }
