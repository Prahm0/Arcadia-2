import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";

type Variant = "primary" | "secondary" | "ghost";

interface AppButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  loading?: boolean;
  icon?: ReactNode;
  children: ReactNode;
}

export default function AppButton({
  variant = "secondary",
  loading,
  disabled,
  icon,
  className,
  children,
  ...rest
}: AppButtonProps) {
  // clay-pressable supplies the lift/press affordance and the transition; the
  // ghost variant stays flat so it reads as a text button, not a slab.
  const base =
    "inline-flex items-center justify-center gap-2 rounded-clay-sm px-4 h-10 text-[13.5px] font-medium disabled:pointer-events-none disabled:opacity-60";
  const style: React.CSSProperties =
    variant === "primary"
      ? {
          // Inverted, not accent-filled: a page full of accent-coloured slabs
          // reads as orange rather than as clay.
          background: "var(--app-text)",
          color: "var(--app-bg)",
          boxShadow: "var(--clay-shadow), var(--clay-rim)",
        }
      : variant === "ghost"
        ? { background: "transparent", color: "var(--app-text-soft)" }
        : {
            background: "var(--app-surface)",
            color: "var(--app-text)",
            boxShadow: "var(--clay-shadow), var(--clay-rim)",
          };
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      className={cn(base, variant === "ghost" ? "clay-hover transition-colors" : "clay-pressable", className)}
      style={{ ...style }}
    >
      {loading ? (
        <span
          aria-hidden="true"
          className="h-3.5 w-3.5 animate-spin rounded-full border-2"
          style={{
            borderColor:
              variant === "primary"
                ? "color-mix(in oklab, var(--app-bg) 40%, transparent)"
                : "var(--app-border-strong)",
            borderTopColor: variant === "primary" ? "var(--app-bg)" : "var(--app-text)",
          }}
        />
      ) : icon}
      {children}
    </button>
  );
}
