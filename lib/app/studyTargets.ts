/**
 * Weekly study targets per subject. The scheduler tops each subject up to its
 * target across the week, so these numbers are what actually fills the plan.
 */

export const WEEKLY_STEP_MINUTES = 30;
export const WEEKLY_MAX_MINUTES = 10 * 60;

/**
 * Year-level starting point for one subject.
 * Keep in step with defaultWeeklyMinutes in backend/src/lib/scheduler.ts.
 */
export function suggestedWeeklyMinutes(grade: string): number {
  const text = grade.trim().toLowerCase();
  const year = /^year\s*(\d{1,2})$/.exec(text);
  if (year) return Number(year[1]) >= 11 ? 180 : 120;
  if (text.includes("uni") || text.includes("year+")) return 240;
  return 150;
}

/**
 * The suggestion shown in onboarding: the year-level default, trimmed so a
 * long subject list still fits comfortably inside the daily study limit.
 */
export function fittedWeeklyMinutes(grade: string, subjectCount: number, maxDailyMinutes: number): number {
  const base = suggestedWeeklyMinutes(grade);
  if (subjectCount <= 0) return base;
  const room = (maxDailyMinutes * 7 * 0.85) / subjectCount;
  const rounded = Math.floor(room / WEEKLY_STEP_MINUTES) * WEEKLY_STEP_MINUTES;
  return Math.max(60, Math.min(base, rounded));
}

/** "3h", "1h 30m", "45m", or "Off" for zero. */
export function formatWeekly(minutes: number): string {
  if (minutes <= 0) return "Off";
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest}m`;
  return rest ? `${hours}h ${rest}m` : `${hours}h`;
}
