"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from "react";
import { api } from "@/lib/api/client";
import type { Deck } from "@/lib/api/cards";
import type { Sheet } from "@/lib/api/sheets";
import { dateKey, formatClock, formatDueSoon } from "@/lib/api/time";
import { useDashboardData } from "@/lib/app/DashboardProvider";
import { GO_TARGETS, openArcad } from "@/lib/app/commands";
import Kbd from "./Kbd";

interface SearchDialogProps {
  open: boolean;
  onClose: () => void;
  onNewTask: () => void;
  onShowShortcuts: () => void;
}

interface Result {
  id: string;
  group: string;
  label: string;
  detail?: string;
  /** Extra words that should match but aren't shown. */
  keywords?: string;
  icon: ReactNode;
  run: () => void;
}

/** Most results a data group shows, so one big group can't bury the rest. */
const GROUP_LIMIT = 6;

/**
 * Search everything: pages, quick actions, deadlines, study blocks, subjects,
 * card decks and summary sheets. Opened from the sidebar, Ctrl/⌘ K or `/`.
 */
export default function SearchDialog({ open, onClose, onNewTask, onShowShortcuts }: SearchDialogProps) {
  if (!open) return null;
  return <SearchPanel onClose={onClose} onNewTask={onNewTask} onShowShortcuts={onShowShortcuts} />;
}

