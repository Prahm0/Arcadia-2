"use client";

import { ApiError } from "@/lib/api/client";
import type { SubjectFile } from "@/lib/api/profile";

export const MATERIAL_ACCEPT = "application/pdf,image/png,image/jpeg,image/webp,text/plain,text/markdown,.md,.txt";
export const MATERIAL_MAX_BYTES = 8 * 1024 * 1024;

export interface UploadResult {
  file: SubjectFile;
  read: boolean;
  topics: number;
  assessments: number;
  message?: string;
}

/**
 * Sends a syllabus or resource for Arcad to read. The file goes as the raw
 * request body (filename in the query), so it can't use the JSON `api`
 * helper.
 */
export async function uploadMaterial(
  subjectId: string,
  file: File,
  kind: "syllabus" | "resource",
): Promise<UploadResult> {
  if (file.size > MATERIAL_MAX_BYTES) throw new Error("Keep it under 8 MB.");
  const params = new URLSearchParams({ kind, filename: file.name });
  const headers = new Headers({ "content-type": file.type || "application/octet-stream" });
  try {
    const csrf = window.localStorage.getItem("arcadia:csrf");
    if (csrf) headers.set("x-csrf-token", csrf);
  } catch {
    /* storage blocked; the server will say so */
  }
  const response = await fetch(`/api/subjects/${encodeURIComponent(subjectId)}/files?${params}`, {
    method: "POST",
    body: file,
    headers,
    credentials: "same-origin",
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      data && typeof data === "object" && "error" in data ? String((data as { error: unknown }).error) : `Upload failed (${response.status})`;
    throw new ApiError(message, response.status, data);
  }
  return data as UploadResult;
}

/** "6 Oct", "6–17 Oct", "28 Sep – 9 Oct". */
export function formatDateSpan(start: string | null, end: string | null): string {
  if (!start) return "No date";
  const format = (value: string, withMonth = true) =>
    new Intl.DateTimeFormat("en-AU", { day: "numeric", ...(withMonth ? { month: "short" } : {}), timeZone: "UTC" }).format(
      new Date(`${value}T00:00:00Z`),
    );
  if (!end || end === start) return format(start);
  return start.slice(0, 7) === end.slice(0, 7) ? `${format(start, false)}–${format(end)}` : `${format(start)} – ${format(end)}`;
}
