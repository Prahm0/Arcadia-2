"use client";

import { useEffect, useRef, useState } from "react";
import { CHEERS, CHEER_KINDS, type CheerKind } from "@/shared/roomFeed";
import { cn } from "@/lib/cn";

/**
 * "Keep going" for someone mid-session. One tap opens four reactions; after
 * sending, the button rests until the cooldown ends so a cheer stays special.
 */
export default function CheerButton({
  name,
  cooldownUntil,
  onSend,
  size = "md",
}: {
  name: string;
  /** Epoch ms when this person can be cheered again, if you just did. */
  cooldownUntil: number | null;
  onSend: (kind: CheerKind) => Promise<void>;
  size?: "sm" | "md";
}) {
  const [open, setOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState<CheerKind | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const root = useRef<HTMLDivElement>(null);
  const resting = cooldownUntil !== null && cooldownUntil > now;

  // Wake up when the cooldown ends so the button comes back by itself.
  useEffect(() => {
    if (cooldownUntil === null) return;
    const wait = cooldownUntil - Date.now();
    if (wait <= 0) return;
    const id = window.setTimeout(() => setNow(Date.now()), wait + 50);
    return () => window.clearTimeout(id);
  }, [cooldownUntil]);

  useEffect(() => {
    if (!open) return;
    const away = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("pointerdown", away);
    window.addEventListener("keydown", escape);
    return () => {
      window.removeEventListener("pointerdown", away);
      window.removeEventListener("keydown", escape);
    };
  }, [open]);

  async function send(kind: CheerKind) {
    setSending(true);
    setError(null);
    try {
      await onSend(kind);
      setSent(kind);
      setOpen(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Couldn't send that.");
    } finally {
      setSending(false);
    }
  }

  const height = size === "sm" ? "h-7 px-2.5 text-[12px]" : "h-8 px-3 text-[12.5px]";

  return (
    <div ref={root} className="relative">
      {resting ? (
        <span
          key={sent ?? "rest"}
          className={cn("app-pop inline-flex items-center gap-1.5 rounded-md font-medium", height)}
          style={{ color: "var(--app-text-muted)", background: "var(--app-surface-soft)" }}
          title={`You can cheer ${name} again in ${Math.max(1, Math.ceil((cooldownUntil - now) / 60_000))} min`}
        >
          {sent ? <span aria-hidden="true">{CHEERS[sent].emoji}</span> : null}
          Cheered
        </span>
      ) : (
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          aria-haspopup="true"
          aria-label={`Cheer ${name} on`}
          className={cn(
            "ui-press inline-flex items-center gap-1.5 rounded-md font-medium",
            "shadow-[var(--elev-inset)] hover:bg-[color-mix(in_oklab,var(--app-text)_6%,transparent)]",
            height,
          )}
          style={{ color: "var(--app-text-soft)" }}
        >
          <span aria-hidden="true">👏</span>
          Cheer
        </button>
      )}
      {open ? (
        <div
          role="menu"
          aria-label={`Cheer ${name} on`}
          className="app-enter absolute bottom-full right-0 z-20 mb-2 flex w-max flex-col rounded-lg p-1"
          style={{ background: "var(--app-elev)", boxShadow: "var(--elev-2)" }}
        >
          {CHEER_KINDS.map((kind) => (
            <button
              key={kind}
              type="button"
              role="menuitem"
              disabled={sending}
              onClick={() => void send(kind)}
              className="ui-hover flex items-center gap-2.5 rounded-md py-1.5 pl-2 pr-4 text-left disabled:opacity-50"
              title={CHEERS[kind].label}
            >
              <span className="text-[16px] leading-none" aria-hidden="true">{CHEERS[kind].emoji}</span>
              <span className="whitespace-nowrap text-[13px]" style={{ color: "var(--app-text)" }}>{CHEERS[kind].label}</span>
            </button>
          ))}
        </div>
      ) : null}
      {error ? (
        <p role="alert" className="absolute right-0 top-full z-10 mt-1 w-max max-w-[220px] text-right text-[11.5px]" style={{ color: "var(--app-danger)" }}>
          {error}
        </p>
      ) : null}
    </div>
  );
}
