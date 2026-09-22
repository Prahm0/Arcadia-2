import { asc, eq } from "drizzle-orm";
import { schema, type Database } from "../db";
import { subjectKey } from "./scheduler";
import { currentTopic } from "./syllabus";
import { localDateKey } from "./time";

type Topic = typeof schema.subjectTopics.$inferSelect;
type Assessment = typeof schema.subjectAssessments.$inferSelect;

export interface SubjectBrief {
  subjectId: string;
  /** What's being taught now, or next if between topics. */
  topic: (Topic & { upcoming: boolean }) | null;
  /** The topic before the current one, for "revise last week's". */
  previousTopic: Topic | null;
  upcomingAssessments: Assessment[];
  resources: Array<{ filename: string; summary: string }>;
}

/**
 * What Arcad needs to know about each subject's course right now: the topic
 * on this week, what came before it, what's assessed soon, and what
 * resources the student has. Keyed by subjectKey(name).
 */
export async function subjectBriefs(
  database: Database,
  userId: string,
  timeZone: string,
): Promise<Map<string, SubjectBrief>> {
  const today = localDateKey(Date.now(), timeZone);
  const [subjects, topics, assessments, files] = await Promise.all([
    database.select().from(schema.subjects).where(eq(schema.subjects.userId, userId)),
    database
      .select()
      .from(schema.subjectTopics)
      .where(eq(schema.subjectTopics.userId, userId))
      .orderBy(asc(schema.subjectTopics.position)),
    database.select().from(schema.subjectAssessments).where(eq(schema.subjectAssessments.userId, userId)),
    database.select().from(schema.subjectFiles).where(eq(schema.subjectFiles.userId, userId)),
  ]);

  const briefs = new Map<string, SubjectBrief>();
  for (const subject of subjects) {
    const own = topics.filter((topic) => topic.subjectId === subject.id);
    const current = currentTopic(own, today);
    const dated = own
      .filter((topic) => topic.startsOn && topic.startsOn < (current?.topic.startsOn ?? today))
      .sort((a, b) => b.startsOn!.localeCompare(a.startsOn!));
    briefs.set(subjectKey(subject.name), {
      subjectId: subject.id,
      topic: current ? { ...current.topic, upcoming: current.upcoming } : null,
      previousTopic: dated[0] ?? null,
      upcomingAssessments: assessments
        .filter((item) => item.subjectId === subject.id && item.dueOn && item.dueOn >= today)
        .sort((a, b) => a.dueOn!.localeCompare(b.dueOn!))
        .slice(0, 3),
      resources: files
        .filter((file) => file.subjectId === subject.id && file.kind === "resource" && file.summary)
        .map((file) => ({ filename: file.filename, summary: file.summary })),
    });
  }
  return briefs;
}

/** "Now: 3.2 Limiting reagents (till 2 Oct). Next assessed: Prac report, due 2026-10-08." */
export function describeBrief(brief: SubjectBrief | undefined): string {
  if (!brief) return "";
  const parts: string[] = [];
  if (brief.topic) {
    parts.push(
      `${brief.topic.upcoming ? "Next topic" : "Now teaching"}: ${brief.topic.title}${
        brief.topic.endsOn ? ` (until ${brief.topic.endsOn})` : ""
      }`,
    );
  }
  if (brief.upcomingAssessments.length) {
    parts.push(
      `Assessed soon: ${brief.upcomingAssessments
        .map((item) => `${item.title} (${item.kind}, due ${item.dueOn})`)
        .join("; ")}`,
    );
  }
  if (brief.resources.length) {
    parts.push(`Resources: ${brief.resources.map((file) => `${file.filename}: ${file.summary}`).join(" | ")}`);
  }
  return parts.join(". ");
}
