"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

interface CompletionBurstProps {
  /** Increment this to trigger a burst. Any monotonic value (Date.now()) works. */
  trigger: number;
  children: ReactNode;
  className?: string;
}

/**
 * Wraps its child in a `relative` layer that plays a ≤400 ms constellation-dot
 * burst + spring-scale on the child every time `trigger` changes to a new
 * non-zero value. Motion is suppressed when the user prefers reduced motion.
 *
 * The burst is 6 tiny 4-point stars matching the landing page's mark, radiating
 * out and fading. The spring is a lightweight scale keyframe: 1 → 1.3 → 1.
 */
export default function CompletionBurst({ trigger, children, className }: CompletionBurstProps) {
  const [active, setActive] = useState(false);
  const previous = useRef(trigger);

  useEffect(() => {
    if (trigger === previous.current) return;
    previous.current = trigger;
    if (!trigger) return;
    setActive(true);
    const timeout = window.setTimeout(() => setActive(false), 420);
    return () => window.clearTimeout(timeout);
  }, [trigger]);

  return (
    <span className={`relative inline-flex ${className ?? ""}`} style={{ display: "inline-flex" }}>
      <span
        className={active ? "arcadia-completion-spring" : undefined}
        style={{ display: "inline-flex" }}
      >
        {children}
      </span>
      {active ? (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 z-10 grid place-items-center"
        >
          {ANGLES.map((angle, index) => (
            <span
              key={index}
              className="arcadia-completion-dot"
              style={{
                // Each dot flies out along its assigned angle. The `--a` custom
                // property is consumed by the shared keyframe.
                ["--a" as string]: `${angle}deg`,
                animationDelay: `${index * 12}ms`,
              }}
            />
          ))}
        </span>
      ) : null}
    </span>
  );
}

const ANGLES = [0, 60, 120, 180, 240, 300];
