"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { ApiError, api } from "@/lib/api/client";
import type { ProfileSubject } from "@/lib/api/profile";
import { MATERIAL_ACCEPT, uploadMaterial } from "@/lib/api/subjectMaterials";
import AppButton from "../AppButton";
import { PlusIcon } from "./SubjectsSection";
import { Section } from "./ui";

/**
 * Textbooks, handouts and notes. Arcad notes what each one covers so a
 * session plan can say "textbook 3.2" instead of "study chemistry".
 */
export default function ResourcesSection({
  subject,
  refresh,
}: {
  subject: ProfileSubject;
  refresh: () => Promise<void>;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [upgrade, setUpgrade] = useState(false);

  async function upload(files: FileList) {
    setError(null);
    setUpgrade(false);
    for (const file of Array.from(files)) {
      setUploading(file.name);
      try {
        const result = await uploadMaterial(subject.id, file, "resource");
        if (!result.read && result.message) setError(`${file.name}: ${result.message}`);
      } catch (err) {
        if (err instanceof ApiError && err.status === 402) {
          // Paid feature: one message is enough, not one per file.
          setError(err.message);
          setUpgrade(true);
          break;
        }
        setError(`${file.name}: ${err instanceof Error ? err.message : "upload failed"}`);
      }
    }
    setUploading(null);
    if (input.current) input.current.value = "";
    await refresh();
  }

  async function remove(id: string) {
    setBusy(id);
    try {
      await api(`/api/subject-files/${encodeURIComponent(id)}`, { method: "DELETE" });
      await refresh();
    } finally {
      setBusy(null);
    }
  }

  return (
    <Section
      id="resources"
      title="Resources"
      meta="Textbook chapters, handouts, notes. Arcad points you to the right part."
      action={
        <AppButton
          size="sm"
          variant="secondary"
          icon={<PlusIcon />}
          loading={uploading !== null}
          onClick={() => input.current?.click()}
        >
          Add
        </AppButton>
      }
    >
      <input
        ref={input}
        type="file"
        multiple
        accept={MATERIAL_ACCEPT}
        className="hidden"
        onChange={(event) => {
          if (event.target.files?.length) void upload(event.target.files);
        }}
      />
      {uploading ? (
        <p role="status" className="mb-2 text-[13px]" style={{ color: "var(--app-text-soft)" }}>
          Arcad&apos;s reading {uploading}…
        </p>
      ) : null}
      {subject.resources.length === 0 ? (
        <p className="text-[13px]" style={{ color: "var(--app-text-muted)" }}>
          Nothing yet. Add the textbook chapters or notes you actually use (PDF or photos).
        </p>
      ) : (
        <ul className="flex flex-col">
          {subject.resources.map((file) => (
            <li
              key={file.id}
              className="group flex items-start gap-3 border-b py-2.5 last:border-b-0"
              style={{ borderColor: "var(--app-border)" }}
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[14px] font-medium" style={{ color: "var(--app-text)" }}>
                  {file.filename}
                </span>
                <span
                  className="mt-0.5 line-clamp-2 block text-[12.5px] leading-snug"
                  style={{ color: file.read ? "var(--app-text-muted)" : "var(--app-danger)" }}
                >
                  {file.read ? file.summary : "Arcad couldn't read this one."}
                </span>
              </span>
              {file.stored ? (
                <a
                  href={`/api/subject-files/${encodeURIComponent(file.id)}`}
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
                disabled={busy === file.id}
                onClick={() => void remove(file.id)}
                aria-label={`Remove ${file.filename}`}
                className="grid h-7 w-7 shrink-0 place-items-center rounded-md opacity-60 ui-hover group-hover:opacity-100"
                style={{ color: "var(--app-text-muted)" }}
              >
                <svg viewBox="0 0 20 20" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
                  <path d="M5 5l10 10M15 5L5 15" strokeLinecap="round" />
                </svg>
              </button>
            </li>
          ))}
        </ul>
      )}
      {error ? (
        <p role="alert" className="mt-2 text-[12.5px]" style={{ color: "var(--app-danger)" }}>
          {error}
          {upgrade ? (
            <>
              {" "}
              <Link href="/app/pricing" className="underline" style={{ color: "var(--app-accent-strong)" }}>
                See plans
              </Link>
            </>
          ) : null}
        </p>
      ) : null}
    </Section>
  );
}
