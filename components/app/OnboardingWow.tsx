"use client";

import { useState } from "react";
import { api } from "@/lib/api/client";
import { analytics } from "@/lib/analytics/events";
import { useDashboardData } from "@/lib/app/DashboardProvider";
import AppButton from "./AppButton";

/**
 * The first-wow moment. Straight after a new student's plan is built, before
 * we ever mention paying, we let them feel the one thing that makes Arcadia
 * different: tell it something changed and watch the week rebuild. Uses the
 * real recovery endpoint (a real, sensible reflow), not a fake animation.
 */
type Reason = "less_time" | "tired" | "new_deadline";

interface RecoveryResult {
  lines: string[];
  moved: number;
  nextBlock: { subject: string | null; title: string; startAt: string; minutes: number } | null;
}

const EXAMPLES: { key: Reason; label: string }[] = [
  { key: "new_deadline", label: "A test just got announced" },
  { key: "less_time", label: "Something came up tonight" },
  { key: "tired", label: "I'm wiped, need an easy night" },
];

/** A date N days out, "YYYY-MM-DD". Module-level so it isn't a render-time call. */
function inDays(n: number): string {
  return new Date(Date.now() + n * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function timeLabel(iso: string, tz: string): string {
  return new Date(iso)
    .toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit", timeZone: tz })
    .toLowerCase()
    .replace(/\s/g, "");
}

export default function OnboardingWow({ onContinue }: { onContinue: () => void }) {
  const { data, reload } = useDashboardData();
  const tz = data.profile?.timezone || (typeof Intl !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone : "Australia/Brisbane");

  const [loading, setLoading] = useState<Reason | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<RecoveryResult | null>(null);

  async function tryExample(reason: Reason) {
    setLoading(reason);
    setError(null);
    try {
      const body: Record<string, unknown> = { reason };
      if (reason === "new_deadline") {
        // A plausible, reliable reflow: prep for a test in a few days on the
        // student's first subject. It really books study before the date.
        const subject = data.subjects?.[0]?.name;
        body.title = subject ? `${subject} test` : "Surprise test";
        if (subject) body.subject = subject;
        body.dueOn = inDays(5);
        body.size = "medium";
      }
      const res = await api<RecoveryResult>("/api/plan/recover", { method: "POST", body: JSON.stringify(body) });
      setResult(res);
      analytics.recoveryUsed(reason, res.moved ?? 0, true);
      void reload();
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : "Couldn't reach Arcad. You can try this any time from Today.");
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="mx-auto flex min-h-svh w-full max-w-[560px] flex-col justify-center px-5 py-16 sm:px-8">
      {result ? (
        <div className="hero-fade-up">
          <p className="type-eyebrow" style={{ color: "var(--app-arcad-strong)" }}>
            That&rsquo;s the magic
          </p>
          <h1 className="mt-2 text-[32px] font-medium leading-[1.1] tracking-[-0.02em] sm:text-[40px]" style={{ color: "var(--app-text)" }}>
            Your plan just <span className="accent-serif">fixed itself</span>.
          </h1>
          <p className="mt-4 text-[15px]" style={{ color: "var(--app-text-muted)" }}>
            You told Arcad what changed and it rebuilt your week in seconds. This is what happens every time life gets in the way.
          </p>

          <ul className="mt-6 flex flex-col gap-2">
            {result.lines.map((line) => (
              <li key={line} className="flex items-start gap-2.5 rounded-lg px-4 py-2.5 text-[13.5px]" style={{ background: "var(--app-surface)", color: "var(--app-text-soft)", boxShadow: "var(--elev-1)" }}>
                <span aria-hidden="true" className="mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full" style={{ background: "var(--app-arcad)", color: "var(--app-arcad-on)" }}>
                  <svg viewBox="0 0 12 12" width="9" height="9" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M2.5 6.5l2.5 2.5 4.5-5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
                <span>{line}</span>
              </li>
            ))}
          </ul>

          {result.nextBlock ? (
            <div className="mt-4 rounded-lg p-4" style={{ background: "var(--app-arcad-soft)" }}>
              <p className="type-mono-label" style={{ color: "var(--app-arcad-strong)" }}>
                Your next block
              </p>
              <p className="mt-1 text-[15px] font-semibold" style={{ color: "var(--app-text)" }}>
                {result.nextBlock.subject || result.nextBlock.title}
              </p>
              <p className="text-[13px]" style={{ color: "var(--app-text-muted)" }}>
                {result.nextBlock.minutes} min · {timeLabel(result.nextBlock.startAt, tz)}
              </p>
            </div>
          ) : null}

          <div className="mt-8">
            <AppButton variant="primary" onClick={onContinue} className="w-full">
              See my plan
            </AppButton>
          </div>
        </div>
      ) : (
        <div className="hero-fade-up">
          <p className="type-eyebrow" style={{ color: "var(--app-text-muted)" }}>
            One last thing
          </p>
          <h1 className="mt-2 text-[32px] font-medium leading-[1.1] tracking-[-0.02em] sm:text-[40px]" style={{ color: "var(--app-text)" }}>
            Plans break. <span className="accent-serif">Yours won&rsquo;t</span>.
          </h1>
          <p className="mt-4 text-[15px]" style={{ color: "var(--app-text-muted)" }}>
            Training runs late, a test gets sprung on you, some nights you&rsquo;re just done. Tell Arcad what changed and watch your week rebuild itself. Try one:
          </p>

          <div className="mt-6 flex flex-col gap-2.5">
            {EXAMPLES.map((ex) => (
              <button
                key={ex.key}
                type="button"
                onClick={() => void tryExample(ex.key)}
                disabled={loading !== null}
                className="flex items-center justify-between gap-3 rounded-lg px-4 py-3.5 text-left text-[14.5px] font-medium transition-opacity hover:opacity-90 disabled:opacity-60"
                style={{ background: "var(--app-surface)", color: "var(--app-text)", boxShadow: "var(--elev-1)" }}
              >
                <span>{ex.label}</span>
                {loading === ex.key ? (
                  <span aria-label="Working" className="h-4 w-4 animate-spin rounded-full border-2" style={{ borderColor: "var(--app-border)", borderTopColor: "var(--app-arcad)" }} />
                ) : (
                  <span aria-hidden="true" style={{ color: "var(--app-arcad-strong)" }}>→</span>
                )}
              </button>
            ))}
          </div>

          {error ? (
            <p className="mt-4 text-[13px]" style={{ color: "var(--app-danger)" }}>
              {error}
            </p>
          ) : null}

          <button
            type="button"
            onClick={onContinue}
            className="mt-6 text-[13.5px] underline underline-offset-4 transition-opacity hover:opacity-70"
            style={{ color: "var(--app-text-muted)" }}
          >
            Skip for now
          </button>
        </div>
      )}
    </div>
  );
}
