"use client";

import { useState } from "react";
import { api } from "@/lib/api/client";
import AppButton from "../AppButton";

const SCORES = Array.from({ length: 10 }, (_, index) => index + 1);

export default function LockInCheckIn({
  activityId,
  minutes,
  subject,
  onClose,
}: {
  activityId: string;
  minutes: number;
  subject: string;
  onClose: () => void;
}) {
  const [score, setScore] = useState<number | null>(null);
  const [reflection, setReflection] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [earned, setEarned] = useState<number | null>(null);

  const question = score === null
    ? "How locked in were you?"
    : score >= 7
      ? "What helped you lock in?"
      : "What got in the way?";

  async function save() {
    if (score === null) {
      setError("Pick a number from 1 to 10.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const result = await api<{ rewards?: Array<{ xp: number }> }>(`/api/study-sessions/${encodeURIComponent(activityId)}/lock-in`, {
        method: "POST",
        body: JSON.stringify({ score, reflection }),
      });
      setEarned((result.rewards ?? []).reduce((total, reward) => total + reward.xp, 0));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Couldn't save your reflection.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[135] flex items-end justify-center p-0 sm:items-center sm:p-6">
      <div aria-hidden="true" className="absolute inset-0 bg-black/55 backdrop-blur-sm" onClick={earned === null ? onClose : undefined} />
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="lock-in-title"
        className="relative w-full max-w-[460px] rounded-t-[22px] border p-6 sm:rounded-[22px]"
        style={{ background: "var(--app-elev)", borderColor: "var(--app-border)", boxShadow: "var(--elev-3)", color: "var(--app-text)" }}
      >
        {earned === null ? (
          <>
            <p className="type-eyebrow" style={{ color: "var(--app-accent-strong)" }}>Arcad check-in</p>
            <h2 id="lock-in-title" className="mt-1 text-[24px] font-semibold tracking-[-0.025em]">{question}</h2>
            <p className="mt-2 text-[14px] leading-6" style={{ color: "var(--app-text-muted)" }}>
              {minutes} min of {subject || "study"} is logged either way. An honest score helps Arcad support your next block.
            </p>

            <div className="mt-5 grid grid-cols-5 gap-2" role="radiogroup" aria-label="Lock-in score out of 10">
              {SCORES.map((value) => {
                const selected = score === value;
                return (
                  <button
                    key={value}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => { setScore(value); setError(null); }}
                    className="ui-press h-10 rounded-lg text-[14px] font-semibold tabular-nums"
                    style={{
                      background: selected ? "var(--app-accent)" : "var(--app-surface-soft)",
                      color: selected ? "var(--app-accent-on)" : "var(--app-text)",
                      border: `1px solid ${selected ? "var(--app-accent)" : "var(--app-border)"}`,
                    }}
                  >
                    {value}
                  </button>
                );
              })}
            </div>
            <div className="mt-2 flex justify-between text-[12px]" style={{ color: "var(--app-text-muted)" }}>
              <span>Scattered</span><span>Fully locked in</span>
            </div>

            {score !== null ? (
              <label className="mt-5 block">
                <span className="text-[13px] font-medium" style={{ color: "var(--app-text-soft)" }}>{question} <span style={{ color: "var(--app-text-muted)" }}>(optional)</span></span>
                <textarea
                  value={reflection}
                  onChange={(event) => setReflection(event.target.value.slice(0, 280))}
                  maxLength={280}
                  rows={3}
                  placeholder={score >= 7 ? "e.g. Phone away, clear goal" : "e.g. I kept checking my phone"}
                  className="mt-2 w-full resize-none rounded-lg border px-3 py-2.5 text-[14px] outline-none transition-shadow focus:ring-2"
                  style={{ background: "var(--app-surface)", borderColor: "var(--app-border)", color: "var(--app-text)", caretColor: "var(--app-accent)" }}
                />
              </label>
            ) : null}

            <p className="mt-3 text-[12px] leading-5" style={{ color: "var(--app-text-muted)" }}>
              {minutes >= 10
                ? "Scores of 7 to 10 can earn a small capped focus bonus. Your minutes and progress never depend on the score."
                : "Your minutes and progress never depend on the score. This reflection still helps Arcad support your next block."}
            </p>
            {error ? <p role="alert" className="mt-3 text-[13px]" style={{ color: "var(--app-danger)" }}>{error}</p> : null}
            <div className="mt-6 flex items-center justify-end gap-2">
              <AppButton type="button" variant="ghost" onClick={onClose} disabled={saving}>Skip</AppButton>
              <AppButton type="button" variant="primary" onClick={() => void save()} loading={saving}>Save check-in</AppButton>
            </div>
          </>
        ) : (
          <div className="text-center">
            <p className="type-eyebrow" style={{ color: "var(--app-accent-strong)" }}>Check-in saved</p>
            <h2 id="lock-in-title" className="mt-1 text-[24px] font-semibold tracking-[-0.025em]">{earned > 0 ? `+${earned} focus XP` : "Nice self-awareness."}</h2>
            <p className="mt-2 text-[14px] leading-6" style={{ color: "var(--app-text-muted)" }}>
              Arcad can use what you noticed to make your next study block feel more doable.
            </p>
            <AppButton type="button" variant="primary" onClick={onClose} className="mt-6">Back to focus</AppButton>
          </div>
        )}
      </section>
    </div>
  );
}
