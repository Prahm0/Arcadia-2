/**
 * Priorities as an outline: a flat list of lines with a depth, the way a
 * Notes bullet list works. Pure functions, so indenting, pasting and saving
 * are tested without a page.
 */
import { matchSubject } from "./quickAdd.ts";

export interface OutlineLine {
  id: string;
  depth: number;
  text: string;
  done: boolean;
  /** Optional, YYYY-MM-DD. */
  dueOn: string | null;
}

export interface SavedPriority {
  id: string;
  parentId: string | null;
  text: string;
  subject: string | null;
  dueOn: string | null;
  done: boolean;
}

/** How deep the outline goes: Area > Subject > Task, with room to spare. */
export const MAX_DEPTH = 5;

/** The lines under `index`: everything after it that's deeper. */
function subtreeEnd(lines: OutlineLine[], index: number): number {
  let end = index + 1;
  while (end < lines.length && lines[end].depth > lines[index].depth) end += 1;
  return end;
}

/** Tab: one level in, with its children, as long as there's a line above to sit under. */
export function indent(lines: OutlineLine[], index: number): OutlineLine[] {
  if (index <= 0 || lines[index].depth > lines[index - 1].depth || lines[index].depth >= MAX_DEPTH) return lines;
  const end = subtreeEnd(lines, index);
  return lines.map((line, i) => (i >= index && i < end ? { ...line, depth: line.depth + 1 } : line));
}

/** Shift-Tab: one level out, with its children. Lines below it at its old level become its children. */
export function outdent(lines: OutlineLine[], index: number): OutlineLine[] {
  if (lines[index].depth === 0) return lines;
  const end = subtreeEnd(lines, index);
  return lines.map((line, i) => (i >= index && i < end ? { ...line, depth: line.depth - 1 } : line));
}

/**
 * A pasted bullet list as lines and levels. Any bullet ("-", "•", "*",
 * "◦", "▪", "1."), spaces or tabs for nesting, blank lines skipped. Levels
 * come from how far each line is indented compared with the ones above it.
 */
export function parsePasted(text: string): Array<{ depth: number; text: string }> {
  const widths: number[] = [];
  const result: Array<{ depth: number; text: string }> = [];
  for (const raw of text.replace(/\r\n?/g, "\n").split("\n")) {
    const match = raw.match(/^([ \t]*)(?:[-*•◦▪‣–]|\d+[.)])?\s*(.*?)\s*$/);
    if (!match || !match[2]) continue;
    const width = match[1].replace(/\t/g, "    ").length;
    while (widths.length && widths[widths.length - 1] > width) widths.pop();
    if (!widths.length || widths[widths.length - 1] < width) widths.push(width);
    result.push({ depth: Math.min(MAX_DEPTH, widths.length - 1), text: match[2] });
  }
  return result;
}

/**
 * Puts pasted lines at `index`. An empty line is replaced by them; a line
 * with text keeps its place and they go below it (after its children) at
 * its level.
 */
export function pasteAt(
  lines: OutlineLine[],
  index: number,
  pasted: Array<{ depth: number; text: string }>,
  makeId: () => string,
): OutlineLine[] {
  if (!pasted.length) return lines;
  const current = lines[index];
  const replace = current && !current.text.trim();
  const base = current ? current.depth : 0;
  const at = replace ? index : current ? subtreeEnd(lines, index) : lines.length;
  const added = pasted.map((line, i) => ({
    id: replace && i === 0 ? current.id : makeId(),
    depth: Math.min(MAX_DEPTH, base + line.depth),
    text: line.text,
    done: false,
    dueOn: null,
  }));
  return [...lines.slice(0, at), ...added, ...lines.slice(replace ? at + 1 : at)];
}

/**
 * The outline as the server keeps it: in order, each with its parent, and
 * the subject it's under. A line naming a subject ("Methods") is that
 * subject; anything under it inherits it unless it names its own.
 */
export function toSaved(lines: OutlineLine[], subjects: string[]): SavedPriority[] {
  const parents: string[] = [];
  const subjectAt: Array<string | null> = [];
  return lines.map((line) => {
    // A line can only be one level deeper than the one above it.
    const depth = Math.min(line.depth, parents.length);
    parents.length = depth;
    subjectAt.length = depth;
    const subject = matchSubject(line.text, subjects) ?? (depth ? subjectAt[depth - 1] : null);
    const saved = { id: line.id, parentId: depth ? parents[depth - 1] : null, text: line.text, subject, dueOn: line.dueOn, done: line.done };
    parents.push(line.id);
    subjectAt.push(subject);
    return saved;
  });
}

/** Saved items (in order, with parents) back into lines with depths. */
export function fromSaved(items: SavedPriority[]): OutlineLine[] {
  const depth = new Map<string, number>();
  return items.map((item) => {
    const level = item.parentId ? (depth.get(item.parentId) ?? -1) + 1 : 0;
    depth.set(item.id, level);
    return { id: item.id, depth: level, text: item.text, done: item.done, dueOn: item.dueOn };
  });
}
