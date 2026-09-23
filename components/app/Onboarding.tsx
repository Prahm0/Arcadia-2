"use client";

import { useMemo, useState } from "react";
import { api } from "@/lib/api/client";
import { analytics } from "@/lib/analytics/events";
import AppButton from "@/components/app/AppButton";
import { SUBJECT_COLORS } from "@/lib/app/categoryColors";
import { AU_STATES, countryOptions, guessCountry } from "@/lib/app/countries";
import { fittedWeeklyMinutes, formatWeekly } from "@/lib/app/studyTargets";
import { WEEKDAYS } from "./CommitmentSheet";
import OnboardingBuild from "./OnboardingBuild";
import { Label, Select, TextArea, TextInput, WeeklyStepper } from "./profile/ui";

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

// Same list as the profile header, so what's picked here shows there.
const YEAR_LEVELS = ["Year 10", "Year 11", "Year 12", "First year uni", "Second year+"] as const;

type StepKey = "you" | "subjects" | "going" | "goals" | "week" | "routine" | "deadlines" | "hours" | "arcad";
const STEPS: { key: StepKey; label: string }[] = [
  { key: "you", label: "You" },
  { key: "subjects", label: "Subjects" },
  { key: "going", label: "How it's going" },
  { key: "goals", label: "Goals" },
  { key: "week", label: "Your week" },
  { key: "routine", label: "Routine" },
  { key: "deadlines", label: "Deadlines" },
  { key: "hours", label: "Hours" },
  { key: "arcad", label: "Arcad" },
];

type Going = "well" | "okay" | "hard";
const GOING: { value: Going; label: string; priority: number }[] = [
  { value: "well", label: "Going well", priority: 1 },
  { value: "okay", label: "Okay", priority: 2 },
  { value: "hard", label: "Finding it hard", priority: 3 },
];

interface SubjectDetail {
  going: Going | null;
  targetGrade: string;
  notes: string;
}
const EMPTY_DETAIL: SubjectDetail = { going: null, targetGrade: "", notes: "" };

type ActivityCategory = "sport" | "extracurricular" | "other";
const ACTIVITY_CATEGORIES: { value: ActivityCategory; label: string }[] = [
  { value: "sport", label: "Sport or training" },
  { value: "extracurricular", label: "Club, music or lessons" },
  { value: "other", label: "Work or other" },
];

interface Activity {
  title: string;
  category: ActivityCategory;
  /** 0 = Sunday, as the scheduler counts. */
  days: number[];
  start: string;
  end: string;
}
const EMPTY_ACTIVITY: Activity = { title: "", category: "sport", days: [], start: "16:00", end: "17:30" };

const TASK_TYPES = [
  { value: "assignment", label: "Assignment" },
  { value: "exam", label: "Exam" },
  { value: "homework", label: "Homework" },
  { value: "project", label: "Project" },
];
const TASK_SIZES = [
  { minutes: 60, label: "About an hour" },
  { minutes: 180, label: "A few hours" },
  { minutes: 360, label: "A big one" },
];

interface Deadline {
  title: string;
  subject: string;
  type: string;
  /** YYYY-MM-DD from the date picker. */
  dueOn: string;
  minutes: number;
}
const EMPTY_DEADLINE: Deadline = { title: "", subject: "", type: "assignment", dueOn: "", minutes: 180 };
const MAX_DEADLINES = 8;
const MAX_GOALS = 5;

/** Mon to Fri, in the order a week reads. */
const SCHOOL_DAYS = [1, 2, 3, 4, 5];
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];

/** Fallback when a student picks "I'm not sure yet" on the subjects step. */
const FALLBACK_SUBJECT = "General study";

const validTimes = (start: string, end: string) => Boolean(start && end && start < end);
const toggleDay = (days: number[], day: number) =>
  days.includes(day) ? days.filter((d) => d !== day) : [...days, day].sort((a, b) => a - b);

/**
 * Onboarding asks for everything the profile holds, one topic per screen:
 * who they are, subjects and how each is going, goals, when they can't
 * study, their routine, what's due, how the week splits, and what Arcad
 * should know. The last screen hands it to Arcad, which plans the next month
 * while a progress bar shows each stage (see OnboardingBuild).
 */
