"use client";

import { useEffect, useState } from "react";
import { useDashboardData } from "@/lib/app/DashboardProvider";
import { BLOCK_DONE_MOMENT_CLOSED_EVENT, claimAutomaticInterruption } from "@/lib/app/firstStudyBlock";
import { enablePushCheckins, pushCheckinsSupported, pushPermission } from "@/lib/app/pushCheckins";
import { isGuestEmail } from "@/lib/auth/guest";
import AppButton from "./AppButton";

const DISMISSED_KEY = "arcadia:push-checkins-dismissed";

/** A user-initiated prompt offered immediately after a student finishes their first block. */
export default function PushCheckInPrompt() {
  const { data } = useDashboardData();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isGuestEmail(data.user.email) || !pushCheckinsSupported()) return;
    let active = true;
    const offerAfterBlock = () => {
      // This only opens our explanation. The operating-system permission is
      // still requested from the student pressing the explicit enable button.
      void pushPermission().then((permission) => {
        if (!active || permission !== "prompt") return;
        try {
          if (window.localStorage.getItem(DISMISSED_KEY) !== "1" && claimAutomaticInterruption()) setOpen(true);
        } catch {
          // If storage is unavailable, Settings remains the place to opt in.
        }
      }).catch(() => {});
    };
    window.addEventListener(BLOCK_DONE_MOMENT_CLOSED_EVENT, offerAfterBlock);
    return () => {
      active = false;
      window.removeEventListener(BLOCK_DONE_MOMENT_CLOSED_EVENT, offerAfterBlock);
    };
  }, [data.user.email]);

  function dismiss() {
    try {
      window.localStorage.setItem(DISMISSED_KEY, "1");
    } catch {
      /* Settings remains available. */
    }
    setOpen(false);
  }

  async function enable() {
    setSaving(true);
    setError(null);
    try {
      await enablePushCheckins();
      dismiss();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't enable check-ins.");
    } finally {
      setSaving(false);
    }
  }

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center p-0 sm:items-center sm:p-6">
      <div aria-hidden="true" className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={dismiss} />
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="push-checkin-title"
        className="relative w-full max-w-[440px] rounded-t-xl p-6 sm:rounded-xl"
        style={{ background: "var(--app-elev)", boxShadow: "var(--elev-3)", color: "var(--app-text)" }}
      >
        <p className="type-eyebrow" style={{ color: "var(--app-accent-strong)" }}>After your first block</p>
        <h2 id="push-checkin-title" className="mt-2 text-[23px] font-medium tracking-[-0.02em]">
          Want Arcad to keep you on track?
        </h2>
        <p className="mt-2 text-[14px] leading-6" style={{ color: "var(--app-text-muted)" }}>
          Get a heads-up before study blocks and bedtime, a nudge if a block starts without you, and a quick follow-up when a session needs logging.
        </p>
        {error ? <p className="mt-3 text-[13px]" style={{ color: "var(--app-danger)" }}>{error}</p> : null}
        <div className="mt-6 flex items-center justify-end gap-2">
          <AppButton type="button" variant="ghost" onClick={dismiss} disabled={saving}>Not now</AppButton>
          <AppButton type="button" variant="primary" onClick={() => void enable()} loading={saving}>Enable check-ins</AppButton>
        </div>
      </section>
    </div>
  );
}
