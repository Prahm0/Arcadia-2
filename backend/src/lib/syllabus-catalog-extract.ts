import type { Env } from "../types";
import { completeJson, isReasoningModel } from "./openai";
import { filePart, ASSESSMENT_KINDS, type AssessmentKind, type AssessmentRow, type TopicRow } from "./syllabus";
import { termWeek } from "./terms";
import { SYLLABUS_CATALOG_PROMPT } from "./syllabus-catalog-prompt";
import { catalogSubjectKey, type CatalogAssessment, type CatalogTopic } from "./syllabus-catalog";

const nullable = (type: string) => ({ type: [type, "null"] });
const string = { type: "string" };
const integer = nullable("integer");
const nullableString = nullable("string");
const object = (properties: Record<string, unknown>) => ({ type: "object", additionalProperties: false, required: Object.keys(properties), properties });

const metadata = {
  country: string, countryCode: nullableString, stateOrRegion: nullableString,
  stateOrRegionCode: nullableString, authority: string, authorityCode: nullableString,
  subject: string, subjectCode: nullableString, versionIdentifier: string,
  versionLabel: nullableString, publicationYear: integer, effectiveFrom: nullableString,
  effectiveTo: nullableString, yearLevels: { type: "array", items: string },
  yearLevelNote: string, sourceTitle: string, sourceFilename: string,
  sourceUrl: nullableString, sourceLicense: nullableString,
  sourceAttribution: nullableString, sourcePrintedPages: nullableString,
};
const topic = {
  title: string, detail: string, startDate: nullableString, endDate: nullableString,
  term: integer, startWeek: integer, endWeek: integer, sourceReference: string,
};
const assessment = {
  title: string, kind: { type: "string", enum: [...ASSESSMENT_KINDS] },
  dueDate: nullableString, term: integer, week: integer, weight: nullableString,
  sourceReference: string,
};
const SCHEMA = {
  name: "syllabus_catalog_extraction",
  schema: object({
    metadata: object(metadata),
    arcadiaExtraction: object({
      year: integer,
      topics: { type: "array", items: object(topic) },
      assessments: { type: "array", items: object(assessment) },
    }),
    review: object({
      status: { type: "string", enum: ["complete", "partial", "needs_review"] },
      issues: { type: "array", items: string },
      checksPerformed: { type: "array", items: string },
    }),
  }),
};

interface Reply {
  metadata: {
    country: string; countryCode: string | null; stateOrRegion: string | null;
    stateOrRegionCode: string | null; authority: string; authorityCode: string | null;
    subject: string; subjectCode: string | null; versionIdentifier: string;
    versionLabel: string | null; publicationYear: number | null;
    effectiveFrom: string | null; effectiveTo: string | null; yearLevels: string[];
    yearLevelNote: string; sourceTitle: string; sourceFilename: string;
    sourceUrl: string | null; sourceLicense: string | null;
    sourceAttribution: string | null; sourcePrintedPages: string | null;
  };
  arcadiaExtraction: {
    year: number | null;
    topics: Array<{ title: string; detail: string; startDate: string | null; endDate: string | null; term: number | null; startWeek: number | null; endWeek: number | null; sourceReference: string }>;
    assessments: Array<{ title: string; kind: AssessmentKind; dueDate: string | null; term: number | null; week: number | null; weight: string | null; sourceReference: string }>;
  };
  review: { status: string; issues: string[]; checksPerformed: string[] };
}

const clip = (value: unknown, max: number) => String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
const date = (value: string | null) => value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
const sourceUrl = (value: string | null) => {
  try { const url = new URL(value ?? ""); return url.protocol === "https:" ? url.toString() : null; }
  catch { return null; }
};

export interface CatalogExtraction {
  topics: TopicRow[]; assessments: AssessmentRow[];
  catalogTopics: CatalogTopic[]; catalogAssessments: CatalogAssessment[];
  metadata: Reply["metadata"];
  reviewStatus: string;
}

