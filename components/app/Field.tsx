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
      <span className="text-[13px] font-medium tracking-[-0.005em] text-white/70">{label}</span>
      <input
        id={inputId}
        {...rest}
        className={cn(
          "mt-2 w-full rounded-[10px] border border-white/12 bg-white/[0.04] px-4 py-3 text-[15px] text-white",
          "placeholder:text-white/35 outline-none",
          "transition-[background-color,border-color] duration-200 ease-[var(--ease-out-expo)]",
          "focus:border-accent-300 focus:bg-white/[0.06]",
          "disabled:cursor-not-allowed disabled:opacity-60",
          className,
        )}
      />
      {hint ? <span className="mt-2 block text-[12.5px] text-white/45">{hint}</span> : null}
    </label>
  );
}
