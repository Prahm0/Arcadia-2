"use client";

import type { PluginListenerHandle } from "@capacitor/core";
import { useEffect } from "react";
import { api } from "@/lib/api/client";
import type { PushPreferences } from "@/lib/app/pushCheckins";
import { isNativeIOS } from "./platform";

/**
 * Push check-ins in the iOS app. WKWebView has no Web Push, so the app
 * registers with APNs through @capacitor/push-notifications and hands the
 * device token to /api/push/native, which the check-in cron sends to.
 */

const TOKEN_KEY = "arcadia:native-push:token";

/**
 * Wrapped in an object: awaiting a Capacitor plugin itself calls `.then()` on
 * the native proxy, which throws (see revenuecat.ts).
 */
async function loadPlugin() {
  const { PushNotifications } = await import("@capacitor/push-notifications");
  return { PushNotifications };
}

function storedToken(): string | null {
  try {
    return window.localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

function storeToken(token: string | null) {
  try {
    if (token) window.localStorage.setItem(TOKEN_KEY, token);
    else window.localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* Settings re-registers when the token isn't remembered. */
  }
}

export type NativePermission = "prompt" | "granted" | "denied";

export async function nativePushPermission(): Promise<NativePermission> {
  const { PushNotifications } = await loadPlugin();
  const { receive } = await PushNotifications.checkPermissions();
  return receive === "granted" || receive === "denied" ? receive : "prompt";
}

/** Asks iOS for this phone's APNs token. Needs notification permission first. */
async function deviceToken(): Promise<string> {
  const { PushNotifications } = await loadPlugin();
  const handles: PluginListenerHandle[] = [];
  try {
    return await new Promise<string>((resolve, reject) => {
      const timer = window.setTimeout(
        () => reject(new Error("Your iPhone didn't hand out a notification token. Try again in a moment.")),
        15_000,
      );
      void (async () => {
        // The registration event isn't replayed, so listen before registering.
        handles.push(await PushNotifications.addListener("registration", (token) => {
          window.clearTimeout(timer);
          resolve(token.value.toLowerCase());
        }));
        handles.push(await PushNotifications.addListener("registrationError", (error) => {
          window.clearTimeout(timer);
          reject(new Error(error.error || "Couldn't register this iPhone for notifications."));
        }));
        await PushNotifications.register();
      })().catch((error: unknown) => {
        window.clearTimeout(timer);
        reject(error instanceof Error ? error : new Error("Couldn't register this iPhone for notifications."));
      });
    });
  } finally {
    await Promise.all(handles.map((handle) => handle.remove()));
  }
}

/** From an explicit tap: permission, token, then the account link. */
export async function enableNativePush(): Promise<{ token: string; preferences: PushPreferences }> {
  const { PushNotifications } = await loadPlugin();
  let { receive } = await PushNotifications.checkPermissions();
  if (receive === "denied") {
    throw new Error("Notifications are off for Arcadia. Turn them on in iPhone Settings > Arcadia > Notifications.");
  }
  if (receive !== "granted") ({ receive } = await PushNotifications.requestPermissions());
  if (receive !== "granted") throw new Error("Notification permission wasn't granted.");
  const token = await deviceToken();
  const { preferences } = await api<{ preferences: PushPreferences }>("/api/push/native", {
    method: "POST",
    body: JSON.stringify({ token }),
  });
  storeToken(token);
  return { token, preferences };
}

export async function nativePushStatus(): Promise<{ token: string; preferences: PushPreferences } | null> {
  const token = storedToken();
  if (!token || (await nativePushPermission()) !== "granted") return null;
  const { subscription } = await api<{ subscription: PushPreferences | null }>("/api/push/native/status", {
    method: "POST",
    body: JSON.stringify({ token }),
  });
  return subscription ? { token, preferences: subscription } : null;
}

export async function updateNativePushPreferences(token: string, preferences: PushPreferences): Promise<void> {
  await api("/api/push/native", { method: "PATCH", body: JSON.stringify({ token, ...preferences }) });
}

/** Sign-out: this phone stops getting the account's check-ins. */
export async function unlinkNativePush(): Promise<void> {
  if (!isNativeIOS()) return;
  const token = storedToken();
  if (!token) return;
  storeToken(null);
  await api("/api/push/native", { method: "DELETE", body: JSON.stringify({ token }) });
}

/**
 * In the iOS app shell: a tapped check-in opens what it's about, and a phone
 * that enabled check-ins re-registers each launch, since iOS can hand out a
 * new token (after a restore, for one).
 */
export function useNativePush(userId: string | undefined) {
  useEffect(() => {
    if (!userId || !isNativeIOS()) return;
    let active = true;
    const handles: PluginListenerHandle[] = [];

    void (async () => {
      const { PushNotifications } = await loadPlugin();
      // A tap that launched the app is held until this listener arrives.
      const handle = await PushNotifications.addListener("pushNotificationActionPerformed", (action) => {
        const link: unknown = action.notification.data?.link;
        // A full navigation, as the browser's service worker does, so the
        // page reads ?openEvent= fresh even if it's already open.
        if (typeof link === "string" && link.startsWith("/app")) window.location.assign(link);
      });
      if (!active) {
        await handle.remove();
        return;
      }
      handles.push(handle);

      const previous = storedToken();
      if (!previous || (await nativePushPermission()) !== "granted") return;
      const token = await deviceToken();
      if (!active || token === previous) return;
      // Carry the new token over only if the old one was this account's: a
      // phone signed into another account since shouldn't link itself.
      const { subscription } = await api<{ subscription: PushPreferences | null }>("/api/push/native/status", {
        method: "POST",
        body: JSON.stringify({ token: previous }),
      });
      if (!active || !subscription) return;
      await api("/api/push/native", { method: "POST", body: JSON.stringify({ token }) });
      storeToken(token);
    })().catch((error) => console.warn("[native-push]", error));

    return () => {
      active = false;
      handles.forEach((handle) => void handle.remove());
    };
  }, [userId]);
}
