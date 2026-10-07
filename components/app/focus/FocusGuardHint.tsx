"use client";

import Link from "next/link";
import { is24Hour } from "@/lib/app/timeFormat";
import { describePicked, useFocusGuardStatus } from "@/lib/capacitor/focusGuard";

/**
 * Under the timer in the iOS app: what's blocked while this focus runs, or a
 * way in to set app blocking up. Nothing on the web or where Screen Time
 * isn't available.
 */
export default function FocusGuardHint() {
  const [status] = useFocusGuardStatus();
  if (!status?.blockingSupported) return null;

  if (status.active && status.blocking && status.endsAt) {
    const until = new Date(status.endsAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit", hour12: !is24Hour() });
    return (
      <p className="type-mono-label mt-5" style={{ color: "var(--app-text-muted)" }}>
        {describePicked(status) || "Apps"} blocked until {until}
      </p>
    );
  }

  const picked = status.appCount + status.categoryCount + status.websiteCount > 0;
  if (picked && status.blockingEnabled) return null;
  return (
    <Link
      href="/app/settings#focus-guard"
      className="mt-5 text-[12.5px] underline underline-offset-4 transition-colors hover:text-[var(--app-text)]"
      style={{ color: "var(--app-text-muted)" }}
    >
      Block distracting apps while you focus
    </Link>
  );
}
