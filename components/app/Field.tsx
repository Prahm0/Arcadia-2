import type { InputHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  hint?: string;
}

export default function Field({ label, hint, className, id, ...rest }: FieldProps) {
  const inputId = id ?? `field-${rest.name ?? label.toLowerCase().replace(/\s+/g, "-")}`;
  return (
    <label htmlFor={inputId} className="block">
      <span className="text-[13px] font-medium" style={{ color: "var(--app-text-soft)" }}>
        {label}
      </span>
      <input
        id={inputId}
        {...rest}
        className={cn(
          "mt-1.5 h-9 w-full rounded-md bg-[var(--app-surface)] px-3 text-[14px] outline-none",
          "shadow-[var(--elev-inset-strong)] transition-shadow duration-100",
          "placeholder:text-[var(--app-text-faint)]",
          "focus:shadow-[inset_0_0_0_1px_var(--app-accent),0_0_0_3px_var(--app-accent-soft)]",
          "disabled:cursor-not-allowed disabled:opacity-60",
          className,
        )}
        style={{ color: "var(--app-text)" }}
      />
      {hint ? (
        <span className="mt-1.5 block text-[12px]" style={{ color: "var(--app-text-muted)" }}>
          {hint}
        </span>
      ) : null}
    </label>
  );
}
