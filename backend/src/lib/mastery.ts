/**
 * Mastery from the database: gathers each dot point's evidence (tagged work,
 * check-in ratings, marks) and scores it with shared/mastery.ts. Scores are
 * computed on read so decay is always current; the mastery table caches the
 * last result and holds the student's snoozes.
 */
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { schema, type Database } from "../db";
import { computeMastery, rankPriorities, type Mastery, type Priority, type ResultEvidence, type TagEvidence } from "../../../shared/mastery.ts";
import type { PointRef } from "./work-tagging";

export type PointRow = typeof schema.syllabusPoints.$inferSelect;

export async function syllabusPoints(database: Database, syllabus: string): Promise<PointRow[]> {
  return database
    .select()
    .from(schema.syllabusPoints)
    .where(eq(schema.syllabusPoints.syllabus, syllabus))
    .orderBy(asc(schema.syllabusPoints.position));
}

export function pointRefs(points: PointRow[]): PointRef[] {
  return points.map((point) => ({
    id: point.id,
    unit: point.unit,
    topicTitle: point.topicTitle,
    subtopic: point.subtopic,
    text: point.text,
  }));
}

/** Tags that count: everything the student didn't remove. */
const LIVE_STATES = ["ai", "confirmed", "added"];

export interface PointMastery {
  point: PointRow;
  mastery: Mastery;
  snoozedUntil: number | null;
  coveredElsewhere: boolean;
}

/** Every dot point in the subject's syllabus with its current mastery. */
export async function subjectMastery(
  database: Database,
  userId: string,
  subjectId: string,
  syllabus: string,
  now = Date.now(),
): Promise<PointMastery[]> {
  const [points, tagRows, resultRows, cached] = await Promise.all([
    syllabusPoints(database, syllabus),
    database
      .select({
        pointId: schema.workTags.pointId,
        quality: schema.workTags.quality,
        confidence: schema.workTags.confidence,
        pages: schema.workItems.pages,
        at: schema.workItems.createdAt,
        tagsOnItem: sql<number>`(SELECT COUNT(*) FROM work_tags t2 WHERE t2.work_item_id = ${schema.workTags.workItemId} AND t2.state IN ('ai','confirmed','added'))`,
      })
      .from(schema.workTags)
      .innerJoin(schema.workItems, eq(schema.workItems.id, schema.workTags.workItemId))
      .where(
        and(
          eq(schema.workTags.userId, userId),
          eq(schema.workItems.subjectId, subjectId),
          inArray(schema.workTags.state, LIVE_STATES),
        ),
      ),
    database
      .select()
      .from(schema.results)
      .where(and(eq(schema.results.userId, userId), eq(schema.results.subjectId, subjectId))),
    database.select().from(schema.mastery).where(eq(schema.mastery.userId, userId)),
  ]);

  const tags = new Map<string, TagEvidence[]>();
  for (const row of tagRows) {
    const list = tags.get(row.pointId) ?? [];
    list.push({
      quality: row.quality,
      confidence: row.confidence,
      at: row.at,
      // An item's pages are shared between the points it covered.
      pages: Math.max(1, Math.ceil(row.pages / Math.max(1, Number(row.tagsOnItem) || 1))),
    });
    tags.set(row.pointId, list);
  }
  const results = new Map<string, ResultEvidence[]>();
  for (const row of resultRows) {
    if (row.maxMark <= 0) continue;
    const at = Date.parse(`${row.takenOn}T12:00:00Z`) || row.createdAt;
    for (const pointId of parsePointIds(row.pointIds)) {
      const list = results.get(pointId) ?? [];
      list.push({ fraction: Math.min(1, Math.max(0, row.mark / row.maxMark)), at });
      results.set(pointId, list);
    }
  }
  // A unit counts as taught once any of its points has work or a mark.
  const startedUnits = new Set(points.filter((point) => tags.has(point.id) || results.has(point.id)).map((point) => point.unit));
  const snoozes = new Map(cached.map((row) => [row.pointId, row]));

  return points.map((point) => {
    const cache = snoozes.get(point.id);
    return {
      point,
      mastery: computeMastery(
        { tags: tags.get(point.id) ?? [], results: results.get(point.id) ?? [], minutes: 0, taught: startedUnits.has(point.unit) },
        now,
      ),
      snoozedUntil: cache?.snoozedUntil ?? null,
      coveredElsewhere: cache?.coveredElsewhere ?? false,
    };
  });
}

export function parsePointIds(raw: string): string[] {
  try {
    const value = JSON.parse(raw);
    return Array.isArray(value) ? value.filter((id): id is string => typeof id === "string") : [];
  } catch {
    return [];
  }
}

export function priorities(map: PointMastery[], now = Date.now(), limit = 5): Array<Priority & { point: PointRow; mastery: Mastery }> {
  const byId = new Map(map.map((entry) => [entry.point.id, entry]));
  return rankPriorities(
    map.map((entry) => ({
      pointId: entry.point.id,
      mastery: entry.mastery,
      hours: entry.point.hours,
      snoozedUntil: entry.snoozedUntil,
      coveredElsewhere: entry.coveredElsewhere,
    })),
    now,
    limit,
  ).map((priority) => ({ ...priority, point: byId.get(priority.pointId)!.point, mastery: byId.get(priority.pointId)!.mastery }));
}

/**
 * Writes the current scores for points with evidence into the cache, keeping
 * any snooze. Called after work, a check-in or a mark lands.
 */
export async function refreshMasteryCache(database: Database, userId: string, map: PointMastery[]) {
  const now = Date.now();
  const writes = map
    .filter((entry) => entry.mastery.works > 0 || entry.mastery.r !== null || entry.snoozedUntil || entry.coveredElsewhere)
    .map((entry) => {
      const values = {
        score: entry.mastery.score,
        q: entry.mastery.q,
        c: entry.mastery.c,
        r: entry.mastery.r,
        e: entry.mastery.e,
        decay: entry.mastery.decay,
        band: entry.mastery.band,
        reason: entry.mastery.reason,
        works: entry.mastery.works,
        lastWorkAt: entry.mastery.lastAt,
        updatedAt: now,
      };
      return database
        .insert(schema.mastery)
        .values({ userId, pointId: entry.point.id, ...values })
        .onConflictDoUpdate({ target: [schema.mastery.userId, schema.mastery.pointId], set: values });
    });
  for (let i = 0; i < writes.length; i += 50) {
    const batch = writes.slice(i, i + 50);
    if (batch.length) await database.batch(batch as unknown as Parameters<Database["batch"]>[0]);
  }
}
