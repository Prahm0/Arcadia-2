import { and, asc, eq, isNotNull, isNull, lt, ne, or } from "drizzle-orm";
import { db, schema, type Database } from "../db";
import type { Env } from "../types";
import { aiConfigured, completeJson, isReasoningModel, type ChatMessage } from "./openai";
import { layoutEffort, replyBudget, type PlanEffort } from "./plan-tier";
import { replan } from "./replan";
import {
  LAYOUT_DAYS,
  applyLayout,
  baseCredit,
  groundwork,
  layoutKey,
  loadScheduleInputs,
  readLayout,
  subjectKey,
  taskQueue,
  uniqueSubjects,
  weekFocus,
  weekTargets,
  type DayLayout,
  type Groundwork,
  type LayoutBlock,
  type PlanDay,
  type ScheduleInputs,
} from "./scheduler";
import { recentMissReasonContext, studyHabits } from "./study-context";
import type { Habits } from "./study-habits";
import { getUserTier, type Tier } from "./tiers";
import { DAY, MINUTE, localDateKey, parseClock, startOfLocalDay } from "./time";

/**
 * Arcad's day-by-day layout of the next week of study.
 *
 * The scheduler's rules are good at fitting minutes into gaps and bad at
 * judgement: left alone they'll hand a student four English essay blocks in
 * a row every day until it's due. So for the next week Arcad decides where
 * every block goes, the way a good tutor would: spread big tasks out, mix
 * subjects, hardest work first, lighter days, finished a day early.
 *
 * Arcad isn't left to work the week out from raw data. The brief does the
 * arithmetic for it: how much room each day has, how many sessions each task
 * needs and which days can take them before it's due, and which times of day
 * this student actually keeps.
 *
 * Every answer is checked by placing it exactly as the scheduler will. What
 * breaks a rule (or leaves work unbooked, crams, or lands on a due day) goes
 * back to Arcad to fix, with where there's still room, up to REPAIR_ROUNDS
 * times, and the best attempt is kept. The scheduler then places the layout
 * and fills any gaps itself, so a bad answer can never leave the student
 * without a plan. Which model does the thinking depends on their tier (see
 * plan-tier.ts).
 */

/** How many times Arcad gets its problems back to fix. */
const REPAIR_ROUNDS = 2;
/**
 * A layout refresh that's been going this long is assumed dead and retried.
 * Three calls to the paid model at high effort can take several minutes,
 * more on the flex tier (lib/openai.ts caps how long flex gets).
 */
const STALE_WORK_MS = 15 * MINUTE;
/** Blocks shouldn't end closer to bedtime than this. */
const BED_BUFFER = 30 * MINUTE;
/** Layouts the cron makes at once. */
const CRON_BATCH = 10;
/**
 * How long the week has to sit unchanged before Arcad lays it out again.
 * Setting up a week is a run of edits (five deadlines, a new shift), and
 * each one would otherwise cost a layout, and a paid student one of the
 * day's premium ones, for a week that's about to change again. The
 * scheduler's own placement covers the gap. A first layout doesn't wait.
 */
const QUIET_MS = 3 * MINUTE;

type Subject = typeof schema.subjects.$inferSelect;
type Task = typeof schema.tasks.$inferSelect;

interface Refs {
  tasks: Map<string, Task>;
  subjects: Map<string, Subject>;
  refOfTask: Map<string, string>;
  refOfSubject: Map<string, string>;
}

/** What each subject should get inside the layout's days. */
interface SubjectAsk {
  subject: Subject;
  minutes: number;
  /** How it reads in the brief. */
  text: string;
}

interface Context {
  inputs: ScheduleInputs;
  g: Groundwork;
  key: string;
  refs: Refs;
  /** Tasks Arcad can book, due after now. */
  tasks: Task[];
  asks: SubjectAsk[];
  /** Syllabus assessments that aren't on the deadline list. */
  assessments: Array<{ title: string; subject: string; kind: string; dueOn: string }>;
  goals: string[];
  memories: string[];
  habits: Habits;
  /** "Maths: tired for 3 missed blocks." */
  missReasons: string[];
  tier: Tier;
}

const clip = (value: unknown, max: number) => String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);

