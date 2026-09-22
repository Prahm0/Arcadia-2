import type { ReactNode } from "react";
import PageTour from "./tour/PageTour";
import type { TourId } from "./tour/tours";

interface PageHeaderProps {
  /** Section the page belongs to, shown above the title like a breadcrumb. */
  eyebrow?: string;
  /** The page's name. Explanations of how it works belong in its tour. */
  title: ReactNode;
  /** Live facts about the page's data, counts, dates, totals. */
  meta?: string;
  action?: ReactNode;
  /** The page's "How it works" tour: auto-opens on first visit. */
  tour?: TourId;
}

/**
 * The top of every page: where you are, what this is, and the page's actions
 * on the right. Deliberately static, a tool's chrome shouldn't animate in.
 */
export default function PageHeader({ eyebrow, title, meta, action, tour }: PageHeaderProps) {
  return (
    <header
      className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3 border-b px-6 py-5 sm:px-10"
      style={{ borderColor: "var(--app-border)", background: "var(--app-surface)" }}
    >
      <div className="min-w-0">
        {eyebrow ? (
          <p className="text-[12.5px] font-medium" style={{ color: "var(--app-text-muted)" }}>
            {eyebrow}
          </p>
        ) : null}
        <h1
          className="mt-1 text-[22px] font-semibold leading-tight tracking-[-0.015em]"
          style={{ color: "var(--app-text)" }}
        >
          {title}
        </h1>
        {meta ? (
          <p className="mt-1 text-[13px] tabular-nums" style={{ color: "var(--app-text-muted)" }}>
            {meta}
          </p>
        ) : null}
      </div>
      {action || tour ? (
        <div className="flex flex-shrink-0 flex-wrap items-center gap-2">
          {tour ? <PageTour id={tour} /> : null}
          {action}
        </div>
      ) : null}
    </header>
  );
}
