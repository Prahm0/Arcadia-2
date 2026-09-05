import { cn } from "@/lib/cn";

interface SectionLabelProps {
  children: React.ReactNode;
  /** Optional index, e.g. "01". */
  index?: string;
  tone?: "dark" | "light";
  /** Show the tiny Arcadia intelligence dot before the label. */
  dot?: boolean;
  className?: string;
}

export default function SectionLabel({
  children,
  index,
  tone = "dark",
  dot = false,
  className,
}: SectionLabelProps) {
  return (
    <p
      className={cn(
        "type-eyebrow flex items-center gap-3",
        tone === "dark" ? "text-white/55" : "text-black/50",
        className,
      )}
    >
      {dot && (
        <span
          aria-hidden="true"
          className="inline-block size-1.5 rounded-full bg-accent shadow-[0_0_8px_rgba(124,92,255,0.6)]"
        />
      )}
      {index && <span className="tabular">{index}</span>}
      {index && <span aria-hidden="true">—</span>}
      <span>{children}</span>
    </p>
  );
}
