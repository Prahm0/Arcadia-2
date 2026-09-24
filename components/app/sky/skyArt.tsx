"use client";
import { useId } from "react";
import type { ConstellationDefinition } from "@/shared/constellations";
import styles from "./sky.module.css";

// Shared drawing pieces for the card disc (CardSky) and the large panel
// (ConstellationArtwork), so a figure looks the same wherever it appears.

export const STAR_WHITE = "#fff8ea";

/** Stable per-constellation randomness, so a card's sky never reshuffles. */
export function seeded(text: string) {
  let a = 2166136261;
  for (const ch of text) a = Math.imul(a ^ ch.charCodeAt(0), 16777619);
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Rounded so the server and the browser print identical coordinates. */
export const round = (n: number) => Math.round(n * 100) / 100;

/** A filled circle as a path segment, so hundreds of dust stars cost a few elements. */
export const dot = (x: number, y: number, r: number) => `M${(x - r).toFixed(1)} ${y.toFixed(1)}a${r} ${r} 0 1 0 ${r * 2} 0a${r} ${r} 0 1 0 ${-r * 2} 0`;

/** Brighter stars are drawn bigger; the five original cards have no magnitudes. */
export function starSizes(definition: ConstellationDefinition, scale = 1) {
  return definition.points.map((_, i) => round((definition.mags ? Math.min(4.6, Math.max(1.8, 3.9 - .5 * definition.mags[i])) : 3) * scale));
}

/**
 * Background stars scattered over an area, a share of them packed into a
 * Milky Way band through (cx, cy) at `angle`. Returns three paths, faint to bright.
 */
export function dustField(random: () => number, { count, cx, cy, spread, band, angle, inside }: {
  count: number; cx: number; cy: number; spread: [number, number]; band: number; angle: number; inside: (x: number, y: number) => boolean;
}) {
  const paths = ["", "", ""];
  const rad = (angle * Math.PI) / 180;
  for (let i = 0; i < count; i++) {
    const along = (random() - .5) * 2 * spread[0];
    const across = i < count * .42 ? (random() - .5) * band : (random() - .5) * 2 * spread[1];
    const x = cx + along * Math.cos(rad) - across * Math.sin(rad);
    const y = cy + along * Math.sin(rad) + across * Math.cos(rad);
    const tier = random();
    if (!inside(x, y)) continue;
    const level = tier < .66 ? 0 : tier < .93 ? 1 : 2;
    paths[level] += dot(x, y, [.55, .85, 1.25][level]);
  }
  return paths;
}

export function Dust({ paths, className }: { paths: string[]; className?: string }) {
  return <g className={className}>
    <path d={paths[0]} fill="#dce5f4" opacity=".32" />
    <path d={paths[1]} fill="#eef2fb" opacity=".6" />
    <path d={paths[2]} fill="#fff4e2" opacity=".9" />
  </g>;
}

/**
 * The constellation: glowing lines between lit stars, dotted guides to the
 * ones still forming, rays on the brightest, and a sparkle on the lead star.
 */
export function Figure({ definition, points, sizes, lit }: {
  definition: ConstellationDefinition; points: readonly (readonly [number, number])[]; sizes: number[]; lit: (index: number) => boolean;
}) {
  const glow = `glow${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const gold = definition.colour;
  return <g>
    <defs>
      <radialGradient id={glow}><stop offset="0" stopColor={STAR_WHITE} stopOpacity=".9" /><stop offset=".22" stopColor={gold} stopOpacity=".38" /><stop offset="1" stopColor={gold} stopOpacity="0" /></radialGradient>
    </defs>
    {definition.edges.map(([from, to]) => {
      const [x1, y1] = points[from], [x2, y2] = points[to];
      return lit(from) && lit(to)
        ? <g key={`${from}-${to}`}><line x1={x1} y1={y1} x2={x2} y2={y2} stroke={gold} strokeWidth="5" strokeOpacity=".07" strokeLinecap="round" /><line className={styles.line} x1={x1} y1={y1} x2={x2} y2={y2} stroke={gold} strokeWidth="1.1" strokeOpacity=".75" /></g>
        : <line key={`${from}-${to}`} className={styles.line} x1={x1} y1={y1} x2={x2} y2={y2} stroke={gold} strokeWidth=".9" strokeOpacity=".28" strokeDasharray="1.5 6" strokeLinecap="round" />;
    })}
    {points.map(([x, y], index) => {
      const r = sizes[index];
      if (!lit(index)) return <g key={index}><circle className={styles.star} cx={x} cy={y} r={r + .6} fill="#0a0e15" stroke={gold} strokeWidth=".9" strokeOpacity=".55" /><circle cx={x} cy={y} r=".7" fill={gold} opacity=".4" /></g>;
      const bright = index === 0 || (definition.mags?.[index] ?? 9) < 1.6;
      const s = r * 5.2;
      return <g key={index}>
        <circle cx={x} cy={y} r={r * 7} fill={`url(#${glow})`} opacity=".55" />
        {bright && <path d={`M${x - r * 6.5} ${y}H${x + r * 6.5}M${x} ${y - r * 6.5}V${y + r * 6.5}`} stroke={STAR_WHITE} strokeOpacity=".5" strokeWidth=".6" />}
        {bright && <path d={`M${x - r * 2.6} ${y - r * 2.6}L${x + r * 2.6} ${y + r * 2.6}M${x - r * 2.6} ${y + r * 2.6}L${x + r * 2.6} ${y - r * 2.6}`} stroke={STAR_WHITE} strokeOpacity=".25" strokeWidth=".5" />}
        {index === 0 && <>
          <circle cx={x} cy={y} r={r * 3.2} stroke={gold} strokeOpacity=".45" strokeWidth=".6" />
          <path d={`M${x} ${y - s}Q${x + s * .15} ${y - s * .15} ${x + s} ${y}Q${x + s * .15} ${y + s * .15} ${x} ${y + s}Q${x - s * .15} ${y + s * .15} ${x - s} ${y}Q${x - s * .15} ${y - s * .15} ${x} ${y - s}Z`} fill={STAR_WHITE} />
        </>}
        <circle className={styles.star} cx={x} cy={y} r={r} fill={STAR_WHITE} />
      </g>;
    })}
  </g>;
}
