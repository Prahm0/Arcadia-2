"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { api, saveCsrf } from "@/lib/api/client";
import type { AuthUser } from "@/lib/api/types";
import { cn } from "@/lib/cn";
import { useTheme } from "@/lib/app/theme";
import { useStreak } from "@/lib/app/useStreak";
import ArcadFloatingButton from "./ArcadFloatingButton";
import PageMount from "./PageMount";

interface AppShellProps {
  user: AuthUser | null;
  briefing?: string | null;
  children: ReactNode;
}

interface NavItem {
  label: string;
  href: string;
  icon: ReactNode;
}

function icon(path: ReactNode) {
  return (
    <svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      {path}
    </svg>
  );
}

const NAV: NavItem[] = [
  { label: "Today", href: "/app", icon: icon(<path d="M4 6h12M4 10h12M4 14h8" />) },
  { label: "Schedule", href: "/app/schedule", icon: icon(<><rect x="3" y="4" width="14" height="13" rx="2" /><path d="M3 8h14M7 2v4M13 2v4" /></>) },
  { label: "Deadlines", href: "/app/deadlines", icon: icon(<><circle cx="10" cy="10" r="7" /><path d="M10 6v4l3 2" /></>) },
  { label: "Commitments", href: "/app/commitments", icon: icon(<><path d="M3 9h14M10 3v14M3 6a3 3 0 013-3h8a3 3 0 013 3v8a3 3 0 01-3 3H6a3 3 0 01-3-3V6z" /></>) },
  { label: "Focus", href: "/app/focus", icon: icon(<><circle cx="10" cy="10" r="7" /><circle cx="10" cy="10" r="3" /></>) },
  { label: "Analytics", href: "/app/analytics", icon: icon(<><path d="M4 15v-4M9 15V7M14 15v-6" strokeLinecap="round" /><path d="M2 17h16" strokeLinecap="round" /></>) },
  { label: "Review", href: "/app/review", icon: icon(<><path d="M4 5h12M4 10h8M4 15h12" strokeLinecap="round" /><circle cx="15" cy="10" r="1" fill="currentColor" /></>) },
  { label: "Rooms", href: "/app/rooms", icon: icon(<><circle cx="6" cy="8" r="2" /><circle cx="14" cy="8" r="2" /><path d="M3 16c0-2 1.5-4 3-4M17 16c0-2-1.5-4-3-4M10 17v-1" strokeLinecap="round" /></>) },
  { label: "Arcad", href: "/app/arcad", icon: icon(<path d="M4 5h12v9H8l-4 3V5z" />) },
  { label: "Settings", href: "/app/settings", icon: icon(<><circle cx="10" cy="10" r="2.5" /><path d="M10 3v2M10 15v2M3 10h2M15 10h2M4.9 4.9l1.4 1.4M13.7 13.7l1.4 1.4M4.9 15.1l1.4-1.4M13.7 6.3l1.4-1.4" /></>) },
];

