import type { ReactNode } from "react";
import BackButton from "./BackButton";
import { HeaderNotices } from "./Notices";

interface PageHeaderProps {
  /** A live fact above the title, like Today's date. Not the section name: the sidebar shows that. */
  eyebrow?: string;
  /** The page's name. Explanations of how it works belong in its tour. */
  title: ReactNode;
  /** Live facts about the page's data, counts, dates, totals. */
  meta?: string;
  action?: ReactNode;
  /** Match the page's content column so the title lines up with it. */
  width?: number | "full";
  /** Show the student's notices under the title. Today only, so they don't follow you into Focus. */
  notices?: boolean;
}

/**
 * The top of every page: where you are, what this is, and the page's actions
 * on the right. Deliberately static, a tool's chrome shouldn't animate in.
 */
export default function PageHeader({ eyebrow, title, meta, action, width = 1160, notices = false }: PageHeaderProps) {
  return (
    <header
      className="mx-auto w-full px-6 pb-2 pt-8 sm:px-10 sm:pt-10"
      style={{ maxWidth: width === "full" ? undefined : width }}
    >
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
      <div className="min-w-0">
        <BackButton />
        {eyebrow ? (
          <p className="text-[12.5px] font-medium" style={{ color: "var(--app-text-muted)" }}>
            {eyebrow}
          </p>
        ) : null}
        <h1
          className="mt-1 text-[30px] font-semibold leading-[1.1] tracking-[-0.03em]"
          style={{ color: "var(--app-text)" }}
        >
          {title}
        </h1>
        {meta ? (
          <p className="mt-1.5 text-[14px] tabular-nums" style={{ color: "var(--app-text-muted)" }}>
            {meta}
          </p>
        ) : null}
      </div>
      {action ? (
        // On mobile the row may shrink (capped at the screen width) so the
        // actions wrap instead of clipping; it shares the title's line when it
        // fits and sits right-aligned below it when not. Inline and
        // non-shrinking from lg up.
        <div className="flex flex-wrap items-center justify-end gap-2 max-lg:ml-auto max-lg:max-w-full lg:w-auto lg:flex-shrink-0">
          {action}
        </div>
      ) : null}
      </div>
      {notices ? <HeaderNotices /> : null}
    </header>
  );
}
