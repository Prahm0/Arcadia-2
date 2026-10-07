import { registerPlugin } from "@capacitor/core";
import { useEffect, useState } from "react";
import { isNativeIOS } from "./platform";

/**
 * The iOS app's focus guard (ios/App/App/FocusGuardPlugin.swift): blocks the
 * apps a student picked while a focus timer counts down, and nudges them if
 * they leave Arcadia mid-focus. Everything here is a no-op on the web.
 */

export interface FocusGuardStatus {
  /** iOS 16+ in a build signed for Screen Time. */
  blockingSupported: boolean;
  /** Screen Time access granted. */
  authorized: boolean;
  blockingEnabled: boolean;
  nudgesEnabled: boolean;
  appCount: number;
  categoryCount: number;
  websiteCount: number;
  /** A focus session is under way on this phone. */
  active: boolean;
  endsAt?: number;
  /** The picked apps are shielded right now. */
  blocking?: boolean;
  /** pickApps only: the student closed the picker without saving. */
  cancelled?: boolean;
}

interface FocusGuardPlugin {
  status(): Promise<FocusGuardStatus>;
  pickApps(): Promise<FocusGuardStatus>;
  setPreferences(options: { blockingEnabled?: boolean; nudgesEnabled?: boolean }): Promise<FocusGuardStatus>;
  beginFocus(options: { endsAt: number; subject: string }): Promise<FocusGuardStatus>;
  endFocus(): Promise<FocusGuardStatus>;
}

export const FocusGuard = registerPlugin<FocusGuardPlugin>("FocusGuard");

export const FOCUS_GUARD_CHANGED = "arcadia:focus-guard-changed";

export interface FocusHold {
  /** When this focus phase ends, ms since 1970. */
  endsAt: number;
  subject: string;
}

// Two timers can hold focus: the Focus page's and a study room's. The phone
// stays guarded while either runs, until the later of the two ends.
const holds = new Map<string, FocusHold>();
let sent: string | null = null;

function flush() {
  const now = Date.now();
  const live = [...holds.values()].filter((hold) => hold.endsAt > now);
  const current = live.sort((a, b) => b.endsAt - a.endsAt)[0] ?? null;
  const key = current ? `${current.endsAt}|${current.subject}` : null;
  if (key === sent) return;
  const wasHolding = sent !== null;
  sent = key;
  // Nothing held since this page loaded isn't a reason to end a session the
  // phone is still guarding: that timer may not have been restored yet, and
  // the phone lifts an expired guard itself.
  if (!current && !wasHolding) return;
  const call = current ? FocusGuard.beginFocus(current) : FocusGuard.endFocus();
  void call
    .then(() => window.dispatchEvent(new Event(FOCUS_GUARD_CHANGED)))
    .catch((error) => console.warn("[focus-guard]", error));
}

/**
 * A timer (`source`) is in a focus phase until `hold.endsAt`, or has stopped
 * (null). Safe to call on every render; only changes reach the phone.
 */
export function holdFocus(source: "timer" | "room", hold: FocusHold | null): void {
  if (!isNativeIOS()) return;
  if (hold) holds.set(source, hold);
  else holds.delete(source);
  flush();
}

/** "3 apps and 1 category" for what was picked in Apple's picker, or "" for nothing. */
export function describePicked(status: FocusGuardStatus): string {
  const parts = ([
    [status.appCount, "app", "apps"],
    [status.categoryCount, "category", "categories"],
    [status.websiteCount, "website", "websites"],
  ] as const)
    .filter(([count]) => count > 0)
    .map(([count, one, many]) => `${count} ${count === 1 ? one : many}`);
  if (parts.length <= 1) return parts[0] ?? "";
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

/** A timer in this visit is holding the guard (pausing it lets go). */
export function isHoldingFocus(): boolean {
  return sent !== null;
}

export async function focusGuardStatus(): Promise<FocusGuardStatus | null> {
  if (!isNativeIOS()) return null;
  try {
    return await FocusGuard.status();
  } catch {
    // An older build of the app without the plugin.
    return null;
  }
}

/**
 * The phone's focus guard, kept current as timers start and stop and when
 * the app comes back to the front. Null on the web and in older app builds.
 */
export function useFocusGuardStatus() {
  const [status, setStatus] = useState<FocusGuardStatus | null>(null);
  useEffect(() => {
    if (!isNativeIOS()) return;
    let active = true;
    const refresh = () => {
      void focusGuardStatus().then((next) => {
        if (active) setStatus(next);
      });
    };
    refresh();
    window.addEventListener(FOCUS_GUARD_CHANGED, refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      active = false;
      window.removeEventListener(FOCUS_GUARD_CHANGED, refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, []);
  return [status, setStatus] as const;
}

/** Sign-out: unblock now, whatever was running. */
export async function releaseFocusGuard(): Promise<void> {
  if (!isNativeIOS()) return;
  holds.clear();
  sent = null;
  await FocusGuard.endFocus().catch(() => undefined);
}
