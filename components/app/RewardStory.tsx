"use client";

import { useSyncExternalStore } from "react";

const KEY = "arcadia:reward-story:v1";

/** One plain explanation for the streak and constellation rewards. */
export default function RewardStory({ className = "" }: { className?: string }) {
  const visible = useSyncExternalStore(
    (notify) => {
      window.addEventListener("storage", notify);
      window.addEventListener("arcadia:reward-story", notify);
      return () => {
        window.removeEventListener("storage", notify);
        window.removeEventListener("arcadia:reward-story", notify);
      };
    },
    () => {
      try {
        return window.localStorage.getItem(KEY) !== "done";
      } catch {
        return true;
      }
    },
    () => false,
  );

  if (!visible) return null;
  return (
    <aside className={`flex items-start gap-3 rounded-lg px-3.5 py-3 ${className}`} style={{ background: "var(--app-surface-soft)", border: "1px solid var(--app-border)" }}>
      <span aria-hidden="true" className="mt-0.5 text-[16px]" style={{ color: "var(--app-arcad)" }}>✦</span>
      <p className="min-w-0 flex-1 text-[12.5px] leading-snug" style={{ color: "var(--app-text-soft)" }}>
        Study days build your streak. Focus minutes light stars. Stars complete constellation cards you collect.
      </p>
      <button
        type="button"
        onClick={() => {
          try { window.localStorage.setItem(KEY, "done"); } catch { /* ignore */ }
          window.dispatchEvent(new Event("arcadia:reward-story"));
        }}
        className="shrink-0 text-[12px] font-medium underline underline-offset-2"
        style={{ color: "var(--app-text)" }}
      >
        Got it
      </button>
    </aside>
  );
}
