"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type FocusEvent, type PointerEvent, type ReactNode } from "react";
import { api, saveCsrf } from "@/lib/api/client";
import { analytics, resetAnalytics } from "@/lib/analytics/events";
import type { AuthUser, Notice } from "@/lib/api/types";
import { cn } from "@/lib/cn";
import { useDashboardData } from "@/lib/app/DashboardProvider";
import { hasCompletedStudyBlock, recordFirstStudyBlock } from "@/lib/app/firstStudyBlock";
import { useStreak } from "@/lib/app/useStreak";
import { useSessionReminders } from "@/lib/app/useSessionReminders";
import { useSessionStartWatcher } from "@/lib/app/useSessionStartWatcher";
import { useAppShortcuts } from "@/lib/app/useAppShortcuts";
import ArcadFloatingButton from "./ArcadFloatingButton";
import AutoBlocking from "./AutoBlocking";
import ContextMenuHost from "./ContextMenu";
import GuestBanner from "./GuestBanner";
import OfflineBanner from "./OfflineBanner";
import MenuBar from "./MenuBar";
import MobileBottomNav from "./MobileBottomNav";
import { requestAddToToday } from "@/lib/app/addToToday";
import NotificationCentre from "./NotificationCentre";
import PageMount from "./PageMount";
import ShortcutsDialog from "./ShortcutsDialog";
import PushCheckInPrompt from "./PushCheckInPrompt";
import SidebarMomentum from "./SidebarMomentum";
import SearchDialog, { SEARCH_ICON, useModKey } from "./SearchDialog";
import SessionStartModal from "./SessionStartModal";
import SleepStartPrompt from "./SleepStartPrompt";
import Kbd from "./Kbd";
import Logo from "@/components/ui/Logo";
import { useNativeIOS } from "@/lib/capacitor/platform";
import { Avatar } from "./profile/ui";
import { isGuestEmail } from "@/lib/auth/guest";
import { initialiseRevenueCat, logOutRevenueCat } from "@/lib/capacitor/revenuecat";
import { releaseFocusGuard } from "@/lib/capacitor/focusGuard";
import { unlinkNativePush, useNativePush } from "@/lib/capacitor/nativePush";

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
  href?: string;
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
    // Where the studying happens, so it sits up top. Rooms live inside it
    // at /app/sessions/rooms and keep this tab lit.
    key: "sessions",
    label: "Sessions",
    icon: icon(<><circle cx="10" cy="10" r="7" /><circle cx="10" cy="10" r="3" /></>),
    href: "/app/sessions",
    items: [],
  },
  {
    key: "arcad",
    label: "Arcad",
    icon: icon(<path d="M4 5h12v9H8l-4 3V5z" />),
    href: "/app/arcad",
    items: [],
  },
  {
    key: "plan",
    label: "Plan",
    icon: icon(<><rect x="3" y="4" width="14" height="13" rx="2" /><path d="M3 8h14M7 2v4M13 2v4" /></>),
    items: [
      { label: "Schedule", href: "/app/schedule", icon: icon(<><rect x="3" y="4" width="14" height="13" rx="2" /><path d="M3 8h14M7 2v4M13 2v4" /></>) },
      { label: "Priorities", href: "/app/priorities", icon: icon(<><path d="M4 5h2M4 10h2M4 15h2M9 5h7M11 10h5M11 15h5" /></>) },
    ],
  },
  {
    key: "resources",
    label: "Study tools",
    icon: icon(<><path d="M4 4.5A1.5 1.5 0 0 1 5.5 3H15v12H5.5A1.5 1.5 0 0 0 4 16.5v-12z" /><path d="M4 16.5A1.5 1.5 0 0 0 5.5 18H15v-3" /></>),
    href: "/app/study",
    items: [],
  },
  {
    key: "progress",
    label: "Progress",
    icon: icon(<><path d="M4 15v-4M9 15V7M14 15v-6" /><path d="M2 17h16" /></>),
    items: [
      { label: "Progress", href: "/app/progress", icon: icon(<><path d="M4 15v-4M9 15V7M14 15v-6" /><path d="M2 17h16" /></>) },
      { label: "Leaderboard", href: "/app/leaderboard", icon: icon(<><path d="M10 3l1.7 3.45 3.8.55-2.75 2.68.65 3.78L10 11.68 6.6 13.46l.65-3.78L4.5 7l3.8-.55L10 3z" /></>) },
    ],
  },
  {
    // A row of its own, not only the small gear by your name: on an iPad it
    // was too easy to miss.
    key: "settings",
    label: "Settings",
    icon: icon(<><circle cx="10" cy="10" r="2.5" /><path d="M10 2.5v2M10 15.5v2M2.5 10h2M15.5 10h2M4.7 4.7l1.4 1.4M13.9 13.9l1.4 1.4M4.7 15.3l1.4-1.4M13.9 6.1l1.4-1.4" /></>),
    href: "/app/settings",
    items: [],
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
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const modKey = useModKey();
  const socialSignupTracked = useRef(false);

  // The native shell identifies RevenueCat with Arcadia's own user ID. This
  // stays a no-op on web, so Stripe remains the only web billing path.
  useEffect(() => {
    if (!user?.id) return;
    void initialiseRevenueCat(user.id).catch((error) => {
      console.warn("[revenuecat] initialisation failed", error);
    });
  }, [user?.id]);

  // iOS app: tapped check-ins open what they're about, and this phone's
  // push registration stays current. A no-op on the web.
  useNativePush(user?.id);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("signup") !== "completed" || socialSignupTracked.current) return;
    socialSignupTracked.current = true;
    analytics.signupCompleted();
    const url = new URL(window.location.href);
    url.searchParams.delete("signup");
    window.history.replaceState({}, "", url.toString());
  }, []);

  const toggleSidebar = useCallback(() => {
    setSidebarOpen((open) => {
      writeSidebarPref(!open);
      return !open;
    });
  }, []);
  // + and the new-task shortcut open Today's "Add to today..." line, not a sheet.
  const openNewTask = useCallback(() => {
    if (pathname === "/app") requestAddToToday();
    else router.push("/app?add=1");
  }, [pathname, router]);
  const openShortcuts = useCallback(() => setShortcutsOpen(true), []);
  const closeShortcuts = useCallback(() => setShortcutsOpen(false), []);
  const openSearch = useCallback(() => setSearchOpen(true), []);
  const toggleSearch = useCallback(() => setSearchOpen((open) => !open), []);
  const closeSearch = useCallback(() => setSearchOpen(false), []);

  useAppShortcuts({
    onNewTask: openNewTask,
    onShowShortcuts: openShortcuts,
    onToggleSidebar: toggleSidebar,
    onSearch: toggleSearch,
  });

  async function signOut() {
    setSigningOut(true);
    void logOutRevenueCat().catch((error) => {
      console.warn("[revenuecat] sign-out failed", error);
    });
    // iOS app: this phone stops getting the account's check-ins, and any app
    // block lifts. Before logout, while the session can still unlink it.
    await Promise.all([
      unlinkNativePush().catch((error) => console.warn("[native-push] unlink failed", error)),
      releaseFocusGuard(),
    ]);
    try {
      await api("/api/auth/logout", { method: "POST" });
    } catch {
      /* still clear locally */
    } finally {
      saveCsrf(null);
      resetAnalytics();
      router.push("/login");
    }
  }

  return (
    <div
      className="min-h-svh"
      style={{ background: "var(--app-bg)", color: "var(--app-text)" }}
    >
      <FirstStudyBlockMarker />
      <AutoBlocking />
      <OfflineBanner />
      <MenuBar />

      {/* Mobile top bar, brand + streak chip. Nav lives at the bottom. */}
      <div
        className="app-mobile-header lg:hidden sticky top-0 z-30 flex h-12 items-center justify-between border-b pl-4 pr-14"
        style={{ background: "var(--app-surface)", borderColor: "var(--app-border)" }}
      >
        <BrandMark />
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={openSearch}
            aria-label="Search"
            className="grid h-8 w-8 place-items-center rounded-md ui-hover"
            style={{ color: "var(--app-text-muted)" }}
          >
            {SEARCH_ICON}
          </button>
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
          {user?.tier === "pro" || user?.tier === "max" ? (
            <Link
              href="/app/settings#billing"
              className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] font-semibold transition-opacity hover:opacity-90"
              style={{ background: "var(--app-arcad-soft)", color: "var(--app-arcad-strong)" }}
              aria-label={`Arcadia ${user.tier === "max" ? "Max" : "Pro"}, manage subscription`}
            >
              <span aria-hidden="true">✦</span>
              {user.tier === "max" ? "Max" : "Pro"}
            </Link>
          ) : (
            <Link
              href="/app/pricing"
              className="flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-[14px] font-semibold"
              style={{ background: "var(--app-arcad)", color: "var(--app-arcad-on)" }}
            >
              <span aria-hidden="true">✦</span>
              Upgrade
            </Link>
          )}
        </div>
      </div>
      <NotificationCentre notices={notices} />

      <div className="flex">
        {/* Sidebar, desktop only. Mobile uses MobileBottomNav + MobileMoreSheet. */}
        <aside
          className={cn(
            "hidden lg:sticky lg:top-[calc(2.5rem+env(safe-area-inset-top,0px))] lg:h-[calc(100svh-2.5rem-env(safe-area-inset-top,0px))] lg:w-[232px] lg:shrink-0 lg:flex-col lg:overflow-hidden",
            sidebarOpen ? "lg:flex" : "lg:hidden",
          )}
          style={{
            background: "var(--app-surface-soft)",
            borderRight: "1px solid var(--app-border)",
          }}
        >
          <div className="flex items-center gap-1 px-2 pt-3">
            <button
              type="button"
              onClick={openSearch}
              className="flex h-8 min-w-0 flex-1 items-center gap-2 rounded-md border px-2.5 text-[13px] transition-colors hover:border-[var(--app-border-strong)]"
              style={{ background: "var(--app-surface)", borderColor: "var(--app-border)", color: "var(--app-text-muted)" }}
            >
              <span aria-hidden="true" className="[&>svg]:h-[14px] [&>svg]:w-[14px]">{SEARCH_ICON}</span>
              <span className="flex-1 truncate text-left">Search</span>
              <Kbd keys={[modKey, "K"]} />
            </button>
            <button
              type="button"
              onClick={toggleSidebar}
              aria-label="Collapse sidebar"
              title="Collapse sidebar ( [ )"
              className="grid h-8 w-8 shrink-0 place-items-center rounded-md ui-hover"
              style={{ color: "var(--app-text-muted)" }}
            >
              {PANEL_ICON}
            </button>
          </div>

          <nav className="flex flex-col gap-0.5 px-2 pt-2" aria-label="Primary">
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
              if (group.href) {
                const active = pathname.startsWith(group.href);
                return (
                  <Link
                    key={group.key}
                    href={group.href}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex h-8 items-center gap-2.5 rounded-md px-2.5 text-[13.5px] font-medium",
                      !active && "ui-hover",
                    )}
                    style={{
                      color: active ? "var(--app-text)" : "var(--app-text-soft)",
                      background: active ? ACTIVE_BG : "transparent",
                    }}
                  >
                    <span aria-hidden="true" style={{ color: active ? "var(--app-accent)" : "var(--app-text-muted)" }}>
                      {group.icon}
                    </span>
                    {group.label}
                  </Link>
                );
              }
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
                      className="opacity-45 transition-[transform,opacity] group-hover:opacity-100 group-open:rotate-90 group-open:opacity-70"
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

          <div className="px-2 pb-1 pt-3 [@media(max-height:780px)]:hidden">
            <SidebarMomentum />
          </div>

          <div className="flex flex-col gap-1 px-2 pt-2">
            {user?.tier === "pro" || user?.tier === "max" ? (
              <Link
                href="/app/settings#billing"
                className="flex items-center justify-between gap-2 rounded-lg px-3 py-2 transition-opacity hover:opacity-90"
                style={{ background: "var(--app-arcad-soft)" }}
                aria-label={`Arcadia ${user.tier === "max" ? "Max" : "Pro"}, manage subscription`}
              >
                <span className="flex items-center gap-2">
                  <svg
                    aria-hidden="true"
                    viewBox="0 0 20 20"
                    width="15"
                    height="15"
                    fill="currentColor"
                    style={{ color: "var(--app-arcad-strong)" }}
                  >
                    <path d="M10 2.5l1.15 4.15L15.5 8l-4.35 1.35L10 13.5 8.85 9.35 4.5 8l4.35-1.35L10 2.5z" />
                  </svg>
                  <span className="flex flex-col leading-tight">
                    <span className="text-[12px] font-semibold" style={{ color: "var(--app-arcad-strong)" }}>
                      Arcadia {user.tier === "max" ? "Max" : "Pro"}
                    </span>
                    <span className="text-[10.5px]" style={{ color: "var(--app-text-muted)" }}>
                      Manage subscription
                    </span>
                  </span>
                </span>
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
                  style={{ color: "var(--app-text-faint)" }}
                >
                  <path d="M7 4l6 6-6 6" />
                </svg>
              </Link>
            ) : (
              <Link
                href="/app/pricing"
                className="flex h-9 items-center justify-center gap-2 rounded-lg px-3 text-[13px] font-semibold transition-opacity hover:opacity-90"
                style={{
                  background: "var(--app-arcad)",
                  color: "var(--app-arcad-on)",
                  boxShadow: "0 6px 18px -8px var(--app-arcad)",
                }}
              >
                <svg aria-hidden="true" viewBox="0 0 20 20" width="15" height="15" fill="currentColor">
                  <path d="M10 2.5l1.15 4.15L15.5 8l-4.35 1.35L10 13.5 8.85 9.35 4.5 8l4.35-1.35L10 2.5z" />
                </svg>
                Upgrade to Pro
              </Link>
            )}
          </div>
          <div className="mt-auto flex flex-col gap-1 px-2 pb-3 pt-1">
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
                  <Avatar name={user.name} colour={user.avatarColour} size={28} developer={user.developerAccess} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-medium" style={{ color: "var(--app-text)" }}>{user.name}</p>
                    <p
                      className="truncate text-[11.5px]"
                      style={{ color: user.developerAccess ? "var(--app-gold)" : "var(--app-text-muted)" }}
                    >
                      {isGuestEmail(user.email) ? "Guest account" : user.developerAccess ? "Developer" : "Your profile"}
                    </p>
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

        {sidebarOpen ? null : (
          <SidebarRail user={user} pathname={pathname} onExpand={toggleSidebar} onSearch={openSearch} />
        )}

        <main
          className="@container/main flex-1 min-w-0 pb-[calc(env(safe-area-inset-bottom,0)+var(--mobile-nav-h))] lg:pb-0"
        >
          {isGuestEmail(user?.email) ? (
            <GuestBanner />
          ) : null}
          {/* Today now opens with its own greeting, so the welcome bar is gone. */}
          <PageMount>{children}</PageMount>
        </main>
        <ArcadFloatingButton />
      </div>
      <MobileBottomNav onAdd={openNewTask} />
      <ShortcutsDialog open={shortcutsOpen} onClose={closeShortcuts} />
      <SearchDialog open={searchOpen} onClose={closeSearch} onNewTask={openNewTask} onShowShortcuts={openShortcuts} />
      <ContextMenuHost />
      <PushCheckInPrompt />
      <SessionStartModal
        key={sessionStart.event?.id ?? "none"}
        event={sessionStart.event}
        timezone={sessionStart.timezone}
        onClose={sessionStart.dismiss}
      />
      <SleepStartPrompt blocked={Boolean(sessionStart.event)} />
    </div>
  );
}

