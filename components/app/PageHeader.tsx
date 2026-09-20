import type { CSSProperties, ReactNode } from "react";

interface PageHeaderProps {
  eyebrow: string;
  /** String for a plain title, or a ReactNode when one word is set in the serif italic accent. */
  title: ReactNode;
  meta?: string;
  action?: ReactNode;
}

/**
 * Staggered on-mount reveal — eyebrow at 0 ms, title at 60 ms, meta at 140 ms,
 * action at 180 ms — using the same hero-fade-up utility the landing page
 * uses on Hero. `--d` is the per-element delay; the utility applies the
 * animation with reduced-motion swap built in.
 */
const reveal = (delayMs: number): CSSProperties =>
  ({ "--d": `${delayMs}ms` } as CSSProperties);

export default function PageHeader({ eyebrow, title, meta, action }: PageHeaderProps) {
  return (
    <header
      className="flex flex-wrap items-end justify-between gap-4 border-b px-6 py-6 sm:px-10 sm:py-8"
      style={{ borderColor: "var(--app-border)" }}
    >
      <div className="min-w-0">
        <p
          className="type-eyebrow hero-fade-up"
          style={{ color: "var(--app-text-muted)", ...reveal(0) }}
        >
          {eyebrow}
        </p>
        <h1
          className="hero-fade-up mt-2 text-[28px] font-medium tracking-[-0.02em] sm:text-[34px]"
          style={{ color: "var(--app-text)", ...reveal(60) }}
        >
          {title}
        </h1>
        {meta ? (
          <p
            className="type-mono-label hero-fade-up mt-1.5"
            style={{ color: "var(--app-text-muted)", ...reveal(140) }}
          >
            {meta}
          </p>
        ) : null}
      </div>
      {action ? (
        <div className="hero-fade-up flex-shrink-0" style={reveal(180)}>
          {action}
        </div>
      ) : null}
    </header>
  );
}
