"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useDashboardData } from "@/lib/app/DashboardProvider";
import { useStreak } from "@/lib/app/useStreak";
import { buildContextualStarters, buildGreeting } from "@/lib/app/arcadStarters";
import ArcadOrb from "./ArcadOrb";

/**
 * Global Arcad presence: a small orb pinned bottom-right on every /app page
 * (except /app/arcad, where the surface is already Arcad). Click opens a
 * lightweight launchpad — greeting, contextual starters, one-shot composer —
 * that hands off to /app/arcad?prompt=… so ArcadView owns the actual send
 * and streaming state. Keeps the code path single without recreating chat
 * everywhere.
 *
 * A small badge dot appears when a study block ended recently and is still
 * marked planned (same signal MissedRecoveryCards uses inside Arcad) so the
 * orb telegraphs "you have something to look at" without stealing attention.
 */
export default function ArcadFloatingButton() {
  const pathname = usePathname();
  const router = useRouter();
  const { data } = useDashboardData();
  const streak = useStreak();
  const [open, setOpen] = useState(false);
  const [composed, setComposed] = useState("");

  const starters = useMemo(() => buildContextualStarters(data, streak), [data, streak]);
  const greeting = useMemo(() => buildGreeting(data, streak), [data, streak]);
  const hasUnhandled = useMemo(() => countUnhandled(data) > 0, [data]);

  // Escape closes the sheet.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  // Never render on /app/arcad — the whole page IS Arcad there.
  if (pathname?.startsWith("/app/arcad")) return null;

  function handoff(prompt: string) {
    const trimmed = prompt.trim();
    if (!trimmed) return;
    setOpen(false);
    setComposed("");
    router.push(`/app/arcad?prompt=${encodeURIComponent(trimmed)}`);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Ask Arcad"
        aria-expanded={open}
        className="group fixed bottom-6 right-6 z-40 flex items-center gap-2.5 rounded-full py-1.5 pl-1.5 pr-3 shadow-[0_16px_40px_-14px_rgba(0,0,0,0.35)] transition-transform hover:scale-[1.02]"
        style={{
          background: "var(--app-surface)",
          border: "1px solid var(--app-border-strong)",
          color: "var(--app-text)",
        }}
      >
        <span className="relative inline-flex">
          <ArcadOrb size={30} state={hasUnhandled ? "alert" : "idle"} />
          {hasUnhandled ? (
            <span
              aria-hidden="true"
              className="absolute -right-0.5 -top-0.5 grid size-3 place-items-center rounded-full"
              style={{ background: "var(--app-accent)", boxShadow: "0 0 0 2px var(--app-surface)" }}
            />
          ) : null}
        </span>
        <span className="type-mono-label" style={{ color: "var(--app-text-soft)" }}>
          Ask Arcad
        </span>
      </button>

      {open ? (
        <>
          <div
            aria-hidden="true"
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-30"
            style={{ background: "color-mix(in oklab, black 32%, transparent)" }}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="arcad-quick-title"
            className="fixed bottom-6 right-6 z-40 w-[min(400px,calc(100vw-2.5rem))] rounded-[18px] p-5 shadow-[0_40px_120px_-40px_rgba(0,0,0,0.45)]"
            style={{
              background: "var(--app-surface)",
              border: "1px solid var(--app-border)",
              color: "var(--app-text)",
            }}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3 min-w-0">
                <ArcadOrb size={40} state={hasUnhandled ? "alert" : "idle"} />
                <div className="min-w-0">
                  <p className="type-eyebrow" style={{ color: "var(--app-accent-strong)" }}>
                    Arcad
                  </p>
                  <p
                    id="arcad-quick-title"
                    className="mt-0.5 text-[16px] font-medium leading-tight"
                    style={{ color: "var(--app-text)" }}
                  >
                    {greeting.primary}
                  </p>
                  <p className="mt-1 text-[13px] leading-snug" style={{ color: "var(--app-text-muted)" }}>
                    {greeting.secondary}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close"
                className="grid size-8 shrink-0 place-items-center rounded-lg transition-colors hover:bg-black/5"
                style={{ color: "var(--app-text-muted)" }}
              >
                <svg viewBox="0 0 20 20" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.6">
                  <path d="M5 5l10 10M15 5L5 15" strokeLinecap="round" />
                </svg>
              </button>
            </div>

            {starters.length > 0 ? (
              <div className="mt-4 flex flex-wrap gap-1.5">
                {starters.slice(0, 4).map((starter) => {
                  const isAccent = starter.tone === "accent";
                  return (
                    <button
                      key={starter.label}
                      type="button"
                      onClick={() => handoff(starter.message)}
                      className="rounded-full px-3 py-1.5 text-[12px] font-medium transition-colors"
                      style={
                        isAccent
                          ? {
                              background: "var(--app-accent)",
                              color: "white",
                              border: "1px solid var(--app-accent)",
                            }
                          : {
                              background: "transparent",
                              color: "var(--app-text-soft)",
                              border: "1px solid var(--app-border-strong)",
                            }
                      }
                    >
                      {starter.label}
                    </button>
                  );
                })}
              </div>
            ) : null}

            <form
              onSubmit={(e) => {
                e.preventDefault();
                handoff(composed);
              }}
              className="mt-4 flex items-end gap-2 rounded-[12px] p-1.5"
              style={{ background: "var(--app-surface-soft)", border: "1px solid var(--app-border)" }}
            >
              <textarea
                value={composed}
                onChange={(e) => setComposed(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handoff(composed);
                  }
                }}
                rows={1}
                autoFocus
                placeholder="Type a quick question…"
                className="min-h-[36px] max-h-[140px] flex-1 resize-none bg-transparent px-2.5 py-1.5 text-[13.5px] outline-none"
                style={{ color: "var(--app-text)" }}
              />
              <button
                type="submit"
                disabled={!composed.trim()}
                className="rounded-lg px-3 py-1.5 text-[12.5px] font-medium transition-colors disabled:opacity-50"
                style={{ background: "var(--app-accent)", color: "white" }}
              >
                Send
              </button>
            </form>

            <p className="mt-3 text-[11.5px]" style={{ color: "var(--app-text-faint)" }}>
              Sending opens the full chat with your reply on the way.
            </p>
          </div>
        </>
      ) : null}
    </>
  );
}

function countUnhandled(data: ReturnType<typeof useDashboardData>["data"]): number {
  const nowMs = Date.now();
  return data.events.filter((event) => {
    if (event.category !== "study") return false;
    if (event.outcome !== "planned") return false;
    const endMs = Date.parse(event.endAt);
    return endMs + 2 * 60 * 1000 <= nowMs && nowMs - endMs <= 24 * 60 * 60 * 1000;
  }).length;
}
