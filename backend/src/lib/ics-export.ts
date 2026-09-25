/**
 * iCalendar (RFC 5545) writer for the export feed, the other half of ics.ts.
 *
 * Google Calendar and Apple Calendar both subscribe to a plain .ics URL, so
 * one feed covers both. Timed blocks are written in UTC ("...Z") and the
 * calendar app shows them in the viewer's zone; deadlines are all-day events
 * on the student's local due date.
 */

export interface ExportBlock {
  id: string;
  title: string;
  subject: string | null;
  startAt: number;
  endAt: number;
  outcome: string;
}

export interface ExportDeadline {
  id: string;
  title: string;
  subject: string | null;
  /** Local due date, YYYY-MM-DD. */
  date: string;
}

export interface ExportCalendar {
  name: string;
  appUrl: string;
  now: number;
  blocks: ExportBlock[];
  deadlines: ExportDeadline[];
}

const PRODID = "-//Arcadia//Study plan//EN";

export function buildIcs(calendar: ExportCalendar): string {
  const stamp = utcStamp(calendar.now);
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    `PRODID:${PRODID}`,
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeText(calendar.name)}`,
    "X-WR-CALDESC:Study blocks and deadlines from Arcadia",
    // Hints for how often to re-fetch. Apple reads X-PUBLISHED-TTL; Google
    // ignores both and refreshes on its own schedule (every few hours).
    "REFRESH-INTERVAL;VALUE=DURATION:PT1H",
    "X-PUBLISHED-TTL:PT1H",
  ];

  for (const block of calendar.blocks) {
    lines.push(
      "BEGIN:VEVENT",
      `UID:${block.id}@arcadiahq.app`,
      `DTSTAMP:${stamp}`,
      `DTSTART:${utcStamp(block.startAt)}`,
      `DTEND:${utcStamp(block.endAt)}`,
      `SUMMARY:${escapeText(blockSummary(block))}`,
      `DESCRIPTION:${escapeText(description(block.subject, calendar.appUrl))}`,
      `URL:${calendar.appUrl}`,
      "TRANSP:OPAQUE",
      "END:VEVENT",
    );
  }

  for (const deadline of calendar.deadlines) {
    const day = deadline.date.replace(/-/g, "");
    lines.push(
      "BEGIN:VEVENT",
      `UID:${deadline.id}-due@arcadiahq.app`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${day}`,
      `DTEND;VALUE=DATE:${nextDate(deadline.date)}`,
      `SUMMARY:${escapeText(`Due: ${deadline.title}`)}`,
      `DESCRIPTION:${escapeText(description(deadline.subject, calendar.appUrl))}`,
      `URL:${calendar.appUrl}`,
      // An all-day deadline shouldn't mark the whole day as busy.
      "TRANSP:TRANSPARENT",
      "END:VEVENT",
    );
  }

  lines.push("END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}

function blockSummary(block: ExportBlock): string {
  if (block.outcome === "completed") return `✓ ${block.title}`;
  return block.title;
}

function description(subject: string | null, appUrl: string): string {
  return [subject ? `Subject: ${subject}` : null, `Open in Arcadia: ${appUrl}`].filter(Boolean).join("\n");
}

/** 20260925T043000Z */
export function utcStamp(ms: number): string {
  return new Date(ms).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

function nextDate(date: string): string {
  const next = new Date(`${date}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  return next.toISOString().slice(0, 10).replace(/-/g, "");
}

/** TEXT values escape backslash, semicolon, comma and newlines (RFC 5545 3.3.11). */
export function escapeText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

const encoder = new TextEncoder();

/**
 * Lines longer than 75 octets continue on the next line after a space
 * (RFC 5545 3.1). Counts UTF-8 bytes and never splits a character.
 */
export function fold(line: string): string {
  if (encoder.encode(line).length <= 75) return line;
  const parts: string[] = [];
  let current = "";
  let size = 0;
  for (const char of line) {
    const bytes = encoder.encode(char).length;
    // Continuation lines start with a space, which counts toward their 75.
    const limit = parts.length === 0 ? 75 : 74;
    if (size + bytes > limit) {
      parts.push(current);
      current = "";
      size = 0;
    }
    current += char;
    size += bytes;
  }
  parts.push(current);
  return parts.join("\r\n ");
}
