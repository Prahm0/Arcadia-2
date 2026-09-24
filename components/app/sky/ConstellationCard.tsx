import { constellationById, type SkyCard } from "@/shared/constellations";
import ConstellationArtwork from "./ConstellationArtwork";
import styles from "./sky.module.css";
export function skyDate(timestamp: number) { return new Date(timestamp).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" }); }
export default function ConstellationCard({ card, preview = false, featured = false, following = false }: { card: SkyCard; preview?: boolean; featured?: boolean; following?: boolean }) {
  const definition = constellationById(card.id)!;
  const count = card.milestones.filter((star) => star.earnedAt !== null).length;
  return <article className={styles.card} data-preview={preview}>
    <div className={styles.cardTop}><span>{definition.family}</span><span style={{ color: definition.colour }}>{featured ? "Featured" : card.earnedAt && !card.seen ? "New ✦" : following && !card.earnedAt ? "Following" : "✦"}</span></div>
    <div className={styles.cardArtwork}><ConstellationArtwork definition={definition} card={card} preview={preview} /></div>
    <div className={styles.cardBottom}><h3 className={styles.cardName}>{definition.name}</h3><p className={styles.cardStory}>{definition.story}</p><p className={styles.cardDate}>{preview ? "Reward preview" : card.earnedAt ? `Formed ${skyDate(card.earnedAt)}` : `${count} of ${definition.points.length} stars lit`}</p></div>
  </article>;
}
