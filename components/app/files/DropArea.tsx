"use client";

import { useRef, useState, type ReactNode } from "react";
import { MATERIAL_ACCEPT, MATERIAL_HINT } from "@/lib/api/subjectMaterials";
import { LockGlyph, UploadGlyph, useUploads, type UploadPreset } from "./UploadProvider";

/**
 * A dashed box to drop files on or click to choose them. By default the
 * upload sheet opens with `preset`; with `onFiles` the caller takes the
 * files itself (inside another sheet, say). On Free it says uploads are on
 * Pro and Max, and clicking explains what they do.
 */
export default function DropArea({
  preset,
  onFiles,
  title = "Drop files here, or choose files",
  hint = MATERIAL_HINT,
  compact = false,
  disabled,
}: {
  preset?: UploadPreset;
  onFiles?: (files: File[]) => void;
  title?: ReactNode;
  hint?: ReactNode;
  compact?: boolean;
  /** Why it can't take files yet, shown in place of the hint. */
  disabled?: string;
}) {
  const { canUpload, choose, openWith } = useUploads();
  const [over, setOver] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const take = (files: File[]) => {
    if (!files.length) return;
    if (onFiles && canUpload) onFiles(files);
    else openWith(files, preset);
  };

  return (
    <>
      {onFiles ? (
        <input
          ref={input}
          type="file"
          multiple
          accept={MATERIAL_ACCEPT}
          className="hidden"
          onChange={(event) => {
            const files = Array.from(event.target.files ?? []);
            event.target.value = "";
            take(files);
          }}
        />
      ) : null}
      <button
        type="button"
        disabled={Boolean(disabled) && canUpload}
        onClick={() => (onFiles && canUpload ? input.current?.click() : choose(preset))}
        onDragEnter={(event) => {
          if (Array.from(event.dataTransfer.types).includes("Files")) setOver(true);
        }}
        onDragOver={(event) => {
          event.preventDefault();
          event.dataTransfer.dropEffect = "copy";
        }}
        onDragLeave={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOver(false);
        }}
        onDrop={(event) => {
          event.preventDefault();
          setOver(false);
          if (!disabled || !canUpload) take(Array.from(event.dataTransfer.files ?? []));
        }}
        className={
          "flex w-full items-center gap-3.5 rounded-md text-left transition-colors ui-hover disabled:cursor-not-allowed disabled:opacity-60 " +
          (compact ? "px-3.5 py-3" : "flex-col px-4 py-7 text-center sm:flex-row sm:px-5 sm:py-5 sm:text-left")
        }
        style={{
          border: `1.5px dashed ${over ? "var(--app-accent)" : "var(--app-border-strong)"}`,
          background: over ? "var(--app-accent-soft)" : undefined,
        }}
      >
        <span
          aria-hidden="true"
          className="grid h-9 w-9 shrink-0 place-items-center rounded-md"
          style={{ background: "var(--app-surface-soft)", boxShadow: "var(--elev-inset)", color: "var(--app-text-muted)" }}
        >
          {canUpload ? <UploadGlyph size={16} /> : <LockGlyph size={15} />}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[14px] font-medium" style={{ color: "var(--app-text)" }}>
            {canUpload ? (over ? "Drop to upload" : title) : "Uploads are on Pro and Max"}
          </span>
          <span className="mt-0.5 block text-[12.5px] leading-snug" style={{ color: "var(--app-text-muted)" }}>
            {canUpload ? disabled || hint : "Arcad reads your syllabus and notes, then plans around them. See what's included."}
          </span>
        </span>
      </button>
    </>
  );
}
