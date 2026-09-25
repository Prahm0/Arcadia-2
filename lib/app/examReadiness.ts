import type { DashboardResponse, PlannerTask } from "@/lib/api/types";
import { dateKey } from "@/lib/api/time";

export interface ExamReadiness {
  taskId: string;
  behindMinutes: number;
  completedMinutes: number;
  expectedMinutes: number;
  daysLeft: number;
}

const ASSESSMENT_TYPES = new Set(["exam", "test", "assignment", "prac"]);

/**
 * A calm signal based only on blocks Arcadia actually scheduled for an
 * upcoming assessment. Expected minutes are the prep blocks whose start time
 * has already passed, so we never pretend future work is overdue.
 */
export function upcomingExamReadiness(data: DashboardResponse, now = new Date()): ExamReadiness[] {
  const timezone = data.profile?.timezone || data.user.timezone || "Australia/Sydney";
  const today = dateKey(now.toISOString(), timezone);
  const nowMs = now.getTime();

  return data.tasks
    .filter((task) => task.status === "pending" && ASSESSMENT_TYPES.has(task.taskType ?? ""))
    .map((task) => assessTask(task, data, today, timezone, nowMs))
    .filter((item): item is ExamReadiness => item !== null)
    .sort((a, b) => a.daysLeft - b.daysLeft || b.behindMinutes - a.behindMinutes);
}

function assessTask(task: PlannerTask, data: DashboardResponse, today: string, timezone: string, nowMs: number): ExamReadiness | null {
  const dueKey = dateKey(task.dueAt, timezone);
  const daysLeft = Math.round((Date.parse(`${dueKey}T12:00:00Z`) - Date.parse(`${today}T12:00:00Z`)) / 86_400_000);
  if (daysLeft < 0 || daysLeft > 14) return null;

  const prep = data.events.filter((event) => event.category === "study" && event.taskId === task.id);
  const minutes = (event: (typeof prep)[number]) => Math.max(0, (Date.parse(event.endAt) - Date.parse(event.startAt)) / 60_000);
  const expectedMinutes = prep
    .filter((event) => Date.parse(event.startAt) <= nowMs)
    .reduce((total, event) => total + minutes(event), 0);
  const completedMinutes = prep
    .filter((event) => event.outcome === "completed")
    .reduce((total, event) => total + minutes(event), 0);
  const plannedMinutes = prep.reduce((total, event) => total + minutes(event), 0);
  const unfinishedMinutes = Math.max(0, plannedMinutes - completedMinutes);

  const behindOnElapsedPlan = expectedMinutes >= 30 && completedMinutes < expectedMinutes * 0.5;
  const almostDueWithPrepLeft = daysLeft < 2 && unfinishedMinutes >= 30;
  if (!behindOnElapsedPlan && !almostDueWithPrepLeft) return null;

  return {
    taskId: task.id,
    behindMinutes: Math.max(15, Math.round(behindOnElapsedPlan ? expectedMinutes - completedMinutes : unfinishedMinutes)),
    completedMinutes: Math.round(completedMinutes),
    expectedMinutes: Math.round(expectedMinutes),
    daysLeft,
  };
}
