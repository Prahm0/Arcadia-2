"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/api/client";
import { formatDueSoon } from "@/lib/api/time";
import { useProfile, type ProfileSubject } from "@/lib/api/profile";
import { useDashboardData } from "@/lib/app/DashboardProvider";
import { SUBJECT_COLORS } from "@/lib/app/categoryColors";
import { formatWeekly, suggestedWeeklyMinutes } from "@/lib/app/studyTargets";
import AppButton from "../AppButton";
import { ColourSwatches, Label, Section, TextArea, TextInput, WeeklyStepper, formatHoursMinutes } from "./ui";

const NOTES_LIMIT = 2000;

/**
 * One subject: how much time it gets, what the student is aiming for, and
 * the note Arcad reads whenever it plans or talks about it.
 */
export default function SubjectView({ subjectId }: { subjectId: string }) {
  const { state, refresh } = useProfile();

  if (state.status === "loading") {
    return (
      <div className="grid min-h-[50svh] place-items-center">
        <div
          aria-label="Loading"
          className="h-6 w-6 animate-spin rounded-full border-2"
          style={{ borderColor: "var(--app-border)", borderTopColor: "var(--app-accent)" }}
        />
      </div>
    );
  }

  const subject = state.status === "ready" ? state.data.subjects.find((item) => item.id === subjectId) : undefined;
  if (!subject) {
    return (
      <div className="mx-auto flex max-w-[420px] flex-col items-center gap-4 px-6 py-20 text-center">
        <p className="text-[15px]" style={{ color: "var(--app-text)" }}>
          {state.status === "error" ? "Couldn't load this subject." : "This subject isn't on your profile."}
        </p>
        <Link href="/app/profile" className="text-[14px] underline" style={{ color: "var(--app-accent-strong)" }}>
          Back to your profile
        </Link>
      </div>
    );
  }

  const index = state.status === "ready" ? state.data.subjects.indexOf(subject) : 0;
  return (
    <SubjectEditor
      // Fresh drafts whenever the saved subject changes.
      key={JSON.stringify(subject)}
      subject={subject}
      fallbackColour={SUBJECT_COLORS[index % SUBJECT_COLORS.length]}
      grade={state.status === "ready" ? state.data.profile.grade : null}
      refresh={refresh}
    />
  );
}

