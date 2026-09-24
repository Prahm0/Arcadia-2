import type { DashboardResponse } from "@/lib/api/types";

/**
 * How many subjects the student is actually working across: their subject
 * list plus any subject named only on an open task. Used wherever a count is
 * shown so Arcad, Deadlines and the rest always agree.
 */
export function subjectCount(data: Pick<DashboardResponse, "subjects" | "tasks">): number {
  const names = new Set<string>();
  for (const subject of data.subjects) names.add(subject.name.trim().toLowerCase());
  for (const task of data.tasks) {
    if (task.status === "pending" && task.subject) names.add(task.subject.trim().toLowerCase());
  }
  names.delete("");
  return names.size;
}
