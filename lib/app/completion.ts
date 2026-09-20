"use client";

const SOUND_KEY = "arcadia:sound:enabled";

/**
 * Whether the celebratory tick sound should play. Users opt out in Settings.
 * Default is on. Reads directly from localStorage so it stays in sync without
 * a subscription — mutations from the settings toggle are one-off events.
 */
export function isSoundEnabled(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const raw = window.localStorage.getItem(SOUND_KEY);
    if (raw === "0") return false;
    return true;
  } catch {
    return true;
  }
}

export function setSoundEnabled(value: boolean): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(SOUND_KEY, value ? "1" : "0");
  } catch {
    /* ignore */
  }
}

/**
 * Very quiet, very short "did a thing" tick. Uses Web Audio directly so we
 * don't need to ship an audio file. Silent when the user has opted out or
 * when the browser hasn't unlocked audio yet (no user gesture, autoplay
 * policy) — both are fine to swallow.
 */
export function playCompletionTick(): void {
  if (typeof window === "undefined") return;
  if (!isSoundEnabled()) return;
  const Ctor: typeof AudioContext | undefined =
    (window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext })
      .AudioContext ??
    (window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!Ctor) return;
  try {
    const ctx = new Ctor();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(660, ctx.currentTime + 0.06);
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.06, ctx.currentTime + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.08);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.09);
    // Let the context be garbage-collected once the tick finishes.
    setTimeout(() => { void ctx.close(); }, 200);
  } catch {
    /* audio unlocked check failed — ignore */
  }
}
