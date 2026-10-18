/**
 * Two kinds of line in a day's note that aren't things to do: the day's
 * headline ("!Hyper focus captain setting the example") and a section
 * heading ("School:", "When home:", "Tonight:"). Both are saved as plain
 * day lines and read back by their shape, so no other data changes.
 */

/** "!Hyper focus and plan" → the day's headline. */
export function headlineText(text: string): string | null {
  const match = text.match(/^\s*!\s*(.+)$/);
  return match ? match[1].trim() || null : null;
}

/** "School:" → "School". A clock time at the end ("Up at 6:") isn't a heading. */
export function sectionText(text: string): string | null {
  const trimmed = text.trim();
  if (!trimmed.endsWith(":") || /\d:$/.test(trimmed)) return null;
  const label = trimmed.slice(0, -1).trim();
  return label && label.length <= 60 ? label : null;
}

/** Headlines and section headings stay on their own day and are never ticked. */
export function isDayHeading(text: string): boolean {
  return headlineText(text) !== null || sectionText(text) !== null;
}
