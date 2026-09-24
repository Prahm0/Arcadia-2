import { and, asc, desc, eq, ne } from "drizzle-orm";
import { schema, type Database } from "../db";
import type { Env } from "../types";
import { newId } from "./ids";
import { ARCAD_VOICE, aiConfigured, completeJson, isReasoningModel, type ChatMessage } from "./openai";
import { monthPlanEffort, replyBudget, type PlanEffort } from "./plan-tier";
import { subjectKey, uniqueSubjects, weeklyTargetMinutes } from "./scheduler";
import { studyHabits } from "./study-context";
import { inTerm, termWeekOf } from "./terms";
import { getUserTier } from "./tiers";
import { DAY, localDateKey, nextLocalDay, startOfLocalDay, startOfLocalWeek } from "./time";

type Subject = typeof schema.subjects.$inferSelect;

export interface MonthPlanWeek {
  /** The week's Monday, YYYY-MM-DD in the student's timezone. */
  weekOf: string;
  /** "Term 4, week 2", "School holidays", or "" when the calendar isn't known. */
  label: string;
  /** One line on what the week is about. */
  focus: string;
  /** Minutes each subject gets that week. */
  subjects: Array<{ name: string; minutes: number }>;
}

/** Arcad's plan for the next four weeks. Stored as JSON in month_plans.plan. */
export interface MonthPlan {
  /** One or two sentences on the month. */
  summary: string;
  weeks: MonthPlanWeek[];
  /**
   * Each subject's weekly target when the plan was made, by subjectKey. The
   * scheduler scales the plan's minutes if a target changes afterwards.
   */
  base: Record<string, number>;
  by: "arcad" | "fallback";
  createdAt: string;
}

/** How many days the plan covers, from today. */
const PLAN_SPAN_DAYS = 28;
/** Arcad can move a subject between half and one and a half times its usual week. */
const MIN_SHARE = 0.5;
const MAX_SHARE = 1.5;

/** "New Zealand" for "NZ"; the code itself if the runtime doesn't know it. */
function countryName(code: string): string {
  try {
    return new Intl.DisplayNames("en", { type: "region" }).of(code) ?? code;
  } catch {
    return code;
  }
}

const clip = (value: unknown, max: number) => String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);

