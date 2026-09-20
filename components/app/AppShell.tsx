"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { api, saveCsrf } from "@/lib/api/client";
import type { AuthUser } from "@/lib/api/types";
import { cn } from "@/lib/cn";
import { useTheme } from "@/lib/app/theme";
import { useStreak } from "@/lib/app/useStreak";
import { useSessionReminders } from "@/lib/app/useSessionReminders";
import ArcadFloatingButton from "./ArcadFloatingButton";
import MobileBottomNav from "./MobileBottomNav";
import NotificationCentre from "./NotificationCentre";
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

interface NavGroup {
  key: string;
  label: string;
  icon: ReactNode;
  items: NavItem[];
}

function icon(path: ReactNode) {
  return (
    <svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      {path}
    </svg>
  );
}

const TODAY: NavItem = {
  label: "Today",
  href: "/app",
  icon: icon(<path d="M4 6h12M4 10h12M4 14h8" />),
};

const NAV_GROUPS: NavGroup[] = [
  {
    key: "arcad",
    label: "Arcad",
    icon: icon(<path d="M4 5h12v9H8l-4 3V5z" />),
    items: [
      { label: "Chat", href: "/app/arcad", icon: icon(<path d="M4 5h12v9H8l-4 3V5z" />) },
      { label: "Knowledge", href: "/app/knowledge", icon: icon(<><path d="M5 4h9l2 2v10H5z" strokeLinejoin="round" /><path d="M14 4v3h3M8 10h5M8 13h5" /></>) },
    ],
  },
  {
    key: "plan",
    label: "Plan",
    icon: icon(<><rect x="3" y="4" width="14" height="13" rx="2" /><path d="M3 8h14M7 2v4M13 2v4" /></>),
    items: [
      { label: "Schedule", href: "/app/schedule", icon: icon(<><rect x="3" y="4" width="14" height="13" rx="2" /><path d="M3 8h14M7 2v4M13 2v4" /></>) },
      { label: "Deadlines", href: "/app/deadlines", icon: icon(<><circle cx="10" cy="10" r="7" /><path d="M10 6v4l3 2" /></>) },
      { label: "Commitments", href: "/app/commitments", icon: icon(<><path d="M3 9h14M10 3v14M3 6a3 3 0 013-3h8a3 3 0 013 3v8a3 3 0 01-3 3H6a3 3 0 01-3-3V6z" /></>) },
    ],
  },
  {
    key: "study",
    label: "Study",
    icon: icon(<><circle cx="10" cy="10" r="7" /><circle cx="10" cy="10" r="3" /></>),
    items: [
      { label: "Focus", href: "/app/focus", icon: icon(<><circle cx="10" cy="10" r="7" /><circle cx="10" cy="10" r="3" /></>) },
      { label: "Rooms", href: "/app/rooms", icon: icon(<><circle cx="6" cy="8" r="2" /><circle cx="14" cy="8" r="2" /><path d="M3 16c0-2 1.5-4 3-4M17 16c0-2-1.5-4-3-4M10 17v-1" /></>) },
    ],
  },
  {
    key: "progress",
    label: "Progress",
    icon: icon(<><path d="M4 15v-4M9 15V7M14 15v-6" /><path d="M2 17h16" /></>),
    items: [
      { label: "Analytics", href: "/app/analytics", icon: icon(<><path d="M4 15v-4M9 15V7M14 15v-6" /><path d="M2 17h16" /></>) },
      { label: "Weekly review", href: "/app/review", icon: icon(<><path d="M4 5h12M4 10h8M4 15h12" /><circle cx="15" cy="10" r="1" fill="currentColor" /></>) },
    ],
  },
];

