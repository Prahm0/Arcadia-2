"use client";
import { useId, useMemo } from "react";
import type { ConstellationDefinition } from "@/shared/constellations";
import { Dust, Figure, dustField, round, seeded, starSizes } from "./skyArt";
import styles from "./sky.module.css";

// The sky disc on a streak card: a small star chart, built in layers from the
// back — sky, Milky Way, nebulae, globe grid, background stars, the figure, a
// vignette and a lens glint — framed by an astrolabe rim.
const C = 200;
const R = 166;

const polar = (radius: number, degrees: number) => [round(C + radius * Math.sin((degrees * Math.PI) / 180)), round(C - radius * Math.cos((degrees * Math.PI) / 180))] as const;

function compose(definition: ConstellationDefinition) {
  const random = seeded(definition.id);
  const band = Math.round(random() * 180);
  const dust = dustField(random, { count: 96, cx: C, cy: C, spread: [R, R], band: 70, angle: band, inside: (x, y) => Math.hypot(x - C, y - C) < R - 2 });
  const glints = Array.from({ length: 3 }, () => polar(Math.sqrt(random()) * (R - 24), random() * 360));
  // Fit the figure inside the disc, centred on its own bounds.
  const px = definition.points.map(([x, y]) => [x * 5, y * 3.4]);
  const xs = px.map((p) => p[0]), ys = px.map((p) => p[1]);
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cy = (Math.min(...ys) + Math.max(...ys)) / 2;
  const reach = Math.max(1, ...px.map(([x, y]) => Math.hypot(x - cx, y - cy)));
  const scale = Math.min(126 / reach, 1.3);
  const points = px.map(([x, y]) => [round(C + (x - cx) * scale), round(C + (y - cy) * scale)] as const);
  let ticks = "";
  for (let deg = 0; deg < 360; deg += 5) {
    const [x1, y1] = polar(R + 11, deg);
    const [x2, y2] = polar(deg % 30 === 0 ? R + 19 : R + 14.5, deg);
    ticks += `M${x1} ${y1}L${x2} ${y2}`;
  }
  return {
    band, dust, glints, points, ticks,
    sizes: starSizes(definition),
    tilt: Math.round(random() * 36 - 18),
    warm: polar(40 + random() * 60, random() * 360),
    cool: polar(50 + random() * 70, random() * 360),
  };
}

