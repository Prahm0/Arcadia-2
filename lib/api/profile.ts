"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api/client";

export interface ProfileSubject {
  id: string;
  name: string;
  colour?: string | null;
  weeklyMinutes: number;
  weeklyMinutesSuggested: boolean;
  targetGrade?: string | null;
  notes: string;
  weekDoneMinutes: number;
  weekPlannedMinutes: number;
}

export interface ProfileCommitment {
  id: string;
  title: string;
  category: "school" | "sport" | "extracurricular" | "other";
  recurrence: "none" | "daily" | "weekly" | "weekdays";
  weekday: number | null;
  startDate: string | null;
  startTime: string;
  endTime: string;
  notes: string;
}

export interface ProfileGoal {
  id: string;
  title: string;
  done: boolean;
  createdAt: string;
}

export interface ProfileMemory {
  id: string;
  content: string;
  source: string;
  createdAt: string;
}

export interface ProfileRoutine {
  wakeTime: string;
  bedtime: string;
  maxDailyStudyMinutes: number;
  preferredSessionMinutes: number;
  breakMinutes: number;
}

export interface ProfileResponse {
  profile: {
    name: string;
    email: string;
    grade: string | null;
    state: string | null;
    school: string | null;
    avatarColour: string | null;
    atarTarget: number | null;
    timezone: string;
    joinedAt: string;
  };
  stats: {
    currentStreak: number;
    longestStreak: number;
    totalFocusMinutes: number;
    totalSessions: number;
    weekFocusMinutes: number;
  };
  subjects: ProfileSubject[];
  commitments: ProfileCommitment[];
  goals: ProfileGoal[];
  arcad: {
    about: string;
    style: string;
    memoryEnabled: boolean;
    memories: ProfileMemory[];
  };
  routine: ProfileRoutine;
}

export type ProfilePatch = Partial<{
  name: string;
  grade: string | null;
  state: string | null;
  school: string | null;
  avatarColour: string | null;
  atarTarget: number | null;
  arcadAbout: string;
  arcadStyle: string;
  memoryEnabled: boolean;
}> &
  Partial<ProfileRoutine>;

export const AU_STATES = ["QLD", "NSW", "VIC", "SA", "WA", "TAS", "ACT", "NT"] as const;

export function updateProfile(patch: ProfilePatch): Promise<ProfileResponse> {
  return api<ProfileResponse>("/api/profile", { method: "PATCH", body: JSON.stringify(patch) });
}

type ProfileState =
  | { status: "loading" }
  | { status: "error"; error: string }
  | { status: "ready"; data: ProfileResponse };

/**
 * The profile page's data. Separate from the dashboard payload: it carries
 * things only the profile shows (stats, goals, memories), and it's fetched
 * when the page opens rather than on every app load.
 */
export function useProfile() {
  const [state, setState] = useState<ProfileState>({ status: "loading" });

  const refresh = useCallback(async () => {
    try {
      const data = await api<ProfileResponse>("/api/profile");
      setState({ status: "ready", data });
    } catch (err) {
      setState((prev) =>
        // Keep showing what we had if a background refresh fails.
        prev.status === "ready"
          ? prev
          : { status: "error", error: err instanceof Error ? err.message : "Couldn't load your profile." },
      );
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  /** For writes that answer with the whole profile (PATCH /api/profile). */
  const replace = useCallback((data: ProfileResponse) => setState({ status: "ready", data }), []);

  return { state, refresh, replace };
}
