import type { DayItem, PlannerEvent } from "@/lib/api/types";

/** Where "rest of night" lines sit when nothing typed before them is later: 6pm. */
const EVENING_MINUTE = 18 * 60;

export type NoteEntry =
  | { kind: "block"; key: string; event: PlannerEvent; mine: boolean; sort: number }
  | { kind: "item"; key: string; item: DayItem; sort: number };

/** Minutes past local midnight, from a clock offset the caller already knows. */
function minuteOf(iso: string, dayStartMs: number): number {
  return (Date.parse(iso) - dayStartMs) / 60000;
}

/**
 * Today's note as one list: Arcadia's planned blocks, the student's timed
 * lines and their untimed ones, in time order. An untimed line sits right
 * after the line typed before it, the way it would in Notes, and "rest of
 * night" lines sit in the evening.
 *
 * `blocks` are today's events to show (study and the student's own lines);
 * `items` are today's untimed lines; `dayStartMs` is local midnight.
 */
export function noteEntries(blocks: PlannerEvent[], items: DayItem[], dayStartMs: number): NoteEntry[] {
  const entries: NoteEntry[] = blocks.map((event) => ({
    kind: "block",
    key: event.id,
    event,
    mine: event.source === "note",
    sort: minuteOf(event.startAt, dayStartMs),
  }));

  // What the student typed, in the order they typed it, so each untimed
  // line can follow the one before it.
  const typed: Array<{ at: number; sort: () => number }> = entries
    .filter((entry): entry is Extract<NoteEntry, { kind: "block" }> => entry.kind === "block" && entry.mine)
    .map((entry) => ({ at: Date.parse(entry.event.createdAt ?? entry.event.startAt), sort: () => entry.sort }));

  const ordered = [...items].sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt) || a.position - b.position);
  for (const item of ordered) {
    const at = Date.parse(item.createdAt);
    const before = typed.filter((line) => line.at <= at).sort((a, b) => b.at - a.at)[0];
    // A hair after the line it follows, keeping several untimed lines in typed order.
    let sort = before ? before.sort() + 0.001 : -1 + item.position * 0.001;
    if (item.evening) sort = Math.max(sort, EVENING_MINUTE + item.position * 0.001);
    const entry: NoteEntry = { kind: "item", key: item.id, item, sort };
    entries.push(entry);
    typed.push({ at, sort: () => entry.sort });
  }

  return entries.sort((a, b) => a.sort - b.sort);
}