function dayName(date: string): string {
  return new Intl.DateTimeFormat("en-AU", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(
    Date.parse(`${date}T12:00:00Z`),
  );
}

function clock(at: number, dayStart: number): string {
  const minutes = Math.round((at - dayStart) / MINUTE);
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

function when(at: number, tz: string): string {
  return new Intl.DateTimeFormat("en-AU", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    timeZone: tz,
  }).format(at);
}

const going = (priority: number) => (priority >= 3 ? "finding it hard" : priority <= 1 ? "going well" : "going okay");

async function gather(database: Database, userId: string): Promise<Context | null> {
  const [profile] = await database.select().from(schema.profiles).where(eq(schema.profiles.userId, userId)).limit(1);
  if (!profile) return null;
  const tz = profile.timezone;
  const from = startOfLocalDay(Date.now(), tz);
  const inputs = await loadScheduleInputs(database, userId, from, from + LAYOUT_DAYS * DAY);
  if (!inputs) return null;
  const g = groundwork(userId, inputs, from, from + LAYOUT_DAYS * DAY);
  const subjects = uniqueSubjects(inputs.subjects);

  const [assessmentRows, goalRows, memoryRows, habits, missReasons, tier] = await Promise.all([
    database
      .select()
      .from(schema.subjectAssessments)
      .where(and(eq(schema.subjectAssessments.userId, userId), isNull(schema.subjectAssessments.taskId))),
    database.select().from(schema.goals).where(and(eq(schema.goals.userId, userId), ne(schema.goals.done, true))),
    database.select().from(schema.memories).where(eq(schema.memories.userId, userId)).orderBy(asc(schema.memories.createdAt)),
    studyHabits(database, userId, tz),
    recentMissReasonContext(database, userId),
    getUserTier(database, userId),
  ]);

  const tasks = taskQueue(inputs.tasks, g.sessionLength)
    .map((entry) => entry.task)
    .filter((task) => task.dueAt > g.now);
  const refs: Refs = { tasks: new Map(), subjects: new Map(), refOfTask: new Map(), refOfSubject: new Map() };
  tasks.forEach((task, index) => {
    refs.tasks.set(`T${index + 1}`, task);
    refs.refOfTask.set(task.id, `T${index + 1}`);
  });
  subjects.forEach((subject, index) => {
    refs.subjects.set(`S${index + 1}`, subject);
    refs.refOfSubject.set(subjectKey(subject.name), `S${index + 1}`);
  });

  // Each subject's minutes: what's left of this week's target, plus a share
  // of next week's for the days of it the layout covers.
  const credit = baseCredit(inputs, g);
  const weeks = [...new Set(g.days.map((day) => day.weekStart))];
  const targets = new Map(weeks.map((week) => [week, weekTargets(inputs, week)]));
  const asks = subjects.map((subject): SubjectAsk => {
    const parts: string[] = [];
    let minutes = 0;
    for (const week of weeks) {
      const days = g.days.filter((day) => day.weekStart === week);
      const target = Math.round((targets.get(week)?.get(subject) ?? 0) / MINUTE);
      const range = `${dayName(days[0].date)}–${dayName(days[days.length - 1].date)}`;
      if (week === weeks[0]) {
        const covered = Math.round(credit.covered(week, subject.name) / MINUTE);
        const left = Math.max(0, target - covered);
        minutes += left;
        parts.push(
          `${left} min over ${range} (its week's target is ${target}${covered ? `, ${covered} already done or booked` : ""})`,
        );
      } else {
        const share = Math.round((target * days.length) / 7 / 5) * 5;
        minutes += share;
        parts.push(`about ${share} min over ${range} (${target} a week)`);
      }
    }
    return { subject, minutes, text: parts.join("; then ") };
  });

  const today = localDateKey(g.now, tz);
  const soon = localDateKey(g.now + 21 * DAY, tz);
  const subjectById = new Map(subjects.map((subject) => [subject.id, subject.name]));
  return {
    inputs,
    g,
    key: layoutKey(inputs, g),
    refs,
    tasks,
    asks,
    assessments: assessmentRows
      .filter((row) => row.dueOn && row.dueOn >= today && row.dueOn <= soon && subjectById.has(row.subjectId))
      .map((row) => ({ title: row.title, subject: subjectById.get(row.subjectId)!, kind: row.kind, dueOn: row.dueOn! })),
    goals: goalRows.map((goal) => goal.title),
    memories: profile.memoryEnabled ? memoryRows.map((row) => row.content) : [],
    habits,
    missReasons: missReasons.slice(0, 4),
    tier,
  };
}

function weekday(date: string): string {
  return new Intl.DateTimeFormat("en-AU", { weekday: "short", timeZone: "UTC" }).format(Date.parse(`${date}T12:00:00Z`));
}

/** Study a day can still take: its free time, up to the daily limit. */
function dayRoom(day: PlanDay): number {
  const free = day.free.reduce((sum, slot) => sum + (slot.end - slot.start), 0);
  return Math.max(0, Math.min(day.cap - day.used, free));
}

/**
 * The arithmetic for one piece of deadline work due inside the layout: how
 * many sessions it is, the day to have it done by, and which days before
 * then have room. Room is shared with everything else, so it's a guide.
 */
function workPlan(ctx: Context, task: Task): string {
  const { g } = ctx;
  const session = Math.round(g.sessionLength / MINUTE);
  const left = Math.max(0, task.estimatedMinutes - task.completedMinutes);
  const sessions = Math.max(1, Math.round(left / session));
  const size = `Plan: about ${sessions} session${sessions === 1 ? "" : "s"} of ${Math.round(left / sessions / 5) * 5} min.`;
  const due = localDateKey(task.dueAt, ctx.inputs.profile.timezone);
  const before = g.days.filter((day) => day.date < due && dayRoom(day) >= 25 * MINUTE);
  if (before.length === 0) return `${size} No day before it's due has room, so book it in the first free time that fits.`;

  const days = before.map((day) => weekday(day.date)).join(", ");
  const roomBefore = Math.round(before.reduce((sum, day) => sum + dayRoom(day), 0) / MINUTE);
  if (roomBefore < left) {
    return `${size} Only ${roomBefore} min of room before its due day (${days}): use it, and finish the rest on the due day before it's due.`;
  }
  const spread = Math.min(before.length, sessions, 3);
  return `${size} Finish by ${dayName(before[before.length - 1].date)}. Days with room before then: ${days}.${
    spread >= 2 ? ` Spread it over at least ${spread} of them.` : ""
  }`;
}

/** Everything Arcad knows about the week, as it reads it. */
function brief(ctx: Context, previous: DayLayout | null): string {
  const { inputs, g, refs } = ctx;
  const { profile } = inputs;
  const tz = profile.timezone;
  const minutes = (ms: number) => Math.round(ms / MINUTE);

  const lines = [
    `Now: ${when(g.now, tz)}.`,
    `Student: ${profile.grade ?? "year not given"}${profile.state ? `, ${profile.state}` : ""}.`,
    `Their settings: sessions usually ${minutes(g.sessionLength)} min, breaks ${minutes(g.breakLength)} min, at most ${minutes(g.dailyCap)} min of study a day. Up at ${profile.wakeTime}, bed at ${profile.bedtime}.`,
    "",
    "Days (free = when study can go; everything else is school, sleep, commitments or plans they've made):",
  ];

  for (const day of g.days) {
    const end = day.start + DAY;
    const weekday = new Date(`${day.date}T12:00:00Z`).getUTCDay();
    // School always blocks its hours now (an explicit commitment is never
    // silently freed by a holiday guess), so weekdays are just school days.
    const kind = weekday === 0 || weekday === 6 ? "weekend" : "school day";
    const busy = [
      ...g.fixed.filter((row) => row.category !== "sleep"),
      ...g.keep.filter((event) => event.category !== "sleep"),
    ]
      .filter((row) => row.startAt < end && row.endAt > day.start)
      .sort((a, b) => a.startAt - b.startAt)
      .map((row) => `${clip(row.title, 40)} ${clock(Math.max(row.startAt, day.start), day.start)}–${clock(Math.min(row.endAt, end), day.start)}`);
    const free = day.free.map((slot) => `${clock(slot.start, day.start)}–${clock(slot.end, day.start)}`);
    lines.push(
      `- ${day.date} ${dayName(day.date)}${day.date === localDateKey(g.now, tz) ? " (today)" : ""}, ${kind}.` +
        ` Free: ${free.length ? free.join(", ") : "none"}.` +
        (busy.length ? ` Busy: ${busy.join(", ")}.` : "") +
        (day.used ? ` Study they've already booked: ${minutes(day.used)} min (counts toward the limit).` : "") +
        ` Room for up to ${minutes(dayRoom(day))} min of study.`,
    );
  }

  const horizon = g.days[g.days.length - 1].start + DAY;
  const dueWork = ctx.tasks
    .filter((task) => task.dueAt < horizon)
    .reduce((sum, task) => sum + Math.max(0, task.estimatedMinutes - task.completedMinutes), 0);
  const subjectTime = ctx.asks.reduce((sum, ask) => sum + ask.minutes, 0);
  lines.push(
    "",
    `Room: about ${minutes(room(g))} min of study fits in these days within the daily limit. Deadline work due in them needs ${dueWork} min; subjects ask for ${subjectTime} min (deadline work counts toward its subject).${
      dueWork + subjectTime > minutes(room(g)) ? " Not everything fits, so prioritise as the rules say." : ""
    }`,
  );
  lines.push("", ctx.tasks.length ? "Deadline work (ref: what, due, work left, and a plan for it):" : "Deadline work: none.");
  for (const task of ctx.tasks) {
    const left = Math.max(0, task.estimatedMinutes - task.completedMinutes);
    lines.push(
      `- ${refs.refOfTask.get(task.id)}: ${clip(task.title, 80)} (${task.subject ?? "no subject"}, ${task.taskType}${
        task.priority >= 4 ? ", high priority" : ""
      }), due ${when(task.dueAt, tz)}, ${left} min left${task.completedMinutes ? ` (${task.completedMinutes} done)` : ""}. ${
        task.dueAt >= horizon ? "Due after these 7 days: make steady progress, it doesn't need finishing." : workPlan(ctx, task)
      }`,
    );
  }

  lines.push("", "Subjects (ref: name, how it's going, minutes to give it in these 7 days):");
  for (const ask of ctx.asks) {
    const { subject } = ask;
    const extra = [
      going(subject.priority),
      subject.targetGrade ? `aiming for ${subject.targetGrade}` : "",
      subject.notes.trim() ? `note: ${clip(subject.notes, 160)}` : "",
    ].filter(Boolean);
    lines.push(`- ${refs.refOfSubject.get(subjectKey(subject.name))}: ${subject.name}, ${extra.join("; ")}. ${ask.text}.`);
  }

  const focus = [...new Set(g.days.map((day) => day.weekStart))]
    .map((week) => weekFocus(inputs, week))
    .filter(Boolean);
  if (focus.length) lines.push("", `The month plan says: ${focus.join(" Then: ")}`);
  if (ctx.assessments.length) {
    lines.push(
      "",
      "Coming up on their syllabus (not on the deadline list, so book them as subject time, not deadline work):",
      ...ctx.assessments.map((item) => `- ${clip(item.title, 80)} (${item.subject}, ${item.kind}), ${dayName(item.dueOn)}`),
    );
  }
  if (ctx.habits.lines.length) {
    lines.push(
      "",
      "How their study has actually gone over the last four weeks (blocks they marked done or missed):",
      ...ctx.habits.lines.map((line) => `- ${line}`),
    );
  }
  if (ctx.missReasons.length) {
    lines.push("Why they've missed blocks lately:", ...ctx.missReasons.map((line) => `- ${line}`));
  }
  if (profile.atarTarget) lines.push("", `ATAR target ${profile.atarTarget.toFixed(2)}.`);
  if (ctx.goals.length) lines.push(`Goals: ${ctx.goals.join("; ")}.`);
  if (profile.arcadAbout.trim()) lines.push(`About them: ${clip(profile.arcadAbout, 600)}`);
  if (ctx.memories.length) lines.push(`You remember: ${ctx.memories.slice(-10).join(" ")}`);

  const kept = (previous?.blocks ?? []).filter((block) => g.days.some((day) => day.date === block.date));
  if (kept.length) {
    lines.push("", "Your layout from last time (keep what still works, change what the details above call for):");
    for (const day of g.days) {
      const blocks = kept
        .filter((block) => block.date === day.date)
        .map((block) => {
          const ref = block.taskId ? refs.refOfTask.get(block.taskId) : refs.refOfSubject.get(subjectKey(block.subject));
          return ref ? `${block.start} ${ref} ${block.minutes}` : null;
        })
        .filter(Boolean);
      if (blocks.length) lines.push(`- ${day.date}: ${blocks.join(", ")}`);
    }
  }
  return lines.join("\n");
}

function instructions(ctx: Context): string {
  const { g } = ctx;
  const session = Math.round(g.sessionLength / MINUTE);
  const breakMinutes = Math.round(g.breakLength / MINUTE);
  const cap = Math.round(g.dailyCap / MINUTE);
  return [
    "You are Arcad, the study planner inside Arcadia, for Australian high school students.",
    `You're laying out the student's next ${g.days.length} days of study, block by block. This is the calendar they'll actually follow, so take the time to get it right: work out what needs doing, draft the week, check every rule below, fix what breaks, then answer.`,
    "",
    "Hard rules. A block that breaks one is thrown out:",
    "1. Every block sits entirely inside one of that day's free windows. Nothing before now today.",
    `2. At least ${breakMinutes} min between one study block ending and the next starting.`,
    `3. Start times are 24-hour HH:MM on 5-minute marks. Blocks are 25 to 90 min; ${session} min is their usual.`,
    `4. A day's study, counting what they've already booked, never goes over ${cap} min.`,
    "5. Deadline work ends before its due time. Use only the refs listed (T for deadline work, S for subjects).",
    "",
    "What makes it a good week:",
    "- Deadlines first. Book every minute of deadline work that's due in these days, and finish it by the day before it's due where you can, so there's slack if something goes wrong. For work due in the morning, the evening before is the last resort, not the plan. Each task comes with a plan worked out from the calendar (sessions, finish-by day, days with room): follow it unless another task needs the same room more urgently.",
    "- Spread big tasks out. Split them across several days rather than cramming one: at most two blocks of the same task in a day (three only when the due date leaves no other way), and never the same thing back to back when anything else could go between. Start early rather than late; make the last session before it's due a check-and-polish.",
    "- Tests and exams: shorter spaced revision sessions over several days, the last one the day before.",
    "- Deadline work due after these days: a couple of blocks now so it isn't all left to the last week.",
    "- Subjects: give each roughly its minutes, over two or more different days rather than all at once. Deadline work counts toward its subject's minutes, so a subject with a big assignment needs less extra subject time that week.",
    "- Mix subjects within a day. Put the hardest work (subjects they find hard, big assessments) in the first block of the day when they're fresh, lighter review later.",
    "- Timing: after school, leave 20 to 30 min to get home and eat before the first block where the window allows. Finish at least 30 min before bed. No early mornings on school days. On weekends, late morning and afternoon, leaving evenings mostly free.",
    "- The daily limit is a ceiling, not a target. Keep the load steady across the week, give them one lighter day (a Friday or a weekend day) unless deadlines need it, and ease off the day after a big deadline.",
    "- Plan for the student they actually are. If their history shows times they reliably keep, put the important work there; avoid times they often skip unless nothing else fits, and never put deadline work there when there's another option. If a subject keeps slipping, give it shorter blocks at their reliable times. If they get well under their planned study done, a steady week they'll keep beats one packed to the limit: protect the deadline work first and keep the rest lighter.",
    "- If there isn't room for everything: deadlines by due date first, then subjects they're finding hard, then the rest. Say so in approach.",
    "- If your layout from last time is given, keep its blocks where they still make sense and change only what needs changing, so their week doesn't reshuffle every day.",
    "",
    "Reply with:",
    "- approach: one to three short sentences to the student on how the week's set up (which days carry the big work, which is lighter). Casual Australian English, no emojis. Only mention tasks and subjects from the details.",
    `- days: all ${g.days.length} days in order (dates as given), each with its blocks in time order, even when there are none. Each block: start (HH:MM), minutes, ref.`,
  ].join("\n");
}

const LAYOUT_SCHEMA = {
  name: "day_layout",
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["approach", "days"],
    properties: {
      approach: { type: "string" },
      days: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["date", "blocks"],
          properties: {
            date: { type: "string" },
            blocks: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                required: ["start", "minutes", "ref"],
                properties: {
                  start: { type: "string" },
                  minutes: { type: "integer" },
                  ref: { type: "string" },
                },
              },
            },
          },
        },
      },
    },
  },
};

