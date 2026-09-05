"use client";

import { useEffect, useRef, useState } from "react";

import { DRIFT_RATE, PARALLAX_PX, generateStars } from "@/lib/stars";
import { cn } from "@/lib/cn";
import { usePrefersReducedMotion } from "@/lib/hooks";

interface StarfieldProps {
  className?: string;
  /** Desktop star count. */
  count?: number;
  /** Mobile star count. */
  mobileCount?: number;
  seed?: number;
  /** Enable pointer parallax on fine-pointer devices. */
  parallax?: boolean;
  /** Bias the field toward the centre. */
  concentrate?: boolean;
  /** Global opacity multiplier (0–1). */
  intensity?: number;
}

const TAU = Math.PI * 2;
const FRAME_INTERVAL = 1000 / 30; // stars are almost static; 30fps is plenty
const MAX_DPR = 1.5;

/**
 * Canvas star field with three depth layers, very slow brightness cycles,
 * slow drift and optional pointer parallax. Pauses when off-screen or hidden.
 */
export default function Starfield({
  className,
  count = 420,
  mobileCount = 150,
  seed = 7,
  parallax = false,
  concentrate = false,
  intensity = 1,
}: StarfieldProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const reduced = usePrefersReducedMotion();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const isMobile = window.matchMedia("(max-width: 639px)").matches;
    const stars = generateStars({
      count: isMobile ? mobileCount : count,
      seed,
      concentrate,
    });
    const usePointer =
      parallax && !reduced && window.matchMedia("(pointer: fine)").matches;

    let width = 0;
    let height = 0;
    let raf = 0;
    let lastFrame = 0;
    let inView = true;
    let pageVisible = document.visibilityState === "visible";
    const pointer = { x: 0, y: 0, tx: 0, ty: 0 };
    const startedAt = performance.now();

    const draw = (now: number) => {
      const t = reduced ? 0 : (now - startedAt) / 1000;
      ctx.clearRect(0, 0, width, height);

      if (usePointer) {
        pointer.x += (pointer.tx - pointer.x) * 0.045;
        pointer.y += (pointer.ty - pointer.y) * 0.045;
      }

      for (const s of stars) {
        const cycle = reduced ? 1 : 0.82 + 0.18 * Math.sin(s.phase + t * s.speed);
        const a = s.alpha * cycle * intensity;
        if (a <= 0.005) continue;

        let ny = s.y - t * DRIFT_RATE[s.depth] * s.drift;
        ny = ny - Math.floor(ny);

        const px = s.x * width + pointer.x * PARALLAX_PX[s.depth];
        const py = ny * height + pointer.y * PARALLAX_PX[s.depth];

        const rgb = s.purple ? "198,184,255" : "255,255,255";

        if (s.blur) {
          const rr = s.r * 3.2;
          const g = ctx.createRadialGradient(px, py, 0, px, py, rr);
          g.addColorStop(0, `rgba(${rgb},${a})`);
          g.addColorStop(0.4, `rgba(${rgb},${a * 0.45})`);
          g.addColorStop(1, `rgba(${rgb},0)`);
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.arc(px, py, rr, 0, TAU);
          ctx.fill();
        } else {
          ctx.fillStyle = `rgba(${rgb},${a})`;
          ctx.beginPath();
          ctx.arc(px, py, s.r, 0, TAU);
          ctx.fill();
        }
      }
    };

    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      if (now - lastFrame < FRAME_INTERVAL) return;
      lastFrame = now;
      draw(now);
    };

    const shouldRun = () => !reduced && inView && pageVisible;

    const start = () => {
      if (raf) return;
      raf = requestAnimationFrame(loop);
    };
    const stop = () => {
      if (!raf) return;
      cancelAnimationFrame(raf);
      raf = 0;
    };
    const sync = () => (shouldRun() ? start() : stop());

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      width = Math.max(1, Math.round(rect.width));
      height = Math.max(1, Math.round(rect.height));
      const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      draw(performance.now());
    };

    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    resize();
    setReady(true);

    const io = new IntersectionObserver(
      (entries) => {
        inView = entries.some((e) => e.isIntersecting);
        sync();
      },
      { rootMargin: "80px 0px" },
    );
    io.observe(canvas);

    const onVisibility = () => {
      pageVisible = document.visibilityState === "visible";
      sync();
    };
    document.addEventListener("visibilitychange", onVisibility);

    const onPointer = (e: PointerEvent) => {
      pointer.tx = (e.clientX / window.innerWidth - 0.5) * 2;
      pointer.ty = (e.clientY / window.innerHeight - 0.5) * 2;
    };
    if (usePointer) window.addEventListener("pointermove", onPointer, { passive: true });

    sync();

    return () => {
      stop();
      ro.disconnect();
      io.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      if (usePointer) window.removeEventListener("pointermove", onPointer);
    };
  }, [count, mobileCount, seed, parallax, concentrate, intensity, reduced]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className={cn(
        "block h-full w-full transition-opacity duration-[1400ms] ease-out",
        ready ? "opacity-100" : "opacity-0",
        className,
      )}
    />
  );
}
