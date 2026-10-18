"use client";

import { useState } from "react";
import AppButton from "./AppButton";
import {
  UNLOCK_WAITS,
  blockTimeDays,
  blockTimeRange,
  readBlockTimes,
  readUnlockWait,
  saveBlockTimes,
  saveUnlockWait,
  type BlockTime,
} from "@/lib/app/blockTimes";

const DAY_LETTERS = ["S", "M", "T", "W", "T", "F", "S"];
const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const fromInput = (value: string) => {
  const match = value.match(/^(\d{2}):(\d{2})$/);
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
};

/**
 * Settings > App blocking: times the picked apps are blocked by themselves,
 * like Opal's schedules, and how long "5 more minutes" makes you wait.
 */
export default function BlockTimesEditor() {
  const [times, setTimes] = useState<BlockTime[]>(readBlockTimes);
  const [wait, setWait] = useState(readUnlockWait);
  const [draft, setDraft] = useState<{ label: string; start: string; end: string; days: number[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  function update(next: BlockTime[]) {
    setTimes(next);
    saveBlockTimes(next);
  }

  function add() {
    if (!draft) return;
    const start = fromInput(draft.start);
    const end = fromInput(draft.end);
    if (start === null || end === null || start === end) return setError("Pick a start and a different end.");
    if (!draft.days.length) return setError("Pick at least one day.");
    update([...times, { id: Math.random().toString(36).slice(2, 10), label: draft.label.trim().slice(0, 40), start, end, days: [...draft.days].sort() }]);
    setDraft(null);
    setError(null);
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <p className="text-[14px] font-medium" style={{ color: "var(--app-text)" }}>Block times</p>
        <p className="mt-0.5 text-[13px]" style={{ color: "var(--app-text-muted)" }}>Your apps are also blocked at these times, every week.</p>
        {times.length ? (
          <ul className="mt-3 flex flex-col gap-2">
            {times.map((time) => (
              <li key={time.id} className="flex items-center gap-3 rounded-xl px-4 py-3" style={{ background: "var(--app-surface-soft)" }}>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[14px] font-semibold" style={{ color: "var(--app-text)" }}>{time.label || "Focus time"}</p>
                  <p className="text-[12.5px] tabular-nums" style={{ color: "var(--app-text-muted)" }}>{blockTimeRange(time)} · {blockTimeDays(time.days)}</p>
                </div>
                <button
                  type="button"
                  onClick={() => update(times.filter((item) => item.id !== time.id))}
                  className="ui-press rounded-full px-3 py-1.5 text-[13px] font-medium"
                  style={{ color: "var(--app-text-muted)" }}
                  aria-label={`Remove ${time.label || "Focus time"}`}
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        ) : null}

        {draft ? (
          <div className="mt-3 flex flex-col gap-3 rounded-xl p-4" style={{ background: "var(--app-surface-soft)" }}>
            <input
              id="block-time-label"
              value={draft.label}
              onChange={(event) => setDraft({ ...draft, label: event.target.value })}
              placeholder="Name (optional), like Night or Homework"
              maxLength={40}
              className="h-10 rounded-lg px-3 text-[14px] outline-none"
              style={{ background: "var(--app-surface)", color: "var(--app-text)" }}
            />
            <div className="grid grid-cols-2 gap-3">
              <label className="flex flex-col gap-1 text-[12.5px] font-medium" style={{ color: "var(--app-text-muted)" }}>
                From
                <input id="block-time-start" type="time" value={draft.start} onChange={(event) => setDraft({ ...draft, start: event.target.value })} className="h-10 rounded-lg px-3 text-[15px] outline-none" style={{ background: "var(--app-surface)", color: "var(--app-text)" }} />
              </label>
              <label className="flex flex-col gap-1 text-[12.5px] font-medium" style={{ color: "var(--app-text-muted)" }}>
                To
                <input id="block-time-end" type="time" value={draft.end} onChange={(event) => setDraft({ ...draft, end: event.target.value })} className="h-10 rounded-lg px-3 text-[15px] outline-none" style={{ background: "var(--app-surface)", color: "var(--app-text)" }} />
              </label>
            </div>
            <div className="flex gap-1.5" role="group" aria-label="Days">
              {DAY_LETTERS.map((letter, day) => {
                const on = draft.days.includes(day);
                return (
                  <button
                    key={day}
                    type="button"
                    aria-pressed={on}
                    aria-label={DAY_NAMES[day]}
                    onClick={() => setDraft({ ...draft, days: on ? draft.days.filter((item) => item !== day) : [...draft.days, day] })}
                    className="ui-press grid size-9 place-items-center rounded-full text-[13px] font-semibold"
                    style={on ? { background: "var(--app-accent)", color: "var(--app-accent-on)" } : { background: "var(--app-surface)", color: "var(--app-text-muted)" }}
                  >
                    {letter}
                  </button>
                );
              })}
            </div>
            {error ? <p className="text-[13px]" style={{ color: "var(--app-danger)" }}>{error}</p> : null}
            <div className="flex gap-2">
              <AppButton type="button" variant="primary" onClick={add}>Add block time</AppButton>
              <AppButton type="button" variant="ghost" onClick={() => { setDraft(null); setError(null); }}>Cancel</AppButton>
            </div>
          </div>
        ) : (
          <div className="mt-3">
            <AppButton type="button" variant="secondary" onClick={() => setDraft({ label: "", start: "21:00", end: "07:00", days: [0, 1, 2, 3, 4, 5, 6] })}>
              Add a block time
            </AppButton>
          </div>
        )}
      </div>

      <div>
        <p className="text-[14px] font-medium" style={{ color: "var(--app-text)" }}>Wait before unblocking</p>
        <p className="mt-0.5 text-[13px]" style={{ color: "var(--app-text-muted)" }}>&ldquo;5 more minutes&rdquo; makes you wait this long first, so opening an app is a choice, not a reflex.</p>
        <div className="mt-3 flex flex-wrap gap-2" role="radiogroup" aria-label="Wait before unblocking">
          {UNLOCK_WAITS.map((seconds) => (
            <button
              key={seconds}
              type="button"
              role="radio"
              aria-checked={wait === seconds}
              onClick={() => { setWait(seconds); saveUnlockWait(seconds); }}
              className="ui-press h-9 rounded-full px-4 text-[13.5px] font-semibold"
              style={wait === seconds ? { background: "var(--app-accent)", color: "var(--app-accent-on)" } : { background: "var(--app-surface-soft)", color: "var(--app-text-muted)" }}
            >
              {seconds < 60 ? `${seconds}s` : "1 min"}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
