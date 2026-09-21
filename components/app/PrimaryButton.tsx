import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";

interface PrimaryButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  loading?: boolean;
  children: ReactNode;
}

/** Full-width form submit (auth screens, sheets). Same look as AppButton primary. */
export default function PrimaryButton({
  loading,
  disabled,
  children,
  className,
  ...rest
}: PrimaryButtonProps) {
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      className={cn(
        "relative flex h-10 w-full items-center justify-center gap-2 rounded-md text-[14px] font-medium",
        "bg-[var(--app-accent)] text-[var(--app-accent-on)] shadow-[0_1px_2px_rgba(var(--shadow-rgb),0.12)]",
        "transition-colors duration-100 ease-out hover:bg-[var(--app-accent-strong)] active:brightness-95",
        "disabled:pointer-events-none disabled:opacity-50",
        className,
      )}
    >
      {loading ? (
        <span
          aria-hidden="true"
          className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent opacity-70"
        />
      ) : null}
      {children}
    </button>
  );
}
