"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore, type KeyboardEvent as ReactKeyboardEvent } from "react";
import Logo from "@/components/ui/Logo";
import { useDashboardData } from "@/lib/app/DashboardProvider";
import { GO_TARGETS, openArcad, openPageTour } from "@/lib/app/commands";
import { useTheme, type ThemeMode } from "@/lib/app/theme";
import { is24Hour, set24Hour } from "@/lib/app/timeFormat";
import { requestDashboardRefresh } from "@/lib/app/useDashboardAutoRefresh";
import Kbd from "./Kbd";
import { getActiveTour, subscribeActiveTour } from "./tour/tours";

type MenuEntry =
  | { kind: "item"; label: string; shortcut?: string[]; disabled?: boolean; onSelect: () => void }
  | { kind: "check"; label: string; checked: boolean; shortcut?: string[]; onSelect: () => void }
  | { kind: "separator" }
  | { kind: "label"; label: string };

interface Menu {
  label: string;
  entries: MenuEntry[];
}

interface MenuBarProps {
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
  onNewTask: () => void;
  onShowShortcuts: () => void;
  onSignOut: () => void;
}

/**
 * The desktop menu bar: File / Edit / View / Go / Help, the way real software
 * does it. Every entry does something — no decorative Undo/Redo. Keyboard
 * behaviour follows the WAI-ARIA menubar pattern.
 */
