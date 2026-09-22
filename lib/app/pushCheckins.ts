"use client";

import { api } from "@/lib/api/client";

export interface PushPreferences {
  checkinsEnabled: boolean;
  sessionStartEnabled: boolean;
  sessionFollowupEnabled: boolean;
}

interface StoredSubscription {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

export function pushCheckinsSupported(): boolean {
  return typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window;
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
  const endpoint = await getPushEndpoint();
  if (!endpoint) return null;
  const response = await api<{ subscription: PushPreferences | null }>("/api/push/subscription/status", {
    method: "POST",
    body: JSON.stringify({ endpoint }),
  });
  return response.subscription ? { endpoint, preferences: response.subscription } : null;
}

/** Requests permission only from an explicit user action, after the visit prompt is eligible. */
export async function enablePushCheckins(): Promise<string> {
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
  return value.endpoint;
}

export async function updatePushPreferences(endpoint: string, preferences: PushPreferences): Promise<void> {
  await api("/api/push/subscription", {
    method: "PATCH",
    body: JSON.stringify({ endpoint, ...preferences }),
  });
}

export async function disablePushCheckins(): Promise<void> {
  const serviceWorker = await registration();
  const subscription = await serviceWorker.pushManager.getSubscription();
  if (!subscription) return;
  const endpoint = subscription.endpoint;
  await api("/api/push/subscription", { method: "DELETE", body: JSON.stringify({ endpoint }) });
  await subscription.unsubscribe();
}