export default function CardSky({ definition, lit, collected }: { definition: ConstellationDefinition; lit: (index: number) => boolean; collected: boolean }) {
  const sky = useMemo(() => compose(definition), [definition]);
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const id = (name: string) => `${name}${uid}`;
  const gold = definition.colour;
  const rim = collected ? 1 : .55;
  const [lx1, ly1] = polar(R - 5, 232), [lx2, ly2] = polar(R - 5, 318);
  const [bx1, by1] = polar(R - 6, 140), [bx2, by2] = polar(R - 6, 220);
  return (
    <svg viewBox="0 0 400 400" fill="none" aria-hidden="true">
      <defs>
        <clipPath id={id("disc")}><circle cx={C} cy={C} r={R} /></clipPath>
        <radialGradient id={id("sky")} cx="44%" cy="38%" r="70%">
          <stop offset="0" stopColor="#1c2739" /><stop offset=".55" stopColor="#0f141e" /><stop offset="1" stopColor="#06080c" />
        </radialGradient>
        <radialGradient id={id("band")}><stop offset="0" stopColor="#dfe6f5" stopOpacity=".16" /><stop offset=".5" stopColor="#c9d4ec" stopOpacity=".06" /><stop offset="1" stopColor="#c9d4ec" stopOpacity="0" /></radialGradient>
        <radialGradient id={id("warm")}><stop offset="0" stopColor={gold} stopOpacity=".26" /><stop offset="1" stopColor={gold} stopOpacity="0" /></radialGradient>
        <radialGradient id={id("cool")}><stop offset="0" stopColor="#6d8fe0" stopOpacity=".2" /><stop offset="1" stopColor="#6d8fe0" stopOpacity="0" /></radialGradient>
        <radialGradient id={id("vignette")}><stop offset=".62" stopColor="#000" stopOpacity="0" /><stop offset="1" stopColor="#000" stopOpacity=".7" /></radialGradient>
        <linearGradient id={id("rim")} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={gold} stopOpacity={.85 * rim} /><stop offset=".45" stopColor={gold} stopOpacity={.2 * rim} /><stop offset=".7" stopColor="#fff3dc" stopOpacity={.7 * rim} /><stop offset="1" stopColor={gold} stopOpacity={.3 * rim} />
        </linearGradient>
        <linearGradient id={id("dome")} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#fff" stopOpacity=".2" /><stop offset=".6" stopColor="#fff" stopOpacity=".04" /><stop offset="1" stopColor="#fff" stopOpacity="0" /></linearGradient>
        <linearGradient id={id("glint")} x1="0" y1="1" x2="1" y2="0"><stop offset="0" stopColor="#fff" stopOpacity="0" /><stop offset=".5" stopColor="#fff" stopOpacity=".22" /><stop offset="1" stopColor="#fff" stopOpacity="0" /></linearGradient>
      </defs>

      <g clipPath={`url(#${id("disc")})`}>
        <circle cx={C} cy={C} r={R} fill={`url(#${id("sky")})`} />
        <g transform={`rotate(${sky.band} ${C} ${C})`}>
          <ellipse cx={C} cy={C} rx={R * 1.5} ry={58} fill={`url(#${id("band")})`} />
          <ellipse cx={C} cy={C + 6} rx={R * 1.3} ry={20} fill={`url(#${id("band")})`} />
        </g>
        <circle cx={sky.warm[0]} cy={sky.warm[1]} r={110} fill={`url(#${id("warm")})`} />
        <circle cx={sky.cool[0]} cy={sky.cool[1]} r={90} fill={`url(#${id("cool")})`} />
        <g transform={`rotate(${sky.tilt} ${C} ${C})`} stroke="#dce5f4" strokeOpacity=".07" strokeWidth=".7">
          <ellipse cx={C} cy={C} rx={R * .38} ry={R} /><ellipse cx={C} cy={C} rx={R * .76} ry={R} />
          <path d={`M${C} ${C - R}V${C + R}M${C - R} ${C}H${C + R}M${C - R} ${C - 64}H${C + R}M${C - R} ${C + 64}H${C + R}M${C - R} ${C - 124}H${C + R}M${C - R} ${C + 124}H${C + R}`} strokeDasharray="1 5" />
        </g>
        <Dust paths={sky.dust} />
        {sky.glints.map(([x, y], i) => <path key={i} d={`M${x - 5} ${y}H${x + 5}M${x} ${y - 5}V${y + 5}`} stroke="#fff" strokeOpacity=".45" strokeWidth=".5" />)}
        <Figure definition={definition} points={sky.points} sizes={sky.sizes} lit={lit} />
        <circle cx={C} cy={C} r={R} fill={`url(#${id("vignette")})`} />
        <path d={`M${lx1} ${ly1}A${R - 5} ${R - 5} 0 0 1 ${lx2} ${ly2}`} stroke={`url(#${id("glint")})`} strokeWidth="2" strokeLinecap="round" />
        {/* The glass dome: a soft highlight up top and a thin rim light below, sliding against the tilt. */}
        <ellipse className={styles.dome} cx={C} cy={C - 78} rx={R * .74} ry={R * .42} fill={`url(#${id("dome")})`} />
        <path className={styles.domeLow} d={`M${bx1} ${by1}A${R - 6} ${R - 6} 0 0 1 ${bx2} ${by2}`} stroke="#fff4dc" strokeOpacity=".16" strokeWidth="1.4" strokeLinecap="round" />
      </g>

      <circle cx={C} cy={C} r={R + 1.5} stroke={`url(#${id("rim")})`} strokeWidth="1.6" />
      <circle cx={C} cy={C} r={R + 8} stroke={gold} strokeOpacity={.26 * rim} strokeWidth=".6" />
      <path d={sky.ticks} stroke={gold} strokeOpacity={.42 * rim} strokeWidth=".7" />
      <circle cx={C} cy={C} r={R + 23} stroke={gold} strokeOpacity={.18 * rim} strokeWidth=".5" strokeDasharray="1 3" />
      {/* North, east and west; south would crowd the divider under the disc. */}
      {[0, 90, 270].map((deg) => {
        const [x, y] = polar(R + 23, deg);
        return <path key={deg} d={`M${x} ${y - 4.5}L${x + 2.6} ${y}L${x} ${y + 4.5}L${x - 2.6} ${y}Z`} transform={`rotate(${deg} ${x} ${y})`} fill={gold} fillOpacity={.8 * rim} stroke="#07090d" strokeWidth="1.2" paintOrder="stroke" />;
      })}
    </svg>
  );
}
