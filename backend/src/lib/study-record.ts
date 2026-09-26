/**
 * The study log read back: a record per topic, lines Arcad can plan from,
 * the gaps, and how a study block splits into entries. No database access,
 * so the tests can load it directly.
 */
import {
  blockTopics,
  feelingConfidence,
  splitMinutes,
  type Confidence,
  type LogKind,
  type LoggablePlan,
} from "../../../shared/studyLog.ts";

type LogRow = {
  topicId: string | null;
  topic: string;
  minutes: number;
  confidence: string | null;
  note: string;
  studiedAt: number;
  eventId: string | null;
  activityId: string | null;
};

/** One topic's worth of a session, ready to write. */
export interface LogEntry {
  topicId: string | null;
  topic: string;
  kind: LogKind;
  minutes: number;
  confidence: Confidence | null;
  note: string;
}

/** Everything the log says about one topic. */
export interface TopicRecord {
  key: string;
  topicId: string | null;
  topic: string;
  sessions: number;
  minutes: number;
  lastAt: number;
  /** The most recent confidence they gave, if any. */
  confidence: Confidence | null;
  /** The most recent thing they said was left. */
  note: string;
}

/**
 * Folds log rows into one record per topic, most recently studied first.
 * Rows from the same block count as one session.
 */
export function summariseLog(
  rows: Array<Pick<LogRow, "topicId" | "topic" | "minutes" | "confidence" | "note" | "studiedAt" | "eventId" | "activityId">>,
): TopicRecord[] {
  const records = new Map<string, TopicRecord & { seen: Set<string> }>();
  const sorted = [...rows].sort((a, b) => b.studiedAt - a.studiedAt);
  for (const row of sorted) {
    const key = row.topicId || row.topic.trim().toLowerCase();
    if (!key) continue;
    const record =
      records.get(key) ??
      { key, topicId: row.topicId, topic: row.topic, sessions: 0, minutes: 0, lastAt: row.studiedAt, confidence: null, note: "", seen: new Set<string>() };
    const session = row.eventId ?? row.activityId ?? `${row.studiedAt}`;
    if (!record.seen.has(session)) {
      record.seen.add(session);
      record.sessions += 1;
    }
    record.minutes += row.minutes;
    // Newest first, so the first confidence and note seen are the latest.
    record.confidence ??= (row.confidence as Confidence | null) ?? null;
    if (!record.note && row.note) record.note = row.note;
    records.set(key, record);
  }
  return [...records.values()].map(({ seen: _seen, ...record }) => record);
}

const CONFIDENCE_WORDS: Record<Confidence, string> = { got_it: "felt solid", shaky: "still shaky", lost: "lost on it" };

/**
 * The record as a few short lines for Arcad: capped, so the prompt costs the
 * same whether they've logged five sessions or five hundred.
 * "3.2 Limiting reagents: 3 sessions, 85 min, last Thu 1 Oct, still shaky, left: Q7-9"
 */
export function describeRecords(records: TopicRecord[], timeZone: string, limit = 6): string[] {
  const format = new Intl.DateTimeFormat("en-AU", { weekday: "short", day: "numeric", month: "short", timeZone });
  // "Wed 23 Sept": no comma, since the line is already comma-separated.
  const day = (at: number) => format.formatToParts(at).filter((part) => part.type !== "literal").map((part) => part.value).join(" ");
  return records.slice(0, limit).map((record) => {
    const parts = [
      `${record.sessions} ${record.sessions === 1 ? "session" : "sessions"}`,
      `${record.minutes} min`,
      `last ${day(record.lastAt)}`,
      ...(record.confidence ? [CONFIDENCE_WORDS[record.confidence]] : []),
      ...(record.note ? [`left: ${record.note}`] : []),
    ];
    return `${record.topic}: ${parts.join(", ")}`;
  });
}

/**
 * Topics already taught (started on or before today) that the log has
 * nothing on, oldest first: the plainest gaps.
 */
