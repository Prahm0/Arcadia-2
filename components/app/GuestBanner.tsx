"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

const DISMISS_KEY = "arcadia:guest-banner-dismissed";
const REVEAL_MS = 5_000;

/**
 * Nudges guest users to create a real account so their progress persists.
 * Fades in after 5 seconds so it doesn't slap the user on their first paint;
 * dismissal is per-tab (sessionStorage) so it re-appears in a fresh session.
 */
export default function GuestBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      if (sessionStorage.getItem(DISMISS_KEY) === "1") return;
    } catch {
      /* ignore */
    }
    const id = setTimeout(() => setVisible(true), REVEAL_MS);
    return () => clearTimeout(id);
  }, []);

  function dismiss() {
    setVisible(false);
    try {
      sessionStorage.setItem(DISMISS_KEY, "1");
    } catch {
      /* ignore */
    }
  }

  if (!visible) return null;

  return (
    <div
      role="status"
      className="mx-auto mb-4 flex w-full max-w-[720px] items-start gap-3 rounded-clay px-4 py-3 sm:px-5"
      style={{
        background: "var(--app-accent-soft)",
        boxShadow: "var(--clay-shadow), var(--clay-rim)",
      }}
    >
      <div className="min-w-0 flex-1">
        <p className="text-[13.5px] font-medium" style={{ color: "var(--app-accent-strong)" }}>
          You're browsing as a guest.
        </p>
        <p className="mt-0.5 text-[12.5px]" style={{ color: "var(--app-text-muted)" }}>
          Nothing you do here is saved after you close the tab.{" "}
          <Link href="/register" className="underline underline-offset-2">
            Create an account to save your progress
          </Link>
          .
        </p>
      </div>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss guest reminder"
        className="rounded-clay-xs px-2 py-1 text-[12px]"
        style={{ color: "var(--app-text-muted)" }}
      >
        ✕
      </button>
    </div>
  );
}
