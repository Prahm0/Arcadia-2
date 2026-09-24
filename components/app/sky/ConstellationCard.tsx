"use client";
import type { CSSProperties } from "react";
import { constellationById, type SkyCard } from "@/shared/constellations";
import CardSky from "./CardSky";
import styles from "./sky.module.css";

export function skyDate(timestamp: number) { return new Date(timestamp).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" }); }

const HEMISPHERE = { Northern: "Northern sky", Southern: "Southern sky", Equator: "On the equator" } as const;

export default function ConstellationCard({ card, preview = false, featured = false, following = false }: { card: SkyCard; preview?: boolean; featured?: boolean; following?: boolean }) {
  const definition = constellationById(card.id)!;
  const total = definition.points.length;
  const lit = (index: number) => preview || card.milestones[index]?.earnedAt != null;
  const count = card.milestones.filter((star) => star.earnedAt !== null).length;
  const collected = !preview && card.earnedAt !== null;
  const status = featured ? "Featured" : collected && !card.seen ? "New ✦" : following && !card.earnedAt ? "Following" : definition.atlas ? `Nº ${String(definition.atlas.order + 1).padStart(2, "0")}` : "✦";
  const detail = definition.atlas ? `${definition.atlas.brightest} · ${HEMISPHERE[definition.atlas.hemisphere]}` : `${total} stars · Arcadia original`;
  return (
    <article
      className={styles.card}
      data-preview={preview}
      data-collected={collected}
      style={{ "--sky-colour": definition.colour } as CSSProperties}
      // Collected cards catch the light: a slight tilt and a foil sheen that follow the pointer.
      onPointerMove={(event) => {
        if (event.pointerType !== "mouse") return;
        const rect = event.currentTarget.getBoundingClientRect();
        const x = (event.clientX - rect.left) / rect.width, y = (event.clientY - rect.top) / rect.height;
        event.currentTarget.style.setProperty("--ry", `${(x - .5) * 7}deg`);
        event.currentTarget.style.setProperty("--rx", `${(.5 - y) * 7}deg`);
        event.currentTarget.style.setProperty("--foil", `${x * 100}%`);
      }}
      onPointerLeave={(event) => { for (const name of ["--rx", "--ry", "--foil"]) event.currentTarget.style.removeProperty(name); }}
    >
      <div className={styles.cardBackdrop} aria-hidden="true">
        {(["tl", "tr", "bl", "br"] as const).map((corner) => (
          <svg key={corner} className={styles.corner} data-corner={corner} viewBox="0 0 18 18" fill="none">
            <path d="M1 12V1h11" stroke="currentColor" strokeWidth=".8" />
            <path d="M4 7V4h3" stroke="currentColor" strokeWidth=".6" strokeOpacity=".6" />
            <path d="M1-1.4L3.4 1 1 3.4-1.4 1Z" fill="currentColor" />
          </svg>
        ))}
        <span className={styles.notch} data-edge="top" /><span className={styles.notch} data-edge="bottom" />
      </div>

      <div className={styles.cardTop}><span className="truncate">{definition.family}</span><span className="shrink-0 tabular-nums" style={{ color: definition.colour }}>{status}</span></div>
      <div className={styles.cardArtwork}>
        <CardSky definition={definition} lit={lit} collected={collected || preview} />
      </div>
      <div className={styles.cardBottom}>
        <div className={styles.rule} aria-hidden="true"><span>✦</span></div>
        <h3 className={styles.cardName}>{definition.name}</h3>
        <p className={styles.cardStory}>{definition.story}</p>
        <p className={styles.cardDetail}>{detail}</p>
        {preview ? (
          <p className={styles.cardDate}>Reward preview</p>
        ) : collected ? (
          <p className={styles.cardDate}>✦ Formed {skyDate(card.earnedAt!)}</p>
        ) : (
          <div className={styles.progress} aria-label={`${count} of ${total} stars lit`}>
            <span className={styles.segments} aria-hidden="true">{definition.points.map((_, index) => <i key={index} data-on={lit(index)} />)}</span>
            <span className="tabular-nums">{count}/{total}</span>
          </div>
        )}
      </div>
    </article>
  );
}
