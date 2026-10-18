/**
 * One line typed into "Add to today...", read the way a person writes a day
 * note: "Wake at 7:30", "SLC 10:50", "Power nap at 2:15 till 2:45",
 * "Practising interview rest of night". No model call, so it's instant.
 *
 * Times without am or pm read like a school day: 7 to 11 is morning, 12 is
 * noon, and a bare hour from 1 to 6 is the afternoon.
 */
import { headlineText, sectionText } from "../../shared/dayHeading.ts";
import { matchSubject } from "./quickAdd.ts";

export interface DayLine {
  /** What's left once the time words are taken out, as typed. */
  title: string;
  subject: string | null;
  /** Minutes past midnight, or null for an untimed line. */
  start: number | null;
  end: number | null;
  /** "rest of night", "tonight": the evening, with no fixed time. */
  evening: boolean;
  /** The time was written with am or pm, so it isn't a guess. */
  meridiem?: boolean;
  /** Only an end was written ("till 5:15"); the start is a guess the caller may improve. */
  untilOnly?: boolean;
}

/** A block with only an end ("till 5:15") gets this long before it, unless something earlier says otherwise. */
export const UNTIL_MINUTES = 30;

const CLOCK = String.raw`(\d{1,2})(?::(\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)?`;
const SEPARATOR = String.raw`\s*(?:till|til|until|to|-|–)\s*`;

/** Minutes past midnight for one clock reading, with the school-day guess for a bare hour. */
function clock(hourText: string, minuteText: string | undefined, meridiem: string | undefined, morning = false, late = false): number | null {
  let hour = Number(hourText);
  const minute = Number(minuteText ?? 0);
  if (minute > 59 || hour > 23) return null;
  const suffix = meridiem?.toLowerCase().replace(/\./g, "");
  if (suffix) {
    if (hour < 1 || hour > 12) return null;
    hour = (hour % 12) + (suffix === "pm" ? 12 : 0);
  } else if (hour >= 1 && hour <= 6 && !(morning && hour >= 4)) {
    hour += 12;
  } else if (late && hour >= 7 && hour <= 11) {
    // "Sleep at 11", "dinner at 8": the evening.
    hour += 12;
  }
  return hour * 60 + minute;
}

/** True when a matched clock reading is clearly a time and not just a number. */
function looksLikeTime(minuteText: string | undefined, meridiem: string | undefined, lead: string | undefined): boolean {
  return Boolean(minuteText || meridiem || lead);
}

const MORNING = /\b(?:wake|woke|waking|up at|alarm|breakfast|brek|brekky|morning|before school)\b/i;
const LATE = /\b(?:dinner|sleep|slept|bed|bedtime|brush|brushed|tonight)\b/i;
const UNTIL_BEFORE = /\b(?:till|til|until|up to)\s*$/i;

