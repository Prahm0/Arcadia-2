/**
 * One line typed into "Add to today...", read the way a person writes a day
 * note: "Wake at 7:30", "SLC 10:50", "Power nap at 2:15 till 2:45",
 * "Practising interview rest of night". No model call, so it's instant.
 *
 * Times without am or pm read like a school day: 7 to 11 is morning, 12 is
 * noon, and a bare hour from 1 to 6 is the afternoon.
 */
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
}

const CLOCK = String.raw`(\d{1,2})(?::(\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)?`;
const SEPARATOR = String.raw`\s*(?:till|til|until|to|-|–)\s*`;

/** Minutes past midnight for one clock reading, with the school-day guess for a bare hour. */
function clock(hourText: string, minuteText: string | undefined, meridiem: string | undefined): number | null {
  let hour = Number(hourText);
  const minute = Number(minuteText ?? 0);
  if (minute > 59 || hour > 23) return null;
  const suffix = meridiem?.toLowerCase().replace(/\./g, "");
  if (suffix) {
    if (hour < 1 || hour > 12) return null;
    hour = (hour % 12) + (suffix === "pm" ? 12 : 0);
  } else if (hour >= 1 && hour <= 6) {
    hour += 12;
  }
  return hour * 60 + minute;
}

/** True when a matched clock reading is clearly a time and not just a number. */
function looksLikeTime(minuteText: string | undefined, meridiem: string | undefined, lead: string | undefined): boolean {
  return Boolean(minuteText || meridiem || lead);
}

export function parseDayLine(text: string, subjects: string[]): DayLine {
  let rest = ` ${text.trim()} `;
  let start: number | null = null;
  let end: number | null = null;
  let evening = false;

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
    const range = new RegExp(String.raw`\b(at|from|@)?\s*${CLOCK}${SEPARATOR}${CLOCK}(?=\s|$|[,.;])`, "i");
    const match = rest.match(range);
    if (match) {
      const from = clock(match[2], match[3], match[4] ?? match[7]);
      let to = clock(match[5], match[6], match[7]);
      if (from !== null && to !== null) {
        // "11 till 1": the end is after the start, so it's the afternoon.
        if (to <= from && to + 12 * 60 < 24 * 60 && !match[7]) to += 12 * 60;
        if (to > from) {
          start = from;
          end = to;
          rest = rest.replace(match[0], " ");
        }
      }
    }
  }

  if (start === null) {
    const single = new RegExp(String.raw`\b(at|from|@)?\s*${CLOCK}(?=\s|$|[,.;])`, "gi");
    for (const match of rest.matchAll(single)) {
      if (!looksLikeTime(match[3], match[4], match[1])) continue;
      const value = clock(match[2], match[3], match[4]);
      if (value === null) continue;
      start = value;
      rest = rest.replace(match[0], " ");
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

  const title = rest
    .replace(/\s+/g, " ")
    .replace(/\s+(?:at|from|till|until|for|@)\s*$/i, "")
    .replace(/[\s,.;:-]+$/g, "")
    .replace(/^[\s,.;:-]+/g, "")
    .trim();

  return { title: title || text.trim(), subject: matchSubject(text, subjects), start, end, evening };
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

/** A logged line with only an end ("till 4:25") gets this long a block before it. */
const LOGGED_MINUTES = 30;
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
  if (done) {
    // "till 4:25" with no start: it ended then.
    const until = rest.match(new RegExp(String.raw`\s*\b(?:till|til|until|to|up to)\s+${CLOCK}(?=\s|$|[,.;])`, "i"));
    const hasStart = new RegExp(String.raw`\d\s*(?::\d{2})?\s*(?:am|pm)?${SEPARATOR}\d`, "i").test(rest);
    if (until && !hasStart) {
      const end = clock(until[1], until[2], until[3]);
      if (end !== null && end >= LOGGED_MINUTES) {
        const line = parseDayLine(rest.replace(until[0], " "), subjects);
        return { ...line, start: end - LOGGED_MINUTES, end, evening: false, done };
      }
    }
  }
  return { ...parseDayLine(rest.trim() || text, subjects), done };
}

export interface PastedLine extends LoggedLine {
  /** "- " lines under it, in order. */
  notes: string[];
}

const BULLET = /^\s*(?:[•◦▪●○]\s+|\*\s+|\d+[.)]\s+|\[\s?\]\s*)/u;

/**
 * A whole day pasted from Notes: one line each, ✅ lines come in done, and
 * lines starting with "- " become notes under the line above.
 */
export function parseDayPaste(text: string, subjects: string[]): PastedLine[] {
  const lines: PastedLine[] = [];
  for (const raw of text.split(/\r?\n/)) {
    if (!raw.trim()) continue;
    // Only "- " is a note here: "•" and "*" are how Notes draws an ordinary bullet.
    const note = raw.match(/^\s*-\s+(.+)$/)?.[1].trim() ?? null;
    if (note && lines.length) {
      lines[lines.length - 1].notes.push(note);
      continue;
    }
    const cleaned = (note ?? raw).replace(BULLET, "").trim();
    if (!cleaned.replace(DONE_MARK, "").trim()) continue;
    lines.push({ ...parseLoggedLine(cleaned, subjects), notes: [] });
  }
  return lines;
}
