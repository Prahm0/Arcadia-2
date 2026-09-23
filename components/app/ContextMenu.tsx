"use client";

import { usePathname } from "next/navigation";
import { useEffect, useLayoutEffect, useRef, useSyncExternalStore, type MouseEvent as ReactMouseEvent } from "react";
import { isTypingTarget } from "@/lib/app/commands";
import { MenuRow, menuItems, moveInMenu, type MenuEntry } from "./Menu";

/**
 * Right-click menus. A row passes what can be done to it, the same things
 * its sheet or buttons offer, to showContextMenu from its onContextMenu; the
 * one host in the app shell draws it. Shift+F10 and the menu key open it too.
 *
 * The browser keeps its own menu in text fields, over selected text and with
 * Shift held, so paste, copy and spellcheck still work.
 */

/** Entries can be left out inline: `done && { kind: "item", … }`. */
export type ContextMenuEntry = MenuEntry | false | null | undefined;

interface OpenMenu {
  id: number;
  x: number;
  y: number;
  label?: string;
  entries: MenuEntry[];
  /** Opened from the keyboard: focus starts on the first row. */
  keyboard: boolean;
  /** Where focus goes back to when the menu is dismissed from the keyboard. */
  returnFocus: HTMLElement | null;
}

interface Notice {
  id: number;
  text: string;
  x: number;
  y: number;
}

let openMenu: OpenMenu | null = null;
let notice: Notice | null = null;
let hosts = 0;
let serial = 0;
let lastPointerAt = 0;
let lastAt = { x: 0, y: 0 };
let noticeTimer: number | undefined;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function showContextMenu(event: ReactMouseEvent, entries: ContextMenuEntry[], label?: string): void {
  // An inner row already claimed it, there's no host, or the browser's menu is wanted.
  if (event.defaultPrevented || hosts === 0 || event.shiftKey || wantsNativeMenu(event.target)) return;
  const tidy = tidyEntries(entries);
  if (!tidy.some((entry) => entry.kind === "item" || entry.kind === "check")) return;
  event.preventDefault();

  // A pointer opens it where it was pressed; the keyboard opens it on the row.
  const keyboard = Date.now() - lastPointerAt > 1000;
  let x = event.clientX;
  let y = event.clientY;
  if (keyboard || (x === 0 && y === 0)) {
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    x = rect.left + Math.min(12, rect.width / 2);
    y = Math.min(rect.bottom, rect.top + 36);
  }
  lastAt = { x, y };
  const active = document.activeElement;
  openMenu = {
    id: ++serial,
    x,
    y,
    label,
    entries: tidy,
    keyboard,
    returnFocus: active instanceof HTMLElement ? active : null,
  };
  emit();
}

export function closeContextMenu(refocus = false): void {
  if (!openMenu) return;
  const target = openMenu.returnFocus;
  openMenu = null;
  emit();
  if (refocus && target?.isConnected) target.focus();
}

/** A short word by the pointer after a menu action, like "Link copied". */
export function flashMenuNotice(text: string): void {
  notice = { id: ++serial, text, ...lastAt };
  emit();
  window.clearTimeout(noticeTimer);
  noticeTimer = window.setTimeout(() => {
    notice = null;
    emit();
  }, 1600);
}

export async function copyText(text: string, confirmation = "Copied"): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    flashMenuNotice(confirmation);
  } catch {
    flashMenuNotice("Couldn't copy that");
  }
}

/** Open in new tab and Copy link, for rows that are links. */
export function linkEntries(href: string): MenuEntry[] {
  return [
    { kind: "item", label: "Open in new tab", onSelect: () => window.open(href, "_blank", "noopener") },
    { kind: "item", label: "Copy link", onSelect: () => void copyText(new URL(href, window.location.origin).href, "Link copied") },
  ];
}

function wantsNativeMenu(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return true;
  const field = target.closest("input, textarea, select, [contenteditable]");
  if (field && isTypingTarget(field)) return true;
  const selection = window.getSelection();
  return Boolean(selection && !selection.isCollapsed && selection.toString().trim() && selection.containsNode(target, true));
}

/** Drops left-out entries and any separator at an end or next to another. */
function tidyEntries(entries: ContextMenuEntry[]): MenuEntry[] {
  const kept: MenuEntry[] = [];
  for (const entry of entries) {
    if (!entry) continue;
    if (entry.kind === "separator" && (kept.length === 0 || kept[kept.length - 1].kind === "separator")) continue;
    kept.push(entry);
  }
  while (kept.length && kept[kept.length - 1].kind === "separator") kept.pop();
  return kept;
}

