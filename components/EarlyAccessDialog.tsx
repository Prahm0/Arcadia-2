"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useRef, type KeyboardEvent } from "react";
import { EASE_OUT } from "@/lib/animation";
import WaitlistForm from "./WaitlistForm";
import { usePrefersReducedMotion } from "@/lib/hooks";
import ArcadiaMark from "@/components/ui/ArcadiaMark";

export type DialogIntent = "access" | "login";

interface EarlyAccessDialogProps {
  open: boolean;
  intent: DialogIntent;
  onClose: () => void;
}

const copy: Record<DialogIntent, { title: string; body: string }> = {
  access: {
    title: "Get early access",
    body: "Arcadia is opening to a small group of students first. Leave your email and we’ll send an invite when your place is ready.",
  },
  login: {
    title: "Accounts are invite-only for now",
    body: "Arcadia is in private early access. Leave your email and we’ll let you know the moment you can log in.",
  },
};

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), textarea, select, [tabindex]:not([tabindex="-1"])';

export default function EarlyAccessDialog({ open, intent, onClose }: EarlyAccessDialogProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const reduced = usePrefersReducedMotion();

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onEscape = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onEscape);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onEscape);
    };
  }, [open, onClose]);

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key !== "Tab" || !panelRef.current) return;
    const nodes = Array.from(panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE));
    if (nodes.length === 0) return;
    const first = nodes[0];
    const last = nodes[nodes.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  const text = copy[intent];

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="early-access-dialog"
          className="fixed inset-0 z-[100] flex items-end justify-center p-4 sm:items-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
          onKeyDown={onKeyDown}
        >
          <button
            type="button"
            aria-label="Close dialog"
            tabIndex={-1}
            onClick={onClose}
            className="absolute inset-0 cursor-default bg-black/70 backdrop-blur-[2px]"
          />
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="early-access-title"
            aria-describedby="early-access-desc"
            initial={reduced ? { opacity: 0 } : { opacity: 0, y: 16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduced ? { opacity: 0 } : { opacity: 0, y: 8, scale: 0.98 }}
            transition={{ duration: 0.45, ease: EASE_OUT }}
            className="relative w-full max-w-[520px] rounded-[14px] border border-white/12 bg-ink-900 p-6 shadow-[0_40px_120px_rgba(0,0,0,0.6)] sm:p-8"
          >
            <div className="flex items-start justify-between gap-6">
              <div>
                <p className="type-eyebrow flex items-center gap-2 text-white/50">
                  <ArcadiaMark size={10} className="text-accent-200" />
                  Arcadia
                </p>
                <h2 id="early-access-title" className="mt-4 text-[26px] font-medium leading-[1.1] tracking-[-0.02em] text-white sm:text-[30px]">
                  {text.title}
                </h2>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="-mr-2 -mt-2 flex size-10 items-center justify-center rounded-[8px] text-white/60 transition-colors hover:bg-white/[0.06] hover:text-white"
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                  <path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              </button>
            </div>
            <p id="early-access-desc" className="type-body mt-3 max-w-[420px] text-white/60">
              {text.body}
            </p>
            <div className="mt-6">
              <WaitlistForm tone="dark" autoFocus buttonLabel="Request invite" />
            </div>
            <p className="mt-2 text-[12px] text-white/50">
              No spam. One email when your invite is ready.
            </p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
