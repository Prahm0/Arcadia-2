"use client";

/**
 * App-wide commands that don't belong to any one view. The menu bar and the
 * keyboard shortcuts fire these; the component that owns the behaviour
 * listens. Window events keep the menu bar from importing half the app.
 */

export const OPEN_ARCAD_EVENT = "arcadia:open-arcad";

export function openArcad(): void {
  window.dispatchEvent(new CustomEvent(OPEN_ARCAD_EVENT));
}

export const OPEN_TOUR_EVENT = "arcadia:open-tour";

/** Replay the "How it works" tour for the page on screen. */
export function openPageTour(): void {
  window.dispatchEvent(new CustomEvent(OPEN_TOUR_EVENT));
}

export interface GoTarget {
  label: string;
  href: string;
  /** Second key of the "G then …" shortcut. */
  key: string;
}

/** Every page, in menu order, with its G-then-key shortcut. */
export const GO_TARGETS: GoTarget[] = [
  { label: "Today", href: "/app", key: "t" },
  { label: "Schedule", href: "/app/schedule", key: "s" },
  { label: "Deadlines", href: "/app/deadlines", key: "d" },
  { label: "Sessions", href: "/app/sessions", key: "f" },
  { label: "Rooms", href: "/app/sessions/rooms", key: "r" },
  { label: "Cards", href: "/app/cards", key: "c" },
  { label: "Files", href: "/app/files", key: "i" },
  { label: "Sheets", href: "/app/sheets", key: "e" },
  { label: "Analytics", href: "/app/analytics", key: "a" },
  { label: "Streaks", href: "/app/streaks", key: "k" },
  { label: "Weekly review", href: "/app/review", key: "w" },
  { label: "Arcad", href: "/app/arcad", key: "h" },
  { label: "Profile", href: "/app/profile", key: "p" },
  { label: "Settings", href: "/app/settings", key: "," },
];

/** True when a keystroke belongs to a text field rather than to the app. */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  if (tag === "TEXTAREA" || tag === "SELECT") return true;
  if (tag === "INPUT") {
    const type = (target as HTMLInputElement).type;
    return !["checkbox", "radio", "button", "submit", "reset", "range", "color"].includes(type);
  }
  return false;
}
