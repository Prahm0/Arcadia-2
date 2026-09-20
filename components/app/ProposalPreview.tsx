"use client";

import { useDashboardData } from "@/lib/app/DashboardProvider";
import type { PlannerEvent } from "@/lib/api/types";
import { formatClock, dateKey, formatDurationMinutes } from "@/lib/api/time";

interface ProposalOperation {
  action?: "create" | "update";
  eventId?: string | null;
  title?: string | null;
  subject?: string | null;
  kind?: string | null;
  startAt?: string;
  endAt?: string;
}

interface ProposalPreviewProps {
  operations: unknown[];
}

/**
 * Renders a small before/after preview for each proposed schedule operation.
 * Each row is a compact bar chart of the affected day around the change, so
 * "move Chemistry to Wednesday afternoon" is visible, not just described.
 * Falls back to a compact text line for anything the previewer can't parse
 * (unknown shape, missing timestamps) — better a legible line than a broken
 * chart.
 */
export default function ProposalPreview({ operations }: ProposalPreviewProps) {
  const { data } = useDashboardData();
  const timezone = data.profile?.timezone || data.user.timezone || "Australia/Sydney";

  const rows = (operations || [])
    .map((raw) => normalize(raw))
    .filter((op): op is ProposalOperation & { startAt: string; endAt: string } =>
      op !== null && !!op.startAt && !!op.endAt,
    );

  if (rows.length === 0) return null;

  return (
    <div className="mt-4 flex flex-col gap-2.5">
      {rows.map((op, index) => (
        <OperationChip
          key={`${op.eventId ?? "new"}-${index}`}
          operation={op}
          events={data.events}
          timezone={timezone}
        />
      ))}
    </div>
  );
}

function OperationChip({
  operation,
  events,
  timezone,
}: {
  operation: ProposalOperation & { startAt: string; endAt: string };
  events: PlannerEvent[];
  timezone: string;
}) {
  const existing = operation.eventId
    ? events.find((event) => event.id === operation.eventId) ?? null
    : null;
  const isMove = operation.action === "update" && !!existing;

  const afterStartLabel = formatClock(operation.startAt, timezone);
  const afterEndLabel = formatClock(operation.endAt, timezone);
  const afterDayLabel = formatFriendlyShortDate(operation.startAt, timezone);
  const afterMinutes = Math.max(
    0,
    Math.round((Date.parse(operation.endAt) - Date.parse(operation.startAt)) / 60000),
  );
  const title = operation.title || existing?.title || "Study block";
  const subject = operation.subject || existing?.subject || null;

  return (
    <div
      className="rounded-[10px] p-3"
      style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}
    >
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-[13px] font-medium" style={{ color: "var(--app-text)" }}>
          {isMove ? "Move" : "Add"}: {title}
          {subject ? (
            <span className="ml-1.5" style={{ color: "var(--app-text-muted)" }}>· {subject}</span>
          ) : null}
        </p>
        <p className="type-mono-label" style={{ color: "var(--app-text-muted)" }}>
          {formatDurationMinutes(afterMinutes)}
        </p>
      </div>

      <div className="mt-2.5 grid grid-cols-[minmax(0,1fr)_16px_minmax(0,1fr)] items-stretch gap-2">
        {isMove && existing ? (
          <MiniDayChart
            label="Before"
            timezone={timezone}
            highlightStart={existing.startAt}
            highlightEnd={existing.endAt}
            highlightTone="ghost"
            anchorIso={existing.startAt}
          />
        ) : (
          <BeforeEmpty label={isMove ? "Before" : "Nothing here"} />
        )}
        <Arrow />
        <MiniDayChart
          label="After"
          timezone={timezone}
          highlightStart={operation.startAt}
          highlightEnd={operation.endAt}
          highlightTone="accent"
          anchorIso={operation.startAt}
        />
      </div>

      <p className="mt-2 type-mono-label" style={{ color: "var(--app-text-muted)" }}>
        {isMove && existing
          ? `${formatFriendlyShortDate(existing.startAt, timezone)} ${formatClock(existing.startAt, timezone)}–${formatClock(existing.endAt, timezone)}  →  ${afterDayLabel} ${afterStartLabel}–${afterEndLabel}`
          : `${afterDayLabel} ${afterStartLabel}–${afterEndLabel}`}
      </p>
    </div>
  );
}

/**
 * A compact 6-hour column around a highlighted range. Anchor selects the day
 * being shown (either the "before" day or the "after" day depending on side).
 */
