"use client";

import Link from "next/link";
import type { ReactNode } from "react";

/**
 * The frame every study mode sits in: a way out, what you're studying, how
 * far through you are, and the mode's options.
 */
export default function StudyShell({
  title,
  mode,
  backHref,
  progress,
  progressLabel,
  options,
  saveFailed,
  children,
}: {
  title: string;
  mode: string;
  backHref: string;
  /** 0 to 1. */
  progress: number;
  progressLabel: string;
  options?: ReactNode;
  saveFailed?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="mx-auto flex min-h-[calc(100svh-7rem)] w-full max-w-[760px] flex-col px-4 pb-28 pt-4 sm:px-8 lg:min-h-[calc(100svh-2.5rem)] lg:pb-8">
      <header className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <Link
          href={backHref}
          aria-label="Stop studying"
          className="grid h-8 w-8 shrink-0 place-items-center rounded-md ui-hover"
          style={{ color: "var(--app-text-muted)" }}
        >
          <svg viewBox="0 0 20 20" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
            <path d="M5 5l10 10M15 5L5 15" strokeLinecap="round" />
          </svg>
        </Link>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-3">
            <p className="truncate text-[13.5px] font-medium" style={{ color: "var(--app-text)" }}>
              {title}
              <span className="font-normal" style={{ color: "var(--app-text-muted)" }}>
                {" "}
                · {mode}
              </span>
            </p>
            <p className="shrink-0 text-[12.5px] tabular-nums" style={{ color: "var(--app-text-muted)" }} aria-live="polite">
              {progressLabel}
            </p>
          </div>
          <div
            className="mt-1.5 h-1 overflow-hidden rounded-[1px]"
            style={{ background: "var(--app-surface-soft)" }}
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(progress * 100)}
            aria-label="Progress"
          >
            <div
              className="h-full transition-[width] duration-300 ease-out"
              style={{ width: `${Math.min(100, progress * 100)}%`, background: "var(--app-accent)" }}
            />
          </div>
        </div>
        {options ? <div className="order-last flex w-full shrink-0 items-center justify-end gap-1 sm:order-none sm:w-auto">{options}</div> : null}
      </header>
      {saveFailed ? (
        <p role="status" className="mt-2 text-center text-[12px]" style={{ color: "var(--app-danger)" }}>
          Couldn&apos;t save your answers. Check your connection; they&apos;ll go when it&apos;s back.
        </p>
      ) : null}
      <div className="flex flex-1 flex-col justify-center py-6">{children}</div>
    </div>
  );
}

/** A small on/off control for the study header. */
export function OptionToggle({ on, onChange, children }: { on: boolean; onChange: (on: boolean) => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={() => onChange(!on)}
      className="h-7 rounded-md px-2 text-[12px] font-medium transition-colors"
      style={{
        background: on ? "var(--app-accent-soft)" : "transparent",
        color: on ? "var(--app-accent-strong)" : "var(--app-text-muted)",
        boxShadow: on ? "none" : "inset 0 0 0 1px var(--app-border)",
      }}
    >
      {children}
    </button>
  );
}

/** Text sized to fit a card: big for a term, smaller for a paragraph. */
export function CardText({ text }: { text: string }) {
  const size = text.length > 280 ? 15 : text.length > 120 ? 17 : text.length > 40 ? 20 : 26;
  return (
    <span
      className="block whitespace-pre-wrap break-words text-center leading-snug"
      style={{ fontSize: size, color: "var(--app-text)", fontWeight: size >= 20 ? 500 : 400 }}
    >
      {text}
    </span>
  );
}

/** True when a key press belongs to a field or button rather than the study screen. */
export function ownsKey(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
}
