import { and, desc, eq, inArray } from "drizzle-orm";
import { Hono } from "hono";
import { db, schema, type Database } from "../db";
import { newId } from "../lib/ids";
import { parsePointIds, pointRefs, priorities, refreshMasteryCache, subjectMastery, syllabusPoints, type PointMastery } from "../lib/mastery";
import { AiConsentRequiredError, aiConfigured, completeJson, documentCall, documentModel, type ChatMessage } from "../lib/openai";
import { track } from "../lib/posthog";
import { getUserTier, isPaidTier } from "../lib/tiers";
import { iso } from "../lib/time";
import { readWork, tagWork, TAGGING_PROMPT_VERSION, WORK_TYPES, type JsonCall, type Tag } from "../lib/work-tagging";
import type { Env, Variables } from "../types";
import { BAND_LABELS, MAX_SNOOZE_DAYS, REASON_TIPS } from "../../../shared/mastery.ts";
import { SYLLABUS_NAMES, isSyllabusId, suggestSyllabus } from "../../../shared/syllabusPoints.ts";

type App = Hono<{ Bindings: Env; Variables: Variables }>;

const WORK_MAX_BYTES = 8 * 1024 * 1024;
const DAY = 86_400_000;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const clip = (value: unknown, max: number) => String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);

async function ownedSubject(database: Database, userId: string, subjectId: string) {
  const [subject] = await database
    .select()
    .from(schema.subjects)
    .where(and(eq(schema.subjects.id, subjectId), eq(schema.subjects.userId, userId)))
    .limit(1);
  return subject;
}

async function ownedItem(database: Database, userId: string, id: string) {
  const [item] = await database
    .select()
    .from(schema.workItems)
    .where(and(eq(schema.workItems.id, id), eq(schema.workItems.userId, userId)))
    .limit(1);
  return item;
}

/** The worker's way of making the tagging pipeline's model calls. */
function modelCall(env: Env, userId: string): JsonCall {
  return async (step, messages, schemaDef, reply) => {
    const call = documentCall(env, { feature: step === "read" ? "work_read" : "work_tag", userId }, reply);
    return completeJson(env, messages as ChatMessage[], schemaDef, call.maxTokens, call.options);
  };
}

function serialiseItem(row: typeof schema.workItems.$inferSelect) {
  return {
    id: row.id,
    subjectId: row.subjectId,
    source: row.source as "upload" | "scan",
    filename: row.filename,
    contentType: row.contentType,
    pages: row.pages,
    status: row.status as "read" | "unread" | "checked",
    transcriptEdited: row.transcriptEdited,
    stored: Boolean(row.storageKey),
    createdAt: iso(row.createdAt),
  };
}

async function itemTags(database: Database, itemId: string) {
  const rows = await database
    .select({ tag: schema.workTags, point: schema.syllabusPoints })
    .from(schema.workTags)
    .innerJoin(schema.syllabusPoints, eq(schema.syllabusPoints.id, schema.workTags.pointId))
    .where(eq(schema.workTags.workItemId, itemId));
  return rows
    .sort((a, b) => a.point.position - b.point.position)
    .map(({ tag, point }) => ({
      pointId: point.id,
      text: point.text,
      topic: point.topicTitle,
      subtopic: point.subtopic,
      unit: point.unit,
      quality: tag.quality,
      questions: tag.questions,
      evidence: tag.evidence,
      confidence: tag.confidence,
      state: tag.state as "ai" | "confirmed" | "removed" | "added",
    }));
}

function tagRows(itemId: string, userId: string, tags: Tag[]) {
  return tags.map((tag) => ({
    workItemId: itemId,
    pointId: tag.pointId,
    userId,
    quality: tag.quality,
    questions: tag.questions,
    evidence: tag.evidence,
    state: "ai",
    promptVersion: TAGGING_PROMPT_VERSION,
  }));
}

