import type { CSSProperties, ReactNode } from "react";

/**
 * Miniature, non-interactive pieces of the real UI for the page tours. Built
 * from the same tokens as the app so every illustration follows the theme and
 * never goes stale the way a screenshot would.
 */

type Tone = "accent" | "success" | "muted" | "danger" | "warn";

const TONES: Record<Tone, { bg: string; fg: string }> = {
  accent: { bg: "color-mix(in oklab, var(--app-accent) 14%, transparent)", fg: "var(--app-accent-strong)" },
  success: { bg: "color-mix(in oklab, var(--app-success) 16%, transparent)", fg: "var(--app-success)" },
  muted: { bg: "var(--app-surface-soft)", fg: "var(--app-text-muted)" },
  danger: { bg: "color-mix(in oklab, var(--app-danger) 12%, transparent)", fg: "var(--app-danger)" },
  warn: { bg: "color-mix(in oklab, var(--app-cat-extra) 16%, transparent)", fg: "var(--app-cat-extra)" },
};

export const CAT = {
  study: "var(--app-accent)",
  school: "var(--app-cat-school)",
  sport: "var(--app-cat-sport)",
  extra: "var(--app-cat-extra)",
  rose: "var(--app-cat-rose)",
} as const;

/** A small app window: the frame most illustrations sit in. */
export function Window({
  children,
  width = 300,
  title,
  style,
}: {
  children: ReactNode;
  width?: number;
  title?: string;
  style?: CSSProperties;
}) {
  return (
    <div
      className="relative rounded-lg"
      style={{ width, background: "var(--app-surface)", boxShadow: "var(--elev-2)", ...style }}
    >
      {title ? (
        <div
          className="flex items-center gap-1.5 border-b px-3 py-2 text-[11px] font-semibold"
          style={{ borderColor: "var(--app-border)", color: "var(--app-text)" }}
        >
          {title}
        </div>
      ) : null}
      <div className="p-2.5">{children}</div>
    </div>
  );
}

export function Row({
  bar,
  title,
  meta,
  right,
  done,
  highlight,
}: {
  bar?: string;
  title: string;
  meta?: string;
  right?: ReactNode;
  done?: boolean;
  highlight?: boolean;
}) {
  return (
    <div
      className="flex items-center gap-2 rounded-md px-2 py-1.5"
      style={{ background: highlight ? "var(--app-accent-soft)" : undefined }}
    >
      {bar ? <span className="h-6 w-[3px] shrink-0 rounded-full" style={{ background: bar }} /> : null}
      <div className="min-w-0 flex-1">
        <p
          className="truncate text-[11.5px] font-medium"
          style={{
            color: "var(--app-text)",
            textDecoration: done ? "line-through" : undefined,
            opacity: done ? 0.5 : 1,
          }}
        >
          {title}
        </p>
        {meta ? (
          <p className="truncate text-[10px] tabular-nums" style={{ color: "var(--app-text-muted)" }}>
            {meta}
          </p>
        ) : null}
      </div>
      {right}
    </div>
  );
}

export function Chip({ children, tone = "muted" }: { children: ReactNode; tone?: Tone }) {
  const colors = TONES[tone];
  return (
    <span
      className="inline-flex shrink-0 items-center rounded px-1.5 py-0.5 text-[9.5px] font-semibold"
      style={{ background: colors.bg, color: colors.fg }}
    >
      {children}
    </span>
  );
}

export function MockButton({
  children,
  variant = "secondary",
  size = "md",
}: {
  children: ReactNode;
  variant?: "primary" | "secondary";
  size?: "sm" | "md";
}) {
  return (
    <span
      className={
        "inline-flex shrink-0 items-center justify-center rounded-md font-medium " +
        (size === "sm" ? "h-5 px-2 text-[9.5px]" : "h-6 px-2.5 text-[10.5px]")
      }
      style={
        variant === "primary"
          ? { background: "var(--app-accent)", color: "var(--app-accent-on)" }
          : { background: "var(--app-surface)", color: "var(--app-text)", boxShadow: "var(--elev-1)" }
      }
    >
      {children}
    </span>
  );
}

export function MockInput({
  label,
  value,
  placeholder,
  focused,
  multiline,
}: {
  label?: string;
  value?: string;
  placeholder?: string;
  focused?: boolean;
  multiline?: boolean;
}) {
  return (
    <div>
      {label ? (
        <p className="mb-1 text-[9.5px] font-medium" style={{ color: "var(--app-text-soft)" }}>
          {label}
        </p>
      ) : null}
      <div
        className={"rounded-md px-2 text-[10.5px] " + (multiline ? "py-1.5 leading-snug" : "flex h-6 items-center")}
        style={{
          background: "var(--app-surface)",
          boxShadow: focused
            ? "inset 0 0 0 1px var(--app-accent), 0 0 0 2px var(--app-accent-soft)"
            : "var(--elev-inset-strong)",
          color: value ? "var(--app-text)" : "var(--app-text-faint)",
          minHeight: multiline ? 44 : undefined,
        }}
      >
        {value ?? placeholder}
        {focused ? (
          <span className="ml-px inline-block h-3 w-px align-middle" style={{ background: "var(--app-accent)" }} />
        ) : null}
      </div>
    </div>
  );
}

