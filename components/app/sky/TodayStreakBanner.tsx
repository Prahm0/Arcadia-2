"use client";
import Link from "next/link";
import type { CSSProperties } from "react";
import { useStudySky } from "@/lib/app/StudySkyProvider";
import { constellationById, focusTime, type SkyCard } from "@/shared/constellations";
import { appButtonClass } from "../AppButton";
import CardSky from "./CardSky";
import { useCardLight } from "./useCardLight";
import styles from "./sky.module.css";

/**
 * A small nudge on Today: the streak card whose next star is closest, and how
 * many minutes of focus it takes. Minute-based cards only, so "next star in
 * 3 min" is always something one focus session can deliver.
 */
export default function TodayStreakBanner() {
  const { sky } = useStudySky();
  const light = useCardLight<HTMLElement>(false, sky?.preferences.ambientMotion ?? false, false);
  const target = sky ? closestCard(sky.cards, sky.preferences.followed) : null;
  if (!sky || !target) return null;
  const { card, next } = target;
  const definition = constellationById(card.id)!;
  const lit = (index: number) => card.milestones[index]?.earnedAt != null;
  const count = card.milestones.filter((star) => star.earnedAt !== null).length;
  const collected = sky.cards.filter((item) => item.earnedAt !== null).length;
  const toStar = Math.max(1, definition.thresholds[next] - card.value);
  const toCard = Math.max(1, definition.thresholds.at(-1)! - card.value);
  return (
    <section ref={light} className={`${styles.mini} mb-8`} aria-label="Your next streak card" style={{ "--sky-colour": definition.colour } as CSSProperties}>
      <div className={styles.miniDisc}>
        <CardSky definition={definition} lit={lit} collected starScale={2.4} />
      </div>
      <div className="min-w-0 flex-1">
        <p className={styles.miniEyebrow}>
          Streak card{definition.atlas ? ` · Nº ${String(definition.atlas.order + 1).padStart(2, "0")}` : ""} · {collected} collected
        </p>
        <p className={styles.miniName}>{definition.name}</p>
        <p className={styles.miniLine}>
          Next star in <strong>{focusTime(toStar)}</strong> of focus{count + 1 < definition.points.length ? `, card forms in ${focusTime(toCard)}` : ", and the card is yours"}.
        </p>
        <span className={styles.segments} aria-label={`${count} of ${definition.points.length} stars lit`}>
          {definition.points.map((_, index) => <i key={index} data-on={lit(index)} data-next={index === next} />)}
        </span>
      </div>
      <div className={styles.miniActions}>
        <Link href="/app/focus" className={appButtonClass("primary")}>Start focus</Link>
        <Link href="/app/streaks#sky" className={styles.miniLink}>All cards →</Link>
      </div>
      <div className={styles.gloss} aria-hidden="true"><span className={styles.sweep} /></div>
    </section>
  );
}

/** The unfinished minute-based card with the fewest minutes to its next star; the followed card wins ties. */
function closestCard(cards: SkyCard[], followed: string) {
  let best: { card: SkyCard; next: number; minutes: number } | null = null;
  for (const card of cards) {
    const definition = constellationById(card.id);
    if (!definition || definition.metric !== "minutes" || card.earnedAt !== null) continue;
    const next = card.milestones.findIndex((star) => star.earnedAt === null);
    if (next < 0) continue;
    const minutes = definition.thresholds[next] - card.value;
    if (!best || minutes < best.minutes || (minutes === best.minutes && card.id === followed)) best = { card, next, minutes };
  }
  return best;
}