function MiniDayChart({
  label,
  timezone,
  highlightStart,
  highlightEnd,
  highlightTone,
  anchorIso,
}: {
  label: string;
  timezone: string;
  highlightStart: string;
  highlightEnd: string;
  highlightTone: "accent" | "ghost";
  anchorIso: string;
}) {
  const windowHours = 6;
  const midHour = hourInTimezone(highlightStart, timezone);
  const startHour = Math.max(0, Math.min(24 - windowHours, midHour - Math.floor(windowHours / 2)));
  const endHour = startHour + windowHours;

  // Position the highlight bar as a percentage of the window height
  const startFrac = clampFrac(hourFrac(highlightStart, timezone) - startHour, windowHours);
  const endFrac = clampFrac(hourFrac(highlightEnd, timezone) - startHour, windowHours);
  const anchorKey = dateKey(anchorIso, timezone);

  return (
    <div className="min-w-0">
      <p className="type-eyebrow" style={{ color: "var(--app-text-muted)" }}>{label}</p>
      <div
        className="relative mt-1.5 h-[64px] w-full overflow-hidden rounded-[6px]"
        style={{ background: "var(--app-surface-soft)", border: "1px solid var(--app-border)" }}
        aria-hidden="true"
      >
        {/* Hour ticks */}
        {[0, 1, 2, 3, 4, 5].map((offset) => (
          <div
            key={offset}
            className="absolute inset-x-0"
            style={{
              top: `${(offset / windowHours) * 100}%`,
              height: 1,
              background: "color-mix(in oklab, var(--app-border) 60%, transparent)",
            }}
          />
        ))}
        {/* Highlight */}
        <div
          className="absolute inset-x-1 rounded-[4px]"
          style={{
            top: `${startFrac * 100}%`,
            height: `${Math.max(6, (endFrac - startFrac) * 100)}%`,
            background:
              highlightTone === "accent"
                ? "var(--app-accent)"
                : "color-mix(in oklab, var(--app-accent) 12%, var(--app-surface-soft))",
            border:
              highlightTone === "ghost"
                ? "1px dashed var(--app-border-strong)"
                : "1px solid var(--app-accent-strong)",
            opacity: highlightTone === "ghost" ? 0.85 : 1,
            transition: "top 0.25s var(--ease-out-expo, ease-out)",
          }}
        />
      </div>
      <p className="mt-1 type-mono-label" style={{ color: "var(--app-text-muted)" }}>
        {shortDayName(anchorKey)} · {formatHourLabel(startHour)}–{formatHourLabel(endHour)}
      </p>
    </div>
  );
}

function BeforeEmpty({ label }: { label: string }) {
  return (
    <div className="min-w-0">
      <p className="type-eyebrow" style={{ color: "var(--app-text-muted)" }}>{label}</p>
      <div
        className="mt-1.5 grid h-[64px] w-full place-items-center rounded-[6px] text-[11px] font-mono"
        style={{
          background: "var(--app-surface-soft)",
          border: "1px dashed var(--app-border-strong)",
          color: "var(--app-text-faint)",
        }}
      >
        Empty slot
      </div>
      <p className="mt-1 type-mono-label" style={{ color: "var(--app-text-faint)" }}>&nbsp;</p>
    </div>
  );
}

function Arrow() {
  return (
    <div className="grid place-items-center" aria-hidden="true">
      <svg viewBox="0 0 20 20" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.6" style={{ color: "var(--app-text-muted)" }}>
        <path d="M5 10h10M11 6l4 4-4 4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

function normalize(raw: unknown): ProposalOperation | null {
  if (!raw || typeof raw !== "object") return null;
  const anyRaw = raw as Record<string, unknown>;
  const startAt = typeof anyRaw.startAt === "string" ? anyRaw.startAt : undefined;
  const endAt = typeof anyRaw.endAt === "string" ? anyRaw.endAt : undefined;
  return {
    action: anyRaw.action === "update" || anyRaw.action === "create" ? anyRaw.action : undefined,
    eventId: typeof anyRaw.eventId === "string" ? anyRaw.eventId : null,
    title: typeof anyRaw.title === "string" ? anyRaw.title : null,
    subject: typeof anyRaw.subject === "string" ? anyRaw.subject : null,
    kind: typeof anyRaw.kind === "string" ? anyRaw.kind : null,
    startAt,
    endAt,
  };
}

function hourInTimezone(iso: string, timezone: string): number {
  const parts = new Intl.DateTimeFormat("en-AU", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date(iso));
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? "0");
  const minute = Number(parts.find((part) => part.type === "minute")?.value ?? "0");
  return hour + minute / 60;
}

function hourFrac(iso: string, timezone: string): number {
  return hourInTimezone(iso, timezone);
}

function clampFrac(value: number, window: number): number {
  return Math.max(0, Math.min(1, value / window));
}

function formatHourLabel(hour: number): string {
  const rounded = Math.round(hour);
  const suffix = rounded >= 12 ? "pm" : "am";
  const display = rounded % 12 === 0 ? 12 : rounded % 12;
  return `${display}${suffix}`;
}

function formatFriendlyShortDate(iso: string, timezone: string): string {
  return new Intl.DateTimeFormat("en-AU", {
    timeZone: timezone,
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(new Date(iso));
}

function shortDayName(key: string): string {
  const [y, m, d] = key.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d, 12));
  return new Intl.DateTimeFormat("en-AU", { weekday: "short" }).format(date);
}
