"use client";

import { motion, useInView } from "framer-motion";
import { createElement, useRef } from "react";
import { EASE_OUT, VIEWPORT_ONCE } from "@/lib/animation";
import { cn } from "@/lib/cn";
import { useIsMobile, usePrefersReducedMotion } from "@/lib/hooks";

interface RevealTextProps {
  /** Each entry renders as its own line with a masked rise. */
  lines: string[];
  as?: "h1" | "h2" | "h3" | "p" | "span";
  className?: string;
  delay?: number;
  stagger?: number;
  /** Set when the element should animate immediately instead of on scroll. */
  immediate?: boolean;
  /** Keep the authored line breaks on narrow screens (default merges them). */
  keepLinesOnMobile?: boolean;
  id?: string;
}

/**
 * Line-by-line masked text reveal. The wrapper is observed (the clipped
 * lines themselves never intersect the viewport before they animate).
 * Falls back to a plain opacity fade when the visitor prefers reduced motion.
 */
export default function RevealText({
  lines,
  as = "h2",
  className,
  delay = 0,
  stagger = 0.09,
  immediate = false,
  keepLinesOnMobile = false,
  id,
}: RevealTextProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const reduced = usePrefersReducedMotion();
  const isMobile = useIsMobile();
  const rendered = isMobile && !keepLinesOnMobile ? [lines.join(" ")] : lines;
  const inView = useInView(ref, { once: true, amount: VIEWPORT_ONCE.amount });
  const visible = immediate || inView;

  const hidden = reduced ? { opacity: 0 } : { y: "105%", opacity: 0 };
  const shown = reduced ? { opacity: 1 } : { y: 0, opacity: 1 };

  const children = rendered.map((line, i) => (
    <span key={i} className="block overflow-hidden pb-[0.06em] -mb-[0.06em]">
      <motion.span
        className="block will-change-transform"
        initial={hidden}
        animate={visible ? shown : hidden}
        transition={{
          duration: reduced ? 0.4 : 0.9,
          delay: visible ? delay + i * stagger : 0,
          ease: EASE_OUT,
        }}
      >
        {line}
      </motion.span>
    </span>
  ));

  return createElement(
    as,
    { className: cn(className), id },
    <span ref={ref} className="block">
      {children}
    </span>,
  );
}
