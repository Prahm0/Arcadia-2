"use client";

import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import Kbd from "./Kbd";

/** One row of a menu, in the menu bar or a right-click menu. */
export type MenuEntry =
  | { kind: "item"; label: string; shortcut?: string[]; disabled?: boolean; danger?: boolean; onSelect: () => void }
  | { kind: "check"; label: string; checked: boolean; shortcut?: string[]; onSelect: () => void }
  | { kind: "separator" }
  | { kind: "label"; label: string };

/** The rows the keyboard can land on. */
export function menuItems(root: HTMLElement | null): HTMLElement[] {
  return Array.from(root?.querySelectorAll<HTMLElement>('[role^="menuitem"]:not([aria-disabled="true"])') ?? []);
}

/**
 * Up, Down, Home, End, Enter and Space inside an open menu. Returns false
 * for any other key, so the menu can handle Escape, Tab and the rest itself.
 */
export function moveInMenu(event: ReactKeyboardEvent, root: HTMLElement | null): boolean {
  const items = menuItems(root);
  const current = items.indexOf(document.activeElement as HTMLElement);
  let target: HTMLElement | undefined;
  switch (event.key) {
    case "ArrowDown":
      target = items[(current + 1) % items.length];
      break;
    case "ArrowUp":
      target = items[current <= 0 ? items.length - 1 : current - 1];
      break;
    case "Home":
      target = items[0];
      break;
    case "End":
      target = items[items.length - 1];
      break;
    case "Enter":
    case " ":
      // Handled here rather than left to the button's default activation,
      // which some browsers fire on keypress/keyup instead.
      event.preventDefault();
      items[current]?.click();
      return true;
    default:
      return false;
  }
  event.preventDefault();
  target?.focus();
  return true;
}

export function MenuRow({
  entry,
  onSelect,
  gutter = true,
}: {
  entry: MenuEntry;
  onSelect: () => void;
  /** Room for a tick on the left, so labels line up when any row can be checked. */
  gutter?: boolean;
}) {
  if (entry.kind === "separator") {
    return <div role="separator" className="mx-1 my-1 h-px" style={{ background: "var(--app-border)" }} />;
  }
  if (entry.kind === "label") {
    return (
      <div className="truncate px-2 pb-1 pt-1.5 text-[11.5px] font-medium" style={{ color: "var(--app-text-faint)" }}>
        {entry.label}
      </div>
    );
  }
  const checkable = entry.kind === "check";
  const danger = entry.kind === "item" && entry.danger;
  return (
    <button
      type="button"
      role={checkable ? "menuitemcheckbox" : "menuitem"}
      aria-checked={checkable ? entry.checked : undefined}
      tabIndex={-1}
      aria-disabled={entry.kind === "item" && entry.disabled ? true : undefined}
      onClick={onSelect}
      className={
        "flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-[13px] outline-none aria-disabled:cursor-default aria-disabled:opacity-45 aria-disabled:hover:bg-transparent " +
        (danger
          ? "hover:bg-[color-mix(in_oklab,var(--app-danger)_10%,transparent)] focus:bg-[color-mix(in_oklab,var(--app-danger)_10%,transparent)]"
          : "hover:bg-[var(--app-accent-soft)] focus:bg-[var(--app-accent-soft)]")
      }
      style={{ color: danger ? "var(--app-danger)" : "var(--app-text)" }}
    >
      {gutter ? (
        <span aria-hidden="true" className="grid w-4 shrink-0 place-items-center" style={{ color: "var(--app-accent-strong)" }}>
          {checkable && entry.checked ? (
            <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 8.5l3 3 7-7" />
            </svg>
          ) : null}
        </span>
      ) : null}
      <span className="flex-1 truncate">{entry.label}</span>
      {entry.shortcut ? <Kbd keys={entry.shortcut} /> : null}
    </button>
  );
}