function serialisePoint(entry: PointMastery) {
  const { point, mastery } = entry;
  return {
    id: point.id,
    unit: point.unit,
    unitTitle: point.unitTitle,
    topic: point.topic,
    topicTitle: point.topicTitle,
    subtopic: point.subtopic,
    text: point.text,
    score: Math.round(mastery.score),
    band: mastery.band,
    reason: mastery.reason,
    q: mastery.q,
    c: mastery.c,
    r: mastery.r,
    e: mastery.e,
    decay: mastery.decay,
    confidence: mastery.confidence,
    works: mastery.works,
    lastAt: mastery.lastAt ? iso(mastery.lastAt) : null,
    snoozedUntil: entry.snoozedUntil && entry.snoozedUntil > Date.now() ? iso(entry.snoozedUntil) : null,
    coveredElsewhere: entry.coveredElsewhere,
  };
}

/** Recomputes the subject's map, refreshes the cache, and returns it. */
async function recompute(database: Database, userId: string, subjectId: string, syllabus: string) {
  const map = await subjectMastery(database, userId, subjectId, syllabus);
  await refreshMasteryCache(database, userId, map);
  return map;
}

/** /api/work — the student's own work, read in and tagged to dot points. */
export const work: App = new Hono();

work.get("/", async (c) => {
  const { userId } = c.get("session");
  const subjectId = c.req.query("subject") ?? "";
  const database = db(c.env.DB);
  if (!(await ownedSubject(database, userId, subjectId))) return c.json({ error: "Subject not found." }, 404);
  const rows = await database
    .select()
    .from(schema.workItems)
    .where(and(eq(schema.workItems.userId, userId), eq(schema.workItems.subjectId, subjectId)))
    .orderBy(desc(schema.workItems.createdAt))
    .limit(200);
  const tags = rows.length
    ? await database
        .select({ workItemId: schema.workTags.workItemId, pointId: schema.workTags.pointId, state: schema.workTags.state })
        .from(schema.workTags)
        .where(inArray(schema.workTags.workItemId, rows.map((row) => row.id)))
    : [];
  return c.json({
    items: rows.map((row) => ({
      ...serialiseItem(row),
      points: tags.filter((tag) => tag.workItemId === row.id && tag.state !== "removed").map((tag) => tag.pointId),
    })),
  });
});

