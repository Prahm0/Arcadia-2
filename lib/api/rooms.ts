import { api } from "@/lib/api/client";

export type RoomActivity = "idle" | "focus" | "break";

export interface StudyRoom {
  id: string;
  code: string;
  name: string;
  description: string;
  colour: string;
  icon: string;
  weeklyGoalMinutes: number | null;
  ownerUserId: string;
  createdAt: string;
  joinedAt?: string;
  memberCount: number;
  capacity: number;
  studyingCount: number;
  todaySeconds?: number;
  weekSeconds?: number;
  weekActivity?: Array<{ day: string; seconds: number; sessions: number }>;
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
  /** Logged focus time in the member's own local "today". */
  todaySeconds: number;
  weekSeconds: number;
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

export type RoomDashboard =
  | { isMember: true; room: StudyRoom; members: StudyRoomMember[] }
  | { isMember: false; room: RoomPreview; members: [] };

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

export async function updateRoom(code: string, patch: { name: string; description: string; colour: string; icon?: string; weeklyGoalMinutes?: number | null }): Promise<RoomDashboard> {
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
