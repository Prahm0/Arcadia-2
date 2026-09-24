"use client";

import Image from "next/image";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import ArcadFace, { type ArcadExpression } from "./ArcadFace";

interface ArcadOrbProps {
  /** idle = floats and twinkles; thinking = head-tilt + orbiting spark; alert = little hops. */
  state?: "idle" | "thinking" | "alert";
  /** Rendered pixel size. Actual glyph fills the box. */
  size?: number;
  className?: string;
}

/* Where the three baked-in stars sit on the artwork, as % of the image. */
const GLINTS = [
  { left: "16%", top: "35%", delay: "0s" },
  { left: "86%", top: "50%", delay: "1.4s" },
  { left: "58%", top: "73%", delay: "2.8s" },
];

/* One-shot moves played on the mood layer. Fidgets are the idle ones he
   picks at random; the rest are reactions. */
const FIDGETS = ["spin", "double-hop", "peek", "jelly", "wink"] as const;
// Two boop names so back-to-back taps restart the animation.
type Move = (typeof FIDGETS)[number] | "boop" | "boop-alt" | "cheer" | "startle" | "hello";
const MOVES = new Set<string>(
  [...FIDGETS, "boop", "boop-alt", "cheer", "startle", "hello"].map((m) => `arcad-orb-${m}`),
);

/* What his face does during each move. */
const MOVE_FACE: Record<Move, ArcadExpression> = {
  hello: "wink",
  wink: "wink",
  boop: "happy",
  "boop-alt": "happy",
  cheer: "happy",
  spin: "happy",
  jelly: "happy",
  "double-hop": "excited",
  peek: "idle",
  startle: "surprised",
};

const SLEEP_AFTER_MS = 60_000;
const BURST = 7;

/* Pointer + activity tracking shared by every orb, so a page full of them
   adds one set of window listeners rather than one per orb. */
const activity = { x: -1, y: -1, last: Date.now() };
const subscribers = new Set<() => void>();
let bound = false;
function subscribe(fn: () => void) {
  if (!bound) {
    bound = true;
    let frame = 0;
    const notify = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        subscribers.forEach((s) => s());
      });
    };
    const onMove = (e: PointerEvent) => {
      activity.x = e.clientX;
      activity.y = e.clientY;
      activity.last = Date.now();
      notify();
    };
    const onActive = () => {
      activity.last = Date.now();
      notify();
    };
    const onLeave = (e: PointerEvent) => {
      if (e.relatedTarget) return;
      activity.x = -1;
      notify();
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerdown", onActive, { passive: true });
    window.addEventListener("keydown", onActive);
    window.addEventListener("scroll", onActive, { passive: true, capture: true });
    document.addEventListener("pointerout", onLeave);
  }
  subscribers.add(fn);
  return () => {
    subscribers.delete(fn);
  };
}

/**
 * Arcad's living presence glyph. It uses the same rich constellation-orb
 * artwork as the brand mark, so the character students meet in chat is the
 * same one they recognise on their home screen.
 *
 * Layers, outside in: glow → look (leans toward the pointer) → mood (hop,
 * wiggle, fidgets, reactions) → float (bob / ponder / doze) → artwork, sheen
 * and star glints. Each layer owns one transform so they stack instead of
 * fighting. Keyframes live in globals.css under `.arcad-orb`.
 *
 * The body art has no face; ArcadFace draws it live so it can blink, glance,
 * follow the cursor and change expression with his state and moves.
 *
 * At 30px and up he's "lively": he watches the cursor, fidgets now and then,
 * dozes off when the page goes quiet and startles awake. Any orb reacts to a
 * tap on it (or the button it sits in), and cheers when thinking ends.
 */
