"use client";

const SOUND_KEY = "arcadia:sound:enabled";

/**
 * Whether the celebratory tick sound should play. Users opt out in Settings.
 * Default is on. Reads directly from localStorage so it stays in sync without
 * a subscription, mutations from the settings toggle are one-off events.
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
 * policy), both are fine to swallow.
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
    // A small ascending C major arpeggio (C5 → G5 → C6). Triangle waves have
    // more character than pure sines but still stay well-mannered, this is
    // a task-completion cue, not a game achievement. Each note overlaps the
    // next slightly to feel like one continuous flourish rather than three
    // separate beeps.
    const now = ctx.currentTime;
    const notes: { freq: number; start: number; duration: number; peak: number }[] = [
      { freq: 523.25, start: 0.00,  duration: 0.16, peak: 0.09 }, // C5
      { freq: 783.99, start: 0.07,  duration: 0.22, peak: 0.09 }, // G5
      { freq: 1046.5, start: 0.14,  duration: 0.28, peak: 0.10 }, // C6
    ];

    for (const n of notes) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "triangle";
      osc.frequency.setValueAtTime(n.freq, now + n.start);
      gain.gain.setValueAtTime(0.0001, now + n.start);
      // Fast attack (~12ms) so it reads as percussive, slow exponential
      // decay so it doesn't clip abruptly and feels warmer.
      gain.gain.exponentialRampToValueAtTime(n.peak, now + n.start + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + n.start + n.duration);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now + n.start);
      osc.stop(now + n.start + n.duration + 0.02);
    }

    // Let the context be garbage-collected once the last note finishes.
    setTimeout(() => { void ctx.close(); }, 700);
  } catch {
    /* audio unlocked check failed, ignore */
  }
}
