/**
 * The study log: what a student studied, on which topic, for how long and
 * how it left them. Every entry is built from data the session already has
 * (the plan's steps, the timer, the check-out), so logging never calls the
 * model. Shared so the check-out sheet asks about the same topics the API
 * writes rows for.
 */

export const CONFIDENCE = ["got_it", "shaky", "lost"] as const;
export type Confidence = (typeof CONFIDENCE)[number];

export const CONFIDENCE_LABELS: Record<Confidence, string> = {
  got_it: "Got it",
  shaky: "Shaky",
  lost: "Lost",
};

/** What kind of work a step or session was. */
export const LOG_KINDS = ["learn", "practice", "review", "assignment", "study"] as const;
export type LogKind = (typeof LOG_KINDS)[number];

export function isConfidence(value: unknown): value is Confidence {
  return typeof value === "string" && (CONFIDENCE as readonly string[]).includes(value);
}

export function isLogKind(value: unknown): value is LogKind {
  return typeof value === "string" && (LOG_KINDS as readonly string[]).includes(value);
}

/** The parts of a session plan the log reads. */
export interface LoggablePlan {
  topic: string;
  topicId?: string | null;
  /** The syllabus name of topicId, when the one-line topic says more than that. */
  topicTitle?: string | null;
  /** Set on "Open study" plans made without a syllabus: not a topic. */
  needsSyllabus?: unknown;
  steps: Array<{ minutes: number; text: string; topicId?: string | null; topic?: string | null; kind?: string | null }>;
}

/** One topic a session touched, with the plan minutes that went to it. */
export interface SessionTopic {
  /**
   * topicId, or the lowercased title when the topic isn't on the syllabus;
   * empty for time on the subject with no topic to file it under.
   */
  key: string;
  topicId: string | null;
  topic: string;
  kind: LogKind;
  /** Plan minutes on this topic, for splitting the real time. */
  planMinutes: number;
  /** Indexes of the plan steps on this topic. */
  steps: number[];
}

const clean = (value: string) => value.replace(/\s+/g, " ").trim();

export function topicKey(topicId: string | null | undefined, topic: string): string {
  return topicId || clean(topic).toLowerCase();
}

/**
 * The topics a planned session covers, in plan order. A step without its own
 * topic belongs to the session's topic; a plan-less session is one topic,
 * `fallback` (the block's title or subject).
 */
export function sessionTopics(
  plan: LoggablePlan | null | undefined,
  fallback: { topic: string; topicId?: string | null; kind?: LogKind },
): SessionTopic[] {
  const mainTopic = plan?.needsSyllabus ? "" : clean(plan?.topicTitle || plan?.topic || fallback.topic);
  const mainId = plan ? plan.topicId ?? null : fallback.topicId ?? null;
  const steps = plan?.steps?.length ? plan.steps : [{ minutes: 1, text: mainTopic, topicId: mainId, kind: fallback.kind ?? null }];

  const byKey = new Map<string, SessionTopic>();
  const longest = new Map<string, number>();
  for (const [index, step] of steps.entries()) {
    // A step on another topic (last time's leftovers, say) carries its own
    // title; any other step is on the session's topic.
    const own = step.topic ? clean(step.topic) : "";
    const separate = Boolean(own) && topicKey(step.topicId, own) !== topicKey(mainId, mainTopic);
    const topicId = separate ? step.topicId ?? null : mainId;
    const topic = separate ? own : mainTopic;
    const key = topicKey(topicId, topic);
    const minutes = Math.max(0, Number(step.minutes) || 0);
    const kind = isLogKind(step.kind) ? step.kind : fallback.kind ?? "study";
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, { key, topicId, topic, kind, planMinutes: minutes, steps: [index] });
      longest.set(key, minutes);
      continue;
    }
    existing.planMinutes += minutes;
    existing.steps.push(index);
    // The session's main kind is its longest step's.
    if (minutes > (longest.get(key) ?? 0)) {
      longest.set(key, minutes);
      existing.kind = kind;
    }
  }
  return [...byKey.values()];
}

/**
 * A study block's topics. A deadline block is on its task; any other block
 * is on whatever its plan names, or no topic at all (the subject name isn't
 * one, and filing time under it would crowd the record).
 */
export function blockTopics(block: { plan: LoggablePlan | null | undefined; title: string; taskId: string | null }): SessionTopic[] {
  return sessionTopics(block.plan, {
    topic: block.taskId ? block.title : "",
    kind: block.taskId ? "assignment" : "study",
  });
}

/**
 * Splits the minutes actually studied across the topics in proportion to the
 * plan, whole minutes that add up to `total`. Topics that round to nothing
 * are dropped rather than logged as zero.
 */
export function splitMinutes<T extends { planMinutes: number }>(topics: T[], total: number): Array<T & { minutes: number }> {
  const minutes = Math.max(0, Math.round(total));
  if (topics.length === 0 || minutes === 0) return [];
  const planned = topics.reduce((sum, topic) => sum + topic.planMinutes, 0);
  const shares = topics.map((topic) => (planned > 0 ? (topic.planMinutes / planned) * minutes : minutes / topics.length));
  const rounded = shares.map(Math.floor);
  // Largest remainders get the leftover minutes, so the parts sum to the whole.
  let left = minutes - rounded.reduce((sum, value) => sum + value, 0);
  const order = shares.map((share, index) => ({ index, rest: share - Math.floor(share) })).sort((a, b) => b.rest - a.rest);
  for (const { index } of order) {
    if (left <= 0) break;
    rounded[index] += 1;
    left -= 1;
  }
  return topics.flatMap((topic, index) => (rounded[index] > 0 ? [{ ...topic, minutes: rounded[index] }] : []));
}

/**
 * The old one-tap "How'd it go?" as a confidence, for check-outs from older
 * app builds. "Okay" says nothing either way, so it isn't turned into one.
 */
export function feelingConfidence(feeling: unknown): Confidence | null {
  return feeling === "good" ? "got_it" : feeling === "rough" ? "lost" : null;
}

/** The overall feel of a session from its topics: the least sure one. */
export function overallFeeling(confidences: Array<Confidence | null>): "good" | "ok" | "rough" | null {
  if (confidences.includes("lost")) return "rough";
  if (confidences.includes("shaky")) return "ok";
  if (confidences.includes("got_it")) return "good";
  return null;
}
