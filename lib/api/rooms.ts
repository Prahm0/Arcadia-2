import { api } from "@/lib/api/client";

export type RoomActivity = "idle" | "focus" | "break";

export interface StudyRoom {
  id: string;
  code: string;
  name: string;
  ownerUserId: string;
  createdAt: string;
  joinedAt?: string;
  memberCount: number;
  studyingCount: number;
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
}

/** What someone who isn't in the room yet gets back, enough to say "Join X?". */
export interface RoomPreview {
  code: string;
  name: string;
  memberCount: number;
}

export type RoomDashboard =
  | { isMember: true; room: StudyRoom; members: StudyRoomMember[] }
  | { isMember: false; room: RoomPreview; members: [] };

export async function listRooms(): Promise<StudyRoom[]> {
  const response = await api<{ rooms: StudyRoom[] }>("/api/study-rooms");
  return response.rooms ?? [];
}

export async function createRoom(name: string, displayName?: string): Promise<StudyRoom> {
  const response = await api<{ room: StudyRoom }>("/api/study-rooms", {
    method: "POST",
    body: JSON.stringify({ name, displayName }),
  });
  return response.room;
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
