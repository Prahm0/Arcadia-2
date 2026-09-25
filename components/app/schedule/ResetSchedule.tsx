"use client";

import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api/client";
import { useDashboardData } from "@/lib/app/DashboardProvider";
import AppButton from "../AppButton";
import { MenuRow, moveInMenu, type MenuEntry } from "../Menu";

interface ResetCounts {
  moved: number;
  removed: number;
}

/**
 * The toolbar's "⋯": where the schedule's rarer actions live. Resetting sits
 * here rather than as a button of its own, two clicks and a confirm away, so
 * it's where you'd look for it but not something you hit on the way to "Add task".
 */
export function ScheduleMoreMenu() {
  const [open, setOpen] = useState(false);
  const [resetting, setResetting] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    menu.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    const close = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, [open]);

  const entries: MenuEntry[] = [
    { kind: "item", label: "Reset schedule…", danger: true, onSelect: () => setResetting(true) },
  ];

  return (
    <div ref={ref} className="relative">
      <button
        ref={trigger}
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-label="More schedule options"
        title="More"
        aria-haspopup="menu"
        aria-expanded={open}
        className="ui-hover grid h-9 w-9 place-items-center rounded-full"
        style={{ color: "var(--app-text-soft)" }}
      >
        <svg viewBox="0 0 20 20" width="16" height="16" fill="currentColor" aria-hidden="true">
          <circle cx="4.5" cy="10" r="1.5" />
          <circle cx="10" cy="10" r="1.5" />
          <circle cx="15.5" cy="10" r="1.5" />
        </svg>
      </button>
      {open ? (
        <div
          ref={menu}
          role="menu"
          aria-label="Schedule"
          onKeyDown={(event) => {
            if (event.key === "Escape" || event.key === "Tab") {
              event.preventDefault();
              setOpen(false);
              trigger.current?.focus();
              return;
            }
            moveInMenu(event, menu.current);
          }}
          className="absolute right-0 top-[calc(100%+6px)] z-40 w-[200px] rounded-lg p-1"
          style={{ background: "var(--app-elev)", boxShadow: "var(--elev-3)" }}
        >
          {entries.map((entry, index) => (
            <MenuRow
              key={index}
              entry={entry}
              gutter={false}
              onSelect={() => {
                setOpen(false);
                if (entry.kind === "item") entry.onSelect();
              }}
            />
          ))}
        </div>
      ) : null}
      {resetting ? (
        <ResetScheduleDialog
          onClose={() => {
            setResetting(false);
            trigger.current?.focus();
          }}
        />
      ) : null}
    </div>
  );
}

/**
 * Says exactly what a reset undoes before doing it. Cancel has focus, so
 * Enter on a stray keypress keeps the schedule as it is.
 */
function ResetScheduleDialog({ onClose }: { onClose: () => void }) {
  const { reload } = useDashboardData();
  const [counts, setCounts] = useState<ResetCounts | null>(null);
  const [resetting, setResetting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api<ResetCounts>("/api/plan/reset")
      .then((response) => {
        if (!cancelled) setCounts(response);
      })
      .catch(() => {
        if (!cancelled) setError("Couldn't check your schedule. Try again in a moment.");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !resetting) onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose, resetting]);

  async function reset() {
    setResetting(true);
    setError(null);
    try {
      await api("/api/plan/reset", { method: "POST" });
      await reload();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't reset your schedule.");
      setResetting(false);
    }
  }

  const changes = counts ? counts.moved + counts.removed : 0;
  const nothing = counts !== null && changes === 0;

  return (
    <div className="fixed inset-0 z-[80] grid place-items-center p-4">
      <button
        type="button"
        aria-label="Close"
        tabIndex={-1}
        disabled={resetting}
        onClick={onClose}
        className="absolute inset-0 cursor-default"
        style={{ background: "rgba(var(--shadow-rgb), 0.45)" }}
      />
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="reset-schedule-title"
        aria-describedby="reset-schedule-body"
        className="relative w-full max-w-[440px] rounded-lg p-6"
        style={{ background: "var(--app-elev)", boxShadow: "var(--elev-3)", color: "var(--app-text)" }}
      >
        <h2 id="reset-schedule-title" className="text-[20px] font-semibold tracking-[-0.02em]">
          {nothing ? "Nothing to reset" : "Reset your schedule?"}
        </h2>
        <div id="reset-schedule-body" className="mt-3 text-[14px] leading-6" style={{ color: "var(--app-text-muted)" }}>
          {counts === null && !error ? (
            <p>Checking what you&apos;ve changed…</p>
          ) : nothing ? (
            <p>Your schedule already matches Arcad&apos;s plan. There aren&apos;t any moved or removed blocks from today on.</p>
          ) : counts ? (
            <>
              <p>Study blocks from now on go back to where Arcad planned them:</p>
              <ul className="mt-2 flex list-disc flex-col gap-1 pl-5" style={{ color: "var(--app-text-soft)" }}>
                {counts.moved ? <li>{plural(counts.moved, "block")} you moved {counts.moved === 1 ? "goes" : "go"} back</li> : null}
                {counts.removed ? <li>{plural(counts.removed, "block")} you removed {counts.removed === 1 ? "comes" : "come"} back</li> : null}
              </ul>
              <p className="mt-3 text-[13px] leading-5" style={{ color: "var(--app-text-faint)" }}>
                Finished blocks, your deadlines, commitments and imported calendars stay as they are.
              </p>
            </>
          ) : null}
        </div>
        {error ? <p role="alert" className="mt-3 text-[13px]" style={{ color: "var(--app-danger)" }}>{error}</p> : null}
        <div className="mt-6 flex justify-end gap-3">
          <AppButton variant="secondary" onClick={onClose} disabled={resetting} autoFocus>
            {nothing ? "Close" : "Cancel"}
          </AppButton>
          {nothing ? null : (
            <AppButton variant="danger" onClick={() => void reset()} disabled={!changes} loading={resetting}>
              Reset schedule
            </AppButton>
          )}
        </div>
      </section>
    </div>
  );
}

function plural(count: number, word: string) {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}
