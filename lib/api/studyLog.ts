import { api } from "./client";
import type { Confidence } from "@/shared/studyLog";

/** A syllabus topic as the Sessions topic picker shows it. */
export interface LoggedTopic {
  id: string;
  title: string;
  /** Taught already (its start date has passed). */
  taught: boolean;
  /** The last confidence they gave on it, if any. */
  confidence: Confidence | null;
  minutes: number;
  lastAt: string | null;
}

export interface SubjectTopics {
  subjectId: string | null;
  currentTopicId: string | null;
  topics: LoggedTopic[];
}

export function fetchSubjectTopics(subject: string): Promise<SubjectTopics> {
  return api<SubjectTopics>(`/api/study-log/topics?subject=${encodeURIComponent(subject)}`);
}

/** How a free timer session's topic is sitting, once it's been logged. */
export function rateTimerSession(activityId: string, confidence: Confidence): Promise<{ ok: true }> {
  return api<{ ok: true }>("/api/study-log/rate", {
    method: "POST",
    body: JSON.stringify({ activityId, confidence }),
  });
}
