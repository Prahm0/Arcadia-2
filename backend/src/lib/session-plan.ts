import { and, asc, desc, eq, isNotNull, lt } from "drizzle-orm";
import { schema, type Database } from "../db";
import type { Env } from "../types";
import { ARCAD_VOICE, aiConfigured, completeJson } from "./openai";
import { subjectKey } from "./scheduler";
import { describeBrief, subjectBriefs, type SubjectBrief } from "./study-context";
import { subjectLog } from "./study-log";
import { describeRecords, summariseLog, topicMenu, untouchedTopics, type MenuTopic, type TopicRecord } from "./study-record";
import { priorities, subjectMastery } from "./mastery";
import { getUserTier, isPaidTier } from "./tiers";
import { MINUTE, localDateKey } from "./time";
import { LOG_KINDS, isLogKind, type LogKind } from "../../../shared/studyLog";
import { REASON_TIPS, type Reason } from "../../../shared/mastery.ts";

type EventRow = typeof schema.events.$inferSelect;

export interface PlanStep {
  minutes: number;
  text: string;
  /** The syllabus topic the step is on, when it's not the session's own. */
  topicId?: string | null;
  topic?: string | null;
  /** learn | practice | review | assignment | study, for the study log. */
  kind?: LogKind;
  /** The syllabus dot point the step works on, so the check-out can feed its mastery. */
  pointId?: string | null;
}

/**
 * Bumped when plans made by an older planner shouldn't be shown any more.
 * v2: plans no longer invent topics for subjects with no syllabus.
 * v3: sessions in subjects with a syllabus map aim at the weakest dot points.
 */
export const PLAN_VERSION = 3;

/** What Arcad sets a study block up as. */
export interface SessionPlan {
  v?: number;
  /** The one line that says what this session is: "3.2 Limiting reagents". */
  topic: string;
  /** The syllabus topic it's on, so the study log can file it there. */
  topicId?: string | null;
  /** That topic's syllabus name; `topic` is Arcad's one line about the session. */
  topicTitle?: string | null;
  /** Why this, now: "Prac report due Mon 2 Nov". */
  why: string;
  /** One to three timed steps that add up to the block. */
  steps: PlanStep[];
  /** "arcad" when the model wrote it; "fallback" when built from the data alone. */
  by: "arcad" | "fallback";
  /**
   * Set when Arcad had nothing about the course to go on (no syllabus,
   * assessments, notes or deadline), so the UI can ask for the syllabus.
   */
  needsSyllabus?: { subjectId: string | null; subject: string };
  createdAt: string;
}

/** Whether a plan is current, or was made by an older planner and should be redone. */
export function planIsCurrent(plan: Pick<SessionPlan, "v"> | null | undefined): boolean {
  return (plan?.v ?? 1) >= PLAN_VERSION;
}

/** How a session went, written at the end. */
export interface Checkout {
  /** Indexes of the plan steps that got done. */
  done: number[];
  /** What's left over, in the student's words. Seeds the next plan. */
  leftover: string;
  feeling: "good" | "ok" | "rough" | null;
  minutes: number;
  at: string;
}

const PLAN_SCHEMA = {
  name: "session_plan",
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["topic", "tag", "why", "steps"],
    properties: {
      topic: { type: "string" },
      tag: { type: "string" },
      why: { type: "string" },
      steps: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["minutes", "text", "tag", "point", "kind"],
          properties: {
            minutes: { type: "integer" },
            text: { type: "string" },
            tag: { type: "string" },
            point: { type: "string" },
            kind: { type: "string", enum: [...LOG_KINDS] },
          },
        },
      },
    },
  },
};

const clip = (value: unknown, max: number) => String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);

