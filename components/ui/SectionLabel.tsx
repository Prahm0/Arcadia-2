import { cn } from "@/lib/cn";
import ArcadiaMark from "@/components/ui/ArcadiaMark";

interface SectionLabelProps {
  children?: React.ReactNode;
  /** Optional index, e.g. "01". */
  index?: string;
  /** A moment in the sample week, e.g. "Tue 8 Sep · 7:40 am". */
  time?: string;
  tone?: "dark" | "light";
  /** Show Arcadia's mark before the label. */
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
      {dot && <ArcadiaMark size={10} className={tone === "dark" ? "text-accent-200" : "text-accent"} />}
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
