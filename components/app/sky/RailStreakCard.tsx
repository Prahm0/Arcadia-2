"use client";
import Link from "next/link";
import type { CSSProperties } from "react";
import { useStudySky } from "@/lib/app/StudySkyProvider";
import { constellationById, focusTime, type SkyCard } from "@/shared/constellations";
import CardSky from "./CardSky";
import styles from "./sky.module.css";

/**
 * The streak card in the Today rail: the one whose next star is closest, and
 * how many minutes of focus it takes. Minute-based cards only, so "next star
 * in 3 min" is always something one focus session can deliver.
 */
export default function RailStreakCard() {
  const { sky } = useStudySky();
  const target = sky ? closestCard(sky.cards, sky.preferences.followed) : null;
  if (!sky || !target) return null;
  const { card, next } = target;
  const definition = constellationById(card.id)!;
  const lit = (index: number) => card.milestones[index]?.earnedAt != null;
  const count = card.milestones.filter((star) => star.earnedAt !== null).length;
  const collected = sky.cards.filter((item) => item.earnedAt !== null).length;
  const toStar = Math.max(1, definition.thresholds[next] - card.value);
  const toCard = Math.max(1, definition.thresholds.at(-1)! - card.value);
  const last = count + 1 >= definition.points.length;

  return (
    <section className="border-t" style={{ borderColor: "var(--app-border)", "--sky-colour": definition.colour } as CSSProperties}>
      <Link href="/app/streaks#sky" className="ui-hover block px-5 py-4" aria-label={`${definition.name} streak card. Next star in ${focusTime(toStar)} of focus. See all cards`}>
        <span className="flex items-baseline justify-between gap-3">
          <span className="text-[12.5px] font-medium" style={{ color: "var(--app-text-muted)" }}>Streak card</span>
          <span className="text-[12.5px] tabular-nums" style={{ color: "var(--app-text-muted)" }}>{collected} collected</span>
        </span>
        <span className="mt-3 flex items-center gap-3.5">
          <span className={styles.railDisc} data-animated={sky.preferences.ambientMotion}>
            <CardSky definition={definition} lit={lit} collected small starScale={1.8} />
          </span>
          <span className="min-w-0 flex-1">
            <span className={styles.railName}>{definition.name}</span>
            <span className="mt-1 block text-[12.5px] leading-snug" style={{ color: "var(--app-text-muted)" }}>
              Next star in <span className="tabular-nums" style={{ color: "var(--app-text)" }}>{focusTime(toStar)}</span>
              {last ? ", then it's yours" : <>, card in {focusTime(toCard)}</>}
            </span>
          </span>
        </span>
        <span className={styles.railSegments} aria-hidden="true">
          {definition.points.map((_, index) => <i key={index} data-on={lit(index)} data-next={index === next} />)}
        </span>
      </Link>
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
