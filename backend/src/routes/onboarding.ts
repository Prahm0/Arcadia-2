import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { db, schema } from "../db";
import { newId } from "../lib/ids";
import { rebuildSchedule } from "../lib/scheduler";
import { DAY, parseClock, startOfLocalDay } from "../lib/time";
import type { Env, Variables } from "../types";

interface OnboardingBody {
  name?: string;
  grade?: string;
  timezone?: string;
  subjects?: Array<{ name?: string; color?: string; priority?: number }>;
  tasks?: Array<{ title?: string; subject?: string; dueAt?: string; estimatedMinutes?: number }>;
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
}

const onboarding = new Hono<{ Bindings: Env; Variables: Variables }>();

onboarding.post("/", async (c) => {
  const { userId } = c.get("session");
  const body = await c.req.json<OnboardingBody>().catch(() => null);
  if (!body) return c.json({ error: "Invalid request." }, 400);

  const database = db(c.env.DB);
  const preferences = body.preferences ?? {};

  const wakeTime = parseClock(preferences.wakeTime) !== null ? preferences.wakeTime! : "07:00";
  const bedtime = parseClock(preferences.bedtime) !== null ? preferences.bedtime! : "22:30";
  const timezone = (body.timezone || "Australia/Brisbane").slice(0, 64);

  await database
    .update(schema.profiles)
    .set({
      displayName: (body.name ?? "").trim().slice(0, 120) || null,
      grade: (body.grade ?? "").trim().slice(0, 32) || null,
      timezone,
      onboardingComplete: true,
      wakeTime,
      bedtime,
      minimumSleepMinutes: clamp(preferences.minimumSleepMinutes, 240, 720, 480),
      maxDailyStudyMinutes: clamp(preferences.maxDailyStudyMinutes, 30, 720, 180),
      preferredSessionMinutes: clamp(preferences.preferredSessionMinutes, 15, 180, 50),
      breakMinutes: clamp(preferences.breakMinutes, 0, 60, 15),
    })
    .where(eq(schema.profiles.userId, userId));

  if (body.name) {
    await database
      .update(schema.users)
      .set({ name: body.name.trim().slice(0, 120) })
      .where(eq(schema.users.id, userId));
  }

  for (const subject of body.subjects ?? []) {
    const name = String(subject.name ?? "").trim().slice(0, 80);
    if (!name) continue;
    await database.insert(schema.subjects).values({
      id: newId("sub"),
      userId,
      name,
      colour: subject.color ?? null,
      priority: clamp(subject.priority, 1, 5, 2),
    });
  }

  for (const task of body.tasks ?? []) {
    const title = String(task.title ?? "").trim().slice(0, 200);
    const dueAt = Date.parse(String(task.dueAt ?? ""));
    if (!title || Number.isNaN(dueAt)) continue;
    await database.insert(schema.tasks).values({
      id: newId("tsk"),
      userId,
      title,
      subject: task.subject ?? null,
      dueAt,
      estimatedMinutes: clamp(task.estimatedMinutes, 15, 1200, 60),
    });
  }

  for (const commitment of body.commitments ?? []) {
    const title = String(commitment.title ?? "").trim().slice(0, 200);
    if (!title) continue;
    if (parseClock(commitment.startTime) === null || parseClock(commitment.endTime) === null) {
      continue;
    }
    await database.insert(schema.commitments).values({
      id: newId("cmt"),
      userId,
      title,
      category: commitment.category ?? "other",
      recurrence: commitment.recurrence ?? "weekly",
      weekday: commitment.weekday ?? null,
      startDate: commitment.startDate ?? null,
      startTime: commitment.startTime!,
      endTime: commitment.endTime!,
    });
  }

  const start = startOfLocalDay(Date.now(), timezone);
  await rebuildSchedule(database, userId, start, start + 7 * DAY);

  return c.json({ ok: true });
});

function clamp(value: unknown, min: number, max: number, fallback: number): number {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(max, Math.max(min, Math.round(numeric)));
}

export default onboarding;
