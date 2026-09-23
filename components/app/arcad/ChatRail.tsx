"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Conversation } from "./types";

/**
 * The left column of the Arcad page: start a new chat, open the month plan,
 * and every past chat grouped by when it last moved, each one renameable
 * and deletable from its "…" menu.
 */
export default function ChatRail({
  conversations,
  activeId,
  view,
  onNewChat,
  onOpenMonth,
  onSelect,
  onRename,
  onDelete,
}: {
  conversations: Conversation[];
  activeId: string | null;
  view: "chat" | "month";
  onNewChat: () => void;
  onOpenMonth: () => void;
  onSelect: (id: string) => void;
  onRename: (id: string, title: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const [query, setQuery] = useState("");
  const groups = useMemo(() => groupByAge(conversations, query), [conversations, query]);

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-col gap-0.5 p-2">
        <RailButton
          active={view === "chat" && activeId === null}
          onClick={onNewChat}
          icon={<path d="M14.5 3.5l2 2-8 8H6.5v-2l8-8zM9 4H5a1.5 1.5 0 00-1.5 1.5v9A1.5 1.5 0 005 16h9a1.5 1.5 0 001.5-1.5V11" />}
        >
          New chat
        </RailButton>
        <RailButton
          active={view === "month"}
          onClick={onOpenMonth}
          icon={<path d="M4 6.5A1.5 1.5 0 015.5 5h9A1.5 1.5 0 0116 6.5v8a1.5 1.5 0 01-1.5 1.5h-9A1.5 1.5 0 014 14.5v-8zM4 8.5h12M7.5 3.5v3M12.5 3.5v3" />}
        >
          Your month
        </RailButton>
      </div>

      {conversations.length > 6 ? (
        <div className="px-3 pb-1">
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search chats"
            aria-label="Search chats"
            className="h-8 w-full rounded-md bg-transparent px-2.5 text-[13px] outline-none placeholder:text-[var(--app-text-faint)]"
            style={{ color: "var(--app-text)", boxShadow: "inset 0 0 0 1px var(--app-border)" }}
          />
        </div>
      ) : null}

      <nav className="min-h-0 flex-1 overflow-y-auto px-2 pb-3" aria-label="Past chats">
        {conversations.length === 0 ? (
          <p className="px-2.5 pt-3 text-[12.5px] leading-snug" style={{ color: "var(--app-text-faint)" }}>
            Your chats with Arcad will show up here.
          </p>
        ) : groups.length === 0 ? (
          <p className="px-2.5 pt-3 text-[12.5px]" style={{ color: "var(--app-text-faint)" }}>
            No chats match.
          </p>
        ) : (
          groups.map((group) => (
            <div key={group.label} className="pt-3">
              <p className="px-2.5 pb-1 text-[11.5px] font-medium" style={{ color: "var(--app-text-muted)" }}>
                {group.label}
              </p>
              <ul className="flex flex-col gap-px">
                {group.items.map((conversation) => (
                  <ConversationRow
                    key={conversation.id}
                    conversation={conversation}
                    active={view === "chat" && conversation.id === activeId}
                    onSelect={() => onSelect(conversation.id)}
                    onRename={(title) => onRename(conversation.id, title)}
                    onDelete={() => onDelete(conversation.id)}
                  />
                ))}
              </ul>
            </div>
          ))
        )}
      </nav>

      <div className="border-t p-2" style={{ borderColor: "var(--app-border)" }}>
        <Link
          href="/app/profile#arcad"
          className="flex items-center gap-2.5 rounded-md px-2.5 py-2 text-[13px] ui-hover"
          style={{ color: "var(--app-text-soft)" }}
        >
          <svg viewBox="0 0 20 20" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M10 3.5l1.6 4.9h5.1l-4.1 3 1.6 4.9-4.2-3-4.2 3 1.6-4.9-4.1-3h5.1L10 3.5z" />
          </svg>
          What Arcad remembers
        </Link>
      </div>
    </div>
  );
}

function RailButton({
  active,
  onClick,
  icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className="flex h-9 items-center gap-2.5 rounded-md px-2.5 text-left text-[13.5px] font-medium ui-hover"
      style={{
        color: "var(--app-text)",
        background: active ? "color-mix(in oklab, var(--app-text) 8%, transparent)" : undefined,
      }}
    >
      <svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--app-text-soft)" }} aria-hidden="true">
        {icon}
      </svg>
      {children}
    </button>
  );
}

