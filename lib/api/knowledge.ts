import { api } from "@/lib/api/client";
import type { SubjectContext, SubjectFile } from "@/lib/api/types";

export async function saveSubjectContext(
  subjectId: string,
  input: { notes: string; includeInArcad: boolean },
): Promise<SubjectContext> {
  const response = await api<{ context: SubjectContext }>(
    `/api/subjects/${encodeURIComponent(subjectId)}/context`,
    { method: "PATCH", body: JSON.stringify(input) },
  );
  return response.context;
}

/**
 * Upload a file to a subject's knowledge base. The backend expects the raw
 * bytes as the request body, filename via query string, and content-type
 * via header — that's why this needs its own helper rather than going
 * through the JSON-oriented `api` wrapper.
 */
export async function uploadSubjectFile(
  subjectId: string,
  file: File,
): Promise<SubjectFile> {
  const params = new URLSearchParams({ filename: file.name });
  const headers = new Headers({
    "content-type": file.type || "application/octet-stream",
  });
  const csrf = typeof window !== "undefined" ? window.localStorage.getItem("arcadia:csrf") : null;
  if (csrf) headers.set("x-csrf-token", csrf);
  const response = await fetch(
    `/api/subjects/${encodeURIComponent(subjectId)}/files?${params.toString()}`,
    { method: "POST", body: file, headers, credentials: "same-origin" },
  );
  if (!response.ok) {
    const data = await response.json().catch(() => null);
    throw new Error(
      (data && typeof data === "object" && "error" in data && String((data as { error: unknown }).error)) ||
        `Upload failed (${response.status})`,
    );
  }
  const body = await response.json();
  return body.file as SubjectFile;
}

export async function deleteSubjectFile(fileId: string): Promise<void> {
  await api(`/api/subject-files/${encodeURIComponent(fileId)}`, { method: "DELETE" });
}

export function downloadSubjectFileUrl(fileId: string): string {
  return `/api/subject-files/${encodeURIComponent(fileId)}`;
}