/** Lets optional global prompts wait until the student has completed one block. */
function FirstStudyBlockMarker() {
  const { data } = useDashboardData();

  useEffect(() => {
    if (hasCompletedStudyBlock(data.events)) recordFirstStudyBlock();
  }, [data.events]);

  return null;
}

/** Selected nav row: a neutral tint, so the accent stays for icons and actions. */
const ACTIVE_BG = "color-mix(in oklab, var(--app-text) 8%, transparent)";

/** A panel with its left column marked: collapse or expand the sidebar. */
const PANEL_ICON = icon(<><rect x="3" y="3.5" width="14" height="13" rx="2" /><path d="M8 3.5v13" /></>);

const SPARK_ICON = (
  <svg viewBox="0 0 20 20" width="16" height="16" fill="currentColor">
    <path d="M10 2.5l1.15 4.15L15.5 8l-4.35 1.35L10 13.5 8.85 9.35 4.5 8l4.35-1.35L10 2.5z" />
  </svg>
);

interface RailTip {
  label: string;
  top: number;
  left: number;
}

/**
 * The collapsed sidebar: one icon per page, grouped the way the full sidebar
 * groups them, with a label beside each icon on hover or focus. The label is
 * fixed-positioned so the rail's own scrolling can't clip it.
 */
function SidebarRail({
  user,
  pathname,
  onExpand,
  onSearch,
}: {
  user: AuthUser | null;
  pathname: string;
  onExpand: () => void;
  onSearch: () => void;
}) {
  const [tip, setTip] = useState<RailTip | null>(null);

  const tipProps = (label: string) => ({
    "aria-label": label,
    onPointerEnter: (event: PointerEvent<HTMLElement>) => showTip(event.currentTarget, label),
    onPointerLeave: () => setTip(null),
    onFocus: (event: FocusEvent<HTMLElement>) => showTip(event.currentTarget, label),
    onBlur: () => setTip(null),
  });

  function showTip(target: HTMLElement, label: string) {
    const rect = target.getBoundingClientRect();
    setTip({ label, top: rect.top + rect.height / 2, left: rect.right + 10 });
  }

  const isActive = (href: string) => (href === "/app" ? pathname === "/app" : pathname.startsWith(href));
  const sections: NavItem[][] = [
    [TODAY, ...NAV_GROUPS.filter((group) => group.href).map((group) => ({ label: group.label, href: group.href!, icon: group.icon }))],
    ...NAV_GROUPS.filter((group) => !group.href).map((group) => group.items),
  ];
  const paid = user?.tier === "pro" || user?.tier === "max";

  return (
    <aside
      className="hidden lg:sticky lg:top-[calc(2.5rem+env(safe-area-inset-top,0px))] lg:flex lg:h-[calc(100svh-2.5rem-env(safe-area-inset-top,0px))] lg:w-[56px] lg:shrink-0 lg:flex-col lg:overflow-hidden"
      style={{ background: "var(--app-surface-soft)", borderRight: "1px solid var(--app-border)" }}
    >
      <div className="flex flex-col items-center gap-1 px-2 pt-3">
        <button type="button" onClick={onExpand} className={RAIL_BUTTON} style={{ color: "var(--app-text-muted)" }} {...tipProps("Expand sidebar")}>
          {PANEL_ICON}
        </button>
        <button type="button" onClick={onSearch} className={RAIL_BUTTON} style={{ color: "var(--app-text-muted)" }} {...tipProps("Search")}>
          {SEARCH_ICON}
        </button>
        <SidebarMomentum compact />
      </div>

      {/* Only the pages scroll on a short window; search and the account stay put. */}
      <nav
        className="flex min-h-0 flex-1 flex-col items-center overflow-y-auto px-2 [scrollbar-width:none]"
        aria-label="Primary"
        onScroll={() => setTip(null)}
      >
        {sections.map((items, index) => (
          <div key={index} className="flex flex-col items-center gap-1">
            <div aria-hidden="true" className="my-2 h-px w-7" style={{ background: "var(--app-border)" }} />
            {items.map((item) => {
              const active = isActive(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(RAIL_BUTTON, !active && "ui-hover")}
                  style={{
                    color: active ? "var(--app-accent)" : "var(--app-text-muted)",
                    background: active ? ACTIVE_BG : undefined,
                  }}
                  {...tipProps(item.label)}
                >
                  {item.icon}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      <div className="flex flex-col items-center gap-1 px-2 pb-3">
        <div aria-hidden="true" className="my-2 h-px w-7" style={{ background: "var(--app-border)" }} />
        <Link
          href={paid ? "/app/settings#billing" : "/app/pricing"}
          className={cn(RAIL_BUTTON, "transition-opacity hover:opacity-90")}
          style={
            paid
              ? { background: "var(--app-arcad-soft)", color: "var(--app-arcad-strong)" }
              : { background: "var(--app-arcad)", color: "var(--app-arcad-on)" }
          }
          {...tipProps(paid ? `Arcadia ${user?.tier === "max" ? "Max" : "Pro"}, manage subscription` : "Upgrade to Pro")}
        >
          {SPARK_ICON}
        </Link>
        {user ? (
          <>
            <Link
              href="/app/settings"
              aria-current={pathname.startsWith("/app/settings") ? "page" : undefined}
              className={cn(RAIL_BUTTON, !pathname.startsWith("/app/settings") && "ui-hover")}
              style={{
                color: pathname.startsWith("/app/settings") ? "var(--app-text)" : "var(--app-text-muted)",
                background: pathname.startsWith("/app/settings") ? ACTIVE_BG : undefined,
              }}
              {...tipProps("Settings")}
            >
              <svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="10" cy="10" r="2.5" />
                <path d="M10 2.5v2M10 15.5v2M2.5 10h2M15.5 10h2M4.7 4.7l1.4 1.4M13.9 13.9l1.4 1.4M4.7 15.3l1.4-1.4M13.9 6.1l1.4-1.4" />
              </svg>
            </Link>
            <Link
              href="/app/profile"
              aria-current={pathname.startsWith("/app/profile") ? "page" : undefined}
              className={cn(RAIL_BUTTON, "ui-hover")}
              style={{ background: pathname.startsWith("/app/profile") ? ACTIVE_BG : undefined }}
              {...tipProps(`Your profile, ${user.name}`)}
            >
              <Avatar name={user.name} colour={user.avatarColour} size={28} developer={user.developerAccess} />
            </Link>
          </>
        ) : null}
      </div>

      {tip ? (
        <div
          aria-hidden="true"
          className="pointer-events-none fixed z-50 -translate-y-1/2 whitespace-nowrap rounded-md px-2 py-1 text-[12px] font-medium"
          style={{ top: tip.top, left: tip.left, background: "var(--app-elev)", color: "var(--app-text)", boxShadow: "var(--elev-2)" }}
        >
          {tip.label}
        </div>
      ) : null}
    </aside>
  );
}

const RAIL_BUTTON = "grid h-9 w-9 shrink-0 place-items-center rounded-lg [&>svg]:h-[18px] [&>svg]:w-[18px]";



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
  // The wordmark is for the website; the iOS app keeps the icon on its own.
  const nativeIOS = useNativeIOS();
  return (
    <Link href="/app" aria-label="Arcadia, go to Today" title="Arcadia" className="flex h-8 items-center gap-2 rounded-md">
      <Logo size={28} />
      {nativeIOS ? null : (
        <span className="text-[19px] font-bold tracking-[-0.02em]" style={{ color: "var(--app-text)" }}>
          Arcadia
        </span>
      )}
    </Link>
  );
}