export default function AppShell({ user, briefing, children }: AppShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { resolved, toggle } = useTheme();
  const streakSummary = useStreak();
  useSessionReminders();
  const streak = streakSummary.current;
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
      {/* Mobile top bar — brand + streak chip. Nav lives at the bottom now. */}
      {/* Solid, not frosted: glass and clay are competing materials, and the
          translucent bar muddied everything that scrolled under it. */}
      <div
        className="lg:hidden sticky top-0 z-30 flex items-center justify-between py-3 pl-4 pr-14"
        style={{ background: "var(--app-elev)", boxShadow: "var(--clay-shadow), var(--clay-rim)" }}
      >
        <BrandMark />
        {streak > 0 ? (
          <div
            className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-medium"
            style={{ background: "var(--app-accent-soft)", color: "var(--app-accent-strong)" }}
          >
            <span aria-hidden="true">✦</span>
            <span className="tabular-nums">{streak}</span>
            <span>day{streak === 1 ? "" : "s"}</span>
          </div>
        ) : null}
      </div>
      <NotificationCentre briefing={briefing} />

      <div className="mx-auto flex max-w-[1440px]">
        {/* Sidebar — desktop only. Mobile uses MobileBottomNav + MobileMoreSheet. */}
        <aside
          className={cn(
            "hidden lg:sticky lg:top-0 lg:flex lg:h-svh lg:w-[240px] lg:shrink-0 lg:flex-col",
          )}
          style={{
            background: "var(--app-surface-soft)",
            borderRight: "1px solid var(--app-border)",
          }}
        >
          <div className="hidden lg:block px-5 pt-6">
            <BrandMark />
          </div>

          <nav className="mt-6 flex flex-col gap-1 px-3">
            <Link
              href={TODAY.href}
              className={cn(
                "flex items-center gap-3 rounded-clay-sm px-3 py-2.5 text-[14px] font-semibold transition-colors",
                pathname !== TODAY.href && "clay-hover",
              )}
              style={{
                color: pathname === TODAY.href ? "var(--app-accent-strong)" : "var(--app-text-soft)",
                background: pathname === TODAY.href
                  ? "color-mix(in oklab, var(--app-accent) 12%, var(--app-surface))"
                  : "transparent",
                boxShadow: pathname === TODAY.href ? "var(--clay-shadow), var(--clay-rim)" : "none",
              }}
            >
              <span
                aria-hidden="true"
                style={{ color: pathname === TODAY.href ? "var(--app-accent)" : "var(--app-text-muted)" }}
              >
                {TODAY.icon}
              </span>
              {TODAY.label}
            </Link>

            {NAV_GROUPS.map((group) => {
              const groupActive = group.items.some((item) =>
                item.href === "/app" ? pathname === "/app" : pathname.startsWith(item.href),
              );
              return (
                <details
                  key={`${group.key}-${groupActive ? "active" : "idle"}`}
                  className="group"
                  defaultOpen={groupActive}
                >
                  <summary
                    className="clay-hover flex cursor-pointer list-none items-center gap-3 rounded-clay-sm px-3 py-2.5 text-[14px] font-semibold [&::-webkit-details-marker]:hidden"
                    style={{
                      color: groupActive ? "var(--app-text)" : "var(--app-text-soft)",
                      background: groupActive ? "color-mix(in oklab, var(--app-text) 4%, transparent)" : "transparent",
                    }}
                  >
                    <span
                      aria-hidden="true"
                      style={{ color: groupActive ? "var(--app-accent)" : "var(--app-text-muted)" }}
                    >
                      {group.icon}
                    </span>
                    <span className="flex-1">{group.label}</span>
                    <svg
                      aria-hidden="true"
                      viewBox="0 0 20 20"
                      width="13"
                      height="13"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.7"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="transition-transform group-open:rotate-90"
                      style={{ color: "var(--app-text-faint)" }}
                    >
                      <path d="M7 4l6 6-6 6" />
                    </svg>
                  </summary>

                  <div
                    className="ml-5 mt-1 flex flex-col gap-0.5 border-l pl-2"
                    style={{ borderColor: "var(--app-border)" }}
                  >
                    {group.items.map((item) => {
                      const active =
                        item.href === "/app"
                          ? pathname === "/app"
                          : pathname.startsWith(item.href);
                      return (
                        <Link
                          key={item.href}
                          href={item.href}
                          className={cn(
                            "flex items-center gap-2.5 rounded-clay-sm px-3 py-2 text-[13px] font-medium transition-colors",
                            !active && "clay-hover",
                          )}
                          style={{
                            color: active ? "var(--app-accent-strong)" : "var(--app-text-muted)",
                            background: active
                              ? "color-mix(in oklab, var(--app-accent) 12%, var(--app-surface))"
                              : "transparent",
                            boxShadow: active ? "var(--clay-shadow), var(--clay-rim)" : "none",
                          }}
                        >
                          <span
                            aria-hidden="true"
                            className="[&>svg]:h-[14px] [&>svg]:w-[14px]"
                            style={{ color: active ? "var(--app-accent)" : "var(--app-text-faint)" }}
                          >
                            {item.icon}
                          </span>
                          {item.label}
                        </Link>
                      );
                    })}
                  </div>
                </details>
              );
            })}
          </nav>

          <div className="mt-auto flex flex-col gap-2 px-3 pb-5">
            {streak > 0 ? (
              <div
                className="mx-2 rounded-clay-sm border p-3"
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
                        color: "var(--app-accent-on)",
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
                className="mx-2 rounded-clay-sm border p-3"
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
            <Link
              href="/app/settings"
              aria-label="Upgrade plan"
              className="group mx-2 flex items-center justify-between rounded-clay-sm border px-3 py-2.5 transition-[transform,box-shadow,background-color] hover:-translate-y-0.5"
              style={{
                borderColor: "color-mix(in oklab, var(--app-accent) 48%, var(--app-border))",
                background: "color-mix(in oklab, var(--app-accent) 18%, var(--app-surface))",
                boxShadow: "var(--clay-shadow), var(--clay-rim)",
                color: "var(--app-accent-strong)",
              }}
            >
              <span className="flex min-w-0 items-center gap-2.5">
                <span
                  aria-hidden="true"
                  className="grid h-7 w-7 shrink-0 place-items-center rounded-clay-xs"
                  style={{ background: "var(--app-accent)", color: "var(--app-accent-on)" }}
                >
                  <svg viewBox="0 0 20 20" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M10 2.5l1.15 4.15L15.5 8l-4.35 1.35L10 13.5 8.85 9.35 4.5 8l4.35-1.35L10 2.5z" />
                    <path d="M15.5 13l.55 1.95L18 15.5l-1.95.55L15.5 18l-.55-1.95L13 15.5l1.95-.55L15.5 13z" />
                  </svg>
                </span>
                <span className="min-w-0">
                  <span className="block text-[13px] font-semibold leading-tight">Upgrade plan</span>
                  <span className="mt-0.5 block truncate text-[10.5px] font-medium" style={{ color: "var(--app-text-muted)" }}>
                    Unlock all features
                  </span>
                </span>
              </span>
              <svg
                aria-hidden="true"
                viewBox="0 0 20 20"
                width="14"
                height="14"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="shrink-0 transition-transform group-hover:translate-x-0.5"
              >
                <path d="M7 4l6 6-6 6" />
              </svg>
            </Link>
            <button
              onClick={toggle}
              className="mx-2 flex items-center justify-between rounded-clay-sm border px-3 py-2 text-[13px] transition-colors"
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
                className="mx-2 flex items-center gap-2 rounded-clay-sm px-1 py-1"
                style={{ borderTop: "1px solid var(--app-border)" }}
              >
                <Link
                  href="/app/settings"
                  aria-label={`Open settings for ${user.name}`}
                  className="clay-hover flex min-w-0 flex-1 items-center gap-3 rounded-clay-sm px-2 py-1"
                >
                  <div
                    aria-hidden="true"
                    className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-[12.5px] font-medium"
                    style={{ background: "var(--app-accent-soft)", color: "var(--app-accent-strong)" }}
                  >
                    {user.name.slice(0, 1).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13.5px] font-medium" style={{ color: "var(--app-text)" }}>{user.name}</p>
                    <p className="truncate text-[11.5px]" style={{ color: "var(--app-text-muted)" }}>Profile & settings</p>
                  </div>
                </Link>
                <button
                  onClick={signOut}
                  disabled={signingOut}
                  aria-label="Sign out"
                  className="grid h-8 w-8 place-items-center rounded-clay-sm transition-colors clay-hover disabled:opacity-50"
                  style={{ color: "var(--app-text-muted)" }}
                >
                  <svg viewBox="0 0 20 20" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M8 4H5a2 2 0 00-2 2v8a2 2 0 002 2h3M12 6l4 4-4 4M16 10H8" strokeLinecap="round" strokeLinejoin="round" /></svg>
                </button>
              </div>
            ) : null}
          </div>
        </aside>

        <main
          className="flex-1 min-w-0 pb-[calc(env(safe-area-inset-bottom,0)+72px)] lg:pb-0"
        >
          {/* Arcad's own voice, so the strip carries Arcad's purple rather
              than the terracotta the rest of the UI uses. */}
          {briefing ? (
            <div
              className="border-b px-6 py-2.5 text-[13px] hidden lg:flex items-center gap-3"
              style={{ borderColor: "var(--app-border)", background: "var(--app-arcad-soft)", color: "var(--app-text-soft)" }}
            >
              <span
                aria-hidden="true"
                className="inline-block h-1.5 w-1.5 rounded-full"
                style={{ background: "var(--app-arcad)" }}
              />
              <span className="font-medium" style={{ color: "var(--app-arcad-strong)" }}>Arcad</span>
              <span>{briefing}</span>
            </div>
          ) : null}
          <PageMount>{children}</PageMount>
        </main>
      </div>
      <ArcadFloatingButton />
      <MobileBottomNav />
    </div>
  );
}

function BrandMark() {
  return (
    <Link href="/app" className="flex items-center gap-2 text-[15px] font-medium tracking-[-0.01em]">
      <span
        aria-hidden="true"
        className="grid h-7 w-7 place-items-center rounded-clay-xs"
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
