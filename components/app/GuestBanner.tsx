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
      className="flex min-h-9 items-center gap-3 border-b px-6 py-1.5 text-[13px] sm:px-10"
      style={{
        background: "color-mix(in oklab, var(--app-accent) 7%, var(--app-surface))",
        borderColor: "var(--app-border)",
        color: "var(--app-text-soft)",
      }}
    >
      <span aria-hidden="true" className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: "var(--app-accent)" }} />
      <p className="min-w-0 flex-1 truncate">
        <span className="font-medium" style={{ color: "var(--app-text)" }}>Guest account.</span>{" "}
        Nothing you do here is saved after you close the tab.
      </p>
      <Link
        href="/register"
        className="shrink-0 rounded-md px-2 py-1 text-[12.5px] font-medium ui-hover"
        style={{ color: "var(--app-accent-strong)" }}
      >
        Create account
      </Link>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss guest reminder"
        className="grid h-6 w-6 shrink-0 place-items-center rounded-md ui-hover"
        style={{ color: "var(--app-text-muted)" }}
      >
        <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
          <path d="M4 4l8 8M12 4l-8 8" />
        </svg>
      </button>
    </div>
  );
}
