"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { api } from "@/lib/api/client";
import type { PlannerEvent } from "@/lib/api/types";
import { blockTopics, type Confidence } from "@/shared/studyLog";
import AppButton from "./AppButton";
import ConfidencePicker from "./focus/ConfidencePicker";
import { Label, Sheet, TextInput } from "./profile/ui";

interface CheckoutProps {
  event: PlannerEvent;
  /** Steps ticked off during the session. */
  initialDone: number[];
  /** Minutes actually spent. */
  minutes: number;
  onClose: () => void;
  onSaved: (event: PlannerEvent) => Promise<void> | void;
}

/**
 * The end of a session: what got done, what's left, and how each topic it
 * covered is sitting. That goes in the study log, and what's left is where
 * Arcad starts next time.
 */
export default function CheckoutSheet({ open, ...props }: CheckoutProps & { open: boolean }) {
  return (
    <Sheet open={open} eyebrow="Check out" title={props.event.plan?.topic ?? props.event.subject ?? "Session"} onClose={props.onClose}>
      {/* Mounted only while open, so each check-out starts from the session. */}
      <CheckoutForm {...props} />
    </Sheet>
  );
}

function CheckoutForm({ event, initialDone, minutes, onClose, onSaved }: CheckoutProps) {
  const steps = event.plan?.steps ?? [];
  const [done, setDone] = useState<number[]>(initialDone);
  const [leftover, setLeftover] = useState("");
  // The same topics the API logs this session under, keyed the same way.
  const topics = useMemo(
    () => blockTopics({ plan: event.plan, title: event.title, taskId: event.taskId ?? null }),
    [event.plan, event.title, event.taskId],
  );
  const [ratings, setRatings] = useState<Record<string, Confidence>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function submit(event_: React.FormEvent<HTMLFormElement>) {
    event_.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const response = await api<{ event: PlannerEvent }>(`/api/events/${encodeURIComponent(event.id)}/checkout`, {
        method: "POST",
        body: JSON.stringify({
          done,
          leftover,
          minutes,
          topics: Object.entries(ratings).map(([key, confidence]) => ({ key, confidence })),
        }),
      });
      await onSaved(response.event);
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save that.");
    } finally {
      setSaving(false);
    }
  }

  if (saved) {
    return (
      <div className="space-y-4">
        <p className="text-[15px]" style={{ color: "var(--app-text)" }}>
          {leftover.trim() ? "Logged. Arcad will start there next time." : `Logged ${minutes} min. Nice work.`}
        </p>
        <div className="flex justify-end gap-2">
          <AppButton variant="ghost" onClick={onClose}>
            Stay here
          </AppButton>
          <Link
            href="/app"
            className="inline-flex h-8 items-center rounded-md px-3 text-[13px] font-medium"
            style={{ background: "var(--app-accent)", color: "var(--app-accent-on)" }}
          >
            Back to Today
          </Link>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      {steps.length > 0 ? (
        <fieldset>
          <legend className="mb-2 text-[12.5px] font-medium" style={{ color: "var(--app-text-muted)" }}>
            What got done?
          </legend>
          <ul className="flex flex-col gap-1">
            {steps.map((step, index) => (
              <li key={index}>
                <label className="flex cursor-pointer items-start gap-3 rounded-md px-1 py-1.5">
                  <input
                    type="checkbox"
                    checked={done.includes(index)}
                    onChange={() =>
                      setDone((prev) => (prev.includes(index) ? prev.filter((item) => item !== index) : [...prev, index]))
                    }
                    className="mt-0.5 h-4 w-4 shrink-0"
                    style={{ accentColor: "var(--app-accent)" }}
                  />
                  <span className="text-[14px]" style={{ color: "var(--app-text)" }}>
                    {step.text}
                  </span>
                </label>
              </li>
            ))}
          </ul>
        </fieldset>
      ) : null}

      <Label text="Anything left over?" hint="Arcad starts your next session on this.">
        <TextInput value={leftover} onChange={setLeftover} maxLength={200} placeholder="e.g. Q6-8, and the yield calcs" />
      </Label>

      <fieldset>
        <legend className="mb-2 text-[12.5px] font-medium" style={{ color: "var(--app-text-muted)" }}>
          {topics.length > 1 ? "How's each one sitting?" : "How's it sitting?"}
        </legend>
        <div className="flex flex-col gap-3">
          {topics.map((topic) => (
            <ConfidencePicker
              key={topic.key}
              label={topic.topic || "This session"}
              // One topic is the sheet's title already.
              showLabel={topics.length > 1}
              value={ratings[topic.key] ?? null}
              onChange={(value) =>
                setRatings((prev) => {
                  const next = { ...prev };
                  if (value) next[topic.key] = value;
                  else delete next[topic.key];
                  return next;
                })
              }
            />
          ))}
        </div>
        <p className="mt-2 text-[12px]" style={{ color: "var(--app-text-muted)" }}>
          Arcad plans your next sessions from this.
        </p>
      </fieldset>

      {error ? (
        <p role="alert" className="text-[13.5px]" style={{ color: "var(--app-danger)" }}>
          {error}
        </p>
      ) : null}

      <div className="flex items-center justify-between gap-2">
        <span className="tabular-nums text-[12.5px]" style={{ color: "var(--app-text-muted)" }}>
          {minutes} min
        </span>
        <AppButton type="submit" variant="primary" loading={saving}>
          Done
        </AppButton>
      </div>
    </form>
  );
}
