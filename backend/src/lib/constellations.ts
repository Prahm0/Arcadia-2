import { eq } from "drizzle-orm";
import { schema, type Database } from "../db";
import { evaluateSky, type StudySkyResponse, type ConstellationId } from "../../../shared/constellations";

/** Idempotent reconciliation also repairs interrupted session writes on the next read. */
export async function readStudySky(database: Database, userId: string): Promise<StudySkyResponse> {
  await database.insert(schema.constellationPreferences).values({ userId }).onConflictDoNothing();
  const [preferences] = await database.select().from(schema.constellationPreferences).where(eq(schema.constellationPreferences.userId, userId));
  const [profile] = await database.select({ timezone: schema.profiles.timezone }).from(schema.profiles).where(eq(schema.profiles.userId, userId));
  const sessions = await database.select().from(schema.studySessions).where(eq(schema.studySessions.userId, userId));
  const subjects = await database.select({ id: schema.subjects.id, name: schema.subjects.name }).from(schema.subjects).where(eq(schema.subjects.userId, userId));
  for (const session of sessions) {
    if (session.subjectKey || !session.subject) continue;
    const subject = subjects.find((item) => item.name.toLocaleLowerCase("en-AU") === session.subject!.trim().toLocaleLowerCase("en-AU"));
    if (subject) session.subjectKey = `subject:${subject.id}`;
  }
  const cards = evaluateSky(sessions, profile?.timezone || "Australia/Sydney", preferences.legacyEligible);
  // Unique keys make concurrent reconcilers harmless. Each insert is durable;
  // a failed request is replayable from the persisted source sessions.
  const previous = await database.select().from(schema.constellationMilestones).where(eq(schema.constellationMilestones.userId, userId));
  for (const card of cards) {
    for (const star of card.milestones) {
      const saved = previous.find((row) => row.constellationId === card.id && row.starIndex === star.index);
      if (saved) star.earnedAt = saved.earnedAt;
      else if (star.earnedAt !== null) {
        await database.insert(schema.constellationMilestones).values({ userId, constellationId: card.id, starIndex: star.index, earnedAt: star.earnedAt }).onConflictDoNothing();
      }
    }
    if (card.milestones.every((star) => star.earnedAt !== null)) {
      await database.insert(schema.constellationCards).values({ userId, constellationId: card.id, earnedAt: Math.max(...card.milestones.map((star) => star.earnedAt!)), addedAt: Date.now() }).onConflictDoNothing();
    }
  }
  // A second request may have inserted milestones while this one was reconciling.
  // Read the final persisted state so both requests return the same earned stars.
  const [earned, owned] = await Promise.all([
    database.select().from(schema.constellationMilestones).where(eq(schema.constellationMilestones.userId, userId)),
    database.select().from(schema.constellationCards).where(eq(schema.constellationCards.userId, userId)),
  ]);
  for (const card of cards) {
    for (const star of card.milestones) {
      const savedStar = earned.find((row) => row.constellationId === card.id && row.starIndex === star.index);
      if (savedStar) star.earnedAt = savedStar.earnedAt;
    }
    const saved = owned.find((row) => row.constellationId === card.id);
    card.earnedAt = saved?.earnedAt ?? null;
    card.addedAt = saved?.addedAt ?? null;
    card.seen = saved?.seenAt != null;
  }
  return { cards, preferences: {
    followed: preferences.followed as ConstellationId,
    featured: preferences.featured as ConstellationId | null,
    backdrop: preferences.backdrop as ConstellationId | null,
    showcase: JSON.parse(preferences.showcase), favourites: JSON.parse(preferences.favourites), ambientMotion: preferences.ambientMotion,
  } };
}
