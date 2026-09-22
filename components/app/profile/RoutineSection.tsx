"use client";

import { useState } from "react";
import { updateProfile, type ProfileRoutine } from "@/lib/api/profile";
import { formatWeekly } from "@/lib/app/studyTargets";
import AppButton from "../AppButton";
import type { SectionProps } from "./ProfileView";
import { Label, Section, TextInput } from "./ui";

/** The box the planner works inside. Saving replans the week. */
export default function RoutineSection({ data, replace, replanned }: SectionProps) {
  // Keyed on the saved routine so drafts reset when the server copy changes.
  return (
    <Section id="routine" title="Study routine" meta="The hours and limits Arcad plans inside.">
      <RoutineForm
        key={JSON.stringify(data.routine)}
        saved={data.routine}
        onSave={async (routine) => {
          replace(await updateProfile(routine));
          await replanned();
        }}
      />
    </Section>
  );
}

function RoutineForm({
  saved,
  onSave,
}: {
  saved: ProfileRoutine;
  onSave: (routine: ProfileRoutine) => Promise<void>;
}) {
  const [routine, setRoutine] = useState(saved);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dirty = JSON.stringify(routine) !== JSON.stringify(saved);
  const set = <K extends keyof ProfileRoutine>(key: K, value: ProfileRoutine[K]) =>
    setRoutine((prev) => ({ ...prev, [key]: value }));

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await onSave(routine);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save.");
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <div className="grid grid-cols-2 gap-4 sm:max-w-[360px]">
        <Label text="Wake up">
          <TextInput type="time" required value={routine.wakeTime} onChange={(value) => set("wakeTime", value)} />
        </Label>
        <Label text="Bedtime">
          <TextInput type="time" required value={routine.bedtime} onChange={(value) => set("bedtime", value)} />
        </Label>
      </div>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
        <Range
          label="Daily study limit"
          value={routine.maxDailyStudyMinutes}
          display={formatWeekly(routine.maxDailyStudyMinutes)}
          min={60}
          max={360}
          step={15}
          onChange={(value) => set("maxDailyStudyMinutes", value)}
          hint={`Up to ${formatWeekly(routine.maxDailyStudyMinutes * 7)} a week`}
        />
        <Range
          label="Session length"
          value={routine.preferredSessionMinutes}
          display={`${routine.preferredSessionMinutes} min`}
          min={25}
          max={90}
          step={5}
          onChange={(value) => set("preferredSessionMinutes", value)}
        />
        <Range
          label="Break between"
          value={routine.breakMinutes}
          display={`${routine.breakMinutes} min`}
          min={5}
          max={30}
          step={5}
          onChange={(value) => set("breakMinutes", value)}
        />
      </div>

      <div className="flex flex-wrap items-center justify-end gap-3">
        {error ? (
          <p role="alert" className="mr-auto text-[13px]" style={{ color: "var(--app-danger)" }}>
            {error}
          </p>
        ) : null}
        {dirty ? (
          <AppButton type="button" variant="ghost" onClick={() => setRoutine(saved)}>
            Reset
          </AppButton>
        ) : null}
        <AppButton type="submit" variant="primary" loading={saving} disabled={!dirty}>
          Save and replan
        </AppButton>
      </div>
    </form>
  );
}

function Range({
  label,
  value,
  display,
  min,
  max,
  step,
  onChange,
  hint,
}: {
  label: string;
  value: number;
  display: string;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
  hint?: string;
}) {
  return (
    <label className="block">
      <span className="flex items-baseline justify-between gap-2">
        <span className="text-[12.5px] font-medium" style={{ color: "var(--app-text-muted)" }}>
          {label}
        </span>
        <span className="font-mono text-[13px]" style={{ color: "var(--app-text)" }}>
          {display}
        </span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="mt-3 w-full"
        style={{ accentColor: "var(--app-accent)" }}
      />
      {hint ? (
        <span className="mt-1 block text-[12px]" style={{ color: "var(--app-text-muted)" }}>
          {hint}
        </span>
      ) : null}
    </label>
  );
}