interface Reply {
  approach: string;
  days: Array<{ date: string; blocks: Array<{ start: string; minutes: number; ref: string }> }>;
}

/** Arcad's reply as a layout. Unknown refs are kept so the check can report them. */
function toLayout(ctx: Context, reply: Reply, model: string): { layout: DayLayout; unknown: string[] } {
  const unknown: string[] = [];
  const blocks: LayoutBlock[] = [];
  for (const day of reply.days ?? []) {
    for (const block of day.blocks ?? []) {
      const ref = String(block.ref ?? "").trim().toUpperCase();
      const task = ctx.refs.tasks.get(ref);
      const subject = ctx.refs.subjects.get(ref);
      if (!task && !subject) {
        unknown.push(`${day.date} ${block.start}: "${block.ref}" isn't one of the refs`);
        continue;
      }
      blocks.push({
        date: String(day.date),
        start: String(block.start).trim().padStart(5, "0"),
        minutes: Number(block.minutes),
        taskId: task?.id ?? null,
        subject: subject?.name ?? null,
      });
    }
  }
  return {
    layout: {
      dates: ctx.g.days.map((day) => day.date),
      blocks,
      summary: clip(reply.approach, 280),
      model,
      createdAt: new Date().toISOString(),
    },
    unknown,
  };
}

