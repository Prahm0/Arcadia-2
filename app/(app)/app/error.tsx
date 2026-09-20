"use client";

import { useEffect } from "react";

/**
 * App-level error boundary. Next.js renders this whenever a client component
 * inside /app throws during render or a use-suspense effect. Keeps the shell
 * out (no sidebar) but stays in the app theme, and gives the user a clear
 * Retry that resets the boundary instead of a dead-end blank screen.
 */
export default function AppErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Keep a copy in the console for debugging — Next.js already logs, but the
    // digest makes it easier to correlate with a server log line if we ever
    // pipe them together.
    console.error("Arcadia app error boundary", error);
  }, [error]);

  return (
    <main
      className="grid min-h-svh place-items-center px-6 py-10"
      style={{ background: "var(--app-bg)", color: "var(--app-text)" }}
    >
      <div
        className="mx-auto flex w-full max-w-[420px] flex-col items-center text-center"
      >
        <span
          aria-hidden="true"
          className="grid size-12 place-items-center rounded-full"
          style={{ background: "var(--app-surface-soft)", color: "var(--app-text-muted)" }}
        >
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="9" />
            <path d="M12 8v5M12 16.5v.5" />
          </svg>
        </span>
        <h1
          className="mt-4 text-[22px] font-medium leading-[1.2] tracking-[-0.015em]"
          style={{ color: "var(--app-text)" }}
        >
          Something went <span className="accent-serif">sideways</span>.
        </h1>
        <p className="mt-2.5 text-[14px]" style={{ color: "var(--app-text-muted)" }}>
          Give it a moment and try again. If it happens again, hop into Settings and sign out — that usually clears it.
        </p>
        {error?.digest ? (
          <p className="mt-2 type-mono-label" style={{ color: "var(--app-text-faint)" }}>
            ref {error.digest}
          </p>
        ) : null}
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            onClick={reset}
            className="rounded-full px-4 py-2 text-[13px] font-medium"
            style={{ background: "var(--app-accent)", color: "var(--app-accent-on)" }}
          >
            Try again
          </button>
          <a
            href="/app"
            className="text-[13px] font-medium underline underline-offset-4"
            style={{ color: "var(--app-text-muted)" }}
          >
            Back to Today
          </a>
        </div>
      </div>
    </main>
  );
}