function shortDate(date: string): string {
  return new Intl.DateTimeFormat("en-AU", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(
    Date.parse(`${date}T12:00:00Z`),
  );
}

interface Deadline {
  title: string;
  subject: string | null;
  kind: string;
  /** YYYY-MM-DD */
  dueOn: string;
  minutes: number | null;
}

interface PlanInputs {
  profile: typeof schema.profiles.$inferSelect;
  subjects: Subject[];
  base: Record<string, number>;
  weeks: Array<{ weekOf: string; label: string; days: string[] }>;
  deadlines: Deadline[];
  goals: string[];
  memories: string[];
  capacity: number;
  /** Share of marked study they've got done lately, or null without enough history. */
  keptShare: number | null;
}

/** "Term 4, week 1", "School holidays", "Holidays, then Term 4 week 1", or "". */
function weekLabel(state: string | null, days: string[]): string {
  const weekdays = days.slice(0, 5);
  const inTermDays = weekdays.filter((day) => inTerm(state, day) === true);
  if (weekdays.every((day) => inTerm(state, day) === null)) return "";
  if (inTermDays.length === 0) return "School holidays";
  const term = termWeekOf(state, inTermDays[0]);
  const name = term ? `Term ${term.term}, week ${term.week}` : "Term time";
  if (inTermDays.length === weekdays.length) return name;
  return inTerm(state, weekdays[0]) === false ? `Holidays, then ${name}` : `${name}, then holidays`;
}

async function gatherInputs(database: Database, userId: string): Promise<PlanInputs | null> {
  const [[profile], subjectRows, taskRows, assessmentRows, goalRows, memoryRows] = await Promise.all([
    database.select().from(schema.profiles).where(eq(schema.profiles.userId, userId)).limit(1),
    database.select().from(schema.subjects).where(eq(schema.subjects.userId, userId)).orderBy(asc(schema.subjects.createdAt)),
    database
      .select()
      .from(schema.tasks)
      .where(and(eq(schema.tasks.userId, userId), eq(schema.tasks.status, "pending"))),
    database.select().from(schema.subjectAssessments).where(eq(schema.subjectAssessments.userId, userId)),
    database.select().from(schema.goals).where(and(eq(schema.goals.userId, userId), ne(schema.goals.done, true))),
    database.select().from(schema.memories).where(eq(schema.memories.userId, userId)).orderBy(asc(schema.memories.createdAt)),
  ]);
  if (!profile) return null;

  const tz = profile.timezone;
  const habits = await studyHabits(database, userId, tz);
  const now = Date.now();
  const today = startOfLocalDay(now, tz);
  const end = today + PLAN_SPAN_DAYS * DAY;

  const weeks: PlanInputs["weeks"] = [];
  for (let monday = startOfLocalWeek(now, tz); monday < end; monday = startOfLocalWeek(monday + 8 * DAY, tz)) {
    const days: string[] = [];
    for (let day = monday, i = 0; i < 7; day = nextLocalDay(day, tz), i++) days.push(localDateKey(day, tz));
    weeks.push({ weekOf: days[0], label: weekLabel(profile.state, days), days });
  }

  const todayKey = localDateKey(now, tz);
  const lastKey = weeks[weeks.length - 1].days[6];
  const subjects = uniqueSubjects(subjectRows);
  const subjectById = new Map(subjects.map((subject) => [subject.id, subject.name]));
  const deadlines: Deadline[] = [
    ...taskRows
      .map((task) => ({
        title: task.title,
        subject: task.subject,
        kind: task.taskType,
        dueOn: localDateKey(task.dueAt, tz),
        minutes: Math.max(0, task.estimatedMinutes - task.completedMinutes),
      }))
      .filter((item) => item.dueOn >= todayKey && item.dueOn <= lastKey),
    // Syllabus assessments not already added as deadlines.
    ...assessmentRows
      .filter((item) => item.dueOn && !item.taskId && item.dueOn >= todayKey && item.dueOn <= lastKey)
      .map((item) => ({
        title: item.title,
        subject: subjectById.get(item.subjectId) ?? null,
        kind: item.kind,
        dueOn: item.dueOn!,
        minutes: null,
      })),
  ].sort((a, b) => a.dueOn.localeCompare(b.dueOn));

  return {
    profile,
    subjects,
    base: Object.fromEntries(
      subjects.map((subject) => [subjectKey(subject.name), weeklyTargetMinutes(subject, profile.grade)]),
    ),
    weeks,
    deadlines,
    goals: goalRows.map((goal) => goal.title),
    memories: profile.memoryEnabled ? memoryRows.map((row) => row.content) : [],
    capacity: Math.max(0, profile.maxDailyStudyMinutes) * 7,
    keptShare: habits.keptShare,
  };
}

/** A subject's minutes kept inside the allowed swing and on a 15-minute grid. */
function bound(minutes: number, base: number): number {
  if (base <= 0) return 0;
  const clamped = Math.min(base * MAX_SHARE, Math.max(base * MIN_SHARE, minutes));
  return Math.round(clamped / 15) * 15;
}

/** Keeps a week inside the daily limit by trimming every subject by the same share. */
function fitWeek(subjects: MonthPlanWeek["subjects"], capacity: number): MonthPlanWeek["subjects"] {
  const total = subjects.reduce((sum, entry) => sum + entry.minutes, 0);
  if (total <= capacity || total === 0) return subjects;
  return subjects.map((entry) => ({ ...entry, minutes: Math.floor((entry.minutes * capacity) / total / 15) * 15 }));
}

/** Which week a date falls in. */
function weekIndex(inputs: PlanInputs, date: string): number {
  return inputs.weeks.findIndex((week) => date >= week.days[0] && date <= week.days[6]);
}

/**
 * The plan without Arcad: every subject keeps its usual week, with a bit more
 * time in the week a deadline for it lands (and the week before, for
 * anything due early in a week), taken evenly from the rest of the month.
 */
export function fallbackPlan(inputs: PlanInputs): MonthPlan {
  const weeks = inputs.weeks.map((week) => ({ ...week, boost: new Set<string>() }));
  for (const deadline of inputs.deadlines) {
    if (!deadline.subject) continue;
    const index = weekIndex(inputs, deadline.dueOn);
    if (index < 0) continue;
    const key = subjectKey(deadline.subject);
    const earlyInWeek = inputs.weeks[index].days.indexOf(deadline.dueOn) <= 1;
    weeks[earlyInWeek && index > 0 ? index - 1 : index].boost.add(key);
  }

  return {
    summary: inputs.deadlines.length
      ? `Every subject gets its usual time, with extra in the lead-up to ${inputs.deadlines.length === 1 ? "your deadline" : "each deadline"}.`
      : "Every subject gets its usual time each week. Add deadlines as they come up and the plan shifts around them.",
    weeks: weeks.map((week) => {
      const due = inputs.deadlines.filter((item) => item.dueOn >= week.days[0] && item.dueOn <= week.days[6]);
      const subjects = inputs.subjects.map((subject) => {
        const key = subjectKey(subject.name);
        const base = inputs.base[key] ?? 0;
        // Boosted weeks get a quarter more, paid back across the other weeks.
        const boostedWeeks = weeks.filter((other) => other.boost.has(key)).length;
        const others = weeks.length - boostedWeeks;
        const give = boostedWeeks && others ? (base * 0.25 * boostedWeeks) / others : 0;
        return { name: subject.name, minutes: bound(week.boost.has(key) ? base * 1.25 : base - give, base) };
      });
      const focus = due.length
        ? `${due.map((item) => `${item.title} due ${shortDate(item.dueOn)}`).slice(0, 2).join(", ")}`
        : week.label === "School holidays"
          ? "Holidays: more free time, a good week to get ahead"
          : "A steady week: every subject gets its usual time";
      return { weekOf: week.weekOf, label: week.label, focus: clip(focus, 110), subjects: fitWeek(subjects, inputs.capacity) };
    }),
    base: inputs.base,
    by: "fallback",
    createdAt: new Date().toISOString(),
  };
}

const PLAN_SCHEMA = {
  name: "month_plan",
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["summary", "weeks"],
    properties: {
      summary: { type: "string" },
      weeks: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["focus", "subjects"],
          properties: {
            focus: { type: "string" },
            subjects: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                required: ["name", "minutes"],
                properties: { name: { type: "string" }, minutes: { type: "integer" } },
              },
            },
          },
        },
      },
    },
  },
};

