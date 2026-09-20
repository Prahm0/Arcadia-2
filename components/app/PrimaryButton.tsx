import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";

interface PrimaryButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  loading?: boolean;
  children: ReactNode;
}

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
        "clay-pressable relative flex h-12 w-full items-center justify-center gap-2",
        "rounded-clay-sm text-[15px] font-medium",
        "disabled:pointer-events-none disabled:opacity-60",
        className,
      )}
      style={{
        // Matches AppButton's primary: inverted rather than accent-filled.
        background: "var(--app-text)",
        color: "var(--app-bg)",
        boxShadow: "var(--clay-shadow), var(--clay-rim)",
      }}
    >
      {loading ? (
        <span
          aria-hidden="true"
          className="h-4 w-4 animate-spin rounded-full border-2"
          style={{
            borderColor: "color-mix(in oklab, var(--app-bg) 40%, transparent)",
            borderTopColor: "var(--app-bg)",
          }}
        />
      ) : null}
      {children}
    </button>
  );
}
