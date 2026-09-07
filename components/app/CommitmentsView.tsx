"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api/client";
import { useDashboardData } from "@/lib/app/DashboardProvider";
import { cn } from "@/lib/cn";
import PageHeader from "./PageHeader";
import AppButton from "./AppButton";
import EmptyState, { ExampleRow } from "./EmptyState";

interface Commitment {
  id: string;
  title: string;
  category: "school" | "sport" | "extracurricular" | "other";
  recurrence: "none" | "weekly" | "weekdays";
  weekday: number | null;
  startDate: string | null;
  startTime: string;
  endTime: string;
  notes: string;
  subject?: string | null;
}

const CATEGORY_LABELS: Record<string, { label: string; color: string }> = {
  school: { label: "School", color: "#38bdf8" },
  sport: { label: "Training", color: "#34d399" },
  extracurricular: { label: "Extra", color: "#f59e0b" },
  other: { label: "Other", color: "#a19f97" },
};

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default function CommitmentsView() {
  const { reload } = useDashboardData();
  const [commitments, setCommitments] = useState<Commitment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<Commitment | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await api<{ commitments: Commitment[] }>("/api/commitments");
      setCommitments(response.commitments);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const grouped = commitments.reduce<Record<string, Commitment[]>>((acc, c) => {
    (acc[c.category] ||= []).push(c);
    return acc;
  }, {});

  return (
    <>
      <PageHeader
        eyebrow="Commitments"
        title={
          commitments.length === 0 ? (
            <>Add your <span className="accent-serif">fixed</span> commitments.</>
          ) : (
            <>
              {commitments.length} recurring{" "}
              <span className="accent-serif">{commitments.length === 1 ? "commitment" : "commitments"}</span>
            </>
          )
        }
        meta="School hours, training, extracurriculars — Arcadia plans around them"
        action={
          <AppButton
            variant="primary"
            onClick={() => { setEditing(null); setSheetOpen(true); }}
            icon={<svg viewBox="0 0 20 20" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M10 4v12M4 10h12" strokeLinecap="round" /></svg>}
          >
            Add commitment
          </AppButton>
        }
      />

      <div className="mx-auto flex w-full max-w-[820px] flex-col gap-6 px-6 py-8 sm:px-10">
        {loading ? (
          <div className="rounded-[14px] p-10 text-center" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
            <p className="text-[13.5px]" style={{ color: "var(--app-text-muted)" }}>Loading…</p>
          </div>
        ) : error ? (
          <p className="text-[13.5px]" style={{ color: "var(--app-danger)" }}>{error}</p>
        ) : commitments.length === 0 ? (
          <EmptyState
            title={<>Where your <span className="accent-serif">week</span> already lives.</>}
            body="Commitments are the fixed things — school hours, training, work shifts. Add them and Arcadia stops planning study on top of them."
            example={
              <>
                <ExampleRow title="School" meta="Mon–Fri · 8:30am–3:15pm" bar="#38bdf8" />
                <ExampleRow title="Training" meta="Tue, Thu · 6:00pm–7:30pm" bar="#34d399" />
                <ExampleRow title="Music lesson" meta="Sat · 10:00am–11:00am" bar="#f59e0b" />
              </>
            }
            action={
              <AppButton
                variant="primary"
                onClick={() => { setEditing(null); setSheetOpen(true); }}
                icon={<svg viewBox="0 0 20 20" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M10 4v12M4 10h12" strokeLinecap="round" /></svg>}
              >
                Add your first commitment
              </AppButton>
            }
            hint="You can add these once — they repeat every week automatically."
          />
        ) : (
          Object.entries(grouped).map(([category, list]) => (
            <section key={category}>
              <h2 className="type-eyebrow flex items-center gap-2" style={{ color: "var(--app-text-muted)" }}>
                <span
                  aria-hidden="true"
                  className="size-1.5 rounded-full"
                  style={{ background: CATEGORY_LABELS[category]?.color || "var(--app-text-faint)" }}
                />
                {CATEGORY_LABELS[category]?.label || category}
              </h2>
              <ul className="mt-3 flex flex-col gap-2">
                {list.map((c) => (
                  <CommitmentRow
                    key={c.id}
                    commitment={c}
                    onClick={() => { setEditing(c); setSheetOpen(true); }}
                  />
                ))}
              </ul>
            </section>
          ))
        )}
      </div>

      <CommitmentSheet
        open={sheetOpen}
        editing={editing}
        onClose={() => { setSheetOpen(false); setEditing(null); }}
        onSaved={async () => { await load(); await reload(); }}
      />
    </>
  );
}

function CommitmentRow({ commitment, onClick }: { commitment: Commitment; onClick: () => void }) {
  const color = CATEGORY_LABELS[commitment.category]?.color || "var(--app-text-faint)";
  const days = describeRecurrence(commitment);
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className={cn("group flex w-full items-center gap-4 rounded-[12px] px-4 py-4 text-left transition-colors hover:bg-black/[0.02]")}
        style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}
      >
        <span aria-hidden="true" className="h-10 w-1 shrink-0 rounded-full" style={{ background: color }} />
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-medium tracking-[-0.005em]" style={{ color: "var(--app-text)" }}>
            {commitment.title}
          </p>
          <p className="mt-1 text-[12.5px] font-mono" style={{ color: "var(--app-text-muted)" }}>
            {days} · {formatTimeRange(commitment.startTime, commitment.endTime)}
          </p>
        </div>
        <span aria-hidden="true" className="text-[11px] opacity-0 transition-opacity group-hover:opacity-100" style={{ color: "var(--app-text-muted)" }}>
          Edit →
        </span>
      </button>
    </li>
  );
}