interface Review {
  /** Blocks that would be thrown out. */
  broken: string[];
  /** Blocks that fit but make a poor week: unbooked work, cramming, lopsided subjects. */
  weak: string[];
  /** How many of those are work or subject time left unbooked. */
  gaps: number;
  /** Where study can still go once this layout is placed, day by day. */
  roomLeft: string[];
}

/** Study the days can still take: free time, up to the daily limit. */
function room(g: Groundwork): number {
  return g.days.reduce((sum, day) => sum + dayRoom(day), 0);
}

/**
 * Places the layout exactly as the scheduler will, on a fresh copy of the
 * week, and reports everything wrong with it in words Arcad can act on.
 */
function review(ctx: Context, layout: DayLayout, unknown: string[]): Review {
  const { inputs, refs } = ctx;
  const tz = inputs.profile.timezone;
  const g = groundwork(inputs.profile.userId, inputs, ctx.g.days[0].start, ctx.g.days[0].start + LAYOUT_DAYS * DAY, ctx.g.now);
  const queue = taskQueue(inputs.tasks, g.sessionLength);
  const { placed, problems } = applyLayout(g, layout, queue, inputs.subjects);
  const broken = [...unknown, ...problems];
  const weak: string[] = [];
  let gaps = 0;
  // Less than a session's worth of room left means the week is as full as it gets.
  const full = room(g) < g.sessionLength;

  const nudged = placed.filter((item) => {
    const asked = layout.blocks.find(
      (block) =>
        (block.taskId ? block.taskId === item.taskId : subjectKey(block.subject) === subjectKey(item.subject)) &&
        block.date === localDateKey(item.block.start, tz),
    );
    return asked && clock(item.block.start, startOfLocalDay(item.block.start, tz)) !== asked.start;
  });
  if (nudged.length > 1) weak.push(`${nudged.length} blocks had to be moved later to leave a break; leave the full break yourself.`);

  const horizon = g.days[g.days.length - 1].start + DAY;
  for (const entry of queue) {
    const ref = refs.refOfTask.get(entry.task.id);
    if (!ref || entry.remaining <= 0) continue;
    if (entry.task.dueAt < horizon) {
      gaps++;
      weak.push(
        `${ref} (${clip(entry.task.title, 50)}) still has ${Math.round(entry.remaining / MINUTE)} min unbooked and is due ${when(entry.task.dueAt, tz)}. Book all of it.`,
      );
    }
  }

  // Work left for its due day when an earlier day could have taken it.
  for (const entry of queue) {
    const ref = refs.refOfTask.get(entry.task.id);
    if (!ref || entry.task.dueAt >= horizon) continue;
    const due = localDateKey(entry.task.dueAt, tz);
    const onDueDay = placed
      .filter((item) => item.taskId === entry.task.id && localDateKey(item.block.start, tz) === due)
      .reduce((sum, item) => sum + (item.block.end - item.block.start), 0);
    if (onDueDay === 0) continue;
    const spare = g.days.filter((day) => day.date < due).reduce((sum, day) => sum + dayRoom(day), 0);
    if (spare >= onDueDay) {
      weak.push(
        `${ref}: ${Math.round(onDueDay / MINUTE)} min is on its due day (${dayName(due)}) but there's room before. Move it earlier so it's done a day ahead.`,
      );
    }
  }

  const bed = parseClock(inputs.profile.bedtime);
  const wake = parseClock(inputs.profile.wakeTime);
  const lateDays: string[] = [];

  for (const day of g.days) {
    const today = placed
      .filter((item) => localDateKey(item.block.start, tz) === day.date)
      .sort((a, b) => a.block.start - b.block.start);

    // Winding down before bed, where the day had earlier room to use instead.
    // A bedtime after midnight belongs to the next day, so it's left alone.
    if (bed !== null && wake !== null && bed > wake) {
      const cutoff = day.start + bed * MINUTE - BED_BUFFER;
      const late = today.find((item) => item.block.end > cutoff);
      const length = late ? late.block.end - late.block.start : 0;
      if (late && day.free.some((slot) => Math.min(slot.end, cutoff) - slot.start >= length)) {
        lateDays.push(`${dayName(day.date)} ${clock(late.block.start, day.start)}`);
      }
    }
    const perTask = new Map<string, number>();
    for (const item of today) if (item.taskId) perTask.set(item.taskId, (perTask.get(item.taskId) ?? 0) + 1);
    for (const [taskId, count] of perTask) {
      const entry = queue.find((candidate) => candidate.task.id === taskId);
      const task = refs.tasks.get(refs.refOfTask.get(taskId) ?? "");
      if (!task || count <= 2) continue;
      // More than two is fine only when the due date forces it.
      const daysLeft = Math.max(1, Math.ceil((task.dueAt - day.start) / DAY));
      const left = Math.max(0, task.estimatedMinutes - task.completedMinutes) * MINUTE;
      if (count > Math.ceil(left / (entry?.unit || g.sessionLength) / daysLeft)) {
        weak.push(`${day.date}: ${count} blocks of ${refs.refOfTask.get(taskId)}. Spread it over more days.`);
      }
    }
    const kinds = new Set(today.map((item) => item.taskId ?? subjectKey(item.subject)));
    for (let i = 1; i < today.length; i++) {
      const a = today[i - 1].taskId ?? subjectKey(today[i - 1].subject);
      const b = today[i].taskId ?? subjectKey(today[i].subject);
      if (a === b && kinds.size > 1) {
        weak.push(`${day.date} ${clock(today[i].block.start, day.start)}: the same thing twice in a row. Put something else between.`);
      }
    }
  }
  if (lateDays.length) {
    weak.push(
      `Blocks run within ${BED_BUFFER / MINUTE} min of bed (${inputs.profile.bedtime}) on ${lateDays.join(", ")}, though those days have earlier room. Finish earlier.`,
    );
  }

  // A student who gets well under their planned study done is better served
  // by a lighter week they'll keep, so subjects may run further short.
  const slack = ctx.habits.keptShare !== null && ctx.habits.keptShare < 0.6 ? 0.4 : 0.25;
  for (const ask of ctx.asks) {
    const got = placed
      .filter((item) => subjectKey(item.subject) === subjectKey(ask.subject.name))
      .reduce((sum, item) => sum + (item.block.end - item.block.start), 0);
    const short = ask.minutes * MINUTE - got;
    if (!full && short > Math.max(30 * MINUTE, ask.minutes * MINUTE * slack)) {
      gaps++;
      weak.push(
        `${refs.refOfSubject.get(subjectKey(ask.subject.name))} (${ask.subject.name}) gets ${Math.round(got / MINUTE)} of its ${ask.minutes} min, counting its deadline work. Give it more if there's room.`,
      );
    }
    const onDays = new Set(
      placed.filter((item) => subjectKey(item.subject) === subjectKey(ask.subject.name)).map((item) => localDateKey(item.block.start, tz)),
    );
    if (ask.minutes >= 2 * Math.round(g.sessionLength / MINUTE) && onDays.size === 1) {
      weak.push(`${ask.subject.name} is all on one day. Spread it over two or more.`);
    }
  }

  const roomLeft = g.days.flatMap((day) => {
    const windows = day.free
      .filter((slot) => slot.end - slot.start >= 25 * MINUTE)
      .map((slot) => `${clock(slot.start, day.start)}–${clock(slot.end, day.start)}`);
    if (windows.length === 0 || dayRoom(day) < 25 * MINUTE) return [];
    return [`${day.date} ${weekday(day.date)}: ${windows.join(", ")} (up to ${Math.round(dayRoom(day) / MINUTE)} min more)`];
  });

  return { broken, weak, gaps, roomLeft };
}

