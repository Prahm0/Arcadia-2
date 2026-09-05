"use client";

import { useEffect, useRef, useState } from "react";

interface LazyMountProps {
  children: React.ReactNode;
  /** Reserved height until the content mounts, to avoid layout shift. */
  minHeight?: number | string;
  /** How far ahead of the viewport to start mounting. */
  rootMargin?: string;
  className?: string;
}

/**
 * Mounts expensive children only when they approach the viewport.
 * Reserves space so the page does not shift when they appear.
 */
export default function LazyMount({
  children,
  minHeight,
  rootMargin = "600px 0px",
  className,
}: LazyMountProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [show, setShow] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || show) return;
    if (typeof IntersectionObserver === "undefined") {
      const id = globalThis.setTimeout(() => setShow(true), 0);
      return () => globalThis.clearTimeout(id);
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setShow(true);
          io.disconnect();
        }
      },
      { rootMargin },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [rootMargin, show]);

  return (
    <div ref={ref} className={className} style={show ? undefined : { minHeight }}>
      {show ? children : null}
    </div>
  );
}
