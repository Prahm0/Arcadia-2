"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { useDashboardData } from "@/lib/app/DashboardProvider";
import { analytics } from "@/lib/analytics/events";
import { useStreak } from "@/lib/app/useStreak";
import { buildContextualStarters, buildGreeting } from "@/lib/app/arcadStarters";
import { OPEN_ARCAD_EVENT } from "@/lib/app/commands";
import { requestDashboardRefresh } from "@/lib/app/useDashboardAutoRefresh";
import { useMediaQuery } from "@/lib/hooks";
import ArcadOrb from "./ArcadOrb";
import MicButton from "./MicButton";

interface SideMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
}

interface ChatResponse {
  conversationId: string | null;
  messages: SideMessage[];
  proposals?: unknown[];
}

/** Wide enough to give both the page and the panel a usable width. */
const DOCK_QUERY = "(min-width: 1280px)";
const OPEN_KEY = "arcadia:arcad-panel";
const WIDTH_KEY = "arcadia:arcad-panel-width";
const MIN_WIDTH = 340;

/**
 * Browser-style Arcad side panel. It keeps the current app view in place,
 * loads the active conversation and streams replies without handing the user
 * off to the full Arcad workspace. On wide screens it docks beside the page,
 * which narrows to make room, and can be dragged wider; below that it slides
 * over the page.
 */
