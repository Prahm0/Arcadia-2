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

const subscribeToPlatform = () => () => {};

/**
 * Hydration-safe native-iOS check for client components. The server and first
 * client paint agree on false, then React refreshes from Capacitor after mount.
 */
export function useNativeIOS(): boolean {
  return useSyncExternalStore(subscribeToPlatform, isNativeIOS, () => false);
}

/** The web install prompt is redundant inside the native shell. */
export function hidePwaBanner(): boolean {
  return isNative();
}
