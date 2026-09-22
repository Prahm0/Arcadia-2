import { and, eq, inArray, isNull } from "drizzle-orm";
import { Hono } from "hono";
import { db, schema, type Database } from "../db";
import { newId } from "../lib/ids";
import { aiConfigured } from "../lib/openai";
import { replan } from "../lib/replan";
import {
  ASSESSMENT_KINDS,
  MATERIAL_MAX_BYTES,
  MATERIAL_TYPES,
  readResource,
  readSyllabus,
  type AssessmentKind,
} from "../lib/syllabus";
import { HOUR, iso, localDateKey, startOfLocalDay } from "../lib/time";
import type { Env, Variables } from "../types";

type App = Hono<{ Bindings: Env; Variables: Variables }>;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const clip = (value: unknown, max: number) => String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
/** Missing or blank is null (no date); a malformed date is undefined (reject). */
const cleanDate = (value: unknown) =>
  value === undefined || value === null || value === ""
    ? null
    : typeof value === "string" && ISO_DATE.test(value)
      ? value
      : undefined;

export function serialiseFile(row: typeof schema.subjectFiles.$inferSelect) {
  return {
    id: row.id,
    kind: row.kind as "syllabus" | "resource",
    filename: row.filename,
    contentType: row.contentType,
    bytes: row.bytes,
    summary: row.summary,
    read: row.status === "read",
    stored: Boolean(row.storageKey),
    createdAt: iso(row.createdAt),
  };
}

export function serialiseTopic(row: typeof schema.subjectTopics.$inferSelect) {
  return {
    id: row.id,
    title: row.title,
    detail: row.detail,
    startsOn: row.startsOn,
    endsOn: row.endsOn,
    source: row.source,
  };
}

export function serialiseAssessment(row: typeof schema.subjectAssessments.$inferSelect) {
  return {
    id: row.id,
    title: row.title,
    kind: row.kind as AssessmentKind,
    dueOn: row.dueOn,
    dueLabel: row.dueLabel,
    weight: row.weight,
    taskId: row.taskId,
    source: row.source,
  };
}

