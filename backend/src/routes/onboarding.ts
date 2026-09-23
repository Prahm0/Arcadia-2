import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { db, schema } from "../db";
import { newId } from "../lib/ids";
import { qualifyReferral } from "../lib/referrals";
import { subjectKey } from "../lib/scheduler";
import { parseClock } from "../lib/time";
import { AU_STATES, countryCode } from "./profile";
import type { Env, Variables } from "../types";

/** Everything the profile holds, collected in one go at the end of onboarding. */
interface OnboardingBody {
  name?: string;
  grade?: string;
  /** ISO 3166 alpha-2, e.g. "AU". */
  country?: string | null;
  /** Australian state; ignored for other countries. */
  state?: string | null;
  school?: string | null;
  timezone?: string;
  atarTarget?: number | null;
  subjects?: Array<{
    name?: string;
    color?: string;
    priority?: number;
    weeklyMinutes?: number;
    targetGrade?: string | null;
    notes?: string;
  }>;
  goals?: string[];
  tasks?: Array<{
    title?: string;
    subject?: string | null;
    taskType?: string;
    dueAt?: string;
    estimatedMinutes?: number;
  }>;
  commitments?: Array<{
    title?: string;
    category?: string;
    recurrence?: string;
    weekday?: number | null;
    startDate?: string | null;
    startTime?: string;
    endTime?: string;
  }>;
  preferences?: {
    wakeTime?: string;
    bedtime?: string;
    minimumSleepMinutes?: number;
    maxDailyStudyMinutes?: number;
    preferredSessionMinutes?: number;
    breakMinutes?: number;
  };
  arcad?: {
    about?: string;
    style?: string;
    memoryEnabled?: boolean;
  };
}

const CATEGORIES = ["school", "sport", "extracurricular", "other"];
const RECURRENCES = ["none", "daily", "weekly", "weekdays"];
const TASK_TYPES = ["homework", "assignment", "exam", "revision", "project", "study"];
const TEXT_LIMIT = 1500;

const onboarding = new Hono<{ Bindings: Env; Variables: Variables }>();

/**
 * Saves the whole profile and marks onboarding done. The plan itself is
 * made next, by POST /api/plan/month and /api/plan/schedule, so the app can
 * show progress while it happens.
 */