const MARGIN = 8;

export default function ContextMenuHost() {
  const menu = useSyncExternalStore(subscribe, () => openMenu, () => null);
  const flash = useSyncExternalStore(subscribe, () => notice, () => null);
  const pathname = usePathname();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    hosts += 1;
    // Presses are tracked all the time, to tell a right-click from Shift+F10.
    const onPointer = (event: PointerEvent) => {
      lastPointerAt = Date.now();
      if (event.type === "pointerdown" && openMenu && !(event.target instanceof Node && ref.current?.contains(event.target))) {
        closeContextMenu();
      }
    };
    document.addEventListener("pointerdown", onPointer, true);
    document.addEventListener("pointerup", onPointer, true);
    return () => {
      hosts -= 1;
      document.removeEventListener("pointerdown", onPointer, true);
      document.removeEventListener("pointerup", onPointer, true);
      closeContextMenu();
    };
  }, []);

  useEffect(() => {
    closeContextMenu();
  }, [pathname]);

  useEffect(() => {
    if (!menu) return;
    const close = () => closeContextMenu();
    const inside = (target: EventTarget | null) => target instanceof Node && Boolean(ref.current?.contains(target));
    const onScroll = (event: Event) => {
      if (!inside(event.target)) close();
    };
    // Escape from inside the menu is handled by the menu itself.
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !inside(event.target)) closeContextMenu(true);
    };
    window.addEventListener("resize", close);
    window.addEventListener("blur", close);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("resize", close);
      window.removeEventListener("blur", close);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [menu]);

  // Keep it on screen: flip left or up from the pointer, like a native menu.
  useLayoutEffect(() => {
    const node = ref.current;
    if (!menu || !node) return;
    const { offsetWidth: width, offsetHeight: height } = node;
    let left = menu.x;
    let top = menu.y;
    if (left + width > window.innerWidth - MARGIN) left = Math.max(MARGIN, menu.x - width);
    if (top + height > window.innerHeight - MARGIN) {
      top = menu.y - height >= MARGIN ? menu.y - height : Math.max(MARGIN, window.innerHeight - MARGIN - height);
    }
    node.style.left = `${left}px`;
    node.style.top = `${top}px`;
    node.style.visibility = "visible";
    if (menu.keyboard) menuItems(node)[0]?.focus();
    else node.focus({ preventScroll: true });
  }, [menu]);

  const gutter = Boolean(menu?.entries.some((entry) => entry.kind === "check"));

  return (
    <>
      {menu ? (
        <div
          key={menu.id}
          ref={ref}
          role="menu"
          aria-label={menu.label}
          tabIndex={-1}
          onKeyDown={(event) => {
            if (moveInMenu(event, ref.current)) return;
            if (event.key === "Escape" || event.key === "Tab") {
              event.preventDefault();
              closeContextMenu(true);
            }
          }}
          onContextMenu={(event) => event.preventDefault()}
          className="fixed z-[100] max-h-[calc(100svh-16px)] min-w-[200px] max-w-[288px] overflow-y-auto rounded-lg p-1 outline-none"
          style={{ left: menu.x, top: menu.y, visibility: "hidden", background: "var(--app-elev)", boxShadow: "var(--elev-2)" }}
        >
          {menu.entries.map((entry, index) => (
            <MenuRow
              key={index}
              entry={entry}
              gutter={gutter}
              onSelect={() => {
                if (entry.kind === "item" && entry.disabled) return;
                if (entry.kind !== "item" && entry.kind !== "check") return;
                closeContextMenu(menu.keyboard);
                entry.onSelect();
              }}
            />
          ))}
        </div>
      ) : null}
      <div
        role="status"
        aria-live="polite"
        className="pointer-events-none fixed z-[100] -translate-y-full rounded-md px-2.5 py-1 text-[12.5px] font-medium transition-opacity duration-150"
        style={{
          left: flash?.x ?? 0,
          top: (flash?.y ?? 0) - 6,
          opacity: flash ? 1 : 0,
          background: "var(--app-text)",
          color: "var(--app-bg)",
        }}
      >
        {flash?.text}
      </div>
    </>
  );
}