/** Lower is better. Unbooked work and thrown-out blocks count most. */
const score = (r: Review) => r.broken.length * 3 + r.gaps * 3 + r.weak.length;

/**
 * Asks Arcad for the layout, then hands back what's wrong until it's clean
 * or the rounds run out. Returns the best attempt, or null if Arcad never
 * answered usefully.
 */
async function askArcad(
  env: Env,
  ctx: Context,
  previous: DayLayout | null,
  effort: PlanEffort,
): Promise<DayLayout | null> {
  const messages: ChatMessage[] = [
    { role: "system", content: instructions(ctx) },
    { role: "user", content: brief(ctx, previous) },
  ];

  // Down the list when a model is unavailable: that shouldn't cost them a layout.
  let modelIndex = 0;
  const ask = async (): Promise<{ reply: Reply | null; model: string }> => {
    for (;;) {
      const model = effort.models[modelIndex];
      const premium = effort.premium && modelIndex === 0;
      try {
        const reply = await completeJson<Reply>(
          env,
          messages,
          LAYOUT_SCHEMA,
          replyBudget(isReasoningModel(model), premium),
          {
            model,
            reasoningEffort: premium ? effort.reasoningEffort : "medium",
            // Layouts are made in the background while the scheduler's own
            // placement covers the week, so nobody is waiting: half price.
            serviceTier: "flex",
            usage: { feature: "day_layout", userId: ctx.inputs.profile.userId },
          },
        );
        return { reply, model };
      } catch (err) {
        if (modelIndex >= effort.models.length - 1) throw err;
        console.error(`[day-plan] ${model} failed, trying ${effort.models[modelIndex + 1]}`, err);
        modelIndex++;
      }
    }
  };

  let best: { layout: DayLayout; review: Review } | null = null;
  for (let round = 0; round <= REPAIR_ROUNDS; round++) {
    const { reply, model } = await ask();
    if (!reply || !Array.isArray(reply.days)) break;

    const { layout, unknown } = toLayout(ctx, reply, model);
    const result = review(ctx, layout, unknown);
    if (!best || score(result) < score(best.review)) best = { layout: { ...layout, gaps: result.gaps }, review: result };
    if (result.broken.length === 0 && result.weak.length === 0) break;
    if (round === REPAIR_ROUNDS) break;

    messages.push(
      { role: "assistant", content: JSON.stringify(reply) },
      {
        role: "user",
        content: [
          "I placed that on their calendar and checked it. Fix these, keep everything else, and send the whole layout again:",
          ...[...result.broken, ...result.weak].slice(0, 25).map((line) => `- ${line}`),
          ...(result.roomLeft.length
            ? ["", "Where there's still room once that's placed (free windows, and how much more study each day can take):", ...result.roomLeft.map((line) => `- ${line}`)]
            : ["", "Every day is at its limit once that's placed, so move blocks rather than add them."]),
        ].join("\n"),
      },
    );
  }
  if (best && best.review.broken.length + best.review.weak.length > 0) {
    console.log("[day-plan] kept a layout with problems", [...best.review.broken, ...best.review.weak].slice(0, 10));
  }
  return best?.layout ?? null;
}

