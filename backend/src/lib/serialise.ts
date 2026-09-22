import { schema } from "../db";
import { defaultWeeklyMinutes } from "./scheduler";
import type { Checkout, SessionPlan } from "./session-plan";
import { iso } from "./time";

type TaskRow = typeof schema.tasks.$inferSelect;
type EventRow = typeof schema.events.$inferSelect;
type CommitmentRow = typeof schema.commitments.$inferSelect;
type SubjectRow = typeof schema.subjects.$inferSelect;
type ProfileRow = typeof schema.profiles.$inferSelect;
type UserRow = typeof schema.users.$inferSelect;

/** Matches PlannerTask in lib/api/types.ts. */
export function serialiseTask(task: TaskRow) {
  return {
    id: task.id,
    title: task.title,
    subject: task.subject,
    taskType: task.taskType,
    priority: task.priority,
    dueAt: iso(task.dueAt),
    remainingMinutes: Math.max(0, task.estimatedMinutes - task.completedMinutes),
    status: task.status as "pending" | "complete" | "cancelled",
  };
}

/** Matches PlannerEvent in lib/api/types.ts. */
export function serialiseEvent(event: EventRow) {
  return {
    id: event.id,
    title: event.title,
    subject: event.subject,
    taskId: event.taskId,
    category: event.category as
      | "study"
      | "school"
      | "sport"
      | "extracurricular"
      | "sleep"
      | "other",
    kind: event.kind ?? undefined,
    startAt: iso(event.startAt),
    endAt: iso(event.endAt),
    status: event.status as "planned" | "cancelled" | "completed" | "missed",
    outcome: event.outcome as "planned" | "completed" | "missed",
    source: event.source,
    editable: event.editable,
    pinned: event.pinned,
    plan: parseJson<SessionPlan>(event.plan),
    checkout: parseJson<Checkout>(event.checkout),
    startedAt: event.startedAt ? iso(event.startedAt) : null,
  };
}

function parseJson<T>(value: string | null | undefined): T | null {
  if (!value) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

export function serialiseCommitment(commitment: CommitmentRow) {
  return {
    id: commitment.id,
    title: commitment.title,
    category: commitment.category,
    recurrence: commitment.recurrence,
    weekday: commitment.weekday,
    startDate: commitment.startDate,
    startTime: commitment.startTime,
    endTime: commitment.endTime,
    notes: commitment.notes,
  };
}

/**
 * `weeklyMinutes` is always the target the scheduler is working to;
 * `weeklyMinutesSuggested` says it's the year-level default rather than a
 * number the student picked.
 */
export function serialiseSubject(subject: SubjectRow, grade: string | null | undefined) {
  return {
    id: subject.id,
    name: subject.name,
    colour: subject.colour,
    weeklyMinutes: subject.weeklyMinutes ?? defaultWeeklyMinutes(grade),
    weeklyMinutesSuggested: subject.weeklyMinutes === null,
    targetGrade: subject.targetGrade,
    notes: subject.notes,
  };
}

/** Matches AuthUser in lib/api/types.ts. */
export function serialiseUser(user: UserRow, profile: ProfileRow | null) {
  return {
    id: user.id,
    email: user.email,
    name: profile?.displayName || user.name,
    grade: profile?.grade ?? null,
    avatarColour: profile?.avatarColour ?? null,
    timezone: profile?.timezone ?? "Australia/Brisbane",
    onboardingComplete: profile?.onboardingComplete ?? false,
    tier: (user.tier === "pro" || user.tier === "max" ? user.tier : "free") as
      | "free"
      | "pro"
      | "max",
    hasSubscription: Boolean(user.stripeCustomerId),
    subscriptionStatus: user.subscriptionStatus ?? null,
    subscriptionCurrentPeriodEnd: user.subscriptionCurrentPeriodEnd
      ? new Date(user.subscriptionCurrentPeriodEnd).toISOString()
      : null,
  };
}

/** Matches PlannerProfile in lib/api/types.ts. */
export function serialiseProfile(profile: ProfileRow | null) {
  if (!profile) return null;
  return {
    displayName: profile.displayName ?? undefined,
    grade: profile.grade ?? undefined,
    timezone: profile.timezone,
    onboardingComplete: profile.onboardingComplete,
    wakeTime: profile.wakeTime,
    bedtime: profile.bedtime,
  };
}

export function serialisePreferences(profile: ProfileRow | null): Record<string, unknown> {
  if (!profile) return {};
  return {
    wakeTime: profile.wakeTime,
    bedtime: profile.bedtime,
    minimumSleepMinutes: profile.minimumSleepMinutes,
    maxDailyStudyMinutes: profile.maxDailyStudyMinutes,
    preferredSessionMinutes: profile.preferredSessionMinutes,
    breakMinutes: profile.breakMinutes,
  };
}
