import { marqueeRows, type LifeEvent, type LifeKind } from "@/lib/real-life";
import { cn } from "@/lib/cn";

const kindDot: Record<LifeKind, string> = {
  sport: "bg-white/70",
  school: "bg-accent-300 shadow-[0_0_8px_rgba(157,135,255,0.6)]",
  family: "bg-[#ffc28a]",
  life: "bg-white/30",
};

const kindLabel: Record<LifeKind, string> = {
  sport: "Sport",
  school: "School",
  family: "Family",
  life: "Life",
};

/**
 * Two rows of drifting interruptions. Each row is rendered twice so the
 * translateX(-50%) keyframe loops seamlessly. Pauses on hover; static under
 * reduced motion (the utilities drop the animation).
 */
export default function RealLifeMarquee({ className }: { className?: string }) {
  return (
    <div
      aria-label="Things that change a student's week"
      className={cn(
        "group flex flex-col gap-3 [mask-image:linear-gradient(to_right,transparent,black_12%,black_88%,transparent)]",
        className,
      )}
    >
      {marqueeRows.map((row, i) => (
        <Row key={i} items={row} reverse={i % 2 === 1} />
      ))}
      <ul className="mt-6 flex flex-wrap gap-x-6 gap-y-2 px-[12%]" aria-label="Legend">
        {(Object.keys(kindLabel) as LifeKind[]).map((k) => (
          <li key={k} className="type-mono-label flex items-center gap-2 text-white/45">
            <span aria-hidden="true" className={cn("size-1.5 rounded-full", kindDot[k])} />
            {kindLabel[k]}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Row({ items, reverse }: { items: LifeEvent[]; reverse: boolean }) {
  const doubled = [...items, ...items];
  return (
    <div className="overflow-hidden">
      <ul
        className={cn(
          "flex w-max gap-3 group-hover:[animation-play-state:paused]",
          reverse ? "marquee-right" : "marquee-left",
        )}
        style={{ "--marquee-duration": reverse ? "74s" : "62s" } as React.CSSProperties}
      >
        {doubled.map((e, i) => (
          <li
            key={`${e.label}-${i}`}
            aria-hidden={i >= items.length || undefined}
            className="flex shrink-0 items-center gap-2.5 rounded-full border border-white/[0.09] bg-white/[0.03] px-4 py-2.5 font-mono text-[13px] text-white/80 backdrop-blur-sm"
          >
            <span aria-hidden="true" className={cn("size-1.5 shrink-0 rounded-full", kindDot[e.kind])} />
            {e.label}
          </li>
        ))}
      </ul>
    </div>
  );
}