export function parseDayLine(text: string, subjects: string[]): DayLine {
  let rest = ` ${text.trim()} `;
  let start: number | null = null;
  let end: number | null = null;
  let evening = false;
  let meridiem = false;
  let untilOnly = false;
  const morning = MORNING.test(text);
  const late = !morning && LATE.test(text);

  const eveningWords = /\b(?:for\s+)?(?:the\s+)?(?:rest of (?:the\s+)?(?:night|evening)|tonight|this evening)\b/i;
  if (eveningWords.test(rest)) {
    evening = true;
    rest = rest.replace(eveningWords, " ");
  }

  const noon = /\b(?:at\s+)?(?:noon|midday)\b/i;
  if (noon.test(rest)) {
    start = 12 * 60;
    rest = rest.replace(noon, " ");
  }

  if (start === null) {
    // "2:15 till 2:45", "3pm-5pm", "from 11 to 1": a range reads as a time
    // even without a colon, because the separator says so.
    const range = new RegExp(String.raw`\b(at|from|@)?\s*${CLOCK}${SEPARATOR}${CLOCK}(?=\s|$|[,.;?!])`, "i");
    const match = rest.match(range);
    if (match) {
      const from = clock(match[2], match[3], match[4] ?? match[7], morning, late);
      let to = clock(match[5], match[6], match[7], morning, late);
      if (from !== null && to !== null) {
        // "11 till 1": the end is after the start, so it's the afternoon.
        if (to <= from && to + 12 * 60 < 24 * 60 && !match[7]) to += 12 * 60;
        if (to > from) {
          start = from;
          end = to;
          meridiem = Boolean(match[4] || match[7]);
          rest = rest.replace(match[0], " ");
        }
      }
    }
  }

  if (start === null) {
    const single = new RegExp(String.raw`\b(at|from|@)?\s*${CLOCK}(?=\s|$|[,.;?!])`, "gi");
    for (const match of rest.matchAll(single)) {
      if (!looksLikeTime(match[3], match[4], match[1])) continue;
      const value = clock(match[2], match[3], match[4], morning, late);
      if (value === null) continue;
      meridiem = Boolean(match[4]);
      // "Sorted emails till 5:15": it ended then.
      if (!match[1] && UNTIL_BEFORE.test(rest.slice(0, match.index))) {
        if (value < UNTIL_MINUTES) continue;
        end = value;
        start = value - UNTIL_MINUTES;
        untilOnly = true;
        rest = rest.slice(0, match.index).replace(UNTIL_BEFORE, " ") + " " + rest.slice((match.index ?? 0) + match[0].length);
      } else {
        start = value;
        rest = rest.replace(match[0], " ");
      }
      break;
    }
  }

  if (start !== null && end === null) {
    const length = rest.match(/\bfor\s+(?:(an?)\s+hour|(\d+(?:\.\d+)?)\s*(hours?|hrs?|h|minutes?|mins?|m))\b/i);
    if (length) {
      const minutes = length[1] ? 60 : /^h/i.test(length[3]) ? Number(length[2]) * 60 : Number(length[2]);
      if (minutes >= 5 && start + minutes <= 24 * 60) {
        end = start + Math.round(minutes);
        rest = rest.replace(length[0], " ");
      }
    }
  }

  // "ish" and "?" belong to the time ("8 ish", "8:30?"), not the title.
  if (start !== null) rest = rest.replace(/\s+ish\b/gi, " ").replace(/(^|\s)\?(?=\s|$)/g, " ");
  const title = rest
    .replace(/\s+/g, " ")
    .replace(/\s+([,.;!?])/g, "$1")
    .replace(/\s+(?:at|from|till|until|for|@)\s*$/i, "")
    .replace(/[\s,.;:-]+$/g, "")
    .replace(/^[\s,.;:-]+/g, "")
    .trim();

  return { title: title || text.trim(), subject: matchSubject(text, subjects), start, end, evening, ...(meridiem ? { meridiem } : {}), ...(untilOnly ? { untilOnly } : {}) };
}

/** "- ask about the internship" → the note text for the line above, else null. */
export function noteLine(text: string): string | null {
  const match = text.match(/^\s*[-•*]\s*(.+)$/);
  return match ? match[1].trim() || null : null;
}

export interface LoggedLine extends DayLine {
  /** Typed as already done: "did astronomy till 4:25", "workout 4:30 to 4:55 done", "✅ Wake". */
  done: boolean;
}

const DONE_MARK = /\s*(?:✅|✔️|✔|☑️|☑|\[x\])\s*/gu;
const HAS_DONE_MARK = /✅|✔️|✔|☑️|☑|\[x\]/u;
const DONE_LEAD = /^\s*(?:did|done|finished|completed)\s+/i;
// "4:55 done" or "essay - done", but not "get it done".
const DONE_TAIL = /(?:(?<=\d|am|pm)\s+|\s*[,–-]\s*)(?:done|finished|complete|completed)\s*[.!]?\s*$/i;

/**
 * A line that may say it's already done. The markers come off before the
 * time is read; a done line with only an end time is logged as the half
 * hour before it.
 */
export function parseLoggedLine(text: string, subjects: string[]): LoggedLine {
  let rest = text;
  let done = false;
  if (HAS_DONE_MARK.test(rest)) {
    done = true;
    rest = rest.replace(DONE_MARK, " ");
  }
  if (DONE_LEAD.test(rest)) {
    done = true;
    rest = rest.replace(DONE_LEAD, "");
  }
  if (DONE_TAIL.test(rest)) {
    done = true;
    rest = rest.replace(DONE_TAIL, "");
  }
  // "till 4:25" with no start is read by parseDayLine: it ended then.
  return { ...parseDayLine(rest.trim() || text, subjects), done };
}

export interface PastedLine extends LoggedLine {
  /** "- " lines under it, in order. */
  notes: string[];
}

const BULLET = /^\s*(?:[•◦▪●○]\s+|\*\s+|\d+[.)]\s+|\[\s?\]\s*)/u;
const INDENT = /^(\s*)/;

function indentOf(raw: string): number {
  return (raw.match(INDENT)?.[1] ?? "").replace(/\t/g, "    ").length;
}

/** A short label with lines nested under it ("School", "When home", "Priorities"), not a thing to do. */
function looksLikeSection(cleaned: string, line: LoggedLine): boolean {
  // "Tonight" with lines under it is a heading, even though it names the evening.
  if (line.done || line.start !== null) return false;
  const words = cleaned.replace(/[:.]+$/, "").trim().split(/\s+/);
  return words.length <= 5 && cleaned.length <= 40;
}

