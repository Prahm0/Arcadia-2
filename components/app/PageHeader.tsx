import type { ReactNode } from "react";

interface PageHeaderProps {
  eyebrow: string;
  /** String for a plain title, or a ReactNode when one word is set in the serif italic accent. */
  title: ReactNode;
  meta?: string;
  action?: ReactNode;
}

export default function PageHeader({ eyebrow, title, meta, action }: PageHeaderProps) {
  return (
    <header
      className="flex flex-wrap items-end justify-between gap-4 border-b px-6 py-6 sm:px-10 sm:py-8"
      style={{ borderColor: "var(--app-border)" }}
    >
      <div className="min-w-0">
        <p className="type-eyebrow" style={{ color: "var(--app-text-muted)" }}>
          {eyebrow}
        </p>
        <h1
          className="mt-2 text-[28px] font-medium tracking-[-0.02em] sm:text-[34px]"
          style={{ color: "var(--app-text)" }}
        >
          {title}
        </h1>
        {meta ? (
          <p
            className="type-mono-label mt-1.5"
            style={{ color: "var(--app-text-muted)" }}
          >
            {meta}
          </p>
        ) : null}
      </div>
      {action ? <div className="flex-shrink-0">{action}</div> : null}
    </header>
  );
}