export default function Onboarding({ defaultName, defaultTimezone, onComplete }: OnboardingProps) {
  const [step, setStep] = useState(0);
  const [building, setBuilding] = useState(false);

  // You
  const [name, setName] = useState(defaultName);
  const [grade, setGrade] = useState<string>("Year 12");
  const [country, setCountry] = useState(() => guessCountry(defaultTimezone));
  // Australian state, for school term dates. Only asked for in Australia.
  const [state, setState] = useState("");
  const countries = useMemo(() => countryOptions(), []);
  const [school, setSchool] = useState("");

  // Subjects
  const [selectedSubjects, setSelectedSubjects] = useState<string[]>([]);
  const [subjectDraft, setSubjectDraft] = useState("");
  const [subjectSearch, setSubjectSearch] = useState("");
  const [details, setDetails] = useState<Record<string, SubjectDetail>>({});

  // Goals
  const [atar, setAtar] = useState("");
  const [goals, setGoals] = useState<string[]>([]);
  const [goalDraft, setGoalDraft] = useState("");

  // Your week
  const [goesToSchool, setGoesToSchool] = useState(true);
  const [schoolDays, setSchoolDays] = useState<number[]>(SCHOOL_DAYS);
  const [schoolStart, setSchoolStart] = useState("08:30");
  const [schoolEnd, setSchoolEnd] = useState("15:15");
  const [activities, setActivities] = useState<Activity[]>([]);

  // Routine
  const [wakeTime, setWakeTime] = useState("06:30");
  const [bedtime, setBedtime] = useState("22:30");
  const [maxDaily, setMaxDaily] = useState(180);
  const [sessionMinutes, setSessionMinutes] = useState(50);
  const [breakMinutes, setBreakMinutes] = useState(10);

  // Deadlines
  const [deadlines, setDeadlines] = useState<Deadline[]>([]);

  // Hours: only the subjects the student has adjusted. Everything else
  // follows the suggestion, so it keeps up if they go back and change things.
  const [weeklyOverrides, setWeeklyOverrides] = useState<Record<string, number>>({});

  // Arcad
  const [about, setAbout] = useState("");
  const [style, setStyle] = useState("");
  const [memoryEnabled, setMemoryEnabled] = useState(true);

  const currentStep = STEPS[step];
  const australia = country === "AU";
  // An ATAR is Australian, so it's only asked for there, in the senior years.
  const seniorYears = australia && (grade === "Year 10" || grade === "Year 11" || grade === "Year 12");

  const suggestedWeekly = fittedWeeklyMinutes(grade, selectedSubjects.length, maxDaily);
  const weeklyFor = (subject: string) => weeklyOverrides[subject] ?? suggestedWeekly;
  const weeklyTotal = selectedSubjects.reduce((sum, subject) => sum + weeklyFor(subject), 0);
  const weeklyCapacity = maxDaily * 7;
  const colourOf = (subject: string) => {
    const index = selectedSubjects.indexOf(subject);
    return SUBJECT_COLORS[(index < 0 ? 0 : index) % SUBJECT_COLORS.length];
  };
  const detailFor = (subject: string) => details[subject] ?? EMPTY_DETAIL;

  function setDetail(subject: string, patch: Partial<SubjectDetail>) {
    setDetails((prev) => ({ ...prev, [subject]: { ...(prev[subject] ?? EMPTY_DETAIL), ...patch } }));
  }

  const atarNumber = Number(atar);
  const atarValid = !atar.trim() || (Number.isFinite(atarNumber) && atarNumber >= 30 && atarNumber <= 99.95);
  const activityProblem = activities.find(
    (item) => item.title.trim() && (item.days.length === 0 || !validTimes(item.start, item.end)),
  );
  const deadlineProblem = deadlines.find((item) => item.title.trim() && !item.dueOn);

  const blocker = useMemo((): string | null => {
    switch (currentStep.key) {
      case "you":
        return name.trim() ? null : "Add your name to keep going.";
      case "subjects":
        return selectedSubjects.length ? null : "Pick at least one subject.";
      case "goals":
        return atarValid ? null : "An ATAR target is between 30 and 99.95.";
      case "week":
        if (goesToSchool && (schoolDays.length === 0 || !validTimes(schoolStart, schoolEnd))) {
          return "School needs at least one day and an end time after the start.";
        }
        return activityProblem
          ? `${activityProblem.title.trim()} needs a day and an end time after the start.`
          : null;
      case "routine":
        return wakeTime && bedtime ? null : "Add a wake-up time and a bedtime.";
      case "deadlines":
        return deadlineProblem ? `${deadlineProblem.title.trim()} needs a due date.` : null;
      default:
        return null;
    }
  }, [
    currentStep.key, name, selectedSubjects.length, atarValid, goesToSchool, schoolDays.length,
    schoolStart, schoolEnd, activityProblem, wakeTime, bedtime, deadlineProblem,
  ]);

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
    if (!selectedSubjects.includes(trimmed)) setSelectedSubjects((prev) => [...prev, trimmed]);
    setSubjectDraft("");
  }

  function pickImNotSure() {
    // A single generic subject so there's still something to plan. They
    // can swap it for real ones on their profile.
    setSelectedSubjects([FALLBACK_SUBJECT]);
    setSubjectSearch("");
    setSubjectDraft("");
  }

  const filteredSuggestions = useMemo(() => {
    const query = subjectSearch.trim().toLowerCase();
    // Custom subjects always show, so they can be unticked like the rest.
    const extras = selectedSubjects.filter(
      (s) => !SUBJECT_SUGGESTIONS.includes(s as (typeof SUBJECT_SUGGESTIONS)[number]),
    );
    const combined = [...SUBJECT_SUGGESTIONS, ...extras];
    if (!query) return combined;
    return combined.filter((subject) => subject.toLowerCase().includes(query));
  }, [subjectSearch, selectedSubjects]);

  function addGoal() {
    const title = goalDraft.replace(/\s+/g, " ").trim();
    if (!title || goals.length >= MAX_GOALS) return;
    if (!goals.includes(title)) setGoals((prev) => [...prev, title]);
    setGoalDraft("");
  }

  function updateActivity(index: number, patch: Partial<Activity>) {
    setActivities((prev) => prev.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  }

  function updateDeadline(index: number, patch: Partial<Deadline>) {
    setDeadlines((prev) => prev.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  }

  /** Everything collected, shaped for POST /api/onboarding. */
  function payload() {
    const commitments: Array<Record<string, unknown>> = [];
    if (goesToSchool) {
      const everyWeekday = SCHOOL_DAYS.every((day) => schoolDays.includes(day)) && schoolDays.length === 5;
      if (everyWeekday) {
        commitments.push({ title: "School", category: "school", recurrence: "weekdays", startTime: schoolStart, endTime: schoolEnd });
      } else {
        for (const weekday of schoolDays) {
          commitments.push({ title: "School", category: "school", recurrence: "weekly", weekday, startTime: schoolStart, endTime: schoolEnd });
        }
      }
    }
    for (const activity of activities) {
      const title = activity.title.trim();
      if (!title) continue;
      for (const weekday of activity.days) {
        commitments.push({
          title,
          category: activity.category,
          recurrence: "weekly",
          weekday,
          startTime: activity.start,
          endTime: activity.end,
        });
      }
    }

    const tasks = deadlines.flatMap((item) => {
      const title = item.title.trim();
      if (!title || !item.dueOn) return [];
      // The date picker gives a plain date; 5pm keeps it on that day in the
      // student's timezone instead of sliding to the day before.
      const millis = Date.parse(`${item.dueOn}T17:00:00`);
      if (Number.isNaN(millis)) return [];
      return [{
        title,
        subject: item.subject || null,
        taskType: item.type,
        dueAt: new Date(millis).toISOString(),
        estimatedMinutes: item.minutes,
      }];
    });

    return {
      name: name.trim(),
      grade,
      country: country || null,
      state: australia ? state || null : null,
      school: school.trim() || null,
      timezone: defaultTimezone,
      atarTarget: seniorYears && atar.trim() ? atarNumber : null,
      subjects: selectedSubjects.map((subject, index) => {
        const detail = detailFor(subject);
        return {
          name: subject,
          color: SUBJECT_COLORS[index % SUBJECT_COLORS.length],
          priority: GOING.find((option) => option.value === detail.going)?.priority ?? 2,
          weeklyMinutes: weeklyFor(subject),
          targetGrade: detail.targetGrade.trim() || null,
          notes: detail.notes.trim(),
        };
      }),
      goals: goalDraft.trim() && goals.length < MAX_GOALS ? [...goals, goalDraft.trim()] : goals,
      tasks,
      commitments,
      preferences: {
        wakeTime,
        bedtime,
        minimumSleepMinutes: 480,
        maxDailyStudyMinutes: maxDaily,
        preferredSessionMinutes: sessionMinutes,
        breakMinutes,
      },
      arcad: { about: about.trim(), style: style.trim(), memoryEnabled },
    };
  }

  function next() {
    if (blocker) return;
    if (step < STEPS.length - 1) {
      setStep((s) => s + 1);
      window.scrollTo({ top: 0 });
    } else {
      setBuilding(true);
    }
  }

  function back() {
    setStep((s) => Math.max(0, s - 1));
  }

  if (building) {
    return (
      <OnboardingBuild
        save={async () => {
          const body = payload();
          await api("/api/onboarding", { method: "POST", body: JSON.stringify(body) });
          analytics.onboardingCompleted(body.subjects.length, body.tasks.length);
        }}
        onBack={() => setBuilding(false)}
        onDone={onComplete}
      />
    );
  }

  return (
    <div className="mx-auto flex min-h-svh w-full max-w-[600px] flex-col px-5 pb-[calc(env(safe-area-inset-bottom,0px)+88px)] pt-10 sm:px-8 sm:pt-16 lg:py-16">
      {/* Progress */}
      <div>
        <ol className="flex items-center gap-1.5" aria-label="Onboarding progress">
          {STEPS.map((s, i) => (
            <li key={s.key} className="flex-1">
              <span
                className="block h-1 rounded-[1px] transition-colors"
                style={{
                  background: i <= step ? "var(--app-accent)" : "var(--app-border)",
                  opacity: i < step ? 0.55 : 1,
                }}
                aria-label={`Step ${i + 1}: ${s.label}${i < step ? " (done)" : i === step ? " (current)" : ""}`}
              />
            </li>
          ))}
        </ol>
      </div>

      <div key={currentStep.key} className="mt-10 hero-fade-up">
        <p className="type-eyebrow" style={{ color: "var(--app-text-muted)" }}>
          {step + 1} of {STEPS.length} · {currentStep.label}
        </p>
        <h1
          className="mt-2 text-[32px] font-medium leading-[1.1] tracking-[-0.02em] sm:text-[40px]"
          style={{ color: "var(--app-text)" }}
        >
          {currentStep.key === "you" && <>Tell me who I&apos;m <span className="accent-serif">planning</span> for.</>}
          {currentStep.key === "subjects" && <>What are you actually <span className="accent-serif">studying</span>?</>}
          {currentStep.key === "going" && <>How&apos;s each one <span className="accent-serif">going</span>?</>}
          {currentStep.key === "goals" && <>What are you <span className="accent-serif">aiming</span> for?</>}
          {currentStep.key === "week" && <>When <span className="accent-serif">can&apos;t</span> you study?</>}
          {currentStep.key === "routine" && <>What does a normal <span className="accent-serif">day</span> look like?</>}
          {currentStep.key === "deadlines" && <>What&apos;s <span className="accent-serif">due</span> in the next month?</>}
          {currentStep.key === "hours" && <>How much time does each subject <span className="accent-serif">get</span>?</>}
          {currentStep.key === "arcad" && <>Anything else Arcad should <span className="accent-serif">know</span>?</>}
        </h1>
        <p className="mt-3 text-[15px]" style={{ color: "var(--app-text-muted)" }}>
          {currentStep.key === "you" && "You can change any of this later on your profile."}
          {currentStep.key === "subjects" && "Pick everything you'd want study time for. You can change these any time on your profile."}
          {currentStep.key === "going" && "Subjects you're finding hard get more time. All optional."}
          {currentStep.key === "goals" && "Arcad keeps these in mind when it plans. Skip anything you haven't thought about yet."}
          {currentStep.key === "week" && "School, sport, work, lessons. Study never gets planned on top of any of it."}
          {currentStep.key === "routine" && "Study only goes between waking up and bedtime, and never past your daily limit."}
          {currentStep.key === "deadlines" && "Assignments, exams, anything with a date. Each one gets study time in the days before it. Skip if nothing's due yet."}
          {currentStep.key === "hours" && `A starting point for ${grade}. Arcad moves time between weeks around your deadlines, but this is your usual week.`}
          {currentStep.key === "arcad" && "Arcad reads this whenever it plans a session or talks to you. You can change it later on your profile."}
        </p>
      </div>

      <div className="mt-8 flex-1">
        {currentStep.key === "you" ? (
          <div className="flex flex-col gap-5">
            <Label text="Name">
              <TextInput required value={name} onChange={setName} placeholder="Your first name" maxLength={120} />
            </Label>
            <Field label="Year">
              <div className="flex flex-wrap gap-2">
                {YEAR_LEVELS.map((option) => (
                  <Chip key={option} active={grade === option} onClick={() => setGrade(option)}>
                    {option}
                  </Chip>
                ))}
              </div>
            </Field>
            <Label text="Country">
              <Select value={country} onChange={setCountry}>
                <option value="">Choose your country</option>
                {countries.map((option) => (
                  <option key={option.code} value={option.code}>
                    {option.name}
                  </option>
                ))}
              </Select>
            </Label>
            {australia ? (
              <Field label="State or territory">
                <div className="flex flex-wrap gap-2">
                  {AU_STATES.map((option) => (
                    <Chip key={option} active={state === option} onClick={() => setState(state === option ? "" : option)}>
                      {option}
                    </Chip>
                  ))}
                </div>
                <div className="mt-2">
                  <Hint>Your plan follows your state&apos;s school terms and holidays.</Hint>
                </div>
              </Field>
            ) : null}
            <Label text="School (optional)">
              <TextInput value={school} onChange={setSchool} placeholder="Your school's name" maxLength={120} />
            </Label>
          </div>
        ) : null}

        {currentStep.key === "subjects" ? (
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="search"
                value={subjectSearch}
                onChange={(e) => setSubjectSearch(e.target.value)}
                placeholder="Search subjects…"
                className="min-w-0 flex-1 rounded-md px-3 py-2.5 text-[14.5px] outline-none"
                style={{ background: "var(--app-surface-soft)", boxShadow: "var(--elev-inset)", color: "var(--app-text)" }}
              />
              <Chip active={false} onClick={pickImNotSure}>
                I&apos;m not sure yet
              </Chip>
            </div>
            {filteredSuggestions.length === 0 ? (
              <p className="text-[13.5px]" style={{ color: "var(--app-text-muted)" }}>
                Nothing matches. Type it into the box below to add it.
              </p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {filteredSuggestions.map((subject) => {
                  const active = selectedSubjects.includes(subject);
                  return (
                    <Chip key={subject} active={active} onClick={() => toggleSubject(subject)}>
                      {active ? "✓ " : ""}
                      {subject}
                    </Chip>
                  );
                })}
              </div>
            )}
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
                style={{ background: "var(--app-surface-soft)", boxShadow: "var(--elev-inset)", color: "var(--app-text)" }}
              />
              <AppButton type="button" variant="secondary" onClick={addCustomSubject}>
                Add
              </AppButton>
            </div>
            <Hint>{selectedSubjects.length} selected</Hint>
          </div>
        ) : null}

        {currentStep.key === "going" ? (
          <ul className="flex flex-col gap-3">
            {selectedSubjects.map((subject) => {
              const detail = detailFor(subject);
              return (
                <li
                  key={subject}
                  className="rounded-md p-4"
                  style={{ background: "var(--app-surface)", boxShadow: "var(--elev-1)" }}
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <SubjectName subject={subject} colour={colourOf(subject)} />
                    <label className="flex items-center gap-2 text-[12.5px]" style={{ color: "var(--app-text-muted)" }}>
                      Aiming for
                      <input
                        value={detail.targetGrade}
                        onChange={(e) => setDetail(subject, { targetGrade: e.target.value })}
                        maxLength={16}
                        placeholder="e.g. A"
                        aria-label={`Grade you're aiming for in ${subject}`}
                        className="w-[76px] rounded-md px-2 py-1.5 text-[13.5px] outline-none"
                        style={{ background: "var(--app-surface-soft)", boxShadow: "var(--elev-inset)", color: "var(--app-text)" }}
                      />
                    </label>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-1.5" role="radiogroup" aria-label={`How ${subject} is going`}>
                    {GOING.map((option) => (
                      <Chip
                        key={option.value}
                        active={detail.going === option.value}
                        role="radio"
                        onClick={() => setDetail(subject, { going: detail.going === option.value ? null : option.value })}
                      >
                        {option.label}
                      </Chip>
                    ))}
                  </div>
                  <input
                    value={detail.notes}
                    onChange={(e) => setDetail(subject, { notes: e.target.value })}
                    maxLength={300}
                    placeholder={
                      detail.going === "hard"
                        ? "What's hard about it? e.g. essay structure, calculations"
                        : "Anything Arcad should know? (optional)"
                    }
                    aria-label={`Note for Arcad about ${subject}`}
                    className="mt-3 w-full rounded-md px-3 py-2 text-[13.5px] outline-none"
                    style={{ background: "var(--app-surface-soft)", boxShadow: "var(--elev-inset)", color: "var(--app-text)" }}
                  />
                </li>
              );
            })}
          </ul>
        ) : null}

        {currentStep.key === "goals" ? (
          <div className="flex flex-col gap-6">
            {seniorYears ? (
              <Label text="ATAR target (optional)" hint="Between 30 and 99.95.">
                <div className="sm:max-w-[200px]">
                  <TextInput
                    value={atar}
                    onChange={setAtar}
                    type="number"
                    inputMode="decimal"
                    step="0.05"
                    min="30"
                    max="99.95"
                    placeholder="e.g. 90.00"
                  />
                </div>
              </Label>
            ) : null}
            <Field label="Goals">
              {goals.length ? (
                <ul className="mb-3 flex flex-col gap-1.5">
                  {goals.map((goal) => (
                    <li
                      key={goal}
                      className="flex items-center gap-3 rounded-md px-3 py-2"
                      style={{ background: "var(--app-surface-soft)" }}
                    >
                      <span className="min-w-0 flex-1 text-[14px]" style={{ color: "var(--app-text)" }}>
                        {goal}
                      </span>
                      <RemoveButton label={`Remove ${goal}`} onClick={() => setGoals((prev) => prev.filter((g) => g !== goal))} />
                    </li>
                  ))}
                </ul>
              ) : null}
              {goals.length < MAX_GOALS ? (
                <div className="flex gap-2">
                  <input
                    value={goalDraft}
                    onChange={(e) => setGoalDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        addGoal();
                      }
                    }}
                    maxLength={160}
                    placeholder={goals.length ? "Add another…" : "e.g. Get into engineering at uni"}
                    className="flex-1 rounded-md px-3 py-2.5 text-[14.5px] outline-none"
                    style={{ background: "var(--app-surface-soft)", boxShadow: "var(--elev-inset)", color: "var(--app-text)" }}
                  />
                  <AppButton type="button" variant="secondary" onClick={addGoal}>
                    Add
                  </AppButton>
                </div>
              ) : null}
            </Field>
          </div>
        ) : null}

        {currentStep.key === "week" ? (
          <div className="flex flex-col gap-6">
            <div className="rounded-md p-4" style={{ background: "var(--app-surface)", boxShadow: "var(--elev-1)" }}>
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-[15px] font-medium" style={{ color: "var(--app-text)" }}>
                  School
                </h2>
                <Toggle label="I go to school" checked={goesToSchool} onChange={setGoesToSchool} />
              </div>
              {goesToSchool ? (
                <div className="mt-4 flex flex-col gap-4">
                  <DayPicker
                    days={schoolDays}
                    onToggle={(day) => setSchoolDays((prev) => toggleDay(prev, day))}
                    label="School days"
                  />
                  <div className="grid grid-cols-2 gap-3 sm:max-w-[360px]">
                    <Label text="Starts">
                      <TextInput type="time" value={schoolStart} onChange={setSchoolStart} />
                    </Label>
                    <Label text="Finishes">
                      <TextInput type="time" value={schoolEnd} onChange={setSchoolEnd} />
                    </Label>
                  </div>
                  <Hint>
                    {australia && state
                      ? "Include getting there and back if it takes a while. Holidays are left free automatically."
                      : "Include getting there and back if it takes a while."}
                  </Hint>
                </div>
              ) : null}
            </div>

            <div>
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-[15px] font-medium" style={{ color: "var(--app-text)" }}>
                  Sport, clubs, work, lessons
                </h2>
                <AppButton
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => setActivities((prev) => [...prev, { ...EMPTY_ACTIVITY }])}
                >
                  Add
                </AppButton>
              </div>
              {activities.length === 0 ? (
                <p className="mt-2 text-[13.5px]" style={{ color: "var(--app-text-muted)" }}>
                  Training, a part-time job, music lessons, tutoring. Anything at a set time each week.
                </p>
              ) : (
                <ul className="mt-3 flex flex-col gap-3">
                  {activities.map((activity, index) => (
                    <li
                      key={index}
                      className="flex flex-col gap-3 rounded-md p-4"
                      style={{ background: "var(--app-surface)", boxShadow: "var(--elev-1)" }}
                    >
                      <div className="flex gap-2">
                        <div className="min-w-0 flex-1">
                          <TextInput
                            value={activity.title}
                            onChange={(title) => updateActivity(index, { title })}
                            placeholder="e.g. Netball training"
                            maxLength={200}
                          />
                        </div>
                        <div className="w-[170px] shrink-0 max-sm:w-[130px]">
                          <Select
                            value={activity.category}
                            onChange={(category) => updateActivity(index, { category: category as ActivityCategory })}
                          >
                            {ACTIVITY_CATEGORIES.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </Select>
                        </div>
                        <RemoveButton
                          label={`Remove ${activity.title || "activity"}`}
                          onClick={() => setActivities((prev) => prev.filter((_, i) => i !== index))}
                        />
                      </div>
                      <DayPicker
                        days={activity.days}
                        onToggle={(day) =>
                          setActivities((prev) =>
                            prev.map((item, i) => (i === index ? { ...item, days: toggleDay(item.days, day) } : item)),
                          )
                        }
                        label={`Days for ${activity.title || "this activity"}`}
                        all
                      />
                      <div className="grid grid-cols-2 gap-3 sm:max-w-[360px]">
                        <Label text="From">
                          <TextInput type="time" value={activity.start} onChange={(start) => updateActivity(index, { start })} />
                        </Label>
                        <Label text="To">
                          <TextInput type="time" value={activity.end} onChange={(end) => updateActivity(index, { end })} />
                        </Label>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        ) : null}

        {currentStep.key === "routine" ? (
          <div className="flex flex-col gap-6">
            <div className="grid grid-cols-2 gap-4 sm:max-w-[360px]">
              <Label text="Wake up">
                <TextInput type="time" required value={wakeTime} onChange={setWakeTime} />
              </Label>
              <Label text="Bedtime">
                <TextInput type="time" required value={bedtime} onChange={setBedtime} />
              </Label>
            </div>
            <Range
              label="Most study in a day"
              display={formatWeekly(maxDaily)}
              value={maxDaily}
              min={60}
              max={360}
              step={15}
              onChange={setMaxDaily}
              hint={`Up to ${formatWeekly(maxDaily * 7)} a week`}
            />
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
              <Range
                label="Session length"
                display={`${sessionMinutes} min`}
                value={sessionMinutes}
                min={25}
                max={90}
                step={5}
                onChange={setSessionMinutes}
                hint="How long you can focus in one go"
              />
              <Range
                label="Break between"
                display={`${breakMinutes} min`}
                value={breakMinutes}
                min={5}
                max={30}
                step={5}
                onChange={setBreakMinutes}
              />
            </div>
          </div>
        ) : null}

        {currentStep.key === "deadlines" ? (
          <div className="flex flex-col gap-3">
            {deadlines.length ? (
              <ul className="flex flex-col gap-3">
                {deadlines.map((item, index) => (
                  <li
                    key={index}
                    className="flex flex-col gap-3 rounded-md p-4"
                    style={{ background: "var(--app-surface)", boxShadow: "var(--elev-1)" }}
                  >
                    <div className="flex gap-2">
                      <div className="min-w-0 flex-1">
                        <TextInput
                          value={item.title}
                          onChange={(title) => updateDeadline(index, { title })}
                          placeholder={index === 0 ? "e.g. English essay draft" : "What's due?"}
                          maxLength={200}
                        />
                      </div>
                      <RemoveButton
                        label={`Remove ${item.title || "deadline"}`}
                        onClick={() => setDeadlines((prev) => prev.filter((_, i) => i !== index))}
                      />
                    </div>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                      <Select value={item.subject} onChange={(subject) => updateDeadline(index, { subject })}>
                        <option value="">No subject</option>
                        {selectedSubjects.map((subject) => (
                          <option key={subject} value={subject}>
                            {subject}
                          </option>
                        ))}
                      </Select>
                      <Select value={item.type} onChange={(type) => updateDeadline(index, { type })}>
                        {TASK_TYPES.map((type) => (
                          <option key={type.value} value={type.value}>
                            {type.label}
                          </option>
                        ))}
                      </Select>
                      <TextInput type="date" value={item.dueOn} onChange={(dueOn) => updateDeadline(index, { dueOn })} />
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5" role="radiogroup" aria-label="How much work is left">
                      <span className="mr-1 text-[12.5px]" style={{ color: "var(--app-text-muted)" }}>
                        Work left
                      </span>
                      {TASK_SIZES.map((size) => (
                        <Chip
                          key={size.minutes}
                          role="radio"
                          active={item.minutes === size.minutes}
                          onClick={() => updateDeadline(index, { minutes: size.minutes })}
                        >
                          {size.label}
                        </Chip>
                      ))}
                    </div>
                  </li>
                ))}
              </ul>
            ) : null}
            {deadlines.length < MAX_DEADLINES ? (
              <AppButton
                type="button"
                variant="secondary"
                className="self-start"
                onClick={() => setDeadlines((prev) => [...prev, { ...EMPTY_DEADLINE }])}
              >
                {deadlines.length ? "Add another" : "Add a deadline"}
              </AppButton>
            ) : null}
            <Hint>You can add more from Deadlines once you&apos;re in.</Hint>
          </div>
        ) : null}

        {currentStep.key === "hours" ? (
          <div className="flex flex-col">
            <ul className="divide-y" style={{ borderColor: "var(--app-border)" }}>
              {selectedSubjects.map((subject) => (
                <li key={subject} className="flex items-center gap-3 py-3" style={{ borderColor: "var(--app-border)" }}>
                  <span className="min-w-0 flex-1">
                    <SubjectName subject={subject} colour={colourOf(subject)} />
                    {detailFor(subject).going === "hard" ? (
                      <span className="mt-0.5 block text-[12px]" style={{ color: "var(--app-text-muted)" }}>
                        Finding it hard, so maybe a bit more
                      </span>
                    ) : null}
                  </span>
                  <WeeklyStepper
                    minutes={weeklyFor(subject)}
                    label={subject}
                    onChange={(minutes) => setWeeklyOverrides((prev) => ({ ...prev, [subject]: minutes }))}
                  />
                </li>
              ))}
            </ul>
            <div
              className="mt-2 flex items-center justify-between gap-3 pt-4"
              style={{ borderTop: "1px solid var(--app-border)" }}
            >
              <p
                className="text-[13px] tabular-nums"
                style={{ color: weeklyTotal > weeklyCapacity ? "var(--app-danger)" : "var(--app-text-muted)" }}
              >
                {formatWeekly(weeklyTotal)} a week · your daily limit fits {formatWeekly(weeklyCapacity)}
              </p>
              {Object.keys(weeklyOverrides).length ? (
                <AppButton type="button" variant="ghost" size="sm" onClick={() => setWeeklyOverrides({})}>
                  Use suggestions
                </AppButton>
              ) : null}
            </div>
            {weeklyTotal > weeklyCapacity ? (
              <p className="mt-2 text-[13.5px]" style={{ color: "var(--app-text-muted)" }}>
                That&apos;s more than your daily limit fits, so every subject will get a little less. Trim a few,
                or go back and raise your limit.
              </p>
            ) : null}
          </div>
        ) : null}

        {currentStep.key === "arcad" ? (
          <div className="flex flex-col gap-5">
            <Label text="What should Arcad know about you?">
              <TextArea
                value={about}
                onChange={setAbout}
                maxLength={1500}
                rows={3}
                placeholder="e.g. I lose focus after about 40 minutes. Exams stress me out more than assignments."
              />
            </Label>
            <Label text="How should Arcad talk to you?">
              <TextArea
                value={style}
                onChange={setStyle}
                maxLength={1500}
                rows={2}
                placeholder="e.g. Keep it short. Tell me straight when I'm behind."
              />
            </Label>
            <div className="flex items-start justify-between gap-4 rounded-md p-4" style={{ background: "var(--app-surface-soft)" }}>
              <span>
                <span className="block text-[14px] font-medium" style={{ color: "var(--app-text)" }}>
                  Let Arcad remember things from chats
                </span>
                <span className="mt-0.5 block text-[12.5px]" style={{ color: "var(--app-text-muted)" }}>
                  Like what you find hard or when you study best. You can see and delete every one on your profile.
                </span>
              </span>
              <Toggle label="Memory" checked={memoryEnabled} onChange={setMemoryEnabled} hideLabel />
            </div>
          </div>
        ) : null}

        {blocker ? (
          <p role="status" className="mt-4 text-[13px]" style={{ color: "var(--app-text-muted)" }}>
            {blocker}
          </p>
        ) : null}
      </div>

      {/* Nav */}
      <div className="mt-8 flex items-center justify-between">
        <AppButton type="button" variant="ghost" onClick={back} disabled={step === 0}>
          Back
        </AppButton>
        <AppButton type="button" variant="primary" onClick={next} disabled={Boolean(blocker)}>
          {step === STEPS.length - 1 ? "Build my plan" : "Continue"}
        </AppButton>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <span className="mb-2 block text-[12.5px] font-medium" style={{ color: "var(--app-text-muted)" }}>
        {label}
      </span>
      {children}
    </div>
  );
}

function Hint({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[12.5px]" style={{ color: "var(--app-text-muted)" }}>
      {children}
    </p>
  );
}

function Chip({
  active,
  onClick,
  children,
  role,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  role?: "radio";
}) {
  return (
    <button
      type="button"
      role={role}
      aria-checked={role ? active : undefined}
      aria-pressed={role ? undefined : active}
      onClick={onClick}
      className="rounded-md px-3 py-1.5 text-[13px] font-medium transition-colors"
      style={{
        background: active ? "var(--app-accent)" : "transparent",
        color: active ? "var(--app-accent-on)" : "var(--app-text-soft)",
        border: `1px solid ${active ? "var(--app-accent)" : "var(--app-border-strong)"}`,
      }}
    >
      {children}
    </button>
  );
}

/** The subject name in its colour: colour on the label, never a dot beside it. */
function SubjectName({ subject, colour }: { subject: string; colour: string }) {
  return (
    <span
      className="inline-flex max-w-full rounded-[4px] px-1.5 py-0.5 text-[14px] font-medium"
      style={{
        color: `color-mix(in oklab, ${colour} 70%, var(--app-text))`,
        background: `color-mix(in oklab, ${colour} 13%, transparent)`,
      }}
    >
      <span className="truncate">{subject}</span>
    </span>
  );
}

function DayPicker({
  days,
  onToggle,
  label,
  all = false,
}: {
  days: number[];
  onToggle: (day: number) => void;
  label: string;
  /** Offer the weekend too. */
  all?: boolean;
}) {
  const order = all ? WEEK_ORDER : SCHOOL_DAYS;
  return (
    <div className="flex flex-wrap gap-1.5" role="group" aria-label={label}>
      {order.map((day) => {
        const active = days.includes(day);
        return (
          <Chip
            key={day}
            active={active}
            onClick={() => onToggle(day)}
          >
            {WEEKDAYS[day]}
          </Chip>
        );
      })}
    </div>
  );
}

function Toggle({
  label,
  checked,
  onChange,
  hideLabel = false,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  hideLabel?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={hideLabel ? label : undefined}
      onClick={() => onChange(!checked)}
      className="flex shrink-0 items-center gap-2 text-[13px]"
      style={{ color: "var(--app-text-soft)" }}
    >
      {hideLabel ? null : label}
      <span
        aria-hidden="true"
        className="relative inline-block h-5 w-9 rounded-full transition-colors"
        style={{ background: checked ? "var(--app-accent)" : "var(--app-border-strong)" }}
      >
        <span
          className="absolute top-0.5 h-4 w-4 rounded-full transition-[left]"
          style={{ left: checked ? 18 : 2, background: checked ? "var(--app-accent-on)" : "var(--app-surface)" }}
        />
      </span>
    </button>
  );
}

function RemoveButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="flex h-[42px] w-9 shrink-0 items-center justify-center rounded-md transition-colors ui-hover"
      style={{ color: "var(--app-text-muted)" }}
    >
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
        <path d="M3 3l8 8M3 11l8-8" strokeLinecap="round" />
      </svg>
    </button>
  );
}

function Range({
  label,
  display,
  value,
  min,
  max,
  step,
  onChange,
  hint,
}: {
  label: string;
  display: string;
  value: number;
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
        <span className="tabular-nums text-[14px]" style={{ color: "var(--app-text)" }}>
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
