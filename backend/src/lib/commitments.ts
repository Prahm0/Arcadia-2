export const VALID_WEEKDAYS = [0, 1, 2, 3, 4, 5, 6] as const;

export function normaliseCustomWeekdays(value: unknown): number[] {
  if (!Array.isArray(value)) return [];

  return [...new Set(value)].filter(
    (day): day is number => Number.isInteger(day) && VALID_WEEKDAYS.includes(day as (typeof VALID_WEEKDAYS)[number]),
  );
}

export function parseCustomWeekdays(value: string | null | undefined): number[] {
  if (!value) return [];
  try {
    return normaliseCustomWeekdays(JSON.parse(value));
  } catch {
    return [];
  }
}

export function matchesCommitmentWeekday(
  recurrence: string,
  weeklyDay: number | null,
  customWeekdays: number[],
  candidateDay: number,
): boolean {
  if (recurrence === "weekly") return weeklyDay === candidateDay;
  if (recurrence === "weekdays") return candidateDay >= 1 && candidateDay <= 5;
  if (recurrence === "custom") return customWeekdays.includes(candidateDay);
  return true;
}
