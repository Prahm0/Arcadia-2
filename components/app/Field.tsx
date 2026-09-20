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
      <span
        className="text-[13px] font-medium tracking-[-0.005em]"
        style={{ color: "var(--app-text-muted)" }}
      >
        {label}
      </span>
      <input
        id={inputId}
        {...rest}
        className={cn(
          "clay-well mt-2 w-full rounded-clay-sm px-4 py-3 text-[15px] outline-none",
          "transition-shadow duration-200 ease-[var(--ease-out-expo)]",
          "focus:shadow-[var(--clay-well),0_0_0_3px_var(--app-accent-soft)]",
          "disabled:cursor-not-allowed disabled:opacity-60",
          className,
        )}
        style={{ color: "var(--app-text)" }}
      />
      {hint ? (
        <span className="mt-2 block text-[12.5px]" style={{ color: "var(--app-text-faint)" }}>
          {hint}
        </span>
      ) : null}
    </label>
  );
}
