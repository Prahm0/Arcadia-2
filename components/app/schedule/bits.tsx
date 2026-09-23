"use client";

import type { ReactNode } from "react";
import { STATUS_LABEL, type ItemStatus } from "./calendar";

/** A small progress ring, ink on a hairline track. */
export function Ring({ value, size = 22, stroke = 2.5, label }: { value: number; size?: number; stroke?: number; label?: string }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(1, value));
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role={label ? "img" : undefined} aria-label={label} aria-hidden={label ? undefined : true} className="shrink-0 -rotate-90">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--app-border)" strokeWidth={stroke} />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="var(--app-text)"
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={`${c * v} ${c}`}
        style={{ transition: "stroke-dasharray 0.5s var(--ease-out-expo)" }}
      />
    </svg>
  );
}

/** A 3px bar like the companion and streak bars on Today. */
export function Bar({ value, tone = "var(--app-text)", track = "var(--app-border)" }: { value: number; tone?: string; track?: string }) {
  return (
    <span className="block h-[3px] overflow-hidden rounded-[1px]" style={{ background: track }} aria-hidden="true">
      <span
        className="block h-full"
        style={{ width: `${Math.max(0, Math.min(1, value)) * 100}%`, background: tone, transition: "width 0.5s var(--ease-out-expo)" }}
      />
    </span>
  );
}

/**
 * Tiny day bars, the Last 7 days chart from Today in miniature: a faint
 * column for what was planned, ink for what was done, the current day in
 * full ink.
 */
export function MiniBars({
  days,
  height = 22,
  label,
}: {
  days: Array<{ key: string; done: number; planned: number; current?: boolean }>;
  height?: number;
  label: string;
}) {
  const max = Math.max(1, ...days.map((day) => Math.max(day.done, day.planned)));
  return (
    <div className="flex items-end gap-[3px]" style={{ height }} role="img" aria-label={label}>
      {days.map((day) => (
        <div key={day.key} className="relative h-full w-[6px]">
          <div
            className="absolute inset-x-0 bottom-0 rounded-t-[1.5px]"
            style={{ height: day.planned ? `${Math.max(12, (day.planned / max) * 100)}%` : 2, background: "var(--app-border)" }}
          />
          {day.done > 0 ? (
            <div
              className="absolute inset-x-0 bottom-0 rounded-t-[1.5px]"
              style={{
                height: `${Math.max(12, (day.done / max) * 100)}%`,
                background: day.current ? "var(--app-text)" : "var(--app-text-faint)",
                transition: "height 0.4s var(--ease-out-expo)",
              }}
            />
          ) : null}
        </div>
      ))}
    </div>
  );
}

const STATUS_TONE: Record<ItemStatus, string> = {
  completed: "var(--app-success)",
  pending: "var(--app-text-muted)",
  rescheduled: "var(--app-warning)",
  overdue: "var(--app-danger)",
  missed: "var(--app-danger)",
};

/** A status as an outlined word, never a dot. */
export function StatusWord({ status }: { status: ItemStatus }) {
  const tone = STATUS_TONE[status];
  return (
    <span
      className="shrink-0 rounded-[3px] px-1 text-[10.5px] font-semibold leading-[16px]"
      style={{
        color: status === "pending" ? tone : `color-mix(in oklab, ${tone} 80%, var(--app-text))`,
        boxShadow: `inset 0 0 0 1px color-mix(in oklab, ${tone} ${status === "pending" ? 35 : 45}%, transparent)`,
      }}
    >
      {STATUS_LABEL[status]}
    </span>
  );
}

/** The square tick used for tasks, blocks and habits alike. */
export function Tick({
  checked,
  onChange,
  label,
  disabled,
  size = 18,
}: {
  checked: boolean;
  onChange: () => void;
  label: string;
  disabled?: boolean;
  size?: number;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={(event) => {
        event.stopPropagation();
        onChange();
      }}
      className="grid shrink-0 place-items-center rounded-[5px] transition-[background,box-shadow] disabled:cursor-not-allowed disabled:opacity-40"
      style={{
        width: size,
        height: size,
        background: checked ? "var(--app-text)" : "transparent",
        boxShadow: checked ? undefined : "inset 0 0 0 1.5px var(--app-border-strong)",
        color: "var(--app-bg)",
      }}
    >
      {checked ? (
        <svg width={size * 0.55} height={size * 0.55} viewBox="0 0 10 10" fill="none" aria-hidden="true">
          <path d="M1.5 5.2l2.3 2.3L8.6 2.4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ) : null}
    </button>
  );
}

export function FlameGlyph({ size = 12 }: { size?: number }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
      <path d="M8 14.2c2.7 0 4.5-1.8 4.5-4.4 0-2.9-2.3-4.5-3.3-7.6C7.4 3.6 6.8 5.3 7 7 5.9 6.6 5.3 5.6 5.2 4.8 4 6 3.5 7.6 3.5 9.8c0 2.6 1.8 4.4 4.5 4.4Z" />
    </svg>
  );
}

/** The brand's four-point star, as on the Streaks sky. */
export function Sparkle({ size = 10, lit }: { size?: number; lit: boolean }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" width={size} height={size} className="shrink-0">
      <path
        d="M12 0C12 7.6 16.4 12 24 12C16.4 12 12 16.4 12 24C12 16.4 7.6 12 0 12C7.6 12 12 7.6 12 0Z"
        fill={lit ? "var(--app-text)" : "none"}
        stroke={lit ? "none" : "var(--app-text-faint)"}
        strokeWidth={lit ? 0 : 1.6}
      />
    </svg>
  );
}

export function ChevronIcon({ direction }: { direction: "left" | "right" | "down" }) {
  const d = direction === "left" ? "M12 5l-5 5 5 5" : direction === "right" ? "M8 5l5 5-5 5" : "M5 8l5 5 5-5";
  return (
    <svg viewBox="0 0 20 20" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}

export function PanelTitle({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <h2 className="text-[12.5px] font-medium" style={{ color: "var(--app-text-muted)" }}>{children}</h2>
      {aside}
    </div>
  );
}

/** "Exam" as an outlined word in the danger tone. */
export function ExamWord() {
  return (
    <span
      className="shrink-0 rounded-[3px] px-1 text-[10px] font-semibold uppercase tracking-[0.04em]"
      style={{ color: "var(--app-danger)", boxShadow: "inset 0 0 0 1px color-mix(in oklab, var(--app-danger) 45%, transparent)" }}
    >
      Exam
    </span>
  );
}