export function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-md px-2.5 py-2" style={{ background: "var(--app-surface)", boxShadow: "var(--elev-1)" }}>
      <p className="text-[9.5px] font-medium" style={{ color: "var(--app-text-muted)" }}>
        {label}
      </p>
      <p className="mt-0.5 tabular-nums text-[15px] leading-tight " style={{ color: "var(--app-text)" }}>
        {value}
      </p>
      {sub ? (
        <p className="text-[9px]" style={{ color: "var(--app-text-faint)" }}>
          {sub}
        </p>
      ) : null}
    </div>
  );
}

/** Mouse pointer, positioned over whatever the step says to click. */
export function Pointer({ style }: { style: CSSProperties }) {
  return (
    <svg
      viewBox="0 0 16 16"
      width="16"
      height="16"
      className="absolute drop-shadow-[0_1px_1px_rgba(0,0,0,0.25)]"
      style={style}
    >
      <path
        d="M3 1.5v11.2l3-2.7 2 4.6 1.9-.8-2-4.5 4.1-.2L3 1.5z"
        fill="var(--app-text)"
        stroke="var(--app-surface)"
        strokeWidth="1"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function TimerRing({
  time,
  label,
  progress,
  size = 120,
}: {
  time: string;
  label: string;
  progress: number;
  size?: number;
}) {
  const r = 52;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative grid place-items-center" style={{ width: size, height: size }}>
      <svg viewBox="0 0 120 120" width={size} height={size} className="absolute inset-0 -rotate-90">
        <circle cx="60" cy="60" r={r} fill="none" stroke="var(--app-border)" strokeWidth="5" />
        <circle
          cx="60"
          cy="60"
          r={r}
          fill="none"
          stroke="var(--app-accent)"
          strokeWidth="5"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - progress)}
        />
      </svg>
      <div className="text-center">
        <p className="text-[9px] font-medium" style={{ color: "var(--app-text-muted)" }}>
          {label}
        </p>
        <p className="tabular-nums text-[22px] leading-none " style={{ color: "var(--app-text)" }}>
          {time}
        </p>
      </div>
    </div>
  );
}

export function BarChart({
  values,
  labels,
  highlight,
  height = 70,
}: {
  values: number[];
  labels: string[];
  highlight?: number;
  height?: number;
}) {
  const max = Math.max(...values, 1);
  return (
    <div className="flex items-end gap-1.5" style={{ height: height + 14 }}>
      {values.map((value, i) => (
        <div key={i} className="flex flex-1 flex-col items-center gap-1">
          <div
            className="w-full rounded-t-[3px]"
            style={{
              height: Math.max(3, (value / max) * height),
              background:
                highlight === undefined || highlight === i
                  ? "var(--app-accent)"
                  : "color-mix(in oklab, var(--app-accent) 35%, var(--app-surface-soft))",
            }}
          />
          <span className="text-[8.5px]" style={{ color: "var(--app-text-faint)" }}>
            {labels[i]}
          </span>
        </div>
      ))}
    </div>
  );
}

/** Deterministic, so the illustration never reshuffles between renders. */
export function Heatmap({ weeks = 15 }: { weeks?: number }) {
  const cells = Array.from({ length: weeks * 7 }, (_, i) => {
    const n = (i * 37 + (i % 5) * 11 + Math.floor(i / 7) * 3) % 10;
    return i > weeks * 7 - 4 ? 0 : n < 3 ? 0 : n < 5 ? 1 : n < 8 ? 2 : 3;
  });
  const shade = ["var(--app-surface-soft)", "30%", "60%", "100%"];
  return (
    <div className="grid grid-flow-col gap-[3px]" style={{ gridTemplateRows: "repeat(7, 9px)" }}>
      {cells.map((level, i) => (
        <span
          key={i}
          className="h-[9px] w-[9px] rounded-[2px]"
          style={{
            background:
              level === 0
                ? shade[0]
                : `color-mix(in oklab, var(--app-accent) ${shade[level]}, var(--app-surface-soft))`,
            boxShadow: level === 0 ? "var(--elev-inset)" : undefined,
          }}
        />
      ))}
    </div>
  );
}

export interface GridBlock {
  day: number;
  /** Start row, 0–9 (each row ≈ one hour). */
  start: number;
  length: number;
  color: string;
  label?: string;
  ghost?: boolean;
  lifted?: boolean;
}

