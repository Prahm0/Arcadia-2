"use client";

import { useEffect, useState } from "react";
import { formatClock } from "@/lib/api/time";
import { snoozeBlock, useFocusGuardStatus } from "@/lib/capacitor/focusGuard";

/** How long the second tap is waited for before "5 more minutes" resets. */
const CONFIRM_MS = 4_000;

/**
 * While a study block has apps blocked (iPhone): when they open again, and
 * "5 more minutes", which takes a deliberate second tap. The block screen
 * offers the same; this is for when Arcadia is already open.
 */
export default function BlockingBar({ timezone }: { timezone: string }) {
  const [status, setStatus] = useFocusGuardStatus();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 15_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!confirming) return;
    const timer = window.setTimeout(() => setConfirming(false), CONFIRM_MS);
    return () => window.clearTimeout(timer);
  }, [confirming]);

  if (!status?.autoBlocking || !status.active || !status.endsAt) return null;
  const snoozed = status.snoozedUntil && status.snoozedUntil > now ? status.snoozedUntil : null;
  if (!status.blocking && !snoozed) return null;
  const until = formatClock(new Date(status.endsAt).toISOString(), timezone);

  async function press() {
    if (!confirming) return setConfirming(true);
    setConfirming(false);
    setBusy(true);
    try {
      const next = await snoozeBlock(5);
      if (next) setStatus(next);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-2 mb-1 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md px-3 py-2.5 sm:mx-3" style={{ background: "var(--app-surface-soft)" }}>
      <p className="min-w-0 flex-1 text-[14px]" style={{ color: "var(--app-text)" }}>
        {snoozed
          ? `Apps open until ${formatClock(new Date(snoozed).toISOString(), timezone)}, then blocked until ${until}`
          : `Apps blocked until ${until}`}
      </p>
      {snoozed ? null : (
        <button
          type="button"
          onClick={() => void press()}
          disabled={busy}
          className="shrink-0 text-[13px] font-medium hover:underline disabled:opacity-60"
          style={{ color: confirming ? "var(--app-text)" : "var(--app-text-muted)" }}
        >
          {confirming ? "Tap again for 5 minutes" : "5 more minutes"}
        </button>
      )}
    </div>
  );
}