work.post("/", async (c) => {
  const { userId } = c.get("session");
  const database = db(c.env.DB);
  if (!isPaidTier(await getUserTier(database, userId))) {
    return c.json({ error: "Tracking your work against the syllabus is on Pro and Max.", code: "upgrade_required" }, 402);
  }
  const subjectId = c.req.query("subject") ?? "";
  const filename = clip(c.req.query("filename") || "work", 200) || "work";
  const source = c.req.query("source") === "scan" ? "scan" : "upload";
  const keep = c.req.query("keep") === "1";

  let contentType = (c.req.header("content-type") ?? "").split(";")[0].trim().toLowerCase();
  if (!WORK_TYPES[contentType]) {
    if (/\.md$/i.test(filename)) contentType = "text/markdown";
    else if (/\.txt$/i.test(filename)) contentType = "text/plain";
  }
  if (/\.(docx?|pages|odt)$/i.test(filename)) return c.json({ error: "Save it as a PDF first, then upload that." }, 415);
  if (!WORK_TYPES[contentType]) return c.json({ error: "Arcad can read PDFs, photos (PNG, JPG, WebP) and text files." }, 415);

  const subject = await ownedSubject(database, userId, subjectId);
  if (!subject) return c.json({ error: "Subject not found." }, 404);
  if (!subject.syllabus) {
    // "Maths Methods" can only mean one syllabus, so link it rather than ask.
    const suggested = suggestSyllabus(subject.name);
    if (!suggested) {
      return c.json({ error: "Arcad can only map Mathematical Methods work to the syllabus so far.", code: "no_syllabus" }, 409);
    }
    await database.update(schema.subjects).set({ syllabus: suggested }).where(eq(schema.subjects.id, subject.id));
    subject.syllabus = suggested;
  }
  if (!aiConfigured(c.env)) return c.json({ error: "Arcad isn't set up to read work yet." }, 503);

  const bytes = await c.req.arrayBuffer();
  if (bytes.byteLength === 0) return c.json({ error: "That file is empty." }, 422);
  if (bytes.byteLength > WORK_MAX_BYTES) return c.json({ error: "Keep it under 8 MB." }, 413);

  const points = await syllabusPoints(database, subject.syllabus);
  const call = modelCall(c.env, userId);
  const started = Date.now();
  let reading: Awaited<ReturnType<typeof readWork>> = null;
  let tags: Tag[] = [];
  try {
    reading = await readWork(call, { bytes, contentType, filename }, subject.name);
    if (reading?.readable) tags = (await tagWork(call, reading, pointRefs(points))) ?? [];
  } catch (error) {
    if (error instanceof AiConsentRequiredError) return c.json({ error: error.message, code: "ai_consent_required" }, 403);
    console.error("[work] reading failed", error);
  }

  const id = newId("wrk");
  // Only what was read is kept, unless the student asked to keep the file.
  let storageKey: string | null = null;
  if (keep && c.env.UPLOADS) {
    storageKey = `${userId}/work/${subjectId}/${id}`;
    await c.env.UPLOADS.put(storageKey, bytes, { httpMetadata: { contentType } });
  }
  const readable = Boolean(reading?.readable);
  const [item] = await database
    .insert(schema.workItems)
    .values({
      id,
      userId,
      subjectId,
      source,
      filename,
      contentType,
      pages: reading?.pages ?? 1,
      transcript: reading?.transcript ?? "",
      storageKey,
      status: readable ? "read" : "unread",
      promptVersion: TAGGING_PROMPT_VERSION,
      model: documentModel(c.env),
      ms: Date.now() - started,
    })
    .returning();
  if (tags.length) await database.insert(schema.workTags).values(tagRows(id, userId, tags));
  if (tags.length) await recompute(database, userId, subjectId, subject.syllabus);

  track(c, userId, "work_uploaded", { source, readable, tags: tags.length, kind: reading?.kind ?? null });
  return c.json({ item: serialiseItem(item), kind: reading?.kind ?? null, tags: await itemTags(database, id) }, 201);
});

work.get("/:id", async (c) => {
  const { userId } = c.get("session");
  const database = db(c.env.DB);
  const item = await ownedItem(database, userId, c.req.param("id"));
  if (!item) return c.json({ error: "Not found." }, 404);
  return c.json({ item: serialiseItem(item), transcript: item.transcript, tags: await itemTags(database, item.id) });
});

work.delete("/:id", async (c) => {
  const { userId } = c.get("session");
  const database = db(c.env.DB);
  const item = await ownedItem(database, userId, c.req.param("id"));
  if (!item) return c.json({ error: "Not found." }, 404);
  if (item.storageKey && c.env.UPLOADS) await c.env.UPLOADS.delete(item.storageKey).catch(() => {});
  await database.delete(schema.workItems).where(eq(schema.workItems.id, item.id));
  const subject = await ownedSubject(database, userId, item.subjectId);
  if (subject?.syllabus) await recompute(database, userId, item.subjectId, subject.syllabus);
  return c.json({ ok: true });
});

