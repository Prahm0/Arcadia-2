import { Buffer } from "node:buffer";
import type { Env } from "../types";
import { completeJson, type ContentPart } from "./openai";
import { hasTermDates, termWeek } from "./terms";

export const MATERIAL_TYPES: Record<string, "pdf" | "image" | "text"> = {
  "application/pdf": "pdf",
  "image/png": "image",
  "image/jpeg": "image",
  "image/webp": "image",
  "text/plain": "text",
  "text/markdown": "text",
};
export const MATERIAL_MAX_BYTES = 8 * 1024 * 1024;

export const ASSESSMENT_KINDS = ["exam", "assignment", "test", "prac", "other"] as const;
export type AssessmentKind = (typeof ASSESSMENT_KINDS)[number];

export interface TopicRow {
  title: string;
  detail: string;
  startsOn: string | null;
  endsOn: string | null;
}

export interface AssessmentRow {
  title: string;
  kind: AssessmentKind;
  dueOn: string | null;
  dueLabel: string;
  weight: string;
}

interface SyllabusReply {
  year: number | null;
  topics: Array<{
    title: string;
    detail: string;
    startDate: string | null;
    endDate: string | null;
    term: number | null;
    startWeek: number | null;
    endWeek: number | null;
  }>;
  assessments: Array<{
    title: string;
    kind: string;
    dueDate: string | null;
    term: number | null;
    week: number | null;
    weight: string | null;
  }>;
}

const nullable = (type: string) => ({ type: [type, "null"] });

const SYLLABUS_SCHEMA = {
  name: "course_map",
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["year", "topics", "assessments"],
    properties: {
      year: nullable("integer"),
      topics: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["title", "detail", "startDate", "endDate", "term", "startWeek", "endWeek"],
          properties: {
            title: { type: "string" },
            detail: { type: "string" },
            startDate: nullable("string"),
            endDate: nullable("string"),
            term: nullable("integer"),
            startWeek: nullable("integer"),
            endWeek: nullable("integer"),
          },
        },
      },
      assessments: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["title", "kind", "dueDate", "term", "week", "weight"],
          properties: {
            title: { type: "string" },
            kind: { type: "string", enum: [...ASSESSMENT_KINDS] },
            dueDate: nullable("string"),
            term: nullable("integer"),
            week: nullable("integer"),
            weight: nullable("string"),
          },
        },
      },
    },
  },
};

const RESOURCE_SCHEMA = {
  name: "resource_outline",
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["summary"],
    properties: { summary: { type: "string" } },
  },
};

/** The file as a message part the model can read. */
export function filePart(bytes: ArrayBuffer, contentType: string, filename: string): ContentPart {
  const kind = MATERIAL_TYPES[contentType];
  if (kind === "text") {
    return { type: "text", text: new TextDecoder().decode(bytes).slice(0, 60_000) };
  }
  const data = `data:${contentType};base64,${Buffer.from(bytes).toString("base64")}`;
  return kind === "image"
    ? { type: "image_url", image_url: { url: data } }
    : { type: "file", file: { filename, file_data: data } };
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const cleanDate = (value: string | null | undefined) => (value && ISO_DATE.test(value) ? value : null);
const clip = (value: unknown, max: number) => String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);

/**
 * Reads a unit outline, assessment schedule or syllabus into a topic map:
 * what's taught when, and what's assessed when. Dates written as term and
 * week are pinned using the student's state's term dates.
 */
