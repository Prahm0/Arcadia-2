import { api } from "@/lib/api/client";

export interface PendingStudySession {
  activityId: string;
  type: string;
  seconds: number;
  subject: string;
  goal: string;
  distractions: number;
  endedAt: string;
}
const memory = new Map<string, PendingStudySession[]>();
const inFlight = new Map<string, Promise<void>>();
const key = (userId: string) => `arcadia:pending-study:${userId}`;
export function pendingStudySessions(userId: string): PendingStudySession[] {
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(key(userId)) || "[]");
    const rows = Array.isArray(stored) ? stored.filter((item): item is PendingStudySession => item && typeof item.activityId === "string" && Number.isFinite(item.seconds)) : [];
    return [...new Map([...rows, ...(memory.get(userId) || [])].map((item) => [item.activityId, item])).values()];
  } catch { return memory.get(userId) || []; }
}
function write(userId: string, sessions: PendingStudySession[]) {
  memory.set(userId, sessions);
  try { localStorage.setItem(key(userId), JSON.stringify(sessions)); } catch { /* Retry in memory when storage is blocked. */ }
}
export function queueStudySession(userId: string, session: PendingStudySession) {
  const existing = pendingStudySessions(userId);
  if (!existing.some((item) => item.activityId === session.activityId)) write(userId, [...existing, session]);
}
export function flushStudySessions(userId: string): Promise<void> {
  const active = inFlight.get(userId);
  if (active) return active;
  const job = (async () => {
    while (true) {
      const batch = pendingStudySessions(userId).slice(0, 100);
      if (!batch.length) return;
      const result = await api<{ acceptedActivityIds: string[] }>("/api/study-sessions", { method: "POST", body: JSON.stringify(batch) });
      const sent = new Set(result.acceptedActivityIds || []);
      write(userId, pendingStudySessions(userId).filter((item) => !sent.has(item.activityId)));
      if (batch.some((item) => !sent.has(item.activityId))) throw new Error("Some sessions could not be saved. Check your device’s date and time before retrying.");
    }
  })().finally(() => inFlight.delete(userId));
  inFlight.set(userId, job);
  return job;
}