/** A misread fixed by the student: re-tag from the corrected text. */
work.patch("/:id/transcript", async (c) => {
  const { userId } = c.get("session");
  const database = db(c.env.DB);
  const item = await ownedItem(database, userId, c.req.param("id"));
  if (!item) return c.json({ error: "Not found." }, 404);
  const body = await c.req.json<{ transcript?: string }>().catch(() => null);
  const transcript = String(body?.transcript ?? "").slice(0, 20_000);
  if (!transcript.trim()) return c.json({ error: "The transcript is empty." }, 422);
  const subject = await ownedSubject(database, userId, item.subjectId);
  if (!subject?.syllabus) return c.json({ error: "Link this subject to its syllabus first.", code: "no_syllabus" }, 409);

  let tags: Tag[] | null = null;
  try {
    tags = await tagWork(
      modelCall(c.env, userId),
      { readable: true, pages: item.pages, kind: "attempt", transcript },
      pointRefs(await syllabusPoints(database, subject.syllabus)),
    );
  } catch (error) {
    if (error instanceof AiConsentRequiredError) return c.json({ error: error.message, code: "ai_consent_required" }, 403);
    console.error("[work] re-tagging failed", error);
  }
  if (!tags) return c.json({ error: "Arcad couldn't mark that. Try again in a sec." }, 502);

  // The student's own additions and removals stand; the model's unchecked tags are replaced.
  const existing = await database.select().from(schema.workTags).where(eq(schema.workTags.workItemId, item.id));
  const kept = new Set(existing.filter((tag) => tag.state !== "ai").map((tag) => tag.pointId));
  await database.batch([
    database.update(schema.workItems).set({ transcript, transcriptEdited: true, status: "read" }).where(eq(schema.workItems.id, item.id)),
    database.delete(schema.workTags).where(and(eq(schema.workTags.workItemId, item.id), eq(schema.workTags.state, "ai"))),
  ]);
  const fresh = tags.filter((tag) => !kept.has(tag.pointId));
  if (fresh.length) await database.insert(schema.workTags).values(tagRows(item.id, userId, fresh));
  await recompute(database, userId, item.subjectId, subject.syllabus);
  return c.json({ tags: await itemTags(database, item.id) });
});

/**
 * The quick check-in after a batch: which tags were right, any the model
 * missed, and how sure the student feels. Removed tags are kept as
 * 'removed' so corrections can be counted.
 */
work.post("/:id/checkin", async (c) => {
  const { userId } = c.get("session");
  const database = db(c.env.DB);
  const item = await ownedItem(database, userId, c.req.param("id"));
  if (!item) return c.json({ error: "Not found." }, 404);
  const body = await c.req
    .json<{ remove?: unknown; add?: unknown; confidence?: unknown }>()
    .catch(() => null);
  if (!body) return c.json({ error: "Invalid request." }, 400);
  const subject = await ownedSubject(database, userId, item.subjectId);
  if (!subject?.syllabus) return c.json({ error: "Link this subject to its syllabus first.", code: "no_syllabus" }, 409);

  const confidence = Number(body.confidence);
  const rating = Number.isInteger(confidence) && confidence >= 1 && confidence <= 5 ? confidence : null;
  const ids = (value: unknown) => (Array.isArray(value) ? value.filter((id): id is string => typeof id === "string").slice(0, 20) : []);
  const remove = new Set(ids(body.remove));
  const known = new Set((await syllabusPoints(database, subject.syllabus)).map((point) => point.id));
  const existing = await database.select().from(schema.workTags).where(eq(schema.workTags.workItemId, item.id));
  const have = new Set(existing.map((tag) => tag.pointId));
  const add = ids(body.add).filter((id) => known.has(id));

  const writes: unknown[] = [];
  for (const tag of existing) {
    const state = remove.has(tag.pointId) ? "removed" : tag.state === "removed" ? "removed" : tag.state === "added" ? "added" : "confirmed";
    writes.push(
      database
        .update(schema.workTags)
        .set({ state, confidence: state === "removed" ? null : rating })
        .where(and(eq(schema.workTags.workItemId, item.id), eq(schema.workTags.pointId, tag.pointId))),
    );
  }
  for (const pointId of add) {
    if (have.has(pointId)) {
      // Re-adding one they'd removed.
      writes.push(
        database
          .update(schema.workTags)
          .set({ state: "added", confidence: rating })
          .where(and(eq(schema.workTags.workItemId, item.id), eq(schema.workTags.pointId, pointId))),
      );
    } else {
      writes.push(
        database.insert(schema.workTags).values({
          workItemId: item.id,
          pointId,
          userId,
          quality: null,
          confidence: rating,
          state: "added",
          promptVersion: TAGGING_PROMPT_VERSION,
        }),
      );
    }
  }
  writes.push(database.update(schema.workItems).set({ status: "checked" }).where(eq(schema.workItems.id, item.id)));
  await database.batch(writes as unknown as Parameters<Database["batch"]>[0]);
  const map = await recompute(database, userId, item.subjectId, subject.syllabus);

  const touched = new Set([...existing.map((tag) => tag.pointId), ...add]);
  track(c, userId, "work_checked_in", {
    kept: existing.length - remove.size,
    removed: remove.size,
    added: add.length,
    confidence: rating,
  });
  return c.json({
    tags: await itemTags(database, item.id),
    points: map.filter((entry) => touched.has(entry.point.id)).map(serialisePoint),
  });
});

