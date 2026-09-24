"use client";
import { useEffect, useId, useMemo, useRef, useState, type CSSProperties } from "react";
import { milestoneLabel, type ConstellationDefinition, type SkyCard } from "@/shared/constellations";
import { Dust, Figure, dustField, round, seeded, starSizes } from "./skyArt";
import styles from "./sky.module.css";

const W = 500, H = 340;

// The large view of a constellation, drawn like a plate from a star atlas:
// Milky Way, nebulae, a curved coordinate grid and background stars behind
// the figure, inside a ruled frame with a compass and a catalogue label.
function compose(definition: ConstellationDefinition) {
  const random = seeded(`${definition.id}:plate`);
  const band = Math.round(random() * 50 - 25);
  const dust = dustField(random, { count: 190, cx: W / 2, cy: H / 2 + (random() - .5) * 80, spread: [W * .75, H * .75], band: 96, angle: band, inside: (x, y) => x > 14 && x < W - 14 && y > 14 && y < H - 14 });
  const glints = Array.from({ length: 4 }, () => [round(30 + random() * (W - 60)), round(30 + random() * (H - 60))] as const);
  // Parallels bow gently around a far-off pole; meridians converge toward it.
  const pole = 1500;
  const parallels = [40, 110, 180, 250, 320].map((y) => `M-40 ${y}A${pole - y} ${pole - y} 0 0 1 ${W + 40} ${y}`).join("");
  const meridians = [-150, -50, 50, 150, 250, 350, 450, 550, 650].map((x) => `M${round(W / 2 + (x - W / 2) * (pole / (pole + H)))} 0L${x} ${H}`).join("");
  let ruler = "";
  for (let x = 20; x <= W - 20; x += 8) {
    const long = (x - 20) % 40 === 0 ? 5 : 2.5;
    ruler += `M${x} 12v${long}M${x} ${H - 12}v${-long}`;
  }
  for (let y = 20; y <= H - 20; y += 8) {
    const long = (y - 20) % 40 === 0 ? 5 : 2.5;
    ruler += `M12 ${y}h${long}M${W - 12} ${y}h${-long}`;
  }
  return {
    band, dust, glints, parallels, meridians, ruler,
    tilt: Math.round(random() * 10 - 5),
    points: definition.points.map(([x, y]) => [round(x * 5), round(y * 3.4)] as const),
    sizes: starSizes(definition, .85),
  };
}

const CORNERS = [[12, 12, 0], [W - 12, 12, 90], [W - 12, H - 12, 180], [12, H - 12, 270]] as const;

