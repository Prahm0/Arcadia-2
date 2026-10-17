/**
 * Quick add: "chem SAC next thursday, about 3 hours" → a deadline, read on
 * the device as the student types. No model call, so it's instant, free and
 * works for students who haven't allowed AI. Anything it can't read stays in
 * the title and the student fills it in below.
 */

export type QuickTaskType = "homework" | "assignment" | "exam" | "revision" | "project";

export interface QuickAdd {
  /** What's left once the date, time and length are taken out. */
  title: string;
  subject: string | null;
  taskType: QuickTaskType | null;
  /** YYYY-MM-DD in the student's own calendar. */
  dueDate: string | null;
  /** HH:MM, 24 hour. */
  dueTime: string | null;
  minutes: number | null;
}

const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];

const TYPE_WORDS: Array<[RegExp, QuickTaskType]> = [
  [/\b(exams?|tests?|quiz(?:zes)?|sacs?|midterms?|finals?|trials?|mocks?)\b/i, "exam"],
  [/\b(essays?|assignments?|reports?|ia\d?|portfolios?|presentations?|orals?|speech(?:es)?|investigations?|depth stud(?:y|ies))\b/i, "assignment"],
  [/\b(projects?)\b/i, "project"],
  [/\b(homework|hw|worksheets?|questions|exercises)\b/i, "homework"],
  [/\b(revise|revision|study for|review)\b/i, "revision"],
];

/** Short forms students actually type, matched against the start of a subject's words. */
const SUBJECT_ALIASES: Record<string, string[]> = {
  chem: ["chemistry"],
  bio: ["biology"],
  phys: ["physics"],
  psych: ["psychology"],
  maths: ["mathematics", "mathematical", "maths", "math"],
  math: ["mathematics", "mathematical", "maths", "math"],
  methods: ["methods"],
  spesh: ["specialist"],
  eng: ["english"],
  lit: ["literature"],
  eco: ["economics"],
  econ: ["economics"],
  econs: ["economics"],
  geo: ["geography"],
  hist: ["history"],
  cs: ["computer", "computing"],
  compsci: ["computer", "computing"],
  pe: ["physical", "pdhpe", "pe"],
  legal: ["legal"],
  biz: ["business"],
};

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

/** today ("YYYY-MM-DD") plus `days`, as a date key. */
function addDays(today: string, days: number): string {
  const at = new Date(`${today}T12:00:00Z`);
  at.setUTCDate(at.getUTCDate() + days);
  return at.toISOString().slice(0, 10);
}

function weekdayOf(today: string): number {
  return new Date(`${today}T12:00:00Z`).getUTCDay();
}

/** The next calendar date with this month and day, this year or next. */
function nextDate(today: string, month: number, day: number): string | null {
  const year = Number(today.slice(0, 4));
  for (const candidateYear of [year, year + 1]) {
    const key = `${candidateYear}-${pad(month + 1)}-${pad(day)}`;
    const valid = new Date(`${key}T12:00:00Z`).toISOString().slice(0, 10) === key;
    if (valid && key >= today) return key;
    if (!valid) return null;
  }
  return null;
}

interface Cut {
  pattern: RegExp;
  read: (match: RegExpMatchArray, today: string) => Partial<QuickAdd> | null;
}

const MONTH = `(${MONTHS.map((month) => `${month.slice(0, 3)}(?:${month.slice(3)})?`).join("|")})\\.?`;
const WEEKDAY = `(${WEEKDAYS.map((day) => `${day.slice(0, 3)}(?:${day.slice(3)})?`).join("|")}|tues|thur|thurs)`;
const LEAD = `(?:(?:due|on|by|this|for)\\s+)*`;

function monthIndex(word: string): number {
  return MONTHS.findIndex((month) => month.startsWith(word.toLowerCase().slice(0, 3)));
}

function weekdayIndex(word: string): number {
  return WEEKDAYS.findIndex((day) => day.startsWith(word.toLowerCase().slice(0, 3)));
}

