/**
 * Mastery: how well a student knows each syllabus dot point, from 0 to 100,
 * built from the work they've done on it. No database and no model here, so
 * the app, the worker and the eval harness all score the same way.
 *
 *   Mastery = (0.40·Q + 0.30·C + 0.20·R + 0.10·E) · D
 *
 * Q quality of the work (AI marking, blended with the student's own rating)
 * C coverage (how many separate pieces touched the point)
 * R results (real marks on tests and assignments)
 * E effort (pages and minutes; kept small so volume alone can't inflate it)
 * D decay (untouched topics fade so they come back up for revision)
 *
 * The weights and cut-offs are starting guesses, exported so each change to
 * them is a recorded design iteration.
 */

export const MASTERY_VERSION = 1;

export const WEIGHTS = { q: 0.4, c: 0.3, r: 0.2, e: 0.1 } as const;

/** Score at or above which a point counts as strong. */
export const BAND_CUTS = { strong: 65, neglected: 40 } as const;

const DAY = 86_400_000;
/** A point loses ~10% of its value every three weeks without new work. */
export const DECAY_PER_PERIOD = 0.9;
export const DECAY_PERIOD_DAYS = 21;
/** Older work counts for less in Q and R: half as much after this many days. */
const RECENCY_HALF_LIFE_DAYS = 30;

export const BANDS = ["strong", "weak", "neglected", "none"] as const;
export type Band = (typeof BANDS)[number];

export const BAND_LABELS: Record<Band, string> = {
  strong: "Strong",
  weak: "Weak",
  neglected: "Neglected",
  none: "Not started",
};

export const REASONS = ["low_quality", "low_coverage", "decaying", "low_confidence"] as const;
export type Reason = (typeof REASONS)[number];

/** Why a point is weak, in the student's words, and what the session does about it. */
export const REASON_TIPS: Record<Reason, { label: string; tip: string }> = {
  low_quality: { label: "Mistakes in your working", tip: "Worked examples first, then similar practice questions." },
  low_coverage: { label: "Not much practice yet", tip: "Question types you haven't tried yet." },
  decaying: { label: "Not touched in a while", tip: "A short recall quiz, no notes." },
  low_confidence: { label: "Right, but not sure of it", tip: "Timed practice to build exam confidence." },
};

/** A piece of work tagged to the point. */
export interface TagEvidence {
  /** 0–100: how correct and complete the work on this point was. Null when the student added the tag themselves. */
  quality: number | null;
  /** 1–5 from the check-in, if the student gave one. */
  confidence: number | null;
  at: number;
  pages: number;
}

/** A real mark that covered the point. */
export interface ResultEvidence {
  /** 0–1. */
  fraction: number;
  at: number;
}

export interface PointEvidence {
  tags: TagEvidence[];
  results: ResultEvidence[];
  /** Study minutes logged on the point (session check-outs). */
  minutes: number;
  /** Has the class reached this point yet? Untaught points with no work aren't neglected. */
  taught: boolean;
}

export interface Mastery {
  score: number;
  q: number;
  c: number;
  r: number | null;
  e: number;
  decay: number;
  band: Band;
  reason: Reason | null;
  /** Mean check-in confidence, 1–5, or null. */
  confidence: number | null;
  works: number;
  lastAt: number | null;
}

const clamp = (value: number, lo = 0, hi = 100) => Math.min(hi, Math.max(lo, value));
const round = (value: number) => Math.round(value * 10) / 10;

function recencyWeight(at: number, now: number) {
  const days = Math.max(0, (now - at) / DAY);
  return 0.5 ** (days / RECENCY_HALF_LIFE_DAYS);
}

function weightedMean(items: Array<{ value: number; at: number }>, now: number): number | null {
  let total = 0;
  let weights = 0;
  for (const item of items) {
    const w = recencyWeight(item.at, now);
    total += item.value * w;
    weights += w;
  }
  return weights > 0 ? total / weights : null;
}

/** 1–5 → 0–100. */
export const confidenceToScore = (confidence: number) => ((clamp(confidence, 1, 5) - 1) / 4) * 100;

export function decayFactor(lastAt: number | null, now: number): number {
  if (lastAt === null) return 1;
  const days = Math.max(0, (now - lastAt) / DAY);
  return DECAY_PER_PERIOD ** (days / DECAY_PERIOD_DAYS);
}

