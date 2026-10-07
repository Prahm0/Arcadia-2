import { and, desc, eq, gte, inArray, isNull } from "drizzle-orm";
import { schema, type Database } from "../db";
import { newId } from "./ids";
import { subjectKey } from "./scheduler";
import { DAY } from "./time";
import type { LogEntry } from "./study-record";

type LogRow = typeof schema.studyLog.$inferSelect;


/** Where a set of entries came from: a study block, or a timer session. */
export type LogSource =
  | { eventId: string; source: "checkout" | "marked" }
  | { activityId: string; source: "timer" };

const clip = (value: unknown, max: number) => String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);

/** The subject row a session's subject name belongs to, if it's one of theirs. */
export async function findSubject(
  database: Database,
  userId: string,
  name: string | null | undefined,
): Promise<{ id: string; name: string } | null> {
  if (!name) return null;
  const subjects = await database
    .select({ id: schema.subjects.id, name: schema.subjects.name })
    .from(schema.subjects)
    .where(eq(schema.subjects.userId, userId));
  return subjects.find((row) => subjectKey(row.name) === subjectKey(name)) ?? null;
}

function sourceFilter(userId: string, from: LogSource) {
  return "eventId" in from
    ? and(eq(schema.studyLog.userId, userId), eq(schema.studyLog.eventId, from.eventId))
    : and(eq(schema.studyLog.userId, userId), eq(schema.studyLog.activityId, from.activityId));
}

/**
 * Writes what a session covered, replacing anything the same block or timer
 * session logged before, so checking out twice or re-marking a block never
 * counts the time twice.
 */
export async function replaceLog(
  database: Database,
  userId: string,
  from: LogSource,
  subject: { id: string | null; name: string | null },
  entries: LogEntry[],
  studiedAt: number,
): Promise<void> {
  // Only topics that still exist and are theirs keep their link: a topic
  // deleted since the plan was made would fail the foreign key.
  const ids = [...new Set(entries.flatMap((entry) => (entry.topicId ? [entry.topicId] : [])))];
  const known = ids.length
    ? new Set(
        (
          await database
            .select({ id: schema.subjectTopics.id })
            .from(schema.subjectTopics)
            .where(and(eq(schema.subjectTopics.userId, userId), inArray(schema.subjectTopics.id, ids)))
        ).map((row) => row.id),
      )
    : new Set<string>();
  const rows = entries
    .filter((entry) => entry.minutes > 0)
    .map((entry) => ({
      id: newId("log"),
      userId,
      subjectId: subject.id,
      subject: subject.name ? clip(subject.name, 80) : null,
      topicId: entry.topicId && known.has(entry.topicId) ? entry.topicId : null,
      topic: clip(entry.topic, 80),
      eventId: "eventId" in from ? from.eventId : null,
      activityId: "activityId" in from ? from.activityId : null,
      kind: entry.kind,
      minutes: Math.min(24 * 60, Math.round(entry.minutes)),
      confidence: entry.confidence,
      note: clip(entry.note, 200),
      source: from.source,
      studiedAt,
    }));
  const writes = [
    database.delete(schema.studyLog).where(sourceFilter(userId, from)),
    // A session covers a handful of topics at most; well under D1's 100
    // bound values per statement once split per row.
    ...rows.map((row) => database.insert(schema.studyLog).values(row)),
  ];
  await database.batch(writes as unknown as Parameters<Database["batch"]>[0]);
}

/** Takes a block's entries back out, when it's un-done or marked missed. */
export async function clearLog(database: Database, userId: string, from: LogSource): Promise<void> {
  await database.delete(schema.studyLog).where(sourceFilter(userId, from));
}

/**
 * A new syllabus replaces the subject's topics with new rows, which unlinks
 * the log. Rows find the topic of the same title again, so a re-read keeps
 * the student's record.
 */
export async function relinkTopics(database: Database, userId: string, subjectId: string): Promise<void> {
  const [orphans, topics] = await Promise.all([
    database
      .select({ id: schema.studyLog.id, topic: schema.studyLog.topic })
      .from(schema.studyLog)
      .where(
        and(eq(schema.studyLog.userId, userId), eq(schema.studyLog.subjectId, subjectId), isNull(schema.studyLog.topicId)),
      ),
    database
      .select({ id: schema.subjectTopics.id, title: schema.subjectTopics.title })
      .from(schema.subjectTopics)
      .where(and(eq(schema.subjectTopics.userId, userId), eq(schema.subjectTopics.subjectId, subjectId))),
  ]);
  if (orphans.length === 0 || topics.length === 0) return;
  const byTitle = new Map(topics.map((topic) => [topic.title.trim().toLowerCase(), topic.id]));
  const moves = new Map<string, string[]>();
  for (const row of orphans) {
    const topicId = byTitle.get(row.topic.trim().toLowerCase());
    if (topicId) moves.set(topicId, [...(moves.get(topicId) ?? []), row.id]);
  }
  if (moves.size === 0) return;
  const writes = [...moves].map(([topicId, ids]) =>
    database.update(schema.studyLog).set({ topicId }).where(inArray(schema.studyLog.id, ids.slice(0, 90))),
  );
  await database.batch(writes as unknown as Parameters<Database["batch"]>[0]);
}

/** How far back the record Arcad plans from goes. */
export const RECORD_DAYS = 120;

/** The subject's recent log, newest first. */
export async function subjectLog(database: Database, userId: string, subjectId: string, now = Date.now()): Promise<LogRow[]> {
  return database
    .select()
    .from(schema.studyLog)
    .where(
      and(
        eq(schema.studyLog.userId, userId),
        eq(schema.studyLog.subjectId, subjectId),
        gte(schema.studyLog.studiedAt, now - RECORD_DAYS * DAY),
      ),
    )
    .orderBy(desc(schema.studyLog.studiedAt))
    .limit(300);
}
