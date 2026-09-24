/**
 * What a study room shows as its activity: sessions finished, people starting,
 * cheers, joins and the room passing milestones. Built from the same rows the
 * room dashboard already reads, so nothing here is stored twice.
 */

export const CHEER_KINDS = ["clap", "fire", "star", "salute"] as const;
export type CheerKind = (typeof CHEER_KINDS)[number];

export const CHEERS: Record<CheerKind, { emoji: string; label: string }> = {
  clap: { emoji: "👏", label: "Nice" },
  fire: { emoji: "🔥", label: "Keep going" },
  star: { emoji: "⭐", label: "Great work" },
  salute: { emoji: "🫡", label: "Lock in" },
};

/** One cheer per person per few minutes, so a cheer still means something. */
export const CHEER_COOLDOWN_MS = 3 * 60_000;
/** A room-wide cap on how many cheers one person sends in an hour. */
export const CHEERS_PER_HOUR = 30;

/** The room announces every this-many hours of focus in the past 7 days. */
export const MILESTONE_HOURS = 5;

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

export type RoomFeedEvent =
  | { type: "session"; id: string; at: number; userId: string; seconds: number; cheers: number }
  | { type: "start"; id: string; at: number; userId: string; subject: string | null }
  | { type: "group"; id: string; at: number; hostId: string; userIds: string[] }
  | { type: "cheer"; id: string; at: number; fromUserId: string; toUserId: string; kind: CheerKind }
  | { type: "join"; id: string; at: number; userId: string }
  | { type: "rank"; id: string; at: number; userId: string; rank: number }
  | { type: "milestone"; id: string; at: number; hours: number }
  | { type: "goal"; id: string; at: number };

export interface FeedMember {
  userId: string;
  joinedAt: number;
  activity: "idle" | "focus" | "break";
  subject: string | null;
  startedAt: number | null;
  groupHostId: string | null;
}

export interface FeedSession {
  userId: string;
  seconds: number;
  endedAt: number;
}

export interface FeedCheer {
  id: string;
  fromUserId: string;
  toUserId: string;
  kind: string;
  createdAt: number;
}

export function isCheerKind(value: unknown): value is CheerKind {
  return typeof value === "string" && (CHEER_KINDS as readonly string[]).includes(value);
}

/** Cheers someone got during a stretch of focus, with a minute of slack each side. */
export function cheersDuring(cheers: FeedCheer[], userId: string, from: number, to: number): number {
  return cheers.filter((cheer) => cheer.toUserId === userId && cheer.createdAt >= from - 60_000 && cheer.createdAt <= to + 60_000).length;
}

/**
 * Who is focusing together: a host and everyone whose timer joined theirs.
 * A joiner only counts while the host is still focusing.
 */
export function studyGroups(members: FeedMember[]): Map<string, string[]> {
  const focusing = new Set(members.filter((member) => member.activity === "focus").map((member) => member.userId));
  const groups = new Map<string, string[]>();
  for (const member of members) {
    const host = member.groupHostId;
    if (member.activity !== "focus" || !host || !focusing.has(host) || host === member.userId) continue;
    groups.set(host, [...(groups.get(host) ?? []), member.userId]);
  }
  return groups;
}

