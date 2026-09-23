"use client";

import { useEffect, type ReactNode } from "react";
import { SUBJECT_COLORS } from "@/lib/app/categoryColors";
import { WEEKLY_MAX_MINUTES, WEEKLY_STEP_MINUTES, formatWeekly } from "@/lib/app/studyTargets";

/** A titled card on the profile. `id` doubles as the #anchor other pages link to. */
export function Section({
  id,
  title,
  meta,
  action,
  children,
}: {
  id: string;
  title: ReactNode;
  meta?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-title`}
      className="scroll-mt-20 rounded-lg p-5 sm:p-6"
      style={{ background: "var(--app-surface)", boxShadow: "var(--elev-1)" }}
    >
      <div className="mb-4 flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <h2 id={`${id}-title`} className="text-[15px] font-semibold" style={{ color: "var(--app-text)" }}>
            {title}
          </h2>
          {meta ? (
            <p className="mt-0.5 text-[13px]" style={{ color: "var(--app-text-muted)" }}>
              {meta}
            </p>
          ) : null}
        </div>
        {action ? <div className="flex shrink-0 items-center gap-2">{action}</div> : null}
      </div>
      {children}
    </section>
  );
}

/** Centred dialog on desktop, bottom sheet on phones. */
export function Sheet({
  open,
  eyebrow,
  title,
  onClose,
  children,
}: {
  open: boolean;
  eyebrow?: string;
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const listener = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <div
        className="absolute inset-0"
        style={{ background: "color-mix(in oklab, black 45%, transparent)" }}
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="relative max-h-[92svh] w-full max-w-[520px] overflow-y-auto rounded-t-xl p-6 sm:rounded-lg"
        style={{ background: "var(--app-elev)", boxShadow: "var(--elev-3)", color: "var(--app-text)" }}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            {eyebrow ? (
              <p className="type-eyebrow" style={{ color: "var(--app-text-muted)" }}>
                {eyebrow}
              </p>
            ) : null}
            <h2 className="mt-1 truncate text-[20px] font-medium tracking-[-0.015em]">{title}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="grid h-8 w-8 shrink-0 place-items-center rounded-md ui-hover"
            style={{ color: "var(--app-text-muted)" }}
          >
            <svg viewBox="0 0 20 20" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.6">
              <path d="M5 5l10 10M15 5L5 15" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        <div className="mt-5">{children}</div>
      </div>
    </div>
  );
}

export function Label({ text, hint, children }: { text: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-2 block text-[12.5px] font-medium" style={{ color: "var(--app-text-muted)" }}>
        {text}
      </span>
      {children}
      {hint ? (
        <span className="mt-1.5 block text-[12px]" style={{ color: "var(--app-text-muted)" }}>
          {hint}
        </span>
      ) : null}
    </label>
  );
}

const FIELD_STYLE = {
  background: "var(--app-surface-soft)",
  boxShadow: "var(--elev-inset)",
  color: "var(--app-text)",
} as const;

export function TextInput({
  value,
  onChange,
  placeholder,
  type = "text",
  maxLength,
  required,
  inputMode,
  step,
  min,
  max,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
  maxLength?: number;
  required?: boolean;
  inputMode?: "text" | "decimal" | "numeric";
  step?: string;
  min?: string;
  max?: string;
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      maxLength={maxLength}
      required={required}
      inputMode={inputMode}
      step={step}
      min={min}
      max={max}
      className="w-full rounded-md px-3 py-2.5 text-[14.5px] outline-none"
      style={FIELD_STYLE}
    />
  );
}

export function TextArea({
  value,
  onChange,
  placeholder,
  maxLength,
  rows = 4,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  maxLength?: number;
  rows?: number;
}) {
  return (
    <textarea
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      maxLength={maxLength}
      rows={rows}
      className="w-full resize-y rounded-md px-3 py-2.5 text-[14.5px] leading-[1.5] outline-none"
      style={FIELD_STYLE}
    />
  );
}

export function Select({
  value,
  onChange,
  children,
}: {
  value: string;
  onChange: (value: string) => void;
  children: ReactNode;
}) {
  return (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="w-full rounded-md px-3 py-2.5 text-[14.5px] outline-none"
      style={FIELD_STYLE}
    >
      {children}
    </select>
  );
}

/** −  3h  + in 30-minute steps; 0 reads "Off". */
export function WeeklyStepper({
  minutes,
  onChange,
  label,
}: {
  minutes: number;
  onChange: (minutes: number) => void;
  label: string;
}) {
  const set = (next: number) => onChange(Math.min(WEEKLY_MAX_MINUTES, Math.max(0, next)));
  return (
    <div className="flex items-center gap-1" role="group" aria-label={label}>
      <StepButton label={`Less time for ${label}`} disabled={minutes <= 0} onClick={() => set(minutes - WEEKLY_STEP_MINUTES)}>
        <path d="M5 10h10" strokeLinecap="round" />
      </StepButton>
      <span
        className="w-[72px] text-center tabular-nums text-[14px]"
        style={{ color: minutes > 0 ? "var(--app-text)" : "var(--app-text-muted)" }}
        aria-live="polite"
      >
        {formatWeekly(minutes)}
      </span>
      <StepButton
        label={`More time for ${label}`}
        disabled={minutes >= WEEKLY_MAX_MINUTES}
        onClick={() => set(minutes + WEEKLY_STEP_MINUTES)}
      >
        <path d="M10 5v10M5 10h10" strokeLinecap="round" />
      </StepButton>
    </div>
  );
}

function StepButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="flex h-8 w-8 items-center justify-center rounded-md transition-colors hover:bg-[var(--app-surface-soft)] disabled:pointer-events-none disabled:opacity-40"
      style={{ color: "var(--app-text-soft)", border: "1px solid var(--app-border-strong)" }}
    >
      <svg viewBox="0 0 20 20" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
        {children}
      </svg>
    </button>
  );
}

// Spoken names for SUBJECT_COLORS, in the same order.
const COLOUR_NAMES = ["Terracotta", "Denim", "Olive", "Ochre", "Mauve", "Sage"];

export function ColourSwatches({
  value,
  onChange,
  label,
}: {
  value: string | null | undefined;
  onChange: (colour: string) => void;
  label: string;
}) {
  return (
    <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={label}>
      {SUBJECT_COLORS.map((colour, index) => {
        const selected = value?.toLowerCase() === colour.toLowerCase();
        return (
          <button
            key={colour}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={COLOUR_NAMES[index] ?? colour}
            onClick={() => onChange(colour)}
            className="h-8 w-8 rounded-full transition-transform hover:scale-105"
            style={{
              background: colour,
              boxShadow: selected
                ? "0 0 0 2px var(--app-elev), 0 0 0 4px var(--app-text)"
                : "inset 0 0 0 1px color-mix(in oklab, black 12%, transparent)",
            }}
          />
        );
      })}
    </div>
  );
}

/** A stable palette colour for someone who hasn't picked one. */
export function fallbackColour(name: string): string {
  let hash = 0;
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return SUBJECT_COLORS[hash % SUBJECT_COLORS.length];
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const first = parts[0][0] ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1][0] ?? "" : "";
  return (first + last).toUpperCase();
}

export function Avatar({
  name,
  colour,
  size = 72,
}: {
  name: string;
  colour?: string | null;
  size?: number;
}) {
  return (
    <div
      aria-hidden="true"
      className="grid shrink-0 place-items-center rounded-full font-semibold"
      style={{
        width: size,
        height: size,
        fontSize: Math.round(size * 0.38),
        background: colour || fallbackColour(name),
        color: "#fff",
        letterSpacing: "-0.02em",
      }}
    >
      {initials(name)}
    </div>
  );
}

/** "34h", "1h 20m", "45m". */
export function formatHoursMinutes(minutes: number): string {
  if (minutes <= 0) return "0m";
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest}m`;
  if (hours >= 10 || rest === 0) return `${hours}h`;
  return `${hours}h ${rest}m`;
}
