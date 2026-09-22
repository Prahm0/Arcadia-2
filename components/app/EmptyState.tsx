"use client";

import type { ReactNode } from "react";

interface EmptyStateProps {
  /** Optional icon element, falls back to the constellation glyph. */
  icon?: ReactNode;
  /** Short headline. */
  title: ReactNode;
  /** One or two sentence explanation of what this page is for. */
  body: string;
  /** Optional preview mockup, a faded, non-interactive glimpse of what the page will look like once used. */
  example?: ReactNode;
  /** Primary action row (put your CTA button here). */
  action?: ReactNode;
  /** Secondary hint under the action row. */
  hint?: string;
}

/**
 * The first-time card on every otherwise-empty page: what goes here, an
 * optional faded preview of it filled in, and the action that starts it.
 */
export default function EmptyState({ icon, title, body, example, action, hint }: EmptyStateProps) {
  return (
    <div
      className="rounded-lg px-6 py-10 sm:px-10"
      style={{
        background: "var(--app-surface)", boxShadow: "var(--elev-1)",
      }}
    >
      <div className="mx-auto flex max-w-[440px] flex-col items-center text-center">
        <span
          aria-hidden="true"
          className="grid size-10 place-items-center rounded-md"
          style={{ background: "var(--app-surface-soft)", boxShadow: "var(--elev-inset)", color: "var(--app-text-muted)" }}
        >
          {icon ?? <ConstellationGlyph />}
        </span>
        <h3
          className="mt-4 text-[16px] font-semibold leading-snug tracking-[-0.01em]"
          style={{ color: "var(--app-text)" }}
        >
          {title}
        </h3>
        <p className="mt-1.5 text-[13.5px] leading-[1.55]" style={{ color: "var(--app-text-muted)" }}>
          {body}
        </p>

        {example ? (
          <div
            aria-hidden="true"
            className="mt-6 w-full rounded-md px-4 py-3"
            style={{
              background: "var(--app-surface-soft)",
              boxShadow: "var(--elev-inset)",
              opacity: 0.8,
            }}
          >
            {example}
          </div>
        ) : null}

        {action ? <div className="mt-6 flex flex-wrap items-center justify-center gap-3">{action}</div> : null}
        {hint ? (
          <p className="mt-3 text-[12px]" style={{ color: "var(--app-text-faint)" }}>
            {hint}
          </p>
        ) : null}
      </div>
    </div>
  );
}

function ConstellationGlyph() {
  // Three connected points: the brand mark reduced to an icon.
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.4">
      <path d="M6 15L11 6L18 14L6 15Z" strokeLinejoin="round" strokeLinecap="round" opacity="0.4" />
      <circle cx="6" cy="15" r="1.25" fill="currentColor" stroke="none" />
      <circle cx="11" cy="6" r="1.25" fill="currentColor" stroke="none" />
      <circle cx="18" cy="14" r="1.25" fill="currentColor" stroke="none" />
    </svg>
  );
}

/**
 * A tiny helper for rendering an example row inside an EmptyState example.
 * Named exports keep JSX in the consumer pages minimal.
 */
export function ExampleRow({
  bar,
  title,
  meta,
}: {
  bar?: string;
  title: string;
  meta?: string;
}) {
  return (
    <div className="flex items-center gap-3 py-1.5 text-left">
      <span
        aria-hidden="true"
        className="h-6 w-[3px] shrink-0 rounded-full"
        style={{ background: bar ?? "var(--app-accent)" }}
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-medium" style={{ color: "var(--app-text)" }}>
          {title}
        </p>
        {meta ? (
          <p className="mt-0.5 text-[12px] tabular-nums" style={{ color: "var(--app-text-muted)" }}>
            {meta}
          </p>
        ) : null}
      </div>
    </div>
  );
}