function CommitmentSheet({
  open, editing, onClose, onSaved,
}: {
  open: boolean;
  editing: Commitment | null;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<Commitment["category"]>("school");
  const [recurrence, setRecurrence] = useState<Commitment["recurrence"]>("weekly");
  const [weekday, setWeekday] = useState<number>(1);
  const [startTime, setStartTime] = useState("08:30");
  const [endTime, setEndTime] = useState("15:00");
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    if (editing) {
      setTitle(editing.title);
      setCategory(editing.category);
      setRecurrence(editing.recurrence);
      setWeekday(editing.weekday ?? 1);
      setStartTime(editing.startTime);
      setEndTime(editing.endTime);
    } else {
      setTitle("");
      setCategory("school");
      setRecurrence("weekly");
      setWeekday(1);
      setStartTime("08:30");
      setEndTime("15:00");
    }
  }, [open, editing]);

  useEffect(() => {
    if (!open) return;
    const listener = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, [open, onClose]);

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
        notes: "",
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
    if (!confirm(`Delete "${editing.title}"?`)) return;
    setDeleting(true);
    try {
      await api(`/api/commitments/${encodeURIComponent(editing.id)}`, { method: "DELETE" });
      await onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed.");
    } finally {
      setDeleting(false);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <div
        className="absolute inset-0"
        style={{ background: "color-mix(in oklab, black 45%, transparent)" }}
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        role="dialog"
        aria-modal="true"
        className="relative w-full max-w-[520px] rounded-t-[16px] p-6 shadow-[0_40px_120px_-40px_rgba(0,0,0,0.35)] sm:rounded-[16px]"
        style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)", color: "var(--app-text)" }}
      >
        <div className="flex items-start justify-between">
          <div>
            <p className="type-eyebrow" style={{ color: "var(--app-text-muted)" }}>{editing ? "Edit" : "Add"}</p>
            <h2 className="mt-1 text-[22px] font-medium tracking-[-0.015em]">
              {editing ? editing.title : "New commitment"}
            </h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="grid h-8 w-8 place-items-center rounded-lg" style={{ color: "var(--app-text-muted)" }}>
            <svg viewBox="0 0 20 20" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M5 5l10 10M15 5L5 15" strokeLinecap="round" /></svg>
          </button>
        </div>

        <form onSubmit={submit} className="mt-5 space-y-4">
          <Field label="Title">
            <input
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Basketball training"
              className="w-full rounded-[10px] px-3 py-2.5 text-[15px] outline-none"
              style={{ background: "var(--app-surface-soft)", border: "1px solid var(--app-border)", color: "var(--app-text)" }}
            />
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Category">
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as Commitment["category"])}
                className="w-full rounded-[10px] px-3 py-2.5 text-[15px] outline-none"
                style={{ background: "var(--app-surface-soft)", border: "1px solid var(--app-border)", color: "var(--app-text)" }}
              >
                {Object.entries(CATEGORY_LABELS).map(([value, { label }]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </Field>
            <Field label="Repeats">
              <select
                value={recurrence}
                onChange={(e) => setRecurrence(e.target.value as Commitment["recurrence"])}
                className="w-full rounded-[10px] px-3 py-2.5 text-[15px] outline-none"
                style={{ background: "var(--app-surface-soft)", border: "1px solid var(--app-border)", color: "var(--app-text)" }}
              >
                <option value="weekly">Weekly</option>
                <option value="weekdays">Weekdays (Mon–Fri)</option>
                <option value="none">One-off</option>
              </select>
            </Field>
          </div>

          {recurrence === "weekly" ? (
            <Field label="On">
              <div className="flex gap-1">
                {WEEKDAYS.map((day, index) => (
                  <button
                    key={day}
                    type="button"
                    onClick={() => setWeekday(index)}
                    className={cn("flex-1 rounded-[8px] py-2 text-[13px] font-medium transition-colors")}
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
            </Field>
          ) : null}

          <div className="grid grid-cols-2 gap-4">
            <Field label="Start">
              <input
                required
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="w-full rounded-[10px] px-3 py-2.5 text-[15px] outline-none"
                style={{ background: "var(--app-surface-soft)", border: "1px solid var(--app-border)", color: "var(--app-text)" }}
              />
            </Field>
            <Field label="End">
              <input
                required
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                className="w-full rounded-[10px] px-3 py-2.5 text-[15px] outline-none"
                style={{ background: "var(--app-surface-soft)", border: "1px solid var(--app-border)", color: "var(--app-text)" }}
              />
            </Field>
          </div>

          {error ? <p className="text-[13.5px]" style={{ color: "var(--app-danger)" }}>{error}</p> : null}

          <div className="flex items-center justify-between gap-2 pt-2">
            {editing ? (
              <AppButton type="button" variant="ghost" onClick={remove} loading={deleting}>Delete</AppButton>
            ) : <span />}
            <div className="flex items-center gap-2">
              <AppButton type="button" variant="ghost" onClick={onClose}>Cancel</AppButton>
              <AppButton type="submit" variant="primary" loading={loading}>
                {editing ? "Save" : "Add"}
              </AppButton>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-2 block text-[12.5px] font-medium" style={{ color: "var(--app-text-muted)" }}>{label}</span>
      {children}
    </label>
  );
}

function describeRecurrence(c: Commitment): string {
  if (c.recurrence === "weekdays") return "Weekdays";
  if (c.recurrence === "weekly" && c.weekday !== null) return `Every ${WEEKDAYS[c.weekday]}`;
  if (c.recurrence === "none" && c.startDate) return c.startDate;
  return "One-off";
}

function formatTimeRange(start: string, end: string): string {
  const fmt = (t: string) => {
    const [h, m] = t.split(":").map(Number);
    const suffix = h >= 12 ? "pm" : "am";
    const display = h % 12 || 12;
    return m === 0 ? `${display} ${suffix}` : `${display}:${String(m).padStart(2, "0")} ${suffix}`;
  };
  return `${fmt(start)}–${fmt(end)}`;
}
