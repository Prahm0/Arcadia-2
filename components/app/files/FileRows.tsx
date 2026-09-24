"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { SubjectFile } from "@/lib/api/profile";
import { formatBytes, materialFormat, type MaterialFormat } from "@/lib/api/subjectMaterials";
import { showContextMenu } from "../ContextMenu";
import type { UploadItem } from "./UploadProvider";

const UNDO_MS = 5000;

const FORMAT_LABEL: Record<MaterialFormat, string> = { pdf: "PDF", image: "Photo", text: "Text" };

/**
 * A subject's files as rows, with anything still uploading on top. Notes
 * and handouts come back with Undo for a few seconds after Remove; a
 * syllabus takes its topics with it, so that one asks first.
 */
export default function FileRows({
  files,
  pending,
  onRemove,
  retry,
  dismiss,
  empty,
}: {
  files: SubjectFile[];
  pending: UploadItem[];
  /** Deletes on the server and refreshes. */
  onRemove: (file: SubjectFile) => Promise<void>;
  retry: (key: number) => void;
  dismiss: (key: number) => void;
  empty?: ReactNode;
}) {
  const [removing, setRemoving] = useState<SubjectFile[]>([]);
  const timers = useRef(new Map<string, { timer: number; file: SubjectFile }>());
  const removeRef = useRef(onRemove);
  useEffect(() => {
    removeRef.current = onRemove;
  });

  // Leaving the page doesn't cancel a remove: it happens now instead.
  useEffect(() => {
    const scheduled = timers.current;
    return () => {
      for (const { timer, file } of scheduled.values()) {
        window.clearTimeout(timer);
        void removeRef.current(file);
      }
      scheduled.clear();
    };
  }, []);

  function remove(file: SubjectFile) {
    if (file.kind === "syllabus") {
      if (confirm(`Remove ${file.filename} and the topics Arcad read from it? Deadlines you added stay.`)) void onRemove(file);
      return;
    }
    setRemoving((prev) => [...prev, file]);
    const timer = window.setTimeout(() => {
      timers.current.delete(file.id);
      void removeRef.current(file).finally(() => setRemoving((prev) => prev.filter((entry) => entry.id !== file.id)));
    }, UNDO_MS);
    timers.current.set(file.id, { timer, file });
  }

  function undo(file: SubjectFile) {
    window.clearTimeout(timers.current.get(file.id)?.timer);
    timers.current.delete(file.id);
    setRemoving((prev) => prev.filter((entry) => entry.id !== file.id));
  }

  // An upload's row hands over to the real one once the list has it.
  const uploading = pending.filter((item) => !(item.result && files.some((file) => file.id === item.result!.file.id)));
  const removingIds = new Set(removing.map((file) => file.id));

  if (files.length === 0 && uploading.length === 0) return <>{empty ?? null}</>;

  return (
    <ul className="flex flex-col">
      {uploading.map((item) => (
        <PendingRow key={`u${item.key}`} item={item} retry={retry} dismiss={dismiss} />
      ))}
      {files.map((file) =>
        removingIds.has(file.id) ? (
          <li
            key={file.id}
            className="flex items-center gap-3 border-b py-2.5 last:border-b-0"
            style={{ borderColor: "var(--app-border)" }}
            role="status"
          >
            <span className="min-w-0 flex-1 truncate text-[13px]" style={{ color: "var(--app-text-muted)" }}>
              Removed {file.filename}
            </span>
            <button
              type="button"
              onClick={() => undo(file)}
              className="shrink-0 rounded-md px-2 py-1 text-[12.5px] font-medium ui-hover"
              style={{ color: "var(--app-text)" }}
            >
              Undo
            </button>
          </li>
        ) : (
          <FileRow key={file.id} file={file} onRemove={() => remove(file)} />
        ),
      )}
    </ul>
  );
}

