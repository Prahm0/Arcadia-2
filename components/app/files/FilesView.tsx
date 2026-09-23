"use client";

import Link from "next/link";
import { useProfile } from "@/lib/api/profile";
import { SUBJECT_COLORS } from "@/lib/app/categoryColors";
import EmptyState from "../EmptyState";
import PageHeader from "../PageHeader";
import { appButtonClass } from "../AppButton";
import { SubjectTag } from "../cards/shared";
import ResourcesSection from "../profile/ResourcesSection";

/**
 * Every file Arcad has read, one section per subject: the syllabus, then
 * the textbook chapters, handouts and notes. Same files as each subject's
 * page, all in one place.
 */
export default function FilesView() {
  const { state, refresh } = useProfile();
  const subjects = state.status === "ready" ? state.data.subjects : [];
  const count = subjects.reduce((sum, subject) => sum + subject.resources.length + (subject.syllabus ? 1 : 0), 0);

  return (
    <>
      <PageHeader width={820}
        eyebrow="Resources"
        title="Files"
        meta={state.status === "ready" && subjects.length ? `${count} ${count === 1 ? "file" : "files"} across ${subjects.length} ${subjects.length === 1 ? "subject" : "subjects"}` : undefined}
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
            title="Add your subjects first."
            body="Files belong to a subject. Add yours on your profile, then upload syllabuses, textbook chapters and notes here."
            action={
              <Link href="/app/profile#subjects" className={appButtonClass("primary")}>
                Go to subjects
              </Link>
            }
          />
        ) : (
          subjects.map((subject, index) => {
            const href = `/app/profile/subjects/${encodeURIComponent(subject.id)}`;
            return (
              <ResourcesSection
                key={subject.id}
                sectionId={`files-${subject.id}`}
                subject={subject}
                refresh={refresh}
                title={<SubjectTag subject={{ name: subject.name, colour: subject.colour || SUBJECT_COLORS[index % SUBJECT_COLORS.length] }} />}
                meta={
                  <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
                    {subject.syllabus ? (
                      subject.syllabus.stored ? (
                        <a
                          href={`/api/subject-files/${encodeURIComponent(subject.syllabus.id)}`}
                          target="_blank"
                          rel="noreferrer"
                          className="underline decoration-1 underline-offset-2"
                        >
                          Syllabus: {subject.syllabus.filename}
                        </a>
                      ) : (
                        <span>Syllabus: {subject.syllabus.filename}</span>
                      )
                    ) : (
                      <Link href={`${href}#syllabus`} className="underline decoration-1 underline-offset-2">
                        Add the syllabus
                      </Link>
                    )}
                  </span>
                }
              />
            );
          })
        )}
      </div>
    </>
  );
}
