import { Capacitor } from "@capacitor/core";
import { useSyncExternalStore } from "react";

/** True only when Arcadia is running inside a native Capacitor shell. */
export function isNative(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return Capacitor.getPlatform() !== "web";
  } catch {
    // The regular browser stays fully functional if Capacitor is unavailable.
    return false;
  }
}

/** True only inside Arcadia's iOS Capacitor shell. */
export function isNativeIOS(): boolean {
  if (!isNative()) return false;
  try {
    return Capacitor.getPlatform() === "ios";
  } catch {
    return false;
  }
}

/** True only when Arcadia runs inside the iPad Capacitor shell. */
export function isNativeIPad(): boolean {
  if (!isNativeIOS()) return false;
  return /iPad/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

const subscribeToPlatform = () => () => {};

/**
 * Hydration-safe native-iOS check for client components. The server and first
 * client paint agree on false, then React refreshes from Capacitor after mount.
 */
export function useNativeIOS(): boolean {
  return useSyncExternalStore(subscribeToPlatform, isNativeIOS, () => false);
}

/** Hydration-safe iPad check for native-shell client components. */
export function useNativeIPad(): boolean {
  return useSyncExternalStore(subscribeToPlatform, isNativeIPad, () => false);
}

/** The web install prompt is redundant inside the native shell. */
export function hidePwaBanner(): boolean {
  return isNative();
}
