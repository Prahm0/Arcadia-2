import { cn } from "@/lib/cn";

interface SectionLabelProps {
  children?: React.ReactNode;
  /** Optional index, e.g. "01". */
  index?: string;
  /** A moment in the sample week, e.g. "Tue 8 Sep · 7:40 am". */
  time?: string;
  tone?: "dark" | "light";
  /** Show the tiny Arcadia intelligence dot before the label. */
  dot?: boolean;
  className?: string;
}

/**
 * Mono eyebrow above a section. Reads as a timestamp on the sample week
 * when `time` is given, or as a numbered label otherwise.
 */
export default function SectionLabel({
  children,
  index,
  time,
  tone = "dark",
  dot = false,
  className,
}: SectionLabelProps) {
  return (
    <p
      className={cn(
        "type-eyebrow flex flex-wrap items-center gap-x-3 gap-y-1",
        tone === "dark" ? "text-white/55" : "text-day-muted",
        className,
      )}
    >
      {dot && (
        <span
          aria-hidden="true"
          className="inline-block size-1.5 rounded-full bg-accent shadow-[0_0_8px_rgba(124,92,255,0.6)]"
        />
      )}
      {index && <span>{index}</span>}
      {index && (children || time) && <span aria-hidden="true">—</span>}
      {time && (
        <time className={tone === "dark" ? "text-accent-200" : "text-accent"}>{time}</time>
      )}
      {time && children && <span aria-hidden="true" className="opacity-50">/</span>}
      {children && <span>{children}</span>}
    </p>
  );
}
