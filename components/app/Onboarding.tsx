"use client";

import { useMemo, useState } from "react";
import { api } from "@/lib/api/client";
import AppButton from "@/components/app/AppButton";
import { cn } from "@/lib/cn";
import { SUBJECT_COLORS } from "@/lib/app/categoryColors";

interface OnboardingProps {
  defaultName: string;
  defaultTimezone: string;
  onComplete: () => void;
}

const SUBJECT_SUGGESTIONS = [
  // Maths
  "General Mathematics",
  "Mathematical Methods",
  "Specialist Mathematics",
  "Essential Mathematics",
  // English
  "English",
  "Literature",
  "English as an Additional Language",
  // Sciences
  "Biology",
  "Chemistry",
  "Physics",
  "Psychology",
  "Marine Science",
  // Humanities
  "Modern History",
  "Ancient History",
  "Geography",
  "Legal Studies",
  "Economics",
  "Business",
  "Study of Religion",
  // Tech & Design
  "Digital Solutions",
  "Design",
  "Engineering",
  "Industrial Technology Skills",
  // Arts & lifestyle
  "Music",
  "Music Extension",
  "Visual Art",
  "Drama",
  "Film, Television & New Media",
  "Dance",
  "Physical Education",
  "Health",
  "Food & Nutrition",
  // Languages
  "Japanese",
  "Chinese",
  "French",
  "Spanish",
  "German",
  "Italian",
  "Indonesian",
] as const;

const GRADE_OPTIONS = ["Year 10", "Year 11", "Year 12", "First year uni", "Second year+", "Other"] as const;

type StepKey = "you" | "subjects" | "life" | "focus";
const STEPS: { key: StepKey; label: string; eyebrow: string }[] = [
  { key: "you",      label: "You",      eyebrow: "Step 1 · Who you are" },
  { key: "subjects", label: "Subjects", eyebrow: "Step 2 · What you're studying" },
  { key: "life",     label: "Life",     eyebrow: "Step 3 · When you're around" },
  { key: "focus",    label: "Focus",    eyebrow: "Step 4 · How you study" },
];

/**
 * Four-slide onboarding. Each slide holds one facet of the plan so a
 * first-time student never sees a wall of fields. Progress dots at the top,
 * Back/Continue at the bottom, final slide builds the plan and hands off.
 */
