"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";
import ArcadiaMark from "@/components/ui/ArcadiaMark";

interface LiveNowProps {
  className?: string;
  /** Show Arcadia's twinkling mark before the time. */
  dot?: boolean;
}

const DAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function format(d: Date) {
  const hours = d.getHours();
  const h = hours % 12 === 0 ? 12 : hours % 12;
  const m = d.getMinutes().toString().padStart(2, "0");
  return `${DAY[d.getDay()]} ${d.getDate()} ${MONTH[d.getMonth()]} · ${h}:${m} ${hours >= 12 ? "pm" : "am"}`;
}

/**
 * The visitor's real local date and time, in mono. Renders a placeholder on
 * the server so hydration never disagrees with the clock.
 */
export default function LiveNow({ className, dot = true }: LiveNowProps) {
  const [now, setNow] = useState<string | null>(null);

  useEffect(() => {
    const tick = () => setNow(format(new Date()));
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, []);

  return (
    <span className={cn("type-eyebrow inline-flex items-center gap-3", className)}>
      {dot && <ArcadiaMark size={10} animate="twinkle" className="text-accent-200" />}
      <time suppressHydrationWarning dateTime={now ? new Date().toISOString() : undefined}>
        {now ?? "— — · —:—"}
      </time>
    </span>
  );
}
