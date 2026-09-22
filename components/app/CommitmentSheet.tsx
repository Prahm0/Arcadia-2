"use client";

import { useState } from "react";
import { api } from "@/lib/api/client";
import type { ProfileCommitment } from "@/lib/api/profile";
import { categoryColor } from "@/lib/app/categoryColors";
import AppButton from "./AppButton";
import { Label, Select, Sheet, TextInput } from "./profile/ui";

export const COMMITMENT_CATEGORIES: Record<
  ProfileCommitment["category"],
  { label: string; color: string }
> = {
  sport: { label: "Sport & training", color: categoryColor("sport") },
  extracurricular: { label: "Club, music or activity", color: categoryColor("extracurricular") },
  school: { label: "School", color: categoryColor("school") },
  other: { label: "Work or other", color: categoryColor("other") },
};

export const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/**
 * Add or edit anything that blocks out time every week: training, clubs, a
 * job, school hours. Saving replans the week around it.
 */
export default function CommitmentSheet({
  open,
  editing,
  defaultCategory = "sport",
  onClose,
  onSaved,
}: {
  open: boolean;
  editing: ProfileCommitment | null;
  defaultCategory?: ProfileCommitment["category"];
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const school = !editing && defaultCategory === "school";
  return (
    <Sheet
      open={open}
      eyebrow={editing ? "Edit" : "Add"}
      title={editing ? editing.title : school ? "School hours" : "New co-curricular"}
      onClose={onClose}
    >
      {/* Mounted only while open, so every open starts from these values. */}
      <CommitmentForm
        editing={editing}
        initial={
          editing ?? {
            title: "",
            category: defaultCategory,
            recurrence: school ? "weekdays" : "weekly",
            weekday: 1,
            startTime: school ? "08:30" : "16:00",
            endTime: school ? "15:15" : "17:30",
          }
        }
        onClose={onClose}
        onSaved={onSaved}
      />
    </Sheet>
  );
}

function CommitmentForm({
  editing,
  initial,
  onClose,
  onSaved,
}: {
  editing: ProfileCommitment | null;
  initial: Pick<ProfileCommitment, "title" | "category" | "recurrence" | "weekday" | "startTime" | "endTime">;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [title, setTitle] = useState(initial.title);
  const [category, setCategory] = useState(initial.category);
  const [recurrence, setRecurrence] = useState(initial.recurrence);
  const [weekday, setWeekday] = useState(initial.weekday ?? 1);
  const [startTime, setStartTime] = useState(initial.startTime);
  const [endTime, setEndTime] = useState(initial.endTime);
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const body = {
        title,
        category,
        recurrence,
        weekday: recurrence === "weekly" ? weekday : null,
        startDate: recurrence === "none" ? new Date().toISOString().slice(0, 10) : null,
        startTime,
        endTime,
        notes: editing?.notes ?? "",
      };
      if (editing) {
        await api(`/api/commitments/${encodeURIComponent(editing.id)}`, {
          method: "PATCH",
          body: JSON.stringify(body),
        });
      } else {
        await api("/api/commitments", { method: "POST", body: JSON.stringify(body) });
      }
      await onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  async function remove() {
    if (!editing) return;
    if (!confirm(`Remove "${editing.title}"? Your week will be replanned without it.`)) return;
    setDeleting(true);
    setError(null);
    try {
      await api(`/api/commitments/${encodeURIComponent(editing.id)}`, { method: "DELETE" });
      await onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't remove it.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <Label text="Name">
        <TextInput
          required
          value={title}
          onChange={setTitle}
          maxLength={200}
          placeholder={category === "school" ? "e.g. School" : "e.g. Basketball training"}
        />
      </Label>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Label text="Type">
          <Select value={category} onChange={(value) => setCategory(value as ProfileCommitment["category"])}>
            {Object.entries(COMMITMENT_CATEGORIES).map(([value, { label }]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </Label>
        <Label text="Repeats">
          <Select
            value={recurrence}
            onChange={(value) => setRecurrence(value as ProfileCommitment["recurrence"])}
          >
            <option value="weekly">Every week</option>
            <option value="weekdays">Weekdays (Mon–Fri)</option>
            <option value="daily">Every day</option>
            <option value="none">Just once, today</option>
          </Select>
        </Label>
      </div>

      {recurrence === "weekly" ? (
        <Label text="On">
          <div className="flex gap-1">
            {WEEKDAYS.map((day, index) => (
              <button
                key={day}
                type="button"
                onClick={() => setWeekday(index)}
                aria-pressed={weekday === index}
                className="flex-1 rounded-sm py-2 text-[13px] font-medium transition-colors"
                style={{
                  background: weekday === index ? "var(--app-accent-soft)" : "var(--app-surface-soft)",
                  color: weekday === index ? "var(--app-accent-strong)" : "var(--app-text-soft)",
                  border: `1px solid ${weekday === index ? "var(--app-accent)" : "var(--app-border)"}`,
                }}
              >
                {day}
              </button>
            ))}
          </div>
        </Label>
      ) : null}

      <div className="grid grid-cols-2 gap-4">
        <Label text="Starts">
          <TextInput required type="time" value={startTime} onChange={setStartTime} />
        </Label>
        <Label text="Ends">
          <TextInput required type="time" value={endTime} onChange={setEndTime} />
        </Label>
      </div>

      {error ? (
        <p role="alert" className="text-[13.5px]" style={{ color: "var(--app-danger)" }}>
          {error}
        </p>
      ) : null}

      <div className="flex items-center justify-between gap-2 pt-2">
        {editing ? (
          <AppButton type="button" variant="danger" onClick={remove} loading={deleting}>
            Remove
          </AppButton>
        ) : (
          <span />
        )}
        <div className="flex items-center gap-2">
          <AppButton type="button" variant="ghost" onClick={onClose}>
            Cancel
          </AppButton>
          <AppButton type="submit" variant="primary" loading={loading}>
            {editing ? "Save" : "Add"}
          </AppButton>
        </div>
      </div>
    </form>
  );
}

export function describeRecurrence(commitment: ProfileCommitment): string {
  if (commitment.recurrence === "weekdays") return "Weekdays";
  if (commitment.recurrence === "daily") return "Every day";
  if (commitment.recurrence === "weekly" && commitment.weekday !== null) {
    return `Every ${WEEKDAYS[commitment.weekday]}`;
  }
  if (commitment.recurrence === "none" && commitment.startDate) return commitment.startDate;
  return "Once";
}

export function formatTimeRange(start: string, end: string): string {
  const format = (time: string) => {
    const [hours, minutes] = time.split(":").map(Number);
    const suffix = hours >= 12 ? "pm" : "am";
    const display = hours % 12 || 12;
    return minutes === 0 ? `${display}${suffix}` : `${display}:${String(minutes).padStart(2, "0")}${suffix}`;
  };
  return `${format(start)}–${format(end)}`;
}
