/**
 * Reading a student's own work and tagging it to syllabus dot points. Two
 * model calls: read the page (handwriting included) into a transcript, then
 * mark that transcript against the subject's dot points with a fixed rubric.
 *
 * No database or env access, and the model call is passed in, so the eval
 * harness (backend/eval/run.mjs) runs exactly this code against real work
 * and the worker runs it through completeJson.
 *
 * Bump TAGGING_PROMPT_VERSION on every change to the prompts or schemas: it's
 * stamped on each row, and the eval results are filed under it.
 */
import { Buffer } from "node:buffer";

export const TAGGING_PROMPT_VERSION = "v1";

export const WORK_TYPES: Record<string, "pdf" | "image" | "text"> = {
  "application/pdf": "pdf",
  "image/png": "image",
  "image/jpeg": "image",
  "image/webp": "image",
  "text/plain": "text",
  "text/markdown": "text",
};

type Part =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } }
  | { type: "file"; file: { filename: string; file_data: string } };

export interface Message {
  role: "system" | "user";
  content: string | Part[];
}

export interface JsonSchema {
  name: string;
  schema: Record<string, unknown>;
}

/** One structured model call. Returns null when the reply couldn't be parsed. */
export type JsonCall = <T>(step: "read" | "tag", messages: Message[], schema: JsonSchema, reply: number) => Promise<T | null>;

export interface WorkFile {
  bytes: ArrayBuffer | Uint8Array;
  contentType: string;
  filename: string;
}

export interface PointRef {
  id: string;
  unit: number;
  topicTitle: string;
  subtopic: string;
  text: string;
}

export interface Reading {
  readable: boolean;
  /** Pages of work the model saw. */
  pages: number;
  /** Is this the student's own attempt at questions, or notes / copied examples? */
  kind: "attempt" | "notes" | "other";
  transcript: string;
}

export interface Tag {
  pointId: string;
  /** 0, 25, 50, 75 or 100 by the rubric. */
  quality: number;
  questions: number;
  evidence: string;
}

const TRANSCRIPT_MAX = 20_000;

export function workPart(file: WorkFile): Part {
  const kind = WORK_TYPES[file.contentType];
  if (kind === "text") {
    return { type: "text", text: new TextDecoder().decode(file.bytes).slice(0, 60_000) };
  }
  const data = `data:${file.contentType};base64,${Buffer.from(file.bytes as ArrayBuffer).toString("base64")}`;
  return kind === "image"
    ? { type: "image_url", image_url: { url: data } }
    : { type: "file", file: { filename: file.filename, file_data: data } };
}

const READ_SCHEMA: JsonSchema = {
  name: "work_reading",
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["readable", "pages", "kind", "transcript"],
    properties: {
      readable: { type: "boolean" },
      pages: { type: "integer" },
      kind: { type: "string", enum: ["attempt", "notes", "other"] },
      transcript: { type: "string" },
    },
  },
};

const READ_PROMPT = [
  "You transcribe a high school maths student's own work (photos of handwriting, scans or typed files) so it can be marked.",
  "Write out everything they wrote, in order, including all working, crossed-out attempts marked [crossed out], and any teacher marks or ticks marked [teacher: ...].",
  "Number each question as the student did (Q1, 2b, ...). Write maths in plain linear form: x^2, sqrt(x), (a)/(b), d/dx, int f(x) dx, e^(2x), ln(x), sin(x), pi.",
  "Do not correct mistakes, fill gaps or solve anything: copy what is on the page, even when it is wrong.",
  "If a part can't be read, write [illegible]. Set readable false only if almost nothing can be read.",
  "kind: attempt = the student working through questions; notes = class notes, summaries or copied worked examples; other = anything else.",
].join(" ");

/** Step 1: the page as text. */
export async function readWork(call: JsonCall, file: WorkFile, subject: string): Promise<Reading | null> {
  const reply = await call<Reading>(
    "read",
    [
      { role: "system", content: READ_PROMPT },
      { role: "user", content: [{ type: "text", text: `Subject: ${subject}. File: ${file.filename}.` }, workPart(file)] },
    ],
    READ_SCHEMA,
    6000,
  );
  if (!reply) return null;
  return {
    readable: Boolean(reply.readable) && String(reply.transcript ?? "").trim().length > 0,
    pages: Math.min(50, Math.max(1, Math.round(Number(reply.pages) || 1))),
    kind: reply.kind === "notes" || reply.kind === "other" ? reply.kind : "attempt",
    transcript: String(reply.transcript ?? "").slice(0, TRANSCRIPT_MAX),
  };
}

