"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, type ReactNode } from "react";

interface MoreItem {
  label: string;
  href: string;
  icon: ReactNode;
}

function icon(path: ReactNode) {
  return (
    <svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      {path}
    </svg>
  );
}

// Today, Schedule and Arcad have tabs. Everything else is one calm list.
const ITEMS: MoreItem[] = [
  { label: "Priorities", href: "/app/priorities", icon: icon(<><path d="M4 5h2M4 10h2M4 15h2M9 5h7M11 10h5M11 15h5" /></>) },
  { label: "Progress", href: "/app/progress", icon: icon(<><path d="M4 15v-4M9 15V7M14 15v-6" /><path d="M2 17h16" /></>) },
  { label: "Leaderboard", href: "/app/leaderboard", icon: icon(<><path d="M10 3l1.7 3.45 3.8.55-2.75 2.68.65 3.78L10 11.68 6.6 13.46l.65-3.78L4.5 7l3.8-.55L10 3z" /></>) },
  { label: "Study tools", href: "/app/study", icon: icon(<><path d="M4 4.5A1.5 1.5 0 0 1 5.5 3H15v12H5.5A1.5 1.5 0 0 0 4 16.5v-12z" /><path d="M4 16.5A1.5 1.5 0 0 0 5.5 18H15v-3" /></>) },
  { label: "Profile", href: "/app/profile", icon: icon(<><circle cx="10" cy="8" r="3" /><path d="M4.5 16.5c1-2.6 3.1-4 5.5-4s4.5 1.4 5.5 4" /></>) },
  { label: "Settings", href: "/app/settings", icon: icon(<><circle cx="10" cy="10" r="2.5" /><path d="M10 3v2M10 15v2M3 10h2M15 10h2M4.9 4.9l1.4 1.4M13.7 13.7l1.4 1.4M4.9 15.1l1.4-1.4M13.7 6.3l1.4-1.4" /></>) },
  { label: "Help", href: "/support", icon: icon(<><circle cx="10" cy="10" r="7" /><path d="M8 8a2 2 0 1 1 2.8 1.8c-.5.3-.8.7-.8 1.2v.5M10 14h.01" /></>) },
];

interface MobileMoreSheetProps {
  open: boolean;
  onClose: () => void;
}

export default function MobileMoreSheet({ open, onClose }: MobileMoreSheetProps) {
  const pathname = usePathname() ?? "";

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="lg:hidden fixed inset-0 z-50 flex items-end">
      <div
        aria-hidden="true"
        onClick={onClose}
        className="absolute inset-0"
        style={{ background: "color-mix(in oklab, black 40%, transparent)" }}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="More"
        className="relative w-full rounded-t-2xl px-4 pt-3"
        style={{
          background: "var(--app-bg)", boxShadow: "var(--elev-3)",
          borderBottom: "none",
          paddingBottom: "calc(env(safe-area-inset-bottom, 0) + 24px)",
        }}
      >
        <div className="mx-auto mb-3 h-1 w-10 rounded-full" style={{ background: "var(--app-border-strong)" }} />
        <ul className="overflow-hidden rounded-2xl" style={{ background: "var(--app-surface)", boxShadow: "inset 0 0 0 1px var(--app-border)" }}>
          {ITEMS.map((item, index) => {
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  onClick={onClose}
                  aria-current={active ? "page" : undefined}
                  className="flex min-h-[52px] items-center gap-3.5 pl-4 text-[16px]"
                  style={{ color: "var(--app-text)" }}
                >
                  <span aria-hidden="true" style={{ color: active ? "var(--app-accent)" : "var(--app-text-muted)" }}>{item.icon}</span>
                  <span className="flex min-h-[52px] flex-1 items-center justify-between pr-4" style={index ? { borderTop: "1px solid var(--app-border)" } : undefined}>
                    {item.label}
                    <span aria-hidden="true" style={{ color: "var(--app-text-faint)" }}>›</span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