export function WeekGrid({ blocks, width = 320 }: { blocks: GridBlock[]; width?: number }) {
  const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const rowH = 12;
  return (
    <div className="rounded-lg p-2" style={{ width, background: "var(--app-surface)", boxShadow: "var(--elev-2)" }}>
      <div className="grid grid-cols-7 gap-1 pb-1">
        {days.map((day) => (
          <span key={day} className="text-center text-[8.5px] font-medium" style={{ color: "var(--app-text-muted)" }}>
            {day}
          </span>
        ))}
      </div>
      <div className="relative grid grid-cols-7 gap-1" style={{ height: rowH * 10 }}>
        {days.map((day) => (
          <div key={day} className="rounded-[3px]" style={{ background: "var(--app-surface-soft)" }} />
        ))}
        {blocks.map((block, i) => (
          <div
            key={i}
            className="absolute overflow-hidden rounded-[3px] px-1 pt-0.5 text-[7.5px] font-semibold leading-tight"
            style={{
              left: `calc(${(block.day / 7) * 100}% + 1px)`,
              width: `calc(${100 / 7}% - 5px)`,
              top: block.start * rowH,
              height: block.length * rowH - 2,
              background: block.ghost
                ? "transparent"
                : `color-mix(in oklab, ${block.color} 22%, var(--app-surface))`,
              border: block.ghost ? `1px dashed ${block.color}` : undefined,
              borderLeft: block.ghost ? undefined : `2px solid ${block.color}`,
              color: block.color,
              boxShadow: block.lifted ? "var(--elev-2)" : undefined,
              transform: block.lifted ? "translate(2px, -2px)" : undefined,
            }}
          >
            {block.label}
          </div>
        ))}
      </div>
    </div>
  );
}

export function Bubble({ from, children }: { from: "you" | "arcad"; children: ReactNode }) {
  const you = from === "you";
  return (
    <div className={"flex " + (you ? "justify-end" : "justify-start")}>
      <div
        className="max-w-[80%] rounded-lg px-2.5 py-1.5 text-[10.5px] leading-snug"
        style={
          you
            ? { background: "var(--app-accent)", color: "var(--app-accent-on)" }
            : { background: "var(--app-surface-soft)", color: "var(--app-text)", boxShadow: "var(--elev-inset)" }
        }
      >
        {children}
      </div>
    </div>
  );
}

export function Toggle({ on, label }: { on: boolean; label: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-[10.5px] font-medium" style={{ color: "var(--app-text)" }}>
        {label}
      </span>
      <span
        className="relative h-4 w-7 shrink-0 rounded-full"
        style={{ background: on ? "var(--app-accent)" : "var(--app-border-strong)" }}
      >
        <span
          className="absolute top-0.5 h-3 w-3 rounded-full"
          style={{ left: on ? 14 : 2, background: "var(--app-surface)", boxShadow: "0 1px 2px rgba(0,0,0,0.2)" }}
        />
      </span>
    </div>
  );
}

export function FileRow({ name, meta }: { name: string; meta: string }) {
  const ext = name.split(".").pop()?.toUpperCase() ?? "";
  return (
    <div className="flex items-center gap-2 rounded-md px-1.5 py-1">
      <span
        className="grid h-6 w-5 shrink-0 place-items-center rounded-[3px] text-[6.5px] font-bold"
        style={{ background: "var(--app-surface-soft)", boxShadow: "var(--elev-inset)", color: "var(--app-text-muted)" }}
      >
        {ext}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[10.5px] font-medium" style={{ color: "var(--app-text)" }}>
          {name}
        </p>
        <p className="text-[9px]" style={{ color: "var(--app-text-muted)" }}>
          {meta}
        </p>
      </div>
    </div>
  );
}

export function Avatar({ name, active }: { name: string; active?: boolean }) {
  return (
    <span
      className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-[10px] font-semibold"
      style={
        active
          ? { background: "var(--app-accent)", color: "var(--app-accent-on)" }
          : { background: "var(--app-surface-soft)", color: "var(--app-text-soft)", boxShadow: "var(--elev-inset)" }
      }
    >
      {name[0]}
    </span>
  );
}

/** A horizontal meter, e.g. minutes per subject. */
export function Meter({ label, value, fraction }: { label: string; value: string; fraction: number }) {
  return (
    <div>
      <div className="flex justify-between text-[10px]">
        <span style={{ color: "var(--app-text)" }}>{label}</span>
        <span className="tabular-nums" style={{ color: "var(--app-text-muted)" }}>
          {value}
        </span>
      </div>
      <div className="mt-1 h-1.5 rounded-full" style={{ background: "var(--app-surface-soft)" }}>
        <div className="h-full" style={{ width: `${fraction * 100}%`, background: "var(--app-accent)" }} />
      </div>
    </div>
  );
}

export function Stack({ children, gap = 6, style }: { children: ReactNode; gap?: number; style?: CSSProperties }) {
  return (
    <div className="flex flex-col" style={{ gap, ...style }}>
      {children}
    </div>
  );
}
