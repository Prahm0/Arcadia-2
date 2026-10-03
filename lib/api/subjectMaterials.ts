"use client";

import { ApiError } from "@/lib/api/client";
import type { SubjectFile } from "@/lib/api/profile";

export const MATERIAL_ACCEPT = "application/pdf,image/png,image/jpeg,image/webp,text/plain,text/markdown,.md,.txt";
export const MATERIAL_MAX_BYTES = 8 * 1024 * 1024;
/** What Arcad can read, said the same way everywhere a file can be added. */
export const MATERIAL_HINT = "PDFs, photos and text files, up to 8 MB each";

export type MaterialKind = "syllabus" | "resource";
export type MaterialFormat = "pdf" | "image" | "text";

const FORMATS: Record<string, MaterialFormat> = {
  "application/pdf": "pdf",
  "image/png": "image",
  "image/jpeg": "image",
  "image/webp": "image",
  "text/plain": "text",
  "text/markdown": "text",
};
const EXTENSIONS: Record<string, MaterialFormat> = {
  pdf: "pdf",
  png: "image",
  jpg: "image",
  jpeg: "image",
  webp: "image",
  txt: "text",
  md: "text",
};

export interface UploadResult {
  file: SubjectFile;
  read: boolean;
  topics: number;
  assessments: number;
  message?: string;
}

function extension(filename: string): string {
  const match = /\.([a-z0-9]+)$/i.exec(filename);
  return match ? match[1].toLowerCase() : "";
}

/** PDF, image or text, from the type the browser gave or the file's name. */
export function materialFormat(contentType: string, filename: string): MaterialFormat | null {
  return FORMATS[contentType.split(";")[0].trim().toLowerCase()] ?? EXTENSIONS[extension(filename)] ?? null;
}

/**
 * Why a file can't be sent, before it's sent: the same rules the server
 * applies, with the fix spelled out. Null when it's fine.
 */
export function checkMaterial(file: File): string | null {
  const ext = extension(file.name);
  if (/^(docx?|pages|odt|rtf)$/.test(ext)) return "Word files can't be read yet. Save it as a PDF, then upload that.";
  if (/^(pptx?|key|odp)$/.test(ext)) return "Slides can't be read yet. Export them as a PDF, then upload that.";
  if (/^(heic|heif)$/.test(ext) || /image\/hei[cf]/.test(file.type)) return "HEIC photos can't be read yet. Export it as a JPG first.";
  if (!materialFormat(file.type, file.name)) return "Arcad can read PDFs, photos (PNG, JPG, WebP) and text files.";
  if (file.size === 0) return "This file is empty.";
  if (file.size > MATERIAL_MAX_BYTES) return `This is ${formatBytes(file.size)}. Keep it under 8 MB.`;
  return null;
}

/** "840 KB", "2.4 MB". */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0)} MB`;
}

/**
 * Sends a syllabus or resource for Arcad to read. The file goes as the raw
 * request body (filename in the query), so it can't use the JSON `api`
 * helper. XHR rather than fetch so the upload can report its progress;
 * `onSent` fires once every byte is up and Arcad starts reading.
 */
export function uploadMaterial(
  subjectId: string,
  file: File,
  kind: MaterialKind,
  handlers: { onProgress?: (fraction: number) => void; onSent?: () => void } = {},
): Promise<UploadResult> {
  const problem = checkMaterial(file);
  if (problem) return Promise.reject(new ApiError(problem, 422, null));
  const params = new URLSearchParams({ kind, filename: file.name });

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${kind === "syllabus" ? "/api/profile/subjects" : "/api/subjects"}/${encodeURIComponent(subjectId)}/files?${params}`);
    xhr.withCredentials = true;
    xhr.responseType = "json";
    xhr.setRequestHeader("content-type", file.type || "application/octet-stream");
    try {
      const csrf = window.localStorage.getItem("arcadia:csrf");
      if (csrf) xhr.setRequestHeader("x-csrf-token", csrf);
    } catch {
      /* storage blocked; the server will say so */
    }
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) handlers.onProgress?.(event.loaded / event.total);
    };
    xhr.upload.onload = () => handlers.onSent?.();
    xhr.onload = () => {
      const data: unknown = xhr.response;
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(data as UploadResult);
        return;
      }
      const message =
        data && typeof data === "object" && "error" in data
          ? String((data as { error: unknown }).error)
          : `Upload failed (${xhr.status})`;
      reject(new ApiError(message, xhr.status, data));
    };
    xhr.onerror = () => reject(new ApiError("Couldn't reach Arcadia. Check your connection and try again.", 0, null));
    xhr.send(file);
  });
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
