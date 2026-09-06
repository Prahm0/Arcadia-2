import { cn } from "@/lib/cn";

interface ArcadiaMarkProps {
  /** Box size in px. The star fills it. */
  size?: number;
  /**
   * `spark` draws the mark in once (for "Arcadia just did something").
   * `twinkle` breathes forever (for live / listening states).
   */
  animate?: "none" | "spark" | "twinkle";
  className?: string;
}

/**
 * Arcadia's mark: a four-point star, the same shape as the nodes in the
 * constellation. Used wherever Arcadia is speaking, thinking or watching.
 * Fills with `currentColor`, so tint it with a text colour.
 */
export default function ArcadiaMark({ size = 10, animate = "none", className }: ArcadiaMarkProps) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "relative inline-flex shrink-0 items-center justify-center",
        animate === "spark" && "animate-mark-spark",
        animate === "twinkle" && "animate-mark-twinkle",
        className,
      )}
      style={{ width: size, height: size }}
    >
      <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor" className="block">
        <path d="M12 0C12 7.6 16.4 12 24 12C16.4 12 12 16.4 12 24C12 16.4 7.6 12 0 12C7.6 12 12 7.6 12 0Z" />
      </svg>
      {animate === "spark" && (
        <span className="animate-mark-flare pointer-events-none absolute inset-0 motion-reduce:hidden">
          <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth={1.2} className="block">
            <path d="M12 2v20M2 12h20" />
          </svg>
        </span>
      )}
    </span>
  );
}