function ConversationRow({
  conversation,
  active,
  onSelect,
  onRename,
  onDelete,
}: {
  conversation: Conversation;
  active: boolean;
  onSelect: () => void;
  onRename: (title: string) => Promise<void>;
  onDelete: () => Promise<void>;
}) {
  const [mode, setMode] = useState<"idle" | "menu" | "rename" | "confirm">("idle");
  const [draft, setDraft] = useState(conversation.title ?? "");
  const rowRef = useRef<HTMLLIElement>(null);
  const title = conversation.title || "New chat";

  useEffect(() => {
    if (mode !== "menu") return;
    const onDown = (event: MouseEvent) => {
      if (!rowRef.current?.contains(event.target as Node)) setMode("idle");
    };
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && setMode("idle");
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [mode]);

  if (mode === "rename") {
    return (
      <li ref={rowRef}>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            const next = draft.trim();
            setMode("idle");
            if (next && next !== conversation.title) void onRename(next);
          }}
        >
          <input
            autoFocus
            value={draft}
            maxLength={80}
            onChange={(event) => setDraft(event.target.value)}
            onBlur={(event) => event.currentTarget.form?.requestSubmit()}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                setDraft(conversation.title ?? "");
                setMode("idle");
              }
            }}
            aria-label="Chat name"
            className="h-9 w-full rounded-md bg-transparent px-2.5 text-[13.5px] outline-none"
            style={{ color: "var(--app-text)", boxShadow: "inset 0 0 0 1px var(--app-border-strong)" }}
          />
        </form>
      </li>
    );
  }

  if (mode === "confirm") {
    return (
      <li ref={rowRef} className="rounded-md px-2.5 py-2" style={{ background: "color-mix(in oklab, var(--app-danger) 8%, transparent)" }}>
        <p className="truncate text-[12.5px]" style={{ color: "var(--app-text)" }}>
          Delete “{title}”?
        </p>
        <div className="mt-1.5 flex gap-3 text-[12.5px] font-medium">
          <button type="button" autoFocus onClick={() => void onDelete()} style={{ color: "var(--app-danger)" }} className="hover:underline">
            Delete
          </button>
          <button type="button" onClick={() => setMode("idle")} style={{ color: "var(--app-text-muted)" }} className="hover:underline">
            Cancel
          </button>
        </div>
      </li>
    );
  }

  return (
    <li ref={rowRef} className="group relative">
      <button
        type="button"
        onClick={onSelect}
        aria-current={active ? "page" : undefined}
        className="flex h-9 w-full items-center rounded-md pl-2.5 pr-9 text-left text-[13.5px] ui-hover"
        style={{
          color: active ? "var(--app-text)" : "var(--app-text-soft)",
          background: active ? "color-mix(in oklab, var(--app-text) 8%, transparent)" : undefined,
          fontWeight: active ? 500 : 400,
        }}
        title={title}
      >
        <span className="truncate">{title}</span>
      </button>
      <button
        type="button"
        onClick={() => setMode((m) => (m === "menu" ? "idle" : "menu"))}
        aria-label={`Options for ${title}`}
        aria-haspopup="menu"
        aria-expanded={mode === "menu"}
        className={`absolute right-1 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-md ui-hover ${
          mode === "menu" || active ? "opacity-100" : "opacity-100 lg:opacity-0 lg:group-hover:opacity-100 lg:focus-visible:opacity-100"
        }`}
        style={{ color: "var(--app-text-muted)" }}
      >
        <svg viewBox="0 0 20 20" width="14" height="14" fill="currentColor" aria-hidden="true">
          <circle cx="5" cy="10" r="1.4" />
          <circle cx="10" cy="10" r="1.4" />
          <circle cx="15" cy="10" r="1.4" />
        </svg>
      </button>
      {mode === "menu" ? (
        <div
          role="menu"
          className="absolute right-1 top-[calc(100%+2px)] z-20 w-[150px] rounded-md p-1"
          style={{ background: "var(--app-surface)", boxShadow: "0 0 0 1px var(--app-border), 0 10px 28px rgba(var(--shadow-rgb),0.18)" }}
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setDraft(conversation.title ?? "");
              setMode("rename");
            }}
            className="flex w-full items-center rounded-[4px] px-2.5 py-1.5 text-left text-[13px] ui-hover"
            style={{ color: "var(--app-text)" }}
          >
            Rename
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => setMode("confirm")}
            className="flex w-full items-center rounded-[4px] px-2.5 py-1.5 text-left text-[13px] ui-hover"
            style={{ color: "var(--app-danger)" }}
          >
            Delete
          </button>
        </div>
      ) : null}
    </li>
  );
}

function groupByAge(conversations: Conversation[], query: string) {
  const q = query.trim().toLowerCase();
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const day = 86_400_000;
  const buckets: Array<{ label: string; test: (ms: number) => boolean; items: Conversation[] }> = [
    { label: "Today", test: (ms) => ms >= startOfToday, items: [] },
    { label: "Yesterday", test: (ms) => ms >= startOfToday - day, items: [] },
    { label: "Last 7 days", test: (ms) => ms >= startOfToday - 7 * day, items: [] },
    { label: "Last 30 days", test: (ms) => ms >= startOfToday - 30 * day, items: [] },
    { label: "Older", test: () => true, items: [] },
  ];
  for (const conversation of conversations) {
    if (q && !(conversation.title ?? "").toLowerCase().includes(q)) continue;
    const ms = Date.parse(conversation.updatedAt);
    buckets.find((bucket) => bucket.test(ms))!.items.push(conversation);
  }
  return buckets.filter((bucket) => bucket.items.length > 0);
}