export async function readSyllabus(
  env: Env,
  file: { bytes: ArrayBuffer; contentType: string; filename: string },
  context: { subject: string; state: string | null; today: string },
): Promise<{ topics: TopicRow[]; assessments: AssessmentRow[] } | null> {
  const thisYear = Number(context.today.slice(0, 4));
  const reply = await completeJson<SyllabusReply>(
    env,
    [
      {
        role: "system",
        content: [
          "You turn Australian school course documents (unit outlines, assessment schedules, syllabuses) into a course map for a study planner.",
          "Topics: what is taught, in teaching order, with the textbook chapter or syllabus section in the title when the document gives one (e.g. \"3.2 Limiting reagents\"). Keep titles under 60 characters and detail under 120.",
          "Assessments: every exam, assignment, test, prac or task with its due date. Include the weighting when stated.",
          "Dates: if the document gives a calendar date, put it in startDate/endDate/dueDate as YYYY-MM-DD and leave term/week null. If it only says a term and week, set term and startWeek/endWeek (or week) and leave the date null. If it says neither, leave all of them null. Never guess.",
          "Set year only if the document states which school year it's for.",
          "Only include what the document actually says.",
        ].join("\n"),
      },
      {
        role: "user",
        content: [
          { type: "text", text: `Subject: ${context.subject}. Today is ${context.today}.` },
          filePart(file.bytes, file.contentType, file.filename),
        ],
      },
    ],
    SYLLABUS_SCHEMA,
    3000,
  );
  if (!reply) return null;

  const year = reply.year && reply.year >= thisYear - 1 && reply.year <= thisYear + 1 ? reply.year : thisYear;
  const span = (term: number | null, start: number | null, end: number | null) => {
    if (!term || !start || !hasTermDates(context.state, year)) return null;
    const first = termWeek(context.state, year, term, start);
    const last = termWeek(context.state, year, term, end ?? start);
    return first ? { start: first.start, end: (last ?? first).end } : null;
  };

  const topics = (reply.topics ?? []).slice(0, 80).flatMap((topic): TopicRow[] => {
    const title = clip(topic.title, 80);
    if (!title) return [];
    const weeks = span(topic.term, topic.startWeek, topic.endWeek);
    return [
      {
        title,
        detail: clip(topic.detail, 200),
        startsOn: cleanDate(topic.startDate) ?? weeks?.start ?? null,
        endsOn: cleanDate(topic.endDate) ?? cleanDate(topic.startDate) ?? weeks?.end ?? null,
      },
    ];
  });

  const assessments = (reply.assessments ?? []).slice(0, 40).flatMap((item): AssessmentRow[] => {
    const title = clip(item.title, 120);
    if (!title) return [];
    // Due "in week 8": plan to the start of that week rather than risk the end.
    const week = span(item.term, item.week, item.week);
    return [
      {
        title,
        kind: (ASSESSMENT_KINDS as readonly string[]).includes(item.kind) ? (item.kind as AssessmentKind) : "other",
        dueOn: cleanDate(item.dueDate) ?? week?.start ?? null,
        dueLabel: item.term && item.week ? `Term ${item.term}, Week ${item.week}` : "",
        weight: clip(item.weight, 40),
      },
    ];
  });

  return { topics, assessments };
}

/** What a textbook, handout or set of notes covers, in a couple of lines. */
export async function readResource(
  env: Env,
  file: { bytes: ArrayBuffer; contentType: string; filename: string },
  subject: string,
): Promise<string | null> {
  const reply = await completeJson<{ summary: string }>(
    env,
    [
      {
        role: "system",
        content:
          "You note what a student's study resource covers so a planner can point them to the right part. In under 400 characters: what it is, then its chapters or sections with their numbers (e.g. \"Jacaranda Chemistry 12. Ch 3 Stoichiometry: 3.1 moles, 3.2 limiting reagents…\"). No commentary.",
      },
      {
        role: "user",
        content: [{ type: "text", text: `Subject: ${subject}. File: ${file.filename}.` }, filePart(file.bytes, file.contentType, file.filename)],
      },
    ],
    RESOURCE_SCHEMA,
    300,
  );
  return reply?.summary ? clip(reply.summary, 500) : null;
}

/** The topic being taught on `today` (or the next one if between topics). */
export function currentTopic<T extends { startsOn: string | null; endsOn: string | null }>(
  topics: T[],
  today: string,
): { topic: T; upcoming: boolean } | null {
  const dated = topics.filter((topic) => topic.startsOn);
  const now = dated.find((topic) => topic.startsOn! <= today && (topic.endsOn ?? topic.startsOn!) >= today);
  if (now) return { topic: now, upcoming: false };
  const next = dated
    .filter((topic) => topic.startsOn! > today)
    .sort((a, b) => a.startsOn!.localeCompare(b.startsOn!))[0];
  return next ? { topic: next, upcoming: true } : null;
}