/**
 * What a layout is planned from, minus the work done on tasks since. Two
 * weeks with the same basis differ only by work the student has logged.
 */
function layoutBasis(ctx: Context): string {
  return layoutKey({ ...ctx.inputs, tasks: ctx.inputs.tasks.map((task) => ({ ...task, completedMinutes: 0 })) }, ctx.g);
}

/**
 * The last layout, if it can stand. Ticking off a deadline block lowers the
 * work left, which changes the key, but usually leaves the rest of the week
 * exactly right. If that's all that changed and the check still finds
 * nothing to fix, asking Arcad again would cost a call for the same week.
 */
function stillHolding(ctx: Context, previous: DayLayout | null, basis: string): DayLayout | null {
  if (!previous || previous.basis !== basis) return null;
  if (!ctx.g.days.every((day) => previous.dates.includes(day.date))) return null;
  const check = review(ctx, previous, []);
  return check.broken.length === 0 && check.weak.length === 0 ? { ...previous, gaps: 0 } : null;
}

/**
 * Makes a fresh layout for the next week and saves it. Returns it, or null
 * when Arcad isn't available or has nothing to plan (the scheduler's rules
 * then cover the week on their own).
 */
export async function makeLayout(env: Env, database: Database, userId: string): Promise<DayLayout | null> {
  const ctx = await gather(database, userId);
  if (!ctx) return null;

  const [row] = await database.select().from(schema.dayLayouts).where(eq(schema.dayLayouts.userId, userId)).limit(1);
  const previous = readLayout(row?.layout);
  const nothingToPlan = ctx.tasks.length === 0 && ctx.asks.every((ask) => ask.minutes <= 0);
  const basis = layoutBasis(ctx);
  let layout: DayLayout | null = null;
  if (aiConfigured(env) && !nothingToPlan) {
    layout = stillHolding(ctx, previous, basis);
    if (layout) {
      console.log("[day-plan] last layout still holds", userId);
    } else {
      // Paid students get a few layouts a day on the stronger model.
      const today = localDateKey(ctx.g.now, ctx.inputs.profile.timezone);
      const premiumToday = previous?.premium?.day === today ? previous.premium.count : 0;
      const effort = layoutEffort(env, ctx.tier, premiumToday);
      layout = await askArcad(env, ctx, previous, effort);
      if (!layout) throw new Error("Arcad didn't send a usable layout.");
      const usedPremium = effort.premium && layout.model === effort.models[0];
      layout.premium = { day: today, count: premiumToday + (usedPremium ? 1 : 0) };
      layout.basis = basis;
    }
  }

  // Clears any pending request too: if the inputs moved on while Arcad was
  // working, the next rebuild sees the key differ and asks again.
  const done = {
    layout: layout ? JSON.stringify(layout) : null,
    inputsKey: ctx.key,
    wantedKey: null,
    workingAt: null,
    updatedAt: Date.now(),
  };
  await database
    .insert(schema.dayLayouts)
    .values({ userId, ...done })
    .onConflictDoUpdate({ target: schema.dayLayouts.userId, set: done });
  return layout;
}