function SearchPanel({ onClose, onNewTask, onShowShortcuts }: Omit<SearchDialogProps, "open">) {
  const router = useRouter();
  const { data } = useDashboardData();
  const timezone = data.profile?.timezone || data.user.timezone || "Australia/Brisbane";
  const [query, setQuery] = useState("");
  // Fixed when search opens; blocks ending while it is open can still show.
  const [now] = useState(() => Date.now());
  const [active, setActive] = useState(0);
  const [decks, setDecks] = useState<Deck[]>([]);
  const [sheets, setSheets] = useState<Sheet[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Decks and sheets aren't in the dashboard payload; fetch them each time
  // search opens so new ones show up. Search works without them.
  useEffect(() => {
    let live = true;
    api<{ decks: Deck[] }>("/api/decks")
      .then((response) => live && setDecks(response.decks || []))
      .catch(() => undefined);
    api<{ sheets: Sheet[] }>("/api/sheets")
      .then((response) => live && setSheets(response.sheets || []))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    inputRef.current?.focus();
    return () => previous?.focus?.();
  }, []);

  const subjectName = useMemo(() => {
    const map = new Map<string, string>();
    for (const subject of data.subjects) map.set(subject.id, subject.name);
    return map;
  }, [data.subjects]);

  const results = useMemo(() => {
    const go = (href: string) => () => router.push(href);
    const pages: Result[] = GO_TARGETS.map((target) => ({
      id: `page:${target.href}`,
      group: "Pages",
      label: target.label,
      icon: ICONS.page,
      run: go(target.href),
    }));
    const actions: Result[] = [
      { id: "action:task", group: "Actions", label: "New task", keywords: "add deadline assignment", icon: ICONS.plus, run: onNewTask },
      { id: "action:focus", group: "Actions", label: "Start a focus session", keywords: "timer pomodoro study", icon: ICONS.focus, run: go("/app/focus") },
      { id: "action:arcad", group: "Actions", label: "Ask Arcad", keywords: "chat help ai", icon: ICONS.chat, run: () => openArcad() },
      { id: "action:deck", group: "Actions", label: "New card deck", keywords: "flashcards", icon: ICONS.plus, run: go("/app/cards?new=1") },
      { id: "action:sheet", group: "Actions", label: "New summary sheet", keywords: "notes", icon: ICONS.plus, run: go("/app/sheets?new=1") },
      { id: "action:shortcuts", group: "Actions", label: "Keyboard shortcuts", keywords: "keys help", icon: ICONS.keys, run: onShowShortcuts },
    ];

    const q = query.trim().toLowerCase();
    if (!q) return [...actions.slice(0, 3), ...pages];

    const deadlines: Result[] = data.tasks
      .filter((task) => task.status === "pending")
      .sort((a, b) => Date.parse(a.dueAt) - Date.parse(b.dueAt))
      .map((task) => ({
        id: `task:${task.id}`,
        group: "Deadlines",
        label: task.title,
        detail: [task.subject, formatDueSoon(task.dueAt, timezone)].filter(Boolean).join(" · "),
        keywords: task.subject ?? "",
        icon: ICONS.deadline,
        run: go(`/app/deadlines?task=${encodeURIComponent(task.id)}`),
      }));
    const blocks: Result[] = data.events
      .filter(
        (event) =>
          event.category === "study" && event.status !== "cancelled" && Date.parse(event.endAt) > now,
      )
      .sort((a, b) => Date.parse(a.startAt) - Date.parse(b.startAt))
      .map((event) => ({
        id: `event:${event.id}`,
        group: "Study blocks",
        label: event.title,
        detail: [
          event.subject,
          `${shortDay(event.startAt, timezone)} ${formatClock(event.startAt, timezone)}`,
        ]
          .filter(Boolean)
          .join(" · "),
        keywords: event.subject ?? "",
        icon: ICONS.focus,
        run: go(`/app/focus?eventId=${encodeURIComponent(event.id)}`),
      }));
    const subjects: Result[] = data.subjects.map((subject) => ({
      id: `subject:${subject.id}`,
      group: "Subjects",
      label: subject.name,
      detail: subject.targetGrade ? `Aiming for ${subject.targetGrade}` : undefined,
      icon: ICONS.subject,
      run: go("/app/profile#subjects"),
    }));
    const deckResults: Result[] = decks.map((deck) => {
      const subject = deck.subjectId ? subjectName.get(deck.subjectId) : undefined;
      return {
        id: `deck:${deck.id}`,
        group: "Card decks",
        label: deck.title,
        detail: [subject, `${deck.cardCount} card${deck.cardCount === 1 ? "" : "s"}`].filter(Boolean).join(" · "),
        keywords: [subject, deck.topic?.title].filter(Boolean).join(" "),
        icon: ICONS.cards,
        run: go(`/app/cards/${encodeURIComponent(deck.id)}`),
      };
    });
    const sheetResults: Result[] = sheets.map((sheet) => {
      const subject = sheet.subjectId ? subjectName.get(sheet.subjectId) : undefined;
      return {
        id: `sheet:${sheet.id}`,
        group: "Summary sheets",
        label: sheet.title,
        detail: [subject, sheet.topic?.title].filter(Boolean).join(" · ") || undefined,
        keywords: [subject, sheet.topic?.title].filter(Boolean).join(" "),
        icon: ICONS.sheet,
        run: go(`/app/sheets/${encodeURIComponent(sheet.id)}`),
      };
    });

    const groups = [pages, actions, deadlines, blocks, subjects, deckResults, sheetResults];
    return groups.flatMap((group) =>
      group
        .map((result) => ({ result, score: score(result, q) }))
        .filter((entry) => entry.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, GROUP_LIMIT)
        .map((entry) => entry.result),
    );
  }, [query, data.tasks, data.events, data.subjects, decks, sheets, subjectName, timezone, now, router, onNewTask, onShowShortcuts]);

  const activeIndex = Math.min(active, Math.max(0, results.length - 1));

  useEffect(() => {
    listRef.current
      ?.querySelector<HTMLElement>(`[data-index="${activeIndex}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  function choose(result: Result | undefined) {
    if (!result) return;
    onClose();
    result.run();
  }

  function onKeyDown(event: ReactKeyboardEvent) {
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        setActive(results.length ? (activeIndex + 1) % results.length : 0);
        break;
      case "ArrowUp":
        event.preventDefault();
        setActive(results.length ? (activeIndex - 1 + results.length) % results.length : 0);
        break;
      case "Enter":
        event.preventDefault();
        choose(results[activeIndex]);
        break;
      case "Escape":
        event.preventDefault();
        onClose();
        break;
    }
  }

  const activeId = results[activeIndex] ? `search-${results[activeIndex].id}` : undefined;

  return (
    <div className="fixed inset-0 z-[80] flex items-start justify-center px-4 pt-[12vh]">
      <button
        type="button"
        aria-label="Close search"
        tabIndex={-1}
        onClick={onClose}
        className="absolute inset-0 cursor-default"
        style={{ background: "rgba(var(--shadow-rgb), 0.35)" }}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Search Arcadia"
        data-search=""
        onKeyDown={onKeyDown}
        className="relative flex max-h-[min(560px,72vh)] w-full max-w-[600px] flex-col overflow-hidden rounded-xl"
        style={{ background: "var(--app-elev)", boxShadow: "var(--elev-3)", animation: "app-pop 140ms ease-out" }}
      >
        <div className="flex items-center gap-2.5 border-b px-4" style={{ borderColor: "var(--app-border)" }}>
          <span aria-hidden="true" style={{ color: "var(--app-text-muted)" }}>{ICONS.search}</span>
          <input
            ref={inputRef}
            type="text"
            role="combobox"
            aria-expanded="true"
            aria-controls="search-results"
            aria-activedescendant={activeId}
            aria-autocomplete="list"
            autoComplete="off"
            spellCheck={false}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setActive(0);
            }}
            placeholder="Search deadlines, subjects, decks, pages…"
            className="h-12 flex-1 bg-transparent text-[15px] outline-none"
            style={{ color: "var(--app-text)" }}
          />
          <Kbd keys={["Esc"]} />
        </div>

        <div ref={listRef} id="search-results" role="listbox" aria-label="Results" className="flex-1 overflow-y-auto p-1.5">
          {results.length === 0 ? (
            <p className="px-3 py-8 text-center text-[13px]" style={{ color: "var(--app-text-muted)" }}>
              Nothing matches &ldquo;{query.trim()}&rdquo;.
            </p>
          ) : (
            results.map((result, index) => {
              const showHeading = index === 0 || results[index - 1].group !== result.group;
              const selected = index === activeIndex;
              return (
                <div key={result.id}>
                  {showHeading ? (
                    <p
                      role="presentation"
                      className="px-2.5 pb-1 pt-2.5 text-[11px] font-medium"
                      style={{ color: "var(--app-text-faint)" }}
                    >
                      {query.trim() || result.group !== "Actions" ? result.group : "Quick actions"}
                    </p>
                  ) : null}
                  <div
                    id={`search-${result.id}`}
                    role="option"
                    aria-selected={selected}
                    data-index={index}
                    onPointerMove={() => {
                      if (!selected) setActive(index);
                    }}
                    onClick={() => choose(result)}
                    className="flex h-10 cursor-pointer items-center gap-3 rounded-md px-2.5"
                    style={{ background: selected ? "color-mix(in oklab, var(--app-text) 8%, transparent)" : undefined }}
                  >
                    <span
                      aria-hidden="true"
                      className="grid h-6 w-6 shrink-0 place-items-center"
                      style={{ color: selected ? "var(--app-accent)" : "var(--app-text-muted)" }}
                    >
                      {result.icon}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[13.5px]" style={{ color: "var(--app-text)" }}>
                      {result.label}
                    </span>
                    {result.detail ? (
                      <span className="max-w-[45%] shrink-0 truncate text-[12px]" style={{ color: "var(--app-text-muted)" }}>
                        {result.detail}
                      </span>
                    ) : null}
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div
          className="hidden items-center gap-4 border-t px-4 py-2 text-[11.5px] sm:flex"
          style={{ borderColor: "var(--app-border)", color: "var(--app-text-faint)" }}
        >
          <span className="flex items-center gap-1.5"><Kbd keys={["↑"]} /><Kbd keys={["↓"]} /> to move</span>
          <span className="flex items-center gap-1.5"><Kbd keys={["↵"]} /> to open</span>
        </div>
      </div>
    </div>
  );
}

const noSubscribe = () => () => {};
const readModKey = () => (/Mac|iPhone|iPad/.test(navigator.platform) ? "⌘" : "Ctrl");

/** The modifier for Ctrl/⌘ K on this device, for keycaps. */
export function useModKey(): string {
  return useSyncExternalStore(noSubscribe, readModKey, () => "Ctrl");
}

/** Word-start matches beat matches mid-word; a label match beats a keyword. */
function score(result: Result, q: string): number {
  const label = result.label.toLowerCase();
  if (label === q) return 100;
  if (label.startsWith(q)) return 80;
  if (label.split(/[\s\-/]+/).some((word) => word.startsWith(q))) return 60;
  if (label.includes(q)) return 40;
  const rest = `${result.detail ?? ""} ${result.keywords ?? ""}`.toLowerCase();
  if (rest.includes(q)) return 20;
  // Every word of a multi-word query somewhere in the result.
  const words = q.split(/\s+/).filter(Boolean);
  if (words.length > 1 && words.every((word) => `${label} ${rest}`.includes(word))) return 10;
  return 0;
}

/** "Today", "Tomorrow" or "Mon 28 Sep". */
function shortDay(iso: string, timezone: string): string {
  const now = Date.now();
  const key = dateKey(iso, timezone);
  if (key === dateKey(new Date(now).toISOString(), timezone)) return "Today";
  if (key === dateKey(new Date(now + 86_400_000).toISOString(), timezone)) return "Tomorrow";
  return new Intl.DateTimeFormat("en-AU", { timeZone: timezone, weekday: "short", day: "numeric", month: "short" }).format(
    new Date(iso),
  );
}

function glyph(path: ReactNode) {
  return (
    <svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      {path}
    </svg>
  );
}

export const SEARCH_ICON = glyph(<><circle cx="9" cy="9" r="5.5" /><path d="M13.2 13.2L17 17" /></>);

const ICONS = {
  search: SEARCH_ICON,
  page: glyph(<><path d="M7 4l6 6-6 6" /></>),
  plus: glyph(<path d="M10 4v12M4 10h12" />),
  focus: glyph(<><circle cx="10" cy="10" r="7" /><circle cx="10" cy="10" r="3" /></>),
  chat: glyph(<path d="M4 5h12v9H8l-4 3V5z" />),
  keys: glyph(<><rect x="2.5" y="5" width="15" height="10" rx="1.5" /><path d="M5.5 8h1M9.5 8h1M13.5 8h1M6 12h8" /></>),
  deadline: glyph(<><circle cx="10" cy="10" r="7" /><path d="M10 6v4l3 2" /></>),
  subject: glyph(<><path d="M4 4.5A1.5 1.5 0 0 1 5.5 3H15v12H5.5A1.5 1.5 0 0 0 4 16.5v-12z" /><path d="M4 16.5A1.5 1.5 0 0 0 5.5 18H15v-3" /></>),
  cards: glyph(<><rect x="3" y="6" width="11" height="10" rx="1.5" /><path d="M6 6V4.5A1.5 1.5 0 0 1 7.5 3h8A1.5 1.5 0 0 1 17 4.5v7a1.5 1.5 0 0 1-1.5 1.5H14" /></>),
  sheet: glyph(<><rect x="4" y="2.5" width="12" height="15" rx="1.5" /><path d="M7 6.5h6M7 9.5h6M7 12.5h3.5" /></>),
};
