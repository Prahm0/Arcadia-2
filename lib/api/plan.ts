/** Arcad's plan for the next four weeks. Mirrors backend/src/lib/month-plan.ts. */
export interface MonthPlanWeek {
  /** The week's Monday, YYYY-MM-DD. */
  weekOf: string;
  /** "Term 4, week 2", "School holidays", or "" when the calendar isn't known. */
  label: string;
  focus: string;
  subjects: Array<{ name: string; minutes: number }>;
}

export interface MonthPlan {
  summary: string;
  weeks: MonthPlanWeek[];
  base: Record<string, number>;
  by: "arcad" | "fallback";
  createdAt: string;
}
