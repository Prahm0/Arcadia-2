import { and, asc, eq } from "drizzle-orm";
import { Hono } from "hono";
import { db, schema } from "../db";
import { currentTopic } from "../lib/syllabus";
import { findSubject, subjectLog } from "../lib/study-log";
import { summariseLog } from "../lib/study-record";
import { localDateKey } from "../lib/time";
import type { Env, Variables } from "../types";
import { isConfidence } from "../../../shared/studyLog";

const studyLog = new Hono<{ Bindings: Env; Variables: Variables }>();

/**
 * A subject's topics for the Sessions topic picker, each with what the log
 * says about it, and the one being taught now.
 * GET /api/study-log/topics?subject=Chemistry
 */
studyLog.get("/topics", async (c) => {
  const { userId } = c.get("session");
  const database = db(c.env.DB);
  const subject = await findSubject(database, userId, c.req.query("subject"));
  if (!subject) return c.json({ subjectId: null, currentTopicId: null, topics: [] });

  const [[profile], topics, log] = await Promise.all([
    database.select({ timezone: schema.profiles.timezone }).from(schema.profiles).where(eq(schema.profiles.userId, userId)).limit(1),
    database
      .select()
      .from(schema.subjectTopics)
      .where(and(eq(schema.subjectTopics.userId, userId), eq(schema.subjectTopics.subjectId, subject.id)))
      .orderBy(asc(schema.subjectTopics.position)),
    subjectLog(database, userId, subject.id),
  ]);
  const today = localDateKey(Date.now(), profile?.timezone ?? "Australia/Brisbane");
  const records = new Map(summariseLog(log).map((record) => [record.topicId ?? record.key, record]));
  const now = currentTopic(topics, today);
  return c.json({
    subjectId: subject.id,
    currentTopicId: now?.topic.id ?? null,
    topics: topics.map((topic) => {
      const record = records.get(topic.id) ?? records.get(topic.title.trim().toLowerCase());
      return {
        id: topic.id,
        title: topic.title,
        taught: Boolean(topic.startsOn && topic.startsOn <= today),
        confidence: record?.confidence ?? null,
        minutes: record?.minutes ?? 0,
        lastAt: record ? new Date(record.lastAt).toISOString() : null,
      };
    }),
  });
});

/**
 * How a timer session's topic sits, asked once the session's logged.
 * POST /api/study-log/rate { activityId, confidence }
 */
studyLog.post("/rate", async (c) => {
  const { userId } = c.get("session");
  const body = await c.req.json<{ activityId?: unknown; confidence?: unknown }>().catch(() => null);
  const activityId = typeof body?.activityId === "string" ? body.activityId.slice(0, 100) : "";
  if (!activityId || !isConfidence(body?.confidence)) return c.json({ error: "Invalid request." }, 400);
  const updated = await db(c.env.DB)
    .update(schema.studyLog)
    .set({ confidence: body.confidence })
    .where(and(eq(schema.studyLog.userId, userId), eq(schema.studyLog.activityId, activityId)))
    .returning({ id: schema.studyLog.id });
  if (updated.length === 0) return c.json({ error: "That session hasn't synced yet." }, 404);
  return c.json({ ok: true });
});

export default studyLog;
