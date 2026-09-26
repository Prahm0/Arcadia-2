"use client";

import { useState } from "react";
import { rateTimerSession } from "@/lib/api/studyLog";
import type { Confidence } from "@/shared/studyLog";
import ConfidencePicker from "./ConfidencePicker";

/**
 * After a free session on a topic: one tap for how it's sitting, which goes
 * on that session's study log entry. Skippable; nothing asks twice.
 */
export default function SessionRating({
  activityId,
  topic,
  onDone,
}: {
  activityId: string;
  topic: string;
  onDone: () => void;
}) {
  const [value, setValue] = useState<Confidence | null>(null);
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");

  async function rate(next: Confidence | null) {
    setValue(next);
    if (!next) return;
    setState("saving");
    try {
      await rateTimerSession(activityId, next);
      setState("saved");
      window.setTimeout(onDone, 1200);
    } catch {
      setState("error");
    }
  }

  return (
    <div
      role="group"
      aria-label="Rate this session"
      className="rounded-lg border px-4 py-3"
      style={{ borderColor: "var(--app-border)", background: "var(--app-surface)" }}
    >
      <div className="mb-2 flex items-center justify-between gap-3">
        <p className="min-w-0 truncate text-[13px]" style={{ color: "var(--app-text)" }}>
          {state === "saved" ? `Logged ${topic}.` : `How's ${topic} sitting?`}
        </p>
        {state !== "saved" ? (
          <button
            type="button"
            onClick={onDone}
            className="shrink-0 text-[12px] underline underline-offset-4"
            style={{ color: "var(--app-text-muted)" }}
          >
            Skip
          </button>
        ) : null}
      </div>
      <ConfidencePicker label={`How ${topic} is sitting`} value={value} onChange={(next) => void rate(next)} disabled={state === "saving" || state === "saved"} />
      {state === "error" ? (
        <p role="alert" className="mt-2 text-[12px]" style={{ color: "var(--app-danger)" }}>
          Couldn&apos;t save that. It&apos;ll work once the session has synced.
        </p>
      ) : null}
    </div>
  );
}
