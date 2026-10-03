import { and, eq } from "drizzle-orm";
import { db, schema } from "../db";
import { newId } from "./ids";
import { termWeek } from "./terms";

export interface CatalogTopic {
  title: string; detail: string | null; startsOn: string | null; endsOn: string | null;
  startTerm: number | string | null; startWeek: number | string | null;
  endTerm: number | string | null; endWeek: number | string | null; sourceReference: string | null;
}
export interface CatalogAssessment {
  title: string; kind: string; dueOn: string | null; dueLabel: string | null;
  dueTerm: number | string | null; dueWeek: number | string | null;
  weight: string | null; sourceReference: string | null;
}
export interface CatalogRow {
  id: string; country_code: string; state_code: string | null; authority: string;
  subject: string; version_identifier: string; year_levels: string;
  source_title: string; source_url: string | null; source_license: string | null;
  source_attribution: string | null; document_sha256: string | null;
  topics_json: string; assessments_json: string;
}

const key = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, "");
const aliases: Record<string, string> = {
  mathmethods: "mathematicalmethods", mathsmethods: "mathematicalmethods",
  methods: "mathematicalmethods", generalmaths: "generalmathematics",
  generalmath: "generalmathematics", specialistmaths: "specialistmathematics",
  specialistmath: "specialistmathematics",
};
export const catalogSubjectKey = (value: string) => aliases[key(value)] ?? key(value);
const yearNumber = (grade: string | null) => grade?.match(/(?:year\s*)?(1[012])\b/i)?.[1] ?? null;
const parse = <T>(value: string): T[] => {
  try { const parsed: unknown = JSON.parse(value); return Array.isArray(parsed) ? parsed as T[] : []; }
  catch { return []; }
};

export async function catalogByHash(d1: D1Database, hash: string): Promise<CatalogRow | null> {
  return await d1.prepare("SELECT * FROM syllabus_catalog WHERE document_sha256 = ? LIMIT 1").bind(hash).first<CatalogRow>();
}

export async function catalogMatches(d1: D1Database, profile: typeof schema.profiles.$inferSelect, subjectName: string): Promise<CatalogRow[]> {
  const year = yearNumber(profile.grade);
  const country = profile.country ?? (profile.state ? "AU" : null);
  if (!country || !year || (country === "AU" && !profile.state)) return [];
  const rows = await d1.prepare("SELECT * FROM syllabus_catalog WHERE country_code = ? AND (state_code IS NULL OR state_code = ?) ORDER BY created_at DESC")
    .bind(country, country === "AU" ? profile.state : "").all<CatalogRow>();
  return rows.results.filter((row) => catalogSubjectKey(row.subject) === catalogSubjectKey(subjectName) && parse<string>(row.year_levels).some((level) => (level.match(/1[012]/)?.[0] ?? level) === year));
}

export function catalogSummary(row: CatalogRow) {
  return {
    id: row.id, subject: row.subject, authority: row.authority,
    versionIdentifier: row.version_identifier, countryCode: row.country_code,
    stateCode: row.state_code, yearLevels: parse<string>(row.year_levels),
    sourceTitle: row.source_title, sourceUrl: row.source_url,
    sourceLicense: row.source_license, sourceAttribution: row.source_attribution,
    topics: parse<CatalogTopic>(row.topics_json).length,
    assessments: parse<CatalogAssessment>(row.assessments_json).length,
  };
}

const number = (value: number | string | null) => value === null ? null : Number(value);
const termDate = (state: string | null, year: number, term: number | string | null, week: number | string | null, edge: "start" | "end") => {
  const t = number(term), w = number(week);
  return t && w ? termWeek(state, year, t, w)?.[edge] ?? null : null;
};

/** Copy a template into the student's editable tables, replacing syllabus rows only. */
export async function installCatalogSyllabus(d1: D1Database, userId: string, subjectId: string, row: CatalogRow, state: string | null, today: string, uploaded?: { id: string; filename: string; contentType: string; bytes: number; storageKey: string | null }) {
  const database = db(d1);
  const year = Number(today.slice(0, 4));
  const now = Date.now();
  const topics = parse<CatalogTopic>(row.topics_json).slice(0, 80);
  const assessments = parse<CatalogAssessment>(row.assessments_json).slice(0, 40);
  const old = await database.select().from(schema.subjectFiles).where(and(eq(schema.subjectFiles.subjectId, subjectId), eq(schema.subjectFiles.kind, "syllabus")));
  const kept = await database.select({ title: schema.subjectAssessments.title, source: schema.subjectAssessments.source, taskId: schema.subjectAssessments.taskId })
    .from(schema.subjectAssessments).where(eq(schema.subjectAssessments.subjectId, subjectId));
  const keptTitles = new Set(kept.filter((item) => item.source !== "syllabus" || item.taskId).map((item) => item.title.toLowerCase()));
  const writes: D1PreparedStatement[] = [];
  writes.push(d1.prepare("DELETE FROM subject_files WHERE subject_id = ? AND user_id = ? AND kind = 'syllabus'").bind(subjectId, userId));
  writes.push(d1.prepare("DELETE FROM subject_topics WHERE subject_id = ? AND user_id = ? AND source = 'syllabus'").bind(subjectId, userId));
  writes.push(d1.prepare("DELETE FROM subject_assessments WHERE subject_id = ? AND user_id = ? AND source = 'syllabus' AND task_id IS NULL").bind(subjectId, userId));
  const fileId = uploaded?.id ?? newId("sfl");
  writes.push(d1.prepare("INSERT INTO subject_files (id,user_id,subject_id,kind,filename,content_type,bytes,storage_key,summary,status,created_at) VALUES (?,?,?,'syllabus',?,?,?,?,?,'read',?)")
    .bind(fileId, userId, subjectId, uploaded?.filename ?? row.source_title, uploaded?.contentType ?? "application/pdf", uploaded?.bytes ?? 0, uploaded?.storageKey ?? null, `${topics.length} topics, ${assessments.length} assessments`, now));
  topics.forEach((topic, position) => {
    const start = topic.startsOn ?? termDate(state, year, topic.startTerm, topic.startWeek, "start");
    const end = topic.endsOn ?? termDate(state, year, topic.endTerm ?? topic.startTerm, topic.endWeek ?? topic.startWeek, "end") ?? start;
    writes.push(d1.prepare("INSERT INTO subject_topics (id,user_id,subject_id,title,detail,starts_on,ends_on,position,source,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)")
      .bind(newId("top"), userId, subjectId, topic.title, topic.detail ?? "", start, end, position, "syllabus", now));
  });
  assessments.filter((item) => !keptTitles.has(item.title.toLowerCase())).forEach((item) => {
    const due = item.dueOn ?? termDate(state, year, item.dueTerm, item.dueWeek, "start");
    const dueLabel = item.dueLabel || (item.dueTerm && item.dueWeek ? `Term ${item.dueTerm}, Week ${item.dueWeek}` : "");
    writes.push(d1.prepare("INSERT INTO subject_assessments (id,user_id,subject_id,title,kind,due_on,due_label,weight,task_id,source,created_at) VALUES (?,?,?,?,?,?,?,?,NULL,?,?)")
      .bind(newId("asm"), userId, subjectId, item.title, item.kind, due, dueLabel, item.weight ?? "", "syllabus", now));
  });
  await d1.batch(writes);
  return { fileId, topics: topics.length, assessments: assessments.length, oldStorageKeys: old.map((file) => file.storageKey).filter((key): key is string => Boolean(key)) };
}
