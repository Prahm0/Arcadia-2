import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";
import { tap } from "@/lib/capacitor/haptics";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md";

interface AppButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: ReactNode;
  children: ReactNode;
}

const SIZES: Record<Size, string> = {
  sm: "h-7 px-2.5 text-[12.5px] gap-1.5",
  md: "h-8 px-3 text-[13px] gap-2",
};

// Colours live in classes rather than inline styles so :hover can change them.
const VARIANTS: Record<Variant, string> = {
  // Accent fill, used once per view for the action that view exists for.
  primary:
    "bg-[var(--app-accent)] text-[var(--app-accent-on)] shadow-[0_1px_2px_rgba(var(--shadow-rgb),0.12)] hover:bg-[var(--app-accent-strong)]",
  secondary:
    "bg-[var(--app-surface)] text-[var(--app-text)] shadow-[var(--elev-1)] hover:bg-[var(--app-surface-soft)] hover:shadow-[0_0_0_1px_var(--app-border-strong)]",
  ghost:
    "bg-transparent text-[var(--app-text-soft)] hover:bg-[color-mix(in_oklab,var(--app-text)_6%,transparent)] hover:text-[var(--app-text)]",
  danger:
    "bg-[var(--app-surface)] text-[var(--app-danger)] shadow-[var(--elev-1)] hover:bg-[color-mix(in_oklab,var(--app-danger)_8%,var(--app-surface))] hover:shadow-[0_0_0_1px_color-mix(in_oklab,var(--app-danger)_45%,transparent)]",
};

/** The button look, for a Link that should read as a button. */
export function appButtonClass(variant: Variant = "secondary", size: Size = "md", className?: string): string {
  return cn(
    "inline-flex shrink-0 items-center justify-center whitespace-nowrap rounded-md font-medium",
    "transition-[background-color,box-shadow,color] duration-100 ease-out",
    "active:brightness-95 disabled:pointer-events-none disabled:opacity-50",
    SIZES[size],
    VARIANTS[variant],
    className,
  );
}

export default function AppButton({
  variant = "secondary",
  size = "md",
  loading,
  disabled,
  icon,
  className,
  children,
  onClick,
  ...rest
}: AppButtonProps) {
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      className={appButtonClass(variant, size, className)}
      onClick={(event) => {
        if (variant === "primary" && !disabled && !loading) void tap();
        onClick?.(event);
      }}
    >
      {loading ? (
        <span
          aria-hidden="true"
          className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent opacity-70"
        />
      ) : icon}
      {children}
    </button>
  );
}