/** /api/mastery — the dot-point map for a subject, and what to work on. */
export const masteryRoutes: App = new Hono();

masteryRoutes.get("/", async (c) => {
  const { userId } = c.get("session");
  const subjectId = c.req.query("subject") ?? "";
  const database = db(c.env.DB);
  const subject = await ownedSubject(database, userId, subjectId);
  if (!subject) return c.json({ error: "Subject not found." }, 404);
  if (!subject.syllabus) {
    const suggested = suggestSyllabus(subject.name);
    return c.json({
      syllabus: null,
      suggested: suggested ? { id: suggested, name: SYLLABUS_NAMES[suggested] } : null,
      points: [],
      priorities: [],
    });
  }
  const map = await subjectMastery(database, userId, subjectId, subject.syllabus);
  return c.json({
    syllabus: isSyllabusId(subject.syllabus) ? { id: subject.syllabus, name: SYLLABUS_NAMES[subject.syllabus] } : null,
    suggested: null,
    points: map.map(serialisePoint),
    priorities: priorities(map).map((entry) => ({
      pointId: entry.pointId,
      priority: entry.priority,
      reason: entry.reason,
      label: REASON_TIPS[entry.reason].label,
      tip: REASON_TIPS[entry.reason].tip,
    })),
    bands: BAND_LABELS,
  });
});

/** Snooze a point, mark it covered elsewhere (tutoring), or undo either. */
masteryRoutes.post("/:pointId/snooze", async (c) => {
  const { userId } = c.get("session");
  const pointId = c.req.param("pointId");
  const body = await c.req.json<{ days?: unknown; covered?: unknown; clear?: unknown }>().catch(() => null);
  if (!body) return c.json({ error: "Invalid request." }, 400);
  const database = db(c.env.DB);
  const [point] = await database.select().from(schema.syllabusPoints).where(eq(schema.syllabusPoints.id, pointId)).limit(1);
  if (!point) return c.json({ error: "Not found." }, 404);

  const now = Date.now();
  const days = Math.min(MAX_SNOOZE_DAYS, Math.max(1, Math.round(Number(body.days) || 7)));
  // Covered elsewhere also expires, so a topic can't be hidden for good.
  const values = body.clear
    ? { snoozedUntil: null, coveredElsewhere: false }
    : body.covered
      ? { snoozedUntil: now + MAX_SNOOZE_DAYS * DAY, coveredElsewhere: true }
      : { snoozedUntil: now + days * DAY, coveredElsewhere: false };
  await database
    .insert(schema.mastery)
    .values({ userId, pointId, ...values })
    .onConflictDoUpdate({ target: [schema.mastery.userId, schema.mastery.pointId], set: { ...values, updatedAt: now } });
  return c.json({ ok: true, snoozedUntil: values.snoozedUntil ? iso(values.snoozedUntil) : null, coveredElsewhere: values.coveredElsewhere });
});

/** /api/results — real marks that recalibrate the points they covered. */
export const resultsRoutes: App = new Hono();

