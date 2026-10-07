"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const VIEWS = [
  { label: "Solo", href: "/app/sessions" },
  { label: "Rooms", href: "/app/sessions/rooms" },
] as const;

/**
 * Solo or with a room: the two ways to run a session, one tab in the nav.
 * Sits in the page header's action slot on both pages.
 */
export default function SessionsSwitch() {
  const pathname = usePathname() ?? "";
  const rooms = pathname.startsWith("/app/sessions/rooms");
  return (
    <nav
      aria-label="Session type"
      className="flex rounded-full p-[3px]"
      style={{ background: "var(--app-surface-soft)", boxShadow: "inset 0 0 0 1px var(--app-border)" }}
    >
      {VIEWS.map((view) => {
        const active = view.label === "Rooms" ? rooms : !rooms;
        return (
          <Link
            key={view.href}
            href={view.href}
            aria-current={active ? "page" : undefined}
            className="inline-flex h-8 items-center rounded-full px-3.5 text-[13px] font-medium transition-colors"
            style={{
              background: active ? "var(--app-surface)" : "transparent",
              color: active ? "var(--app-text)" : "var(--app-text-muted)",
              boxShadow: active ? "var(--elev-1), inset 0 0 0 1px var(--app-border-strong)" : undefined,
            }}
          >
            {view.label}
          </Link>
        );
      })}
    </nav>
  );
}
