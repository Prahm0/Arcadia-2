"use client";

import { useEffect, useState } from "react";
import { useDashboardData } from "@/lib/app/DashboardProvider";
import { enablePushCheckins, pushCheckinsSupported, pushPermission } from "@/lib/app/pushCheckins";
import { isGuestEmail } from "@/lib/auth/guest";
import AppButton from "./AppButton";

const VISITS_KEY = "arcadia:app-visits";
const DISMISSED_KEY = "arcadia:push-checkins-dismissed";

/** Shows a user-initiated permission prompt from the second app visit onward. */
export default function PushCheckInPrompt() {
  const { data } = useDashboardData();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const paid = data.user.tier === "pro" || data.user.tier === "max";

  useEffect(() => {
    if (!paid || isGuestEmail(data.user.email) || !pushCheckinsSupported()) return;
    let active = true;
    // Asked of iOS in the app, where there's no browser Notification API.
    void pushPermission().then((permission) => {
      if (!active || permission !== "prompt") return;
      try {
        const visits = Number(window.localStorage.getItem(VISITS_KEY) ?? "0") + 1;
        window.localStorage.setItem(VISITS_KEY, String(visits));
        if (visits >= 2 && window.localStorage.getItem(DISMISSED_KEY) !== "1") setOpen(true);
      } catch {
        // If storage is unavailable, keep the permission request in Settings.
      }
    }).catch(() => {});
    return () => {
      active = false;
    };
  }, [data.user.email, paid]);

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
        <p className="type-eyebrow" style={{ color: "var(--app-accent-strong)" }}>Pro check-ins</p>
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
