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

// Sessions has its own tab in the bar; Arcad moved here to make room.
const ITEMS: MoreItem[] = [
  { label: "Arcad",       href: "/app/arcad",       icon: icon(<path d="M3.5 5h13v8.5H7L3.5 16.5V5z" />) },
  { label: "Profile",     href: "/app/profile",     icon: icon(<><circle cx="10" cy="8" r="3" /><path d="M4.5 16.5c1-2.6 3.1-4 5.5-4s4.5 1.4 5.5 4" /></>) },
  { label: "Deadlines",   href: "/app/deadlines",   icon: icon(<><circle cx="10" cy="10" r="7" /><path d="M10 6v4l3 2" /></>) },
  { label: "Analytics",   href: "/app/analytics",   icon: icon(<><path d="M4 15v-4M9 15V7M14 15v-6" /><path d="M2 17h16" /></>) },
  { label: "Streaks",     href: "/app/streaks",     icon: icon(<path d="M10 17c3 0 5-2 5-5 0-3.2-2.6-5-3.7-8.5C9.3 5 8.6 7 8.8 9 7.6 8.5 7 7.4 6.9 6.5 5.6 7.8 5 9.6 5 12c0 3 2 5 5 5z" />) },
  { label: "Review",      href: "/app/review",      icon: icon(<><path d="M4 5h12M4 10h8M4 15h12" /><circle cx="15" cy="10" r="1" fill="currentColor" /></>) },
  { label: "Cards",       href: "/app/cards",       icon: icon(<><rect x="3" y="6" width="11" height="10" rx="1.5" /><path d="M6 6V4.5A1.5 1.5 0 0 1 7.5 3h8A1.5 1.5 0 0 1 17 4.5v7a1.5 1.5 0 0 1-1.5 1.5H14" /></>) },
  { label: "Sheets",      href: "/app/sheets",      icon: icon(<><rect x="4" y="2.5" width="12" height="15" rx="1.5" /><path d="M7 6.5h6M7 9.5h6M7 12.5h3.5" /></>) },
  { label: "Files",       href: "/app/files",       icon: icon(<><path d="M11 3H6a1.5 1.5 0 0 0-1.5 1.5v11A1.5 1.5 0 0 0 6 17h8a1.5 1.5 0 0 0 1.5-1.5V7.5L11 3z" /><path d="M11 3v4.5h4.5" /></>) },
  { label: "Settings",    href: "/app/settings",    icon: icon(<><circle cx="10" cy="10" r="2.5" /><path d="M10 3v2M10 15v2M3 10h2M15 10h2M4.9 4.9l1.4 1.4M13.7 13.7l1.4 1.4M4.9 15.1l1.4-1.4M13.7 6.3l1.4-1.4" /></>) },
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
        className="relative w-full rounded-t-xl p-5 pb-8"
        style={{
          background: "var(--app-elev)", boxShadow: "var(--elev-3)",
          borderBottom: "none",
          paddingBottom: "calc(env(safe-area-inset-bottom, 0) + 24px)",
        }}
      >
        <div className="mx-auto mb-4 h-1 w-10 rounded-full" style={{ background: "var(--app-border-strong)" }} />
        <p className="type-eyebrow" style={{ color: "var(--app-text-muted)" }}>Elsewhere</p>
        <ul className="mt-3 grid grid-cols-2 gap-2">
          {ITEMS.map((item) => {
            const active = pathname === item.href || (item.href !== "/app" && pathname.startsWith(item.href));
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  onClick={onClose}
                  className="flex items-center gap-3 rounded-md px-4 py-3.5 text-[14.5px] font-medium"
                  style={{
                    color: active ? "var(--app-text)" : "var(--app-text-soft)",
                    background: active ? "var(--app-surface-soft)" : "transparent",
                    border: "1px solid var(--app-border)",
                    minHeight: 52,
                  }}
                >
                  <span
                    aria-hidden="true"
                    style={{ color: active ? "var(--app-accent)" : "var(--app-text-muted)" }}
                  >
                    {item.icon}
                  </span>
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