function describe(inputs: PlanInputs): string {
  const { profile, subjects, base, weeks, deadlines, goals, memories, capacity } = inputs;
  const going = (priority: number) =>
    priority >= 3 ? "finding it hard" : priority <= 1 ? "going well" : "going okay";
  const lines = [
    `Student: ${profile.grade ?? "year not given"}${profile.state ? `, ${profile.state}` : ""}${
      profile.country ? `, ${countryName(profile.country)}` : ""
    }${
      profile.school ? `, ${profile.school}` : ""
    }.`,
    `Daily study limit ${profile.maxDailyStudyMinutes} minutes, so at most ${capacity} minutes a week.`,
    "",
    "Subjects (usual minutes a week):",
    ...subjects.map((subject) => {
      const extra = [
        going(subject.priority),
        subject.targetGrade ? `aiming for ${subject.targetGrade}` : "",
        subject.notes.trim() ? `note: ${clip(subject.notes, 200)}` : "",
      ].filter(Boolean);
      return `- ${subject.name}: ${base[subjectKey(subject.name)] ?? 0} min; ${extra.join("; ")}`;
    }),
    "",
    "Weeks:",
    ...weeks.map((week, index) => `${index + 1}. Week of ${shortDate(week.weekOf)}${week.label ? ` (${week.label})` : ""}`),
    "",
    deadlines.length ? "Deadlines:" : "Deadlines: none given yet.",
    ...deadlines.map(
      (item) =>
        `- ${item.title}${item.subject ? ` (${item.subject}, ${item.kind})` : ` (${item.kind})`}, due ${shortDate(item.dueOn)}${
          item.minutes ? `, about ${item.minutes} min of work` : ""
        }`,
    ),
  ];
  if (inputs.keptShare !== null) {
    lines.push("", `Over the last four weeks they got ${Math.round(inputs.keptShare * 100)}% of their marked study done.`);
  }
  if (profile.atarTarget) lines.push("", `ATAR target ${profile.atarTarget.toFixed(2)}.`);
  if (goals.length) lines.push(`Goals: ${goals.join("; ")}.`);
  if (profile.arcadAbout.trim()) lines.push(`About them: ${clip(profile.arcadAbout, 600)}`);
  if (memories.length) lines.push(`You remember: ${memories.slice(-10).join(" ")}`);
  return lines.join("\n");
}

type PlanReply = {
  summary: string;
  weeks: Array<{ focus: string; subjects: Array<{ name: string; minutes: number }> }>;
};

