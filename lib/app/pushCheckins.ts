"use client";

import { api } from "@/lib/api/client";
import { isNativeIOS } from "@/lib/capacitor/platform";
import {
  enableNativePush,
  nativePushPermission,
  nativePushStatus,
  unlinkNativePush,
  updateNativePushPreferences,
} from "@/lib/capacitor/nativePush";

export interface PushPreferences {
  checkinsEnabled: boolean;
  sessionStartEnabled: boolean;
  lateStartEnabled: boolean;
  sessionFollowupEnabled: boolean;
  streakEnabled: boolean;
}

export const DEFAULT_PUSH_PREFERENCES: PushPreferences = {
  checkinsEnabled: true,
  sessionStartEnabled: true,
  lateStartEnabled: true,
  sessionFollowupEnabled: true,
  streakEnabled: true,
};

interface StoredSubscription {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

/**
 * Browsers with Web Push, and the iOS app, which uses APNs instead (see
 * lib/capacitor/nativePush.ts). In the app, "endpoint" below is the device token.
 */
export function pushCheckinsSupported(): boolean {
  if (isNativeIOS()) return true;
  return typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window;
}

/** Whether asking for permission would still show a prompt. */
export async function pushPermission(): Promise<"prompt" | "granted" | "denied"> {
  if (isNativeIOS()) return nativePushPermission();
  if (!("Notification" in window)) return "denied";
  const permission = Notification.permission;
  return permission === "default" ? "prompt" : permission;
}

function toApplicationServerKey(base64: string): Uint8Array<ArrayBuffer> {
  const padded = `${base64}${"=".repeat((4 - (base64.length % 4)) % 4)}`.replace(/-/g, "+").replace(/_/g, "/");
  const bytes = window.atob(padded);
  const value = new Uint8Array(bytes.length);
  for (let index = 0; index < bytes.length; index += 1) value[index] = bytes.charCodeAt(index);
  return value;
}

async function registration(): Promise<ServiceWorkerRegistration> {
  if (!pushCheckinsSupported()) throw new Error("Push notifications are not supported by this browser.");
  await navigator.serviceWorker.register("/sw.js", { scope: "/" });
  return navigator.serviceWorker.ready;
}

function serialise(subscription: PushSubscription): StoredSubscription {
  const value = subscription.toJSON();
  const endpoint = value.endpoint;
  const p256dh = value.keys?.p256dh;
  const auth = value.keys?.auth;
  if (!endpoint || !p256dh || !auth) throw new Error("Your browser didn't provide a complete push subscription.");
  return { endpoint, keys: { p256dh, auth } };
}

export async function getPushEndpoint(): Promise<string | null> {
  const serviceWorker = await registration();
  const subscription = await serviceWorker.pushManager.getSubscription();
  return subscription?.endpoint ?? null;
}

export async function getPushSubscriptionStatus(): Promise<{ endpoint: string; preferences: PushPreferences } | null> {
  if (isNativeIOS()) {
    const status = await nativePushStatus();
    return status ? { endpoint: status.token, preferences: status.preferences } : null;
  }
  const endpoint = await getPushEndpoint();
  if (!endpoint) return null;
  const response = await api<{ subscription: PushPreferences | null }>("/api/push/subscription/status", {
    method: "POST",
    body: JSON.stringify({ endpoint }),
  });
  return response.subscription ? { endpoint, preferences: response.subscription } : null;
}

/** Requests permission only from an explicit user action, after the visit prompt is eligible. */
export async function enablePushCheckins(): Promise<{ endpoint: string; preferences: PushPreferences }> {
  if (isNativeIOS()) {
    const { token, preferences } = await enableNativePush();
    return { endpoint: token, preferences };
  }
  const serviceWorker = await registration();
  if (Notification.permission === "denied") throw new Error("Notifications are blocked in this browser's site settings.");
  const permission = Notification.permission === "granted" ? "granted" : await Notification.requestPermission();
  if (permission !== "granted") throw new Error("Notification permission wasn't granted.");

  const { publicKey } = await api<{ publicKey: string }>("/api/push/public-key");
  let subscription = await serviceWorker.pushManager.getSubscription();
  if (!subscription) {
    subscription = await serviceWorker.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: toApplicationServerKey(publicKey),
    });
  }
  const value = serialise(subscription);
  await api("/api/push/subscription", { method: "POST", body: JSON.stringify(value) });
  // Subscribing (again) turns every check-in type back on.
  return { endpoint: value.endpoint, preferences: DEFAULT_PUSH_PREFERENCES };
}

export async function updatePushPreferences(endpoint: string, preferences: PushPreferences): Promise<void> {
  if (isNativeIOS()) {
    await updateNativePushPreferences(endpoint, preferences);
    return;
  }
  await api("/api/push/subscription", {
    method: "PATCH",
    body: JSON.stringify({ endpoint, ...preferences }),
  });
}

export async function disablePushCheckins(): Promise<void> {
  if (isNativeIOS()) {
    await unlinkNativePush();
    return;
  }
  const serviceWorker = await registration();
  const subscription = await serviceWorker.pushManager.getSubscription();
  if (!subscription) return;
  const endpoint = subscription.endpoint;
  await api("/api/push/subscription", { method: "DELETE", body: JSON.stringify({ endpoint }) });
  await subscription.unsubscribe();
}
