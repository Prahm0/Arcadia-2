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
