"use client";

import Link from "next/link";
import { useState } from "react";
import { checkMaterial, formatBytes, materialFormat, MATERIAL_HINT, type MaterialKind } from "@/lib/api/subjectMaterials";
import { cn } from "@/lib/cn";
import AppButton, { appButtonClass } from "../AppButton";
import { useSubjects } from "../cards/shared";
import { Label, Select, Sheet } from "../profile/ui";
import { FormatIcon } from "./FileRows";
import { LockGlyph, type UploadPreset, type UploadTarget } from "./UploadProvider";

type State = { locked: true } | { locked: false; files: File[]; preset: UploadPreset } | null;

/**
 * The step between picking files and sending them: which subject they're
 * for and what they are. Files Arcad can't take are flagged here, before
 * anything is sent. On Free it explains the plan instead.
 */
export default function UploadSheet({
  state,
  onClose,
  onAddFiles,
  onRemoveFile,
  onUpload,
}: {
  state: State;
  onClose: () => void;
  onAddFiles: () => void;
  onRemoveFile: (index: number) => void;
  onUpload: (files: File[], target: UploadTarget) => void;
}) {
  if (!state) return null;
  if (state.locked) return <LockedSheet onClose={onClose} />;
  return (
    <UploadForm
      files={state.files}
      preset={state.preset}
      onClose={onClose}
      onAddFiles={onAddFiles}
      onRemoveFile={onRemoveFile}
      onUpload={onUpload}
    />
  );
}

function UploadForm({
  files,
  preset,
  onClose,
  onAddFiles,
  onRemoveFile,
  onUpload,
}: {
  files: File[];
  preset: UploadPreset;
  onClose: () => void;
  onAddFiles: () => void;
  onRemoveFile: (index: number) => void;
  onUpload: (files: File[], target: UploadTarget) => void;
}) {
  const { subjects } = useSubjects();
  const [subjectId, setSubjectId] = useState(
    preset.subjectId && subjects.some((subject) => subject.id === preset.subjectId)
      ? preset.subjectId
      : subjects.length === 1
        ? subjects[0].id
        : "",
  );
  const [kind, setKind] = useState<MaterialKind>(preset.kind ?? "resource");

  const checked = files.map((file) => ({ file, problem: checkMaterial(file) }));
  const ready = checked.filter((entry) => !entry.problem).map((entry) => entry.file);
  const skipped = checked.length - ready.length;
  // A subject has one syllabus, so it takes one file.
  const syllabusBlocked = ready.length > 1;
  const effectiveKind: MaterialKind = kind === "syllabus" && syllabusBlocked ? "resource" : kind;
  const replacing = effectiveKind === "syllabus" && subjectId ? preset.syllabi?.[subjectId] : undefined;
  const canSubmit = ready.length > 0 && Boolean(subjectId);

  return (
    <Sheet open eyebrow="Files" title={files.length === 1 ? "Upload a file" : `Upload ${files.length} files`} onClose={onClose}>
      <form
        className="space-y-5"
        onSubmit={(event) => {
          event.preventDefault();
          if (canSubmit) onUpload(ready, { subjectId, kind: effectiveKind });
        }}
      >
        <div>
          <ul
            className="flex flex-col overflow-hidden rounded-md"
            style={{ background: "var(--app-surface-soft)", boxShadow: "var(--elev-inset)" }}
          >
            {checked.map(({ file, problem }, index) => (
              <li
                key={`${file.name}-${index}`}
                className="flex items-start gap-3 border-b px-3 py-2.5 last:border-b-0"
                style={{ borderColor: "var(--app-border)" }}
              >
                <FormatIcon format={materialFormat(file.type, file.name)} muted={Boolean(problem)} />
                <span className="min-w-0 flex-1">
                  <span
                    className="block truncate text-[13.5px] font-medium"
                    style={{ color: problem ? "var(--app-text-muted)" : "var(--app-text)" }}
                  >
                    {file.name}
                  </span>
                  <span
                    className="mt-0.5 block text-[12px] leading-snug"
                    style={{ color: problem ? "var(--app-danger)" : "var(--app-text-muted)" }}
                  >
                    {problem ?? formatBytes(file.size)}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => onRemoveFile(index)}
                  aria-label={`Don't upload ${file.name}`}
                  className="grid h-7 w-7 shrink-0 place-items-center rounded-md ui-hover"
                  style={{ color: "var(--app-text-muted)" }}
                >
                  <svg viewBox="0 0 20 20" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
                    <path d="M5 5l10 10M15 5L5 15" strokeLinecap="round" />
                  </svg>
                </button>
              </li>
            ))}
            {files.length === 0 ? (
              <li className="px-3 py-3 text-[13px]" style={{ color: "var(--app-text-muted)" }}>
                No files picked.
              </li>
            ) : null}
          </ul>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
            <span className="text-[12px]" style={{ color: "var(--app-text-muted)" }}>
              {MATERIAL_HINT}.
            </span>
            <AppButton type="button" size="sm" variant="ghost" onClick={onAddFiles}>
              Add more
            </AppButton>
          </div>
        </div>

        {subjects.length === 0 ? (
          <p className="text-[13px] leading-[1.5]" style={{ color: "var(--app-text-muted)" }}>
            Files belong to a subject, and you haven&apos;t added any yet.{" "}
            <Link href="/app/profile#subjects" onClick={onClose} className="underline" style={{ color: "var(--app-text)" }}>
              Add your subjects
            </Link>{" "}
            first.
          </p>
        ) : (
          <Label text="Subject">
            <Select value={subjectId} onChange={setSubjectId}>
              {subjectId ? null : <option value="">Choose a subject</option>}
              {subjects.map((subject) => (
                <option key={subject.id} value={subject.id}>
                  {subject.name}
                </option>
              ))}
            </Select>
          </Label>
        )}

        <div>
          <p className="mb-2 text-[12.5px] font-medium" style={{ color: "var(--app-text-muted)" }}>
            What is it?
          </p>
          <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="What kind of file">
            <KindOption
              selected={effectiveKind === "resource"}
              onSelect={() => setKind("resource")}
              title="Notes & handouts"
              body="Class notes, textbook chapters, worksheets. Arcad points you to the right part."
            />
            <KindOption
              selected={effectiveKind === "syllabus"}
              disabled={syllabusBlocked}
              onSelect={() => setKind("syllabus")}
              title="Syllabus"
              body={
                syllabusBlocked
                  ? "One file per subject. Upload it on its own."
                  : "Course outline or assessment schedule. Arcad pulls out topics and due dates."
              }
            />
          </div>
          {replacing ? (
            <p
              className="mt-2.5 rounded-md px-3 py-2 text-[12.5px] leading-[1.5]"
              style={{ background: "var(--app-warning-soft)", color: "var(--app-text)" }}
            >
              This replaces <strong className="font-medium">{replacing}</strong>. Topics and assessments Arcad read from it
              are redone. Ones you added yourself, and anything already in your deadlines, stay.
            </p>
          ) : null}
        </div>

        {skipped > 0 && ready.length > 0 ? (
          <p className="text-[12.5px]" style={{ color: "var(--app-text-muted)" }}>
            {skipped === 1 ? "1 file" : `${skipped} files`} can&apos;t be read and will be skipped.
          </p>
        ) : null}

        <div className="flex justify-end gap-2 pt-1">
          <AppButton type="button" variant="ghost" onClick={onClose}>
            Cancel
          </AppButton>
          <AppButton type="submit" variant="primary" disabled={!canSubmit}>
            {ready.length > 1 ? `Upload ${ready.length} files` : replacing ? "Replace syllabus" : "Upload"}
          </AppButton>
        </div>
      </form>
    </Sheet>
  );
}