const TAG_SCHEMA: JsonSchema = {
  name: "work_tags",
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["points"],
    properties: {
      points: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["id", "questions", "quality", "evidence"],
          properties: {
            id: { type: "string" },
            questions: { type: "integer" },
            quality: { type: "integer", enum: [0, 25, 50, 75, 100] },
            evidence: { type: "string" },
          },
        },
      },
    },
  },
};

export const RUBRIC = [
  "100: correct and complete, with the working and notation the syllabus expects.",
  "75: right method throughout, with a minor slip (arithmetic, a sign, notation, missing units or +c).",
  "50: partly right: the method starts correctly but has a significant error or stops short.",
  "25: attempted, but with a major conceptual error or the wrong method.",
  "0: no real progress, or the answer only with no working where working was needed.",
].join("\n");

const TAG_PROMPT = [
  "You mark a high school student's maths work against their syllabus dot points.",
  "From the list given, choose ONLY the dot points the work actually practises: usually 1 to 4, never more than 6. Prefer the most specific dot point. A question can match more than one dot point only if it genuinely needs both skills.",
  "Do not tag a dot point for skills used only in passing (basic algebra inside a calculus question is not an algebra dot point).",
  "For each dot point give: questions = how many questions or parts practised it; quality = the rubric score for the student's work on it (judge their working, not just the final answer; where several questions hit one dot point, score the typical standard); evidence = the question numbers and, in under 120 characters, what was right or wrong.",
  "If the work is class notes or copied worked examples rather than the student solving problems, score quality at most 25: they show exposure, not mastery.",
  "Use [teacher: ...] marks as strong evidence of correctness.",
  "Rubric:",
  RUBRIC,
  "Example: '2a) d/dx (x^2+1)^3 = 3(x^2+1)^2' for a power/polynomial chain rule point scores 25-50 (forgot the inner derivative 2x); '= 6x(x^2+1)^2' scores 100.",
  "Use the ids exactly as listed. If nothing in the work matches the syllabus, return an empty list.",
].join("\n");

export function pointList(points: PointRef[]): string {
  let current = "";
  const lines: string[] = [];
  for (const point of points) {
    const heading = `Unit ${point.unit} · ${point.topicTitle} · ${point.subtopic}`;
    if (heading !== current) {
      lines.push(heading);
      current = heading;
    }
    lines.push(`${point.id}: ${point.text}`);
  }
  return lines.join("\n");
}

/** Step 2: which dot points, and how well. */
export async function tagWork(call: JsonCall, reading: Reading, points: PointRef[]): Promise<Tag[] | null> {
  const reply = await call<{ points: unknown }>(
    "tag",
    [
      { role: "system", content: TAG_PROMPT },
      {
        role: "user",
        content: `Dot points:\n${pointList(points)}\n\nKind of work: ${reading.kind}\n\nThe student's work:\n${reading.transcript}`,
      },
    ],
    TAG_SCHEMA,
    1500,
  );
  if (!reply) return null;
  const tags = parseTags(reply.points, new Set(points.map((point) => point.id)));
  // The prompt asks for it, but notes can't show mastery even if the model forgets.
  return reading.kind === "attempt" ? tags : tags.map((tag) => ({ ...tag, quality: Math.min(tag.quality, 25) }));
}

const QUALITIES = [0, 25, 50, 75, 100];
const MAX_TAGS = 6;

/** The model's tags, kept to known points, one per point, on the rubric's scale. */
export function parseTags(raw: unknown, known: Set<string>): Tag[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: Tag[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const { id, questions, quality, evidence } = item as Record<string, unknown>;
    const pointId = String(id ?? "").trim();
    if (!known.has(pointId) || seen.has(pointId)) continue;
    seen.add(pointId);
    const q = Number(quality);
    out.push({
      pointId,
      // Snap anything off-scale to the nearest rubric level.
      quality: Number.isFinite(q) ? QUALITIES.reduce((best, level) => (Math.abs(level - q) < Math.abs(best - q) ? level : best)) : 0,
      questions: Math.min(50, Math.max(1, Math.round(Number(questions) || 1))),
      evidence: String(evidence ?? "").replace(/\s+/g, " ").trim().slice(0, 200),
    });
    if (out.length >= MAX_TAGS) break;
  }
  return out;
}
