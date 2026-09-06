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
  const base =
    "inline-flex items-center justify-center gap-2 rounded-[10px] px-4 h-10 text-[13.5px] font-medium transition-[background-color,border-color,color,transform] duration-200 ease-[var(--ease-out-expo)] hover:-translate-y-px active:translate-y-0 disabled:pointer-events-none disabled:opacity-60";
  const style: React.CSSProperties =
    variant === "primary"
      ? { background: "var(--app-text)", color: "var(--app-bg)" }
      : variant === "ghost"
        ? { background: "transparent", color: "var(--app-text-soft)" }
        : { background: "var(--app-surface)", color: "var(--app-text)", border: "1px solid var(--app-border)" };
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      className={cn(base, className)}
      style={{ ...style }}
    >
      {loading ? (
        <span
          aria-hidden="true"
          className="h-3.5 w-3.5 animate-spin rounded-full border-2"
          style={{
            borderColor: variant === "primary" ? "color-mix(in oklab, var(--app-bg) 40%, transparent)" : "var(--app-border)",
            borderTopColor: variant === "primary" ? "var(--app-bg)" : "var(--app-text)",
          }}
        />
      ) : icon}
      {children}
    </button>
  );
}