export default function Onboarding({ defaultName, defaultTimezone, onComplete }: OnboardingProps) {
  const [step, setStep] = useState(0);
  const [name, setName] = useState(defaultName);
  const [grade, setGrade] = useState("Year 12");
  const [selectedSubjects, setSelectedSubjects] = useState<string[]>([
    "Mathematical Methods",
    "English",
    "Chemistry",
    "Physics",
  ]);
  const [subjectDraft, setSubjectDraft] = useState("");
  const [wakeTime, setWakeTime] = useState("06:30");
  const [bedtime, setBedtime] = useState("22:30");
  const [maxDaily, setMaxDaily] = useState(180);
  const [sessionMinutes, setSessionMinutes] = useState(60);
  const [breakMinutes, setBreakMinutes] = useState(15);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const currentStep = STEPS[step];

  const canContinue = useMemo(() => {
    if (currentStep.key === "you") return name.trim().length > 0 && grade.trim().length > 0;
    if (currentStep.key === "subjects") return selectedSubjects.length >= 1;
    if (currentStep.key === "life") return Boolean(wakeTime && bedtime);
    return true;
  }, [currentStep.key, name, grade, selectedSubjects.length, wakeTime, bedtime]);

  function toggleSubject(subject: string) {
    const trimmed = subject.trim();
    if (!trimmed) return;
    setSelectedSubjects((prev) =>
      prev.includes(trimmed) ? prev.filter((s) => s !== trimmed) : [...prev, trimmed],
    );
  }

  function addCustomSubject() {
    const trimmed = subjectDraft.trim();
    if (!trimmed) return;
    if (!selectedSubjects.includes(trimmed)) {
      setSelectedSubjects((prev) => [...prev, trimmed]);
    }
    setSubjectDraft("");
  }

  async function submit() {
    setError(null);
    setLoading(true);
    try {
      await api("/api/onboarding", {
        method: "POST",
        body: JSON.stringify({
          name,
          grade,
          timezone: defaultTimezone,
          subjects: selectedSubjects.map((subjectName, index) => ({
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
            breakMinutes,
          },
        }),
      });
      onComplete();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setLoading(false);
    }
  }

  function next() {
    if (!canContinue) return;
    if (step < STEPS.length - 1) {
      setStep((s) => s + 1);
    } else {
      void submit();
    }
  }

  function back() {
    setStep((s) => Math.max(0, s - 1));
  }

  return (
    <div className="mx-auto flex min-h-svh w-full max-w-[560px] flex-col px-5 py-10 sm:px-8 sm:py-16">
      {/* Progress dots */}
      <ol className="flex items-center gap-2" aria-label="Onboarding progress">
        {STEPS.map((s, i) => {
          const state = i < step ? "done" : i === step ? "active" : "pending";
          return (
            <li key={s.key} className="flex-1">
              <span
                className="block h-1 rounded-full transition-colors"
                style={{
                  background:
                    state === "done"
                      ? "var(--app-accent)"
                      : state === "active"
                        ? "var(--app-accent)"
                        : "var(--app-border)",
                  opacity: state === "pending" ? 1 : state === "done" ? 0.6 : 1,
                }}
                aria-label={`Step ${i + 1}: ${s.label}${state === "done" ? " (done)" : state === "active" ? " (current)" : ""}`}
              />
            </li>
          );
        })}
      </ol>

      <div key={currentStep.key} className="mt-10 hero-fade-up">
        <p className="type-eyebrow" style={{ color: "var(--app-text-muted)" }}>
          {currentStep.eyebrow}
        </p>
        <h1
          className="mt-2 text-[32px] font-medium leading-[1.1] tracking-[-0.02em] sm:text-[40px]"
          style={{ color: "var(--app-text)" }}
        >
          {currentStep.key === "you" && <>Tell me who I'm <span className="accent-serif">planning</span> for.</>}
          {currentStep.key === "subjects" && <>What are you actually <span className="accent-serif">studying</span>?</>}
          {currentStep.key === "life" && <>When are you <span className="accent-serif">awake</span>?</>}
          {currentStep.key === "focus" && <>How long do you <span className="accent-serif">lock in</span>?</>}
        </h1>
        <p className="mt-3 text-[15px]" style={{ color: "var(--app-text-muted)" }}>
          {currentStep.key === "you" && "Your name goes on greetings and streak nudges. Grade helps set expectations."}
          {currentStep.key === "subjects" && "Pick everything you'd want a study block for. You can add and remove any of these later."}
          {currentStep.key === "life" && "Study never gets scheduled outside these hours, so sleep stays real."}
          {currentStep.key === "focus" && "The Focus timer uses these as its default preset — always adjustable per session."}
        </p>
      </div>

      <div className="mt-8 flex-1">
        {currentStep.key === "you" ? (
          <div className="flex flex-col gap-5">
            <FormField label="Name">
              <FormInput required value={name} onChange={setName} placeholder="Your first name" />
            </FormField>
            <FormField label="Grade">
              <div className="flex flex-wrap gap-2">
                {GRADE_OPTIONS.map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setGrade(option)}
                    className="rounded-full px-3 py-1.5 text-[13px] font-medium transition-colors"
                    style={{
                      background: grade === option ? "var(--app-accent-soft)" : "transparent",
                      color: grade === option ? "var(--app-accent-strong)" : "var(--app-text-soft)",
                      border: "1px solid var(--app-border-strong)",
                    }}
                  >
                    {option}
                  </button>
                ))}
              </div>
              {grade === "Other" ? (
                <FormInput value={grade === "Other" ? "" : grade} onChange={setGrade} placeholder="e.g. Postgraduate" />
              ) : null}
            </FormField>
          </div>
        ) : null}

        {currentStep.key === "subjects" ? (
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap gap-1.5">
              {[...SUBJECT_SUGGESTIONS, ...selectedSubjects.filter((s) => !SUBJECT_SUGGESTIONS.includes(s as (typeof SUBJECT_SUGGESTIONS)[number]))].map((subject) => {
                const active = selectedSubjects.includes(subject);
                return (
                  <button
                    key={subject}
                    type="button"
                    onClick={() => toggleSubject(subject)}
                    className={cn(
                      "rounded-full px-3 py-1.5 text-[13px] font-medium transition-colors",
                    )}
                    style={{
                      background: active ? "var(--app-accent-soft)" : "transparent",
                      color: active ? "var(--app-accent-strong)" : "var(--app-text-soft)",
                      border: `1px solid ${active ? "var(--app-accent)" : "var(--app-border-strong)"}`,
                    }}
                  >
                    {active ? "✓ " : ""}{subject}
                  </button>
                );
              })}
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={subjectDraft}
                onChange={(e) => setSubjectDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addCustomSubject();
                  }
                }}
                maxLength={60}
                placeholder="Add another…"
                className="flex-1 rounded-md px-3 py-2.5 text-[14.5px] outline-none"
                style={{
                  background: "var(--app-surface-soft)", boxShadow: "var(--elev-inset)",
                  color: "var(--app-text)",
                }}
              />
              <AppButton type="button" variant="secondary" onClick={addCustomSubject}>
                Add
              </AppButton>
            </div>
            <p className="type-mono-label" style={{ color: "var(--app-text-muted)" }}>
              {selectedSubjects.length} selected · at least 1 needed
            </p>
          </div>
        ) : null}

        {currentStep.key === "life" ? (
          <div className="flex flex-col gap-5">
            <div className="grid grid-cols-2 gap-4">
              <FormField label="Wake time">
                <FormInput type="time" required value={wakeTime} onChange={setWakeTime} />
              </FormField>
              <FormField label="Bedtime">
                <FormInput type="time" required value={bedtime} onChange={setBedtime} />
              </FormField>
            </div>
            <FormField
              label={
                <>
                  Max daily study{" "}
                  <span className="ml-2 font-mono" style={{ color: "var(--app-text-muted)" }}>
                    {Math.round(maxDaily / 60)} hr {maxDaily % 60 ? `${maxDaily % 60} min` : ""}
                  </span>
                </>
              }
            >
              <input
                type="range"
                min={60}
                max={360}
                step={15}
                value={maxDaily}
                onChange={(e) => setMaxDaily(Number(e.target.value))}
                className="mt-3 w-full"
                style={{ accentColor: "var(--app-accent)" }}
              />
            </FormField>
          </div>
        ) : null}

        {currentStep.key === "focus" ? (
          <div className="flex flex-col gap-5">
            <FormField
              label={
                <>
                  Preferred session length{" "}
                  <span className="ml-2 font-mono" style={{ color: "var(--app-text-muted)" }}>
                    {sessionMinutes} min
                  </span>
                </>
              }
            >
              <input
                type="range"
                min={25}
                max={90}
                step={5}
                value={sessionMinutes}
                onChange={(e) => setSessionMinutes(Number(e.target.value))}
                className="mt-3 w-full"
                style={{ accentColor: "var(--app-accent)" }}
              />
            </FormField>
            <FormField
              label={
                <>
                  Break between sessions{" "}
                  <span className="ml-2 font-mono" style={{ color: "var(--app-text-muted)" }}>
                    {breakMinutes} min
                  </span>
                </>
              }
            >
              <input
                type="range"
                min={5}
                max={30}
                step={5}
                value={breakMinutes}
                onChange={(e) => setBreakMinutes(Number(e.target.value))}
                className="mt-3 w-full"
                style={{ accentColor: "var(--app-accent)" }}
              />
            </FormField>
          </div>
        ) : null}

        {error ? (
          <p role="alert" className="mt-4 text-[13.5px]" style={{ color: "var(--app-danger)" }}>
            {error}
          </p>
        ) : null}
      </div>

      {/* Nav */}
      <div className="mt-8 flex items-center justify-between">
        <AppButton
          type="button"
          variant="ghost"
          onClick={back}
          disabled={step === 0}
        >
          Back
        </AppButton>
        <AppButton
          type="button"
          variant="primary"
          onClick={next}
          loading={loading}
          disabled={!canContinue}
        >
          {step === STEPS.length - 1 ? "Build my plan" : "Continue"}
        </AppButton>
      </div>
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
  value, onChange, type = "text", required, disabled, placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  type?: string;
  required?: boolean;
  disabled?: boolean;
  placeholder?: string;
}) {
  return (
    <input
      type={type}
      required={required}
      disabled={disabled}
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-md px-3 py-2.5 text-[15px] outline-none disabled:opacity-60"
      style={{
        background: "var(--app-surface-soft)", boxShadow: "var(--elev-inset)",
        color: "var(--app-text)",
      }}
    />
  );
}
