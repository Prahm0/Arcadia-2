/**
 * How the student's planned study has actually gone lately, in lines Arcad
 * can plan with: the times of day and days of the week they keep, the ones
 * they skip, and the subjects that keep slipping. It only counts blocks the
 * student marked done or missed, and says nothing until there's enough of
 * those to mean something, so one bad week doesn't read as a habit.
 *
 * Pure: the caller loads the blocks and works out their local times.
 */

export interface MarkedBlock {
  subject: string | null;
  kept: boolean;
  /** Local hour the block started, 0-23. */
  hour: number;
  /** Local day of the week, 0 = Sunday. */
  weekday: number;
  minutes: number;
}

/** Fewer marked blocks than this and there's no pattern worth reporting. */
export const MIN_MARKED = 6;
/** A time of day, day type or subject needs this many blocks to say anything about it. */
const MIN_BUCKET = 3;

const PARTS: Array<{ label: string; from: number; to: number }> = [
  { label: "Mornings (before 12)", from: 0, to: 12 },
  { label: "Afternoons (12-5pm)", from: 12, to: 17 },
  { label: "Early evenings (5-8pm)", from: 17, to: 20 },
  { label: "Late evenings (after 8pm)", from: 20, to: 24 },
];

function tally(blocks: MarkedBlock[]) {
  const kept = blocks.filter((block) => block.kept).length;
  return { kept, total: blocks.length, share: blocks.length ? kept / blocks.length : 0 };
}

function line(label: string, blocks: MarkedBlock[]): string | null {
  if (blocks.length < MIN_BUCKET) return null;
  const { kept, total, share } = tally(blocks);
  const verdict = share >= 0.75 ? "reliable" : share < 0.45 ? "often skipped" : "hit and miss";
  return `${label}: kept ${kept} of ${total} (${verdict}).`;
}

export interface Habits {
  /** Lines for the brief. Empty when there isn't enough history. */
  lines: string[];
  /** Share of marked study minutes they got done, or null without enough history. */
  keptShare: number | null;
}

export function summariseHabits(blocks: MarkedBlock[]): Habits {
  if (blocks.length < MIN_MARKED) return { lines: [], keptShare: null };

  const minutes = blocks.reduce((sum, block) => sum + block.minutes, 0);
  const keptMinutes = blocks.filter((block) => block.kept).reduce((sum, block) => sum + block.minutes, 0);
  const keptShare = minutes ? keptMinutes / minutes : null;

  const lines: string[] = [];
  if (keptShare !== null) {
    lines.push(`Overall they got ${Math.round(keptShare * 100)}% of their marked study done (${blocks.length} blocks).`);
  }
  for (const part of PARTS) {
    const entry = line(part.label, blocks.filter((block) => block.hour >= part.from && block.hour < part.to));
    if (entry) lines.push(entry);
  }
  const weekend = (block: MarkedBlock) => block.weekday === 0 || block.weekday === 6;
  const friday = line("Fridays", blocks.filter((block) => block.weekday === 5));
  if (friday) lines.push(friday);
  const weekends = line("Weekends", blocks.filter(weekend));
  if (weekends) lines.push(weekends);

  // Only subjects that slip: a subject they keep up with needs no mention.
  const bySubject = new Map<string, MarkedBlock[]>();
  for (const block of blocks) {
    const name = block.subject?.trim();
    if (!name) continue;
    bySubject.set(name, [...(bySubject.get(name) ?? []), block]);
  }
  const slipping = [...bySubject]
    .map(([name, own]) => ({ name, ...tally(own) }))
    .filter((entry) => entry.total >= MIN_BUCKET && entry.share < 0.5)
    .sort((a, b) => a.share - b.share)
    .slice(0, 3);
  for (const entry of slipping) lines.push(`${entry.name}: kept ${entry.kept} of ${entry.total}.`);

  return { lines, keptShare };
}
