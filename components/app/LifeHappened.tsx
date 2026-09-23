"use client";

import Link from "next/link";
import { useState } from "react";
import { api } from "@/lib/api/client";
import { useDashboardData } from "@/lib/app/DashboardProvider";
import AppButton from "./AppButton";

/**
 * The Recovery Loop, front of house. The student says what changed, Arcad
 * reflows deterministically (POST /api/plan/recover, no model in the path),
 * and we show what it protected and moved plus the one next thing to do. This
 * is the product's signature moment: life happened, and the plan adjusted.
 */
type Reason = "missed" | "less_time" | "tired" | "busy" | "new_deadline";

interface RecoveryResult {
  lines: string[];
  moved: number;
  nextBlock: { subject: string | null; title: string; startAt: string; minutes: number } | null;
}

const REASONS: { key: Reason; label: string; hint: string; needsInput?: boolean }[] = [
  { key: "missed", label: "I missed a study block", hint: "Reflow the work you didn't get to" },
  { key: "less_time", label: "I've got less time today", hint: "Push today's study to days with room" },
  { key: "tired", label: "I'm too tired or unwell", hint: "Lighten today, protect the important stuff" },
  { key: "busy", label: "Something came up", hint: "Work around a new commitment", needsInput: true },
  { key: "new_deadline", label: "A new deadline came up", hint: "Book prep before it's due", needsInput: true },
];

function timeLabel(iso: string, tz: string): string {
  return new Date(iso)
    .toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit", timeZone: tz })
    .toLowerCase()
    .replace(/\s/g, "");
}

