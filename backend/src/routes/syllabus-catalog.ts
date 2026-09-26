import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import { db, schema } from "../db";
import { newId } from "../lib/ids";
import { aiConfigured } from "../lib/openai";
import { MATERIAL_MAX_BYTES, MATERIAL_TYPES } from "../lib/syllabus";
import { canShareExtraction, extractCatalogSyllabus } from "../lib/syllabus-catalog-extract";
import { catalogByHash, catalogMatches, catalogSubjectKey, catalogSummary, installCatalogSyllabus, type CatalogRow } from "../lib/syllabus-catalog";
import { getUserTier, isPaidTier } from "../lib/tiers";
import { localDateKey } from "../lib/time";
import type { Env, Variables } from "../types";

const catalog = new Hono<{ Bindings: Env; Variables: Variables }>();

async function context(d1: D1Database, userId: string, subjectId: string) {
  const database = db(d1);
  const [[subject], [profile]] = await Promise.all([
    database.select().from(schema.subjects).where(and(eq(schema.subjects.id, subjectId), eq(schema.subjects.userId, userId))).limit(1),
    database.select().from(schema.profiles).where(eq(schema.profiles.userId, userId)).limit(1),
  ]);
  return { subject, profile };
}

catalog.get("/:id/syllabi", async (c) => {
  const { userId } = c.get("session");
  const { subject, profile } = await context(c.env.DB, userId, c.req.param("id"));
  if (!subject || !profile) return c.json({ error: "Subject not found." }, 404);
  const matches = await catalogMatches(c.env.DB, profile, subject.name);
  return c.json({ syllabi: matches.map(catalogSummary), needsProfile: !profile.country || !profile.grade || (profile.country === "AU" && !profile.state) });
});

catalog.post("/:id/syllabi/:syllabusId", async (c) => {
  const { userId } = c.get("session");
  const subjectId = c.req.param("id");
  const { subject, profile } = await context(c.env.DB, userId, subjectId);
  if (!subject || !profile) return c.json({ error: "Subject not found." }, 404);
  const matches = await catalogMatches(c.env.DB, profile, subject.name);
  const selected = matches.find((row) => row.id === c.req.param("syllabusId"));
  if (!selected) return c.json({ error: "This syllabus doesn't match your subject and profile." }, 404);
  if (!isPaidTier(await getUserTier(db(c.env.DB), userId))) {
    return c.json({ error: "Adding a syllabus is on Pro and Max. You can still add topics yourself.", code: "upgrade_required" }, 402);
  }
  const result = await installCatalogSyllabus(c.env.DB, userId, subjectId, selected, profile.state, localDateKey(Date.now(), profile.timezone));
  for (const key of result.oldStorageKeys) await c.env.UPLOADS?.delete(key);
  return c.json({ ok: true, topics: result.topics, assessments: result.assessments }, 201);
});

