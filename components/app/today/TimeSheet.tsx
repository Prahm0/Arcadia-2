"use client";

import { useState } from "react";

const toInput = (minutes: number | null) =>
  minutes === null ? "" : `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
const fromInput = (value: string): number | null => {
  const match = value.match(/^(\d{2}):(\d{2})$/);
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
};

/**
 * Give one of your own lines a time, or take it away. Start is enough; an
 * end turns it into a range ("4:20 to 5:00").
 */
export default function TimeSheet({
  title,
  start,
  end,
  onSave,
  onClose,
}: {
  title: string;
  start: number | null;
  end: number | null;
  onSave: (start: number | null, end: number | null) => Promise<void> | void;
  onClose: () => void;
}) {
  const [from, setFrom] = useState(toInput(start));
  const [to, setTo] = useState(toInput(end));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(nextStart: number | null, nextEnd: number | null) {
    if (nextStart !== null && nextEnd !== null && nextEnd <= nextStart) {
      setError("The end needs to be after the start.");
      return;
    }
    setSaving(true);
    try {
      await onSave(nextStart, nextStart === null ? null : nextEnd);
      onClose();
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : "Couldn't save that time.");
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[120] flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-label="Set a time">
      <button type="button" aria-label="Close" className="absolute inset-0 bg-black/40" onClick={onClose} />
      <form
        className="relative w-full max-w-sm rounded-t-[24px] p-5 pb-[calc(env(safe-area-inset-bottom,0px)+1.25rem)] sm:rounded-[24px]"
        style={{ background: "var(--app-surface)", color: "var(--app-text)", boxShadow: "var(--elev-2, 0 10px 40px rgba(0,0,0,.2))" }}
        onSubmit={(event) => {
          event.preventDefault();
          void save(fromInput(from), fromInput(to));
        }}
      >
        <p className="truncate text-[17px] font-semibold">{title}</p>
        <div className="mt-4 grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1.5 text-[12.5px] font-medium" style={{ color: "var(--app-text-muted)" }}>
            Start
            <input
              id="line-time-start"
              type="time"
              required
              value={from}
              onChange={(event) => setFrom(event.target.value)}
              className="h-11 rounded-xl px-3 text-[16px] outline-none"
              style={{ background: "var(--app-surface-soft)", color: "var(--app-text)" }}
            />
          </label>
          <label className="flex flex-col gap-1.5 text-[12.5px] font-medium" style={{ color: "var(--app-text-muted)" }}>
            End (optional)
            <input
              id="line-time-end"
              type="time"
              value={to}
              onChange={(event) => setTo(event.target.value)}
              className="h-11 rounded-xl px-3 text-[16px] outline-none"
              style={{ background: "var(--app-surface-soft)", color: "var(--app-text)" }}
            />
          </label>
        </div>
        {error ? <p className="mt-3 text-[13px]" style={{ color: "var(--app-danger)" }}>{error}</p> : null}
        <div className="mt-5 flex items-center gap-2">
          <button
            type="submit"
            disabled={saving || !from}
            className="ui-press h-11 flex-1 rounded-full text-[15px] font-semibold disabled:opacity-50"
            style={{ background: "var(--app-accent)", color: "var(--app-accent-on)" }}
          >
            {saving ? "Saving..." : "Save"}
          </button>
          {start !== null ? (
            <button
              type="button"
              disabled={saving}
              onClick={() => void save(null, null)}
              className="ui-press h-11 rounded-full px-4 text-[14px] font-medium"
              style={{ color: "var(--app-text-muted)" }}
            >
              No time
            </button>
          ) : null}
        </div>
      </form>
    </div>
  );
}
