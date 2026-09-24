import { and, asc, eq, gte, inArray, lt } from "drizzle-orm";
import { schema, type Database } from "../db";
import { subjectKey } from "./scheduler";
import { summariseHabits, type Habits } from "./study-habits";
import { currentTopic } from "./syllabus";
import { DAY, MINUTE, localDateKey, localHour, localWeekday } from "./time";

/** How far back the planner looks for study habits. */
const HABIT_DAYS = 28;

/** How the last four weeks of marked study went, for planning around. */
export async function studyHabits(database: Database, userId: string, timeZone: string): Promise<Habits> {
  const now = Date.now();
  const rows = await database
    .select({
      subject: schema.events.subject,
      outcome: schema.events.outcome,
      startAt: schema.events.startAt,
      endAt: schema.events.endAt,
    })
    .from(schema.events)
    .where(
      and(
        eq(schema.events.userId, userId),
        eq(schema.events.category, "study"),
        inArray(schema.events.outcome, ["completed", "missed"]),
        gte(schema.events.startAt, now - HABIT_DAYS * DAY),
        lt(schema.events.startAt, now),
      ),
    );
  return summariseHabits(
    rows.map((row) => ({
      subject: row.subject,
      kept: row.outcome === "completed",
      hour: localHour(row.startAt, timeZone),
      weekday: localWeekday(row.startAt, timeZone),
      minutes: Math.max(0, Math.round((row.endAt - row.startAt) / MINUTE)),
    })),
  );
}

type Topic = typeof schema.subjectTopics.$inferSelect;
type Assessment = typeof schema.subjectAssessments.$inferSelect;

const MISS_REASON_LABEL: Record<string, string> = {
  sick: "sick",
  tired: "tired",
  other_plans: "other plans",
  forgot: "forgot",
  didnt_feel_like_it: "didn't feel like it",
  other: "another reason",
};

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

/**
 * A compact, recent pattern summary for Arcad. It deliberately describes
 * observed blocks rather than diagnosing the student or treating one miss as
 * a lasting preference.
 */
export async function recentMissReasonContext(database: Database, userId: string): Promise<string[]> {
  const since = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const rows = await database
    .select({
      subject: schema.events.subject,
      missReason: schema.events.missReason,
      missNote: schema.events.missNote,
      endAt: schema.events.endAt,
    })
    .from(schema.events)
    .where(
      and(
        eq(schema.events.userId, userId),
        eq(schema.events.category, "study"),
        eq(schema.events.outcome, "missed"),
        gte(schema.events.endAt, since),
      ),
    );

  const grouped = new Map<string, { subject: string; reason: string; count: number; latestNote: string | null; latestAt: number }>();
  for (const row of rows) {
    const label = row.missReason ? MISS_REASON_LABEL[row.missReason] : null;
    if (!label) continue;
    const subject = row.subject?.trim() || "General study";
    const key = `${subjectKey(subject)}:${row.missReason}`;
    const current = grouped.get(key);
    if (current) {
      current.count += 1;
      if (row.missNote && row.endAt >= current.latestAt) {
        current.latestNote = row.missNote;
        current.latestAt = row.endAt;
      }
    } else {
      grouped.set(key, {
        subject,
        reason: label,
        count: 1,
        latestNote: row.missNote,
        latestAt: row.endAt,
      });
    }
  }

  return [...grouped.values()]
    .sort((a, b) => b.count - a.count || b.latestAt - a.latestAt)
    .slice(0, 8)
    .map((pattern) => {
      const note = pattern.latestNote ? ` Latest note: ${pattern.latestNote.slice(0, 160)}` : "";
      return `${pattern.subject}: ${pattern.reason} for ${pattern.count} missed ${pattern.count === 1 ? "block" : "blocks"}.${note}`;
    });
}