/** Read in this order: each cut takes its words out of the text before the next looks. */
const CUTS: Cut[] = [
  // Duration: "about 3 hours", "~90 min", "2h", "1.5 hrs", "half an hour", "an hour".
  {
    pattern: /\b(?:(?:about|around|roughly|takes?|need(?:s)?)\s+|~\s*)?(\d+(?:\.\d+)?)\s*(hours?|hrs?|h|minutes?|mins?|m)\b/i,
    read: (match) => {
      const amount = Number(match[1]);
      const minutes = /^h/i.test(match[2]) ? amount * 60 : amount;
      return minutes >= 5 && minutes <= 24 * 60 ? { minutes: Math.round(minutes / 5) * 5 } : null;
    },
  },
  { pattern: /\b(?:about\s+)?half an hour\b/i, read: () => ({ minutes: 30 }) },
  { pattern: /\b(?:about\s+)?an hour\b/i, read: () => ({ minutes: 60 }) },
  // Time: "at 9am", "by 5:30pm", "9am".
  {
    pattern: /\b(?:at|by|@)?\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i,
    read: (match) => {
      let hour = Number(match[1]) % 12;
      if (match[3].toLowerCase() === "pm") hour += 12;
      const minute = Number(match[2] ?? 0);
      return hour < 24 && minute < 60 ? { dueTime: `${pad(hour)}:${pad(minute)}` } : null;
    },
  },
  // Dates: "21 oct", "21st of October", "oct 21", "21/10".
  {
    pattern: new RegExp(`\\b${LEAD}(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?${MONTH}\\b`, "i"),
    read: (match, today) => {
      const date = nextDate(today, monthIndex(match[2]), Number(match[1]));
      return date ? { dueDate: date } : null;
    },
  },
  {
    pattern: new RegExp(`\\b${LEAD}${MONTH}\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b`, "i"),
    read: (match, today) => {
      const date = nextDate(today, monthIndex(match[1]), Number(match[2]));
      return date ? { dueDate: date } : null;
    },
  },
  {
    pattern: new RegExp(`\\b${LEAD}(\\d{1,2})/(\\d{1,2})\\b`),
    read: (match, today) => {
      const date = nextDate(today, Number(match[2]) - 1, Number(match[1]));
      return date ? { dueDate: date } : null;
    },
  },
  // Relative: "today", "tonight", "tomorrow", "in 3 days", "in 2 weeks", "next week".
  { pattern: new RegExp(`\\b${LEAD}(today|tonight)\\b`, "i"), read: (_, today) => ({ dueDate: today }) },
  { pattern: new RegExp(`\\b${LEAD}(tomorrow|tmrw?|tmr)\\b`, "i"), read: (_, today) => ({ dueDate: addDays(today, 1) }) },
  {
    pattern: /\bin\s+(\d{1,2}|a|one|two|three)\s+(days?|weeks?)\b/i,
    read: (match, today) => {
      const words: Record<string, number> = { a: 1, one: 1, two: 2, three: 3 };
      const count = words[match[1].toLowerCase()] ?? Number(match[1]);
      return { dueDate: addDays(today, count * (/^w/i.test(match[2]) ? 7 : 1)) };
    },
  },
  { pattern: new RegExp(`\\b${LEAD}next week\\b`, "i"), read: (_, today) => ({ dueDate: addDays(today, 7) }) },
  // Weekdays: "thursday", "next thur", "on fri". Always the coming one; today's
  // own weekday means a week from today.
  {
    pattern: new RegExp(`\\b${LEAD}(?:next\\s+)?${WEEKDAY}\\b`, "i"),
    read: (match, today) => {
      const target = weekdayIndex(match[1]);
      if (target < 0) return null;
      const ahead = (target - weekdayOf(today) + 7) % 7 || 7;
      return { dueDate: addDays(today, ahead) };
    },
  },
];

function words(value: string): string[] {
  return value.toLowerCase().match(/[a-z0-9]+/g) ?? [];
}

/**
 * The student's subject the text names, by its full name, a word of it
 * ("chemistry"), the start of one ("chem") or a common short form ("spesh",
 * "methods"). Nothing when two subjects match equally.
 */
export function matchSubject(text: string, subjects: string[]): string | null {
  const typed = words(text);
  let best: { subject: string; score: number } | null = null;
  let tie = false;
  for (const subject of subjects) {
    const name = subject.toLowerCase();
    const nameWords = words(subject);
    let score = 0;
    if (text.toLowerCase().includes(name)) score = 100 + name.length;
    else {
      for (const word of typed) {
        if (word.length < 2) continue;
        const aliases = SUBJECT_ALIASES[word];
        if (aliases?.some((alias) => nameWords.some((part) => part.startsWith(alias)))) score = Math.max(score, 20 + word.length);
        else if (word.length >= 3 && nameWords.some((part) => part.length >= 4 && part.startsWith(word))) score = Math.max(score, 10 + word.length);
      }
    }
    if (score === 0) continue;
    if (!best || score > best.score) {
      best = { subject, score };
      tie = false;
    } else if (score === best.score) tie = true;
  }
  return best && !tie ? best.subject : null;
}

export function parseQuickAdd(text: string, subjects: string[], today: string): QuickAdd {
  let rest = ` ${text} `;
  const found: Partial<QuickAdd> = {};
  for (const cut of CUTS) {
    const match = rest.match(cut.pattern);
    if (!match) continue;
    const read = cut.read(match, today);
    if (!read) continue;
    const key = Object.keys(read)[0] as keyof QuickAdd;
    if (found[key] !== undefined) continue;
    Object.assign(found, read);
    rest = rest.replace(match[0], " ");
  }
  const taskType = TYPE_WORDS.find(([pattern]) => pattern.test(text))?.[1] ?? null;
  const title = rest
    .replace(/\s+/g, " ")
    .replace(/[\s,.;:-]+$/g, "")
    .replace(/^[\s,.;:-]+/g, "")
    .replace(/\s+(?:due|on|by|at|for|about)$/i, "")
    .trim();
  return {
    title: title ? title.charAt(0).toUpperCase() + title.slice(1) : "",
    subject: matchSubject(text, subjects),
    taskType,
    dueDate: found.dueDate ?? null,
    dueTime: found.dueTime ?? null,
    minutes: found.minutes ?? null,
  };
}
