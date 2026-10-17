/** The fields of a saved priority the picks read; plain data, so tests run without a database. */
export interface PriorityRow {
  id: string;
  parentId: string | null;
  position: number;
  text: string;
  subject: string | null;
  dueOn: string | null;
  done: boolean;
}

export interface PriorityPick {
  id: string;
  text: string;
  subject: string | null;
  dueOn: string | null;
}

/**
 * The open things to actually do, in outline order: items with no open
 * children, so "Academics" and "Methods" are headings and "Do a few of those
 * methods questions" is a task. Anything due sorts to the front.
 */
export function openTasks(rows: PriorityRow[]): PriorityPick[] {
  const ordered = [...rows].sort((a, b) => a.position - b.position);
  const openChild = new Set(ordered.filter((row) => !row.done && row.parentId).map((row) => row.parentId!));
  const tasks = ordered.filter((row) => !row.done && row.text.trim() && !openChild.has(row.id) && row.parentId !== null);
  const picks = tasks.map((row) => ({ id: row.id, text: row.text.trim(), subject: row.subject, dueOn: row.dueOn }));
  return picks.sort((a, b) => (a.dueOn ?? "9999-99-99").localeCompare(b.dueOn ?? "9999-99-99"));
}

/** The first open task under each subject, for the planner's free study blocks. */
export function topBySubject(rows: PriorityRow[]): Map<string, PriorityPick> {
  const top = new Map<string, PriorityPick>();
  const byId = new Map(rows.map((row) => [row.id, row]));
  for (const pick of openTasks(rows)) {
    if (!pick.subject || top.has(pick.subject)) continue;
    // Only a task under a subject heading, not the heading itself.
    const parent = byId.get(byId.get(pick.id)?.parentId ?? "");
    if (parent && parent.subject === pick.subject) top.set(pick.subject, pick);
  }
  return top;
}

/**
 * A free study block ("Methods study", made by the planner with no deadline
 * behind it) is spent on the top priority for that subject. Shown as the
 * block's priority; the block itself is unchanged.
 */
export function withPriorities<T extends { category: string; kind?: string | null; taskId?: string | null; subject?: string | null }>(
  events: T[],
  top: Map<string, PriorityPick>,
): Array<T & { priority?: { id: string; text: string } }> {
  if (!top.size) return events;
  return events.map((event) => {
    if (event.category !== "study" || event.kind !== "subject" || event.taskId || !event.subject) return event;
    const pick = top.get(event.subject);
    return pick ? { ...event, priority: { id: pick.id, text: pick.text } } : event;
  });
}
