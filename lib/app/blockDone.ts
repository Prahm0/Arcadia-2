import type { PlannerEvent, PlannerTask } from "@/lib/api/types";

const WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];
const word = (count: number) => WORDS[count] ?? String(count);

export function blockMinutes(event: Pick<PlannerEvent, "startAt" | "endAt">): number {
  return Math.max(1, Math.round((Date.parse(event.endAt) - Date.parse(event.startAt)) / 60000));
}

/** "two thirds there", "halfway there"... for how far a deadline's study now is. */
function howFar(ratio: number): string | null {
  if (ratio >= 1) return "done";
  if (ratio >= 0.9) return "nearly there";
  if (ratio >= 0.72) return "three quarters there";
  if (ratio >= 0.6) return "two thirds there";
  if (ratio >= 0.45) return "halfway there";
  if (ratio >= 0.3) return "a third of the way there";
  return null;
}

/**
 * The one line under "Chemistry done": the minutes, then either how far the
 * deadline this block was for has come, or how much of today is done.
 * `task` and `blocks` are as they were before the tick.
 */
export function blockDoneLine(event: PlannerEvent, task: PlannerTask | undefined, blocks: PlannerEvent[]): string {
  const minutes = blockMinutes(event);
  const lead = `${minutes} focused ${minutes === 1 ? "minute" : "minutes"}.`;

  const estimated = task?.estimatedMinutes ?? 0;
  if (task && estimated > 0) {
    const doneAfter = Math.min(estimated, estimated - task.remainingMinutes + minutes);
    const far = howFar(doneAfter / estimated);
    if (far) return `${lead} Your ${task.title} is ${far}.`;
  }

  const total = blocks.length;
  const done = blocks.filter((block) => block.outcome === "completed" || block.id === event.id).length;
  if (total > 0 && done >= total) return `${lead} That's everything planned for today.`;
  if (total > 1) return `${lead} ${word(done)[0].toUpperCase()}${word(done).slice(1)} of ${word(total)} blocks done today.`;
  return lead;
}

/** Today's planned study minutes, done before and after this tick, for the ring. */
export function ringMinutes(event: PlannerEvent, blocks: PlannerEvent[]) {
  const goal = blocks.reduce((sum, block) => sum + blockMinutes(block), 0) || blockMinutes(event);
  const before = blocks
    .filter((block) => block.outcome === "completed" && block.id !== event.id)
    .reduce((sum, block) => sum + blockMinutes(block), 0);
  return { goal, before, after: Math.min(goal, before + blockMinutes(event)) };
}