export function buildRoomFeed({
  members,
  sessions,
  cheers,
  now,
  dayStart,
  dailyGoalSeconds,
  windowMs = 2 * DAY,
  limit = 40,
}: {
  members: FeedMember[];
  /** Focus sessions from the past 7 days, only those since each person joined. */
  sessions: FeedSession[];
  cheers: FeedCheer[];
  now: number;
  /** Start of the viewer's local today, for the daily goal. */
  dayStart: number;
  dailyGoalSeconds: number | null;
  windowMs?: number;
  limit?: number;
}): RoomFeedEvent[] {
  const since = now - windowMs;
  const memberIds = new Set(members.map((member) => member.userId));
  const events: RoomFeedEvent[] = [];
  const sorted = sessions
    .filter((session) => memberIds.has(session.userId) && session.seconds > 0)
    .sort((a, b) => a.endedAt - b.endedAt);

  for (const session of sorted) {
    if (session.endedAt < since || session.seconds < 60) continue;
    events.push({
      type: "session",
      id: `session:${session.userId}:${session.endedAt}`,
      at: session.endedAt,
      userId: session.userId,
      seconds: session.seconds,
      cheers: cheersDuring(cheers, session.userId, session.endedAt - session.seconds * 1000, session.endedAt),
    });
  }

  // Who's on the clock right now: one line per solo session, one per group.
  const groups = studyGroups(members);
  const joiners = new Set([...groups.values()].flat());
  for (const member of members) {
    if (member.activity !== "focus" || member.startedAt === null || joiners.has(member.userId)) continue;
    const joined = groups.get(member.userId);
    if (joined?.length) {
      events.push({ type: "group", id: `group:${member.userId}:${member.startedAt}`, at: member.startedAt, hostId: member.userId, userIds: [member.userId, ...joined] });
    } else {
      events.push({ type: "start", id: `start:${member.userId}:${member.startedAt}`, at: member.startedAt, userId: member.userId, subject: member.subject });
    }
  }

  for (const cheer of cheers) {
    if (cheer.createdAt < since || !memberIds.has(cheer.fromUserId) || !memberIds.has(cheer.toUserId) || !isCheerKind(cheer.kind)) continue;
    events.push({ type: "cheer", id: `cheer:${cheer.id}`, at: cheer.createdAt, fromUserId: cheer.fromUserId, toUserId: cheer.toUserId, kind: cheer.kind });
  }

  for (const member of members) {
    if (member.joinedAt >= since) events.push({ type: "join", id: `join:${member.userId}:${member.joinedAt}`, at: member.joinedAt, userId: member.userId });
  }

  // Replay the past 7 days in order to find the moments the room (or someone
  // in it) crossed a line. Only moments inside the window are shown.
  const weekStart = now - 7 * DAY;
  const totals = new Map<string, number>();
  let roomWeek = 0;
  let roomToday = 0;
  const rankOf = (userId: string) => {
    const mine = totals.get(userId) ?? 0;
    if (mine <= 0) return null;
    return 1 + [...totals.values()].filter((value) => value > mine).length;
  };
  for (const session of sorted) {
    if (session.endedAt < weekStart) continue;
    const before = rankOf(session.userId);
    totals.set(session.userId, (totals.get(session.userId) ?? 0) + session.seconds);
    const after = rankOf(session.userId);
    const ranked = [...totals.values()].filter((value) => value > 0).length;
    const inWindow = session.endedAt >= since;

    if (inWindow && before !== null && after !== null && after < before && after <= 3 && ranked > 1) {
      events.push({ type: "rank", id: `rank:${session.userId}:${session.endedAt}`, at: session.endedAt, userId: session.userId, rank: after });
    }

    const step = MILESTONE_HOURS * HOUR;
    const crossed = Math.floor((roomWeek + session.seconds * 1000) / step);
    if (inWindow && crossed > Math.floor(roomWeek / step)) {
      events.push({ type: "milestone", id: `milestone:${crossed * MILESTONE_HOURS}:${session.endedAt}`, at: session.endedAt, hours: crossed * MILESTONE_HOURS });
    }
    roomWeek += session.seconds * 1000;

    if (session.endedAt >= dayStart) {
      const goal = dailyGoalSeconds ? dailyGoalSeconds * 1000 : null;
      if (goal !== null && roomToday < goal && roomToday + session.seconds * 1000 >= goal) {
        events.push({ type: "goal", id: `goal:${dayStart}`, at: session.endedAt });
      }
      roomToday += session.seconds * 1000;
    }
  }

  return events.sort((a, b) => b.at - a.at || a.id.localeCompare(b.id)).slice(0, limit);
}
