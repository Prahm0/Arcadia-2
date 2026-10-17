"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import MobileMoreSheet from "./MobileMoreSheet";

interface Slot {
  key: string;
  label: string;
  href?: string;
  icon: ReactNode;
  matcher?: (pathname: string) => boolean;
}

function icon(path: ReactNode) {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      {path}
    </svg>
  );
}

/**
 * The phone's tab bar: a floating pill with five slots, Today, Schedule,
 * Add (the round button in the middle), Arcad and More. Arcad has its own
 * tab because telling it what changed is the main way to fix the plan;
 * Sessions start from Today's next block and live in More. Respects the iOS
 * home-indicator safe area via env(safe-area-inset-bottom).
 */
export default function MobileBottomNav({ onAdd }: { onAdd: () => void }) {
  const pathname = usePathname() ?? "/app";
  const router = useRouter();
  const [moreOpen, setMoreOpen] = useState(false);

  const slots: Slot[] = [
    {
      key: "today",
      label: "Today",
      href: "/app",
      icon: icon(<><path d="M5 7h14M5 12h14M5 17h9" /></>),
      matcher: (p) => p === "/app",
    },
    {
      key: "schedule",
      label: "Schedule",
      href: "/app/schedule",
      icon: icon(
        <>
          <rect x="4" y="5" width="16" height="15" rx="2" />
          <path d="M4 10h16M9 3v4M15 3v4" />
        </>,
      ),
      matcher: (p) => p.startsWith("/app/schedule"),
    },
    {
      key: "add",
      label: "Add",
      icon: icon(<><circle cx="12" cy="12" r="9" /><path d="M12 8v8M8 12h8" /></>),
    },
    {
      key: "arcad",
      label: "Arcad",
      href: "/app/arcad",
      icon: icon(<path d="M5 6h14v10.5H10L5 20.5z" />),
      matcher: (p) => p.startsWith("/app/arcad"),
    },
    {
      key: "more",
      label: "More",
      icon: icon(<><circle cx="6" cy="12" r="1.5" fill="currentColor" /><circle cx="12" cy="12" r="1.5" fill="currentColor" /><circle cx="18" cy="12" r="1.5" fill="currentColor" /></>),
    },
  ];

  function trigger(slot: Slot) {
    if (slot.key === "add") {
      // Opens over the current page. Pushing /app?new=1 did nothing on Today
      // itself, since Today only reads the param when it mounts.
      onAdd();
      return;
    }
    if (slot.key === "more") {
      setMoreOpen(true);
      return;
    }
    if (slot.href) router.push(slot.href);
  }

  return (
    <>
      <nav
        aria-label="Mobile navigation"
        className="app-mobile-nav lg:hidden fixed inset-x-0 bottom-0 z-40 px-3.5"
      >
        <ul
          className="mx-auto flex h-16 max-w-[520px] items-center justify-between rounded-full px-2"
          style={{ background: "var(--app-surface)", boxShadow: "0 8px 28px rgba(var(--shadow-rgb), 0.16), 0 0 0 1px var(--app-border)" }}
        >
          {slots.map((slot) => {
            const active = slot.matcher ? slot.matcher(pathname) : false;
            const isAdd = slot.key === "add";
            const tone = active ? "var(--app-accent)" : "var(--app-text-muted)";
            if (isAdd) {
              return (
                <li key={slot.key} className="flex flex-1 justify-center">
                  <button
                    type="button"
                    onClick={() => trigger(slot)}
                    aria-label="Add to today"
                    className="ui-press grid size-[50px] place-items-center rounded-full"
                    style={{ background: "var(--app-accent)", color: "var(--app-accent-on)" }}
                  >
                    <svg aria-hidden="true" viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
                  </button>
                </li>
              );
            }
            const inner = (
              <>
                <span aria-hidden="true">{slot.icon}</span>
                <span>{slot.label}</span>
              </>
            );
            const className = cn("flex w-full flex-col items-center gap-0.5 text-[10.5px]", active ? "font-semibold" : "font-medium");
            return (
              <li key={slot.key} className="flex-1">
                {slot.href ? (
                  <Link href={slot.href} className={className} style={{ minHeight: 48, justifyContent: "center", color: tone }} aria-current={active ? "page" : undefined}>
                    {inner}
                  </Link>
                ) : (
                  <button type="button" onClick={() => trigger(slot)} className={className} style={{ minHeight: 48, justifyContent: "center", color: tone }} aria-label={slot.label}>
                    {inner}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      </nav>
      <MobileMoreSheet open={moreOpen} onClose={() => setMoreOpen(false)} />
    </>
  );
}