export default function LifeHappened({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data, reload } = useDashboardData();
  const tz = data.profile?.timezone || (typeof Intl !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone : "Australia/Brisbane");

  const [reason, setReason] = useState<Reason | null>(null);
  const [busyStart, setBusyStart] = useState("");
  const [busyEnd, setBusyEnd] = useState("");
  const [dlTitle, setDlTitle] = useState("");
  const [dlSubject, setDlSubject] = useState("");
  const [dlDue, setDlDue] = useState("");
  const [dlSize, setDlSize] = useState<"small" | "medium" | "large">("medium");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<RecoveryResult | null>(null);

  const subjects: string[] = (data.subjects ?? []).map((s) => s.name).filter(Boolean);

  if (!open) return null;

  function reset() {
    setReason(null);
    setBusyStart("");
    setBusyEnd("");
    setDlTitle("");
    setDlSubject("");
    setDlDue("");
    setDlSize("medium");
    setError(null);
    setResult(null);
    setLoading(false);
  }

  function close() {
    reset();
    onClose();
  }

  async function run(r: Reason) {
    setLoading(true);
    setError(null);
    try {
      const body: Record<string, unknown> = { reason: r };
      if (r === "busy") {
        if (busyStart) body.busyStart = busyStart;
        if (busyEnd) body.busyEnd = busyEnd;
      }
      if (r === "new_deadline") {
        body.title = dlTitle.trim() || "New deadline";
        if (dlSubject) body.subject = dlSubject;
        if (dlDue) body.dueOn = dlDue;
        body.size = dlSize;
      }
      const res = await api<RecoveryResult>("/api/plan/recover", { method: "POST", body: JSON.stringify(body) });
      setResult(res);
      void reload();
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : "Couldn't update your plan. Try again.");
    } finally {
      setLoading(false);
    }
  }

  const selected = REASONS.find((r) => r.key === reason) ?? null;
  const deadlineReady = reason !== "new_deadline" || Boolean(dlDue);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Life happened"
      className="fixed inset-0 z-50 flex items-end justify-center sm:items-center"
      style={{ background: "rgba(0,0,0,0.5)" }}
      onClick={close}
    >
      <div
        className="w-full max-w-[460px] rounded-t-2xl p-6 sm:rounded-2xl"
        style={{ background: "var(--app-surface)", boxShadow: "var(--elev-3, 0 24px 60px -20px rgba(0,0,0,0.5))" }}
        onClick={(e) => e.stopPropagation()}
      >
        {result ? (
          <Result result={result} tz={tz} onDone={close} />
        ) : (
          <>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="type-mono-label" style={{ color: "var(--app-arcad-strong)" }}>
                  Life happened
                </p>
                <h2 className="mt-1.5 text-[22px] font-semibold tracking-[-0.01em]" style={{ color: "var(--app-text)" }}>
                  What changed?
                </h2>
              </div>
              <button
                type="button"
                onClick={close}
                aria-label="Close"
                className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-[16px]"
                style={{ background: "var(--app-surface-soft)", color: "var(--app-text-muted)" }}
              >
                ×
              </button>
            </div>

            <div className="mt-5 flex flex-col gap-2">
              {REASONS.map((r) => (
                <button
                  key={r.key}
                  type="button"
                  onClick={() => {
                    setReason(r.key);
                    setError(null);
                    if (!r.needsInput) void run(r.key);
                  }}
                  disabled={loading}
                  className="flex flex-col rounded-lg px-4 py-3 text-left transition-colors disabled:opacity-60"
                  style={{
                    background: reason === r.key ? "var(--app-arcad-soft)" : "var(--app-surface-soft)",
                    border: reason === r.key ? "1px solid var(--app-arcad)" : "1px solid transparent",
                  }}
                >
                  <span className="text-[14.5px] font-medium" style={{ color: "var(--app-text)" }}>
                    {r.label}
                  </span>
                  <span className="text-[12.5px]" style={{ color: "var(--app-text-muted)" }}>
                    {r.hint}
                  </span>
                </button>
              ))}
            </div>

            {selected?.key === "busy" ? (
              <div className="mt-4 flex items-end gap-3">
                <label className="flex-1 text-[12.5px]" style={{ color: "var(--app-text-muted)" }}>
                  From
                  <input
                    type="time"
                    value={busyStart}
                    onChange={(e) => setBusyStart(e.target.value)}
                    className="mt-1 w-full rounded-md px-3 py-2 text-[14px]"
                    style={{ background: "var(--app-surface-soft)", color: "var(--app-text)", border: "1px solid var(--app-border)" }}
                  />
                </label>
                <label className="flex-1 text-[12.5px]" style={{ color: "var(--app-text-muted)" }}>
                  Until
                  <input
                    type="time"
                    value={busyEnd}
                    onChange={(e) => setBusyEnd(e.target.value)}
                    className="mt-1 w-full rounded-md px-3 py-2 text-[14px]"
                    style={{ background: "var(--app-surface-soft)", color: "var(--app-text)", border: "1px solid var(--app-border)" }}
                  />
                </label>
              </div>
            ) : null}

            {selected?.key === "new_deadline" ? (
              <div className="mt-4 flex flex-col gap-3">
                <input
                  type="text"
                  value={dlTitle}
                  onChange={(e) => setDlTitle(e.target.value)}
                  placeholder="e.g. English essay"
                  className="w-full rounded-md px-3 py-2 text-[14px]"
                  style={{ background: "var(--app-surface-soft)", color: "var(--app-text)", border: "1px solid var(--app-border)" }}
                />
                <div className="flex gap-3">
                  <select
                    value={dlSubject}
                    onChange={(e) => setDlSubject(e.target.value)}
                    className="flex-1 rounded-md px-3 py-2 text-[14px]"
                    style={{ background: "var(--app-surface-soft)", color: "var(--app-text)", border: "1px solid var(--app-border)" }}
                  >
                    <option value="">Subject (optional)</option>
                    {subjects.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                  <input
                    type="date"
                    value={dlDue}
                    onChange={(e) => setDlDue(e.target.value)}
                    className="flex-1 rounded-md px-3 py-2 text-[14px]"
                    style={{ background: "var(--app-surface-soft)", color: "var(--app-text)", border: "1px solid var(--app-border)" }}
                  />
                </div>
                <div className="flex gap-2">
                  {(["small", "medium", "large"] as const).map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setDlSize(s)}
                      className="flex-1 rounded-md py-2 text-[13px] font-medium capitalize"
                      style={{
                        background: dlSize === s ? "var(--app-arcad)" : "var(--app-surface-soft)",
                        color: dlSize === s ? "var(--app-arcad-on)" : "var(--app-text-soft)",
                      }}
                    >
                      {s === "small" ? "About an hour" : s === "medium" ? "A few hours" : "A big one"}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            {error ? (
              <p className="mt-4 text-[13px]" style={{ color: "var(--app-danger)" }}>
                {error}
              </p>
            ) : null}

            {selected?.needsInput ? (
              <div className="mt-5">
                <AppButton variant="primary" onClick={() => reason && run(reason)} loading={loading} disabled={!deadlineReady} className="w-full">
                  Fix my week
                </AppButton>
              </div>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}

function Result({ result, tz, onDone }: { result: RecoveryResult; tz: string; onDone: () => void }) {
  const { lines, moved, nextBlock } = result;
  return (
    <div className="text-center">
      <div
        aria-hidden="true"
        className="mx-auto grid h-14 w-14 place-items-center rounded-2xl"
        style={{ background: "var(--app-arcad-soft)", color: "var(--app-arcad-strong)" }}
      >
        <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="2.2">
          <path d="M5 12.5l4.2 4.2L19 7" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
      <h2 className="mt-4 text-[24px] font-semibold tracking-[-0.015em]" style={{ color: "var(--app-text)" }}>
        {moved > 0 ? "Your week's back on track." : "You're still on track."}
      </h2>

      <ul className="mt-5 flex flex-col gap-2 text-left">
        {lines.map((line) => (
          <li key={line} className="flex items-start gap-2.5 rounded-lg px-4 py-2.5 text-[13.5px]" style={{ background: "var(--app-surface-soft)", color: "var(--app-text-soft)" }}>
            <span aria-hidden="true" className="mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full" style={{ background: "var(--app-arcad)", color: "var(--app-arcad-on)" }}>
              <svg viewBox="0 0 12 12" width="9" height="9" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M2.5 6.5l2.5 2.5 4.5-5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
            <span>{line}</span>
          </li>
        ))}
      </ul>

      {nextBlock ? (
        <div className="mt-5 rounded-lg p-4 text-left" style={{ background: "var(--app-arcad-soft)" }}>
          <p className="type-mono-label" style={{ color: "var(--app-arcad-strong)" }}>
            Your next block
          </p>
          <p className="mt-1 text-[15px] font-semibold" style={{ color: "var(--app-text)" }}>
            {nextBlock.subject || nextBlock.title}
          </p>
          <p className="text-[13px]" style={{ color: "var(--app-text-muted)" }}>
            {nextBlock.minutes} min · {timeLabel(nextBlock.startAt, tz)}
          </p>
        </div>
      ) : null}

      <div className="mt-6 flex flex-col gap-2.5">
        <Link
          href="/app/focus"
          onClick={onDone}
          className="flex h-11 w-full items-center justify-center rounded-lg text-[15px] font-semibold transition-opacity hover:opacity-90"
          style={{ background: "var(--app-arcad)", color: "var(--app-arcad-on)" }}
        >
          Start your next block
        </Link>
        <button
          type="button"
          onClick={onDone}
          className="text-[13px] underline underline-offset-4 transition-opacity hover:opacity-70"
          style={{ color: "var(--app-text-muted)" }}
        >
          Back to today
        </button>
      </div>
    </div>
  );
}
