"use client";

import { motion, type HTMLMotionProps } from "framer-motion";
import { forwardRef } from "react";
import {
  CHANGE_LABELS,
  formatDuration,
  formatRange,
  formatTime,
  type Category,
  type ScheduleBlock,
} from "@/lib/schedule";
import { cn } from "@/lib/cn";
import ArcadiaMark from "@/components/ui/ArcadiaMark";

const categoryStyles: Record<Category, string> = {
  school: "bg-ui-surface text-ui-muted border-transparent",
  study: "bg-white text-ui-text border-ui-border",
  sport: "bg-ink-800 text-white border-transparent",
  personal: "bg-paper-200 text-[#5a5a5a] border-transparent",
  sleep: "bg-transparent text-ui-muted border-dashed border-[#d6d6d6]",
  exam: "bg-black text-white border-transparent",
};

interface GridEventProps extends Omit<HTMLMotionProps<"div">, "children"> {
  block: ScheduleBlock;
  /** Compact typography for miniature views. */
  dense?: boolean;
  /** Highlight as recently changed. */
  changed?: boolean;
  /** Classes for the visible inner surface. */
  surfaceClassName?: string;
}

/**
 * A block positioned inside a week grid. The outer element is a pure
 * positioning box (percent `top`/`height`/`left`/`width`, so it can be
 * animated); the inner surface carries the visual styling and insets.
 */
export const GridEvent = forwardRef<HTMLDivElement, GridEventProps>(
  function GridEvent(
    { block, dense = false, changed = false, className, surfaceClassName, ...rest },
    ref,
  ) {
    const minutes = block.end - block.start;
    const showTime = dense ? minutes >= 60 : minutes >= 35;
    const label = block.change ? CHANGE_LABELS[block.change] : null;

    return (
      <motion.div ref={ref} className={cn("absolute", className)} {...rest}>
        <div
          className={cn(
            "absolute inset-y-px overflow-hidden rounded-[6px] border leading-tight",
            dense ? "inset-x-[3px] px-1.5 py-1 text-[10px] sm:text-[11px]" : "inset-x-1 px-2.5 py-1.5 text-[12px] sm:text-[13px]",
            categoryStyles[block.category],
            changed && "ring-1 ring-accent",
            surfaceClassName,
          )}
        >
          <div className="flex items-start justify-between gap-1">
            <span className="truncate font-medium">{block.title}</span>
            {block.category === "exam" && (
              <ArcadiaMark size={8} className="mt-1 text-accent" />
            )}
            {label && (
              <span className={cn("shrink-0 font-medium text-accent", dense ? "text-[9px]" : "text-[11px]")}>
                {label}
              </span>
            )}
          </div>
          {showTime && (
            <div className={cn("tabular opacity-70", dense ? "mt-0.5 hidden text-[10px] sm:block" : "mt-0.5 text-[11px]")}>
              {formatRange(block.start, block.end)}
            </div>
          )}
        </div>
      </motion.div>
    );
  },
);

interface RowEventProps extends Omit<HTMLMotionProps<"li">, "children"> {
  block: ScheduleBlock;
  changed?: boolean;
}

/** A block rendered as a row in a compact day timeline (mobile). */
export const RowEvent = forwardRef<HTMLLIElement, RowEventProps>(
  function RowEvent({ block, changed = false, className, ...rest }, ref) {
    const label = block.change ? CHANGE_LABELS[block.change] : null;
    return (
      <motion.li ref={ref} className={cn("flex items-stretch gap-3", className)} {...rest}>
        <div className="tabular w-[52px] shrink-0 pt-2 text-[12px] leading-none text-ui-muted">
          {formatTime(block.start, false)}
        </div>
        <div
          className={cn(
            "flex min-w-0 flex-1 items-center justify-between gap-2 rounded-[8px] border px-3 py-2 text-[13px]",
            categoryStyles[block.category],
            changed && "ring-1 ring-accent",
          )}
        >
          <div className="min-w-0">
            <div className="truncate font-medium">{block.title}</div>
            <div className="tabular mt-0.5 text-[11px] opacity-70">
              {formatRange(block.start, block.end)} · {formatDuration(block.end - block.start)}
            </div>
          </div>
          {label && <span className="shrink-0 text-[11px] font-medium text-accent">{label}</span>}
        </div>
      </motion.li>
    );
  },
);