export function computeMastery(evidence: PointEvidence, now: number): Mastery {
  const { tags, results } = evidence;
  const works = tags.length;
  const times = [...tags.map((tag) => tag.at), ...results.map((result) => result.at)];
  const lastAt = times.length ? Math.max(...times) : null;

  const rated = tags.filter((tag) => tag.confidence !== null);
  const confidence = rated.length ? rated.reduce((sum, tag) => sum + (tag.confidence as number), 0) / rated.length : null;

  if (works === 0 && results.length === 0) {
    return {
      score: 0,
      q: 0,
      c: 0,
      r: null,
      e: 0,
      decay: 1,
      band: evidence.taught ? "neglected" : "none",
      reason: null,
      confidence: null,
      works: 0,
      lastAt: null,
    };
  }

  const aiQuality = weightedMean(
    tags.filter((tag) => tag.quality !== null).map((tag) => ({ value: clamp(tag.quality as number), at: tag.at })),
    now,
  );
  const rating = weightedMean(rated.map((tag) => ({ value: confidenceToScore(tag.confidence as number), at: tag.at })), now);
  // A tag the student added has no marking behind it: their rating stands in.
  const q = aiQuality === null ? (rating ?? 0) : rating === null ? aiQuality : 0.75 * aiQuality + 0.25 * rating;
  const c = 100 * (1 - Math.exp(-works / 4));
  const markMean = weightedMean(results.map((result) => ({ value: clamp(result.fraction * 100), at: result.at })), now);
  const r = markMean;
  const pages = tags.reduce((sum, tag) => sum + Math.max(1, tag.pages), 0);
  const e = 100 * (1 - Math.exp(-(pages + evidence.minutes / 20) / 6));

  let raw: number;
  if (r === null) {
    // No marks yet: R's share goes to the other three in proportion.
    const share = WEIGHTS.q + WEIGHTS.c + WEIGHTS.e;
    raw = (WEIGHTS.q * q + WEIGHTS.c * c + WEIGHTS.e * e) / share;
  } else if (works === 0) {
    // Only marks: they stand in for quality too.
    raw = ((WEIGHTS.q + WEIGHTS.r) * r) / (WEIGHTS.q + WEIGHTS.r + WEIGHTS.c + WEIGHTS.e);
  } else {
    raw = WEIGHTS.q * q + WEIGHTS.c * c + WEIGHTS.r * r + WEIGHTS.e * e;
  }
  const decay = decayFactor(lastAt, now);
  const score = clamp(raw * decay);

  const band: Band =
    score >= BAND_CUTS.strong ? "strong" : decay < 1 && score < BAND_CUTS.neglected && raw >= BAND_CUTS.neglected ? "neglected" : "weak";

  return {
    score: round(score),
    q: round(q),
    c: round(c),
    r: r === null ? null : round(r),
    e: round(e),
    decay: Math.round(decay * 1000) / 1000,
    band,
    reason: reasonFor({ q, c, decay, confidence, works }),
    confidence: confidence === null ? null : round(confidence),
    works,
    lastAt,
  };
}

/** The main thing holding a point back, which decides the kind of practice. */
export function reasonFor(parts: { q: number; c: number; decay: number; confidence: number | null; works: number }): Reason | null {
  if (parts.works > 0 && parts.q < 55) return "low_quality";
  if (parts.c < 40) return "low_coverage";
  if (parts.decay < 0.85) return "decaying";
  if (parts.confidence !== null && parts.confidence <= 2.5) return "low_confidence";
  if (parts.q < 70) return "low_quality";
  return null;
}

export interface PriorityInput {
  pointId: string;
  mastery: Mastery;
  /** How much the point is worth (teaching hours). */
  hours: number;
  /** Days until an assessment that covers it, if one is coming up. */
  dueInDays?: number | null;
  snoozedUntil?: number | null;
  coveredElsewhere?: boolean;
}

export interface Priority {
  pointId: string;
  priority: number;
  reason: Reason;
}

/** An assessment within this many days pulls its points up the list. */
const ASSESSMENT_WINDOW_DAYS = 28;

/**
 * What to work on next, most urgent first. Only points with work behind
 * them are ranked, so a new student isn't handed the whole syllabus.
 */
export function rankPriorities(points: PriorityInput[], now: number, limit = 5): Priority[] {
  const ranked = points.filter(
    (point) =>
      point.mastery.works > 0 &&
      !point.coveredElsewhere &&
      !(point.snoozedUntil && point.snoozedUntil > now) &&
      point.mastery.band !== "strong",
  );
  if (ranked.length === 0) return [];
  const meanHours = ranked.reduce((sum, point) => sum + point.hours, 0) / ranked.length || 1;
  return ranked
    .map((point) => {
      const due = point.dueInDays;
      const boost = due !== null && due !== undefined && due >= 0 && due <= ASSESSMENT_WINDOW_DAYS ? 1 + (ASSESSMENT_WINDOW_DAYS - due) / ASSESSMENT_WINDOW_DAYS : 1;
      const worth = Math.min(1.5, Math.max(0.5, point.hours / meanHours));
      return {
        pointId: point.pointId,
        priority: round((100 - point.mastery.score) * boost * worth),
        reason: point.mastery.reason ?? "low_quality",
      };
    })
    .sort((a, b) => b.priority - a.priority)
    .slice(0, limit);
}

/** Snoozes can't hide a topic forever. */
export const MAX_SNOOZE_DAYS = 21;
