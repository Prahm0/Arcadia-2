"use client";

import { useState } from "react";
import { updateProfile } from "@/lib/api/profile";
import AppButton from "./AppButton";

/**
 * Asked once, before anything about the student is sent to an AI
 * (App Store guideline 5.1.2): what goes to OpenAI, what never does, and a
 * real choice. "Don't allow" keeps the planner working without the model;
 * Settings can change it later.
 */
export const AI_SHARED = [
  "Your first name, year level, school and state",
  "Your subjects, goals and ATAR target",
  "Your schedule, tasks and deadlines",
  "Your messages to Arcad (typed or spoken) and what it remembers for you",
  "Notes or files you upload to make flashcards or summaries",
];

export default function AiConsent({ onDone }: { onDone: () => void }) {
  const [busy, setBusy] = useState<"granted" | "declined" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function choose(aiConsent: "granted" | "declined") {
    setBusy(aiConsent);
    setError(null);
    try {
      await updateProfile({ aiConsent });
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save that. Try again.");
      setBusy(null);
    }
  }

  return (
    <div
      className="flex min-h-svh items-center justify-center px-5 py-10"
      style={{ background: "var(--app-bg)", color: "var(--app-text)" }}
    >
      <div className="w-full max-w-[460px]">
        <p className="type-eyebrow" style={{ color: "var(--app-text-muted)" }}>Before we start</p>
        <h1 className="mt-3 text-[26px] font-semibold leading-tight tracking-[-0.02em]">
          Arcadia uses AI to plan your study
        </h1>
        <p className="mt-3 text-[15px] leading-6" style={{ color: "var(--app-text-soft)" }}>
          To build your study plan and power Arcad, your study assistant, Arcadia sends some of your
          information to <strong>OpenAI</strong>, a third-party AI provider.
        </p>

        <div className="mt-6 rounded-lg p-4" style={{ background: "var(--app-surface)", boxShadow: "var(--elev-1)" }}>
          <p className="text-[13px] font-semibold">What&apos;s shared with OpenAI</p>
          <ul className="mt-2 flex flex-col gap-1.5 text-[14px] leading-5" style={{ color: "var(--app-text-soft)" }}>
            {AI_SHARED.map((item) => (
              <li key={item} className="flex gap-2">
                <span aria-hidden="true">•</span>
                {item}
              </li>
            ))}
          </ul>
          <p className="mt-4 text-[13px] font-semibold">Never shared</p>
          <p className="mt-1 text-[14px] leading-5" style={{ color: "var(--app-text-soft)" }}>
            Your email, password, phone number or payment details. Voice input is turned into text by
            Apple on your phone; your voice recording is never sent to us or to OpenAI.
          </p>
        </div>

        <p className="mt-4 text-[13px] leading-5" style={{ color: "var(--app-text-muted)" }}>
          OpenAI doesn&apos;t use it to train its models. You can change this any time in Settings. If you
          don&apos;t allow it, Arcadia still builds a basic plan, but Arcad and the other AI features
          won&apos;t work. See our{" "}
          <a href="/privacy" className="underline underline-offset-2">privacy policy</a>.
        </p>

        {error ? (
          <p role="alert" className="mt-3 text-[13px]" style={{ color: "var(--app-danger)" }}>{error}</p>
        ) : null}

        <div className="mt-6 flex flex-col gap-2">
          <AppButton
            type="button"
            variant="primary"
            onClick={() => void choose("granted")}
            loading={busy === "granted"}
            disabled={busy !== null}
          >
            Allow
          </AppButton>
          <AppButton
            type="button"
            variant="ghost"
            onClick={() => void choose("declined")}
            loading={busy === "declined"}
            disabled={busy !== null}
          >
            Don&apos;t allow
          </AppButton>
        </div>
      </div>
    </div>
  );
}
