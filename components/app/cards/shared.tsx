"use client";

import Link from "next/link";
import { useCallback, useMemo, type ReactNode } from "react";
import type { Deck } from "@/lib/api/cards";
import { useDashboardData } from "@/lib/app/DashboardProvider";
import { SUBJECT_COLORS } from "@/lib/app/categoryColors";

export interface SubjectInfo {
  id: string;
  name: string;
  colour: string;
}

/** A subject's name and colour by id, coloured the way the profile colours it. */
export function useSubjects() {
  const { data } = useDashboardData();
  const subjects = useMemo<SubjectInfo[]>(
    () =>
      data.subjects.map((subject, index) => ({
        id: subject.id,
        name: subject.name,
        colour: subject.colour || SUBJECT_COLORS[index % SUBJECT_COLORS.length],
      })),
    [data.subjects],
  );
  const find = useCallback(
    (id: string | null | undefined) => (id ? subjects.find((subject) => subject.id === id) ?? null : null),
    [subjects],
  );
  return { subjects, find };
}

/**
 * A subject's name in its colour, with a matching outline and a faint fill.
 * Colour is carried by the tag itself rather than a dot beside it. The text
 * is mixed toward the theme's text colour so it reads in light and dark.
 */
export function SubjectTag({
  subject,
  count,
  size = "md",
}: {
  subject: Pick<SubjectInfo, "name" | "colour"> | null;
  /** Shown after the name, e.g. cards due. */
  count?: number;
  size?: "sm" | "md";
}) {
  const colour = subject?.colour;
  return (
    <span
      className={
        "inline-flex max-w-full items-center gap-1.5 rounded-[4px] font-medium " +
        (size === "sm" ? "px-1.5 py-px text-[12px]" : "px-1.5 py-0.5 text-[12.5px]")
      }
      style={
        colour
          ? {
              color: `color-mix(in oklab, ${colour} 70%, var(--app-text))`,
              background: `color-mix(in oklab, ${colour} 13%, transparent)`,
            }
          : { color: "var(--app-text-muted)", background: "var(--app-accent-soft)" }
      }
    >
      <span className="truncate">{subject?.name ?? "No subject"}</span>
      {count !== undefined ? <span className="tabular-nums opacity-80">{count}</span> : null}
    </span>
  );
}

/** Mastered, still learning, not studied: the deck at a glance. */
export function MasteryBar({ deck, height = 6 }: { deck: Pick<Deck, "cardCount" | "newCount" | "masteredCount">; height?: number }) {
  const total = Math.max(1, deck.cardCount);
  const learning = deck.cardCount - deck.newCount - deck.masteredCount;
  return (
    <div
      className="flex w-full overflow-hidden rounded-[1px]"
      style={{ height, background: "var(--app-surface-soft)", boxShadow: "var(--elev-inset)" }}
      role="img"
      aria-label={`${deck.masteredCount} mastered, ${learning} still learning, ${deck.newCount} not studied`}
    >
      <span style={{ width: `${(deck.masteredCount / total) * 100}%`, background: "var(--app-success)" }} />
      <span style={{ width: `${(learning / total) * 100}%`, background: "var(--app-accent)" }} />
    </div>
  );
}

export function BackLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[13px] ui-hover"
      style={{ color: "var(--app-text-muted)" }}
    >
      <svg viewBox="0 0 20 20" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
        <path d="M12 5l-5 5 5 5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      {children}
    </Link>
  );
}

export function CardsIcon({ size = 16 }: { size?: number }) {
  return (
    <svg viewBox="0 0 20 20" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="6" width="11" height="10" rx="1.5" />
      <path d="M6 6V4.5A1.5 1.5 0 0 1 7.5 3h8A1.5 1.5 0 0 1 17 4.5v7a1.5 1.5 0 0 1-1.5 1.5H14" />
    </svg>
  );
}

export function PlusIcon() {
  return (
    <svg viewBox="0 0 20 20" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path d="M10 4v12M4 10h12" strokeLinecap="round" />
    </svg>
  );
}

/** Fisher-Yates, returning a new array. */
export function shuffled<T>(items: T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function Spinner() {
  return (
    <div className="grid min-h-[50svh] place-items-center">
      <div
        aria-label="Loading"
        className="h-6 w-6 animate-spin rounded-full border-2"
        style={{ borderColor: "var(--app-border)", borderTopColor: "var(--app-accent)" }}
      />
    </div>
  );
}

export function LoadError({ message, backHref, backLabel }: { message: string; backHref: string; backLabel: string }) {
  return (
    <div className="mx-auto flex max-w-[420px] flex-col items-center gap-4 px-6 py-20 text-center">
      <p className="text-[15px]" style={{ color: "var(--app-text)" }}>
        {message}
      </p>
      <Link href={backHref} className="text-[14px] underline" style={{ color: "var(--app-accent-strong)" }}>
        {backLabel}
      </Link>
    </div>
  );
}
