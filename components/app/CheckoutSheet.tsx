"use client";

import Link from "next/link";
import { useState } from "react";
import { api } from "@/lib/api/client";
import type { PlannerEvent, SessionCheckout } from "@/lib/api/types";
import AppButton from "./AppButton";
import { Label, Sheet, TextInput } from "./profile/ui";

const FEELINGS: Array<{ value: NonNullable<SessionCheckout["feeling"]>; label: string }> = [
  { value: "good", label: "Went well" },
  { value: "ok", label: "Okay" },
  { value: "rough", label: "Rough" },
];

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
 * The end of a session: what got done, what's left, how it went. What's left
 * is where Arcad starts next time.
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
  const [feeling, setFeeling] = useState<SessionCheckout["feeling"]>(null);
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
        body: JSON.stringify({ done, leftover, feeling, minutes }),
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

      <div>
        <p className="mb-2 text-[12.5px] font-medium" style={{ color: "var(--app-text-muted)" }}>
          How&apos;d it go?
        </p>
        <div className="flex gap-2" role="radiogroup" aria-label="How it went">
          {FEELINGS.map((option) => (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={feeling === option.value}
              onClick={() => setFeeling(feeling === option.value ? null : option.value)}
              className="flex-1 rounded-md py-2 text-[13px] font-medium transition-colors"
              style={{
                background: feeling === option.value ? "var(--app-accent-soft)" : "var(--app-surface-soft)",
                color: feeling === option.value ? "var(--app-accent-strong)" : "var(--app-text-soft)",
                border: `1px solid ${feeling === option.value ? "var(--app-accent)" : "var(--app-border)"}`,
              }}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

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
