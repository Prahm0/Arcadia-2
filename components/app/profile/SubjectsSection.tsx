"use client";

import Link from "next/link";
import { useState } from "react";
import { api } from "@/lib/api/client";
import type { ProfileSubject } from "@/lib/api/profile";
import { SUBJECT_COLORS } from "@/lib/app/categoryColors";
import { formatDateSpan } from "@/lib/api/subjectMaterials";
import { formatWeekly, suggestedWeeklyMinutes } from "@/lib/app/studyTargets";
import AppButton from "../AppButton";
import type { SectionProps } from "./ProfileView";
import { ColourSwatches, Label, Section, Sheet, TextInput, WeeklyStepper, formatHoursMinutes } from "./ui";

export default function SubjectsSection({ data, replanned }: SectionProps) {
  const [adding, setAdding] = useState(false);
  const active = data.subjects.filter((subject) => subject.weeklyMinutes > 0);
  const weekly = active.reduce((sum, subject) => sum + subject.weeklyMinutes, 0);

  return (
    <Section
      id="subjects"
      title="Subjects"
      meta={
        data.subjects.length
          ? `${formatWeekly(weekly)} a week across ${active.length} ${active.length === 1 ? "subject" : "subjects"}`
          : "What you're studying this year"
      }
      action={
        <AppButton variant="secondary" size="sm" onClick={() => setAdding(true)} icon={<PlusIcon />}>
          Add subject
        </AppButton>
      }
    >
      {data.subjects.length === 0 ? (
        <p className="text-[14px]" style={{ color: "var(--app-text-muted)" }}>
          Add the subjects you take and Arcad will plan time for each one every week.
        </p>
      ) : (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {data.subjects.map((subject, index) => (
            <li key={subject.id}>
              <SubjectCard subject={subject} fallback={SUBJECT_COLORS[index % SUBJECT_COLORS.length]} />
            </li>
          ))}
        </ul>
      )}

      <AddSubjectSheet
        open={adding}
        onClose={() => setAdding(false)}
        grade={data.profile.grade}
        taken={data.subjects}
        onSaved={replanned}
      />
    </Section>
  );
}

function SubjectCard({ subject, fallback }: { subject: ProfileSubject; fallback: string }) {
  const colour = subject.colour || fallback;
  const off = subject.weeklyMinutes <= 0;
  const done = Math.min(subject.weekDoneMinutes, subject.weeklyMinutes);
  const donePct = off ? 0 : Math.min(100, (done / subject.weeklyMinutes) * 100);
  const plannedPct = off
    ? 0
    : Math.min(100 - donePct, (subject.weekPlannedMinutes / subject.weeklyMinutes) * 100);

  return (
    <Link
      href={`/app/profile/subjects/${encodeURIComponent(subject.id)}`}
      className="group flex h-full flex-col rounded-md p-4 transition-colors ui-hover"
      style={{ border: "1px solid var(--app-border)" }}
    >
      <div className="flex items-start justify-between gap-3">
        <span className="flex min-w-0 items-center gap-2">
          <span className="truncate text-[14.5px] font-medium" style={{ color: `color-mix(in oklab, ${colour} 70%, var(--app-text))` }}>
            {subject.name}
          </span>
        </span>
        {subject.targetGrade ? (
          <span
            className="shrink-0 rounded px-1.5 py-0.5 text-[11.5px] font-medium"
            style={{ background: "var(--app-surface-soft)", color: "var(--app-text-soft)" }}
          >
            Aiming for {subject.targetGrade}
          </span>
        ) : null}
      </div>

      <p className="mt-3 text-[13px]" style={{ color: off ? "var(--app-text-muted)" : "var(--app-text-soft)" }}>
        {off ? (
          "No weekly study time"
        ) : (
          <>
            <span className="tabular-nums">{formatWeekly(subject.weeklyMinutes)}</span> a week
            {subject.weeklyMinutesSuggested ? (
              <span style={{ color: "var(--app-text-muted)" }}> · suggested</span>
            ) : null}
          </>
        )}
      </p>

      {off ? null : (
        <>
          <div
            className="mt-2.5 flex h-1.5 overflow-hidden rounded-[1px]"
            style={{ background: "var(--app-surface-soft)" }}
            role="img"
            aria-label={`${formatHoursMinutes(subject.weekDoneMinutes)} done and ${formatHoursMinutes(subject.weekPlannedMinutes)} planned of ${formatWeekly(subject.weeklyMinutes)} this week`}
          >
            <span style={{ width: `${donePct}%`, background: colour }} />
            <span style={{ width: `${plannedPct}%`, background: `color-mix(in oklab, ${colour} 35%, transparent)` }} />
          </div>
          <p className="mt-1.5 text-[12px]" style={{ color: "var(--app-text-muted)" }}>
            {subject.weekDoneMinutes > 0 ? `${formatHoursMinutes(subject.weekDoneMinutes)} done` : "Not started"}
            {subject.weekPlannedMinutes > 0 ? ` · ${formatHoursMinutes(subject.weekPlannedMinutes)} planned` : ""}
          </p>
        </>
      )}

      {subject.currentTopic || subject.nextAssessment ? (
        <div className="mt-3 space-y-0.5 text-[12.5px] leading-snug" style={{ color: "var(--app-text-soft)" }}>
          {subject.currentTopic ? (
            <p className="truncate">
              <span style={{ color: "var(--app-text-muted)" }}>{subject.currentTopic.upcoming ? "Next: " : "Now: "}</span>
              {subject.currentTopic.title}
            </p>
          ) : null}
          {subject.nextAssessment ? (
            <p className="truncate">
              <span style={{ color: "var(--app-text-muted)" }}>Due: </span>
              {subject.nextAssessment.title} · {formatDateSpan(subject.nextAssessment.dueOn, null)}
            </p>
          ) : null}
        </div>
      ) : subject.notes.trim() ? (
        <p className="mt-3 line-clamp-2 text-[12.5px] leading-snug" style={{ color: "var(--app-text-muted)" }}>
          {subject.notes}
        </p>
      ) : null}
    </Link>
  );
}