function SubjectEditor({
  subject,
  fallbackColour,
  grade,
  refresh,
}: {
  subject: ProfileSubject;
  fallbackColour: string;
  grade: string | null;
  refresh: () => Promise<void>;
}) {
  const router = useRouter();
  const { data, reload } = useDashboardData();
  const suggested = suggestedWeeklyMinutes(grade ?? "");

  const [name, setName] = useState(subject.name);
  const [colour, setColour] = useState(subject.colour || fallbackColour);
  // null = follow the year-level suggestion.
  const [weekly, setWeekly] = useState<number | null>(subject.weeklyMinutesSuggested ? null : subject.weeklyMinutes);
  const [targetGrade, setTargetGrade] = useState(subject.targetGrade ?? "");
  const [notes, setNotes] = useState(subject.notes);
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const minutes = weekly ?? suggested;
  const dirty =
    name.trim() !== subject.name ||
    colour !== (subject.colour || fallbackColour) ||
    weekly !== (subject.weeklyMinutesSuggested ? null : subject.weeklyMinutes) ||
    targetGrade.trim() !== (subject.targetGrade ?? "") ||
    notes !== subject.notes;

  const upcoming = data.tasks
    .filter((task) => task.status === "pending" && (task.subject ?? "").toLowerCase() === subject.name.toLowerCase())
    .sort((a, b) => Date.parse(a.dueAt) - Date.parse(b.dueAt))
    .slice(0, 6);
  const timezone = data.profile?.timezone || data.user.timezone || "Australia/Brisbane";

  async function save() {
    setSaving(true);
    setError(null);
    try {
      await api(`/api/subjects/${encodeURIComponent(subject.id)}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: name.trim(),
          colour,
          weeklyMinutes: weekly,
          targetGrade: targetGrade.trim() || null,
          notes,
        }),
      });
      await Promise.all([refresh(), reload()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save.");
      setSaving(false);
    }
  }

  async function remove() {
    if (!confirm(`Remove ${subject.name}? Its planned study sessions come off your schedule.`)) return;
    setRemoving(true);
    setError(null);
    try {
      await api(`/api/subjects/${encodeURIComponent(subject.id)}`, { method: "DELETE" });
      await reload();
      router.push("/app/profile#subjects");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't remove it.");
      setRemoving(false);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-[760px] flex-col gap-5 px-4 py-6 pb-28 sm:px-8 sm:py-8">
      <div>
        <Link
          href="/app/profile#subjects"
          className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[13px] ui-hover"
          style={{ color: "var(--app-text-muted)" }}
        >
          <svg viewBox="0 0 20 20" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
            <path d="M12 5l-5 5 5 5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Profile
        </Link>
        <div className="mt-2 flex items-center gap-3">
          <span aria-hidden="true" className="h-3.5 w-3.5 shrink-0 rounded-full" style={{ background: colour }} />
          <h1 className="min-w-0 truncate text-[26px] font-semibold tracking-[-0.02em]" style={{ color: "var(--app-text)" }}>
            {subject.name}
          </h1>
        </div>
        <p className="mt-1 text-[13.5px]" style={{ color: "var(--app-text-muted)" }}>
          {subject.weeklyMinutes > 0
            ? `${formatWeekly(subject.weeklyMinutes)} a week · ${formatHoursMinutes(subject.weekDoneMinutes)} done this week`
            : "No weekly study time"}
          {subject.targetGrade ? ` · aiming for ${subject.targetGrade}` : ""}
        </p>
      </div>

      <Section id="note" title="Note for Arcad" meta={`Arcad reads this whenever it plans or talks about ${subject.name}.`}>
        <TextArea
          value={notes}
          onChange={setNotes}
          maxLength={NOTES_LIMIT}
          rows={5}
          placeholder={`e.g. Weakest on unseen texts. Prefer essay practice on weekends. Our exam text is Hamlet.`}
        />
        <p className="mt-1.5 text-right text-[12px]" style={{ color: "var(--app-text-muted)" }}>
          {notes.length}/{NOTES_LIMIT}
        </p>
      </Section>

      <Section id="time" title="Time and target">
        <div className="space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-[13.5px] font-medium" style={{ color: "var(--app-text)" }}>
                Study time each week
              </p>
              <p className="mt-0.5 text-[12.5px]" style={{ color: "var(--app-text-muted)" }}>
                {weekly === null
                  ? `Suggested for ${grade || "your year"}. Change it any time.`
                  : `Suggested for ${grade || "your year"}: ${formatWeekly(suggested)}.`}
                {weekly !== null && weekly !== suggested ? (
                  <>
                    {" "}
                    <button
                      type="button"
                      onClick={() => setWeekly(null)}
                      className="underline"
                      style={{ color: "var(--app-accent-strong)" }}
                    >
                      Use suggestion
                    </button>
                  </>
                ) : null}
              </p>
            </div>
            <WeeklyStepper minutes={minutes} onChange={setWeekly} label={subject.name} />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Label text="Grade you're aiming for" hint="Whatever your school uses: A, B+, 85%, 7.">
              <TextInput value={targetGrade} onChange={setTargetGrade} maxLength={16} placeholder="e.g. A" />
            </Label>
            <Label text="Name">
              <TextInput required value={name} onChange={setName} maxLength={80} />
            </Label>
          </div>

          <div>
            <p className="mb-2 text-[12.5px] font-medium" style={{ color: "var(--app-text-muted)" }}>
              Colour
            </p>
            <ColourSwatches value={colour} onChange={setColour} label={`${subject.name} colour`} />
          </div>
        </div>
      </Section>

      <Section
        id="coming-up"
        title="Coming up"
        meta={upcoming.length ? undefined : `No deadlines for ${subject.name} right now.`}
        action={
          <Link href="/app/deadlines" className="text-[13px] ui-hover rounded-md px-2 py-1" style={{ color: "var(--app-text-muted)" }}>
            All deadlines
          </Link>
        }
      >
        {upcoming.length ? (
          <ul className="flex flex-col">
            {upcoming.map((task) => (
              <li
                key={task.id}
                className="flex items-center justify-between gap-3 border-b py-2.5 last:border-b-0"
                style={{ borderColor: "var(--app-border)" }}
              >
                <span className="min-w-0 truncate text-[14px]" style={{ color: "var(--app-text)" }}>
                  {task.title}
                </span>
                <span className="shrink-0 text-[12.5px]" style={{ color: "var(--app-text-muted)" }}>
                  {formatDueSoon(task.dueAt, timezone)}
                </span>
              </li>
            ))}
          </ul>
        ) : null}
      </Section>

      <div className="flex justify-start">
        <AppButton variant="danger" onClick={() => void remove()} loading={removing}>
          Remove subject
        </AppButton>
      </div>

      {/* Save bar: only there when something changed. */}
      {dirty || error ? (
        <div
          className="fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom,0)+64px)] z-40 flex justify-center px-4 lg:bottom-6"
          role="region"
          aria-label="Unsaved changes"
        >
          <div
            className="flex w-full max-w-[560px] items-center justify-between gap-3 rounded-lg px-4 py-3"
            style={{ background: "var(--app-elev)", boxShadow: "var(--elev-3)" }}
          >
            <p className="text-[13px]" style={{ color: error ? "var(--app-danger)" : "var(--app-text-soft)" }} role={error ? "alert" : undefined}>
              {error ?? "Unsaved changes"}
            </p>
            <div className="flex gap-2">
              <AppButton
                variant="ghost"
                onClick={() => {
                  setName(subject.name);
                  setColour(subject.colour || fallbackColour);
                  setWeekly(subject.weeklyMinutesSuggested ? null : subject.weeklyMinutes);
                  setTargetGrade(subject.targetGrade ?? "");
                  setNotes(subject.notes);
                  setError(null);
                }}
              >
                Discard
              </AppButton>
              <AppButton variant="primary" onClick={() => void save()} loading={saving} disabled={!name.trim()}>
                Save
              </AppButton>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
