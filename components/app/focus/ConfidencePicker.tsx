"use client";

import { CONFIDENCE, CONFIDENCE_LABELS, type Confidence } from "@/shared/studyLog";

interface ConfidencePickerProps {
  /** Names the group for screen readers, and shows above it when `showLabel`. */
  label: string;
  showLabel?: boolean;
  value: Confidence | null;
  onChange: (value: Confidence | null) => void;
  disabled?: boolean;
}

/**
 * Got it · Shaky · Lost for one topic. Tapping the chosen one again clears
 * it, since saying nothing is allowed.
 */
export default function ConfidencePicker({ label, showLabel = false, value, onChange, disabled }: ConfidencePickerProps) {
  return (
    <div>
      {showLabel ? (
        <p className="mb-1.5 truncate text-[13px]" style={{ color: "var(--app-text-soft)" }}>
          {label}
        </p>
      ) : null}
      <div className="flex gap-2" role="radiogroup" aria-label={label}>
        {CONFIDENCE.map((option) => {
          const active = value === option;
          return (
            <button
              key={option}
              type="button"
              role="radio"
              aria-checked={active}
              disabled={disabled}
              onClick={() => onChange(active ? null : option)}
              className="flex-1 rounded-md py-2 text-[13px] font-medium transition-colors disabled:opacity-50"
              style={{
                background: active ? "var(--app-accent-soft)" : "var(--app-surface-soft)",
                color: active ? "var(--app-accent-strong)" : "var(--app-text-soft)",
                border: `1px solid ${active ? "var(--app-accent)" : "var(--app-border)"}`,
              }}
            >
              {CONFIDENCE_LABELS[option]}
            </button>
          );
        })}
      </div>
    </div>
  );
}
