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
 * Fixed bottom navigation for mobile. Five slots, Today, Schedule, Add, Arcad,
 * More, sized to the platform tap target (56 px column, min 44 px control).
 * Respects the iOS home-indicator safe area via env(safe-area-inset-bottom).
 */
export default function MobileBottomNav() {
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
      icon: icon(<path d="M4 6h16v10H8l-4 4V6z" />),
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
      // Handoff to Today, TodayView reads ?new=1 and opens New Task on mount.
      router.push("/app?new=1");
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
        className="app-mobile-nav lg:hidden fixed inset-x-0 bottom-0 z-40"
        style={{
          // Solid, with a hairline on top. The frosted version smeared whatever
          // scrolled beneath it.
          background: "var(--app-elev)",
          boxShadow: "0 -1px 0 var(--app-border)",
        }}
      >
        <ul className="mx-auto flex max-w-[560px] items-stretch justify-between">
          {slots.map((slot) => {
            const active = slot.matcher ? slot.matcher(pathname) : false;
            const isAdd = slot.key === "add";
            return (
              <li key={slot.key} className="flex-1">
                {slot.href && slot.key !== "more" ? (
                  <Link
                    href={slot.href}
                    className={cn(
                      "flex flex-col items-center gap-0.5 py-2 text-[10.5px] font-medium",
                    )}
                    style={{
                      minHeight: 56,
                      color: active ? "var(--app-accent-strong)" : "var(--app-text-muted)",
                    }}
                  >
                    <span aria-hidden="true">{slot.icon}</span>
                    <span>{slot.label}</span>
                  </Link>
                ) : (
                  <button
                    type="button"
                    onClick={() => trigger(slot)}
                    className={cn(
                      "flex w-full flex-col items-center gap-0.5 py-2 text-[10.5px] font-medium",
                    )}
                    style={{
                      minHeight: 56,
                      color: isAdd
                        ? "var(--app-accent-strong)"
                        : active
                          ? "var(--app-accent-strong)"
                          : "var(--app-text-muted)",
                    }}
                    aria-label={isAdd ? "Add task" : slot.label}
                  >
                    <span
                      aria-hidden="true"
                      style={isAdd ? { transform: "scale(1.1)" } : undefined}
                    >
                      {slot.icon}
                    </span>
                    <span>{slot.label}</span>
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