export default function ArcadFloatingButton() {
  const pathname = usePathname();
  const { data, reload } = useDashboardData();
  const docked = useMediaQuery(DOCK_QUERY);
  const streak = useStreak();
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState<SideMessage[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [proposalWaiting, setProposalWaiting] = useState(false);
  const [width, setWidth] = useState<number | null>(readWidthPref);
  const [dragging, setDragging] = useState(false);
  const restored = useRef(false);
  const dockRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const localMessageId = useRef(0);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const starters = useMemo(() => buildContextualStarters(data, streak), [data, streak]);
  const greeting = useMemo(() => buildGreeting(data, streak), [data, streak]);
  const hasUnhandled = useMemo(() => countUnhandled(data) > 0, [data]);

  // Re-subscribes each render so the handler sees current state.
  useEffect(() => {
    if (!mounted) return;
    function onKey(event: KeyboardEvent) {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      // Docked, the page stays in use, so Escape out there belongs to the page.
      if (docked && !panelRef.current?.contains(document.activeElement)) return;
      hidePanel();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // Reopen the docked panel if it was open last visit. Docked only: an
  // overlay reopening by itself would cover the page.
  useEffect(() => {
    if (!docked || restored.current) return;
    restored.current = true;
    if (readOpenPref() && pathname && !pathname.startsWith("/app/arcad")) showPanel({ focus: false });
  });

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, sending]);

  useEffect(
    () => () => {
      if (closeTimer.current) clearTimeout(closeTimer.current);
    },
    [],
  );

  // Help → Ask Arcad in the menu bar. Re-subscribes each render so the
  // handler always sees current state; the listener itself is cheap.
  // (showPanel is a hoisted function declaration below.)
  useEffect(() => {
    const onOpen = () => showPanel();
    window.addEventListener(OPEN_ARCAD_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_ARCAD_EVENT, onOpen);
  });

  if (pathname?.startsWith("/app/arcad")) return null;
  // Hide during onboarding, the floating orb overlaps the Continue
  // button on mobile, and Arcad can't help before there's a plan anyway.
  if (!data.user.onboardingComplete) return null;

  async function loadChat() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/chat", { credentials: "same-origin" });
      if (!response.ok) throw new Error(`Failed (${response.status})`);
      const payload = (await response.json()) as ChatResponse;
      setConversationId(payload.conversationId);
      setMessages(payload.messages || []);
      setProposalWaiting(Boolean(payload.proposals?.length));
      setLoaded(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn’t load Arcad.");
    } finally {
      setLoading(false);
    }
  }

  function showPanel({ focus = true }: { focus?: boolean } = {}) {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    writeOpenPref(true);
    setMounted(true);
    requestAnimationFrame(() => {
      setOpen(true);
      if (focus) inputRef.current?.focus({ preventScroll: true });
    });
    if (!loaded && !loading) void loadChat();
  }

  function hidePanel() {
    writeOpenPref(false);
    setOpen(false);
    closeTimer.current = setTimeout(() => setMounted(false), 300);
  }

  const panelWidth = clampWidth(width ?? defaultWidth());

  function resizeTo(next: number) {
    const clamped = clampWidth(next);
    setWidth(clamped);
    writeWidthPref(clamped);
  }

  function startResize(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    event.preventDefault();
    const right = dockRef.current?.getBoundingClientRect().right ?? window.innerWidth;
    const handle = event.currentTarget;
    handle.setPointerCapture(event.pointerId);
    setDragging(true);
    const move = (moveEvent: PointerEvent) => resizeTo(right - moveEvent.clientX);
    const end = () => {
      setDragging(false);
      handle.removeEventListener("pointermove", move);
      handle.removeEventListener("pointerup", end);
      handle.removeEventListener("pointercancel", end);
    };
    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", end);
    handle.addEventListener("pointercancel", end);
  }

  function resizeWithKeys(event: ReactKeyboardEvent<HTMLDivElement>) {
    const step = event.shiftKey ? 64 : 16;
    if (event.key === "ArrowLeft") resizeTo(panelWidth + step);
    else if (event.key === "ArrowRight") resizeTo(panelWidth - step);
    else if (event.key === "Home") resizeTo(maxWidth());
    else if (event.key === "End") resizeTo(MIN_WIDTH);
    else return;
    event.preventDefault();
  }

  function resetWidth() {
    setWidth(null);
    writeWidthPref(null);
  }

  async function send(text: string) {
    const clean = text.trim();
    if (!clean || sending) return;
    analytics.arcadMessageSent();

    localMessageId.current += 1;
    const optimistic: SideMessage = {
      id: `local-${localMessageId.current}`,
      role: "user",
      content: clean,
      createdAt: "",
    };
    setMessages((current) => [...current, optimistic]);
    setMessage("");
    setSending(true);
    setError(null);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "content-type": "application/json",
          "x-csrf-token": localStorage.getItem("arcadia:csrf") || "",
        },
        body: JSON.stringify({ message: clean, conversationId }),
      });

      if (!response.ok || !response.body) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error || `Failed (${response.status})`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let scheduleTouched = false;

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const event = JSON.parse(line) as {
              type?: string;
              message?: SideMessage;
              conversationId?: string;
              proposal?: unknown;
              schedule?: unknown;
              action?: unknown;
              error?: string;
            };
            if (event.type === "message" && event.message) {
              setMessages((current) => [...current, event.message as SideMessage]);
              if (event.conversationId) setConversationId(event.conversationId);
              if (event.proposal) setProposalWaiting(true);
              if (event.schedule || event.action) scheduleTouched = true;
            } else if (event.type === "error") {
              setError(event.error || "Something went sideways.");
            }
          } catch {
            // Skip malformed stream fragments.
          }
        }
      }

      if (scheduleTouched) {
        await reload();
        requestDashboardRefresh();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  }

  const launcher = (
    <button
      type="button"
      onClick={mounted ? hidePanel : () => showPanel()}
      aria-label="Open Arcad side panel"
      aria-expanded={open}
      className="group fixed bottom-[calc(env(safe-area-inset-bottom,0)+88px)] right-4 z-40 flex items-center gap-2.5 rounded-full py-1.5 pl-1.5 pr-3 surface-raised ui-pressable lg:bottom-6 lg:right-6"
      style={{
        background: "var(--app-surface)",
        border: "1px solid var(--app-border-strong)",
        color: "var(--app-text)",
      }}
    >
      <span className="relative inline-flex">
        <ArcadOrb size={30} state={hasUnhandled ? "alert" : "idle"} />
        {hasUnhandled ? (
          <span
            aria-hidden="true"
            className="absolute -right-0.5 -top-0.5 size-3 rounded-full"
            style={{ background: "var(--app-arcad)", boxShadow: "0 0 0 2px var(--app-surface)" }}
          />
        ) : null}
      </span>
      <span className="type-mono-label" style={{ color: "var(--app-text-soft)" }}>
        Ask Arcad
      </span>
    </button>
  );

  const body = (
    <>
      <header className="flex items-center justify-between gap-3 px-5 py-4">
        <div className="flex min-w-0 items-center gap-3">
          <ArcadOrb size={34} state={sending ? "thinking" : hasUnhandled ? "alert" : "idle"} />
          <div className="min-w-0">
            <p className="text-[14px] font-semibold">Arcad</p>
            <p className="truncate text-[11.5px]" style={{ color: "var(--app-text-muted)" }}>
              Your planning partner
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Link
            href="/app/arcad?tab=chat"
            onClick={hidePanel}
            className="ui-hover rounded-md px-3 py-2 text-[11.5px] font-medium"
            style={{ color: "var(--app-arcad-strong)" }}
          >
            Full chat
          </Link>
          <button
            type="button"
            onClick={hidePanel}
            aria-label="Close Arcad side panel"
            className="ui-hover grid size-9 place-items-center rounded-full"
            style={{ color: "var(--app-text-muted)" }}
          >
            <svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
              <path d="M5 5l10 10M15 5L5 15" />
            </svg>
          </button>
        </div>
      </header>

      <div className="h-px shrink-0" style={{ background: "var(--app-border)" }} />

      <div ref={listRef} className="flex-1 overflow-y-auto px-5 py-5">
        {loading ? (
          <div className="flex items-center gap-2 text-[13px]" style={{ color: "var(--app-text-muted)" }}>
            <ArcadOrb size={22} state="thinking" />
            Loading your conversation…
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-start">
            <p className="text-[20px] font-semibold leading-tight">{greeting.primary}</p>
            <p className="mt-2 text-[13px] leading-relaxed" style={{ color: "var(--app-text-muted)" }}>
              {greeting.secondary}
            </p>
            {starters.length > 0 ? (
              <div className="mt-5 flex flex-col items-stretch gap-2 self-stretch">
                {starters.slice(0, 4).map((starter) => (
                  <button
                    key={starter.label}
                    type="button"
                    onClick={() => void send(starter.message)}
                    className="rounded-md px-3 py-2.5 text-left text-[12.5px] font-medium transition-colors ui-hover"
                    style={{
                      border: "1px solid var(--app-border)",
                      color: "var(--app-text-soft)",
                    }}
                  >
                    {starter.label}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        ) : (
          <ul className="flex flex-col gap-4">
            {messages.map((item) => {
              const isUser = item.role === "user";
              return (
                <li key={item.id} className={isUser ? "flex justify-end" : "flex justify-start gap-2.5"}>
                  {!isUser ? <ArcadOrb size={21} /> : null}
                  <div
                    className="max-w-[82%] whitespace-pre-wrap rounded-lg px-3.5 py-2.5 text-[13.5px] leading-relaxed"
                    style={
                      isUser
                        ? { background: "var(--app-text)", color: "var(--app-bg)" }
                        : { background: "var(--app-surface-soft)", color: "var(--app-text)" }
                    }
                  >
                    {item.content}
                  </div>
                </li>
              );
            })}
            {sending ? (
              <li className="flex items-center gap-2.5">
                <ArcadOrb size={21} state="thinking" />
                <span className="text-[12.5px]" style={{ color: "var(--app-text-muted)" }}>Thinking…</span>
              </li>
            ) : null}
          </ul>
        )}

        {proposalWaiting ? (
          <Link
            href="/app/arcad?tab=chat"
            onClick={hidePanel}
            className="mt-5 block rounded-md px-3.5 py-3 text-[12.5px] font-medium"
            style={{ background: "var(--app-arcad-soft)", color: "var(--app-arcad-strong)" }}
          >
            Arcad has a plan change ready, review it in full chat
          </Link>
        ) : null}

        {error ? (
          <p className="mt-4 text-[12.5px]" style={{ color: "var(--app-danger)" }}>{error}</p>
        ) : null}
      </div>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          void send(message);
        }}
        className="m-3 flex items-end gap-1.5 rounded-lg p-1.5"
        style={{ background: "var(--app-surface-soft)", boxShadow: "var(--elev-inset)" }}
      >
        <textarea
          ref={inputRef}
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              void send(message);
            }
          }}
          rows={1}
          placeholder="Ask Arcad…"
          className="min-h-[38px] max-h-[120px] flex-1 resize-none bg-transparent px-2.5 py-2 text-[13.5px] outline-none"
          style={{ color: "var(--app-text)" }}
        />
        <MicButton value={message} onChange={setMessage} targetRef={inputRef} compact />
        <button
          type="submit"
          disabled={!message.trim() || sending}
          aria-label="Send message"
          className="grid size-9 shrink-0 place-items-center rounded-full transition-opacity disabled:opacity-35"
          style={{ background: "var(--app-arcad)", color: "var(--app-arcad-on)" }}
        >
          <svg viewBox="0 0 20 20" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10 16V4M5 9l5-5 5 5" />
          </svg>
        </button>
      </form>
    </>
  );

  if (docked) {
    // A column in the shell's flex row: the page narrows beside it rather
    // than sitting under it. The outer width animates, the panel inside
    // keeps its width so the text doesn't reflow while it slides.
    return (
      <>
        {mounted ? null : launcher}
        <div
          ref={dockRef}
          className="sticky top-10 h-[calc(100svh-2.5rem)] shrink-0 overflow-hidden"
          style={{
            width: mounted && open ? panelWidth : 0,
            transition: dragging ? "none" : "width 300ms var(--ease-out-expo)",
          }}
        >
          {mounted ? (
            <div className="relative h-full p-2" style={{ width: panelWidth }}>
              <div
                role="separator"
                aria-orientation="vertical"
                aria-label="Resize Arcad panel"
                aria-valuenow={panelWidth}
                aria-valuemin={MIN_WIDTH}
                aria-valuemax={maxWidth()}
                tabIndex={0}
                onPointerDown={startResize}
                onKeyDown={resizeWithKeys}
                onDoubleClick={resetWidth}
                title="Drag to resize, double-click to reset"
                className="group absolute inset-y-0 left-0 z-10 flex w-2 cursor-col-resize touch-none justify-center outline-none"
              >
                <span
                  aria-hidden="true"
                  className="my-auto h-10 w-[3px] rounded-full transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
                  style={{ background: "var(--app-border-strong)", opacity: dragging ? 1 : 0 }}
                />
              </div>
              <aside
                ref={panelRef}
                aria-label="Arcad side panel"
                className="flex h-full flex-col overflow-hidden rounded-xl"
                style={{
                  background: "var(--app-elev)",
                  color: "var(--app-text)",
                  border: "1px solid var(--app-border)",
                }}
              >
                {body}
              </aside>
            </div>
          ) : null}
        </div>
      </>
    );
  }

  return (
    <>
      {launcher}
      {mounted ? (
        <aside
          ref={panelRef}
          aria-label="Arcad side panel"
          className="fixed bottom-2 right-2 top-2 z-50 flex w-[min(420px,calc(100vw-16px))] flex-col overflow-hidden rounded-xl"
          style={{
            background: "var(--app-elev)",
            color: "var(--app-text)",
            boxShadow: "var(--elev-3)",
            transform: open ? "translateX(0)" : "translateX(calc(100% + 16px))",
            opacity: open ? 1 : 0.96,
            transition: "transform 300ms var(--ease-out-expo), opacity 220ms ease",
          }}
        >
          {body}
        </aside>
      ) : null}
    </>
  );
}