function parse<T>(value: string | null): T | null {
  if (!value) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

/** "Thu 8 Oct" in the student's timezone. */
function shortDate(value: number | string, timeZone: string): string {
  const ms = typeof value === "number" ? value : Date.parse(value.length === 10 ? `${value}T12:00:00Z` : value);
  return new Intl.DateTimeFormat("en-AU", { weekday: "short", day: "numeric", month: "short", timeZone }).format(ms);
}

/**
 * Steps that add up to exactly the block: at most three, each at least five
 * minutes, rounded to five where possible.
 */
export function fitSteps(steps: PlanStep[], total: number): PlanStep[] {
  const clean = steps
    .map((step) => ({ ...step, minutes: Math.max(1, Math.round(Number(step.minutes) || 0)), text: clip(step.text, 90) }))
    .filter((step) => step.text)
    .slice(0, 3);
  if (clean.length === 0) return [{ minutes: total, text: "Work through it" }];
  if (total < 5 * clean.length) return [{ ...clean[0], minutes: total }];

  const sum = clean.reduce((acc, step) => acc + step.minutes, 0);
  const scaled = clean.map((step) => ({
    ...step,
    minutes: Math.max(5, Math.round(((step.minutes / sum) * total) / 5) * 5),
  }));
  // Whatever rounding left over goes on the longest step.
  const longest = scaled.reduce((best, step, index) => (step.minutes > scaled[best].minutes ? index : best), 0);
  scaled[longest].minutes += total - scaled.reduce((acc, step) => acc + step.minutes, 0);
  if (scaled[longest].minutes < 5) return [{ ...clean[0], minutes: total }];
  return scaled;
}

/** A dot point the session should work on, and why it's weak. */
export interface WeakPoint {
  tag: string;
  pointId: string;
  text: string;
  subtopic: string;
  score: number;
  reason: Reason;
}

interface PlanInputs {
  event: EventRow;
  minutes: number;
  subject: typeof schema.subjects.$inferSelect | undefined;
  brief: SubjectBrief | undefined;
  task: typeof schema.tasks.$inferSelect | undefined;
  lastCheckouts: Array<{ topic: string | null; topicId: string | null; checkout: Checkout; startAt: number }>;
  /** The subject's study log, one record per topic, most recent first. */
  record: TopicRecord[];
  /** Topics taught already that the log has nothing on (paid tiers only). */
  untouched: Array<typeof schema.subjectTopics.$inferSelect>;
  /** Pro and Max: Arcad plans from the record and steers into gaps. */
  paid: boolean;
  /** The weakest dot points from the student's own work (subjects with a syllabus map), D1 first. */
  weakPoints: WeakPoint[];
  profile: typeof schema.profiles.$inferSelect | undefined;
  goals: string[];
  memories: string[];
  timeZone: string;
}

async function gatherInputs(database: Database, userId: string, event: EventRow): Promise<PlanInputs> {
  const [[profile], subjects, [task], previous, goalRows, memoryRows] = await Promise.all([
    database.select().from(schema.profiles).where(eq(schema.profiles.userId, userId)).limit(1),
    database.select().from(schema.subjects).where(eq(schema.subjects.userId, userId)),
    event.taskId
      ? database.select().from(schema.tasks).where(eq(schema.tasks.id, event.taskId)).limit(1)
      : Promise.resolve([] as Array<typeof schema.tasks.$inferSelect>),
    // The last few sessions of this subject that were checked out.
    event.subject
      ? database
          .select()
          .from(schema.events)
          .where(
            and(
              eq(schema.events.userId, userId),
              eq(schema.events.subject, event.subject),
              isNotNull(schema.events.checkout),
              lt(schema.events.startAt, event.startAt),
            ),
          )
          .orderBy(desc(schema.events.startAt))
          .limit(3)
      : Promise.resolve([] as EventRow[]),
    database.select().from(schema.goals).where(eq(schema.goals.userId, userId)),
    database
      .select()
      .from(schema.memories)
      .where(eq(schema.memories.userId, userId))
      .orderBy(asc(schema.memories.createdAt)),
  ]);
  const timeZone = profile?.timezone ?? "Australia/Brisbane";
  const subject = subjects.find((row) => subjectKey(row.name) === subjectKey(event.subject));
  const [briefs, tier, log, topics] = await Promise.all([
    subjectBriefs(database, userId, timeZone),
    getUserTier(database, userId),
    subject ? subjectLog(database, userId, subject.id) : Promise.resolve([]),
    subject
      ? database
          .select()
          .from(schema.subjectTopics)
          .where(and(eq(schema.subjectTopics.userId, userId), eq(schema.subjectTopics.subjectId, subject.id)))
      : Promise.resolve([] as Array<typeof schema.subjectTopics.$inferSelect>),
  ]);
  const record = summariseLog(log);
  const paid = isPaidTier(tier);
  // Only a non-deadline block gets steered: a deadline block is for its task.
  const weak = subject?.syllabus && !task ? priorities(await subjectMastery(database, userId, subject.id, subject.syllabus), Date.now(), 3) : [];
  return {
    event,
    minutes: Math.max(5, Math.round((event.endAt - event.startAt) / MINUTE)),
    subject,
    brief: briefs.get(subjectKey(event.subject)),
    task,
    lastCheckouts: previous.flatMap((row) => {
      const checkout = parse<Checkout>(row.checkout);
      const plan = parse<SessionPlan>(row.plan);
      return checkout ? [{ topic: plan?.topic ?? row.title, topicId: plan?.topicId ?? null, checkout, startAt: row.startAt }] : [];
    }),
    record,
    untouched: paid ? untouchedTopics(topics, record, localDateKey(Date.now(), timeZone)) : [],
    paid,
    weakPoints: weak.map((entry, index) => ({
      tag: `D${index + 1}`,
      pointId: entry.pointId,
      text: entry.point.text,
      subtopic: entry.point.subtopic,
      score: Math.round(entry.mastery.score),
      reason: entry.reason,
    })),
    profile,
    goals: goalRows.filter((goal) => !goal.done).map((goal) => goal.title),
    memories: profile?.memoryEnabled === false ? [] : memoryRows.map((row) => row.content),
    timeZone,
  };
}

/**
 * Whether there's anything real to plan from. Without it Arcad would have to
 * make up a topic ("The Great Gatsby, chapter 3"), so it doesn't try.
 */
function hasCourseDetail(inputs: PlanInputs): boolean {
  const { task, brief, subject, lastCheckouts, record, weakPoints } = inputs;
  return Boolean(
    task ||
      weakPoints.length ||
      record.length ||
      brief?.topic ||
      brief?.previousTopic ||
      brief?.upcomingAssessments.length ||
      brief?.resources.length ||
      subject?.notes.trim() ||
      lastCheckouts.some((past) => past.checkout.leftover.trim()),
  );
}

/** What each kind of weakness gets: the steps' wording and log kind. */
const WEAK_STEP: Record<Reason, { text: (point: string) => string; kind: LogKind }> = {
  low_quality: { text: (point) => `Worked examples, then similar questions: ${point}`, kind: "learn" },
  low_coverage: { text: (point) => `New question types on ${point}`, kind: "practice" },
  decaying: { text: (point) => `Recall quiz, no notes: ${point}`, kind: "review" },
  low_confidence: { text: (point) => `Timed questions on ${point}`, kind: "practice" },
};

/**
 * A session built around the weakest dot points: most of it on the weakest,
 * a short no-notes recall on the next, then mixed questions across them.
 */
export function weakPointSteps(weak: WeakPoint[], minutes: number): PlanStep[] {
  const [first, second] = weak;
  if (!first) return [];
  const short = (point: WeakPoint) => clip(point.subtopic, 40).toLowerCase();
  if (!second || minutes < 30) {
    return fitSteps([{ minutes, text: WEAK_STEP[first.reason].text(short(first)), kind: WEAK_STEP[first.reason].kind, pointId: first.pointId }], minutes);
  }
  return fitSteps(
    [
      { minutes: Math.round(minutes * 0.55), text: WEAK_STEP[first.reason].text(short(first)), kind: WEAK_STEP[first.reason].kind, pointId: first.pointId },
      { minutes: Math.round(minutes * 0.2), text: `Quick recall, no notes: ${short(second)}`, kind: "review", pointId: second.pointId },
      { minutes: Math.round(minutes * 0.25), text: "Mixed questions across both", kind: "practice" },
    ],
    minutes,
  );
}

/** A plan built from the data alone, for when Arcad can't be reached or has nothing to go on. */
export function fallbackPlan(inputs: PlanInputs): SessionPlan {
  const { event, minutes, brief, task, lastCheckouts, record, timeZone } = inputs;
  const subjectName = event.subject ?? "Study";
  if (!hasCourseDetail(inputs)) {
    // Nothing to name a topic from: say what the block is and leave the
    // choosing to them, rather than guess.
    return {
      v: PLAN_VERSION,
      // The subject is already on the card, so the topic doesn't repeat it.
      topic: "Open study",
      why: "No syllabus yet, so you choose the focus",
      steps: fitSteps(
        [
          { minutes: Math.round(minutes * 0.25), text: "Look back over this week's class notes" },
          { minutes: Math.round(minutes * 0.75), text: "Work on whatever felt least solid" },
        ],
        minutes,
      ),
      by: "fallback",
      needsSyllabus: { subjectId: brief?.subjectId ?? inputs.subject?.id ?? null, subject: subjectName },
      createdAt: new Date().toISOString(),
    };
  }
  if (!task && inputs.weakPoints.length) {
    const weakest = inputs.weakPoints[0];
    return {
      v: PLAN_VERSION,
      topic: clip(weakest.subtopic, 60),
      why: clip(`Your weakest dot point right now (${weakest.score}/100)`, 70),
      steps: weakPointSteps(inputs.weakPoints, minutes),
      by: "fallback",
      createdAt: new Date().toISOString(),
    };
  }
  const topicTitle = task?.title ?? brief?.topic?.title ?? `${subjectName} revision`;
  const topicId = task ? null : brief?.topic?.id ?? null;
  // A class topic they haven't logged anything on yet is new material.
  const fresh = Boolean(topicId && !record.some((entry) => entry.topicId === topicId));
  const assessment = brief?.upcomingAssessments[0];

  const why = task
    ? `Due ${shortDate(task.dueAt, timeZone)}`
    : assessment
      ? `${assessment.title} due ${shortDate(assessment.dueOn!, timeZone)}`
      : brief?.topic && !brief.topic.upcoming
        ? "What you're doing in class this week"
        : "Keeping it ticking over";

  // Leftovers from last time first, practice questions last if something's
  // assessed within three weeks; the main step gets the rest.
  const last = lastCheckouts[0];
  const leftover = last?.checkout.leftover;
  const warmUp = leftover && minutes >= 30 ? Math.min(15, Math.round(minutes / 15) * 5) : 0;
  const soon = assessment?.dueOn && Date.parse(`${assessment.dueOn}T00:00:00Z`) - Date.now() < 21 * 86_400_000;
  const practice = soon && minutes - warmUp >= 30 ? 10 : 0;
  const steps: PlanStep[] = [
    ...(warmUp ? [{ minutes: warmUp, text: `Finish off: ${leftover}`, topicId: last?.topicId ?? null, topic: last?.topic ?? null }] : []),
    {
      minutes: minutes - warmUp - practice,
      kind: task ? "assignment" : fresh ? "learn" : "study",
      text: task
        ? `Work on ${task.title}`
        : brief?.topic
          ? `Work through ${brief.topic.title}${brief.topic.detail ? ` (${brief.topic.detail})` : ""}`
          : `Go over this week's ${subjectName} work`,
    },
    ...(practice ? [{ minutes: practice, text: `Practice questions for ${assessment!.title}`, kind: "practice" as const }] : []),
  ];

  return {
    v: PLAN_VERSION,
    topic: clip(topicTitle, 60),
    topicId,
    why: clip(why, 70),
    steps: fitSteps(steps, minutes),
    by: "fallback",
    createdAt: new Date().toISOString(),
  };
}

function prompt(inputs: PlanInputs, menu: MenuTopic[]): string {
  const { event, minutes, subject, brief, task, lastCheckouts, record, paid, profile, goals, memories, timeZone } = inputs;
  const lines = [
    `Session: ${event.subject ?? "study"}, ${minutes} minutes, starting ${new Intl.DateTimeFormat("en-AU", {
      weekday: "short",
      day: "numeric",
      month: "short",
      hour: "numeric",
      minute: "2-digit",
      timeZone,
    }).format(event.startAt)}.`,
    task
      ? `This block is for a deadline: "${task.title}", due ${shortDate(task.dueAt, timeZone)}, about ${Math.max(0, task.estimatedMinutes - task.completedMinutes)} minutes of work left.`
      : "This block is regular study time for the subject.",
  ];
  if (subject?.targetGrade) lines.push(`They're aiming for ${subject.targetGrade}.`);
  if (subject?.notes.trim()) lines.push(`Their note on this subject: ${subject.notes.trim()}`);
  const course = describeBrief(brief);
  if (course) lines.push(`Course: ${course}.`);
  if (brief?.previousTopic) lines.push(`Previous topic: ${brief.previousTopic.title}.`);
  for (const past of lastCheckouts) {
    const when = shortDate(past.startAt, timeZone);
    lines.push(
      `Last time (${when}, "${past.topic}"): ${past.checkout.feeling ?? "no rating"}${
        past.checkout.leftover ? `, left over: ${past.checkout.leftover}` : ", nothing left over"
      }.`,
    );
  }
  if (paid && record.length) {
    lines.push("Their study record in this subject:", ...describeRecords(record, timeZone).map((line) => `- ${line}`));
  }
  if (inputs.weakPoints.length) {
    lines.push(
      'Their weakest syllabus dot points, from their own marked work (give a step on one its id as "point"):',
      ...inputs.weakPoints.map(
        (point) =>
          `${point.tag} [${point.subtopic}] ${point.text} Mastery ${point.score}/100. Why: ${REASON_TIPS[point.reason].label.toLowerCase()}. Approach: ${REASON_TIPS[point.reason].tip}`,
      ),
    );
  }
  if (menu.length) {
    lines.push(
      'Topics (tag each step with one, or "" if none fits):',
      ...menu.map((item) => `${item.tag} ${item.title} (${item.note})`),
    );
  }
  if (goals.length) lines.push(`Their goals: ${goals.join("; ")}.`);
  if (profile?.atarTarget) lines.push(`ATAR target ${profile.atarTarget.toFixed(2)}.`);
  if (profile?.arcadAbout.trim()) lines.push(`About them: ${profile.arcadAbout.trim()}`);
  if (memories.length) lines.push(`You remember: ${memories.slice(-15).join(" ")}`);
  return lines.join("\n");
}

/**
 * Sets up one study session: what it's on, why now, and up to three timed
 * steps. Falls back to a plan built from the data if Arcad isn't available
 * or answers with something unusable, so a session always has a plan.
 */
export async function planSession(env: Env, database: Database, userId: string, event: EventRow): Promise<SessionPlan> {
  const inputs = await gatherInputs(database, userId, event);
  if (!aiConfigured(env) || !hasCourseDetail(inputs)) return fallbackPlan(inputs);
  const menu = topicMenu(inputs);
  const tagged = (tag: unknown) => menu.find((item) => item.tag.toLowerCase() === String(tag ?? "").trim().toLowerCase());

  try {
    const reply = await completeJson<{
      topic: string;
      tag: string;
      why: string;
      steps: Array<{ minutes: number; text: string; tag: string; point: string; kind: string }>;
    }>(
      env,
      [
        {
          role: "system",
          content: [
            ARCAD_VOICE,
            "",
            "Set up one study session. Reply with:",
            "- topic: what this session is on, under 60 characters. Use the topic, section, assessment or task named in the details (\"3.2 Limiting reagents\").",
            '- tag: the tag (T1, T2…) of the topic the session is mainly on, or "" if it is none of them.',
            "- why: why this now, under 70 characters: what's assessed or due and when, or that it's this week's class topic.",
            `- steps: one to three steps whose minutes add up to exactly ${inputs.minutes}. Each is one short line of something they do: a section to work through, questions to attempt, a past paper, a draft to write themselves. If they left something unfinished last time, start with it. If the last session felt rough, go back over that before moving on.`,
            '  Give each step the tag of the topic it is on ("" if none), the weakest dot point it works on as point (D1, D2, D3, or "" if none), and its kind: learn (new material), practice (questions, past papers), review (going back over something), assignment (a task or draft), study (anything else).',
            ...(inputs.weakPoints.length && !inputs.task
              ? [
                  "Their weakest dot points are listed. After any leftovers, build the session on them: about half on D1 using its approach, a short no-notes recall on another, and the rest mixed questions across them. Make every step specific: the skill and how many questions (\"10 questions differentiating trig functions\"), never just \"study Methods\". Name the topic after D1.",
                ]
              : []),
            ...(inputs.paid && !inputs.task
              ? [
                  "This block isn't for a deadline, so spend it where it's needed most: after any leftovers, a topic they were lost on or still shaky with, then one taught but not studied yet, then this week's class topic.",
                ]
              : []),
            "Use only what's in the details below. Never name a book, text, chapter, section, question number or assessment that isn't written there. If the details only give you the subject, keep the topic general (\"This week's Chemistry\").",
          ].join("\n"),
        },
        { role: "user", content: prompt(inputs, menu) },
      ],
      PLAN_SCHEMA,
      300,
      { usage: { feature: "session_plan", userId } },
    );
    if (!reply || !clip(reply.topic, 60)) return fallbackPlan(inputs);
    const main = tagged(reply.tag);
    const weak = (tag: unknown) =>
      inputs.weakPoints.find((point) => point.tag.toLowerCase() === String(tag ?? "").trim().toLowerCase());
    const steps: PlanStep[] = (reply.steps ?? []).map((step) => {
      const on = tagged(step.tag);
      const point = weak(step.point);
      return {
        minutes: step.minutes,
        text: step.text,
        ...(isLogKind(step.kind) ? { kind: step.kind } : {}),
        ...(on ? { topicId: on.topicId, topic: on.title } : {}),
        ...(point ? { pointId: point.pointId } : {}),
      };
    });
    return {
      v: PLAN_VERSION,
      topic: clip(reply.topic, 60),
      topicId: main?.topicId ?? null,
      topicTitle: main?.title ?? null,
      why: clip(reply.why, 70),
      steps: fitSteps(steps, inputs.minutes),
      by: "arcad",
      createdAt: new Date().toISOString(),
    };
  } catch (error) {
    console.error("[session-plan] Arcad failed, using fallback", error);
    return fallbackPlan(inputs);
  }
}
