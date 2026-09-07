import { api } from "@/lib/api/client";

export interface StudyRoom {
  id: string;
  code: string;
  name: string;
  ownerUserId: string;
  createdAt: string;
  joinedAt?: string;
  lastSeenAt?: string;
}

export interface StudyRoomMember {
  userId: string;
  displayName: string;
  joinedAt: string;
  lastSeenAt: string;
  activity: "idle" | "focus" | "break";
  subject: string | null;
  startedAt: string | null;
  durationSeconds: number | null;
}

export interface RoomState {
  activity: "idle" | "focus" | "break";
  subject?: string | null;
  startedAt?: string | null;
  durationSeconds?: number | null;
}

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

export async function getRoom(code: string): Promise<{ room: StudyRoom; members: StudyRoomMember[] }> {
  return api<{ room: StudyRoom; members: StudyRoomMember[] }>(
    `/api/study-rooms/${encodeURIComponent(code)}`,
  );
}

export async function joinRoom(code: string, displayName?: string) {
  return api<{ room: StudyRoom; members: StudyRoomMember[] }>(
    `/api/study-rooms/${encodeURIComponent(code)}/join`,
    { method: "POST", body: JSON.stringify({ displayName }) },
  );
}

export async function heartbeatRoom(code: string, state: RoomState) {
  return api<{ room: StudyRoom; members: StudyRoomMember[] }>(
    `/api/study-rooms/${encodeURIComponent(code)}/heartbeat`,
    { method: "POST", body: JSON.stringify({ state }) },
  );
}

export async function leaveRoom(code: string) {
  return api<{ ok: boolean }>(
    `/api/study-rooms/${encodeURIComponent(code)}/leave`,
    { method: "POST" },
  );
}
