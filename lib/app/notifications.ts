"use client";

const ENABLED_KEY = "arcadia:notifications:enabled";
const LEAD_MINUTES_KEY = "arcadia:notifications:leadMinutes";
const DEFAULT_LEAD_MINUTES = 10;

export type NotificationPermissionState = NotificationPermission | "unsupported";

/**
 * Whether the browser exposes the Notification API at all. Safari on iOS < 16.4
 * and older Android WebViews return false here.
 */
export function notificationsSupported(): boolean {
  return typeof window !== "undefined" && typeof window.Notification !== "undefined";
}

export function getPermissionState(): NotificationPermissionState {
  if (!notificationsSupported()) return "unsupported";
  return Notification.permission;
}

/** localStorage "the user wants reminders" flag. Independent of OS permission. */
export function isReminderEnabled(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(ENABLED_KEY) === "1";
  } catch {
    return false;
  }
}

export function setReminderEnabled(value: boolean): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(ENABLED_KEY, value ? "1" : "0");
  } catch {
    /* ignore */
  }
}

export function getLeadMinutes(): number {
  if (typeof window === "undefined") return DEFAULT_LEAD_MINUTES;
  try {
    const raw = window.localStorage.getItem(LEAD_MINUTES_KEY);
    const parsed = Number(raw);
    if (Number.isFinite(parsed) && parsed >= 0 && parsed <= 60) return Math.round(parsed);
  } catch {
    /* ignore */
  }
  return DEFAULT_LEAD_MINUTES;
}

export function setLeadMinutes(value: number): void {
  if (typeof window === "undefined") return;
  const clamped = Math.max(0, Math.min(60, Math.round(value)));
  try {
    window.localStorage.setItem(LEAD_MINUTES_KEY, String(clamped));
  } catch {
    /* ignore */
  }
}

/**
 * Ask the browser for permission if the user hasn't decided yet.
 * Returns the final state. Safe to call on unsupported browsers.
 */
export async function requestPermission(): Promise<NotificationPermissionState> {
  if (!notificationsSupported()) return "unsupported";
  if (Notification.permission !== "default") return Notification.permission;
  try {
    const result = await Notification.requestPermission();
    return result;
  } catch {
    return Notification.permission;
  }
}

interface SessionNotificationInput {
  title: string;
  body: string;
  tag: string;
}

/**
 * Fire a notification. Silent no-op when unsupported or the user hasn't
 * granted permission. The tag dedupes: showing the same notification twice
 * for the same tag replaces the previous instead of stacking.
 */
export function showNotification({ title, body, tag }: SessionNotificationInput): void {
  if (!notificationsSupported()) return;
  if (Notification.permission !== "granted") return;
  try {
    new Notification(title, {
      body,
      tag,
      icon: "/icon.svg",
      badge: "/icon.svg",
    });
  } catch {
    /* Chrome throws on some ephemeral origins; silently ignore. */
  }
}
