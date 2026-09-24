import { ATLAS, MINUTES_PER_STAR, type AtlasFacts } from "./constellationAtlas.ts";
import { CONSTELLATION_ART } from "./constellationArt.ts";

/** Shared, versioned rules and artwork. A followed card never gates earning. */
/** One colour across Streaks: the chain, every card and its progress. */
export const STREAK_GOLD = "#e6c78f";
/** One of the five practice cards, or one of the 88 constellations (see ATLAS). */
export type ConstellationId = string;
export interface ConstellationDefinition {
  id: ConstellationId;
  version: number;
  name: string;
  family: string;
  story: string;
  description: string;
  requirement: string;
  colour: string;
  points: [number, number][];
  edges: [number, number][];
  thresholds: number[];
  metric: "minutes" | "days" | "subjects" | "sessions";
  legacy?: boolean;
  /** Star magnitudes, brightest first; brighter stars are drawn larger. */
  mags?: number[];
  /** Set on the 88 real constellations, which form one after another. */
  atlas?: AtlasFacts & { order: number };
}

export const CONSTELLATIONS: ConstellationDefinition[] = [
  { id: "first-light", version: 1, name: "First Light", family: "Beginnings", story: "Every sky begins somewhere.", description: "A small beginning, made permanent. Let your first moments of focus find their place in the sky.", requirement: "Save 20 minutes of focus in total. Short sessions count too.", colour: STREAK_GOLD, points: [[28, 68], [49, 29], [73, 57]], edges: [[0, 1], [1, 2]], thresholds: [5, 10, 20], metric: "minutes" },
  { id: "sentinel", version: 1, name: "The Sentinel", family: "Practices", story: "A rhythm built one return at a time.", description: "For the days you returned, at your own pace. Your stars stay lit through every pause.", requirement: "Study on 7 different days, with at least 5 minutes each day. They need not be consecutive.", colour: STREAK_GOLD, points: [[65, 19], [43, 23], [28, 40], [25, 61], [41, 78], [64, 79], [76, 61]], edges: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6]], thresholds: [1, 2, 3, 4, 5, 6, 7], metric: "days" },
  { id: "scholar", version: 1, name: "The Scholar", family: "Journeys", story: "Understanding grows in the time you give it.", description: "A record of time devoted to learning. Breaks, distractions and fresh attempts are part of that journey.", requirement: "Build 10 hours of saved focus time. Each 100 minutes forms another star.", colour: STREAK_GOLD, points: [[50, 48], [27, 30], [73, 26], [30, 71], [72, 73], [50, 15]], edges: [[0, 1], [0, 2], [0, 3], [0, 4], [1, 5], [5, 2]], thresholds: [100, 200, 300, 400, 500, 600], metric: "minutes" },
  { id: "voyager", version: 1, name: "The Voyager", family: "Practices", story: "There is more than one way to find your bearings.", description: "Follow your curiosity across subjects. Each new direction leaves a light behind.", requirement: "Save at least 15 focus minutes in each of 3 different subjects. There is no deadline.", colour: STREAK_GOLD, points: [[24, 69], [48, 30], [77, 57]], edges: [[0, 1], [1, 2]], thresholds: [1, 2, 3], metric: "subjects" },
  { id: "first-sky", version: 1, name: "Your First Sky", family: "Origins", story: "The sky you were already building.", description: "Your original Arcadia constellation, carried forward. Every star you lit still belongs here.", requirement: "Complete the original 16-session sky. Your earlier sessions are included.", colour: STREAK_GOLD, points: [[14, 62], [19, 38], [29, 53], [34, 22], [42, 45], [49, 29], [56, 48], [64, 20], [73, 37], [83, 59], [69, 65], [56, 76], [43, 67], [34, 81], [24, 70], [16, 82]], edges: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6], [6, 7], [7, 8], [8, 9], [9, 10], [10, 11], [11, 12], [12, 13], [13, 14], [14, 15]], thresholds: Array.from({ length: 16 }, (_, i) => i + 1), metric: "sessions", legacy: true },
  ...atlasCards(),
];

/**
 * The 88 constellations form in order along one long run of focus: each star
 * is one classic 25-minute focus, and a card starts where the last one ended.
 */
