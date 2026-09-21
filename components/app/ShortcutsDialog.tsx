"use client";

import { useEffect, useRef } from "react";
import { GO_TARGETS } from "@/lib/app/commands";
import Kbd from "./Kbd";

const GENERAL: { label: string; keys: string[] }[] = [
  { label: "New task", keys: ["N"] },
  { label: "Toggle sidebar", keys: ["["] },
  { label: "Keyboard shortcuts", keys: ["?"] },
  { label: "Close menu or dialog", keys: ["Esc"] },
];

/** Help → Keyboard shortcuts, also opened with `?`. */
export default function ShortcutsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[80] grid place-items-center p-4">
      <button
        type="button"
        aria-label="Close"
        tabIndex={-1}
        onClick={onClose}
        className="absolute inset-0 cursor-default"
        style={{ background: "rgba(var(--shadow-rgb), 0.35)" }}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="shortcuts-title"
        className="relative w-full max-w-[560px] rounded-lg"
        style={{ background: "var(--app-elev)", boxShadow: "var(--elev-3)" }}
      >
        <div className="flex items-center justify-between border-b px-5 py-3.5" style={{ borderColor: "var(--app-border)" }}>
          <h2 id="shortcuts-title" className="text-[14px] font-semibold" style={{ color: "var(--app-text)" }}>
            Keyboard shortcuts
          </h2>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            className="rounded-md px-2 py-1 text-[12.5px] ui-hover"
            style={{ color: "var(--app-text-muted)" }}
          >
            Close
          </button>
        </div>
        <div className="grid gap-6 px-5 py-4 sm:grid-cols-2">
          <ShortcutGroup title="General" rows={GENERAL} />
          <ShortcutGroup
            title="Go to"
            rows={GO_TARGETS.map((target) => ({
              label: target.label,
              keys: ["G", target.key === "," ? "," : target.key.toUpperCase()],
            }))}
          />
        </div>
      </div>
    </div>
  );
}

function ShortcutGroup({ title, rows }: { title: string; rows: { label: string; keys: string[] }[] }) {
  return (
    <div>
      <p className="mb-2 text-[12px] font-semibold" style={{ color: "var(--app-text-muted)" }}>
        {title}
      </p>
      <ul className="flex flex-col">
        {rows.map((row) => (
          <li
            key={row.label}
            className="flex h-8 items-center justify-between border-b text-[13px] last:border-b-0"
            style={{ borderColor: "var(--app-border)", color: "var(--app-text-soft)" }}
          >
            {row.label}
            <Kbd keys={row.keys} />
          </li>
        ))}
      </ul>
    </div>
  );
}
