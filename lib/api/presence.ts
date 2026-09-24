import { api } from "@/lib/api/client";
import type { RoomActivity } from "@/lib/api/rooms";

export interface PresenceState {
  activity: RoomActivity;
  subject?: string | null;
  startedAt?: string | null;
  durationSeconds?: number | null;
  /** The room member whose session this timer joined. */
  groupHostId?: string | null;
}

/**
 * Tell study rooms what this user is doing. One row per user on the server,
 * read by every room they're in. Fire-and-forget: a dropped update is healed
 * by the next keepalive, and the timer must never wait on it.
 */
export function setPresence(state: PresenceState): void {
  void api("/api/presence", { method: "PUT", body: JSON.stringify(state) }).catch(() => {
    /* swallow, rooms are a nicety, the timer is the truth */
  });
}
