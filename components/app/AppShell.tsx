"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useState, type ReactNode } from "react";
import { api, saveCsrf } from "@/lib/api/client";
import type { AuthUser, Notice } from "@/lib/api/types";
import { cn } from "@/lib/cn";
import { useStreak } from "@/lib/app/useStreak";
import { useSessionReminders } from "@/lib/app/useSessionReminders";
import { useSessionStartWatcher } from "@/lib/app/useSessionStartWatcher";
import { useAppShortcuts } from "@/lib/app/useAppShortcuts";
import ArcadFloatingButton from "./ArcadFloatingButton";
import GuestBanner from "./GuestBanner";
import MenuBar from "./MenuBar";
import MobileBottomNav from "./MobileBottomNav";
import NewTaskSheet from "./NewTaskSheet";
import NotificationCentre from "./NotificationCentre";
import PageMount from "./PageMount";
import ShortcutsDialog from "./ShortcutsDialog";
import PushCheckInPrompt from "./PushCheckInPrompt";
import SessionStartModal from "./SessionStartModal";
import Logo from "@/components/ui/Logo";
import { Avatar } from "./profile/ui";
import { isGuestEmail } from "@/lib/auth/guest";

interface AppShellProps {
  user: AuthUser | null;
  notices?: Notice[];
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
      { label: "Plan and chat", href: "/app/arcad", icon: icon(<path d="M4 5h12v9H8l-4 3V5z" />) },
      { label: "What Arcad knows", href: "/app/profile#arcad", icon: icon(<><circle cx="10" cy="8" r="3" /><path d="M4.5 16.5c1-2.6 3.1-4 5.5-4s4.5 1.4 5.5 4" /></>) },
    ],
  },
  {
    key: "plan",
    label: "Plan",
    icon: icon(<><rect x="3" y="4" width="14" height="13" rx="2" /><path d="M3 8h14M7 2v4M13 2v4" /></>),
    items: [
      { label: "Schedule", href: "/app/schedule", icon: icon(<><rect x="3" y="4" width="14" height="13" rx="2" /><path d="M3 8h14M7 2v4M13 2v4" /></>) },
      { label: "Deadlines", href: "/app/deadlines", icon: icon(<><circle cx="10" cy="10" r="7" /><path d="M10 6v4l3 2" /></>) },
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
    key: "resources",
    label: "Resources",
    icon: icon(<><path d="M4 4.5A1.5 1.5 0 0 1 5.5 3H15v12H5.5A1.5 1.5 0 0 0 4 16.5v-12z" /><path d="M4 16.5A1.5 1.5 0 0 0 5.5 18H15v-3" /></>),
    items: [
      { label: "Cards", href: "/app/cards", icon: icon(<><rect x="3" y="6" width="11" height="10" rx="1.5" /><path d="M6 6V4.5A1.5 1.5 0 0 1 7.5 3h8A1.5 1.5 0 0 1 17 4.5v7a1.5 1.5 0 0 1-1.5 1.5H14" /></>) },
      { label: "Files", href: "/app/files", icon: icon(<><path d="M11 3H6a1.5 1.5 0 0 0-1.5 1.5v11A1.5 1.5 0 0 0 6 17h8a1.5 1.5 0 0 0 1.5-1.5V7.5L11 3z" /><path d="M11 3v4.5h4.5" /></>) },
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

export default function AppShell({ user, notices = [], children }: AppShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const streakSummary = useStreak();
  useSessionReminders();
  const sessionStart = useSessionStartWatcher();
  const streak = streakSummary.current;
  const [signingOut, setSigningOut] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(readSidebarPref);
  const [newTaskOpen, setNewTaskOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);

  const toggleSidebar = useCallback(() => {
    setSidebarOpen((open) => {
      writeSidebarPref(!open);
      return !open;
    });
  }, []);
  const openNewTask = useCallback(() => setNewTaskOpen(true), []);
  const openShortcuts = useCallback(() => setShortcutsOpen(true), []);
  const closeShortcuts = useCallback(() => setShortcutsOpen(false), []);

  useAppShortcuts({
    onNewTask: openNewTask,
    onShowShortcuts: openShortcuts,
    onToggleSidebar: toggleSidebar,
  });

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
      <MenuBar
        sidebarOpen={sidebarOpen}
        onToggleSidebar={toggleSidebar}
        onNewTask={openNewTask}
        onShowShortcuts={openShortcuts}
        onSignOut={() => void signOut()}
      />

      {/* Mobile top bar, brand + streak chip. Nav lives at the bottom. */}
      <div
        className="app-mobile-header lg:hidden sticky top-0 z-30 flex h-12 items-center justify-between border-b pl-4 pr-14"
        style={{ background: "var(--app-surface)", borderColor: "var(--app-border)" }}
      >
        <BrandMark />
        {streak > 0 ? (
          <div
            className="flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[12px] font-medium"
            style={{ background: "var(--app-accent-soft)", color: "var(--app-accent-strong)" }}
          >
            <span aria-hidden="true">✦</span>
            <span className="tabular-nums">{streak}</span>
            <span>day{streak === 1 ? "" : "s"}</span>
          </div>
        ) : null}
      </div>
      <NotificationCentre notices={notices} />

      <div className="flex">
        {/* Sidebar, desktop only. Mobile uses MobileBottomNav + MobileMoreSheet. */}
        <aside
          className={cn(
            "hidden lg:sticky lg:top-10 lg:h-[calc(100svh-2.5rem)] lg:w-[232px] lg:shrink-0 lg:flex-col lg:overflow-y-auto",
            sidebarOpen ? "lg:flex" : "lg:hidden",
          )}
          style={{
            background: "var(--app-surface-soft)",
            borderRight: "1px solid var(--app-border)",
          }}
        >
          <nav className="flex flex-col gap-0.5 px-2 pt-3" aria-label="Primary">
            <Link
              href={TODAY.href}
              aria-current={pathname === TODAY.href ? "page" : undefined}
              className={cn(
                "flex h-8 items-center gap-2.5 rounded-md px-2.5 text-[13.5px] font-medium",
                pathname !== TODAY.href && "ui-hover",
              )}
              style={{
                color: pathname === TODAY.href ? "var(--app-text)" : "var(--app-text-soft)",
                background: pathname === TODAY.href ? ACTIVE_BG : "transparent",
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
                  open={groupActive}
                >
                  <summary
                    className="ui-hover flex h-8 cursor-pointer list-none items-center gap-2.5 rounded-md px-2.5 text-[13.5px] font-medium [&::-webkit-details-marker]:hidden"
                    style={{ color: groupActive ? "var(--app-text)" : "var(--app-text-soft)" }}
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
                      className="opacity-0 transition-[transform,opacity] group-hover:opacity-100 group-open:rotate-90"
                      style={{ color: "var(--app-text-faint)" }}
                    >
                      <path d="M7 4l6 6-6 6" />
                    </svg>
                  </summary>

                  <div
                    className="mb-1 ml-[18px] mt-0.5 flex flex-col gap-0.5 border-l pl-2"
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
                          aria-current={active ? "page" : undefined}
                          className={cn(
                            "flex h-7 items-center gap-2 rounded-md px-2.5 text-[13px]",
                            !active && "ui-hover",
                          )}
                          style={{
                            color: active ? "var(--app-text)" : "var(--app-text-muted)",
                            background: active ? ACTIVE_BG : "transparent",
                            fontWeight: active ? 500 : 400,
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

          <div className="mt-auto flex flex-col gap-1 px-2 pb-3 pt-4">
            {user?.tier === "pro" || user?.tier === "max" ? null : (
              <Link
                href="/app/pricing"
                className="ui-hover flex h-8 items-center gap-2.5 rounded-md px-2.5 text-[13px]"
                style={{ color: "var(--app-text-soft)" }}
              >
                <svg aria-hidden="true" viewBox="0 0 20 20" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--app-text-muted)" }}>
                  <path d="M10 2.5l1.15 4.15L15.5 8l-4.35 1.35L10 13.5 8.85 9.35 4.5 8l4.35-1.35L10 2.5z" />
                </svg>
                Upgrade to Pro
              </Link>
            )}
            {user ? (
              <div
                className="mt-1 flex items-center gap-1 border-t pt-2"
                style={{ borderColor: "var(--app-border)" }}
              >
                <Link
                  href="/app/profile"
                  aria-label={`Open your profile, ${user.name}`}
                  aria-current={pathname.startsWith("/app/profile") ? "page" : undefined}
                  className="ui-hover flex min-w-0 flex-1 items-center gap-2.5 rounded-md px-1.5 py-1"
                  style={{ background: pathname.startsWith("/app/profile") ? ACTIVE_BG : undefined }}
                >
                  <Avatar name={user.name} colour={user.avatarColour} size={28} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-medium" style={{ color: "var(--app-text)" }}>{user.name}</p>
                    <p className="truncate text-[11.5px]" style={{ color: "var(--app-text-muted)" }}>{isGuestEmail(user.email) ? "Guest account" : "Your profile"}</p>
                  </div>
                </Link>
                <Link
                  href="/app/settings"
                  aria-label="Settings"
                  aria-current={pathname.startsWith("/app/settings") ? "page" : undefined}
                  className="grid h-8 w-8 place-items-center rounded-md transition-colors ui-hover"
                  style={{
                    color: pathname.startsWith("/app/settings") ? "var(--app-text)" : "var(--app-text-muted)",
                    background: pathname.startsWith("/app/settings") ? ACTIVE_BG : undefined,
                  }}
                >
                  <svg viewBox="0 0 20 20" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <circle cx="10" cy="10" r="2.5" />
                    <path d="M10 2.5v2M10 15.5v2M2.5 10h2M15.5 10h2M4.7 4.7l1.4 1.4M13.9 13.9l1.4 1.4M4.7 15.3l1.4-1.4M13.9 6.1l1.4-1.4" />
                  </svg>
                </Link>
                <button
                  onClick={signOut}
                  disabled={signingOut}
                  aria-label="Sign out"
                  className="grid h-8 w-8 place-items-center rounded-md transition-colors ui-hover disabled:opacity-50"
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
          {isGuestEmail(user?.email) ? (
            <GuestBanner />
          ) : null}
          <PageMount>{children}</PageMount>
        </main>
      </div>
      <ArcadFloatingButton />
      <MobileBottomNav />
      <NewTaskSheet open={newTaskOpen} onClose={() => setNewTaskOpen(false)} />
      <ShortcutsDialog open={shortcutsOpen} onClose={closeShortcuts} />
      <PushCheckInPrompt />
      <SessionStartModal
        key={sessionStart.event?.id ?? "none"}
        event={sessionStart.event}
        timezone={sessionStart.timezone}
        onClose={sessionStart.dismiss}
      />
    </div>
  );
}

/** Selected nav row: a neutral tint, so the accent stays for icons and actions. */
const ACTIVE_BG = "color-mix(in oklab, var(--app-text) 8%, transparent)";

const SIDEBAR_KEY = "arcadia:sidebar";

function readSidebarPref(): boolean {
  try {
    return window.localStorage.getItem(SIDEBAR_KEY) !== "hidden";
  } catch {
    return true;
  }
}

function writeSidebarPref(open: boolean) {
  try {
    window.localStorage.setItem(SIDEBAR_KEY, open ? "shown" : "hidden");
  } catch {
    /* ignore */
  }
}

function BrandMark() {
  return (
    <Link href="/app" aria-label="Arcadia, go to Today" title="Arcadia" className="grid h-8 w-8 place-items-center rounded-md">
      <span
        aria-hidden="true"
        className="grid h-6 w-6 place-items-center rounded-md"
        style={{ background: "var(--app-accent)", color: "var(--app-accent-on)" }}
      >
        <Logo size={12} />
      </span>
    </Link>
  );
}
