"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useDashboardData } from "@/lib/app/DashboardProvider";
import type { DashboardResponse, SubjectContext, SubjectFile } from "@/lib/api/types";
import {
  deleteSubjectFile,
  downloadSubjectFileUrl,
  saveSubjectContext,
  uploadSubjectFile,
} from "@/lib/api/knowledge";
import PageHeader from "./PageHeader";
import AppButton from "./AppButton";
import EmptyState from "./EmptyState";

const MAX_BYTES = 10 * 1024 * 1024;

export default function KnowledgeView() {
  const { data, patch, reload } = useDashboardData();
  const contexts = useMemo(() => data.subjectContexts ?? [], [data.subjectContexts]);
  const [openId, setOpenId] = useState<string | null>(null);

  return (
    <>
      <PageHeader
        eyebrow="Knowledge"
        title={<>Feed Arcad your <span className="accent-serif">subjects</span>.</>}
        meta="Upload lecture PDFs and notes per subject. Arcad reads them when you ask about that subject."
      />

      <div className="mx-auto flex w-full max-w-[860px] flex-col gap-6 px-6 py-8 sm:px-10">
        {contexts.length === 0 ? (
          <EmptyState
            title={<>No <span className="accent-serif">subjects</span> yet.</>}
            body="Add a subject on Deadlines (create a task with a new subject name, or use onboarding). Once a subject exists, it shows up here for you to add notes and upload files."
            action={
              <a
                href="/app/deadlines"
                className="rounded-full px-3 py-1.5 text-[12.5px] font-medium"
                style={{ background: "var(--app-accent)", color: "white" }}
              >
                Add a task
              </a>
            }
          />
        ) : (
          <ul className="flex flex-col gap-3">
            {contexts.map((context) => (
              <SubjectRow
                key={context.subjectId}
                context={context}
                isOpen={openId === context.subjectId}
                onToggle={() => setOpenId(openId === context.subjectId ? null : context.subjectId)}
                onOptimisticContext={(updated) =>
                  patch((prev: DashboardResponse) => ({
                    ...prev,
                    subjectContexts: (prev.subjectContexts ?? []).map((c) =>
                      c.subjectId === updated.subjectId ? updated : c,
                    ),
                  }))
                }
                onOptimisticFile={(subjectId, file) =>
                  patch((prev: DashboardResponse) => ({
                    ...prev,
                    subjectContexts: (prev.subjectContexts ?? []).map((c) =>
                      c.subjectId === subjectId ? { ...c, files: [file, ...c.files] } : c,
                    ),
                  }))
                }
                onOptimisticRemoveFile={(subjectId, fileId) =>
                  patch((prev: DashboardResponse) => ({
                    ...prev,
                    subjectContexts: (prev.subjectContexts ?? []).map((c) =>
                      c.subjectId === subjectId ? { ...c, files: c.files.filter((f) => f.id !== fileId) } : c,
                    ),
                  }))
                }
                reload={reload}
              />
            ))}
          </ul>
        )}
      </div>
    </>
  );
}

interface SubjectRowProps {
  context: SubjectContext;
  isOpen: boolean;
  onToggle: () => void;
  onOptimisticContext: (updated: SubjectContext) => void;
  onOptimisticFile: (subjectId: string, file: SubjectFile) => void;
  onOptimisticRemoveFile: (subjectId: string, fileId: string) => void;
  reload: () => Promise<void>;
}

