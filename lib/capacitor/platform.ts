import { Capacitor } from "@capacitor/core";

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

/** The web install prompt is redundant inside the native shell. */
export function hidePwaBanner(): boolean {
  return isNative();
}