interface AddSubjectProps {
  onClose: () => void;
  grade: string | null;
  taken: ProfileSubject[];
  onSaved: () => Promise<void>;
}

function AddSubjectSheet({ open, ...props }: AddSubjectProps & { open: boolean }) {
  return (
    <Sheet open={open} eyebrow="Add" title="New subject" onClose={props.onClose}>
      {/* Mounted only while open, so each open starts blank. */}
      <AddSubjectForm {...props} />
    </Sheet>
  );
}

function AddSubjectForm({ onClose, grade, taken, onSaved }: AddSubjectProps) {
  const suggested = suggestedWeeklyMinutes(grade ?? "");
  const [name, setName] = useState("");
  // First palette colour no other subject is using.
  const [colour, setColour] = useState<string>(() => {
    const used = new Set(taken.map((subject) => subject.colour?.toLowerCase()));
    return SUBJECT_COLORS.find((option) => !used.has(option.toLowerCase())) ?? SUBJECT_COLORS[0];
  });
  const [minutes, setMinutes] = useState(suggested);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await api("/api/subjects", {
        method: "POST",
        // Left at the suggestion, it stays "suggested" and follows year level.
        body: JSON.stringify({ name, colour, weeklyMinutes: minutes === suggested ? null : minutes }),
      });
      await onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't add it.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <Label text="Subject">
        <TextInput required value={name} onChange={setName} maxLength={80} placeholder="e.g. Literature" />
      </Label>
      <div>
        <p className="mb-2 text-[12.5px] font-medium" style={{ color: "var(--app-text-muted)" }}>
          Colour
        </p>
        <ColourSwatches value={colour} onChange={setColour} label="Subject colour" />
      </div>
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-[12.5px] font-medium" style={{ color: "var(--app-text-muted)" }}>
            Time each week
          </p>
          <p className="mt-0.5 text-[12px]" style={{ color: "var(--app-text-muted)" }}>
            Suggested for {grade || "your year"}: {formatWeekly(suggested)}
          </p>
        </div>
        <WeeklyStepper minutes={minutes} onChange={setMinutes} label={name || "this subject"} />
      </div>

      {error ? (
        <p role="alert" className="text-[13.5px]" style={{ color: "var(--app-danger)" }}>
          {error}
        </p>
      ) : null}

      <div className="flex justify-end gap-2 pt-2">
        <AppButton type="button" variant="ghost" onClick={onClose}>
          Cancel
        </AppButton>
        <AppButton type="submit" variant="primary" loading={saving}>
          Add subject
        </AppButton>
      </div>
    </form>
  );
}

export function PlusIcon() {
  return (
    <svg viewBox="0 0 20 20" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path d="M10 4v12M4 10h12" strokeLinecap="round" />
    </svg>
  );
}
