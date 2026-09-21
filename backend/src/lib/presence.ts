import { MINUTE } from "./time";

export type Activity = "idle" | "focus" | "break";

export const ACTIVITIES: readonly Activity[] = ["idle", "focus", "break"];

/**
 * The focus timer sends a keepalive every minute while it runs. A focus or
 * break row that has gone quiet for longer than this is a closed tab or a
 * sleeping laptop, so it reads as idle — no cleanup job needed.
 */
export const PRESENCE_STALE_MS = 150_000;

export interface PresenceRow {
  activity: string;
  subject: string | null;
  startedAt: number | null;
  durationSeconds: number | null;
  updatedAt: number;
}

export interface LivePresence {
  activity: Activity;
  subject: string | null;
  startedAt: number | null;
  durationSeconds: number | null;
  updatedAt: number | null;
}

/** What a presence row means right now, with staleness applied. */
export function livePresence(row: PresenceRow | null | undefined, now: number): LivePresence {
  if (!row) {
    return { activity: "idle", subject: null, startedAt: null, durationSeconds: null, updatedAt: null };
  }
  const activity = (ACTIVITIES as readonly string[]).includes(row.activity)
    ? (row.activity as Activity)
    : "idle";
  const stale = activity !== "idle" && now - row.updatedAt > PRESENCE_STALE_MS;
  // A phase that should have ended long ago is also over, even if the row is
  // fresh (e.g. a paused timer left open): allow a few minutes of slack.
  const overrun =
    activity !== "idle" &&
    row.startedAt !== null &&
    row.durationSeconds !== null &&
    now > row.startedAt + row.durationSeconds * 1000 + 5 * MINUTE;
  if (stale || overrun) {
    return { activity: "idle", subject: row.subject, startedAt: null, durationSeconds: null, updatedAt: row.updatedAt };
  }
  return {
    activity,
    subject: row.subject,
    startedAt: activity === "idle" ? null : row.startedAt,
    durationSeconds: activity === "idle" ? null : row.durationSeconds,
    updatedAt: row.updatedAt,
  };
}
