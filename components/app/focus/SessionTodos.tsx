"use client";

import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react";
import { cn } from "@/lib/cn";

export interface TodoItem {
  key: string;
  text: string;
  minutes?: number;
  done: boolean;
  /** Arcad's plan steps can be ticked but not deleted; the student's own can. */
  removable: boolean;
}

interface OwnTodo {
  id: string;
  text: string;
  done: boolean;
}

const OWN_KEY = "arcadia:focus:todos:";

function readOwn(scope: string): OwnTodo[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(OWN_KEY + scope) ?? "[]");
    return Array.isArray(parsed)
      ? parsed.filter((item) => item && typeof item.id === "string" && typeof item.text === "string")
      : [];
  } catch {
    return [];
  }
}

function writeOwn(scope: string, items: OwnTodo[]) {
  try {
    if (items.length === 0) window.localStorage.removeItem(OWN_KEY + scope);
    else window.localStorage.setItem(OWN_KEY + scope, JSON.stringify(items));
  } catch {
    /* storage blocked; the list just won't survive a reload */
  }
}

/**
 * The student's own to-dos for one session, kept in this browser. `scope` is
 * the study block's id, or "free" for a timer that isn't tied to one.
 */
export function useOwnTodos(scope: string) {
  const [items, setItems] = useState<OwnTodo[]>([]);
  useEffect(() => {
    // Read after mount: localStorage isn't there on the server render.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setItems(readOwn(scope));
  }, [scope]);

  const update = useCallback(
    (fn: (prev: OwnTodo[]) => OwnTodo[]) => {
      setItems((prev) => {
        const next = fn(prev);
        writeOwn(scope, next);
        return next;
      });
    },
    [scope],
  );

  return {
    items,
    add: (text: string) =>
      update((prev) => [...prev, { id: `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, text, done: false }]),
    toggle: (id: string) => update((prev) => prev.map((item) => (item.id === id ? { ...item, done: !item.done } : item))),
    remove: (id: string) => update((prev) => prev.filter((item) => item.id !== id)),
  };
}

interface SessionTodosProps {
  items: TodoItem[];
  onToggle: (key: string) => void;
  onAdd: (text: string) => void;
  onRemove: (key: string) => void;
  /** Tighter type and a scrolling list, for the pop-out window. */
  compact?: boolean;
  accent?: string;
  className?: string;
}

/**
 * One list for the session: tick a row anywhere on it, type and press Enter to
 * add, arrow keys to move between rows, Delete to drop one of your own. The
 * first unticked row is marked "Next" so there's always an obvious place to be.
 */
export default function SessionTodos({ items, onToggle, onAdd, onRemove, compact, accent = "var(--app-accent)", className }: SessionTodosProps) {
  const [draft, setDraft] = useState("");
  const listRef = useRef<HTMLUListElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const done = items.filter((item) => item.done).length;
  const nextKey = items.find((item) => !item.done)?.key;

  function submit() {
    const text = draft.trim();
    if (!text) return;
    onAdd(text.slice(0, 200));
    setDraft("");
  }

  function focusRow(index: number) {
    const rows = listRef.current?.querySelectorAll<HTMLButtonElement>("[data-todo-row]");
    if (!rows || rows.length === 0) return;
    if (index >= rows.length) {
      inputRef.current?.focus();
      return;
    }
    rows[Math.max(0, index)]?.focus();
  }

  function onRowKey(event: KeyboardEvent<HTMLButtonElement>, index: number, item: TodoItem) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      focusRow(index + 1);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      focusRow(index - 1);
    } else if ((event.key === "Delete" || event.key === "Backspace") && item.removable) {
      event.preventDefault();
      onRemove(item.key);
      // Land on the row that slid into its place.
      requestAnimationFrame(() => focusRow(Math.min(index, items.length - 2)));
    }
  }

  return (
    <div className={cn("flex min-h-0 flex-col", className)}>
      {/* The pop-out already counts ticks in its header, next to the timer's own bar. */}
      {compact || items.length === 0 ? null : (
        <div className="mb-2 flex items-center gap-3">
          <div className="h-1 flex-1 overflow-hidden rounded-full" style={{ background: "var(--app-border)" }}>
            <div
              className="h-full rounded-full transition-[width] duration-500 ease-[var(--ease-out-expo)]"
              style={{ width: items.length ? `${(done / items.length) * 100}%` : "0%", background: accent }}
            />
          </div>
          <span key={done} className="app-pop inline-block shrink-0 text-[12px] tabular-nums" style={{ color: "var(--app-text-muted)" }}>
            {done}/{items.length}
          </span>
        </div>
      )}

      {items.length === 0 ? (
        <p className={cn("mt-1", compact ? "text-[12.5px]" : "text-[13.5px]")} style={{ color: "var(--app-text-muted)" }}>
          Nothing on the list yet. Add what you want done by the end of this session.
        </p>
      ) : (
        <ul ref={listRef} className={cn("flex flex-col gap-0.5", compact && "min-h-0 flex-1 overflow-y-auto pr-0.5")}>
          {items.map((item, index) => {
            const isNext = item.key === nextKey;
            return (
              <li key={item.key} className="app-enter group relative" style={{ "--d": `${Math.min(index, 8) * 30}ms` } as React.CSSProperties}>
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={item.done}
                  data-todo-row
                  onClick={() => onToggle(item.key)}
                  onKeyDown={(event) => onRowKey(event, index, item)}
                  className={cn(
                    "ui-press flex w-full items-start gap-3 rounded-md text-left",
                    compact ? "px-2 py-1.5" : "px-2.5 py-2",
                    item.removable && "pr-8",
                  )}
                  style={{ background: isNext ? "color-mix(in oklab, var(--app-text) 5%, transparent)" : undefined }}
                >
                  <span
                    aria-hidden="true"
                    className="todo-check mt-[1px] grid h-[18px] w-[18px] shrink-0 place-items-center rounded-full"
                    style={{
                      background: item.done ? accent : "transparent",
                      boxShadow: item.done ? "none" : "inset 0 0 0 1.5px var(--app-border-strong)",
                      color: "var(--app-accent-on)",
                    }}
                  >
                    <svg viewBox="0 0 12 12" width="10" height="10" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M2.5 6.2 5 8.5l4.5-5" />
                    </svg>
                  </span>
                  <span className="min-w-0 flex-1">
                    <span
                      className={cn("todo-text block leading-snug", compact ? "text-[13px]" : "text-[14px]")}
                      style={{ color: item.done ? "var(--app-text-muted)" : "var(--app-text)" }}
                    >
                      {item.text}
                    </span>
                    {isNext ? (
                      <span className="mt-0.5 block text-[11px] font-medium" style={{ color: accent }}>
                        Next up
                      </span>
                    ) : null}
                  </span>
                  {item.minutes ? (
                    <span className="mt-[1px] shrink-0 text-[12px] tabular-nums" style={{ color: "var(--app-text-muted)" }}>
                      {item.minutes}m
                    </span>
                  ) : null}
                </button>
                {item.removable ? (
                  <button
                    type="button"
                    onClick={() => onRemove(item.key)}
                    aria-label={`Remove ${item.text}`}
                    className="ui-press absolute right-1 top-1/2 grid h-6 w-6 -translate-y-1/2 place-items-center rounded-md opacity-0 group-hover:opacity-100 focus-visible:opacity-100 hover:bg-[color-mix(in_oklab,var(--app-text)_8%,transparent)]"
                    style={{ color: "var(--app-text-muted)" }}
                  >
                    <svg viewBox="0 0 12 12" width="10" height="10" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
                      <path d="M3 3l6 6M9 3l-6 6" />
                    </svg>
                  </button>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      <form
        className={cn("mt-2 flex items-center gap-2 rounded-md px-2.5", compact ? "py-1" : "py-1.5")}
        style={{ boxShadow: "inset 0 0 0 1px var(--app-border)" }}
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <span aria-hidden="true" className="grid h-[18px] w-[18px] shrink-0 place-items-center" style={{ color: "var(--app-text-muted)" }}>
          <svg viewBox="0 0 12 12" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
            <path d="M6 2v8M2 6h8" />
          </svg>
        </span>
        <input
          ref={inputRef}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "ArrowUp" && !draft) {
              event.preventDefault();
              focusRow(items.length - 1);
            }
          }}
          placeholder="Add a to-do, then Enter"
          aria-label="Add a to-do"
          maxLength={200}
          className={cn("min-w-0 flex-1 bg-transparent py-1 outline-none", compact ? "text-[13px]" : "text-[14px]")}
          style={{ color: "var(--app-text)" }}
        />
        {draft.trim() ? (
          <button
            type="submit"
            className="ui-press app-enter rounded px-2 py-0.5 text-[12px] font-medium"
            style={{ background: accent, color: "var(--app-accent-on)" }}
          >
            Add
          </button>
        ) : null}
      </form>
    </div>
  );
}