async function ownedSubject(database: Database, userId: string, subjectId: string) {
  const [subject] = await database
    .select()
    .from(schema.subjects)
    .where(and(eq(schema.subjects.id, subjectId), eq(schema.subjects.userId, userId)))
    .limit(1);
  return subject;
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

async function runBatch(database: Database, writes: unknown[]) {
  if (writes.length === 0) return;
  await database.batch(writes as unknown as Parameters<Database["batch"]>[0]);
}

/** Routes under /api/subjects/:id — reading files in, adding topics and assessments. */
export const subjectMaterials: App = new Hono();

subjectMaterials.post("/:id/files", async (c) => {
  const { userId } = c.get("session");
  const subjectId = c.req.param("id");
  const kind = c.req.query("kind") === "syllabus" ? "syllabus" : "resource";
  const filename = clip(c.req.query("filename") || "upload", 200) || "upload";

  let contentType = (c.req.header("content-type") ?? "").split(";")[0].trim().toLowerCase();
  // Browsers often send nothing useful for .md and .txt.
  if (!MATERIAL_TYPES[contentType]) {
    if (/\.md$/i.test(filename)) contentType = "text/markdown";
    else if (/\.txt$/i.test(filename)) contentType = "text/plain";
  }
  if (/\.(docx?|pages|odt)$/i.test(filename)) {
    return c.json({ error: "Save it as a PDF first, then upload that." }, 415);
  }
  if (!MATERIAL_TYPES[contentType]) {
    return c.json({ error: "Arcad can read PDFs, photos (PNG, JPG, WebP) and text files." }, 415);
  }

  const bytes = await c.req.arrayBuffer();
  if (bytes.byteLength === 0) return c.json({ error: "That file is empty." }, 422);
  if (bytes.byteLength > MATERIAL_MAX_BYTES) return c.json({ error: "Keep it under 8 MB." }, 413);

  const database = db(c.env.DB);
  const subject = await ownedSubject(database, userId, subjectId);
  if (!subject) return c.json({ error: "Subject not found." }, 404);
  const [profile] = await database
    .select()
    .from(schema.profiles)
    .where(eq(schema.profiles.userId, userId))
    .limit(1);
  const timezone = profile?.timezone ?? "Australia/Brisbane";
  const today = localDateKey(Date.now(), timezone);

  const id = newId("sfl");
  // The original is only kept once R2 is switched on; what Arcad reads from
  // it is kept either way.
  let storageKey: string | null = null;
  if (c.env.UPLOADS) {
    storageKey = `${userId}/subjects/${subjectId}/${id}`;
    await c.env.UPLOADS.put(storageKey, bytes, { httpMetadata: { contentType } });
  }

  let read = false;
  let summary = "";
  let map: Awaited<ReturnType<typeof readSyllabus>> = null;
  if (aiConfigured(c.env)) {
    try {
      if (kind === "syllabus") {
        map = await readSyllabus(c.env, { bytes, contentType, filename }, {
          subject: subject.name,
          state: profile?.state ?? null,
          today,
        });
        read = Boolean(map && (map.topics.length > 0 || map.assessments.length > 0));
        if (map) summary = `${map.topics.length} topics, ${map.assessments.length} assessments`;
      } else {
        const outline = await readResource(c.env, { bytes, contentType, filename }, subject.name);
        read = Boolean(outline);
        summary = outline ?? "";
      }
    } catch (error) {
      console.error("[syllabus] reading failed", error);
    }
  }

  const now = Date.now();
  const writes: unknown[] = [];
  let replaced: Array<typeof schema.subjectFiles.$inferSelect> = [];

  if (kind === "syllabus") {
    // One syllabus per subject: a new one replaces the old one and whatever
    // was read from it. Hand-added topics stay, and so do assessments the
    // student already turned into deadlines.
    replaced = await database
      .select()
      .from(schema.subjectFiles)
      .where(and(eq(schema.subjectFiles.subjectId, subjectId), eq(schema.subjectFiles.kind, "syllabus")));
    if (replaced.length) {
      writes.push(database.delete(schema.subjectFiles).where(inArray(schema.subjectFiles.id, replaced.map((row) => row.id))));
    }
    if (read && map) {
      writes.push(
        database
          .delete(schema.subjectTopics)
          .where(and(eq(schema.subjectTopics.subjectId, subjectId), eq(schema.subjectTopics.source, "syllabus"))),
        database
          .delete(schema.subjectAssessments)
          .where(
            and(
              eq(schema.subjectAssessments.subjectId, subjectId),
              eq(schema.subjectAssessments.source, "syllabus"),
              isNull(schema.subjectAssessments.taskId),
            ),
          ),
      );
    }
  }

  writes.push(
    database.insert(schema.subjectFiles).values({
      id,
      userId,
      subjectId,
      kind,
      filename,
      contentType,
      bytes: bytes.byteLength,
      storageKey,
      summary,
      status: read ? "read" : "unread",
      createdAt: now,
    }),
  );

  if (read && map) {
    // Only rows that survive the replace above count as already there:
    // hand-added ones and ones already turned into deadlines.
    const existing = await database
      .select({
        title: schema.subjectAssessments.title,
        source: schema.subjectAssessments.source,
        taskId: schema.subjectAssessments.taskId,
      })
      .from(schema.subjectAssessments)
      .where(eq(schema.subjectAssessments.subjectId, subjectId));
    const keptTitles = new Set(
      existing
        .filter((row) => kind !== "syllabus" || row.source !== "syllabus" || row.taskId)
        .map((row) => row.title.toLowerCase()),
    );

    // Explicit columns on every row so multi-row inserts never lean on defaults.
    const topicRows = map.topics.map((topic, position) => ({
      id: newId("top"),
      userId,
      subjectId,
      title: topic.title,
      detail: topic.detail,
      startsOn: topic.startsOn,
      endsOn: topic.endsOn,
      position,
      source: "syllabus",
      createdAt: now,
    }));
    const assessmentRows = map.assessments
      .filter((item) => !keptTitles.has(item.title.toLowerCase()))
      .map((item) => ({
        id: newId("asm"),
        userId,
        subjectId,
        title: item.title,
        kind: item.kind,
        dueOn: item.dueOn,
        dueLabel: item.dueLabel,
        weight: item.weight,
        taskId: null,
        source: "syllabus",
        createdAt: now,
      }));
    // D1 caps a statement at 100 bound values; ~11 columns a row.
    for (const rows of chunk(topicRows, 8)) writes.push(database.insert(schema.subjectTopics).values(rows));
    for (const rows of chunk(assessmentRows, 8)) writes.push(database.insert(schema.subjectAssessments).values(rows));
  }

  await runBatch(database, writes);
  for (const old of replaced) if (old.storageKey) await c.env.UPLOADS?.delete(old.storageKey);

  const [row] = await database.select().from(schema.subjectFiles).where(eq(schema.subjectFiles.id, id)).limit(1);
  return c.json(
    {
      file: serialiseFile(row),
      read,
      topics: map?.topics.length ?? 0,
      assessments: map?.assessments.length ?? 0,
      // Why it wasn't read, in Arcad's words, when it wasn't.
      message: read
        ? undefined
        : aiConfigured(c.env)
          ? "Arcad couldn't make sense of that one. Add the topics yourself below, or try a clearer copy."
          : "Arcad isn't switched on here, so add the topics yourself below.",
    },
    201,
  );
});

subjectMaterials.post("/:id/topics", async (c) => {
  const { userId } = c.get("session");
  const subjectId = c.req.param("id");
  const body = await c.req.json<Record<string, unknown>>().catch(() => null);
  const title = clip(body?.title, 80);
  if (!title) return c.json({ error: "Give the topic a name." }, 422);
  const startsOn = cleanDate(body?.startsOn);
  const endsOn = cleanDate(body?.endsOn);
  if (startsOn === undefined || endsOn === undefined) return c.json({ error: "Use a real date." }, 422);

  const database = db(c.env.DB);
  if (!(await ownedSubject(database, userId, subjectId))) return c.json({ error: "Subject not found." }, 404);
  const existing = await database
    .select({ position: schema.subjectTopics.position })
    .from(schema.subjectTopics)
    .where(eq(schema.subjectTopics.subjectId, subjectId));
  const id = newId("top");
  await database.insert(schema.subjectTopics).values({
    id,
    userId,
    subjectId,
    title,
    detail: clip(body?.detail, 200),
    startsOn,
    endsOn: endsOn ?? startsOn,
    position: existing.reduce((max, row) => Math.max(max, row.position + 1), 0),
    source: "manual",
  });
  return c.json({ ok: true, id }, 201);
});

subjectMaterials.post("/:id/assessments", async (c) => {
  const { userId } = c.get("session");
  const subjectId = c.req.param("id");
  const body = await c.req.json<Record<string, unknown>>().catch(() => null);
  const title = clip(body?.title, 120);
  if (!title) return c.json({ error: "Give the assessment a name." }, 422);
  const dueOn = cleanDate(body?.dueOn);
  if (dueOn === undefined) return c.json({ error: "Use a real date." }, 422);
  const kind = (ASSESSMENT_KINDS as readonly string[]).includes(String(body?.kind)) ? String(body?.kind) : "assignment";

  const database = db(c.env.DB);
  if (!(await ownedSubject(database, userId, subjectId))) return c.json({ error: "Subject not found." }, 404);
  const id = newId("asm");
  await database.insert(schema.subjectAssessments).values({
    id,
    userId,
    subjectId,
    title,
    kind,
    dueOn,
    weight: clip(body?.weight, 40),
    source: "manual",
  });
  return c.json({ ok: true, id }, 201);
});

/** /api/subject-files/:id */
export const subjectFiles: App = new Hono();

subjectFiles.get("/:id", async (c) => {
  const { userId } = c.get("session");
  const [row] = await db(c.env.DB)
    .select()
    .from(schema.subjectFiles)
    .where(and(eq(schema.subjectFiles.id, c.req.param("id")), eq(schema.subjectFiles.userId, userId)))
    .limit(1);
  if (!row) return c.json({ error: "Not found." }, 404);
  const object = row.storageKey && c.env.UPLOADS ? await c.env.UPLOADS.get(row.storageKey) : null;
  if (!object) return c.json({ error: "Arcadia doesn't keep a copy of this file." }, 404);
  return new Response(object.body, {
    headers: {
      "content-type": row.contentType,
      "content-disposition": `inline; filename="${row.filename.replace(/"/g, "")}"`,
      "cache-control": "private, max-age=3600",
    },
  });
});

subjectFiles.delete("/:id", async (c) => {
  const { userId } = c.get("session");
  const database = db(c.env.DB);
  const [row] = await database
    .select()
    .from(schema.subjectFiles)
    .where(and(eq(schema.subjectFiles.id, c.req.param("id")), eq(schema.subjectFiles.userId, userId)))
    .limit(1);
  if (!row) return c.json({ error: "Not found." }, 404);

  const writes: unknown[] = [database.delete(schema.subjectFiles).where(eq(schema.subjectFiles.id, row.id))];
  // Removing the syllabus takes what was read from it too, except
  // assessments already turned into deadlines.
  if (row.kind === "syllabus") {
    writes.push(
      database
        .delete(schema.subjectTopics)
        .where(and(eq(schema.subjectTopics.subjectId, row.subjectId), eq(schema.subjectTopics.source, "syllabus"))),
      database
        .delete(schema.subjectAssessments)
        .where(
          and(
            eq(schema.subjectAssessments.subjectId, row.subjectId),
            eq(schema.subjectAssessments.source, "syllabus"),
            isNull(schema.subjectAssessments.taskId),
          ),
        ),
    );
  }
  await runBatch(database, writes);
  if (row.storageKey) await c.env.UPLOADS?.delete(row.storageKey);
  return c.json({ ok: true });
});

/** /api/topics/:id */
export const topics: App = new Hono();

topics.patch("/:id", async (c) => {
  const { userId } = c.get("session");
  const body = await c.req.json<Record<string, unknown>>().catch(() => null);
  if (!body) return c.json({ error: "Invalid request." }, 400);
  const patch: Partial<typeof schema.subjectTopics.$inferInsert> = {};
  if (body.title !== undefined) {
    const title = clip(body.title, 80);
    if (!title) return c.json({ error: "Give the topic a name." }, 422);
    patch.title = title;
  }
  if (body.detail !== undefined) patch.detail = clip(body.detail, 200);
  for (const key of ["startsOn", "endsOn"] as const) {
    if (body[key] === undefined) continue;
    const date = cleanDate(body[key]);
    if (date === undefined) return c.json({ error: "Use a real date." }, 422);
    patch[key] = date;
  }
  if (Object.keys(patch).length === 0) return c.json({ ok: true });
  const updated = await db(c.env.DB)
    .update(schema.subjectTopics)
    .set(patch)
    .where(and(eq(schema.subjectTopics.id, c.req.param("id")), eq(schema.subjectTopics.userId, userId)))
    .returning({ id: schema.subjectTopics.id });
  if (updated.length === 0) return c.json({ error: "Topic not found." }, 404);
  return c.json({ ok: true });
});

topics.delete("/:id", async (c) => {
  const { userId } = c.get("session");
  const deleted = await db(c.env.DB)
    .delete(schema.subjectTopics)
    .where(and(eq(schema.subjectTopics.id, c.req.param("id")), eq(schema.subjectTopics.userId, userId)))
    .returning({ id: schema.subjectTopics.id });
  if (deleted.length === 0) return c.json({ error: "Topic not found." }, 404);
  return c.json({ ok: true });
});

/** /api/assessments/:id */
export const assessments: App = new Hono();

assessments.patch("/:id", async (c) => {
  const { userId } = c.get("session");
  const body = await c.req.json<Record<string, unknown>>().catch(() => null);
  if (!body) return c.json({ error: "Invalid request." }, 400);
  const patch: Partial<typeof schema.subjectAssessments.$inferInsert> = {};
  if (body.title !== undefined) {
    const title = clip(body.title, 120);
    if (!title) return c.json({ error: "Give the assessment a name." }, 422);
    patch.title = title;
  }
  if (body.kind !== undefined) {
    if (!(ASSESSMENT_KINDS as readonly string[]).includes(String(body.kind))) return c.json({ error: "Unknown kind." }, 422);
    patch.kind = String(body.kind);
  }
  if (body.dueOn !== undefined) {
    const date = cleanDate(body.dueOn);
    if (date === undefined) return c.json({ error: "Use a real date." }, 422);
    patch.dueOn = date;
  }
  if (body.weight !== undefined) patch.weight = clip(body.weight, 40);
  if (Object.keys(patch).length === 0) return c.json({ ok: true });
  const updated = await db(c.env.DB)
    .update(schema.subjectAssessments)
    .set(patch)
    .where(and(eq(schema.subjectAssessments.id, c.req.param("id")), eq(schema.subjectAssessments.userId, userId)))
    .returning({ id: schema.subjectAssessments.id });
  if (updated.length === 0) return c.json({ error: "Assessment not found." }, 404);
  return c.json({ ok: true });
});

assessments.delete("/:id", async (c) => {
  const { userId } = c.get("session");
  const deleted = await db(c.env.DB)
    .delete(schema.subjectAssessments)
    .where(and(eq(schema.subjectAssessments.id, c.req.param("id")), eq(schema.subjectAssessments.userId, userId)))
    .returning({ id: schema.subjectAssessments.id });
  if (deleted.length === 0) return c.json({ error: "Assessment not found." }, 404);
  return c.json({ ok: true });
});

// Rough prep time Arcad starts from; the student can change the deadline's estimate.
const PREP_MINUTES: Record<string, number> = { exam: 360, assignment: 300, test: 180, prac: 180, other: 120 };

/** Turns an assessment into a deadline the planner schedules work for. */
assessments.post("/:id/deadline", async (c) => {
  const { userId } = c.get("session");
  const database = db(c.env.DB);
  const [item] = await database
    .select()
    .from(schema.subjectAssessments)
    .where(and(eq(schema.subjectAssessments.id, c.req.param("id")), eq(schema.subjectAssessments.userId, userId)))
    .limit(1);
  if (!item) return c.json({ error: "Assessment not found." }, 404);
  if (item.taskId) return c.json({ ok: true, taskId: item.taskId });
  if (!item.dueOn) return c.json({ error: "Give it a due date first." }, 422);

  const [[subject], [profile]] = await Promise.all([
    database.select().from(schema.subjects).where(eq(schema.subjects.id, item.subjectId)).limit(1),
    database.select().from(schema.profiles).where(eq(schema.profiles.userId, userId)).limit(1),
  ]);
  const timezone = profile?.timezone ?? "Australia/Brisbane";
  // Due at the start of the school day, so the work lands before it.
  const dueAt = startOfLocalDay(Date.parse(`${item.dueOn}T12:00:00Z`), timezone) + 8.5 * HOUR;
  if (dueAt <= Date.now()) return c.json({ error: "That's already passed." }, 422);

  const taskId = newId("tsk");
  await runBatch(database, [
    database.insert(schema.tasks).values({
      id: taskId,
      userId,
      title: item.title,
      subject: subject?.name ?? null,
      taskType: item.kind,
      dueAt,
      estimatedMinutes: PREP_MINUTES[item.kind] ?? 120,
    }),
    database.update(schema.subjectAssessments).set({ taskId }).where(eq(schema.subjectAssessments.id, item.id)),
  ]);
  await replan(database, userId);
  return c.json({ ok: true, taskId }, 201);
});
