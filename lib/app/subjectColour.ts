import type { DashboardResponse, PlannerEvent } from "@/lib/api/types";
import { SUBJECT_COLORS } from "./categoryColors";

/**
 * A subject's colour, so its study blocks read the same on Today, the
 * Schedule and Focus. Subjects without a saved colour get the palette colour
 * for their position, matching the profile.
 */
export function subjectColour(
  subjects: DashboardResponse["subjects"],
  name: string | null | undefined,
): string | null {
  if (!name) return null;
  const key = name.trim().toLowerCase();
  const index = subjects.findIndex((subject) => subject.name.trim().toLowerCase() === key);
  if (index < 0) return null;
  return subjects[index].colour || SUBJECT_COLORS[index % SUBJECT_COLORS.length];
}

/**
 * What a study block is, in one line: Arcad's topic once the session is set
 * up, the deadline for deadline work, otherwise just the subject.
 */
export function studyTitle(event: PlannerEvent): string {
  if (event.plan?.topic) return event.plan.topic;
  if (event.taskId) return event.title;
  return event.subject ?? event.title;
}
