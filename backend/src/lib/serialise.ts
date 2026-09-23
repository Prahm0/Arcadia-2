import { schema } from "../db";
import { defaultWeeklyMinutes } from "./scheduler";
import type { Checkout, SessionPlan } from "./session-plan";
import { iso } from "./time";
import { effectiveTier } from "./tiers";

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
    missReason: event.missReason,
    missNote: event.missNote,
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
/**
 * Subject colours saved from palettes the app no longer uses, mapped to the
 * nearest current swatch (lib/app/categoryColors.ts) so old subjects don't
 * keep the earthy or neon look.
 */
const RETIRED_COLOURS: Record<string, string> = {
  "#b4623c": "#e8603c", // terracotta -> orange
  "#5e7a8c": "#2f7cf6", // denim -> blue
  "#6f7d4e": "#23a35a", // olive -> green
  "#a87b3a": "#d49b00", // ochre -> yellow
  "#8a6b7c": "#d9468f", // mauve -> pink
  "#6b7f6a": "#14a0b4", // sage -> teal
  "#38bdf8": "#2f7cf6", // sky -> blue
  "#34d399": "#23a35a", // emerald -> green
  "#f59e0b": "#d49b00", // amber -> yellow
};

function currentColour(colour: string | null): string | null {
  return colour ? (RETIRED_COLOURS[colour.toLowerCase()] ?? colour) : null;
}

export function serialiseSubject(subject: SubjectRow, grade: string | null | undefined) {
  return {
    id: subject.id,
    name: subject.name,
    colour: currentColour(subject.colour),
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
    tier: effectiveTier(user.tier, user.developerAccess),
    developerAccess: user.developerAccess,
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
