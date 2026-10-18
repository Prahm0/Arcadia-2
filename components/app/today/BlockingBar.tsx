"use client";

import { useEffect, useState } from "react";
import { formatClock } from "@/lib/api/time";
import { readUnlockWait } from "@/lib/app/blockTimes";
import { snoozeBlock, useFocusGuardStatus } from "@/lib/capacitor/focusGuard";

/** How long "Open for 5 minutes" stays on offer once the wait is over. */
const OFFER_MS = 15_000;

/**
 * While apps are blocked (iPhone): when they open again, and "5 more
 * minutes", Opal style: tap it and wait out a countdown (5 seconds unless
 * the student chose longer) before the apps can open. The wait is the point;
 * by the end of it most people don't want them any more.
 */
export default function BlockingBar({ timezone }: { timezone: string }) {
  const [status, setStatus] = useFocusGuardStatus();
  // Seconds left on the wait, 0 once it's done and the offer is open, null when idle.
  const [waiting, setWaiting] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 15_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (waiting === null) return;
    // Counting down, then the offer stays open a little while before it resets.
    const timer = waiting > 0
      ? window.setTimeout(() => setWaiting(waiting - 1), 1_000)
      : window.setTimeout(() => setWaiting(null), OFFER_MS);
    return () => window.clearTimeout(timer);
  }, [waiting]);

  if (!status?.autoBlocking || !status.active || !status.endsAt) return null;
  const snoozed = status.snoozedUntil && status.snoozedUntil > now ? status.snoozedUntil : null;
  if (!status.blocking && !snoozed) return null;
  const until = formatClock(new Date(status.endsAt).toISOString(), timezone);

  async function press() {
    if (waiting === null) return setWaiting(readUnlockWait());
    if (waiting > 0) return;
    setWaiting(null);
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
          disabled={busy || (waiting !== null && waiting > 0)}
          className="shrink-0 text-[13px] font-medium tabular-nums hover:underline disabled:opacity-80"
          style={{ color: waiting === 0 ? "var(--app-text)" : "var(--app-text-muted)" }}
        >
          {waiting === null ? "5 more minutes" : waiting > 0 ? `Wait ${waiting}s…` : "Open for 5 minutes"}
        </button>
      )}
    </div>
  );
}
