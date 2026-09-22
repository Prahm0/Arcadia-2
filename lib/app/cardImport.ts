import type { CardDraft } from "@/lib/api/cards";

export type Separator = "tab" | "comma" | "dash" | "colon";

const SPLITTERS: Record<Separator, (line: string) => [string, string] | null> = {
  tab: (line) => splitAt(line, line.indexOf("\t"), 1),
  comma: (line) => splitAt(line, line.indexOf(","), 1),
  // "term - definition" (spaces around, so hyphenated words survive)
  dash: (line) => {
    const match = /\s[-–—]\s/.exec(line);
    return match ? splitAt(line, match.index, match[0].length) : null;
  },
  colon: (line) => splitAt(line, line.indexOf(":"), 1),
};

export const SEPARATOR_LABELS: Record<Separator, string> = {
  tab: "Tab",
  comma: "Comma",
  dash: "Dash",
  colon: "Colon",
};

function splitAt(line: string, index: number, length: number): [string, string] | null {
  if (index < 0) return null;
  return [line.slice(0, index).trim(), line.slice(index + length).trim()];
}

/**
 * The separator most lines use. Quizlet's export defaults to a tab between
 * term and definition and a new line between cards, so tab wins ties.
 */
export function guessSeparator(text: string): Separator {
  const lines = text.split(/\r?\n/).filter((line) => line.trim());
  let best: Separator = "tab";
  let bestHits = 0;
  for (const separator of Object.keys(SPLITTERS) as Separator[]) {
    const hits = lines.filter((line) => {
      const parts = SPLITTERS[separator](line);
      return parts && parts[0] && parts[1];
    }).length;
    if (hits > bestHits) {
      best = separator;
      bestHits = hits;
    }
  }
  return best;
}

/** One card per line, term and definition split by `separator`. */
export function parseCards(text: string, separator: Separator): { cards: CardDraft[]; skipped: number } {
  const cards: CardDraft[] = [];
  let skipped = 0;
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const parts = SPLITTERS[separator](line);
    if (parts && parts[0] && parts[1]) cards.push({ front: parts[0], back: parts[1] });
    else skipped += 1;
  }
  return { cards, skipped };
}