export default function MenuBar({
  sidebarOpen,
  onToggleSidebar,
  onNewTask,
  onShowShortcuts,
  onSignOut,
}: MenuBarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { mode, setMode } = useTheme();
  const { patch } = useDashboardData();
  const [use24h, setUse24h] = useState(is24Hour);
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const pageTour = useSyncExternalStore(subscribeActiveTour, getActiveTour, () => null);
  const barRef = useRef<HTMLDivElement>(null);
  const triggerRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const menuRef = useRef<HTMLDivElement>(null);
  // When a menu opens from the keyboard, focus moves into it.
  const focusOnOpen = useRef<"first" | "last" | null>(null);

  const go = (href: string) => router.push(href);
  const themeItem = (value: ThemeMode, label: string): MenuEntry => ({
    kind: "check",
    label,
    checked: mode === value,
    onSelect: () => setMode(value),
  });

  const menus: Menu[] = [
    {
      label: "File",
      entries: [
        { kind: "item", label: "New task…", shortcut: ["N"], onSelect: onNewTask },
        { kind: "item", label: "New study room…", onSelect: () => go("/app/rooms") },
        { kind: "item", label: "Start focus session", onSelect: () => go("/app/focus") },
        { kind: "item", label: "Upload to Knowledge…", onSelect: () => go("/app/knowledge") },
        { kind: "separator" },
        { kind: "item", label: "Account settings", shortcut: ["G", ","], onSelect: () => go("/app/settings") },
        { kind: "separator" },
        { kind: "item", label: "Sign out", onSelect: onSignOut },
      ],
    },
    {
      label: "Edit",
      entries: [
        { kind: "item", label: "Commitments…", onSelect: () => go("/app/commitments") },
        { kind: "item", label: "Deadlines…", onSelect: () => go("/app/deadlines") },
        { kind: "item", label: "Subjects & preferences…", onSelect: () => go("/app/settings") },
      ],
    },
    {
      label: "View",
      entries: [
        { kind: "check", label: "Sidebar", checked: sidebarOpen, shortcut: ["["], onSelect: onToggleSidebar },
        {
          kind: "check",
          label: "24-hour time",
          checked: use24h,
          onSelect: () => {
            set24Hour(!use24h);
            setUse24h(!use24h);
            // Formatters read the setting on every call; a no-op patch
            // re-renders every view that shows a time.
            patch((prev) => ({ ...prev }));
          },
        },
        { kind: "separator" },
        { kind: "label", label: "Theme" },
        themeItem("light", "Light"),
        themeItem("dark", "Dark"),
        themeItem("system", "Match system"),
        { kind: "separator" },
        { kind: "item", label: "Refresh data", onSelect: requestDashboardRefresh },
      ],
    },
    {
      label: "Go",
      entries: GO_TARGETS.map((target) => ({
        kind: "check" as const,
        label: target.label,
        checked: target.href === "/app" ? pathname === "/app" : pathname.startsWith(target.href),
        shortcut: ["G", target.key === "," ? "," : target.key.toUpperCase()],
        onSelect: () => go(target.href),
      })),
    },
    {
      label: "Help",
      entries: [
        { kind: "item", label: "How this page works", disabled: !pageTour, onSelect: openPageTour },
        { kind: "item", label: "Keyboard shortcuts", shortcut: ["?"], onSelect: onShowShortcuts },
        {
          kind: "item",
          label: "Ask Arcad",
          onSelect: () => (pathname.startsWith("/app/arcad") ? undefined : openArcad()),
        },
        { kind: "separator" },
        { kind: "item", label: "Plans & pricing", onSelect: () => go("/app/pricing") },
        { kind: "item", label: "Privacy", onSelect: () => go("/privacy") },
        { kind: "item", label: "Terms", onSelect: () => go("/terms") },
      ],
    },
  ];

  const close = (refocusTrigger: boolean) => {
    if (refocusTrigger && openIndex !== null) triggerRefs.current[openIndex]?.focus();
    setOpenIndex(null);
  };

  // Click anywhere outside the bar closes it.
  useEffect(() => {
    if (openIndex === null) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!barRef.current?.contains(event.target as Node)) setOpenIndex(null);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [openIndex]);

  useEffect(() => {
    if (openIndex === null || !focusOnOpen.current) return;
    const items = Array.from(
      menuRef.current?.querySelectorAll<HTMLElement>('[role^="menuitem"]:not([aria-disabled="true"])') ?? [],
    );
    const target = focusOnOpen.current === "first" ? items[0] : items[items.length - 1];
    focusOnOpen.current = null;
    target?.focus();
  }, [openIndex]);

  function menuItems(): HTMLElement[] {
    return Array.from(menuRef.current?.querySelectorAll<HTMLElement>('[role^="menuitem"]:not([aria-disabled="true"])') ?? []);
  }

  function openMenu(index: number, focus: "first" | "last" | null) {
    const wrapped = (index + menus.length) % menus.length;
    focusOnOpen.current = focus;
    setOpenIndex(wrapped);
    if (!focus) triggerRefs.current[wrapped]?.focus();
  }

  function onTriggerKeyDown(event: ReactKeyboardEvent<HTMLButtonElement>, index: number) {
    switch (event.key) {
      case "ArrowDown":
      case "Enter":
      case " ":
        event.preventDefault();
        openMenu(index, "first");
        break;
      case "ArrowUp":
        event.preventDefault();
        openMenu(index, "last");
        break;
      case "ArrowRight":
        event.preventDefault();
        if (openIndex === null) triggerRefs.current[(index + 1) % menus.length]?.focus();
        else openMenu(index + 1, "first");
        break;
      case "ArrowLeft":
        event.preventDefault();
        if (openIndex === null) triggerRefs.current[(index - 1 + menus.length) % menus.length]?.focus();
        else openMenu(index - 1, "first");
        break;
      case "Escape":
        close(true);
        break;
    }
  }

  function onMenuKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (openIndex === null) return;
    const items = menuItems();
    const current = items.indexOf(document.activeElement as HTMLElement);
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        items[(current + 1) % items.length]?.focus();
        break;
      case "ArrowUp":
        event.preventDefault();
        items[(current - 1 + items.length) % items.length]?.focus();
        break;
      case "Enter":
      case " ":
        // Handled here rather than left to the button's default activation,
        // which some browsers fire on keypress/keyup instead.
        event.preventDefault();
        items[current]?.click();
        break;
      case "Home":
        event.preventDefault();
        items[0]?.focus();
        break;
      case "End":
        event.preventDefault();
        items[items.length - 1]?.focus();
        break;
      case "ArrowRight":
        event.preventDefault();
        openMenu(openIndex + 1, "first");
        break;
      case "ArrowLeft":
        event.preventDefault();
        openMenu(openIndex - 1, "first");
        break;
      case "Escape":
        event.preventDefault();
        close(true);
        break;
      case "Tab":
        setOpenIndex(null);
        break;
    }
  }

  function select(entry: MenuEntry) {
    if (entry.kind !== "item" && entry.kind !== "check") return;
    if (entry.kind === "item" && entry.disabled) return;
    setOpenIndex(null);
    entry.onSelect();
  }

  return (
    <div
      ref={barRef}
      className="sticky top-0 z-40 hidden h-10 items-center gap-1 border-b pl-3 pr-14 lg:flex"
      style={{ background: "var(--app-surface)", borderColor: "var(--app-border)" }}
    >
      {/* Logo only — the placeholder until the final mark lands. */}
      <Link
        href="/app"
        aria-label="Arcadia — go to Today"
        title="Arcadia"
        className="mr-1.5 grid h-7 w-7 place-items-center rounded-md ui-hover"
      >
        <span
          aria-hidden="true"
          className="grid h-5 w-5 place-items-center rounded-[5px]"
          style={{ background: "var(--app-accent)", color: "var(--app-accent-on)" }}
        >
          <Logo size={11} />
        </span>
      </Link>

      <div role="menubar" aria-label="Application" className="flex items-center gap-0.5">
        {menus.map((menu, index) => {
          const open = openIndex === index;
          return (
            <div key={menu.label} className="relative">
              <button
                ref={(node) => {
                  triggerRefs.current[index] = node;
                }}
                type="button"
                role="menuitem"
                aria-haspopup="menu"
                aria-expanded={open}
                tabIndex={index === 0 ? 0 : -1}
                onClick={() => (open ? setOpenIndex(null) : openMenu(index, null))}
                onPointerEnter={() => {
                  if (openIndex !== null && !open) openMenu(index, null);
                }}
                onKeyDown={(event) => onTriggerKeyDown(event, index)}
                className={
                  "h-7 rounded-md px-2.5 text-[13px] transition-colors duration-100 " +
                  (open
                    ? "bg-[color-mix(in_oklab,var(--app-text)_8%,transparent)] text-[var(--app-text)]"
                    : "text-[var(--app-text-soft)] hover:bg-[color-mix(in_oklab,var(--app-text)_6%,transparent)] hover:text-[var(--app-text)]")
                }
              >
                {menu.label}
              </button>

              {open ? (
                <div
                  ref={menuRef}
                  role="menu"
                  aria-label={menu.label}
                  onKeyDown={onMenuKeyDown}
                  className="absolute left-0 top-full z-50 mt-1 min-w-[248px] rounded-lg p-1"
                  style={{ background: "var(--app-elev)", boxShadow: "var(--elev-2)" }}
                >
                  {menu.entries.map((entry, i) => (
                    <MenuRow key={i} entry={entry} onSelect={() => select(entry)} />
                  ))}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function MenuRow({ entry, onSelect }: { entry: MenuEntry; onSelect: () => void }) {
  if (entry.kind === "separator") {
    return <div role="separator" className="mx-1 my-1 h-px" style={{ background: "var(--app-border)" }} />;
  }
  if (entry.kind === "label") {
    return (
      <div className="px-2 pb-1 pt-1.5 text-[11.5px] font-medium" style={{ color: "var(--app-text-faint)" }}>
        {entry.label}
      </div>
    );
  }
  const checkable = entry.kind === "check";
  return (
    <button
      type="button"
      role={checkable ? "menuitemcheckbox" : "menuitem"}
      aria-checked={checkable ? entry.checked : undefined}
      tabIndex={-1}
      aria-disabled={entry.kind === "item" && entry.disabled ? true : undefined}
      onClick={onSelect}
      className="flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-[13px] outline-none hover:bg-[var(--app-accent-soft)] focus:bg-[var(--app-accent-soft)] aria-disabled:cursor-default aria-disabled:opacity-45 aria-disabled:hover:bg-transparent"
      style={{ color: "var(--app-text)" }}
    >
      <span aria-hidden="true" className="grid w-4 shrink-0 place-items-center" style={{ color: "var(--app-accent-strong)" }}>
        {checkable && entry.checked ? (
          <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 8.5l3 3 7-7" />
          </svg>
        ) : null}
      </span>
      <span className="flex-1 truncate">{entry.label}</span>
      {entry.shortcut ? <Kbd keys={entry.shortcut} /> : null}
    </button>
  );
}
