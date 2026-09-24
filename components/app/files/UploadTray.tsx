"use client";

import Link from "next/link";
import { useSubjects } from "../cards/shared";
import { PendingRow } from "./FileRows";
import type { UploadItem } from "./UploadProvider";

/**
 * How uploads are going, for when the student has moved to a page that
 * doesn't list files. Clears itself a few seconds after everything's read;
 * anything that failed stays until it's retried or dismissed.
 */
export default function UploadTray({
  items,
  retry,
  dismiss,
  showFilesLink,
}: {
  items: UploadItem[];
  retry: (key: number) => void;
  dismiss: (key: number) => void;
  showFilesLink: boolean;
}) {
  const { find } = useSubjects();
  const active = items.filter((item) => item.status === "waiting" || item.status === "uploading" || item.status === "reading");
  const failed = items.filter((item) => item.status === "failed" || item.status === "unread");
  const done = items.length - active.length;
  const title = active.length
    ? `Uploading ${Math.min(done + 1, items.length)} of ${items.length}`
    : failed.length
      ? `${failed.length === 1 ? "1 file needs" : `${failed.length} files need`} a look`
      : items.length === 1
        ? "File read"
        : `${items.length} files read`;

  return (
    <section
      aria-label="Uploads"
      className="fixed bottom-[calc(env(safe-area-inset-bottom,0px)+88px)] left-1/2 z-40 w-[min(380px,calc(100vw-32px))] -translate-x-1/2 rounded-lg lg:bottom-6"
      style={{ background: "var(--app-elev)", boxShadow: "var(--elev-3)", color: "var(--app-text)" }}
    >
      <header className="flex items-center justify-between gap-3 px-4 pb-1 pt-3">
        <h2 className="text-[13.5px] font-semibold" aria-live="polite">
          {title}
        </h2>
        <div className="flex items-center gap-1">
          {showFilesLink && !active.length ? (
            <Link href="/app/files" className="rounded-md px-2 py-1 text-[12.5px] ui-hover" style={{ color: "var(--app-text-soft)" }}>
              View files
            </Link>
          ) : null}
          {!active.length ? (
            <button
              type="button"
              onClick={() => items.forEach((item) => dismiss(item.key))}
              aria-label="Close"
              className="grid h-7 w-7 place-items-center rounded-md ui-hover"
              style={{ color: "var(--app-text-muted)" }}
            >
              <svg viewBox="0 0 20 20" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
                <path d="M5 5l10 10M15 5L5 15" strokeLinecap="round" />
              </svg>
            </button>
          ) : null}
        </div>
      </header>
      <ul className="max-h-[40svh] overflow-y-auto px-4 pb-1">
        {items.map((item) => (
          <PendingRow
            key={item.key}
            item={item}
            retry={retry}
            dismiss={dismiss}
            showSubject={find(item.subjectId)?.name}
          />
        ))}
      </ul>
    </section>
  );
}
