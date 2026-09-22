"use client";

import Link from "next/link";
import { useState } from "react";
import { api } from "@/lib/api/client";
import { updateProfile, type ProfileGoal } from "@/lib/api/profile";
import AppButton from "../AppButton";
import type { SectionProps } from "./ProfileView";
import { Section, TextInput } from "./ui";

/**
 * What the student is working toward: an ATAR, a grade per subject (set on
 * each subject's page), and anything else in their own words. Arcad reads
 * all of it when it plans and when it talks.
 */
export default function GoalsSection({ data, refresh, replace }: SectionProps) {
  const graded = data.subjects.filter((subject) => subject.targetGrade);

  return (
    <Section id="goals" title="Goals" meta="What you're aiming for. Arcad keeps these in mind.">
      <div className="grid grid-cols-1 gap-5 md:grid-cols-[220px_1fr]">
        <AtarTarget value={data.profile.atarTarget} onSaved={replace} />

        <div className="min-w-0">
          <GoalList goals={data.goals} refresh={refresh} />

          <div className="mt-4 border-t pt-4" style={{ borderColor: "var(--app-border)" }}>
            <p className="text-[12.5px] font-medium" style={{ color: "var(--app-text-muted)" }}>
              Subject targets
            </p>
            {graded.length === 0 ? (
              <p className="mt-1.5 text-[13px]" style={{ color: "var(--app-text-muted)" }}>
                Open a subject to set the grade you&apos;re aiming for.
              </p>
            ) : (
              <ul className="mt-2 flex flex-wrap gap-1.5">
                {graded.map((subject) => (
                  <li key={subject.id}>
                    <Link
                      href={`/app/profile/subjects/${encodeURIComponent(subject.id)}`}
                      className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[12.5px] ui-hover"
                      style={{ border: "1px solid var(--app-border)", color: "var(--app-text-soft)" }}
                    >
                      <span
                        aria-hidden="true"
                        className="h-2 w-2 rounded-full"
                        style={{ background: subject.colour || "var(--app-text-faint)" }}
                      />
                      {subject.name}
                      <span className="font-medium" style={{ color: "var(--app-text)" }}>
                        {subject.targetGrade}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </Section>
  );
}

function AtarTarget({
  value,
  onSaved,
}: {
  value: number | null;
  onSaved: SectionProps["replace"];
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function open() {
    setDraft(value !== null ? value.toFixed(2) : "");
    setError(null);
    setEditing(true);
  }

  async function save(next: number | null) {
    setSaving(true);
    setError(null);
    try {
      onSaved(await updateProfile({ atarTarget: next }));
      setEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-md p-4" style={{ background: "var(--app-surface-soft)" }}>
      <p className="text-[12.5px] font-medium" style={{ color: "var(--app-text-muted)" }}>
        ATAR target
      </p>
      {editing ? (
        <form
          className="mt-2 space-y-2"
          onSubmit={(event) => {
            event.preventDefault();
            const numeric = Number(draft);
            if (!draft.trim()) return void save(null);
            if (!Number.isFinite(numeric)) return setError("Enter a number like 90.00.");
            void save(numeric);
          }}
        >
          <TextInput
            value={draft}
            onChange={setDraft}
            type="number"
            inputMode="decimal"
            step="0.05"
            min="30"
            max="99.95"
            placeholder="e.g. 90.00"
          />
          {error ? (
            <p role="alert" className="text-[12.5px]" style={{ color: "var(--app-danger)" }}>
              {error}
            </p>
          ) : null}
          <div className="flex gap-2">
            <AppButton type="submit" variant="primary" size="sm" loading={saving}>
              Save
            </AppButton>
            <AppButton type="button" variant="ghost" size="sm" onClick={() => setEditing(false)}>
              Cancel
            </AppButton>
          </div>
        </form>
      ) : value !== null ? (
        <button type="button" onClick={open} className="mt-1 block text-left" aria-label="Edit ATAR target">
          <span className="text-[34px] font-semibold tabular-nums tracking-[-0.02em]" style={{ color: "var(--app-text)" }}>
            {value.toFixed(2)}
          </span>
          <span className="mt-0.5 block text-[12px]" style={{ color: "var(--app-text-muted)" }}>
            Tap to change
          </span>
        </button>
      ) : (
        <div className="mt-2">
          <AppButton variant="secondary" size="sm" onClick={open}>
            Set a target
          </AppButton>
        </div>
      )}
    </div>
  );
}

function GoalList({ goals, refresh }: { goals: ProfileGoal[]; refresh: () => Promise<void> }) {
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(key: string, action: () => Promise<unknown>) {
    setBusy(key);
    setError(null);
    try {
      await action();
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div>
      <p className="text-[12.5px] font-medium" style={{ color: "var(--app-text-muted)" }}>
        Your goals
      </p>
      {goals.length > 0 ? (
        <ul className="mt-1.5 flex flex-col">
          {goals.map((goal) => (
            <li key={goal.id} className="group flex items-center gap-3 rounded-md px-1 py-1.5">
              <input
                type="checkbox"
                checked={goal.done}
                disabled={busy === goal.id}
                onChange={() =>
                  void run(goal.id, () =>
                    api(`/api/goals/${encodeURIComponent(goal.id)}`, {
                      method: "PATCH",
                      body: JSON.stringify({ done: !goal.done }),
                    }),
                  )
                }
                aria-label={goal.done ? `Mark "${goal.title}" not done` : `Mark "${goal.title}" done`}
                className="h-4 w-4 shrink-0"
                style={{ accentColor: "var(--app-accent)" }}
              />
              <span
                className="min-w-0 flex-1 text-[14px]"
                style={{
                  color: goal.done ? "var(--app-text-muted)" : "var(--app-text)",
                  textDecoration: goal.done ? "line-through" : undefined,
                }}
              >
                {goal.title}
              </span>
              <button
                type="button"
                onClick={() =>
                  void run(goal.id, () => api(`/api/goals/${encodeURIComponent(goal.id)}`, { method: "DELETE" }))
                }
                aria-label={`Remove "${goal.title}"`}
                className="grid h-7 w-7 shrink-0 place-items-center rounded-md opacity-60 ui-hover group-hover:opacity-100"
                style={{ color: "var(--app-text-muted)" }}
              >
                <svg viewBox="0 0 20 20" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.7">
                  <path d="M5 5l10 10M15 5L5 15" strokeLinecap="round" />
                </svg>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-1.5 text-[13px]" style={{ color: "var(--app-text-muted)" }}>
          e.g. &ldquo;Get into Engineering at UQ&rdquo; or &ldquo;Stop cramming the night before&rdquo;.
        </p>
      )}
      <form
        className="mt-2 flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          const title = draft.trim();
          if (!title) return;
          void run("new", async () => {
            await api("/api/goals", { method: "POST", body: JSON.stringify({ title }) });
            setDraft("");
          });
        }}
      >
        <div className="flex-1">
          <TextInput value={draft} onChange={setDraft} maxLength={160} placeholder="Add a goal…" />
        </div>
        <AppButton type="submit" variant="secondary" loading={busy === "new"} disabled={!draft.trim()}>
          Add
        </AppButton>
      </form>
      {error ? (
        <p role="alert" className="mt-2 text-[12.5px]" style={{ color: "var(--app-danger)" }}>
          {error}
        </p>
      ) : null}
    </div>
  );
}