export default function ArcadOrb({ state = "idle", size = 40, className }: ArcadOrbProps) {
  const rootRef = useRef<HTMLSpanElement>(null);
  const lookRef = useRef<HTMLSpanElement>(null);
  const [move, setMove] = useState<Move | null>(size >= 40 ? "hello" : null);
  const [burst, setBurst] = useState(0);
  const [asleep, setAsleep] = useState(false);
  const [prevState, setPrevState] = useState(state);
  const lively = size >= 30;

  // Finishing a reply earns a little cheer.
  if (state !== prevState) {
    setPrevState(state);
    if (prevState === "thinking" && state === "idle") {
      setMove("cheer");
      setBurst((b) => b + 1);
    }
  }

  const live = useRef({ state, asleep, move });
  useEffect(() => {
    live.current = { state, asleep, move };
  });

  // Tapping him (or the button he lives in) gets a boop and a spray of stars.
  useEffect(() => {
    const root = rootRef.current;
    if (!root || reducedMotion()) return;
    const host = root.closest<HTMLElement>("button, a") ?? root;
    const onDown = () => {
      setMove((m) => (m === "boop" ? "boop-alt" : "boop"));
      setBurst((b) => b + 1);
    };
    host.addEventListener("pointerdown", onDown);
    return () => host.removeEventListener("pointerdown", onDown);
  }, []);

  // Look toward the pointer, and wake up when anything happens.
  useEffect(() => {
    if (!lively || reducedMotion()) return;
    const canHover = window.matchMedia("(hover: hover)").matches;
    return subscribe(() => {
      if (live.current.asleep && Date.now() - activity.last < 1000) {
        setAsleep(false);
        setMove("startle");
      }
      const root = rootRef.current;
      const look = lookRef.current;
      if (!canHover || !root || !look) return;
      if (activity.x < 0 || live.current.asleep) {
        look.style.transform = "";
        root.style.removeProperty("--lx");
        root.style.removeProperty("--ly");
        return;
      }
      const r = root.getBoundingClientRect();
      const dx = activity.x - (r.left + r.width / 2);
      const dy = activity.y - (r.top + r.height / 2);
      const dist = Math.hypot(dx, dy) || 1;
      // Full lean from ~320px away; he shies off rather than staring when very close.
      const pull = Math.min(dist / 320, 1) * size * 0.07;
      const x = (dx / dist) * pull;
      const y = (dy / dist) * pull;
      look.style.transform = `translate(${x.toFixed(2)}px, ${y.toFixed(2)}px) rotate(${(x * 0.9).toFixed(2)}deg)`;
      // The face turns further than the body and the eyes further still (see .arcad-face).
      const reach = Math.min(dist / 320, 1);
      root.style.setProperty("--lx", ((dx / dist) * reach).toFixed(3));
      root.style.setProperty("--ly", ((dy / dist) * reach).toFixed(3));
    });
  }, [lively, size]);

  // Doze off after a quiet minute.
  useEffect(() => {
    if (!lively || reducedMotion()) return;
    const id = window.setInterval(() => {
      const { state: s, asleep: a } = live.current;
      if (!a && s === "idle" && Date.now() - activity.last > SLEEP_AFTER_MS) {
        setAsleep(true);
        if (lookRef.current) lookRef.current.style.transform = "";
        rootRef.current?.style.removeProperty("--lx");
        rootRef.current?.style.removeProperty("--ly");
      }
    }, 5000);
    return () => window.clearInterval(id);
  }, [lively]);

  // Every so often, an idle fidget.
  useEffect(() => {
    if (!lively || reducedMotion()) return;
    let timer = 0;
    const schedule = () => {
      timer = window.setTimeout(() => {
        const { state: s, asleep: a, move: m } = live.current;
        if (s === "idle" && !a && !m && !document.hidden) {
          setMove(FIDGETS[Math.floor(Math.random() * FIDGETS.length)]);
        }
        schedule();
      }, 7000 + Math.random() * 9000);
    };
    schedule();
    return () => window.clearTimeout(timer);
  }, [lively]);

  // Backstop for when animationend never fires (hidden tab, display:none).
  useEffect(() => {
    if (!move) return;
    const id = window.setTimeout(() => setMove(null), 2500);
    return () => window.clearTimeout(id);
  }, [move]);

  // Let the spray finish, then drop it.
  useEffect(() => {
    if (!burst) return;
    const id = window.setTimeout(() => setBurst(0), 800);
    return () => window.clearTimeout(id);
  }, [burst]);

  const pulseClass =
    state === "thinking" ? "arcadia-orb-pulse-fast" : state === "alert" ? "arcadia-orb-pulse-alert" : "arcadia-orb-pulse";
  const ringOpacity = asleep ? 0.18 : state === "alert" ? 0.55 : 0.32;
  // Glints and Zs read as noise on the tiny chat-bullet sizes.
  const showDetail = size >= 28;
  const spark = Math.max(3, Math.round(size * 0.1));
  const expression: ArcadExpression = move
    ? MOVE_FACE[move]
    : asleep
      ? "sleep"
      : state === "thinking"
        ? "think"
        : state === "alert"
          ? "excited"
          : "idle";

  return (
    <span
      ref={rootRef}
      className={`arcad-orb relative inline-flex shrink-0 items-center justify-center ${className ?? ""}`}
      data-state={state}
      data-asleep={asleep || undefined}
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      {/* Aurora glow that breathes with the pulse class. */}
      <span
        className={pulseClass}
        style={{
          position: "absolute",
          inset: 0,
          borderRadius: "50%",
          background: `radial-gradient(circle at 50% 50%, color-mix(in oklab, var(--app-arcad) 55%, transparent) 0%, transparent 68%)`,
          filter: "blur(1px)",
          opacity: ringOpacity,
        }}
      />
      <span ref={lookRef} className="arcad-orb-look absolute inset-0 z-10">
        <span
          className="arcad-orb-mood absolute inset-0"
          data-move={move ?? undefined}
          onAnimationEnd={(e) => {
            if (e.target === e.currentTarget && MOVES.has(e.animationName)) setMove(null);
          }}
        >
          <span className="arcad-orb-float absolute inset-0">
            <Image
              src="/brand/arcad-orb-body.png"
              alt=""
              width={size}
              height={size}
              sizes={`${size}px`}
              className="arcad-orb-art relative rounded-full object-cover"
              style={{ width: size, height: size }}
              aria-hidden="true"
            />
            <ArcadFace expression={expression} />
            <span className="arcad-orb-sheen" />
            {showDetail
              ? GLINTS.map((g) => (
                  <svg
                    key={g.left}
                    className="arcad-orb-glint"
                    viewBox="0 0 20 20"
                    style={{ left: g.left, top: g.top, animationDelay: g.delay }}
                  >
                    <path d={STAR} fill="#fff" />
                  </svg>
                ))
              : null}
          </span>
        </span>
      </span>
      {state === "thinking" ? (
        <span className="arcad-orb-orbit">
          <span className="arcad-orb-orbit-x">
            <span className="arcad-orb-orbit-y">
              <span className="arcad-orb-spark" style={{ width: spark, height: spark }} />
            </span>
          </span>
        </span>
      ) : null}
      {asleep && showDetail ? (
        <span className="arcad-orb-zzz" style={{ fontSize: Math.max(8, size * 0.24) }}>
          <span>z</span>
          <span>z</span>
          <span>z</span>
        </span>
      ) : null}
      {burst ? (
        <span key={burst} className="arcad-orb-burst">
          {Array.from({ length: BURST }, (_, i) => (
            <svg
              key={i}
              viewBox="0 0 20 20"
              style={
                {
                  width: Math.max(5, size * 0.2),
                  height: Math.max(5, size * 0.2),
                  "--a": `${(360 / BURST) * i + (burst % 2) * 25}deg`,
                  "--r": `${size * (0.62 + (i % 3) * 0.12)}px`,
                  animationDelay: `${(i % 3) * 30}ms`,
                } as CSSProperties
              }
            >
              <path d={STAR} fill={i % 2 ? "#fff3d6" : "var(--app-arcad)"} />
            </svg>
          ))}
        </span>
      ) : null}
    </span>
  );
}

const STAR = "M10 0 C10.8 7 13 9.2 20 10 C13 10.8 10.8 13 10 20 C9.2 13 7 10.8 0 10 C7 9.2 9.2 7 10 0Z";

function reducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
