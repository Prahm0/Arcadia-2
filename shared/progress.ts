export const XP = {
  studyBlock: 20,
  focusMinute: 1,
  focusDailyCap: 120,
  /** Small, capped bonus for an honest high-quality focus reflection. */
  lockInDailyCap: 20,
  recovery: 10,
  ringClosed: 25,
  /** Ticking one of your own lines on Today, up to lineDailyCap a day. */
  line: 10,
  lineDailyCap: 100,
} as const;

/** A small quality bonus that never replaces the XP earned for real minutes. */
export function lockInBonusXp(score: number): number {
  return Number.isInteger(score) && score >= 7 && score <= 10 ? (score - 6) * 2 : 0;
}

/** A day stays on track after 70% of its planned study is completed. */
export const CONSISTENCY_THRESHOLD = 0.7;

export function levelForXp(xp: number) {
  const safe = Math.max(0, xp);
  const level = Math.floor(Math.sqrt(safe / 35)) + 1;
  const start = 35 * (level - 1) ** 2;
  const next = 35 * level ** 2;
  return { level, title: levelTitle(level), progress: safe - start, needed: next - start };
}

export function levelTitle(level: number) {
  if (level < 3) return "Stargazer";
  if (level < 6) return "Navigator";
  if (level < 10) return "Astronomer";
  if (level < 16) return "Skykeeper";
  return "Constellation Maker";
}

/** Cosmetic previews only. They never gate study tools or subscriptions. */
export function nextLevelUnlock(level: number): string {
  if (level < 3) return "Next up: a new Study with me scene";
  if (level < 6) return "Next up: an Aurora scene";
  if (level < 10) return "Next up: constellation frames";
  return "Keep lighting your sky";
}