/**
 * A whole day pasted from Notes, read the way it was written:
 * - one line each, ✅ lines come in done, "- " lines become notes on the line above
 * - a short line with lines nested under it ("School", "When home") becomes a section heading
 * - a first line on its own, before a blank line ("Hyper focus and plan"), is the day's headline
 * - a bare time earlier than the line before it is read as the evening ("Sleep at 11" after 10:50)
 * - "till 5:15" with no start begins where the line before it ended
 */
export function parseDayPaste(text: string, subjects: string[]): PastedLine[] {
  const raws = text.split(/\r?\n/);
  const lines: PastedLine[] = [];
  let lastStart = -1;
  let lastEnd: number | null = null;
  let seenLine = false;

  for (let index = 0; index < raws.length; index += 1) {
    const raw = raws[index];
    if (!raw.trim()) continue;
    // Only "- " is a note here: "•" and "*" are how Notes draws an ordinary bullet.
    const note = raw.match(/^\s*-\s+(.+)$/)?.[1].trim() ?? null;
    if (note && lines.length) {
      lines[lines.length - 1].notes.push(note);
      continue;
    }
    const cleaned = (note ?? raw).replace(BULLET, "").trim();
    if (!cleaned.replace(DONE_MARK, "").trim()) continue;
    const first = !seenLine;
    seenLine = true;

    let nextIndex = index + 1;
    while (nextIndex < raws.length && !raws[nextIndex].trim()) nextIndex += 1;
    const nested = nextIndex < raws.length && indentOf(raws[nextIndex]) > indentOf(raw);
    const blankAfter = index + 1 < raws.length && !raws[index + 1].trim();

    const line: PastedLine = { ...parseLoggedLine(cleaned, subjects), notes: [] };

    if (headlineText(cleaned) || sectionText(cleaned)) {
      lines.push({ ...line, title: cleaned, subject: null, start: null, end: null, evening: false, done: false });
      continue;
    }
    if (nested && looksLikeSection(cleaned, line)) {
      lines.push({ ...line, title: `${cleaned.replace(/[:.]+$/, "").trim()}:`, subject: null, done: false });
      continue;
    }
    if (first && blankAfter && !nested && !line.done && line.start === null && !line.evening) {
      lines.push({ ...line, title: `!${cleaned}`, subject: null });
      continue;
    }

    if (line.start !== null) {
      // The day runs forward: "Sleep at 11" after 10:50pm is 11pm, not 11am.
      if (!line.meridiem && line.start < lastStart - 30 && line.start + 12 * 60 < 24 * 60) {
        line.start += 12 * 60;
        if (line.end !== null) line.end += 12 * 60;
      }
      // "till 5:15" picks up where the last timed line finished.
      if (line.untilOnly && line.end !== null && lastEnd !== null && lastEnd < line.end && line.end - lastEnd <= 4 * 60) {
        line.start = lastEnd;
      }
      lastStart = line.start;
      lastEnd = line.end ?? line.start + UNTIL_MINUTES;
    }
    lines.push(line);
  }
  return lines;
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
// "Tuesday 6th October:", "Sun 11 Oct", "6 October 2026"; the weekday is optional (and often clipped).
const DAY_HEADER = /^\s*(?:[*•-]\s*)?(?:[a-z]+,?\s+)?(\d{1,2})(?:st|nd|rd|th)?\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?(?:\s+(\d{4}))?\s*:?\s*$/i;

export interface NotesDay {
  /** YYYY-MM-DD. */
  day: string;
  /** The day's lines, as pasted, for parseDayPaste. */
  text: string;
}

/**
 * Several days pasted from Notes, split at their headers ("Tuesday 6th
 * October:"). A header without a year is the closest such date on or before
 * today. Returns nothing when the text has no day headers.
 */
export function parseNotesHistory(text: string, today: string): NotesDay[] {
  const days: NotesDay[] = [];
  let current: { day: string; lines: string[] } | null = null;
  const [todayYear] = today.split("-").map(Number);
  for (const raw of text.split(/\r?\n/)) {
    const header = raw.match(DAY_HEADER);
    if (header) {
      const date = Number(header[1]);
      const month = MONTHS.indexOf(header[2].toLowerCase()) + 1;
      if (date >= 1 && date <= 31 && month >= 1) {
        const key = (year: number) => `${year}-${String(month).padStart(2, "0")}-${String(date).padStart(2, "0")}`;
        let day = header[3] ? key(Number(header[3])) : key(todayYear);
        if (!header[3] && day > today) day = key(todayYear - 1);
        if (current) days.push({ day: current.day, text: current.lines.join("\n") });
        current = { day, lines: [] };
        continue;
      }
    }
    current?.lines.push(raw);
  }
  if (current) days.push({ day: current.day, text: current.lines.join("\n") });
  return days.filter((entry) => entry.text.trim());
}