function SubjectRow({
  context,
  isOpen,
  onToggle,
  onOptimisticContext,
  onOptimisticFile,
  onOptimisticRemoveFile,
  reload,
}: SubjectRowProps) {
  const [notes, setNotes] = useState(context.notes);
  const [notesDirty, setNotesDirty] = useState(false);
  const [savingNotes, setSavingNotes] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Reset the local mirror whenever the parent context changes and the
  // textarea isn't holding unsaved edits. Guards against overwriting the
  // user's in-progress typing when a background reload lands.
  useEffect(() => {
    if (!notesDirty) setNotes(context.notes);
  }, [context.notes, notesDirty]);

  const saveNotes = useCallback(async () => {
    setSavingNotes(true);
    setError(null);
    try {
      const updated = await saveSubjectContext(context.subjectId, {
        notes,
        includeInArcad: context.includeInArcad,
      });
      onOptimisticContext(updated);
      setNotesDirty(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save notes.");
    } finally {
      setSavingNotes(false);
    }
  }, [context.includeInArcad, context.subjectId, notes, onOptimisticContext]);

  async function toggleInclude(next: boolean) {
    onOptimisticContext({ ...context, includeInArcad: next });
    try {
      const updated = await saveSubjectContext(context.subjectId, {
        notes: context.notes,
        includeInArcad: next,
      });
      onOptimisticContext(updated);
    } catch (err) {
      onOptimisticContext(context);
      setError(err instanceof Error ? err.message : "Couldn't update Arcad access.");
    }
  }

  async function handleUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (file.size > MAX_BYTES) {
      setError("Choose a file no larger than 10 MB.");
      return;
    }
    setUploading(true);
    setError(null);
    try {
      const uploaded = await uploadSubjectFile(context.subjectId, file);
      onOptimisticFile(context.subjectId, uploaded);
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setUploading(false);
    }
  }

  async function removeFile(file: SubjectFile) {
    if (!confirm(`Delete ${file.filename}?`)) return;
    onOptimisticRemoveFile(context.subjectId, file.id);
    try {
      await deleteSubjectFile(file.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't delete file.");
      await reload();
    }
  }

  return (
    <li
      className="rounded-[14px]"
      style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}
    >
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-4 px-5 py-4 text-left"
      >
        <span
          aria-hidden="true"
          className="h-10 w-1 shrink-0 rounded-full"
          style={{ background: context.color || "var(--app-accent)" }}
        />
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-medium tracking-[-0.005em]" style={{ color: "var(--app-text)" }}>
            {context.subjectName}
          </p>
          <p className="mt-1 type-mono-label" style={{ color: "var(--app-text-muted)" }}>
            {context.files.length} {context.files.length === 1 ? "file" : "files"}
            {context.notes.trim() ? " · has notes" : ""}
            {context.includeInArcad ? " · Arcad-enabled" : " · hidden from Arcad"}
          </p>
        </div>
        <span aria-hidden="true" className="text-[12px]" style={{ color: "var(--app-text-muted)" }}>
          {isOpen ? "Close" : "Open"}
        </span>
      </button>

      {isOpen ? (
        <div className="border-t px-5 pb-5 pt-4" style={{ borderColor: "var(--app-border)" }}>
          {/* Notes */}
          <div>
            <div className="flex items-center justify-between">
              <p className="type-eyebrow" style={{ color: "var(--app-text-muted)" }}>Notes</p>
              {notesDirty ? (
                <button
                  type="button"
                  onClick={() => void saveNotes()}
                  disabled={savingNotes}
                  className="text-[12px] font-medium"
                  style={{ color: "var(--app-accent-strong)" }}
                >
                  {savingNotes ? "Saving…" : "Save"}
                </button>
              ) : null}
            </div>
            <textarea
              value={notes}
              onChange={(e) => {
                setNotes(e.target.value);
                setNotesDirty(true);
              }}
              onBlur={() => {
                if (notesDirty) void saveNotes();
              }}
              rows={4}
              placeholder="Anything you'd want a tutor to know before helping — key topics, textbook, teacher's style."
              className="mt-2 w-full resize-y rounded-[10px] px-3 py-2.5 text-[13.5px] outline-none"
              style={{
                background: "var(--app-surface-soft)",
                border: "1px solid var(--app-border)",
                color: "var(--app-text)",
                minHeight: 96,
              }}
              maxLength={4000}
            />
          </div>

          {/* Arcad toggle */}
          <div className="mt-4 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[13.5px] font-medium" style={{ color: "var(--app-text)" }}>
                Let Arcad read this
              </p>
              <p className="mt-0.5 text-[12.5px]" style={{ color: "var(--app-text-muted)" }}>
                When on, Arcad quotes these notes and files when you ask about {context.subjectName}.
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={context.includeInArcad}
              onClick={() => void toggleInclude(!context.includeInArcad)}
              className="relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors"
              style={{ background: context.includeInArcad ? "var(--app-accent)" : "var(--app-border-strong)" }}
            >
              <span
                aria-hidden="true"
                className="inline-block h-5 w-5 rounded-full bg-white shadow-sm transition-transform"
                style={{ transform: context.includeInArcad ? "translateX(22px)" : "translateX(2px)" }}
              />
            </button>
          </div>

          {/* Files */}
          <div className="mt-5">
            <div className="flex items-center justify-between">
              <p className="type-eyebrow" style={{ color: "var(--app-text-muted)" }}>Files</p>
              <div className="flex items-center gap-2">
                <input
                  ref={inputRef}
                  type="file"
                  accept=".pdf,.txt,.md,.markdown,.rtf,.doc,.docx,.pages"
                  onChange={handleUpload}
                  className="hidden"
                />
                <AppButton
                  type="button"
                  variant="secondary"
                  onClick={() => inputRef.current?.click()}
                  loading={uploading}
                >
                  Upload file
                </AppButton>
              </div>
            </div>
            <p className="mt-1 type-mono-label" style={{ color: "var(--app-text-muted)" }}>
              PDFs, text and Markdown work best. Max 10 MB per file.
            </p>

            {context.files.length === 0 ? (
              <p className="mt-3 text-[13px]" style={{ color: "var(--app-text-muted)" }}>
                Nothing uploaded yet.
              </p>
            ) : (
              <ul className="mt-3 flex flex-col gap-2">
                {context.files.map((file) => (
                  <li
                    key={file.id}
                    className="flex items-center gap-3 rounded-[10px] px-3 py-2.5"
                    style={{ background: "var(--app-surface-soft)", border: "1px solid var(--app-border)" }}
                  >
                    <FileGlyph />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13.5px] font-medium" style={{ color: "var(--app-text)" }}>
                        {file.filename}
                      </p>
                      <p className="mt-0.5 type-mono-label" style={{ color: "var(--app-text-muted)" }}>
                        {formatBytes(file.sizeBytes)} · added {relativeTime(file.createdAt)}
                      </p>
                    </div>
                    <a
                      href={downloadSubjectFileUrl(file.id)}
                      className="text-[12px] font-medium"
                      style={{ color: "var(--app-text-muted)" }}
                    >
                      Download
                    </a>
                    <button
                      type="button"
                      onClick={() => void removeFile(file)}
                      className="text-[12px] font-medium"
                      style={{ color: "var(--app-danger)" }}
                    >
                      Delete
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {error ? (
            <p className="mt-3 text-[13px]" style={{ color: "var(--app-danger)" }}>
              {error}
            </p>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

function FileGlyph() {
  return (
    <span
      aria-hidden="true"
      className="grid size-8 shrink-0 place-items-center rounded-md"
      style={{ background: "var(--app-accent-soft)", color: "var(--app-accent-strong)" }}
    >
      <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6">
        <path d="M5 3h7l3 3v11H5z" strokeLinejoin="round" />
        <path d="M12 3v3h3" strokeLinejoin="round" />
      </svg>
    </span>
  );
}

function formatBytes(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function relativeTime(iso: string): string {
  const diff = Date.now() - Date.parse(iso);
  const min = Math.round(diff / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min} min ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr} hr ago`;
  const day = Math.round(hr / 24);
  return `${day} day${day === 1 ? "" : "s"} ago`;
}
