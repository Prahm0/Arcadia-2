import type { PlannerEvent } from "@/lib/api/types";

const FIRST_STUDY_BLOCK_KEY = "arcadia:first-study-block";
const AUTOMATIC_INTERRUPTION_KEY = "arcadia:automatic-interruption";

/** Fired once a signed-in student has completed their first study block. */
export const FIRST_STUDY_BLOCK_EVENT = "arcadia:first-study-block-completed";

let automaticInterruptionClaimed = false;

export function hasCompletedStudyBlock(events: PlannerEvent[]): boolean {
  return events.some((event) => event.category === "study" && event.outcome === "completed");
}

/**
 * Remember this milestone locally so quiet, optional prompts never land before
 * a student has actually received value from their plan.
 */
export function recordFirstStudyBlock(): void {
  try {
    if (window.localStorage.getItem(FIRST_STUDY_BLOCK_KEY) === "1") return;
    window.localStorage.setItem(FIRST_STUDY_BLOCK_KEY, "1");
    window.dispatchEvent(new Event(FIRST_STUDY_BLOCK_EVENT));
  } catch {
    // The current page can still be calm if storage is unavailable.
  }
}

export function hasRecordedFirstStudyBlock(): boolean {
  try {
    return window.localStorage.getItem(FIRST_STUDY_BLOCK_KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * Automatic dialogs are useful at the right moment, but never in a stack.
 * User-initiated sheets and the onboarding paywall do not use this gate.
 */
export function claimAutomaticInterruption(): boolean {
  if (automaticInterruptionClaimed) return false;
  automaticInterruptionClaimed = true;
  try {
    if (window.sessionStorage.getItem(AUTOMATIC_INTERRUPTION_KEY) === "1") return false;
    window.sessionStorage.setItem(AUTOMATIC_INTERRUPTION_KEY, "1");
  } catch {
    // The in-memory marker still covers this tab while it stays open.
  }
  return true;
}
