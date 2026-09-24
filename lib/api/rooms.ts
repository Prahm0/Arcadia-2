import { api } from "@/lib/api/client";
import type { CheerKind } from "@/shared/roomFeed";

export type RoomActivity = "idle" | "focus" | "break";

export interface StudyRoom {
  id: string;
  code: string;
  name: string;
  description: string;
  colour: string;
  icon: string;
  weeklyGoalMinutes: number | null;
  dailyGoalMinutes?: number | null;
  ownerUserId: string;
  createdAt: string;
  joinedAt?: string;
  memberCount: number;
  capacity: number;
  studyingCount: number;
  todaySeconds?: number;
  weekSeconds?: number;
  weekActivity?: Array<{ day: string; seconds: number; sessions: number }>;
  /** The viewer's school term for the leaderboard, or the past 30 days. */
  term?: { label: string; since: string };
}

/**
 * A member's live state comes from their focus timer (see lib/api/presence),
 * not from anything they set in the room. The server already downgrades a
 * quiet timer to "idle", so the client can trust `activity` as-is.
 */
export interface StudyRoomMember {
  userId: string;
  displayName: string;
  joinedAt: string;
  activity: RoomActivity;
  subject: string | null;
  startedAt: string | null;
  durationSeconds: number | null;
  updatedAt: string | null;
  /** Whose session this member joined, while both are focusing. */
  groupHostId?: string | null;
  /** Logged focus time in the member's own local "today". */
  todaySeconds: number;
  weekSeconds: number;
  termSeconds?: number;
  totalSeconds?: number;
  avatarColour?: string | null;
  developerAccess?: boolean;
  /** The streak card they show off, and how many they've collected. */
  constellation?: { id: string; cards: number } | null;
  /** Cheers received since this focus session started. */
  sessionCheers?: number;
}

export type RoomFeedItem =
  | { type: "session"; id: string; at: string; userId: string; seconds: number; cheers: number }
  | { type: "start"; id: string; at: string; userId: string; subject: string | null }
  | { type: "group"; id: string; at: string; hostId: string; userIds: string[] }
  | { type: "cheer"; id: string; at: string; fromUserId: string; toUserId: string; kind: CheerKind }
  | { type: "join"; id: string; at: string; userId: string }
  | { type: "rank"; id: string; at: string; userId: string; rank: number }
  | { type: "milestone"; id: string; at: string; hours: number }
  | { type: "goal"; id: string; at: string };

export interface RoomCheers {
  /** Cheers sent to you in the last few minutes, newest first. */
  received: Array<{ id: string; fromUserId: string; kind: CheerKind; createdAt: string }>;
  /** When you can next cheer each person, by user id. */
  cooldowns: Record<string, string>;
}

/** What someone who isn't in the room yet gets back, enough to say "Join X?". */
export interface RoomPreview {
  code: string;
  name: string;
  description: string;
  colour: string;
  icon: string;
  weeklyGoalMinutes: number | null;
  memberCount: number;
  capacity: number;
}

export interface RoomMessage {
  id: string;
  userId: string;
  displayName: string;
  body: string;
  createdAt: string;
}

export interface RoomMemberProfile {
  userId: string;
  displayName: string;
  avatarColour: string | null;
  developerAccess?: boolean;
  joinedAt: string;
  weekSeconds: number;
  totalSeconds: number;
  sessions: number;
}

export interface BlockedRoomPerson {
  userId: string;
  displayName: string;
  blockedAt: string;
}

export type RoomReportReason = "bullying_harassment" | "hateful_sexual" | "spam" | "other";

export type RoomDashboard =
  | {
      isMember: true;
      room: StudyRoom;
      members: StudyRoomMember[];
      removedMembers: Array<{ userId: string; displayName: string; removedAt: string }>;
      feed?: RoomFeedItem[];
      cheers?: RoomCheers;
    }
  | { isMember: false; room: RoomPreview; members: [] };

/** Returns when you can next cheer them. */
export async function sendCheer(code: string, toUserId: string, kind: CheerKind): Promise<{ retryAt: string }> {
  return api<{ ok: boolean; retryAt: string }>(`/api/study-rooms/${encodeURIComponent(code)}/cheers`, {
    method: "POST",
    body: JSON.stringify({ toUserId, kind }),
  });
}