export async function extractCatalogSyllabus(
  env: Env,
  userId: string,
  file: { bytes: ArrayBuffer; contentType: string; filename: string },
  context: { subject: string; country: string | null; state: string | null; grade: string | null; today: string },
): Promise<CatalogExtraction | null> {
  // The usage tag is read by the AI spend PR when it lands. Keeping it here
  // makes this route compatible with both its current and upcoming API.
  const model = (env as Env & { OPENAI_DOCUMENT_MODEL?: string }).OPENAI_DOCUMENT_MODEL || env.OPENAI_MODEL || "gpt-4o-mini";
  const options = { usage: { feature: "syllabus" as const, userId }, model, reasoningEffort: "low" as const };
  const reply = await completeJson<Reply>(env, [
    { role: "system", content: SYLLABUS_CATALOG_PROMPT },
    { role: "user", content: [
      { type: "text", text: `Extract this syllabus for the Arcadia syllabus catalogue. Known context supplied by the operator: Filename: ${file.filename}. Official source URL: null. Verified context: student's selected subject ${context.subject}; profile country ${context.country ?? "not set"}, state ${context.state ?? "not set"}, year level ${context.grade ?? "not set"}. This profile is matching context, not proof of the document's identity. The document is attached.` },
      filePart(file.bytes, file.contentType, file.filename),
    ] },
  ], SCHEMA, isReasoningModel(model) ? 11_000 : 9_000, options);
  if (!reply?.arcadiaExtraction || !reply.metadata) return null;
  const year = Number(context.today.slice(0, 4));
  const span = (term: number | null, start: number | null, end: number | null) => {
    if (!term || !start) return null;
    const first = termWeek(context.state, year, term, start);
    const last = termWeek(context.state, year, term, end ?? start);
    return first ? { start: first.start, end: (last ?? first).end } : null;
  };
  const catalogTopics: CatalogTopic[] = (reply.arcadiaExtraction.topics ?? []).slice(0, 80).flatMap((item) => {
    const title = clip(item.title, 80);
    return title ? [{ title, detail: clip(item.detail, 200), startsOn: date(item.startDate), endsOn: date(item.endDate), startTerm: item.term, startWeek: item.startWeek, endTerm: item.term, endWeek: item.endWeek, sourceReference: clip(item.sourceReference, 80) }] : [];
  });
  const catalogAssessments: CatalogAssessment[] = (reply.arcadiaExtraction.assessments ?? []).slice(0, 40).flatMap((item) => {
    const title = clip(item.title, 120);
    return title ? [{ title, kind: ASSESSMENT_KINDS.includes(item.kind) ? item.kind : "other", dueOn: date(item.dueDate), dueLabel: item.term && item.week ? `Term ${item.term}, Week ${item.week}` : "", dueTerm: item.term, dueWeek: item.week, weight: clip(item.weight, 40), sourceReference: clip(item.sourceReference, 80) }] : [];
  });
  const topics: TopicRow[] = catalogTopics.map((item) => {
    const weeks = span(Number(item.startTerm) || null, Number(item.startWeek) || null, Number(item.endWeek) || null);
    return { title: item.title, detail: item.detail ?? "", startsOn: item.startsOn ?? weeks?.start ?? null, endsOn: item.endsOn ?? item.startsOn ?? weeks?.end ?? null };
  });
  const assessments: AssessmentRow[] = catalogAssessments.map((item) => {
    const weeks = span(Number(item.dueTerm) || null, Number(item.dueWeek) || null, null);
    return { title: item.title, kind: item.kind as AssessmentKind, dueOn: item.dueOn ?? weeks?.start ?? null, dueLabel: item.dueLabel ?? "", weight: item.weight ?? "" };
  });
  reply.metadata.sourceUrl = sourceUrl(reply.metadata.sourceUrl);
  reply.metadata.yearLevels = [...new Set(reply.metadata.yearLevels.map((level) => level.match(/1[012]/)?.[0] ?? level))];
  return { topics, assessments, catalogTopics, catalogAssessments, metadata: reply.metadata, reviewStatus: reply.review?.status ?? "partial" };
}

/** Cache identified syllabus extracts with a licence or source URL. */
export function canShareExtraction(result: CatalogExtraction, subject: string) {
  const meta = result.metadata;
  const expected = catalogSubjectKey(subject);
  const actual = catalogSubjectKey(meta.subject);
  return Boolean(
    result.reviewStatus !== "needs_review" && meta.countryCode && meta.authority &&
    meta.versionIdentifier && meta.yearLevels.length && (meta.sourceLicense || meta.sourceUrl) &&
    (actual === expected || (actual.includes(expected) && expected.length >= 6)) &&
    (result.catalogTopics.length || result.catalogAssessments.length),
  );
}