function atlasCards(): ConstellationDefinition[] {
  let minutes = 0;
  return ATLAS.map((entry, order) => {
    const art = CONSTELLATION_ART[entry.abbr];
    const previous = ATLAS[order - 1];
    const thresholds = art.points.map(() => (minutes += MINUTES_PER_STAR));
    return {
      id: entry.id, version: 1, name: entry.name, family: entry.family, story: entry.meaning, description: entry.description,
      requirement: previous
        ? `Forms after ${previous.name}, in ${art.points.length} stars. Each star is another ${MINUTES_PER_STAR} minutes of focus.`
        : `The first of the 88 constellations, in ${art.points.length} stars. Each star is ${MINUTES_PER_STAR} minutes of focus.`,
      colour: STREAK_GOLD, points: art.points, edges: art.edges, mags: art.mags, thresholds, metric: "minutes",
      atlas: { abbr: entry.abbr, brightest: entry.brightest, charted: entry.charted, areaPercent: entry.areaPercent, hemisphere: entry.hemisphere, bestMonth: entry.bestMonth, order },
    };
  });
}

const BY_ID = new Map(CONSTELLATIONS.map((item) => [item.id, item]));
export function constellationById(id: string | null | undefined) {
  return id ? BY_ID.get(id) : undefined;
}

/** Focus time the way the app shows it: 50 min, 2 hr, 3h 45m. */
export function focusTime(minutes: number) {
  if (minutes < 60) return `${minutes} min`;
  const rest = minutes % 60;
  return rest ? `${Math.floor(minutes / 60)}h ${rest}m` : `${minutes / 60} hr`;
}

export function milestoneLabel(definition: ConstellationDefinition, index: number) {
  const value = definition.thresholds[index];
  if (definition.atlas) return `${focusTime(value)} of focus in total`;
  if (definition.metric === "minutes") return `${value} minutes of focus`;
  if (definition.metric === "days") return `${value} study ${value === 1 ? "day" : "days"}`;
  if (definition.metric === "subjects") return `${value} ${value === 1 ? "subject" : "subjects"} explored`;
  return `${value} focus ${value === 1 ? "session" : "sessions"}`;
}

export interface SkyMilestone { index: number; earnedAt: number | null }
export interface SkyCard {
  id: ConstellationId;
  value: number;
  milestones: SkyMilestone[];
  earnedAt: number | null;
  addedAt: number | null;
  seen: boolean;
}
export interface SkyPreferences {
  followed: ConstellationId;
  featured: ConstellationId | null;
  backdrop: ConstellationId | null;
  showcase: ConstellationId[];
  favourites: ConstellationId[];
  ambientMotion: boolean;
}
export interface StudySkyResponse { cards: SkyCard[]; preferences: SkyPreferences }

export interface SkySession {
  id: string;
  type: string;
  seconds: number;
  subject: string | null;
  subjectKey?: string | null;
  localDay?: string | null;
  endedAt: number;
}

/** Pure replay of recorded activity. Stored milestones are merged separately. */
export function evaluateSky(sessions: SkySession[], timezone: string, legacy: boolean): SkyCard[] {
  let formatter: Intl.DateTimeFormat;
  try { formatter = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }); }
  catch { formatter = new Intl.DateTimeFormat("en-CA", { timeZone: "Australia/Sydney", year: "numeric", month: "2-digit", day: "2-digit" }); }
  const definitions = CONSTELLATIONS.filter((item) => !item.legacy || legacy);
  const cards: SkyCard[] = definitions.map((item) => ({ id: item.id, value: 0, milestones: item.thresholds.map((_, index) => ({ index, earnedAt: null })), earnedAt: null, addedAt: null, seen: false }));
  const days = new Map<string, number>();
  const subjects = new Map<string, number>();
  const seen = new Set<string>();
  const next = definitions.map(() => 0);
  let seconds = 0;
  let count = 0;
  for (const session of [...sessions].sort((a, b) => a.endedAt - b.endedAt || a.id.localeCompare(b.id))) {
    if (seen.has(session.id) || session.type === "break" || !Number.isFinite(session.seconds) || session.seconds <= 0 || !Number.isFinite(session.endedAt)) continue;
    seen.add(session.id);
    seconds += session.seconds;
    count++;
    const day = session.localDay || formatter.format(new Date(session.endedAt));
    days.set(day, (days.get(day) || 0) + session.seconds);
    const subject = session.subjectKey || session.subject?.trim().toLocaleLowerCase("en-AU");
    if (subject) subjects.set(subject, (subjects.get(subject) || 0) + session.seconds);
    const values = { minutes: Math.floor(seconds / 60), days: [...days.values()].filter((value) => value >= 300).length, subjects: [...subjects.values()].filter((value) => value >= 900).length, sessions: count };
    definitions.forEach((definition, i) => {
      const card = cards[i];
      card.value = values[definition.metric];
      // Thresholds rise, so each card only needs to watch its next star.
      while (next[i] < definition.thresholds.length && card.value >= definition.thresholds[next[i]]) card.milestones[next[i]++].earnedAt = session.endedAt;
      if (card.earnedAt === null && next[i] === definition.thresholds.length) card.earnedAt = session.endedAt;
    });
  }
  return cards;
}
