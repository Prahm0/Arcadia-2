"use client";

import { useState } from "react";
import { SUBJECT_COLORS } from "@/lib/app/categoryColors";
import type { DashboardResponse } from "@/lib/api/types";

type Subject = DashboardResponse["subjects"][number];

interface SubjectPickerProps {
  subjects: Subject[];
  value: string | null;
  onChange: (value: string | null) => void;
}

const NEW_SUBJECT = "__arcadia_new_subject__";

function findSubject(subjects: Subject[], value: string | null): Subject | null {
  if (!value) return null;
  return subjects.find((subject) => subject.name.toLowerCase() === value.trim().toLowerCase()) ?? null;
}

function colourFor(subjects: Subject[], subject: Subject): string {
  const index = subjects.findIndex((item) => item.id === subject.id);
  return subject.colour || SUBJECT_COLORS[Math.max(index, 0) % SUBJECT_COLORS.length];
}

/**
 * Desktop gets a swatch-rich menu. Phones deliberately receive a real select
 * control so iOS and Android can use their native picker. A custom name is
 * saved as a subject when the surrounding task form is submitted.
 */
export default function SubjectPicker({ subjects, value, onChange }: SubjectPickerProps) {
  const selected = findSubject(subjects, value);
  const isCustom = Boolean(value && !selected);
  const [open, setOpen] = useState(false);
  const [customMode, setCustomMode] = useState(isCustom);

  const showCustomInput = customMode || isCustom;
  const selectedLabel = selected ? selected.name : isCustom ? value : "No subject";

  function choose(value: string | null) {
    setCustomMode(false);
    setOpen(false);
    onChange(value);
  }

  function startCustom() {
    setCustomMode(true);
    setOpen(false);
    if (selected || !value) onChange(null);
  }

  return (
    <div>
      <div className="sm:hidden">
        <div className="relative">
          <select
            value={showCustomInput ? NEW_SUBJECT : value ?? ""}
            onChange={(event) => {
              if (event.target.value === NEW_SUBJECT) startCustom();
              else choose(event.target.value || null);
            }}
            className="w-full rounded-md px-3 py-2.5 text-[15px] outline-none"
            style={{ background: "var(--app-surface-soft)", boxShadow: "var(--elev-inset)", color: "var(--app-text)" }}
          >
            <option value="">No subject</option>
            {subjects.map((subject) => (
              <option key={subject.id} value={subject.name}>{subject.name}</option>
            ))}
            <option value={NEW_SUBJECT}>Add a new subject</option>
          </select>
        </div>
      </div>

      <div className="relative hidden sm:block">
        <button
          type="button"
          aria-haspopup="listbox"
          aria-expanded={open}
          onClick={() => setOpen((current) => !current)}
          className="flex w-full items-center gap-2 rounded-md px-3 py-2.5 text-left text-[15px] outline-none"
          style={{ background: "var(--app-surface-soft)", boxShadow: "var(--elev-inset)", color: "var(--app-text)" }}
        >
          <span
            className="min-w-0 flex-1 truncate"
            style={{ color: selected ? `color-mix(in oklab, ${colourFor(subjects, selected)} 70%, var(--app-text))` : "var(--app-text-muted)" }}
          >
            {selectedLabel}
          </span>
          <svg aria-hidden="true" viewBox="0 0 20 20" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.7">
            <path d="m5 7 5 5 5-5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        {open ? (
          <div
            role="listbox"
            aria-label="Subject"
            className="absolute z-30 mt-1 max-h-56 w-full overflow-y-auto rounded-md p-1"
            style={{ background: "var(--app-elev)", boxShadow: "var(--elev-3)" }}
          >
            <Option label="No subject" selected={!value && !showCustomInput} onClick={() => choose(null)} />
            {subjects.map((subject) => (
              <Option
                key={subject.id}
                label={subject.name}
                colour={colourFor(subjects, subject)}
                selected={selected?.id === subject.id}
                onClick={() => choose(subject.name)}
              />
            ))}
            <div className="my-1 h-px" style={{ background: "var(--app-border)" }} />
            <Option label="Add a new subject" selected={showCustomInput} onClick={startCustom} />
          </div>
        ) : null}
      </div>

      {showCustomInput ? (
        <div className="mt-2">
          <input
            value={isCustom ? value ?? "" : ""}
            onChange={(event) => onChange(event.target.value || null)}
            placeholder="New subject name"
            autoComplete="off"
            maxLength={80}
            className="w-full rounded-md px-3 py-2.5 text-[14px] outline-none"
            style={{ background: "var(--app-surface-soft)", boxShadow: "var(--elev-inset)", color: "var(--app-text)" }}
          />
          <p className="mt-1.5 text-[11.5px]" style={{ color: "var(--app-accent-strong)" }}>
            This will be added to your subjects when you save.
          </p>
        </div>
      ) : null}
    </div>
  );
}

function Option({
  label,
  colour,
  selected,
  onClick,
}: {
  label: string;
  colour?: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={selected}
      onClick={onClick}
      className="flex w-full items-center gap-2 rounded px-2.5 py-2 text-left text-[13.5px] ui-hover"
      style={{ color: "var(--app-text)", background: selected ? "var(--app-accent-soft)" : "transparent" }}
    >
      <span className="min-w-0 flex-1 truncate" style={{ color: colour ? `color-mix(in oklab, ${colour} 70%, var(--app-text))` : undefined }}>
        {label}
      </span>
      {selected ? <span aria-hidden="true" style={{ color: "var(--app-accent-strong)" }}>✓</span> : null}
    </button>
  );
}
