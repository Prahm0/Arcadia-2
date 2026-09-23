"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { Notice } from "@/lib/api/types";
import { NoticeIcon, useNotices } from "./Notices";

interface NotificationCentreProps {
  notices: Notice[];
}

export default function NotificationCentre({ notices }: NotificationCentreProps) {
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  // Unread while anything up top is still waiting on them.
  const { visible } = useNotices(notices);
  const [seen, setSeen] = useState(false);
  const unread = visible.length > 0 && !seen;
  const setUnread = (value: boolean) => setSeen(!value);
  const bellRef = useRef<HTMLButtonElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function openCentre() {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    setMounted(true);
    setUnread(false);
    requestAnimationFrame(() => setOpen(true));
  }

  function closeCentre() {
    setOpen(false);
    closeTimer.current = setTimeout(() => {
      setMounted(false);
      bellRef.current?.focus();
    }, 280);
  }

  useEffect(() => {
    if (!mounted) return;

    const previousOverflow = document.body.style.overflow;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeCentre();
    };

    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [mounted]);

  useEffect(
    () => () => {
      if (closeTimer.current) clearTimeout(closeTimer.current);
    },
    [],
  );

  return (
    <>
      <button
        ref={bellRef}
        type="button"
        aria-label={unread ? "Open notifications, new notification" : "Open notifications"}
        aria-expanded={open}
        aria-controls="notification-centre"
        onClick={mounted ? closeCentre : openCentre}
        className="ui-hover fixed right-2 top-[calc(env(safe-area-inset-top,0px)+0.25rem)] z-40 grid h-10 w-10 place-items-center rounded-md border-0 bg-transparent p-0 transition-colors lg:right-2 lg:top-1 lg:h-8 lg:w-8"
        style={{ color: "var(--app-text-soft)" }}
      >
        <span className="relative grid place-items-center">
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            width="20"
            height="20"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.55"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M18 8a6 6 0 00-12 0c0 7-3 7-3 8.5h18C21 15 18 15 18 8z" />
            <path d="M9.75 20h4.5" />
          </svg>
          {unread ? (
            <span
              aria-hidden="true"
              className="absolute right-0 top-0 h-2 w-2 rounded-full"
              style={{
                background: "var(--app-accent)",
                boxShadow: "0 0 0 2px var(--app-bg)",
              }}
            />
          ) : null}
        </span>
      </button>

      {mounted ? (
        <div className="fixed inset-0 z-[70]">
          <button
            type="button"
            aria-label="Close notifications"
            onClick={closeCentre}
            className="absolute inset-0 border-0"
            style={{
              background: open ? "rgba(15, 14, 12, 0.16)" : "rgba(15, 14, 12, 0)",
              backdropFilter: open ? "blur(2px)" : "blur(0)",
              transition: "background 240ms ease, backdrop-filter 240ms ease",
            }}
          />

          <section
            id="notification-centre"
            role="dialog"
            aria-modal="true"
            aria-labelledby="notification-centre-title"
            className="absolute bottom-2 right-2 top-2 flex w-[min(390px,calc(100vw-16px))] flex-col overflow-hidden rounded-xl"
            style={{
              background: "var(--app-elev)",
              color: "var(--app-text)",
              boxShadow: "var(--elev-3)",
              transform: open ? "translateX(0)" : "translateX(calc(100% + 16px))",
              opacity: open ? 1 : 0.92,
              transition: "transform 280ms var(--ease-out-expo), opacity 220ms ease",
            }}
          >
            <header className="flex items-center justify-between px-6 pb-4 pt-6">
              <div>
                <p className="type-eyebrow" style={{ color: "var(--app-text-muted)" }}>
                  Inbox
                </p>
                <h2
                  id="notification-centre-title"
                  className="mt-2 text-[22px] font-semibold tracking-[-0.025em]"
                >
                  Notifications
                </h2>
              </div>
              <button
                type="button"
                autoFocus
                onClick={closeCentre}
                aria-label="Close notifications"
                className="ui-hover grid h-9 w-9 place-items-center rounded-full border-0 bg-transparent"
                style={{ color: "var(--app-text-muted)" }}
              >
                <svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
                  <path d="M5 5l10 10M15 5L5 15" />
                </svg>
              </button>
            </header>

            <div className="h-px" style={{ background: "var(--app-border)" }} />

            <div className="flex-1 overflow-y-auto px-6 py-5">
              {notices.length ? (
                <ul className="flex flex-col gap-1">
                  {notices.map((notice) => (
                    <li key={notice.id}>
                      <Link
                        href={notice.action.href}
                        onClick={closeCentre}
                        className="-mx-3 flex gap-3 rounded-lg px-3 py-3 ui-hover"
                      >
                        <NoticeIcon kind={notice.kind} />
                        <span className="min-w-0">
                          <span className="block text-[14px] font-semibold" style={{ color: "var(--app-text)" }}>
                            {notice.title}
                          </span>
                          <span className="mt-1 block text-[13px] leading-relaxed" style={{ color: "var(--app-text-muted)" }}>
                            {notice.body}
                          </span>
                          <span className="mt-2 block text-[13px] font-medium" style={{ color: "var(--app-accent-strong)" }}>
                            {notice.action.label}
                          </span>
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="grid h-full min-h-[280px] place-items-center text-center">
                  <div>
                    <span
                      aria-hidden="true"
                      className="mx-auto grid h-11 w-11 place-items-center rounded-full"
                      style={{ background: "var(--app-surface-soft)", color: "var(--app-text-muted)" }}
                    >
                      <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M18 8a6 6 0 00-12 0c0 7-3 7-3 8.5h18C21 15 18 15 18 8z" />
                        <path d="M9.75 20h4.5" />
                      </svg>
                    </span>
                    <p className="mt-4 text-[14px] font-semibold">You’re all caught up</p>
                    <p className="mt-1 text-[12.5px]" style={{ color: "var(--app-text-muted)" }}>
                      New updates will appear here.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}