export function untouchedTopics<T extends { id: string; title: string; startsOn: string | null }>(
  topics: T[],
  records: TopicRecord[],
  today: string,
): T[] {
  const logged = new Set(records.flatMap((record) => [record.topicId, record.topic.trim().toLowerCase()]));
  return topics
    .filter((topic) => topic.startsOn && topic.startsOn <= today)
    .filter((topic) => !logged.has(topic.id) && !logged.has(topic.title.trim().toLowerCase()))
    .sort((a, b) => a.startsOn!.localeCompare(b.startsOn!));
}

/** What a check-out said about each topic, keyed as `sessionTopics` keys them. */
export interface CheckoutAnswers {
  ratings: Map<string, Confidence>;
  /** Plan steps ticked off. */
  done: number[];
  leftover: string;
  /** The older one-tap rating, for app builds that don't ask per topic. */
  feeling: unknown;
}

/**
 * A study block's log entries: its plan's topics, the minutes actually
 * studied split across them, and what the check-out said. Without a
 * check-out (ticked done on Today) the topics are logged unrated.
 */
export function blockEntries(
  event: { title: string; taskId: string | null; plan: string | null },
  minutes: number,
  answers: CheckoutAnswers | null,
): LogEntry[] {
  let plan: LoggablePlan | null = null;
  try {
    plan = event.plan ? (JSON.parse(event.plan) as LoggablePlan) : null;
  } catch {
    plan = null;
  }
  const topics = blockTopics({ plan, title: event.title, taskId: event.taskId });
  // What's left belongs to the first step they didn't get to.
  const undone = plan?.steps.findIndex((_, index) => !answers?.done.includes(index)) ?? -1;
  const leftoverKey = topics.find((topic) => topic.steps.includes(undone))?.key ?? topics[0]?.key;
  return splitMinutes(topics, minutes).map((topic) => ({
    topicId: topic.topicId,
    topic: topic.topic,
    kind: topic.kind,
    minutes: topic.minutes,
    confidence:
      answers?.ratings.get(topic.key) ?? (answers && topics.length === 1 ? feelingConfidence(answers.feeling) : null),
    note: answers && topic.key === leftoverKey ? answers.leftover : "",
  }));
}

/** A topic Arcad can file the session under, tagged so the reply names it without copying ids. */
export interface MenuTopic {
  tag: string;
  topicId: string | null;
  title: string;
  note: string;
}

/**
 * The topics this session could be on: the class topic and the one before,
 * what they studied last, and for Pro and Max the gaps in their record.
 * At most eight, so the prompt stays small.
 */
export function topicMenu(inputs: {
  brief?: {
    topic: { id: string; title: string; upcoming: boolean } | null;
    previousTopic: { id: string; title: string } | null;
  } | null;
  lastCheckouts: Array<{ topicId: string | null; topic: string | null }>;
  record: TopicRecord[];
  untouched: Array<{ id: string; title: string }>;
  paid: boolean;
}): MenuTopic[] {
  const { brief, lastCheckouts, record, untouched, paid } = inputs;
  const menu: Array<Omit<MenuTopic, "tag">> = [];
  const add = (topicId: string | null, title: string | null | undefined, note: string) => {
    const name = String(title ?? "").replace(/\s+/g, " ").trim().slice(0, 80);
    if (!name) return;
    const key = topicId || name.toLowerCase();
    if (menu.some((item) => (item.topicId || item.title.toLowerCase()) === key)) return;
    menu.push({ topicId, title: name, note });
  };
  if (brief?.topic) add(brief.topic.id, brief.topic.title, brief.topic.upcoming ? "next class topic" : "this week's class topic");
  if (brief?.previousTopic) add(brief.previousTopic.id, brief.previousTopic.title, "last class topic");
  for (const past of lastCheckouts) add(past.topicId, past.topic, "studied recently");
  if (paid) {
    for (const entry of record.filter((item) => item.confidence === "lost" || item.confidence === "shaky").slice(0, 3)) {
      add(entry.topicId, entry.topic, entry.confidence === "lost" ? "lost on it last time" : "still shaky");
    }
    for (const topic of untouched.slice(0, 3)) add(topic.id, topic.title, "taught, not studied yet");
  }
  return menu.slice(0, 8).map((item, index) => ({ ...item, tag: `T${index + 1}` }));
}
