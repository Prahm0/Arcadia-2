"use client";

import { useEffect, useRef } from "react";
import { updateProfile } from "@/lib/api/profile";

/**
 * What sign-up writes before we know where the student is. Nothing lets a
 * student pick a zone, so a profile still on this value was never chosen.
 */
export const DEFAULT_TIMEZONE = "Australia/Brisbane";

/** The device's IANA zone, e.g. "America/New_York", or null if unknown. */
export function deviceTimezone(): string | null {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || null;
  } catch {
    return null;
  }
}

/**
 * Accounts made before onboarding sent the device zone were all left on
 * Brisbane. Once per load, move a profile still on that default to the
 * device's zone, then reload so the replanned week shows.
 */
export function useDeviceTimezoneSync(saved: string | undefined, enabled: boolean, reload: () => unknown) {
  const tried = useRef(false);
  useEffect(() => {
    if (!enabled || tried.current || saved !== DEFAULT_TIMEZONE) return;
    const device = deviceTimezone();
    if (!device || device === DEFAULT_TIMEZONE) return;
    tried.current = true;
    updateProfile({ timezone: device })
      .then(() => reload())
      .catch(() => {});
  }, [enabled, saved, reload]);
}
