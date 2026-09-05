"use client";

import { motion, type HTMLMotionProps } from "framer-motion";
import { DUR, EASE_OUT, VIEWPORT_ONCE } from "@/lib/animation";
import { usePrefersReducedMotion } from "@/lib/hooks";

interface FadeInProps extends Omit<HTMLMotionProps<"div">, "children"> {
  children: React.ReactNode;
  delay?: number;
  duration?: number;
  /** Vertical offset in px before the element settles. */
  y?: number;
  /** Amount of the element that must be visible before revealing. */
  amount?: number;
  immediate?: boolean;
}

export default function FadeIn({
  children,
  delay = 0,
  duration = DUR.entrance,
  y = 20,
  amount = VIEWPORT_ONCE.amount,
  immediate = false,
  ...rest
}: FadeInProps) {
  const reduced = usePrefersReducedMotion();
  const hidden = reduced ? { opacity: 0 } : { opacity: 0, y };
  const visible = reduced ? { opacity: 1 } : { opacity: 1, y: 0 };

  return (
    <motion.div
      initial={hidden}
      {...(immediate
        ? { animate: visible }
        : { whileInView: visible, viewport: { once: true, amount } })}
      transition={{ duration, delay, ease: EASE_OUT }}
      {...rest}
    >
      {children}
    </motion.div>
  );
}
