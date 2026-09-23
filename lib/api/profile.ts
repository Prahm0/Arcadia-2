"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api/client";

export interface SubjectFile {
  id: string;
  kind: "syllabus" | "resource";
  filename: string;
  contentType: string;
  bytes: number;
  /** What Arcad took from it. */
  summary: string;
  /** False when Arcad couldn't read it. */
  read: boolean;
  /** Whether Arcadia kept the original (only once file storage is on). */
  stored: boolean;
  createdAt: string;
}

export interface SubjectTopic {
  id: string;
  title: string;
  detail: string;
  /** YYYY-MM-DD */
  startsOn: string | null;
  endsOn: string | null;
  source: string;
}

export type AssessmentKind = "exam" | "assignment" | "test" | "prac" | "other";

export interface SubjectAssessment {
  id: string;
  title: string;
  kind: AssessmentKind;
  dueOn: string | null;
  /** As the document put it, e.g. "Term 3, Week 8". */
  dueLabel: string;
  weight: string;
  /** Set once it's been added to deadlines. */
  taskId: string | null;
  source: string;
}

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
  syllabus: SubjectFile | null;
  resources: SubjectFile[];
  topics: SubjectTopic[];
  assessments: SubjectAssessment[];
  currentTopic: (SubjectTopic & { upcoming: boolean }) | null;
  nextAssessment: SubjectAssessment | null;
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
    /** ISO 3166 alpha-2, e.g. "AU". */
    country: string | null;
    /** Australian state; null elsewhere. */
    state: string | null;
    school: string | null;
    avatarColour: string | null;
    atarTarget: number | null;
    timezone: string;
    joinedAt: string;
    /** A developer test account: gold avatar ring and a Developer tag. */
    developerAccess?: boolean;
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
  country: string | null;
  state: string | null;
  school: string | null;
  avatarColour: string | null;
  atarTarget: number | null;
  arcadAbout: string;
  arcadStyle: string;
  memoryEnabled: boolean;
}> &
  Partial<ProfileRoutine>;

export { AU_STATES } from "@/lib/app/countries";

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
