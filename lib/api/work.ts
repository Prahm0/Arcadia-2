import { api } from "./client";
import type { Band, Reason } from "@/shared/mastery";

/** A piece of the student's own work, read in and tagged to dot points. */
export interface WorkItem {
  id: string;
  subjectId: string;
  source: "upload" | "scan";
  filename: string;
  contentType: string;
  pages: number;
  /** unread: Arcad couldn't read it. checked: the check-in's done. */
  status: "read" | "unread" | "checked";
  transcriptEdited: boolean;
  stored: boolean;
  createdAt: string;
}

export interface WorkTag {
  pointId: string;
  text: string;
  topic: string;
  subtopic: string;
  unit: number;
  /** The rubric score (0, 25, 50, 75, 100); null for a tag the student added. */
  quality: number | null;
  questions: number;
  evidence: string;
  confidence: number | null;
  state: "ai" | "confirmed" | "removed" | "added";
}

export interface WorkUpload {
  item: WorkItem;
  /** attempt = working through questions; notes = class notes or copied examples. */
  kind: "attempt" | "notes" | "other" | null;
  tags: WorkTag[];
}

export interface MasteryPoint {
  id: string;
  unit: number;
  unitTitle: string;
  topic: number;
  topicTitle: string;
  subtopic: string;
  text: string;
  score: number;
  band: Band;
  reason: Reason | null;
  q: number;
  c: number;
  r: number | null;
  e: number;
  decay: number;
  confidence: number | null;
  works: number;
  lastAt: string | null;
  snoozedUntil: string | null;
  coveredElsewhere: boolean;
}

export interface MasteryPriority {
  pointId: string;
  priority: number;
  reason: Reason;
  label: string;
  tip: string;
}

export interface SubjectMastery {
  syllabus: { id: string; name: string } | null;
  /** Set when the subject isn't linked yet but its name suggests a syllabus. */
  suggested: { id: string; name: string } | null;
  points: MasteryPoint[];
  priorities: MasteryPriority[];
}

export interface ResultEntry {
  id: string;
  subjectId: string;
  assessmentId: string | null;
  title: string;
  mark: number;
  maxMark: number;
  takenOn: string;
  pointIds: string[];
}

export function fetchMastery(subjectId: string): Promise<SubjectMastery> {
  return api<SubjectMastery>(`/api/mastery?subject=${encodeURIComponent(subjectId)}`);
}

export function linkSyllabus(subjectId: string, syllabus: string | null): Promise<{ ok: true }> {
  return api<{ ok: true }>(`/api/subjects/${encodeURIComponent(subjectId)}`, {
    method: "PATCH",
    body: JSON.stringify({ syllabus }),
  });
}

export function fetchWork(subjectId: string): Promise<{ items: Array<WorkItem & { points: string[] }> }> {
  return api(`/api/work?subject=${encodeURIComponent(subjectId)}`);
}

export function fetchWorkItem(id: string): Promise<{ item: WorkItem; transcript: string; tags: WorkTag[] }> {
  return api(`/api/work/${encodeURIComponent(id)}`);
}

export function deleteWork(id: string): Promise<{ ok: true }> {
  return api(`/api/work/${encodeURIComponent(id)}`, { method: "DELETE" });
}

export function fixTranscript(id: string, transcript: string): Promise<{ tags: WorkTag[] }> {
  return api(`/api/work/${encodeURIComponent(id)}/transcript`, { method: "PATCH", body: JSON.stringify({ transcript }) });
}

export function checkIn(
  id: string,
  body: { remove: string[]; add: string[]; confidence: number | null },
): Promise<{ tags: WorkTag[]; points: MasteryPoint[] }> {
  return api(`/api/work/${encodeURIComponent(id)}/checkin`, { method: "POST", body: JSON.stringify(body) });
}

export function snoozePoint(
  pointId: string,
  body: { days?: number; covered?: boolean; clear?: boolean },
): Promise<{ ok: true; snoozedUntil: string | null; coveredElsewhere: boolean }> {
  return api(`/api/mastery/${encodeURIComponent(pointId)}/snooze`, { method: "POST", body: JSON.stringify(body) });
}

export function fetchResults(subjectId: string): Promise<{ results: ResultEntry[] }> {
  return api(`/api/results?subject=${encodeURIComponent(subjectId)}`);
}

export function addResult(body: Omit<ResultEntry, "id">): Promise<{ result: ResultEntry }> {
  return api("/api/results", { method: "POST", body: JSON.stringify(body) });
}

export function deleteResult(id: string): Promise<{ ok: true }> {
  return api(`/api/results/${encodeURIComponent(id)}`, { method: "DELETE" });
}
