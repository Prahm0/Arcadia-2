"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { api, ApiError } from "@/lib/api/client";
import { analytics } from "@/lib/analytics/events";
import { useDashboardData } from "@/lib/app/DashboardProvider";
import { useStreak } from "@/lib/app/useStreak";
import { buildContextualStarters, buildGreeting, type Starter } from "@/lib/app/arcadStarters";
import { PAID_PRICING, type PaidTier } from "@/lib/app/pricing";
import { requestDashboardRefresh } from "@/lib/app/useDashboardAutoRefresh";
import AppButton from "./AppButton";
import ArcadOrb from "./ArcadOrb";
import MissedRecoveryCards from "./MissedRecoveryCards";
import MonthPlanPanel from "./MonthPlanPanel";
import ProactiveArcadCards from "./ProactiveArcadCards";
import PageTour from "./tour/PageTour";
import ChangeCard from "./arcad/ChangeCard";
import ChatRail, { PANEL_ICON } from "./arcad/ChatRail";
import Composer, { type ComposerHandle } from "./arcad/Composer";
import { MessageRow, ThinkingRow } from "./arcad/ChatMessage";
import type { ArcadUsage, ChatMessage, Conversation, Proposal, SendError } from "./arcad/types";
import { subjectCount } from "@/lib/app/subjectCount";

type View = "chat" | "month";

const RAIL_KEY = "arcadia:arcad-rail";

/**
 * Arcad's page, laid out like a chat app: past chats down the left, the
 * conversation in the middle, the box to type in at the bottom. It opens on
 * a fresh chat with suggestions drawn from the student's real deadlines;
 * the month plan sits in the left column. Links that carry ?c=<id> open that
 * chat, ?tab=chat opens the latest one (where the floating Arcad panel was),
 * ?view=month opens the month, and ?prompt= starts a new chat with it.
 */
export default function ArcadView() {
  return (
    <Suspense fallback={null}>
      <ArcadPage />
    </Suspense>
  );
}

