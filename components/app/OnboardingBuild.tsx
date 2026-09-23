"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api/client";
import type { MonthPlan } from "@/lib/api/plan";
import AppButton from "./AppButton";

/**
 * The three things that happen once onboarding is filled in, each a real
 * request, so the bar moves with the work rather than a timer. `share` is
 * each stage's slice of the bar.
 */
const STAGES = [
  { key: "save", label: "Saving your profile", share: 0.12 },
  { key: "plan", label: "Arcad is planning your month", share: 0.68 },
  { key: "place", label: "Fitting sessions around your week", share: 0.2 },
] as const;
type StageKey = (typeof STAGES)[number]["key"];

/** Where the bar sits when a stage starts. */
const stageStart = (index: number) => STAGES.slice(0, index).reduce((sum, stage) => sum + stage.share, 0);

export default function OnboardingBuild({
  save,
  onBack,
  onDone,
}: {
  /** Saves everything collected. Runs once; a retry after it succeeds skips it. */
  save: () => Promise<unknown>;
  /** Back to the last question, only offered if saving failed. */
  onBack: () => void;
  onDone: () => void;
}) {
  const [stage, setStage] = useState(0);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [plan, setPlan] = useState<MonthPlan | null>(null);
  const [done, setDone] = useState(false);
  // The ref guards the request; the state is for what's shown.
  const saved = useRef(false);
  const [isSaved, setIsSaved] = useState(false);
  const started = useRef(false);

  const run = useCallback(
    async (from: number) => {
      setError(null);
      const steps: Record<StageKey, () => Promise<void>> = {
        save: async () => {
          if (saved.current) return;
          await save();
          saved.current = true;
          setIsSaved(true);
        },
        plan: async () => {
          const reply = await api<{ plan: MonthPlan | null }>("/api/plan/month", { method: "POST" });
          setPlan(reply.plan);
        },
        place: async () => {
          await api("/api/plan/schedule", { method: "POST" });
        },
      };
      for (let index = from; index < STAGES.length; index++) {
        setStage(index);
        try {
          await steps[STAGES[index].key]();
        } catch (err) {
          setError(err instanceof Error ? err.message : "Something went wrong.");
          return;
        }
        setProgress(stageStart(index + 1));
      }
      setDone(true);
    },
    [save],
  );

  // Strict mode mounts twice in development; the plan should only be made once.
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void run(0);
  }, [run]);

  // While a stage is working, creep toward the end of its slice without
  // reaching it, so the bar keeps moving but only a finished stage fills it.
  useEffect(() => {
    if (done || error) return;
    const ceiling = stageStart(stage) + STAGES[stage].share * 0.92;
    const timer = window.setInterval(() => {
      setProgress((value) => (value >= ceiling ? value : value + (ceiling - value) * 0.045));
    }, 120);
    return () => window.clearInterval(timer);
  }, [stage, done, error]);

  const percent = Math.round((done ? 1 : progress) * 100);
  const firstWeek = plan?.weeks[0];

  return (
    <div className="mx-auto flex min-h-svh w-full max-w-[560px] flex-col justify-center px-5 py-16 sm:px-8">
      <div className="hero-fade-up">
        <p className="type-eyebrow" style={{ color: "var(--app-text-muted)" }}>
          {done ? "Done" : "Building your plan"}
        </p>
        <h1
          className="mt-2 text-[32px] font-medium leading-[1.1] tracking-[-0.02em] sm:text-[40px]"
          style={{ color: "var(--app-text)" }}
        >
          {done ? (
            <>
              Your month is <span className="accent-serif">planned</span>.
            </>
          ) : (
            <>
              Give me a <span className="accent-serif">sec</span>.
            </>
          )}
        </h1>
      </div>

      <div className="mt-10">
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-[14px]" style={{ color: error ? "var(--app-danger)" : "var(--app-text-soft)" }} aria-live="polite">
            {error ? error : done ? "All set" : STAGES[stage].label}
          </p>
          <p className="tabular-nums text-[13px]" style={{ color: "var(--app-text-muted)" }}>
            {percent}%
          </p>
        </div>
        <div
          role="progressbar"
          aria-label="Building your plan"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
          className="mt-3 h-1.5 overflow-hidden rounded-full"
          style={{ background: "var(--app-border)" }}
        >
          <div
            className="h-full rounded-full transition-[width] duration-300 ease-out"
            style={{ width: `${percent}%`, background: error ? "var(--app-danger)" : "var(--app-arcad)" }}
          />
        </div>

        <ol className="mt-6 flex flex-col gap-2">
          {STAGES.map((item, index) => {
            const state = done || index < stage ? "done" : index === stage ? (error ? "failed" : "active") : "waiting";
            return (
              <li key={item.key} className="flex items-center gap-2.5 text-[13.5px]">
                <StageMark state={state} />
                <span style={{ color: state === "waiting" ? "var(--app-text-muted)" : "var(--app-text)" }}>{item.label}</span>
              </li>
            );
          })}
        </ol>
      </div>

      {done && plan ? (
        <div className="mt-8 rounded-md p-4 hero-fade-up" style={{ background: "var(--app-surface)", boxShadow: "var(--elev-1)" }}>
          <p className="text-[14.5px] leading-[1.5]" style={{ color: "var(--app-text)" }}>
            {plan.summary}
          </p>
          {firstWeek ? (
            <p className="mt-2 text-[13px]" style={{ color: "var(--app-text-muted)" }}>
              This week: {firstWeek.focus}
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="mt-8 flex items-center justify-end gap-3">
        {error && !isSaved ? (
          <AppButton type="button" variant="ghost" onClick={onBack}>
            Back
          </AppButton>
        ) : null}
        {error && isSaved ? (
          // Everything they entered is saved; the plan can be made later.
          <AppButton type="button" variant="ghost" onClick={onDone}>
            Skip for now
          </AppButton>
        ) : null}
        {error ? (
          <AppButton type="button" variant="primary" onClick={() => void run(stage)}>
            Try again
          </AppButton>
        ) : null}
        {done ? (
          <AppButton type="button" variant="primary" onClick={onDone}>
            Let&apos;s go
          </AppButton>
        ) : null}
      </div>
    </div>
  );
}

function StageMark({ state }: { state: "done" | "active" | "failed" | "waiting" }) {
  if (state === "done") {
    return (
      <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="var(--app-arcad)" strokeWidth="1.8" aria-label="Done">
        <path d="M3.5 8.5l3 3 6-7" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  if (state === "active") {
    return (
      <span
        aria-label="Working"
        className="h-4 w-4 animate-spin rounded-full border-2"
        style={{ borderColor: "var(--app-border)", borderTopColor: "var(--app-arcad)" }}
      />
    );
  }
  return (
    <span
      aria-label={state === "failed" ? "Failed" : "Waiting"}
      className="grid h-4 w-4 place-items-center text-[12px] font-semibold"
      style={{ color: state === "failed" ? "var(--app-danger)" : "var(--app-text-faint)" }}
    >
      {state === "failed" ? "!" : "·"}
    </span>
  );
}