/** Personal syllabus upload. Public, licence identifiable extractions are reused by SHA-256. */
catalog.post("/:id/files", async (c) => {
  const { userId } = c.get("session");
  const subjectId = c.req.param("id");
  if (!isPaidTier(await getUserTier(db(c.env.DB), userId))) {
    return c.json({ error: "Syllabus uploads are on Pro and Max. You can still add topics yourself.", code: "upgrade_required" }, 402);
  }
  const { subject, profile } = await context(c.env.DB, userId, subjectId);
  if (!subject || !profile) return c.json({ error: "Subject not found." }, 404);
  const filename = (c.req.query("filename") ?? "syllabus").replace(/\s+/g, " ").trim().slice(0, 200);
  let contentType = (c.req.header("content-type") ?? "").split(";")[0].trim().toLowerCase();
  if (!MATERIAL_TYPES[contentType]) {
    if (/\.md$/i.test(filename)) contentType = "text/markdown";
    else if (/\.txt$/i.test(filename)) contentType = "text/plain";
  }
  if (!MATERIAL_TYPES[contentType]) return c.json({ error: "Arcad can read PDFs, photos (PNG, JPG, WebP) and text files." }, 415);
  const bytes = await c.req.arrayBuffer();
  if (!bytes.byteLength) return c.json({ error: "That file is empty." }, 422);
  if (bytes.byteLength > MATERIAL_MAX_BYTES) return c.json({ error: "Keep it under 8 MB." }, 413);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const hash = Array.from(new Uint8Array(digest), (part) => part.toString(16).padStart(2, "0")).join("");
  const today = localDateKey(Date.now(), profile.timezone);
  const cached = await catalogByHash(c.env.DB, hash);
  let selected: CatalogRow | null = cached && catalogSubjectKey(cached.subject) === catalogSubjectKey(subject.name) ? cached : null;
  let extraction: Awaited<ReturnType<typeof extractCatalogSyllabus>> = null;
  if (!selected && aiConfigured(c.env)) {
    try {
      extraction = await extractCatalogSyllabus(c.env, userId, { bytes, contentType, filename }, {
        subject: subject.name, country: profile.country, state: profile.state, grade: profile.grade, today,
      });
      if (extraction && (extraction.topics.length || extraction.assessments.length)) {
        const meta = extraction.metadata;
        selected = {
          id: newId("cat"), country_code: meta.countryCode ?? profile.country ?? "",
          state_code: meta.stateOrRegionCode, authority: meta.authority,
          subject: meta.subject || subject.name, version_identifier: meta.versionIdentifier,
          year_levels: JSON.stringify(meta.yearLevels), source_title: meta.sourceTitle || filename,
          source_url: meta.sourceUrl, source_license: meta.sourceLicense,
          source_attribution: meta.sourceAttribution, document_sha256: hash,
          topics_json: JSON.stringify(extraction.catalogTopics),
          assessments_json: JSON.stringify(extraction.catalogAssessments),
        };
      }
    } catch (error) { console.error("[syllabus] reading failed", error); }
  }

  // Keep the student's original if R2 is configured, just as resource uploads do.
  const fileId = newId("sfl");
  const storageKey = c.env.UPLOADS ? `${userId}/subjects/${subjectId}/${fileId}` : null;
  if (storageKey) await c.env.UPLOADS!.put(storageKey, bytes, { httpMetadata: { contentType } });
  let read = false;
  let topics = 0;
  let assessments = 0;
  if (selected) {
    try {
      const result = await installCatalogSyllabus(c.env.DB, userId, subjectId, selected, profile.state, today, { id: fileId, filename, contentType, bytes: bytes.byteLength, storageKey });
      read = result.topics + result.assessments > 0;
      topics = result.topics;
      assessments = result.assessments;
      for (const key of result.oldStorageKeys) await c.env.UPLOADS?.delete(key);
    } catch (error) {
      if (storageKey) await c.env.UPLOADS?.delete(storageKey);
      throw error;
    }
  } else {
    // Preserve the existing upload behaviour when Arcad cannot read a file.
    const database = db(c.env.DB);
    const old = await database.select({ storageKey: schema.subjectFiles.storageKey }).from(schema.subjectFiles)
      .where(and(eq(schema.subjectFiles.subjectId, subjectId), eq(schema.subjectFiles.userId, userId), eq(schema.subjectFiles.kind, "syllabus")));
    try {
      await c.env.DB.batch([
        c.env.DB.prepare("DELETE FROM subject_files WHERE subject_id = ? AND user_id = ? AND kind = 'syllabus'").bind(subjectId, userId),
        c.env.DB.prepare("INSERT INTO subject_files (id,user_id,subject_id,kind,filename,content_type,bytes,storage_key,summary,status,created_at) VALUES (?,?,?,'syllabus',?,?,?,?,'','unread',?)")
          .bind(fileId, userId, subjectId, filename, contentType, bytes.byteLength, storageKey, Date.now()),
      ]);
    } catch (error) {
      if (storageKey) await c.env.UPLOADS?.delete(storageKey);
      throw error;
    }
    for (const item of old) if (item.storageKey) await c.env.UPLOADS?.delete(item.storageKey);
  }

  if (selected && extraction && canShareExtraction(extraction, subject.name)) {
    try {
      await c.env.DB.prepare("INSERT OR IGNORE INTO syllabus_catalog (id,country_code,state_code,authority,subject,version_identifier,year_levels,source_title,source_url,source_license,source_attribution,document_sha256,topics_json,assessments_json,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
        .bind(selected.id, selected.country_code, selected.state_code, selected.authority, selected.subject,
          selected.version_identifier, selected.year_levels, selected.source_title, selected.source_url,
          selected.source_license, selected.source_attribution, hash, selected.topics_json,
          selected.assessments_json, Date.now()).run();
    } catch (error) { console.error("[syllabus] public catalogue cache failed", error); }
  }
  return c.json({ file: {
    id: fileId, kind: "syllabus", filename, contentType, bytes: bytes.byteLength,
    summary: read ? `${topics} topics, ${assessments} assessments` : "", read,
    stored: Boolean(storageKey), createdAt: new Date().toISOString(),
  }, read, topics, assessments,
  message: read ? undefined : aiConfigured(c.env) ? "Arcad couldn't make sense of that one. Add the topics yourself below, or try a clearer copy." : "Arcad isn't switched on here, so add the topics yourself below." }, 201);
});

export default catalog;
