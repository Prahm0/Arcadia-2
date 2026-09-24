import type { StudyRoomMember } from "@/lib/api/rooms";

/** Seconds on the clock of a member's current focus or break. */
export function elapsedSeconds(member: StudyRoomMember, now: number): number {
  if (member.activity === "idle" || !member.startedAt) return 0;
  return Math.max(0, Math.floor((now - Date.parse(member.startedAt)) / 1000));
}

/** Seconds left in a member's current phase, when their timer has an end. */
export function remainingSeconds(member: StudyRoomMember, now: number): number | null {
  if (member.activity === "idle" || !member.startedAt || !member.durationSeconds) return null;
  return Math.max(0, member.durationSeconds - elapsedSeconds(member, now));
}

/** The focus session still on the clock, counted toward every total. */
function liveFocus(member: StudyRoomMember, now: number): number {
  return member.activity === "focus" ? elapsedSeconds(member, now) : 0;
}

export type LeaderboardPeriod = "today" | "week" | "term" | "all";

/** Logged time for the period plus whatever is ticking right now. */
export function periodSeconds(member: StudyRoomMember, period: LeaderboardPeriod, now: number): number {
  const logged =
    period === "today"
      ? member.todaySeconds
      : period === "week"
        ? member.weekSeconds
        : period === "term"
          ? member.termSeconds ?? member.weekSeconds
          : member.totalSeconds ?? member.weekSeconds;
  return logged + liveFocus(member, now);
}

/** 32:14, or 1:02:09 once past an hour. */
export function formatClock(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const mm = String(m).padStart(h > 0 ? 2 : 1, "0");
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

/** 52m, 3h, 6h 42m. */
export function formatDuration(totalSeconds: number): string {
  const totalMin = Math.floor(totalSeconds / 60);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

/** Hours only, for headline totals: 31h, or 45m under an hour. */
export function formatHours(totalSeconds: number): string {
  return totalSeconds < 3600 ? formatDuration(totalSeconds) : `${Math.floor(totalSeconds / 3600)}h`;
}

/** "just now", "4m ago", "2h ago", "Tue". */
export function timeAgo(at: string, now: number): string {
  const minutes = Math.floor((now - Date.parse(at)) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return new Date(at).toLocaleDateString([], { weekday: "short" });
}

/** "Josh", "Josh and Parham", "Josh, Parham and Layla". */
export function listNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] || name;
}

/** Live first, then breaks, then whoever has done the most today. */
const ACTIVITY_ORDER = { focus: 0, break: 1, idle: 2 } as const;
export function byActivity(now: number) {
  return (a: StudyRoomMember, b: StudyRoomMember) =>
    ACTIVITY_ORDER[a.activity] - ACTIVITY_ORDER[b.activity] ||
    periodSeconds(b, "today", now) - periodSeconds(a, "today", now);
}
