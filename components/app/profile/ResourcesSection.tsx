"use client";

import type { ReactNode } from "react";
import { api } from "@/lib/api/client";
import type { ProfileSubject, SubjectFile } from "@/lib/api/profile";
import AppButton from "../AppButton";
import DropArea from "../files/DropArea";
import FileRows from "../files/FileRows";
import { LockGlyph, UploadGlyph, useUploads, type UploadPreset } from "../files/UploadProvider";
import { Section } from "./ui";

/**
 * Textbooks, handouts and notes. Arcad notes what each one covers so a
 * session plan can say "textbook 3.2" instead of "study chemistry". The
 * Files page lists the syllabus here too.
 */
export default function ResourcesSection({
  subject,
  refresh,
  sectionId = "resources",
  title = "Notes & handouts",
  meta = "Class notes, textbook chapters, worksheets. Arcad points you to the right part.",
  includeSyllabus = false,
  syllabi,
}: {
  subject: ProfileSubject;
  refresh: () => Promise<void>;
  /** For a page with one of these per subject. */
  sectionId?: string;
  title?: ReactNode;
  meta?: ReactNode;
  /** List the syllabus first, as the Files page does. */
  includeSyllabus?: boolean;
  /** Every subject's syllabus, so the upload sheet can say what it replaces. */
  syllabi?: Record<string, string>;
}) {
  const { canUpload, items, choose, retry, dismiss } = useUploads();
  const preset: UploadPreset = {
    subjectId: subject.id,
    // Straight to the syllabus when that's what the subject is missing.
    kind: includeSyllabus && !subject.syllabus ? "syllabus" : "resource",
    syllabi,
  };
  const files = includeSyllabus && subject.syllabus ? [subject.syllabus, ...subject.resources] : subject.resources;
  const pending = items.filter(
    (item) => item.subjectId === subject.id && (includeSyllabus || item.kind === "resource"),
  );

  async function remove(file: SubjectFile) {
    await api(`/api/subject-files/${encodeURIComponent(file.id)}`, { method: "DELETE" });
    await refresh();
  }

  return (
    <Section
      id={sectionId}
      title={title}
      meta={meta}
      action={
        <AppButton
          size="sm"
          variant="secondary"
          icon={canUpload ? <UploadGlyph size={13} /> : <LockGlyph size={12} />}
          onClick={() => choose(preset)}
        >
          Upload
        </AppButton>
      }
    >
      <FileRows
        files={files}
        pending={pending}
        onRemove={remove}
        retry={retry}
        dismiss={dismiss}
        empty={
          !canUpload && includeSyllabus ? (
            // The Files page already says uploads are on Pro and Max, once.
            <p className="text-[13px]" style={{ color: "var(--app-text-muted)" }}>
              No files yet.
            </p>
          ) : (
            <DropArea
              compact
              preset={preset}
              title={includeSyllabus ? "Start with the syllabus" : "Add your notes"}
              hint={
                includeSyllabus
                  ? "Arcad plans each session around what's in it. Then add notes and handouts."
                  : "Drop them here or choose files. Arcad can point you to the right material."
              }
            />
          )
        }
      />
    </Section>
  );
}
