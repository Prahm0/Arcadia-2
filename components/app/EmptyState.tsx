"use client";

import type { ReactNode } from "react";

interface EmptyStateProps {
  /** Optional icon element — falls back to the constellation glyph. */
  icon?: ReactNode;
  /** Short headline. Wrap one word in <span className="accent-serif"> to match the landing type system. */
  title: ReactNode;
  /** One or two sentence explanation of what this page is for. */
  body: string;
  /** Optional preview mockup — a faded, non-interactive glimpse of what the page will look like once used. */
  example?: ReactNode;
  /** Primary action row (put your CTA button here). */
  action?: ReactNode;
  /** Secondary hint under the action row. */
  hint?: string;
}

/**
 * A friendly first-time story card used on every otherwise-empty page.
 *
 * The visual language matches the landing: warm surface, constellation glyph,
 * serif italic accent inside the title. The optional example mockup is
 * intentionally low-contrast so users read it as "here's what it will look
 * like" rather than a live UI.
 */
export default function EmptyState({ icon, title, body, example, action, hint }: EmptyStateProps) {
  return (
    <div
      className="rounded-[16px] p-8 sm:p-10"
      style={{
        background: "var(--app-surface)",
        border: "1px solid var(--app-border)",
      }}
    >
      <div className="mx-auto flex max-w-[440px] flex-col items-center text-center">
        <span
          aria-hidden="true"
          className="grid size-11 place-items-center rounded-full"
          style={{ background: "var(--app-accent-soft)", color: "var(--app-accent-strong)" }}
        >
          {icon ?? <ConstellationGlyph />}
        </span>
        <h3
          className="mt-4 text-[22px] font-medium leading-[1.2] tracking-[-0.015em]"
          style={{ color: "var(--app-text)" }}
        >
          {title}
        </h3>
        <p className="mt-2.5 text-[14px] leading-[1.55]" style={{ color: "var(--app-text-muted)" }}>
          {body}
        </p>

        {example ? (
          <div
            aria-hidden="true"
            className="mt-6 w-full rounded-[12px] p-4"
            style={{
              background: "var(--app-surface-soft)",
              border: "1px dashed var(--app-border-strong)",
              opacity: 0.85,
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
  // A small constellation of three connected stars — matches the landing hero
  // motif so first-time surfaces feel continuous with the marketing site.
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
          <p className="mt-0.5 text-[11.5px] font-mono" style={{ color: "var(--app-text-muted)" }}>
            {meta}
          </p>
        ) : null}
      </div>
    </div>
  );
}