export async function listRooms(): Promise<StudyRoom[]> {
  const response = await api<{ rooms: StudyRoom[] }>("/api/study-rooms");
  return response.rooms ?? [];
}

export async function createRoom(name: string, description = "", colour = "slate", displayName?: string): Promise<StudyRoom> {
  const response = await api<{ room: StudyRoom }>("/api/study-rooms", {
    method: "POST",
    body: JSON.stringify({ name, description, colour, displayName }),
  });
  return response.room;
}

export async function updateRoom(code: string, patch: { name: string; description: string; colour: string; icon?: string; weeklyGoalMinutes?: number | null; dailyGoalMinutes?: number | null }): Promise<RoomDashboard> {
  return api<RoomDashboard>(`/api/study-rooms/${encodeURIComponent(code)}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}

export async function listRoomMessages(code: string): Promise<RoomMessage[]> {
  const response = await api<{ messages: RoomMessage[] }>(`/api/study-rooms/${encodeURIComponent(code)}/messages`);
  return response.messages;
}

export async function sendRoomMessage(code: string, body: string): Promise<RoomMessage> {
  const response = await api<{ message: RoomMessage }>(`/api/study-rooms/${encodeURIComponent(code)}/messages`, {
    method: "POST",
    body: JSON.stringify({ body }),
  });
  return response.message;
}

export async function deleteRoomMessage(code: string, messageId: string): Promise<void> {
  await api(`/api/study-rooms/${encodeURIComponent(code)}/messages/${encodeURIComponent(messageId)}`, { method: "DELETE" });
}

export async function reportRoomMessage(code: string, messageId: string, reason: RoomReportReason, note: string): Promise<{ message: string }> {
  return api<{ message: string }>(`/api/study-rooms/${encodeURIComponent(code)}/messages/${encodeURIComponent(messageId)}/report`, {
    method: "POST",
    body: JSON.stringify({ reason, note }),
  });
}

export async function blockRoomMember(code: string, memberId: string): Promise<void> {
  await api(`/api/study-rooms/${encodeURIComponent(code)}/members/${encodeURIComponent(memberId)}/block`, { method: "POST" });
}

export async function removeRoomMember(code: string, memberId: string): Promise<void> {
  await api(`/api/study-rooms/${encodeURIComponent(code)}/members/${encodeURIComponent(memberId)}/remove`, { method: "POST" });
}

export async function allowRoomMember(code: string, memberId: string): Promise<void> {
  await api(`/api/study-rooms/${encodeURIComponent(code)}/members/${encodeURIComponent(memberId)}/removal`, { method: "DELETE" });
}

export async function listBlockedRoomPeople(): Promise<BlockedRoomPerson[]> {
  const response = await api<{ people: BlockedRoomPerson[] }>("/api/study-rooms/blocked");
  return response.people;
}

export async function unblockRoomPerson(userId: string): Promise<void> {
  await api(`/api/study-rooms/blocked/${encodeURIComponent(userId)}`, { method: "DELETE" });
}

export async function getRoomMemberProfile(code: string, memberId: string): Promise<RoomMemberProfile> {
  const response = await api<{ profile: RoomMemberProfile }>(`/api/study-rooms/${encodeURIComponent(code)}/members/${encodeURIComponent(memberId)}`);
  return response.profile;
}

export async function getRoom(code: string): Promise<RoomDashboard> {
  return api<RoomDashboard>(`/api/study-rooms/${encodeURIComponent(code)}`);
}

export async function joinRoom(code: string, displayName?: string): Promise<RoomDashboard> {
  return api<RoomDashboard>(`/api/study-rooms/${encodeURIComponent(code)}/join`, {
    method: "POST",
    body: JSON.stringify({ displayName }),
  });
}

export async function leaveRoom(code: string) {
  return api<{ ok: boolean }>(`/api/study-rooms/${encodeURIComponent(code)}/leave`, {
    method: "POST",
  });
}
