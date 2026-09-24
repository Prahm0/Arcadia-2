"use client";
import { useEffect, useRef } from "react";

/**
 * Drives a card's tilt and reflections from the pointer, eased every frame so
 * the motion glides instead of snapping. Writes CSS variables on the card:
 * --rx/--ry (tilt), --mx/--my (light position), --gx/--gy (-1…1, parallax)
 * and --glare (0…1). With `showcase`, the card drifts slowly on its own when
 * no mouse is over it, so its gloss still moves on touch screens. Pass
 * `enabled: false` to leave the surface still, e.g. with Ambient motion off,
 * and `tilt: false` for large surfaces that should only catch the light.
 */
export function useCardLight<T extends HTMLElement>(showcase = false, enabled = true, tilt = true) {
  const ref = useRef<T>(null);
  useEffect(() => {
    const card = ref.current;
    if (!card || !enabled) return;
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) return;
    const current = { x: .5, y: .5, glare: 0 };
    const target = { x: .5, y: .5, glare: 0 };
    let hovering = false;
    let frame = 0;
    let last = 0;
    const began = performance.now();

    const write = () => {
      if (tilt) {
        const amount = hovering ? 1 : .6;
        card.style.setProperty("--rx", `${((.5 - current.y) * 11 * amount).toFixed(2)}deg`);
        card.style.setProperty("--ry", `${((current.x - .5) * 13 * amount).toFixed(2)}deg`);
      }
      card.style.setProperty("--mx", `${(current.x * 100).toFixed(1)}%`);
      card.style.setProperty("--my", `${(current.y * 100).toFixed(1)}%`);
      card.style.setProperty("--gx", ((current.x - .5) * 2).toFixed(3));
      card.style.setProperty("--gy", ((current.y - .5) * 2).toFixed(3));
      card.style.setProperty("--glare", current.glare.toFixed(3));
    };
    const tick = (now: number) => {
      const dt = last ? Math.min(64, now - last) : 16;
      last = now;
      if (showcase && !hovering) {
        const t = (now - began) / 1000;
        target.x = .5 + Math.sin(t * .55) * .3;
        target.y = .4 + Math.sin(t * .4 + 1.2) * .18;
        target.glare = .55;
      }
      // Time-based easing: the same glide at 60Hz and 120Hz.
      const k = 1 - Math.exp(-dt / 110);
      current.x += (target.x - current.x) * k;
      current.y += (target.y - current.y) * k;
      current.glare += (target.glare - current.glare) * k;
      write();
      const settled = Math.abs(target.x - current.x) + Math.abs(target.y - current.y) + Math.abs(target.glare - current.glare) < .002;
      frame = showcase || !settled ? requestAnimationFrame(tick) : 0;
      if (!frame) last = 0;
    };
    const run = () => { if (!frame) frame = requestAnimationFrame(tick); };
    // A tilting card is measured by its unmoving parent, so the tilt doesn't feed back into the pointer maths.
    const move = (event: PointerEvent) => {
      if (event.pointerType !== "mouse") return;
      const rect = (tilt ? card.parentElement ?? card : card).getBoundingClientRect();
      hovering = true;
      target.x = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
      target.y = Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height));
      target.glare = 1;
      run();
    };
    const leave = () => {
      hovering = false;
      Object.assign(target, { x: .5, y: .5, glare: 0 });
      run();
    };
    card.addEventListener("pointermove", move);
    card.addEventListener("pointerleave", leave);
    if (showcase) run();
    return () => {
      cancelAnimationFrame(frame);
      card.removeEventListener("pointermove", move);
      card.removeEventListener("pointerleave", leave);
    };
  }, [showcase, enabled, tilt]);
  return ref;
}
