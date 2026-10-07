/**
 * Shared syllabuses: the official subject matter dot points a student's work
 * is tagged against. One JSON file per syllabus in shared/syllabus/, loaded
 * into D1 (syllabus_points) by backend/scripts/syllabus-seed.mjs. A point's id
 * comes from where it sits in the file, so the file is only ever appended to
 * within a syllabus version; a new version gets a new syllabus id.
 */

export interface SyllabusDoc {
  id: string;
  prefix: string;
  subject: string;
  aliases: string[];
  units: Array<{
    unit: number;
    title: string;
    topics: Array<{
      title: string;
      subtopics: Array<{ title: string; hours: number; points: string[] }>;
    }>;
  }>;
}

export interface SyllabusPoint {
  /** e.g. MM-3.2.1.4: unit 3, topic 2, sub-topic 1, dot point 4. */
  id: string;
  syllabus: string;
  unit: number;
  unitTitle: string;
  topic: number;
  topicTitle: string;
  subtopic: string;
  text: string;
  /** The sub-topic's teaching hours shared across its dot points: how much it's worth. */
  hours: number;
  position: number;
}

/** Shared syllabuses Arcadia knows, by id. */
export const SYLLABUSES = ["qcaa-methods-2025"] as const;
export type SyllabusId = (typeof SYLLABUSES)[number];

export const SYLLABUS_NAMES: Record<SyllabusId, string> = {
  "qcaa-methods-2025": "QCAA Mathematical Methods (2025)",
};

/** Names a student might give the subject, for suggesting the link. */
const ALIASES: Record<SyllabusId, RegExp> = {
  "qcaa-methods-2025": /\b(math(s|ematical)?\s+methods|methods)\b/i,
};

export function isSyllabusId(value: unknown): value is SyllabusId {
  return typeof value === "string" && (SYLLABUSES as readonly string[]).includes(value);
}

/** The shared syllabus a subject's name suggests, if any. */
export function suggestSyllabus(subjectName: string): SyllabusId | null {
  for (const id of SYLLABUSES) if (ALIASES[id].test(subjectName)) return id;
  return null;
}

export function flattenSyllabus(doc: SyllabusDoc): SyllabusPoint[] {
  const out: SyllabusPoint[] = [];
  for (const unit of doc.units) {
    unit.topics.forEach((topic, t) => {
      topic.subtopics.forEach((sub, s) => {
        sub.points.forEach((text, p) => {
          out.push({
            id: `${doc.prefix}-${unit.unit}.${t + 1}.${s + 1}.${p + 1}`,
            syllabus: doc.id,
            unit: unit.unit,
            unitTitle: unit.title,
            topic: t + 1,
            topicTitle: topic.title,
            subtopic: sub.title,
            text,
            hours: Math.round((sub.hours / sub.points.length) * 100) / 100,
            position: out.length,
          });
        });
      });
    });
  }
  return out;
}
