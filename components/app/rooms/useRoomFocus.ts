"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { setPresence } from "@/lib/api/presence";
import { useStudySessionSave } from "@/lib/app/useStudySessionSave";

/**
 * A focus session started from inside a study room. Deliberately simpler than
 * the Sessions page's timer: one block of focus, no breaks, finished by hand or
 * when the clock runs out. It publishes presence the same way, so every room
 * sees it, and it logs to the same study sessions, so streaks and cards count it.
 */

const STORAGE_KEY = "arcadia:room-focus:";
// The server treats a timer quiet for 150s as gone; one missed beat is fine.
const KEEPALIVE_MS = 60_000;
// Misclicks and instant finishes stay out of the log, as on the Sessions page.
const MIN_LOGGED_SECONDS = 30;

export interface RoomFocusSession {
  startedAt: number;
  endsAt: number;
  subject: string;
  topic: string | null;
  /** The planned study block this session is for, if any. */
  eventId: string | null;
  /** Set when this session joined someone else's. */
  groupHostId: string | null;
  activityId: string;
}

export interface StartFocus {
  minutes: number;
  subject: string;
  topic?: string | null;
  eventId?: string | null;
  /** Joining a session: start and end with theirs. */
  join?: { hostId: string; startedAt: number; endsAt: number };
}

export interface FinishedFocus {
  seconds: number;
  subject: string;
  eventId: string | null;
  /** True when the clock ran out rather than being stopped early. */
  complete: boolean;
}

function read(userId: string): RoomFocusSession | null {
  try {
    const value = JSON.parse(window.localStorage.getItem(STORAGE_KEY + userId) ?? "null") as RoomFocusSession | null;
    if (!value || typeof value.startedAt !== "number" || typeof value.endsAt !== "number" || !value.activityId) return null;
    return value;
  } catch {
    return null;
  }
}

function write(userId: string, session: RoomFocusSession | null) {
  try {
    if (session) window.localStorage.setItem(STORAGE_KEY + userId, JSON.stringify(session));
    else window.localStorage.removeItem(STORAGE_KEY + userId);
  } catch {
    /* the session still runs for this visit */
  }
}

function publish(session: RoomFocusSession | null) {
  if (!session) {
    setPresence({ activity: "idle" });
    return;
  }
  setPresence({
    activity: "focus",
    subject: session.subject,
    startedAt: new Date(session.startedAt).toISOString(),
    durationSeconds: Math.round((session.endsAt - session.startedAt) / 1000),
    groupHostId: session.groupHostId,
  });
}

export function useRoomFocus(userId: string, onFinished?: (finished: FinishedFocus) => void) {
  const studySave = useStudySessionSave(userId);
  const [session, setSession] = useState<RoomFocusSession | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const sessionRef = useRef<RoomFocusSession | null>(null);
  const finishedRef = useRef(onFinished);
  useEffect(() => {
    finishedRef.current = onFinished;
  });

  const commit = useCallback((next: RoomFocusSession | null) => {
    sessionRef.current = next;
    setSession(next);
    write(userId, next);
  }, [userId]);

  // Pick up a session that was running when the page was left or reloaded.
  useEffect(() => {
    const saved = read(userId);
    const restore = window.setTimeout(() => {
      if (saved) {
        sessionRef.current = saved;
        setSession(saved);
      }
    }, 0);
    return () => window.clearTimeout(restore);
  }, [userId]);

  const { save } = studySave;
  const end = useCallback(async (complete: boolean) => {
    const current = sessionRef.current;
    if (!current) return;
    const endedAt = Math.min(Date.now(), current.endsAt);
    // A joined session only counts the time you were actually in it.
    const seconds = Math.max(0, Math.round((endedAt - current.startedAt) / 1000));
    commit(null);
    publish(null);
    finishedRef.current?.({ seconds, subject: current.subject, eventId: current.eventId, complete });
    if (seconds >= MIN_LOGGED_SECONDS) {
      await save({
        activityId: current.activityId,
        type: "focus",
        seconds,
        subject: current.subject,
        goal: current.topic ?? "",
        distractions: 0,
        endedAt: new Date(endedAt).toISOString(),
      });
    }
  }, [commit, save]);
  const endRef = useRef(end);
  useEffect(() => {
    endRef.current = end;
  });

  // Tick while running, and end on time. Counted against the wall clock, so a
  // throttled background tab doesn't fall behind.
  useEffect(() => {
    if (!session) return;
    const tick = () => {
      const at = Date.now();
      setNow(at);
      if (at >= session.endsAt) void endRef.current(true);
    };
    const first = window.setTimeout(tick, 0);
    const id = window.setInterval(tick, 500);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(id);
    };
  }, [session]);

  // Presence: on start, then a keepalive. Leaving the page reads as idle
  // (as it does on the Sessions page); coming back picks the session up again.
  useEffect(() => {
    if (!session) return;
    publish(session);
    const id = window.setInterval(() => publish(sessionRef.current), KEEPALIVE_MS);
    return () => window.clearInterval(id);
  }, [session]);
  useEffect(() => () => {
    if (sessionRef.current) publish(null);
  }, []);

  const start = useCallback((options: StartFocus) => {
    const startedAt = Date.now();
    const next: RoomFocusSession = options.join
      ? {
          startedAt,
          endsAt: options.join.endsAt,
          subject: options.subject,
          topic: options.topic ?? null,
          eventId: null,
          groupHostId: options.join.hostId,
          activityId: crypto.randomUUID(),
        }
      : {
          startedAt,
          endsAt: startedAt + options.minutes * 60_000,
          subject: options.subject,
          topic: options.topic ?? null,
          eventId: options.eventId ?? null,
          groupHostId: null,
          activityId: crypto.randomUUID(),
        };
    setNow(startedAt);
    commit(next);
    return next;
  }, [commit]);

  const elapsed = session ? Math.max(0, Math.floor((now - session.startedAt) / 1000)) : 0;
  const remaining = session ? Math.max(0, Math.ceil((session.endsAt - now) / 1000)) : 0;
  const total = session ? Math.round((session.endsAt - session.startedAt) / 1000) : 0;

  return {
    session,
    elapsed,
    remaining,
    total,
    start,
    finish: () => end(false),
    save: studySave,
  };
}
