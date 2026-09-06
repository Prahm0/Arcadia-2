"use client";

import { useMemo, useState } from "react";
import { api } from "@/lib/api/client";
import AppButton from "@/components/app/AppButton";
import { cn } from "@/lib/cn";

interface OnboardingProps {
  defaultName: string;
  defaultTimezone: string;
  onComplete: () => void;
}

const SUBJECT_COLORS = ["#7c5cff", "#38bdf8", "#34d399", "#f59e0b", "#f472b6", "#fb7185"];

export default function Onboarding({ defaultName, defaultTimezone, onComplete }: OnboardingProps) {
  const [name, setName] = useState(defaultName);
  const [grade, setGrade] = useState("Year 12");
  const [subjectsInput, setSubjectsInput] = useState("Mathematical Methods, English, Chemistry, Physics");
  const [wakeTime, setWakeTime] = useState("06:30");
  const [bedtime, setBedtime] = useState("22:30");
  const [maxDaily, setMaxDaily] = useState(180);
  const [sessionMinutes, setSessionMinutes] = useState(60);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const subjects = useMemo(
    () =>
      subjectsInput
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    [subjectsInput],
  );

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await api("/api/onboarding", {
        method: "POST",
        body: JSON.stringify({
          name,
          grade,
          timezone: defaultTimezone,
          subjects: subjects.map((subjectName, index) => ({
            name: subjectName,
            color: SUBJECT_COLORS[index % SUBJECT_COLORS.length],
            priority: 2,
          })),
          tasks: [],
          commitments: [],
          preferences: {
            wakeTime,
            bedtime,
            minimumSleepMinutes: 480,
            maxDailyStudyMinutes: maxDaily,
            preferredSessionMinutes: sessionMinutes,
            breakMinutes: 15,
          },
        }),
      });
      onComplete();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto flex max-w-[560px] flex-col px-5 py-14 sm:px-8">
      <p className="type-eyebrow" style={{ color: "var(--app-text-muted)" }}>Set up</p>
      <h1 className="mt-3 text-[36px] font-medium leading-[1.05] tracking-[-0.02em] sm:text-[44px]" style={{ color: "var(--app-text)" }}>
        Tell Arcadia about your life.
      </h1>
      <p className="mt-3 text-[15px]" style={{ color: "var(--app-text-muted)" }}>
        Two minutes now saves you an hour every week. We'll use this to build your first schedule.
      </p>

      <form onSubmit={submit} className="mt-10 space-y-6">
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <FormField label="Name">
            <FormInput required value={name} onChange={(v) => setName(v)} />
          </FormField>
          <FormField label="School year">
            <FormInput required value={grade} onChange={(v) => setGrade(v)} />
          </FormField>
        </div>

        <FormField label="Your subjects">
          <textarea
            required
            value={subjectsInput}
            onChange={(event) => setSubjectsInput(event.target.value)}
            rows={2}
            className={cn(
              "w-full rounded-[10px] px-3 py-2.5 text-[15px] outline-none",
            )}
            style={{
              background: "var(--app-surface-soft)",
              border: "1px solid var(--app-border)",
              color: "var(--app-text)",
            }}
          />
          <div className="mt-3 flex flex-wrap gap-1.5">
            {subjects.map((subject, index) => (
              <span
                key={subject}
                className="rounded-full px-2.5 py-1 text-[12px]"
                style={{
                  color: "var(--app-text-soft)",
                  border: `1px solid ${SUBJECT_COLORS[index % SUBJECT_COLORS.length]}55`,
                  background: `${SUBJECT_COLORS[index % SUBJECT_COLORS.length]}0f`,
                }}
              >
                {subject}
              </span>
            ))}
          </div>
          <p className="mt-2 text-[12px]" style={{ color: "var(--app-text-muted)" }}>
            Comma-separated. You can add more later.
          </p>
        </FormField>

        <div className="grid grid-cols-2 gap-5">
          <FormField label="Wake time">
            <FormInput type="time" required value={wakeTime} onChange={(v) => setWakeTime(v)} />
          </FormField>
          <FormField label="Bedtime">
            <FormInput type="time" required value={bedtime} onChange={(v) => setBedtime(v)} />
          </FormField>
        </div>

        <FormField label={<>Max daily study <span className="ml-2 font-mono" style={{ color: "var(--app-text-muted)" }}>{Math.round(maxDaily / 60)} hr {maxDaily % 60 ? `${maxDaily % 60} min` : ""}</span></>}>
          <input
            type="range"
            min={60}
            max={360}
            step={15}
            value={maxDaily}
            onChange={(event) => setMaxDaily(Number(event.target.value))}
            className="mt-3 w-full"
            style={{ accentColor: "var(--app-accent)" }}
          />
        </FormField>

        <FormField label={<>Preferred session length <span className="ml-2 font-mono" style={{ color: "var(--app-text-muted)" }}>{sessionMinutes} min</span></>}>
          <input
            type="range"
            min={25}
            max={90}
            step={5}
            value={sessionMinutes}
            onChange={(event) => setSessionMinutes(Number(event.target.value))}
            className="mt-3 w-full"
            style={{ accentColor: "var(--app-accent)" }}
          />
        </FormField>

        {error ? (
          <p role="alert" className="text-[13.5px]" style={{ color: "var(--app-danger)" }}>{error}</p>
        ) : null}

        <AppButton type="submit" variant="primary" loading={loading} className="w-full">
          Build my plan
        </AppButton>
      </form>
    </div>
  );
}

function FormField({ label, children }: { label: React.ReactNode; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-2 block text-[12.5px] font-medium" style={{ color: "var(--app-text-muted)" }}>
        {label}
      </span>
      {children}
    </label>
  );
}

function FormInput({
  value, onChange, type = "text", required, disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  type?: string;
  required?: boolean;
  disabled?: boolean;
}) {
  return (
    <input
      type={type}
      required={required}
      disabled={disabled}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-[10px] px-3 py-2.5 text-[15px] outline-none disabled:opacity-60"
      style={{
        background: "var(--app-surface-soft)",
        border: "1px solid var(--app-border)",
        color: "var(--app-text)",
      }}
    />
  );
}
