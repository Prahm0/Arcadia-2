"use client";

import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import type { Notice } from "@/lib/api/types";
import { useDashboardData } from "@/lib/app/DashboardProvider";

const SNOOZE_KEY = "arcadia:notices:snoozed";
const SNOOZE_MS = 3 * 86_400_000;
const CHANGED = "arcadia:notices-changed";

function readSnoozed(): Record<string, number> {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(SNOOZE_KEY) ?? "{}");
    if (!parsed || typeof parsed !== "object") return {};
    const now = Date.now();
    return Object.fromEntries(Object.entries(parsed as Record<string, number>).filter(([, until]) => until > now));
  } catch {
    return {};
  }
}

/**
 * The notices still worth showing up top. "Not now" hides one for three
 * days, or until what it says changes (its id carries the numbers).
 */
export function useNotices(notices: Notice[]) {
  const [snoozed, setSnoozed] = useState<Record<string, number> | null>(null);

  useEffect(() => {
    const sync = () => setSnoozed(readSnoozed());
    sync();
    window.addEventListener(CHANGED, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(CHANGED, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const snooze = useCallback((id: string) => {
    const next = readSnoozed();
    next[id] = Date.now() + SNOOZE_MS;
    try {
      window.localStorage.setItem(SNOOZE_KEY, JSON.stringify(next));
    } catch {
      /* storage blocked; it just comes back on reload */
    }
    setSnoozed(next);
    window.dispatchEvent(new Event(CHANGED));
  }, []);

  // Nothing shows until storage has been read, so a snoozed notice never flashes.
  const visible = snoozed ? notices.filter((notice) => !(notice.id in snoozed)) : [];
  return { visible, snooze };
}

const ICONS: Record<Notice["kind"], ReactNode> = {
  budget: (
    <>
      <path d="M10 3.5v13M5.5 16.5h9" />
      <path d="M3 8l2.5-4.5L8 8a2.5 2.5 0 01-5 0zM12 8l2.5-4.5L17 8a2.5 2.5 0 01-5 0z" />
      <path d="M5.5 3.5h9" />
    </>
  ),
  syllabus: (
    <>
      <path d="M4 4.5A1.5 1.5 0 015.5 3H15v12H5.5A1.5 1.5 0 004 16.5v-12z" />
      <path d="M4 16.5A1.5 1.5 0 005.5 18H15M7.5 7h4.5M7.5 10h3" />
    </>
  ),
};

const TONE: Record<Notice["kind"], { bg: string; fg: string }> = {
  budget: { bg: "var(--app-warning-soft)", fg: "var(--app-warning)" },
  syllabus: { bg: "var(--app-accent-soft)", fg: "var(--app-accent-strong)" },
};

export function NoticeIcon({ kind }: { kind: Notice["kind"] }) {
  return (
    <span
      aria-hidden="true"
      className="grid h-8 w-8 shrink-0 place-items-center rounded-[9px]"
      style={{ background: TONE[kind].bg, color: TONE[kind].fg }}
    >
      <svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        {ICONS[kind]}
      </svg>
    </span>
  );
}

/**
 * Notices at the top of the page: only things that need a decision, each
 * with one action, and gone once they're dealt with or put off.
 */
export default function NoticeStack({ notices }: { notices: Notice[] }) {
  const { visible, snooze } = useNotices(notices);

  return (
    <div aria-live="polite">
      <AnimatePresence initial={false}>
        {visible.map((notice, index) => (
          <motion.div
            key={notice.id}
            layout
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0, transition: { duration: 0.32, delay: index * 0.05, ease: [0.22, 1, 0.36, 1] } }}
            exit={{ opacity: 0, height: 0, marginTop: 0, transition: { duration: 0.24, ease: [0.22, 1, 0.36, 1] } }}
            className={index === 0 ? "mt-5" : "mt-2"}
          >
            <section
              aria-label={notice.title}
              className="flex flex-wrap items-center gap-x-3.5 gap-y-3 rounded-xl px-4 py-3 sm:flex-nowrap"
              style={{ background: "var(--app-surface)", boxShadow: "var(--elev-1)" }}
            >
              <NoticeIcon kind={notice.kind} />
              <div className="min-w-0 flex-1 basis-[200px]">
                <p className="text-[13.5px] font-semibold leading-snug" style={{ color: "var(--app-text)" }}>
                  {notice.title}
                </p>
                <p className="mt-0.5 text-[12.5px] leading-snug" style={{ color: "var(--app-text-muted)" }}>
                  {notice.body}
                </p>
              </div>
              <div className="ml-auto flex shrink-0 items-center gap-1">
                <button
                  type="button"
                  onClick={() => snooze(notice.id)}
                  className="h-8 rounded-md px-3 text-[12.5px] ui-hover"
                  style={{ color: "var(--app-text-muted)" }}
                >
                  Not now
                </button>
                <Link
                  href={notice.action.href}
                  className="inline-flex h-8 items-center rounded-md px-3 text-[12.5px] font-medium transition-colors ui-hover"
                  style={{ color: "var(--app-text)", boxShadow: "inset 0 0 0 1px var(--app-border-strong)" }}
                >
                  {notice.action.label}
                </Link>
              </div>
            </section>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

/** The signed-in student's notices, under the page title. */
export function HeaderNotices() {
  const { data } = useDashboardData();
  const notices = data.user.onboardingComplete ? (data.notices ?? []) : [];
  return notices.length ? <NoticeStack notices={notices} /> : null;
}