function KindOption({
  selected,
  disabled,
  onSelect,
  title,
  body,
}: {
  selected: boolean;
  disabled?: boolean;
  onSelect: () => void;
  title: string;
  body: string;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      disabled={disabled}
      onClick={onSelect}
      className={cn(
        "rounded-md px-3 py-2.5 text-left transition-shadow disabled:cursor-not-allowed disabled:opacity-60",
        !selected && !disabled && "hover:shadow-[0_0_0_1px_var(--app-border-strong)]",
      )}
      style={{
        background: selected ? "var(--app-accent-soft)" : "var(--app-surface-soft)",
        boxShadow: selected ? "inset 0 0 0 1px var(--app-accent)" : "var(--elev-inset)",
      }}
    >
      <span className="block text-[13.5px] font-medium" style={{ color: "var(--app-text)" }}>
        {title}
      </span>
      <span className="mt-0.5 block text-[12px] leading-snug" style={{ color: "var(--app-text-muted)" }}>
        {body}
      </span>
    </button>
  );
}

function LockedSheet({ onClose }: { onClose: () => void }) {
  return (
    <Sheet open eyebrow="Pro and Max" title="Upload your course material" onClose={onClose}>
      <div className="space-y-4">
        <p className="text-[14px] leading-[1.55]" style={{ color: "var(--app-text-soft)" }}>
          On Pro and Max, Arcad reads what you upload and uses it:
        </p>
        <ul className="space-y-2 text-[13.5px] leading-[1.5]" style={{ color: "var(--app-text)" }}>
          <li className="flex gap-2.5">
            <Tick />
            <span>
              <strong className="font-medium">Your syllabus</strong> becomes topics and due dates, so each session is planned
              around what you&apos;re covering.
            </span>
          </li>
          <li className="flex gap-2.5">
            <Tick />
            <span>
              <strong className="font-medium">Notes and handouts</strong> let Arcad point you to the right chapter, and make
              flashcards and summary sheets from them.
            </span>
          </li>
        </ul>
        <p className="text-[12.5px]" style={{ color: "var(--app-text-muted)" }}>
          On Free you can still add topics and deadlines by hand on each subject&apos;s page.
        </p>
        <div className="flex justify-end gap-2 pt-1">
          <AppButton type="button" variant="ghost" onClick={onClose}>
            Not now
          </AppButton>
          <Link href="/app/pricing" onClick={onClose} className={appButtonClass("primary")}>
            <LockGlyph />
            See plans
          </Link>
        </div>
      </div>
    </Sheet>
  );
}

function Tick() {
  return (
    <svg
      viewBox="0 0 20 20"
      width="14"
      height="14"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="mt-[3px] shrink-0"
      style={{ color: "var(--app-success)" }}
    >
      <path d="M4.5 10.5l3.5 3.5 7.5-8" />
    </svg>
  );
}
