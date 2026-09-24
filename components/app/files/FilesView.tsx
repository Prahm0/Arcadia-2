"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useProfile } from "@/lib/api/profile";
import { SUBJECT_COLORS } from "@/lib/app/categoryColors";
import AppButton, { appButtonClass } from "../AppButton";
import EmptyState from "../EmptyState";
import PageHeader from "../PageHeader";
import { SubjectTag } from "../cards/shared";
import ResourcesSection from "../profile/ResourcesSection";
import DropArea from "./DropArea";
import { LockGlyph, UploadGlyph, useRefreshOnUpload, useUploadPage, useUploads } from "./UploadProvider";

/**
 * Every file Arcad has read, one section per subject: the syllabus, then
 * the textbook chapters, handouts and notes. Upload starts here without
 * picking a subject first; the upload sheet asks which one.
 */
export default function FilesView() {
  const { state, refresh } = useProfile();
  const { canUpload, choose } = useUploads();
  const subjects = useMemo(() => (state.status === "ready" ? state.data.subjects : []), [state]);
  const count = subjects.reduce((sum, subject) => sum + subject.resources.length + (subject.syllabus ? 1 : 0), 0);
  const syllabi = useMemo(
    () => Object.fromEntries(subjects.flatMap((subject) => (subject.syllabus ? [[subject.id, subject.syllabus.filename]] : []))),
    [subjects],
  );
  useUploadPage({ syllabi });
  useRefreshOnUpload(refresh);

  return (
    <>
      <PageHeader width={820}
        eyebrow="Resources"
        title="Files"
        meta={state.status === "ready" && subjects.length ? `${count} ${count === 1 ? "file" : "files"} across ${subjects.length} ${subjects.length === 1 ? "subject" : "subjects"}` : undefined}
        action={
          subjects.length ? (
            <AppButton variant="primary" icon={canUpload ? <UploadGlyph /> : <LockGlyph />} onClick={() => choose({ syllabi })}>
              Upload
            </AppButton>
          ) : undefined
        }
      />
      <div className="mx-auto flex w-full max-w-[820px] flex-col gap-5 px-6 py-8 sm:px-10">
        {state.status === "loading" ? (
          <div className="grid min-h-[40svh] place-items-center">
            <div
              aria-label="Loading"
              className="h-6 w-6 animate-spin rounded-full border-2"
              style={{ borderColor: "var(--app-border)", borderTopColor: "var(--app-accent)" }}
            />
          </div>
        ) : state.status === "error" ? (
          <p role="alert" className="text-[14px]" style={{ color: "var(--app-danger)" }}>
            {state.error}
          </p>
        ) : subjects.length === 0 ? (
          <EmptyState
            title={<>Bring your study material <span className="accent-serif">together</span>.</>}
            body="Files are where Arcad reads your notes, syllabuses, and textbook chapters. Start with a subject, then add the material you use."
            action={
              <Link href="/app/profile#subjects" className={appButtonClass("primary")}>
                Add your subjects
              </Link>
            }
          />
        ) : (
          <>
            <DropArea preset={{ syllabi }} />
            {subjects.map((subject, index) => (
              <ResourcesSection
                key={subject.id}
                sectionId={`files-${subject.id}`}
                subject={subject}
                refresh={refresh}
                includeSyllabus
                syllabi={syllabi}
                title={<SubjectTag subject={{ name: subject.name, colour: subject.colour || SUBJECT_COLORS[index % SUBJECT_COLORS.length] }} />}
                meta={describe(subject.syllabus ? 1 : 0, subject.resources.length)}
              />
            ))}
          </>
        )}
      </div>
    </>
  );
}

/** "Syllabus and 3 notes", "No syllabus yet · 1 note". */
function describe(syllabus: number, notes: number): string {
  const noteText = notes === 1 ? "1 note or handout" : `${notes} notes and handouts`;
  if (syllabus) return notes ? `Syllabus and ${noteText}` : "Syllabus, no notes yet";
  return notes ? `No syllabus yet · ${noteText}` : "Nothing here yet";
}
