import { registerPlugin } from "@capacitor/core";
import { isNativeIOS } from "./platform";

/**
 * Apple's rating sheet (ios/App/App/RatingPromptPlugin.swift), asked for
 * after a good moment rather than on a timer. A student qualifies once they
 * have ticked off a few things over a few days; after one ask we wait months
 * before the next. iOS itself shows the sheet at most three times a year, so
 * this only picks the moment. No-op on the web and in builds from before the
 * plugin existed (the call rejects and is ignored).
 */

interface RatingPromptPlugin {
  requestReview(): Promise<{ requested: boolean }>;
}

const RatingPrompt = registerPlugin<RatingPromptPlugin>("RatingPrompt");

const KEY = "arcadia:rating-prompt";
const DAY = 86_400_000;
/** Things completed before the first ask. */
const WINS_BEFORE_ASKING = 5;
/** Days since the first completed thing before the first ask. */
const DAYS_BEFORE_ASKING = 3;
/** Days between asks. */
const DAYS_BETWEEN_ASKS = 120;
/** Let the completion tick and animation finish before the sheet appears. */
const ASK_DELAY_MS = 1500;

interface RatingState {
  firstWinAt: number;
  wins: number;
  askedAt: number | null;
}

function read(now: number): RatingState {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw) as RatingState;
  } catch {
    /* storage unavailable or corrupt: start over */
  }
  return { firstWinAt: now, wins: 0, askedAt: null };
}

function write(state: RatingState) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* ignore */
  }
}

/** Call when a student finishes something (a study block, a task). */
export function noteWin(): void {
  if (typeof window === "undefined" || !isNativeIOS()) return;
  const now = Date.now();
  const state = read(now);
  state.wins += 1;
  const due =
    state.wins >= WINS_BEFORE_ASKING &&
    now - state.firstWinAt >= DAYS_BEFORE_ASKING * DAY &&
    (state.askedAt === null || now - state.askedAt >= DAYS_BETWEEN_ASKS * DAY);
  if (due) state.askedAt = now;
  write(state);
  if (!due) return;
  window.setTimeout(() => {
    RatingPrompt.requestReview().catch(() => {
      /* older build without the plugin, or no active window */
    });
  }, ASK_DELAY_MS);
}