async function arcadPlan(env: Env, inputs: PlanInputs, effort: PlanEffort): Promise<MonthPlan | null> {
  const messages: ChatMessage[] = [
    {
      role: "system",
      content: [
        ARCAD_VOICE,
        "",
        `Plan the student's next ${inputs.weeks.length} weeks of study. Deadline work is booked separately, so you're splitting their regular subject time across the weeks.`,
        "Reply with:",
        "- summary: one or two short sentences on how the month is set up and why.",
        `- weeks: exactly ${inputs.weeks.length}, in order. For each, focus: one line under 100 characters on what that week is about (a deadline coming, a subject getting extra, holidays), and subjects: every subject with its minutes that week.`,
        "How to split: start each subject at its usual minutes. Give more in the week or two before its deadlines and to subjects they're finding hard or aiming high in, less straight after a deadline. Keep each subject between half and one and a half times its usual week, in steps of 15, and each week's total within their weekly limit. In the holidays there's more room, so it's a good time to get ahead on hard subjects.",
        "If they've been getting well under their planned study done, don't pile extra onto ordinary weeks: move time toward deadline weeks rather than adding it.",
        "Only mention deadlines, subjects and goals from the details. Never name topics, chapters, texts or assessments that aren't written there.",
      ].join("\n"),
    },
    { role: "user", content: describe(inputs) },
  ];

  let reply: PlanReply | null = null;
  for (const [index, model] of effort.models.entries()) {
    const premium = effort.premium && index === 0;
    try {
      reply = await completeJson<PlanReply>(
        env,
        messages,
        PLAN_SCHEMA,
        isReasoningModel(model) ? replyBudget(true, premium) : 1400,
        { model, reasoningEffort: effort.reasoningEffort },
      );
      break;
    } catch (err) {
      if (index === effort.models.length - 1) throw err;
      console.error(`[month-plan] ${model} failed, trying the next model`, err);
    }
  }
  if (!reply || !Array.isArray(reply.weeks) || reply.weeks.length === 0) return null;

  const weeks = inputs.weeks.map((week, index) => {
    const answer = reply.weeks[index];
    const minutesFor = new Map(
      (answer?.subjects ?? []).map((entry) => [subjectKey(entry.name), Number(entry.minutes)]),
    );
    const subjects = inputs.subjects.map((subject) => {
      const key = subjectKey(subject.name);
      const base = inputs.base[key] ?? 0;
      const asked = minutesFor.get(key);
      return { name: subject.name, minutes: bound(Number.isFinite(asked) ? asked! : base, base) };
    });
    return {
      weekOf: week.weekOf,
      label: week.label,
      focus: clip(answer?.focus, 110) || "A steady week: every subject gets its usual time",
      subjects: fitWeek(subjects, inputs.capacity),
    };
  });

  return {
    summary: clip(reply.summary, 280) || fallbackPlan(inputs).summary,
    weeks,
    base: inputs.base,
    by: "arcad",
    createdAt: new Date().toISOString(),
  };
}

/**
 * Writes a fresh plan for the next four weeks and keeps it as the student's
 * only one. Arcad writes it when it can; otherwise (or if its answer is
 * unusable) it's built from the data alone, so this never leaves them
 * without a plan.
 */
export async function makeMonthPlan(env: Env, database: Database, userId: string): Promise<MonthPlan | null> {
  const inputs = await gatherInputs(database, userId);
  if (!inputs) return null;

  let plan: MonthPlan | null = null;
  if (aiConfigured(env) && inputs.subjects.length > 0) {
    try {
      plan = await arcadPlan(env, inputs, monthPlanEffort(env, await getUserTier(database, userId)));
    } catch (err) {
      console.error("[month-plan] Arcad failed, using the fallback", err);
    }
  }
  plan ??= fallbackPlan(inputs);

  await database.batch([
    database.delete(schema.monthPlans).where(eq(schema.monthPlans.userId, userId)),
    database.insert(schema.monthPlans).values({
      id: newId("mpl"),
      userId,
      startsOn: inputs.weeks[0].weekOf,
      endsOn: inputs.weeks[inputs.weeks.length - 1].days[6],
      plan: JSON.stringify(plan),
    }),
  ]);
  return plan;
}

/** The student's current month plan, or null if they don't have one. */
export async function getMonthPlan(database: Database, userId: string): Promise<MonthPlan | null> {
  const [row] = await database
    .select()
    .from(schema.monthPlans)
    .where(eq(schema.monthPlans.userId, userId))
    .orderBy(desc(schema.monthPlans.createdAt))
    .limit(1);
  if (!row) return null;
  try {
    return JSON.parse(row.plan) as MonthPlan;
  } catch {
    return null;
  }
}
