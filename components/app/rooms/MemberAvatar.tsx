"use client";

import { useMemo } from "react";
import { constellationById } from "@/shared/constellations";
import { Avatar } from "../profile/ui";

/** Green that reads as "live" on both themes. */
export const LIVE = "var(--app-success)";

/**
 * A member's face in the room. While they focus, a thin ring fills with the
 * session's progress and a soft halo breathes behind it, so a glance across
 * the room shows who is on the clock and how far in.
 */
export function MemberAvatar({
  name,
  colour,
  developer = false,
  size = 40,
  focusing = false,
  onBreak = false,
  progress = null,
}: {
  name: string;
  colour?: string | null;
  developer?: boolean;
  size?: number;
  focusing?: boolean;
  onBreak?: boolean;
  /** 0–1 through the current session, when it has an end. */
  progress?: number | null;
}) {
  const ring = size + 8;
  const radius = ring / 2 - 1.5;
  const circumference = 2 * Math.PI * radius;
  const live = focusing || onBreak;
  const tone = focusing ? LIVE : "var(--app-text-faint)";
  return (
    <span className="relative grid shrink-0 place-items-center" style={{ width: ring, height: ring }}>
      {focusing ? (
        <span
          aria-hidden="true"
          className="app-breathe absolute inset-0 rounded-full"
          style={{ boxShadow: `0 0 ${Math.round(size / 3)}px 1px color-mix(in oklab, ${LIVE} 45%, transparent)` }}
        />
      ) : null}
      {live ? (
        <svg aria-hidden="true" className="absolute inset-0 -rotate-90" width={ring} height={ring} viewBox={`0 0 ${ring} ${ring}`}>
          <circle cx={ring / 2} cy={ring / 2} r={radius} fill="none" stroke={`color-mix(in oklab, ${tone} 22%, transparent)`} strokeWidth="1.5" />
          <circle
            cx={ring / 2}
            cy={ring / 2}
            r={radius}
            fill="none"
            stroke={tone}
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={circumference * (1 - Math.min(1, Math.max(0.02, progress ?? 1)))}
            style={{ transition: "stroke-dashoffset 900ms linear" }}
          />
        </svg>
      ) : null}
      <span style={{ opacity: live ? 1 : 0.9 }}>
        <Avatar name={name} colour={colour} size={size} developer={developer} />
      </span>
    </span>
  );
}

/**
 * The streak card a member shows off, drawn as a tiny figure in the theme's
 * gold (STREAK_GOLD is for the night sky; this sits on a card). It sits a
 * little brighter while they're studying, since that's when it grows.
 */
export function ConstellationMark({ id, cards, live = false, size = 44 }: { id: string; cards?: number; live?: boolean; size?: number }) {
  const definition = constellationById(id);
  const figure = useMemo(() => {
    if (!definition) return null;
    const xs = definition.points.map(([x]) => x);
    const ys = definition.points.map(([, y]) => y);
    const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
    const span = Math.max(maxX - minX, maxY - minY, 1);
    const pad = 12;
    const scale = (100 - pad * 2) / span;
    const offX = pad + ((100 - pad * 2) - (maxX - minX) * scale) / 2;
    const offY = pad + ((100 - pad * 2) - (maxY - minY) * scale) / 2;
    const round = (n: number) => Math.round(n * 100) / 100;
    return definition.points.map(([x, y]) => [round(offX + (x - minX) * scale), round(offY + (y - minY) * scale)] as const);
  }, [definition]);
  if (!definition || !figure) return null;
  return (
    <span
      className="inline-grid shrink-0"
      title={`${definition.name}${cards ? ` · ${cards} streak ${cards === 1 ? "card" : "cards"}` : ""}`}
      aria-label={`Streak card: ${definition.name}`}
      role="img"
    >
      <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden="true" style={{ opacity: live ? 1 : 0.55, transition: "opacity 600ms ease" }}>
        {definition.edges.map(([from, to]) => (
          <line key={`${from}-${to}`} x1={figure[from][0]} y1={figure[from][1]} x2={figure[to][0]} y2={figure[to][1]} stroke="var(--app-gold)" strokeOpacity=".55" strokeWidth="1.6" strokeLinecap="round" />
        ))}
        {figure.map(([x, y], index) => (
          <circle key={index} cx={x} cy={y} r={index === 0 ? 3.6 : 2.4} fill="var(--app-gold)" />
        ))}
      </svg>
    </span>
  );
}

/** Overlapping faces, focusing people ringed in green. */
export function AvatarStack({
  people,
  size = 22,
  max = 3,
}: {
  people: Array<{ userId: string; displayName: string; avatarColour?: string | null; activity?: string }>;
  size?: number;
  max?: number;
}) {
  const extra = people.length - max;
  return (
    <span className="flex items-center" style={{ paddingLeft: Math.round(size * 0.3) }}>
      {people.slice(0, max).map((person) => (
        <span
          key={person.userId}
          className="rounded-full"
          style={{
            marginLeft: -Math.round(size * 0.3),
            boxShadow: person.activity === "focus" ? `0 0 0 1.5px var(--app-surface), 0 0 0 3px ${LIVE}` : "0 0 0 2px var(--app-surface)",
          }}
          title={person.displayName}
        >
          <Avatar name={person.displayName} colour={person.avatarColour} size={size} />
        </span>
      ))}
      {extra > 0 ? (
        <span
          className="grid place-items-center rounded-full text-[11px] font-semibold tabular-nums"
          style={{ width: size, height: size, marginLeft: -Math.round(size * 0.3), background: "var(--app-surface-soft)", color: "var(--app-text-muted)", boxShadow: "0 0 0 2px var(--app-surface)" }}
        >
          +{extra}
        </span>
      ) : null}
    </span>
  );
}