onboarding.post("/", async (c) => {
  const { userId } = c.get("session");
  const body = await c.req.json<OnboardingBody>().catch(() => null);
  if (!body) return c.json({ error: "Invalid request." }, 400);

  const database = db(c.env.DB);
  const preferences = body.preferences ?? {};
  const arcad = body.arcad ?? {};
  const text = (value: unknown, limit: number) =>
    typeof value === "string" && value.trim() ? value.trim().slice(0, limit) : null;

  const wakeTime = parseClock(preferences.wakeTime) !== null ? preferences.wakeTime! : "07:00";
  const bedtime = parseClock(preferences.bedtime) !== null ? preferences.bedtime! : "22:30";
  const timezone = (body.timezone || "Australia/Brisbane").slice(0, 64);
  const country = countryCode(body.country);
  const state = country === "AU" ? (text(body.state, 8)?.toUpperCase() ?? null) : null;
  const atar = Number(body.atarTarget);
  const name = (body.name ?? "").trim().slice(0, 120);

  await database
    .update(schema.profiles)
    .set({
      displayName: name || null,
      grade: text(body.grade, 32),
      country,
      state: state && AU_STATES.includes(state) ? state : null,
      school: text(body.school, 120),
      atarTarget:
        body.atarTarget !== null && body.atarTarget !== undefined && Number.isFinite(atar) && atar >= 30 && atar <= 99.95
          ? Math.round(atar * 20) / 20
          : null,
      timezone,
      onboardingComplete: true,
      wakeTime,
      bedtime,
      minimumSleepMinutes: clamp(preferences.minimumSleepMinutes, 240, 720, 480),
      maxDailyStudyMinutes: clamp(preferences.maxDailyStudyMinutes, 30, 720, 180),
      preferredSessionMinutes: clamp(preferences.preferredSessionMinutes, 15, 180, 50),
      breakMinutes: clamp(preferences.breakMinutes, 0, 60, 15),
      arcadAbout: String(arcad.about ?? "").trim().slice(0, TEXT_LIMIT),
      arcadStyle: String(arcad.style ?? "").trim().slice(0, TEXT_LIMIT),
      memoryEnabled: arcad.memoryEnabled !== false,
    })
    .where(eq(schema.profiles.userId, userId));

  if (name) {
    await database.update(schema.users).set({ name }).where(eq(schema.users.id, userId));
  }

  // Subjects already there (onboarding sent twice) are updated, not doubled.
  const existing = await database.select().from(schema.subjects).where(eq(schema.subjects.userId, userId));
  const byKey = new Map(existing.map((subject) => [subjectKey(subject.name), subject.id]));
  for (const subject of body.subjects ?? []) {
    const subjectName = String(subject.name ?? "").trim().slice(0, 80);
    if (!subjectName) continue;
    const fields = {
      colour: subject.color ?? null,
      priority: clamp(subject.priority, 1, 5, 2),
      // Missing means "use the year-level default", which the scheduler
      // resolves at plan time; 20 hours a week is plenty for one subject.
      weeklyMinutes:
        subject.weeklyMinutes === undefined || subject.weeklyMinutes === null
          ? null
          : clamp(subject.weeklyMinutes, 0, 1200, 0),
      targetGrade: text(subject.targetGrade, 16),
      notes: String(subject.notes ?? "").trim().slice(0, TEXT_LIMIT),
    };
    const match = byKey.get(subjectKey(subjectName));
    if (match) {
      await database.update(schema.subjects).set(fields).where(eq(schema.subjects.id, match));
    } else {
      const id = newId("sub");
      await database.insert(schema.subjects).values({ id, userId, name: subjectName, ...fields });
      byKey.set(subjectKey(subjectName), id);
    }
  }

  const goalTitles = [...new Set((body.goals ?? []).map((goal) => String(goal ?? "").replace(/\s+/g, " ").trim().slice(0, 160)))]
    .filter(Boolean)
    .slice(0, 20);
  for (const title of goalTitles) {
    await database.insert(schema.goals).values({ id: newId("gol"), userId, title });
  }

  for (const task of body.tasks ?? []) {
    const title = String(task.title ?? "").trim().slice(0, 200);
    const dueAt = Date.parse(String(task.dueAt ?? ""));
    if (!title || Number.isNaN(dueAt)) continue;
    await database.insert(schema.tasks).values({
      id: newId("tsk"),
      userId,
      title,
      subject: text(task.subject, 80),
      taskType: TASK_TYPES.includes(String(task.taskType)) ? String(task.taskType) : "assignment",
      dueAt,
      estimatedMinutes: clamp(task.estimatedMinutes, 15, 1200, 60),
    });
  }

  for (const commitment of body.commitments ?? []) {
    const title = String(commitment.title ?? "").trim().slice(0, 200);
    if (!title) continue;
    const start = parseClock(commitment.startTime);
    const end = parseClock(commitment.endTime);
    if (start === null || end === null || end <= start) continue;
    const recurrence = RECURRENCES.includes(String(commitment.recurrence)) ? String(commitment.recurrence) : "weekly";
    const weekday = Number(commitment.weekday);
    if (recurrence === "weekly" && !(Number.isInteger(weekday) && weekday >= 0 && weekday <= 6)) continue;
    await database.insert(schema.commitments).values({
      id: newId("cmt"),
      userId,
      title,
      category: CATEGORIES.includes(String(commitment.category)) ? String(commitment.category) : "other",
      recurrence,
      weekday: recurrence === "weekly" ? weekday : null,
      startDate: commitment.startDate ?? null,
      startTime: commitment.startTime!,
      endTime: commitment.endTime!,
    });
  }

  // A referral only becomes qualified after the new student has verified
  // their email and completed their setup. The helper is idempotent, so a
  // retrying onboarding request cannot award Pro time twice.
  await qualifyReferral(database, userId);

  return c.json({ ok: true });
});

function clamp(value: unknown, min: number, max: number, fallback: number): number {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(max, Math.max(min, Math.round(numeric)));
}

export default onboarding;