/**
 * The cron's half: makes fresh layouts for students whose schedule changed
 * since their last one, then lays the calendar out again from it.
 */
export async function refreshWantedLayouts(env: Env): Promise<void> {
  if (!aiConfigured(env)) return;
  const database = db(env.DB);
  const cutoff = Date.now() - STALE_WORK_MS;
  const settled = Date.now() - QUIET_MS;
  const rows = await database
    .select()
    .from(schema.dayLayouts)
    .where(
      and(
        isNotNull(schema.dayLayouts.wantedKey),
        or(isNull(schema.dayLayouts.workingAt), lt(schema.dayLayouts.workingAt, cutoff)),
        // Unchanged for QUIET_MS, or their first layout.
        or(
          isNull(schema.dayLayouts.wantedAt),
          lt(schema.dayLayouts.wantedAt, settled),
          isNull(schema.dayLayouts.inputsKey),
        ),
      ),
    )
    .limit(CRON_BATCH);

  await Promise.all(
    rows.map(async (row) => {
      // Claim it, so an overlapping cron run leaves it alone.
      const claimed = await database
        .update(schema.dayLayouts)
        .set({ workingAt: Date.now() })
        .where(
          and(
            eq(schema.dayLayouts.userId, row.userId),
            row.workingAt === null ? isNull(schema.dayLayouts.workingAt) : eq(schema.dayLayouts.workingAt, row.workingAt),
          ),
        )
        .returning({ userId: schema.dayLayouts.userId });
      if (claimed.length === 0) return;
      try {
        await makeLayout(env, database, row.userId);
        await replan(database, row.userId);
      } catch (err) {
        // workingAt stays set, so this waits STALE_WORK_MS before a retry.
        console.error("[day-plan] refresh failed", row.userId, err);
      }
    }),
  );
}
