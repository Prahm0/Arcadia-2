"use client";

import { useState } from "react";
import type { MissReason } from "@/lib/api/types";
import AppButton from "./AppButton";

export const MISS_REASONS: Array<{ value: MissReason; label: string }> = [
  { value: "sick", label: "Sick" },
  { value: "tired", label: "Too tired" },
  { value: "other_plans", label: "Other plans" },
  { value: "forgot", label: "Forgot" },
  { value: "didnt_feel_like_it", label: "Didn't feel like it" },
  { value: "other", label: "Something else" },
];

interface MissReasonPickerProps {
  onSubmit: (reason: MissReason, note: string) => void;
  onBack?: () => void;
  loading?: boolean;
  error?: string | null;
  submitLabel?: string;
}

/** The paid miss-reason follow-up shared by every study-block check-in. */
export default function MissReasonPicker({
  onSubmit,
  onBack,
  loading = false,
  error,
  submitLabel = "Save reason",
}: MissReasonPickerProps) {
  const [reason, setReason] = useState<MissReason | null>(null);
  const [note, setNote] = useState("");

  return (
    <div>
      <p className="text-[14px] font-medium">What got in the way?</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {MISS_REASONS.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => setReason(option.value)}
            className="rounded-full px-3 py-1.5 text-[12.5px] font-medium transition-colors"
            style={{
              background: reason === option.value ? "var(--app-accent)" : "var(--app-surface-soft)",
              color: reason === option.value ? "var(--app-accent-on)" : "var(--app-text)",
              boxShadow: reason === option.value ? undefined : "var(--elev-inset)",
            }}
          >
            {option.label}
          </button>
        ))}
      </div>
      <label className="mt-4 block">
        <span className="text-[12px]" style={{ color: "var(--app-text-muted)" }}>Optional note</span>
        <textarea
          value={note}
          onChange={(event) => setNote(event.target.value)}
          maxLength={280}
          rows={2}
          placeholder="Add context for Arcad"
          className="mt-1.5 w-full resize-none rounded-md px-3 py-2 text-[13px] outline-none"
          style={{ background: "var(--app-surface-soft)", boxShadow: "var(--elev-inset)", color: "var(--app-text)" }}
        />
      </label>
      {error ? <p className="mt-3 text-[13px]" style={{ color: "var(--app-danger)" }}>{error}</p> : null}
      <div className="mt-5 flex items-center justify-between gap-3">
        {onBack ? (
          <AppButton type="button" variant="ghost" onClick={onBack} disabled={loading}>
            Back
          </AppButton>
        ) : <span />}
        <AppButton
          type="button"
          variant="primary"
          onClick={() => reason && onSubmit(reason, note)}
          loading={loading}
          disabled={!reason}
        >
          {submitLabel}
        </AppButton>
      </div>
    </div>
  );
}