function FileRow({ file, onRemove }: { file: SubjectFile; onRemove: () => void }) {
  const href = `/api/subject-files/${encodeURIComponent(file.id)}`;
  const format = materialFormat(file.contentType, file.filename);
  const facts = [format ? FORMAT_LABEL[format] : null, file.bytes ? formatBytes(file.bytes) : null, formatAdded(file.createdAt)]
    .filter(Boolean)
    .join(" · ");
  return (
    <li
      className="group flex items-start gap-3 border-b py-3 last:border-b-0"
      style={{ borderColor: "var(--app-border)" }}
      onContextMenu={(event) =>
        showContextMenu(
          event,
          [
            file.stored && { kind: "item", label: "Open", onSelect: () => window.open(href, "_blank", "noopener") },
            file.stored && { kind: "item", label: "Download", onSelect: () => download(href, file.filename) },
            { kind: "separator" },
            { kind: "item", label: "Remove", danger: true, onSelect: onRemove },
          ],
          file.filename,
        )
      }
    >
      <FormatIcon format={format} />
      <span className="min-w-0 flex-1">
        <span className="flex min-w-0 items-center gap-2">
          <span className="truncate text-[14px] font-medium" style={{ color: "var(--app-text)" }}>
            {file.filename}
          </span>
          {file.kind === "syllabus" ? <SyllabusTag /> : null}
        </span>
        <span className="mt-0.5 block text-[12px] tabular-nums" style={{ color: "var(--app-text-muted)" }}>
          {facts}
        </span>
        <span
          className="mt-1 line-clamp-2 block text-[12.5px] leading-snug"
          style={{ color: file.read ? "var(--app-text-soft)" : "var(--app-danger)" }}
        >
          {file.read ? file.summary : unreadHint(format)}
        </span>
      </span>
      {file.stored ? (
        <a
          href={href}
          target="_blank"
          rel="noreferrer"
          className="shrink-0 rounded-md px-2 py-1 text-[12.5px] ui-hover"
          style={{ color: "var(--app-text-soft)" }}
        >
          Open
        </a>
      ) : null}
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove ${file.filename}`}
        className="grid h-7 w-7 shrink-0 place-items-center rounded-md opacity-60 ui-hover group-hover:opacity-100"
        style={{ color: "var(--app-text-muted)" }}
      >
        <svg viewBox="0 0 20 20" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
          <path d="M5 5l10 10M15 5L5 15" strokeLinecap="round" />
        </svg>
      </button>
    </li>
  );
}

export function PendingRow({
  item,
  retry,
  dismiss,
  showSubject,
}: {
  item: UploadItem;
  retry: (key: number) => void;
  dismiss: (key: number) => void;
  /** The tray lists every subject's uploads together. */
  showSubject?: string;
}) {
  const failed = item.status === "failed";
  return (
    <li className="flex items-start gap-3 border-b py-3 last:border-b-0" style={{ borderColor: "var(--app-border)" }}>
      <FormatIcon format={materialFormat(item.file.type, item.file.name)} muted={failed} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[14px] font-medium" style={{ color: "var(--app-text)" }}>
          {item.file.name}
        </span>
        <span
          role={failed ? "alert" : "status"}
          className="mt-0.5 block text-[12.5px] leading-snug"
          style={{ color: failed || item.status === "unread" ? "var(--app-danger)" : "var(--app-text-muted)" }}
        >
          {showSubject ? `${showSubject} · ` : null}
          {statusText(item)}
          {item.upgrade ? (
            <>
              {" "}
              <Link href="/app/pricing" className="underline" style={{ color: "var(--app-text)" }}>
                See plans
              </Link>
            </>
          ) : null}
        </span>
        {item.status === "uploading" || item.status === "reading" || item.status === "waiting" ? (
          <ProgressBar item={item} />
        ) : null}
      </span>
      {failed && !item.upgrade ? (
        <button
          type="button"
          onClick={() => retry(item.key)}
          className="shrink-0 rounded-md px-2 py-1 text-[12.5px] font-medium ui-hover"
          style={{ color: "var(--app-text)" }}
        >
          Try again
        </button>
      ) : null}
      {item.status === "waiting" || item.status === "failed" ? (
        <button
          type="button"
          onClick={() => dismiss(item.key)}
          aria-label={item.status === "waiting" ? `Don't upload ${item.file.name}` : `Dismiss ${item.file.name}`}
          className="grid h-7 w-7 shrink-0 place-items-center rounded-md ui-hover"
          style={{ color: "var(--app-text-muted)" }}
        >
          <svg viewBox="0 0 20 20" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
            <path d="M5 5l10 10M15 5L5 15" strokeLinecap="round" />
          </svg>
        </button>
      ) : null}
    </li>
  );
}