export default function AppShell({ user, briefing, children }: AppShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { resolved, toggle } = useTheme();
  const streakSummary = useStreak();
  const streak = streakSummary.current;
  const [mobileOpen, setMobileOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  async function signOut() {
    setSigningOut(true);
    try {
      await api("/api/auth/logout", { method: "POST" });
    } catch {
      /* still clear locally */
    } finally {
      saveCsrf(null);
      router.push("/login");
    }
  }

  return (
    <div
      className="min-h-svh"
      style={{ background: "var(--app-bg)", color: "var(--app-text)" }}
    >
      {/* Mobile top bar */}
      <div className="lg:hidden sticky top-0 z-30 flex items-center justify-between border-b px-4 py-3 backdrop-blur-md"
        style={{ borderColor: "var(--app-border)", background: "color-mix(in oklab, var(--app-bg) 88%, transparent)" }}
      >
        <BrandMark />
        <button
          type="button"
          onClick={() => setMobileOpen((v) => !v)}
          className="grid h-9 w-9 place-items-center rounded-lg border transition-colors"
          style={{ borderColor: "var(--app-border)" }}
          aria-label="Toggle navigation"
        >
          <svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.5">
            {mobileOpen ? <path d="M5 5l10 10M15 5L5 15" strokeLinecap="round" /> : <><path d="M3 6h14" /><path d="M3 10h14" /><path d="M3 14h14" /></>}
          </svg>
        </button>
      </div>

      <div className="mx-auto flex max-w-[1440px]">
        {/* Sidebar */}
        <aside
          className={cn(
            "lg:sticky lg:top-0 lg:flex lg:h-svh lg:w-[240px] lg:shrink-0 lg:flex-col",
            mobileOpen ? "fixed inset-0 z-40 flex flex-col" : "hidden",
          )}
          style={{
            background: "var(--app-surface-soft)",
            borderRight: "1px solid var(--app-border)",
          }}
        >
          <div className="hidden lg:block px-5 pt-6">
            <BrandMark />
          </div>
          <div className="lg:hidden flex items-center justify-between border-b px-4 py-3" style={{ borderColor: "var(--app-border)" }}>
            <BrandMark />
            <button onClick={() => setMobileOpen(false)} aria-label="Close" className="grid h-9 w-9 place-items-center rounded-lg border" style={{ borderColor: "var(--app-border)" }}>
              <svg viewBox="0 0 20 20" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M5 5l10 10M15 5L5 15" strokeLinecap="round" /></svg>
            </button>
          </div>

          <nav className="mt-6 flex flex-col gap-0.5 px-3">
            {NAV.map((item) => {
              const active =
                item.href === "/app"
                  ? pathname === "/app"
                  : pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileOpen(false)}
                  className={cn(
                    "flex items-center gap-3 rounded-[10px] px-3 py-2 text-[14px] font-medium transition-colors",
                  )}
                  style={{
                    color: active ? "var(--app-text)" : "var(--app-text-soft)",
                    background: active ? "var(--app-surface)" : "transparent",
                    boxShadow: active ? "inset 0 0 0 1px var(--app-border)" : "none",
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
              );
            })}
          </nav>

          <div className="mt-auto flex flex-col gap-2 px-3 pb-5">
            {streak > 0 ? (
              <div
                className="mx-2 rounded-[10px] border p-3"
                style={{
                  borderColor: "var(--app-border)",
                  background: "var(--app-accent-soft)",
                }}
              >
                <div className="flex items-center justify-between">
                  <p className="type-eyebrow" style={{ color: "var(--app-text-muted)" }}>
                    Streak
                  </p>
                  {streakSummary.hitMilestone ? (
                    <span
                      className="rounded-full px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-[0.06em]"
                      style={{
                        background: "var(--app-accent)",
                        color: "white",
                      }}
                    >
                      {streakSummary.hitMilestone}-day
                    </span>
                  ) : null}
                </div>
                <p className="mt-1 text-[22px] font-medium leading-none tabular-nums" style={{ color: "var(--app-text)" }}>
                  {streak} <span className="text-[13px] font-normal" style={{ color: "var(--app-text-muted)" }}>consistent {streak === 1 ? "day" : "days"}</span>
                </p>
                {streakSummary.nextMilestone && streakSummary.daysToNext ? (
                  <p className="mt-1.5 text-[11.5px]" style={{ color: "var(--app-text-muted)" }}>
                    {streakSummary.daysToNext} more to {streakSummary.nextMilestone}
                  </p>
                ) : null}
              </div>
            ) : streakSummary.lastPlannedDay?.missReason ? (
              <div
                className="mx-2 rounded-[10px] border p-3"
                style={{
                  borderColor: "var(--app-border)",
                  background: "var(--app-surface-soft)",
                }}
              >
                <p className="type-eyebrow" style={{ color: "var(--app-text-muted)" }}>
                  Streak reset
                </p>
                <p className="mt-1.5 text-[12.5px] leading-snug" style={{ color: "var(--app-text-soft)" }}>
                  {streakSummary.lastPlannedDay.missReason} — 70% locks the day in.
                </p>
              </div>
            ) : null}
            <button
              onClick={toggle}
              className="mx-2 flex items-center justify-between rounded-[10px] border px-3 py-2 text-[13px] transition-colors"
              style={{ borderColor: "var(--app-border)", color: "var(--app-text-soft)" }}
              aria-label="Toggle theme"
            >
              <span className="flex items-center gap-2">
                {resolved === "dark" ? (
                  <svg viewBox="0 0 20 20" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M15 11a5 5 0 01-6-6 6 6 0 106 6z" /></svg>
                ) : (
                  <svg viewBox="0 0 20 20" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.6"><circle cx="10" cy="10" r="3.5" /><path d="M10 2v2M10 16v2M2 10h2M16 10h2M4.5 4.5l1.5 1.5M14 14l1.5 1.5M4.5 15.5L6 14M14 6l1.5-1.5" strokeLinecap="round" /></svg>
                )}
                {resolved === "dark" ? "Dark" : "Light"}
              </span>
              <span style={{ color: "var(--app-text-muted)" }}>Switch</span>
            </button>
            {user ? (
              <div
                className="mx-2 flex items-center gap-3 rounded-[10px] px-3 py-2"
                style={{ borderTop: "1px solid var(--app-border)" }}
              >
                <div
                  aria-hidden="true"
                  className="grid h-8 w-8 place-items-center rounded-full text-[12.5px] font-medium"
                  style={{ background: "var(--app-accent-soft)", color: "var(--app-accent-strong)" }}
                >
                  {user.name.slice(0, 1).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13.5px] font-medium" style={{ color: "var(--app-text)" }}>{user.name}</p>
                  <p className="truncate text-[11.5px]" style={{ color: "var(--app-text-muted)" }}>{user.email}</p>
                </div>
                <button
                  onClick={signOut}
                  disabled={signingOut}
                  aria-label="Sign out"
                  className="grid h-8 w-8 place-items-center rounded-lg transition-colors hover:bg-black/5 disabled:opacity-50"
                  style={{ color: "var(--app-text-muted)" }}
                >
                  <svg viewBox="0 0 20 20" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M8 4H5a2 2 0 00-2 2v8a2 2 0 002 2h3M12 6l4 4-4 4M16 10H8" strokeLinecap="round" strokeLinejoin="round" /></svg>
                </button>
              </div>
            ) : null}
          </div>
        </aside>

        <main className="flex-1 min-w-0">
          {briefing ? (
            <div
              className="border-b px-6 py-2.5 text-[13px] hidden lg:flex items-center gap-3"
              style={{ borderColor: "var(--app-border)", background: "var(--app-accent-soft)", color: "var(--app-text-soft)" }}
            >
              <span
                aria-hidden="true"
                className="inline-block h-1.5 w-1.5 rounded-full"
                style={{ background: "var(--app-accent)" }}
              />
              <span className="font-medium" style={{ color: "var(--app-accent-strong)" }}>Arcad</span>
              <span>{briefing}</span>
            </div>
          ) : null}
          <PageMount>{children}</PageMount>
        </main>
      </div>
      <ArcadFloatingButton />
    </div>
  );
}

function BrandMark() {
  return (
    <Link href="/app" className="flex items-center gap-2 text-[15px] font-medium tracking-[-0.01em]">
      <span
        aria-hidden="true"
        className="grid h-7 w-7 place-items-center rounded-md"
        style={{ background: "var(--app-accent-soft)", color: "var(--app-accent-strong)" }}
      >
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.7">
          <path d="M12 3l8 18H4L12 3z" strokeLinejoin="round" />
        </svg>
      </span>
      <span style={{ color: "var(--app-text)" }}>Arcadia</span>
    </Link>
  );
}
