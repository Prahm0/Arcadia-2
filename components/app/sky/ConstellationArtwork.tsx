"use client";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { milestoneLabel, type ConstellationDefinition, type SkyCard } from "@/shared/constellations";
import styles from "./sky.module.css";

export default function ConstellationArtwork({ definition, card, preview = false, interactive = false, ambient = false, selected, onSelect }: {
  definition: ConstellationDefinition; card?: SkyCard; preview?: boolean; interactive?: boolean; ambient?: boolean; selected?: number; onSelect?: (index: number) => void;
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
  const lit = (index: number) => preview || card?.milestones[index]?.earnedAt != null;
  const point = (index: number) => [definition.points[index][0] * 5, definition.points[index][1] * 3.4];
  return <div ref={root} className={styles.stage} style={{ "--sky-colour": definition.colour } as CSSProperties} data-animated={ambient && visible}
    onPointerMove={(event) => {
      if (!ambient || event.pointerType !== "mouse") return;
      const rect = event.currentTarget.getBoundingClientRect();
      event.currentTarget.style.setProperty("--sky-x", `${((event.clientX - rect.left) / rect.width - .5) * 8}px`);
      event.currentTarget.style.setProperty("--sky-y", `${((event.clientY - rect.top) / rect.height - .5) * 8}px`);
    }} onPointerLeave={(event) => { event.currentTarget.style.setProperty("--sky-x", "0px"); event.currentTarget.style.setProperty("--sky-y", "0px"); }}>
    <div className={styles.nebula} aria-hidden="true" />
    <svg viewBox="0 0 500 340" fill="none" role={interactive ? undefined : "img"} aria-hidden={interactive || undefined} aria-label={interactive ? undefined : `${definition.name}, ${preview ? "reward preview" : `${card?.milestones.filter((star) => star.earnedAt !== null).length || 0} of ${definition.points.length} stars lit`}`}>
      <g className={styles.dust} fill="#dce5f4" aria-hidden="true">{Array.from({ length: 48 }, (_, i) => <circle key={i} cx={(i * 137.37 + 17) % 500} cy={(i * 83.71 + 23) % 340} r={i % 7 === 0 ? 1 : .6} opacity={.2 + (i % 4) * .13} />)}</g>
      {definition.edges.map(([from, to]) => {
        const [x1, y1] = point(from); const [x2, y2] = point(to); const on = lit(from) && lit(to);
        return <line key={`${from}-${to}`} className={styles.line} x1={x1} y1={y1} x2={x2} y2={y2} stroke={definition.colour} strokeWidth="1" strokeOpacity={on ? .65 : .18} strokeDasharray={on ? undefined : "2 6"} />;
      })}
      {definition.points.map((_, index) => {
        const [x, y] = point(index); const on = lit(index);
        return <g key={index}>
          {on && <><circle cx={x} cy={y} r="20" fill={definition.colour} opacity=".025" /><circle cx={x} cy={y} r="12" fill={definition.colour} opacity=".045" /><circle cx={x} cy={y} r="7" fill={definition.colour} opacity=".12" /></>}
          <circle className={styles.star} cx={x} cy={y} r={on ? 2.5 : 2.8} fill={on ? "#fff8ea" : "#0c1017"} stroke={definition.colour} strokeWidth="1" opacity={on ? 1 : .65} />
          {on && index === 0 && <path d={`M${x} ${y - 10}Q${x + 1.7} ${y - 1.7} ${x + 10} ${y}Q${x + 1.7} ${y + 1.7} ${x} ${y + 10}Q${x - 1.7} ${y + 1.7} ${x - 10} ${y}Q${x - 1.7} ${y - 1.7} ${x} ${y - 10}Z`} fill="#fff8ea" />}
        </g>;
      })}
    </svg>
    {interactive && definition.points.map(([x, y], index) => <button key={index} type="button" className={styles.hit} style={{ left: `${x}%`, top: `${y}%` }} aria-label={`${milestoneLabel(definition, index)} — ${lit(index) ? "lit" : "still forming"}`} aria-pressed={selected === index} onClick={() => onSelect?.(index)} onFocus={() => onSelect?.(index)} />)}
  </div>;
}