function statusText(item: UploadItem): string {
  switch (item.status) {
    case "waiting":
      return "Waiting to upload";
    case "uploading":
      return `Uploading ${Math.round(item.progress * 100)}%`;
    case "reading":
      return "Arcad's reading it. This takes a few seconds.";
    case "done":
      return item.kind === "syllabus" && item.result
        ? `Read: ${item.result.topics} topics, ${item.result.assessments} assessments`
        : "Read by Arcad";
    case "unread":
      return item.message ?? "Arcad couldn't read this one.";
    case "failed":
      return item.message ?? "Upload failed.";
  }
}

function ProgressBar({ item }: { item: UploadItem }) {
  const reading = item.status === "reading";
  return (
    <span
      className="mt-2 block h-1 w-full overflow-hidden rounded-full"
      style={{ background: "var(--app-surface-soft)", boxShadow: "var(--elev-inset)" }}
      aria-hidden="true"
    >
      <span
        className={reading ? "upload-reading block h-full rounded-full" : "block h-full rounded-full transition-[width] duration-200"}
        style={{
          width: reading ? "35%" : `${Math.max(item.status === "waiting" ? 0 : 4, item.progress * 100)}%`,
          background: reading ? "var(--app-arcad)" : "var(--app-accent)",
        }}
      />
    </span>
  );
}

function unreadHint(format: MaterialFormat | null): string {
  if (format === "image") return "Arcad couldn't make this photo out. A sharper photo in good light usually works.";
  if (format === "pdf") return "Arcad couldn't read this PDF. If it's a scan, a clearer copy usually works.";
  return "Arcad couldn't read this one.";
}

/** "3 Sep", or "3 Sep 2025" from another year. */
function formatAdded(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const sameYear = date.getFullYear() === new Date().getFullYear();
  return new Intl.DateTimeFormat("en-AU", { day: "numeric", month: "short", ...(sameYear ? {} : { year: "numeric" }) }).format(date);
}

function SyllabusTag() {
  return (
    <span
      className="shrink-0 rounded-[4px] px-1.5 py-px text-[11.5px] font-medium"
      style={{ color: "var(--app-text-soft)", boxShadow: "inset 0 0 0 1px var(--app-border-strong)" }}
    >
      Syllabus
    </span>
  );
}

export function FormatIcon({ format, muted }: { format: MaterialFormat | null; muted?: boolean }) {
  return (
    <span
      aria-hidden="true"
      className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-md"
      style={{
        background: "var(--app-surface-soft)",
        boxShadow: "var(--elev-inset)",
        color: muted ? "var(--app-text-faint)" : "var(--app-text-muted)",
      }}
    >
      <svg viewBox="0 0 20 20" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        {format === "image" ? (
          <>
            <rect x="3" y="4" width="14" height="12" rx="1.5" />
            <circle cx="7.5" cy="8.5" r="1.3" />
            <path d="M3.5 14.5l4-4 3 3 2-2 4 4" />
          </>
        ) : (
          <>
            <path d="M5.5 2.5h6l3.5 3.5v10a1.5 1.5 0 0 1-1.5 1.5h-8A1.5 1.5 0 0 1 4 16V4a1.5 1.5 0 0 1 1.5-1.5z" />
            <path d="M11.5 2.5V6H15" />
            {format === "pdf" ? <path d="M7 10.5h6M7 13h4" /> : <path d="M7 10h6M7 12.5h6M7 15h3.5" />}
          </>
        )}
      </svg>
    </span>
  );
}

function download(href: string, filename: string) {
  const link = document.createElement("a");
  link.href = href;
  link.download = filename;
  link.click();
}
