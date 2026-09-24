/**
 * Summary sheets: one-page revision sheets, a title and a few headed
 * sections of light Markdown. Shared so the API, the app and the tests
 * agree on the shape and the limits.
 */

export const SHEET_TITLE_MAX = 80;
export const SHEET_HEADING_MAX = 60;
export const SHEET_BODY_MAX = 4000;
export const SHEET_SECTIONS_MAX = 12;
export const MAX_SHEETS = 300;

/** Suggested headings; any heading is allowed. */
export const SECTION_PRESETS = ["Key ideas", "Formulas", "Definitions", "Worked example", "Common mistakes"] as const;

export interface SheetSection {
  heading: string;
  body: string;
}

export type SheetSource = "manual" | "arcad";

/** Matches serialiseSheet in backend/src/routes/sheets.ts. */
export interface Sheet {
  id: string;
  title: string;
  subjectId: string | null;
  topic: { id: string; title: string } | null;
  sections: SheetSection[];
  source: SheetSource;
  createdAt: string;
  updatedAt: string;
}

const oneLine = (value: unknown, max: number) => String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
// Bodies keep their line breaks (lists, tables); only the ends are trimmed.
const multiLine = (value: unknown, max: number) => String(value ?? "").replace(/\r\n?/g, "\n").trim().slice(0, max);

export function cleanSheetTitle(value: unknown): string {
  return oneLine(value, SHEET_TITLE_MAX);
}

/**
 * The sections as sent, trimmed. Fully empty sections (the editor's blank
 * one) are dropped; a body with no heading gets "Notes".
 */
export function cleanSections(input: unknown): { sections: SheetSection[] } | { error: string } {
  if (!Array.isArray(input)) return { sections: [] };
  const sections: SheetSection[] = [];
  for (const raw of input) {
    const item = (raw ?? {}) as Partial<SheetSection>;
    const heading = oneLine(item.heading, SHEET_HEADING_MAX);
    const body = multiLine(item.body, SHEET_BODY_MAX);
    if (!heading && !body) continue;
    sections.push({ heading: heading || "Notes", body });
  }
  if (sections.length > SHEET_SECTIONS_MAX) {
    return { error: `A sheet holds up to ${SHEET_SECTIONS_MAX} sections. Split it into two.` };
  }
  return { sections };
}

/** Stored JSON back to sections, tolerating anything malformed. */
export function parseSections(json: string): SheetSection[] {
  try {
    const cleaned = cleanSections(JSON.parse(json));
    return "error" in cleaned ? [] : cleaned.sections;
  } catch {
    return [];
  }
}

/**
 * Flashcards from a sheet. In Definitions and Formulas sections, each
 * "term: meaning" or "term = expression" line (bullets allowed) or two-column
 * table row becomes a card. Other sections are prose and are left alone.
 */
export function cardsFromSections(sections: SheetSection[]): Array<{ front: string; back: string }> {
  const cards: Array<{ front: string; back: string }> = [];
  for (const section of sections) {
    if (!/definition|formula|term|vocab|equation|key term/i.test(section.heading)) continue;
    const lines = section.body.split("\n");
    const isRule = (text: string | undefined) => /^\s*\|?\s*:?-{3,}/.test(text ?? "");
    for (const [index, rawLine] of lines.entries()) {
      const line = rawLine.replace(/^\s*(?:[-*•]|\d+[.)])\s+/, "").trim();
      // Skip table rules, and a table's header row (the row above its rule).
      if (!line || isRule(line) || (line.startsWith("|") && isRule(lines[index + 1]))) continue;
      let pair: [string, string] | null = null;
      if (line.startsWith("|")) {
        const cells = line.split("|").map((cell) => cell.trim()).filter(Boolean);
        if (cells.length >= 2) pair = [cells[0], cells.slice(1).join(" · ")];
      } else {
        const match = line.match(/^(.{1,120}?)\s*(?::|\s=\s|\s[–—-]\s)\s*(.+)$/);
        if (match) pair = [match[1], match[2]];
      }
      if (!pair) continue;
      const front = pair[0].replace(/\*\*/g, "").trim();
      const back = pair[1].replace(/\*\*/g, "").trim();
      if (front && back) cards.push({ front: front.slice(0, 500), back: back.slice(0, 1000) });
    }
  }
  return cards;
}