export default function ConstellationArtwork({ definition, card, preview = false, interactive = false, ambient = false, selected, onSelect, frame = true }: {
  definition: ConstellationDefinition; card?: SkyCard; preview?: boolean; interactive?: boolean; ambient?: boolean; selected?: number; onSelect?: (index: number) => void;
  /** The ruled atlas frame; off where the art is cropped, like the profile banner. */
  frame?: boolean;
}) {
  const root = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!ambient || !root.current) return;
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting && document.visibilityState === "visible"));
    observer.observe(root.current);
    const visibility = () => setVisible(document.visibilityState === "visible" && !!root.current && root.current.getBoundingClientRect().bottom > 0 && root.current.getBoundingClientRect().top < innerHeight);
    document.addEventListener("visibilitychange", visibility);
    return () => { observer.disconnect(); document.removeEventListener("visibilitychange", visibility); };
  }, [ambient]);
  const plate = useMemo(() => compose(definition), [definition]);
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const id = (name: string) => `${name}${uid}`;
  const gold = definition.colour;
  const lit = (index: number) => preview || card?.milestones[index]?.earnedAt != null;
  const label = definition.atlas ? `${definition.atlas.abbr.toUpperCase()} · J2000` : "ARCADIA · ORIGINAL";
  return <div ref={root} className={styles.stage} style={{ "--sky-colour": gold } as CSSProperties} data-animated={ambient && visible}
    onPointerMove={(event) => {
      if (!ambient || event.pointerType !== "mouse") return;
      const rect = event.currentTarget.getBoundingClientRect();
      event.currentTarget.style.setProperty("--sky-x", `${((event.clientX - rect.left) / rect.width - .5) * 8}px`);
      event.currentTarget.style.setProperty("--sky-y", `${((event.clientY - rect.top) / rect.height - .5) * 8}px`);
    }} onPointerLeave={(event) => { event.currentTarget.style.setProperty("--sky-x", "0px"); event.currentTarget.style.setProperty("--sky-y", "0px"); }}>
    <div className={styles.nebula} aria-hidden="true" />
    <svg viewBox={`0 0 ${W} ${H}`} fill="none" role={interactive ? undefined : "img"} aria-hidden={interactive || undefined} aria-label={interactive ? undefined : `${definition.name}, ${preview ? "reward preview" : `${card?.milestones.filter((star) => star.earnedAt !== null).length || 0} of ${definition.points.length} stars lit`}`}>
      <defs>
        <radialGradient id={id("band")}><stop offset="0" stopColor="#dfe6f5" stopOpacity=".14" /><stop offset=".5" stopColor="#c9d4ec" stopOpacity=".05" /><stop offset="1" stopColor="#c9d4ec" stopOpacity="0" /></radialGradient>
        <radialGradient id={id("vignette")} cx="50%" cy="50%" r="72%"><stop offset=".55" stopColor="#0c1017" stopOpacity="0" /><stop offset="1" stopColor="#0c1017" stopOpacity=".9" /></radialGradient>
      </defs>
      <g aria-hidden="true">
        <g transform={`rotate(${plate.band} ${W / 2} ${H / 2})`}>
          <ellipse cx={W / 2} cy={H / 2} rx={W * .9} ry={78} fill={`url(#${id("band")})`} />
          <ellipse cx={W / 2} cy={H / 2 + 8} rx={W * .75} ry={26} fill={`url(#${id("band")})`} />
        </g>
        <g transform={`rotate(${plate.tilt} ${W / 2} ${H / 2})`} stroke="#dce5f4" strokeWidth=".7">
          <path d={plate.parallels} strokeOpacity=".06" />
          <path d={plate.meridians} strokeOpacity=".05" strokeDasharray="1 5" />
        </g>
        <Dust paths={plate.dust} className={styles.dust} />
        {plate.glints.map(([x, y], i) => <path key={i} d={`M${x - 5} ${y}H${x + 5}M${x} ${y - 5}V${y + 5}`} stroke="#fff" strokeOpacity=".4" strokeWidth=".5" />)}
      </g>
      <Figure definition={definition} points={plate.points} sizes={plate.sizes} lit={lit} />
      <rect width={W} height={H} fill={`url(#${id("vignette")})`} aria-hidden="true" />
      {frame && <g aria-hidden="true">
        <rect x="12" y="12" width={W - 24} height={H - 24} stroke={gold} strokeOpacity=".2" strokeWidth=".7" />
        <rect x="17" y="17" width={W - 34} height={H - 34} stroke="#fff" strokeOpacity=".04" strokeWidth=".6" />
        <path d={plate.ruler} stroke={gold} strokeOpacity=".28" strokeWidth=".6" />
        {CORNERS.map(([x, y, turn]) => <g key={turn} transform={`translate(${x} ${y}) rotate(${turn})`}>
          <path d="M0 16V0h16" stroke={gold} strokeOpacity=".7" strokeWidth="1" />
          <path d="M0-3.2L3.2 0 0 3.2-3.2 0Z" fill={gold} />
        </g>)}
        {/* Sky charts face up at the sky, so east sits to the left of north. */}
        <g transform={`translate(34 ${H - 34})`} stroke={gold} strokeOpacity=".5" strokeWidth=".7" fill={gold} fillOpacity=".6" fontFamily="var(--font-jetbrains), ui-monospace, monospace" fontSize="6.5" letterSpacing="1">
          <path d="M0 0V-14M0 0H-14" /><path d="M0-17l-2 4h4Z" stroke="none" /><text x="3" y="-15" stroke="none">N</text><text x="-15" y="-3" stroke="none">E</text>
        </g>
        <text x={W - 34} y={H - 26} textAnchor="end" fill={gold} fillOpacity=".45" fontFamily="var(--font-jetbrains), ui-monospace, monospace" fontSize="7" letterSpacing="1.6">{label}</text>
      </g>}
    </svg>
    {interactive && definition.points.map(([x, y], index) => <button key={index} type="button" className={styles.hit} style={{ left: `${x}%`, top: `${y}%` }} aria-label={`${milestoneLabel(definition, index)} — ${lit(index) ? "lit" : "still forming"}`} aria-pressed={selected === index} onClick={() => onSelect?.(index)} onFocus={() => onSelect?.(index)} />)}
  </div>;
}
