import type { PlannerEvent } from "@/lib/api/types";

/** A study block the phone should block apps for, as the native side takes it. */
export interface GuardedBlock {
  id: string;
  /** ms since 1970 */
  startsAt: number;
  endsAt: number;
  /** "Chemistry", for the block screen: "Chemistry, 32 min left". */
  subject: string;
}

/** How far ahead the phone is told about blocks. It re-reads them whenever the plan changes. */
export const GUARD_HORIZON_MS = 36 * 60 * 60_000;
/** Screen Time monitors a limited number of schedules at once; leave room for the snooze one. */
export const MAX_GUARDED = 12;

/**
 * The study blocks that turn app blocking on by themselves: planned study,
 * Arcadia's or a timed line naming a subject, from now until the horizon.
 * A ticked block, a missed one or one taken off the plan blocks nothing.
 * Life lines ("Power nap", "Call with Pari") never lock the phone.
 */
export function guardedBlocks(events: PlannerEvent[], now: number): GuardedBlock[] {
  return events
    .filter((event) => event.category === "study" && event.outcome === "planned" && event.status !== "cancelled")
    .map((event) => ({
      id: event.id,
      startsAt: Date.parse(event.startAt),
      endsAt: Date.parse(event.endAt),
      subject: event.subject || event.title,
    }))
    .filter((block) => block.endsAt > now && block.startsAt < now + GUARD_HORIZON_MS && block.endsAt > block.startsAt)
    .sort((a, b) => a.startsAt - b.startsAt)
    .slice(0, MAX_GUARDED);
}

/** The block under way right now, if any. */
export function liveBlock(blocks: GuardedBlock[], now: number): GuardedBlock | null {
  return blocks.find((block) => block.startsAt <= now && block.endsAt > now) ?? null;
}

/** "Chemistry, 32 min left": what the block screen says. */
export function shieldTitle(block: Pick<GuardedBlock, "subject" | "endsAt">, now: number): string {
  const minutes = Math.max(1, Math.ceil((block.endsAt - now) / 60_000));
  return `${block.subject}, ${minutes} min left`;
}

/** "You reached for blocked apps 3 times." for the block-done screen. */
export function attemptsLine(attempts: number): string {
  if (attempts === 0) return "Your phone stayed out of it.";
  if (attempts === 1) return "You reached for a blocked app once.";
  return `You reached for blocked apps ${attempts === 2 ? "twice" : `${attempts} times`}.`;
}