function serialiseResult(row: typeof schema.results.$inferSelect) {
  return {
    id: row.id,
    subjectId: row.subjectId,
    assessmentId: row.assessmentId,
    title: row.title,
    mark: row.mark,
    maxMark: row.maxMark,
    takenOn: row.takenOn,
    pointIds: parsePointIds(row.pointIds),
  };
}

resultsRoutes.get("/", async (c) => {
  const { userId } = c.get("session");
  const subjectId = c.req.query("subject") ?? "";
  const rows = await db(c.env.DB)
    .select()
    .from(schema.results)
    .where(and(eq(schema.results.userId, userId), eq(schema.results.subjectId, subjectId)))
    .orderBy(desc(schema.results.takenOn));
  return c.json({ results: rows.map(serialiseResult) });
});

resultsRoutes.post("/", async (c) => {
  const { userId } = c.get("session");
  const body = await c.req
    .json<{ subjectId?: string; assessmentId?: string | null; title?: string; mark?: unknown; maxMark?: unknown; takenOn?: string; pointIds?: unknown }>()
    .catch(() => null);
  if (!body) return c.json({ error: "Invalid request." }, 400);
  const database = db(c.env.DB);
  const subject = await ownedSubject(database, userId, String(body.subjectId ?? ""));
  if (!subject) return c.json({ error: "Subject not found." }, 404);
  if (!subject.syllabus) return c.json({ error: "Link this subject to its syllabus first.", code: "no_syllabus" }, 409);

  const title = clip(body.title, 120);
  const mark = Number(body.mark);
  const maxMark = Number(body.maxMark);
  const takenOn = String(body.takenOn ?? "");
  if (!title) return c.json({ error: "Give it a name." }, 422);
  if (!Number.isFinite(mark) || !Number.isFinite(maxMark) || maxMark <= 0 || mark < 0 || mark > maxMark) {
    return c.json({ error: "The mark has to be between 0 and the total." }, 422);
  }
  if (!ISO_DATE.test(takenOn)) return c.json({ error: "Pick the date." }, 422);
  const known = new Set((await syllabusPoints(database, subject.syllabus)).map((point) => point.id));
  const pointIds = (Array.isArray(body.pointIds) ? body.pointIds : []).filter((id): id is string => typeof id === "string" && known.has(id)).slice(0, 60);
  if (pointIds.length === 0) return c.json({ error: "Pick the dot points it covered." }, 422);

  let assessmentId: string | null = null;
  if (body.assessmentId) {
    const [assessment] = await database
      .select({ id: schema.subjectAssessments.id })
      .from(schema.subjectAssessments)
      .where(and(eq(schema.subjectAssessments.id, String(body.assessmentId)), eq(schema.subjectAssessments.userId, userId)))
      .limit(1);
    assessmentId = assessment?.id ?? null;
  }

  const [row] = await database
    .insert(schema.results)
    .values({ id: newId("res"), userId, subjectId: subject.id, assessmentId, title, mark, maxMark, takenOn, pointIds: JSON.stringify(pointIds) })
    .returning();
  await recompute(database, userId, subject.id, subject.syllabus);
  track(c, userId, "result_added", { points: pointIds.length });
  return c.json({ result: serialiseResult(row) }, 201);
});

resultsRoutes.delete("/:id", async (c) => {
  const { userId } = c.get("session");
  const database = db(c.env.DB);
  const [row] = await database
    .select()
    .from(schema.results)
    .where(and(eq(schema.results.id, c.req.param("id")), eq(schema.results.userId, userId)))
    .limit(1);
  if (!row) return c.json({ error: "Not found." }, 404);
  await database.delete(schema.results).where(eq(schema.results.id, row.id));
  const subject = await ownedSubject(database, userId, row.subjectId);
  if (subject?.syllabus) await recompute(database, userId, row.subjectId, subject.syllabus);
  return c.json({ ok: true });
});