function ArcadPage() {
  const { data, reload } = useDashboardData();
  const params = useSearchParams();
  const streak = useStreak();

  const [view, setView] = useState<View>(() =>
    params.get("view") === "month" || params.get("tab") === "month" ? "month" : "chat",
  );
  const [conversationId, setConversationIdState] = useState<string | null>(null);
  /** The same id, readable from a send that started before a re-render. */
  const conversationRef = useRef<string | null>(null);
  const setConversationId = useCallback((id: string | null) => {
    conversationRef.current = id;
    setConversationIdState(id);
  }, []);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [draft, setDraft] = useState("");
  const [draftReady, setDraftReady] = useState(false);
  const [usage, setUsage] = useState<ArcadUsage | null>(null);
  const [sending, setSending] = useState(false);
  const [loadingThread, setLoadingThread] = useState(false);
  const [sendError, setSendError] = useState<SendError | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [revealId, setRevealId] = useState<string | null>(null);
  const [railOpen, setRailOpen] = useState(false);
  /** Wide screens only: the chats column tucked away to give the thread the room. */
  const [railCollapsed, setRailCollapsed] = useState(() => {
    try {
      return window.localStorage.getItem(RAIL_KEY) === "collapsed";
    } catch {
      return false;
    }
  });
  const [atBottom, setAtBottom] = useState(true);
  const [focusRequest, setFocusRequest] = useState(0);

  const composerRef = useRef<ComposerHandle>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const threadRef = useRef<HTMLDivElement>(null);
  const stickRef = useRef(true);
  const sentDuringMountRef = useRef(false);
  /** Bumped whenever the open thread changes, so a late reply can't land in the wrong chat. */
  const threadKey = useRef(0);
  const draftKey = `arcadia:arcad-draft:${data.user.id}`;
  const limitReached = Boolean(usage && usage.used >= usage.cap);

  const starters = useMemo(() => buildContextualStarters(data, streak), [data, streak]);
  const greeting = useMemo(() => buildGreeting(data, streak), [data, streak]);

  useEffect(() => {
    let active = true;
    let savedDraft = "";
    try {
      savedDraft = window.sessionStorage.getItem(draftKey) ?? "";
    } catch {
      // Draft persistence is best effort when browser storage is unavailable.
    }

    api<ArcadUsage>("/api/chat/usage")
      .then((nextUsage) => {
        if (!active) return;
        if (!sentDuringMountRef.current) {
          setUsage(nextUsage);
          setDraft(nextUsage.used >= nextUsage.cap ? "" : savedDraft);
        }
        setDraftReady(true);
      })
      .catch(() => {
        if (!active) return;
        setDraft(savedDraft);
        setDraftReady(true);
      });

    return () => {
      active = false;
    };
  }, [draftKey]);

  useEffect(() => {
    if (!draftReady) return;
    try {
      if (limitReached) window.sessionStorage.removeItem(draftKey);
      else if (draft) window.sessionStorage.setItem(draftKey, draft);
      else window.sessionStorage.removeItem(draftKey);
    } catch {
      // Draft persistence is best effort when browser storage is unavailable.
    }
  }, [draft, draftKey, draftReady, limitReached]);

  useEffect(() => {
    if (!limitReached || !usage) return;
    const delay = Math.max(0, Date.parse(usage.resetAt) - Date.now()) + 250;
    const timer = window.setTimeout(() => {
      api<ArcadUsage>("/api/chat/usage").then(setUsage).catch(() => undefined);
    }, delay);
    return () => window.clearTimeout(timer);
  }, [limitReached, usage]);

  const setUrl = useCallback((next: { c?: string | null; view?: View }) => {
    const url = new URL(window.location.href);
    for (const key of ["c", "view", "tab", "prompt"]) url.searchParams.delete(key);
    if (next.view === "month") url.searchParams.set("view", "month");
    else if (next.c) url.searchParams.set("c", next.c);
    window.history.replaceState(window.history.state, "", url.toString());
  }, []);

  const loadConversations = useCallback(async () => {
    try {
      const response = await api<{ conversations: Conversation[] }>("/api/conversations");
      setConversations(response.conversations || []);
    } catch {
      /* the rail just stays as it was */
    }
  }, []);

  const resetThread = useCallback(() => {
    threadKey.current += 1;
    setMessages([]);
    setProposals([]);
    setSendError(null);
    setNotice(null);
    setRevealId(null);
    stickRef.current = true;
  }, []);

  /** Put words in the box for the student to finish, caret at the end. */
  const fillComposer = useCallback((text: string) => {
    setDraft(text);
    setFocusRequest((n) => n + 1);
  }, []);

  const startNewChat = useCallback(
    (prefill?: string) => {
      resetThread();
      setConversationId(null);
      setView("chat");
      setRailOpen(false);
      setUrl({});
      if (prefill !== undefined) fillComposer(prefill);
      // Only jump into the box on a keyboard-first screen; on a phone it would throw the keyboard up.
      else if (window.matchMedia("(min-width: 1024px)").matches) setFocusRequest((n) => n + 1);
    },
    [fillComposer, resetThread, setConversationId, setUrl],
  );

  const openConversation = useCallback(
    async (id: string | "latest") => {
      resetThread();
      const key = threadKey.current;
      setView("chat");
      setRailOpen(false);
      setLoadingThread(true);
      try {
        if (id === "latest") {
          const response = await api<{ conversationId: string; messages: ChatMessage[]; conversationProposals?: Proposal[] }>(
            "/api/chat",
          );
          if (key !== threadKey.current) return;
          setConversationId(response.messages.length ? response.conversationId : null);
          setMessages(response.messages);
          setProposals(response.conversationProposals ?? []);
          setUrl({ c: response.messages.length ? response.conversationId : null });
        } else {
          setConversationId(id);
          setUrl({ c: id });
          const response = await api<{ messages: ChatMessage[]; proposals?: Proposal[] }>(
            `/api/conversations/${encodeURIComponent(id)}`,
          );
          if (key !== threadKey.current) return;
          setMessages(response.messages);
          setProposals(response.proposals ?? []);
        }
      } catch (err) {
        if (key !== threadKey.current) return;
        if (err instanceof ApiError && err.status === 404) {
          setConversationId(null);
          setUrl({});
        } else {
          setNotice(err instanceof Error ? err.message : "Couldn't open that chat.");
        }
      } finally {
        if (key === threadKey.current) setLoadingThread(false);
      }
    },
    [resetThread, setConversationId, setUrl],
  );

  const send = useCallback(
    async (text: string) => {
      const clean = text.trim();
      if (!clean || sending || limitReached) return;
      sentDuringMountRef.current = true;
      analytics.arcadMessageSent();
      const key = threadKey.current;
      const localId = `local-${Date.now()}`;
      stickRef.current = true;
      setSendError(null);
      setNotice(null);
      setSending(true);
      setDraft("");
      setMessages((prev) => [
        ...prev,
        { id: localId, role: "user", content: clean, createdAt: new Date().toISOString() },
      ]);
      if (window.matchMedia("(min-width: 1024px)").matches) {
        requestAnimationFrame(() => composerRef.current?.focus());
      }

      const markFailed = (error: SendError) => {
        if (key !== threadKey.current) return;
        setMessages((prev) => prev.map((m) => (m.id === localId ? { ...m, failed: true } : m)));
        setSendError(error);
      };

      try {
        const response = await fetch("/api/chat", {
          method: "POST",
          credentials: "same-origin",
          headers: {
            "content-type": "application/json",
            "x-csrf-token": localStorage.getItem("arcadia:csrf") || "",
          },
          body: JSON.stringify(
            conversationRef.current
              ? { message: clean, conversationId: conversationRef.current }
              : { message: clean, newConversation: true },
          ),
        });
        if (!response.ok || !response.body) {
          const payload = (await response.json().catch(() => null)) as {
            error?: string;
            code?: string;
            upgradeTier?: PaidTier | null;
            usage?: ArcadUsage;
          } | null;
          if (payload?.code === "message_cap_reached" && payload.usage) {
            setMessages((prev) => prev.filter((message) => message.id !== localId));
            setDraft("");
            setSendError(null);
            setUsage(payload.usage);
            return;
          }
          markFailed({
            message: payload?.error || `Arcad couldn't answer (${response.status}).`,
            capped: payload?.code === "message_cap_reached",
            upgradeTier: payload?.upgradeTier,
          });
          return;
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let planTouched = false;
        let failed = false;
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";
          for (const line of lines) {
            if (!line.trim()) continue;
            let event: {
              type?: string;
              conversationId?: string;
              message?: ChatMessage;
              proposal?: Proposal;
              remembered?: string[];
              schedule?: unknown;
              action?: unknown;
              usage?: ArcadUsage;
            };
            try {
              event = JSON.parse(line);
            } catch {
              continue;
            }
            if (event.type === "message" && event.message) {
              if (event.schedule || event.action) planTouched = true;
              if (key !== threadKey.current) continue;
              const reply: ChatMessage = {
                ...event.message,
                remembered: Array.isArray(event.remembered) ? event.remembered : undefined,
              };
              if (event.conversationId) {
                setConversationId(event.conversationId);
                setUrl({ c: event.conversationId });
              }
              setMessages((prev) => [...prev, reply]);
              if (event.usage) setUsage(event.usage);
              if (event.proposal) setProposals((prev) => [...prev, event.proposal!]);
              setRevealId(reply.id);
            } else if (event.type === "error") {
              failed = true;
              // The row already says it didn't send; the server's reason isn't for students.
              markFailed({ message: "" });
            }
          }
        }
        if (!failed && planTouched) {
          await reload();
          requestDashboardRefresh();
        }
        void loadConversations();
      } catch (err) {
        markFailed({ message: err instanceof Error ? err.message : "Couldn't reach Arcad. Check your connection?" });
      } finally {
        setSending(false);
      }
    },
    [limitReached, loadConversations, reload, sending, setConversationId, setUrl],
  );

  async function respondToProposal(id: string, action: "apply" | "decline") {
    setNotice(null);
    try {
      await api(`/api/proposals/${encodeURIComponent(id)}/${action}`, { method: "POST" });
      setProposals((prev) => prev.map((p) => (p.id === id ? { ...p, status: action === "apply" ? "applied" : "declined" } : p)));
      if (action === "apply") {
        await reload();
        requestDashboardRefresh();
      }
    } catch (err) {
      if (err instanceof ApiError && err.status === 410) {
        setProposals((prev) => prev.map((p) => (p.id === id ? { ...p, status: "expired" } : p)));
        setNotice("That suggestion expired. Ask Arcad again and it'll redo it with your current plan.");
      } else {
        setNotice(err instanceof Error ? err.message : "Couldn't do that. Try again?");
      }
    }
  }

  async function renameConversation(id: string, title: string) {
    const before = conversations;
    setConversations((prev) => prev.map((c) => (c.id === id ? { ...c, title } : c)));
    try {
      await api(`/api/conversations/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify({ title }) });
    } catch {
      setConversations(before);
    }
  }

  async function deleteConversation(id: string) {
    try {
      await api(`/api/conversations/${encodeURIComponent(id)}`, { method: "DELETE" });
      setConversations((prev) => prev.filter((c) => c.id !== id));
      if (id === conversationId) startNewChat();
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "Couldn't delete that chat.");
    }
  }

  // First load: decide what to open from the URL.
  useEffect(() => {
    api<{ conversations: Conversation[] }>("/api/conversations")
      .then((response) => setConversations(response.conversations || []))
      .catch(() => undefined);
    const search = new URLSearchParams(window.location.search);
    if (search.get("view") === "month" || search.get("tab") === "month") {
      // Opened on the month (see the initial view); no chat to load.
    } else if (search.get("c")) {
      // Loading a chat from the URL is exactly what this effect is for.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      void openConversation(search.get("c")!);
    } else if (search.get("tab") === "chat" && !search.get("prompt")) {
      void openConversation("latest");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A ?prompt= (from a card elsewhere in the app, even while already here)
  // starts a new chat with it. Stripped straight away so a refresh doesn't resend.
  const prompt = params.get("prompt");
  const handledPrompt = useRef<string | null>(null);
  useEffect(() => {
    if (!prompt || handledPrompt.current === prompt) return;
    handledPrompt.current = prompt;
    startNewChat();
    void send(prompt);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prompt]);

  // Keep the newest message in view while you're at the bottom, including
  // while a reply types itself out; leave you be if you've scrolled up.
  useEffect(() => {
    const scroller = scrollRef.current;
    const thread = threadRef.current;
    if (!scroller || !thread) return;
    const observer = new ResizeObserver(() => {
      if (stickRef.current) scroller.scrollTop = scroller.scrollHeight;
    });
    observer.observe(thread);
    return () => observer.disconnect();
  }, [messages.length > 0, view, loadingThread]); // eslint-disable-line react-hooks/exhaustive-deps

  function onScroll() {
    const el = scrollRef.current;
    if (!el) return;
    const bottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    stickRef.current = bottom;
    setAtBottom(bottom);
  }

  function jumpToLatest() {
    const el = scrollRef.current;
    if (!el) return;
    stickRef.current = true;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }

  const activeTitle =
    view === "month"
      ? "" // the month has its own heading
      : conversations.find((c) => c.id === conversationId)?.title || (messages[0]?.content.slice(0, 60) ?? "New chat");
  const empty = view === "chat" && !loadingThread && messages.length === 0;

  function setCollapsed(collapsed: boolean) {
    setRailCollapsed(collapsed);
    try {
      window.localStorage.setItem(RAIL_KEY, collapsed ? "collapsed" : "open");
    } catch {
      /* stays as chosen for this visit */
    }
  }

  /** The column on wide screens, the drawer on anything smaller. */
  function showChats() {
    if (window.matchMedia("(min-width: 1280px)").matches) setCollapsed(false);
    else setRailOpen(true);
  }

  const rail = (inDrawer: boolean) => (
    <ChatRail
      onHide={inDrawer ? () => setRailOpen(false) : () => setCollapsed(true)}
      conversations={conversations}
      activeId={conversationId}
      view={view}
      onNewChat={() => startNewChat()}
      onOpenMonth={() => {
        setView("month");
        setRailOpen(false);
        setUrl({ view: "month" });
      }}
      onSelect={(id) => void openConversation(id)}
      onRename={renameConversation}
      onDelete={deleteConversation}
    />
  );

  return (
    <div className="flex h-[calc(100svh-3rem-env(safe-area-inset-top,0px)-var(--mobile-nav-h)-env(safe-area-inset-bottom,0px))] min-h-[420px] lg:h-[calc(100svh-2.5rem)]">
      {/* Past chats: a column on wide screens, a drawer otherwise. */}
      <aside
        className="hidden shrink-0 overflow-hidden transition-[width] duration-200 ease-out motion-reduce:transition-none xl:block"
        style={{ width: railCollapsed ? 0 : 256, borderRight: railCollapsed ? undefined : "1px solid var(--app-border)" }}
        aria-label="Arcad chats"
        inert={railCollapsed}
      >
        <div className="h-full w-[256px]">{rail(false)}</div>
      </aside>
      {railOpen ? (
        <div className="fixed inset-0 z-50 xl:hidden" role="dialog" aria-modal="true" aria-label="Arcad chats">
          <button
            type="button"
            aria-label="Close chats"
            className="absolute inset-0"
            style={{ background: "rgba(0,0,0,0.4)" }}
            onClick={() => setRailOpen(false)}
          />
          <div
            className="absolute inset-y-0 left-0 w-[288px] max-w-[85vw]"
            style={{ background: "var(--app-bg)", boxShadow: "0 0 0 1px var(--app-border), 0 20px 50px rgba(0,0,0,0.3)" }}
          >
            {rail(true)}
          </div>
        </div>
      ) : null}

      <section className="relative flex min-w-0 flex-1 flex-col">
        <header className="flex h-12 shrink-0 items-center gap-1 px-2 sm:px-3">
          <IconButton label="Show chats" className={railCollapsed ? undefined : "xl:hidden"} onClick={showChats}>
            <path d={PANEL_ICON} />
          </IconButton>
          <p className="min-w-0 flex-1 truncate px-1.5 text-[14px] font-medium" style={{ color: "var(--app-text)" }}>
            {activeTitle}
          </p>
          <PageTour id="arcad" />
          <IconButton label="New chat" className={railCollapsed ? undefined : "xl:hidden"} onClick={() => startNewChat()}>
            <path d="M14.5 3.5l2 2-8 8H6.5v-2l8-8zM9 4H5a1.5 1.5 0 00-1.5 1.5v9A1.5 1.5 0 005 16h9a1.5 1.5 0 001.5-1.5V11" />
          </IconButton>
        </header>

        {view === "month" ? (
          <div className="min-h-0 flex-1 overflow-y-auto">
            <div className="mx-auto w-full max-w-[900px] px-4 pb-10 pt-2 sm:px-8">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <h1 className="text-[26px] font-semibold leading-tight tracking-[-0.025em]" style={{ color: "var(--app-text)" }}>
                    Your month
                  </h1>
                  <p className="mt-1 text-[14px]" style={{ color: "var(--app-text-muted)" }}>
                    What Arcad has planned for the next four weeks
                  </p>
                </div>
                <AppButton variant="secondary" onClick={() => startNewChat("Change my month plan: ")}>
                  Ask Arcad to change it
                </AppButton>
              </div>
              <div className="mt-6">
                <MonthPlanPanel />
              </div>
            </div>
          </div>
        ) : empty ? (
          <div className="min-h-0 flex-1 overflow-y-auto">
            <div className="mx-auto flex min-h-full w-full max-w-[720px] flex-col justify-center px-4 py-8 sm:px-6">
              <div className="flex flex-col items-center text-center">
                <ArcadOrb size={44} />
                <h1 className="mt-4 text-[26px] font-semibold leading-tight tracking-[-0.025em]" style={{ color: "var(--app-text)" }}>
                  {greeting.primary}
                </h1>
                <p className="mt-1.5 text-[15px]" style={{ color: "var(--app-text-muted)" }}>
                  {greeting.secondary}
                </p>
              </div>

              <div className="mt-7">
                {usage && limitReached ? <MessageLimitNotice usage={usage} /> : null}
                <Composer
                  ref={composerRef}
                  value={draft}
                  onChange={setDraft}
                  onSend={() => void send(draft)}
                  sending={sending}
                  disabled={!draftReady || limitReached}
                  focusRequest={focusRequest}
                  placeholder="Tell Arcad what's coming up"
                  autoFocus
                />
                <KnowsLine data={data} />
              </div>

              <div className="mt-8">
                <MissedRecoveryCards />
                <ProactiveArcadCards limit={1} compact />
              </div>

              {draftReady && !limitReached ? <Suggestions starters={starters} onPick={(starter) => fillComposer(starter.message)} /> : null}
            </div>
          </div>
        ) : (
          <>
            <div ref={scrollRef} onScroll={onScroll} className="min-h-0 flex-1 overflow-y-auto">
              <div ref={threadRef} className="mx-auto w-full max-w-[720px] px-4 pb-6 pt-4 sm:px-6">
                {loadingThread ? (
                  <ThreadSkeleton />
                ) : (
                  <ul className="flex flex-col gap-6" role="log" aria-live="polite" aria-label="Conversation with Arcad">
                    {messages.map((message, index) => {
                      const previous = messages[index - 1];
                      const replyProposals = message.role === "assistant" ? proposalsFor(message, messages, proposals) : [];
                      return (
                        <MessageRow
                          key={message.id}
                          message={message}
                          showMark={message.role === "assistant" && previous?.role !== "assistant"}
                          reveal={message.id === revealId}
                          onRevealed={() => setRevealId(null)}
                          onRetry={
                            message.failed && !sendError?.capped
                              ? () => {
                                  setMessages((prev) => prev.filter((m) => m.id !== message.id));
                                  void send(message.content);
                                }
                              : undefined
                          }
                          onEdit={
                            message.failed
                              ? () => {
                                  setMessages((prev) => prev.filter((m) => m.id !== message.id));
                                  setSendError(null);
                                  fillComposer(message.content);
                                }
                              : undefined
                          }
                        >
                          {replyProposals.map((proposal) => (
                            <ChangeCard key={proposal.id} proposal={proposal} onRespond={respondToProposal} />
                          ))}
                        </MessageRow>
                      );
                    })}
                    {sending ? <ThinkingRow /> : null}
                  </ul>
                )}

                {sendError ? <SendErrorNote error={sendError} /> : null}
              </div>
            </div>

            {!atBottom ? (
              <button
                type="button"
                onClick={jumpToLatest}
                aria-label="Jump to latest"
                className="absolute bottom-[118px] left-1/2 grid h-8 w-8 -translate-x-1/2 place-items-center rounded-full"
                style={{ background: "var(--app-surface)", color: "var(--app-text-soft)", boxShadow: "0 0 0 1px var(--app-border), var(--elev-1)" }}
              >
                <svg viewBox="0 0 20 20" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M10 4.5v11M5.5 11l4.5 4.5 4.5-4.5" />
                </svg>
              </button>
            ) : null}

            <div className="mx-auto w-full max-w-[720px] shrink-0 px-3 pb-3 sm:px-6">
              {notice ? (
                <p className="mb-2 px-1 text-[12.5px]" style={{ color: "var(--app-danger)" }}>
                  {notice}
                </p>
              ) : null}
              {usage && limitReached ? <MessageLimitNotice usage={usage} /> : null}
              <Composer
                ref={composerRef}
                value={draft}
                onChange={setDraft}
                onSend={() => void send(draft)}
                sending={sending}
                disabled={!draftReady || limitReached}
                focusRequest={focusRequest}
                placeholder="Reply to Arcad"
              />
              <p className="mt-2 hidden text-center text-[11.5px] sm:block" style={{ color: "var(--app-text-faint)" }}>
                Arcad plans the work, it won&apos;t do it for you. Nothing changes until you apply it.
              </p>
            </div>
          </>
        )}
      </section>
    </div>
  );
}

function MessageLimitNotice({ usage }: { usage: ArcadUsage }) {
  const tierName = usage.tier === "free" ? "free" : usage.tier === "pro" ? "Pro" : "Max";
  const upgradeName = usage.upgradeTier === "pro" ? "Pro" : usage.upgradeTier === "max" ? "Max" : null;
  const weeklyPrice = usage.upgradeTier ? PAID_PRICING[usage.upgradeTier].weekly : null;

  return (
    <div
      role="status"
      className="mb-3 rounded-lg px-3.5 py-3"
      style={{
        background: "color-mix(in oklab, var(--app-arcad) 7%, var(--app-surface))",
        boxShadow: "inset 0 0 0 1px color-mix(in oklab, var(--app-arcad) 30%, var(--app-border))",
      }}
    >
      <p className="text-[13.5px] font-medium" style={{ color: "var(--app-text)" }}>
        You&apos;ve used your {usage.cap} {tierName} messages for today. Resets at midnight.
      </p>
      {upgradeName && weeklyPrice !== null ? (
        <Link href="/app/pricing" className="mt-1 inline-flex text-[12.5px] font-medium hover:underline" style={{ color: "var(--app-arcad)" }}>
          Upgrade to {upgradeName} · ${weeklyPrice.toFixed(2)}/week
        </Link>
      ) : null}
    </div>
  );
}

/**
 * Which proposals hang off which reply: each one sits under the first reply
 * written at or after it was made, which is the reply that made it.
 */
function proposalsFor(message: ChatMessage, messages: ChatMessage[], proposals: Proposal[]): Proposal[] {
  if (!proposals.length) return [];
  const replies = messages.filter((m) => m.role === "assistant");
  const at = Date.parse(message.createdAt);
  const index = replies.indexOf(message);
  const previousAt = index > 0 ? Date.parse(replies[index - 1].createdAt) : -Infinity;
  const isLast = index === replies.length - 1;
  return proposals.filter((p) => {
    const made = Date.parse(p.createdAt);
    // A second's slack either side: the proposal row and the reply are written moments apart.
    return made > previousAt + 1000 && (made <= at + 1000 || isLast);
  });
}

/** What Arcad works from, so it's clear it isn't guessing. */
function KnowsLine({ data }: { data: ReturnType<typeof useDashboardData>["data"] }) {
  const subjects = subjectCount(data);
  const open = data.tasks.filter((t) => t.status === "pending").length;
  const parts = [
    subjects ? `your ${subjects} subject${subjects === 1 ? "" : "s"}` : null,
    open ? `${open} deadline${open === 1 ? "" : "s"}` : null,
    "your week",
  ].filter(Boolean) as string[];
  const list = parts.length > 1 ? `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}` : parts[0];
  return (
    <p className="mt-2.5 text-center text-[12px]" style={{ color: "var(--app-text-faint)" }}>
      Arcad works from {list}. It plans the work, it won&apos;t do it for you.
    </p>
  );
}

function Suggestions({ starters, onPick }: { starters: Starter[]; onPick: (starter: Starter) => void }) {
  if (!starters.length) return null;
  return (
    <div className="mt-2">
      <p className="px-1 pb-2 text-[12px] font-medium" style={{ color: "var(--app-text-muted)" }}>
        From your plan
      </p>
      <div className="grid gap-2 sm:grid-cols-2">
        {starters.slice(0, 4).map((starter) => (
          <button
            key={starter.label}
            type="button"
            onClick={() => onPick(starter)}
            className="rounded-lg px-3.5 py-3 text-left transition-colors ui-hover"
            style={{
              boxShadow: "inset 0 0 0 1px var(--app-border)",
              borderLeft: starter.tone === "accent" ? "2px solid var(--app-arcad)" : undefined,
            }}
          >
            <span className="block text-[13.5px] font-medium" style={{ color: "var(--app-text)" }}>
              {starter.label}
            </span>
            {starter.detail ? (
              <span className="mt-0.5 block truncate text-[12.5px]" style={{ color: "var(--app-text-muted)" }}>
                {starter.detail}
              </span>
            ) : null}
          </button>
        ))}
      </div>
    </div>
  );
}

function SendErrorNote({ error }: { error: SendError }) {
  if (error.capped) {
    const upgradeTier = error.upgradeTier;
    const upgradeName = upgradeTier === "pro" ? "Pro" : upgradeTier === "max" ? "Max" : null;
    const weeklyPrice = upgradeTier ? PAID_PRICING[upgradeTier].weekly : null;
    return (
      <div
        className="ml-9 mt-4 rounded-lg px-4 py-3"
        style={{ boxShadow: "inset 0 0 0 1px color-mix(in oklab, var(--app-arcad) 40%, var(--app-border))" }}
      >
        <p className="text-[14px]" style={{ color: "var(--app-text)" }}>
          {error.message}
        </p>
        {upgradeName && weeklyPrice !== null ? (
          <Link
            href="/app/pricing"
            className="mt-2.5 inline-flex h-8 items-center rounded-md px-3 text-[13px] font-medium"
            style={{ background: "var(--app-arcad)", color: "var(--app-arcad-on)" }}
          >
            Upgrade to {upgradeName} · ${weeklyPrice.toFixed(2)}/week
          </Link>
        ) : null}
      </div>
    );
  }
  if (!error.message) return null;
  return (
    <p className="mt-3 text-right text-[12.5px]" style={{ color: "var(--app-text-muted)" }}>
      {error.message}
    </p>
  );
}

function ThreadSkeleton() {
  return (
    <div className="flex flex-col gap-6" aria-label="Loading chat">
      {[0.55, 0.8, 0.4].map((width, i) => (
        <div key={i} className={i % 2 === 0 ? "flex justify-end" : "flex gap-3"}>
          {i % 2 ? <span className="h-6 w-6 rounded-full" style={{ background: "var(--app-surface-soft)" }} /> : null}
          <span
            className="h-9 animate-pulse rounded-[14px]"
            style={{ width: `${width * 100}%`, background: "var(--app-surface-soft)" }}
          />
        </div>
      ))}
    </div>
  );
}

function IconButton({
  label,
  onClick,
  className,
  children,
}: {
  label: string;
  onClick: () => void;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`grid h-9 w-9 shrink-0 place-items-center rounded-md ui-hover ${className ?? ""}`}
      style={{ color: "var(--app-text-soft)" }}
    >
      <svg viewBox="0 0 20 20" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {children}
      </svg>
    </button>
  );
}
