import { cn } from "@/lib/cn";

interface LogoProps {
  /** Rendered pixel size. The SVG scales, 12 to 512 all look sharp. */
  size?: number;
  className?: string;
}

/**
 * The Arcadia mark: a bold triangular "A" silhouette with an inset counter
 * and a small floating triangle marker inside. Rendered as one compound path
 * with `fill-rule="evenodd"` so the counter reads as background and the inner
 * marker reads as filled, three crossings brings us back to fill.
 *
 * Fills with `currentColor`, so callers tint it via CSS.
 */
export default function Logo({ size = 20, className }: LogoProps) {
  return (
    <svg
      viewBox="0 0 128 128"
      width={size}
      height={size}
      fill="currentColor"
      aria-hidden="true"
      className={cn("block", className)}
    >
      <path
        fillRule="evenodd"
        d="M64 8 L124 120 L4 120 Z M64 44 L96 108 L32 108 Z M64 76 L78 98 L50 98 Z"
      />
    </svg>
  );
}