function countUnhandled(data: ReturnType<typeof useDashboardData>["data"]): number {
  const nowMs = Date.now();
  return data.events.filter((event) => {
    if (event.category !== "study") return false;
    if (event.outcome !== "planned") return false;
    const endMs = Date.parse(event.endAt);
    return endMs + 2 * 60 * 1000 <= nowMs && nowMs - endMs <= 24 * 60 * 60 * 1000;
  }).length;
}

function maxWidth(): number {
  if (typeof window === "undefined") return 720;
  return Math.max(MIN_WIDTH, Math.min(720, Math.round(window.innerWidth * 0.5)));
}

/** About a third of the space beside the sidebar, like a browser side panel. */
function defaultWidth(): number {
  if (typeof window === "undefined") return 420;
  return Math.round(Math.min(560, Math.max(380, window.innerWidth * 0.3)));
}

function clampWidth(value: number): number {
  return Math.round(Math.min(maxWidth(), Math.max(MIN_WIDTH, value)));
}

function readOpenPref(): boolean {
  try {
    return window.localStorage.getItem(OPEN_KEY) === "open";
  } catch {
    return false;
  }
}

function writeOpenPref(open: boolean) {
  try {
    window.localStorage.setItem(OPEN_KEY, open ? "open" : "closed");
  } catch {
    /* ignore */
  }
}

function readWidthPref(): number | null {
  try {
    const stored = Number(window.localStorage.getItem(WIDTH_KEY));
    return Number.isFinite(stored) && stored > 0 ? stored : null;
  } catch {
    return null;
  }
}

function writeWidthPref(value: number | null) {
  try {
    if (value === null) window.localStorage.removeItem(WIDTH_KEY);
    else window.localStorage.setItem(WIDTH_KEY, String(value));
  } catch {
    /* ignore */
  }
}
