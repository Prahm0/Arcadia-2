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
        "relative flex h-12 w-full items-center justify-center gap-2 rounded-[10px]",
        "bg-white text-[15px] font-medium text-black",
        "transition-[background-color,transform,opacity] duration-200 ease-[var(--ease-out-expo)]",
        "hover:-translate-y-px hover:bg-[#ebebeb] active:translate-y-0",
        "disabled:pointer-events-none disabled:opacity-60",
        className,
      )}
    >
      {loading ? (
        <span
          aria-hidden="true"
          className="h-4 w-4 animate-spin rounded-full border-2 border-black/30 border-t-black"
        />
      ) : null}
      {children}
    </button>
  );
}
