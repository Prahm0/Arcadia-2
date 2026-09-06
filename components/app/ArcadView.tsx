"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/lib/api/client";
import { useDashboardData } from "@/lib/app/DashboardProvider";
import type { DashboardResponse } from "@/lib/api/types";
import { cn } from "@/lib/cn";
import { formatDueSoon, formatDurationMinutes } from "@/lib/api/time";
import PageHeader from "./PageHeader";
import AppButton from "./AppButton";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
}

interface Proposal {
  id: string;
  summary: string;
  status: string;
  operations: unknown[];
  createdAt: string;
  expiresAt: string;
}

interface Conversation {
  id: string;
  title: string | null;
  updatedAt: string;
  createdAt: string;
  messageCount?: number;
}

interface ChatState {
  conversationId: string | null;
  messages: Message[];
  proposals: Proposal[];
}

type Tab = "chat" | "context" | "history";

const SUGGESTIONS = [
  "How much have I studied this week?",
  "Add an English essay due Friday, 90 minutes",
  "Move my chemistry session to tomorrow",
  "I'm running out of time — what should I drop?",
];

export default function ArcadView() {
  const { data, reload } = useDashboardData();
  const [state, setState] = useState<ChatState>({ conversationId: null, messages: [], proposals: [] });
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("chat");
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const loadChat = useCallback(async (conversationId?: string) => {
    setLoading(true);
    setError(null);
    try {
      const path = conversationId
        ? `/api/conversations/${encodeURIComponent(conversationId)}`
        : "/api/chat";
      const response = await api<any>(path);
      if (conversationId) {
        setState({
          conversationId: response.conversation.id,
          messages: response.messages,
          proposals: state.proposals,
        });
      } else {
        setState({
          conversationId: response.conversationId,
          messages: response.messages,
          proposals: response.proposals || [],
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load chat.");
    } finally {
      setLoading(false);
    }
  }, [state.proposals]);

  const loadConversations = useCallback(async () => {
    try {
      const response = await api<{ conversations: Conversation[] }>("/api/conversations");
      setConversations(response.conversations || []);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    void loadChat();
    void loadConversations();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [state.messages, sending]);

  async function send(text: string) {
    const clean = text.trim();
    if (!clean) return;
    setSending(true);
    setError(null);
    const optimistic: Message = {
      id: `local-${Date.now()}`,
      role: "user",
      content: clean,
      createdAt: new Date().toISOString(),
    };
    setState((prev) => ({ ...prev, messages: [...prev.messages, optimistic] }));
    setMessage("");
    inputRef.current?.focus();

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "content-type": "application/json",
          "x-csrf-token": localStorage.getItem("arcadia:csrf") || "",
        },
        body: JSON.stringify({ message: clean, conversationId: state.conversationId }),
      });
      if (!response.ok || !response.body) {
        const data = await response.json().catch(() => null);
        throw new Error((data && data.error) || `Failed (${response.status})`);
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
          const trimmed = line.trim();
          if (!trimmed) continue;
          try {
            const event = JSON.parse(trimmed);
            if (event.type === "message" && event.message) {
              setState((prev) => ({
                ...prev,
                conversationId: event.conversationId || prev.conversationId,
                messages: [...prev.messages, event.message as Message],
                proposals: event.proposal ? [...prev.proposals, event.proposal as Proposal] : prev.proposals,
              }));
              if (event.schedule || event.action) scheduleTouched = true;
            } else if (event.type === "error") {
              setError(event.message || "Arcad couldn't respond.");
            }
          } catch {
            /* skip malformed */
          }
        }
      }
      if (scheduleTouched) await reload();
      void loadConversations();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setSending(false);
    }
  }

  async function respondToProposal(id: string, action: "apply" | "decline") {
    try {
      await api(`/api/proposals/${encodeURIComponent(id)}/${action}`, { method: "POST" });
      setState((prev) => ({ ...prev, proposals: prev.proposals.filter((p) => p.id !== id) }));
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed.");
    }
  }

  async function startNewChat() {
    setError(null);
    try {
      const response = await api<{ conversation: Conversation }>("/api/conversations", { method: "POST" });
      setState({ conversationId: response.conversation.id, messages: [], proposals: state.proposals });
      setConversations((prev) => [response.conversation, ...prev]);
      setTab("chat");
      inputRef.current?.focus();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed.");
    }
  }

  const activeConversationTitle = useMemo(() => {
    const found = conversations.find((c) => c.id === state.conversationId);
    return found?.title || "Current conversation";
  }, [conversations, state.conversationId]);

  return (
    <>
      <PageHeader
        eyebrow="Arcad"
        title={<>Your <span className="accent-serif">planning</span> partner.</>}
        meta={activeConversationTitle}
        action={
          <AppButton
            variant="secondary"
            onClick={startNewChat}
            icon={<svg viewBox="0 0 20 20" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M14 3l3 3-9 9H5v-3l9-9z" strokeLinecap="round" strokeLinejoin="round" /></svg>}
          >
            New chat
          </AppButton>
        }
      />

      <div className="mx-auto grid w-full max-w-[1140px] gap-6 px-6 py-8 sm:px-10 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="flex min-w-0 flex-col gap-4">
          <div
            className="inline-flex self-start rounded-[10px] p-1"
            style={{ background: "var(--app-surface-soft)", border: "1px solid var(--app-border)" }}
            role="tablist"
          >
            {(["chat", "context", "history"] as Tab[]).map((t) => (
              <button
                key={t}
                type="button"
                role="tab"
                aria-selected={tab === t}
                onClick={() => setTab(t)}
                className="rounded-[8px] px-3.5 py-1.5 text-[13px] font-medium capitalize transition-colors"
                style={{
                  background: tab === t ? "var(--app-surface)" : "transparent",
                  color: tab === t ? "var(--app-text)" : "var(--app-text-muted)",
                  boxShadow: tab === t ? "0 1px 3px rgba(0,0,0,0.05)" : "none",
                }}
              >
                {t}
              </button>
            ))}
          </div>

          {tab === "chat" && (
            <ChatPanel
              state={state}
              loading={loading}
              sending={sending}
              error={error}
              suggestions={SUGGESTIONS}
              onSend={send}
              onProposal={respondToProposal}
              listRef={listRef}
            />
          )}
          {tab === "context" && <ContextPanel data={data} />}
          {tab === "history" && (
            <HistoryPanel
              conversations={conversations}
              activeId={state.conversationId}
              onSelect={(id) => {
                setTab("chat");
                void loadChat(id);
              }}
            />
          )}

          {tab === "chat" && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                send(message);
              }}
              className="flex items-end gap-2 rounded-[14px] p-2"
              style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}
            >
              <textarea
                ref={inputRef}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    send(message);
                  }
                }}
                rows={1}
                placeholder="Ask Arcad anything…"
                className="min-h-[40px] max-h-[200px] flex-1 resize-none bg-transparent px-3 py-2 text-[14.5px] outline-none"
                style={{ color: "var(--app-text)" }}
              />
              <AppButton type="submit" variant="primary" loading={sending} disabled={!message.trim()}>
                Send
              </AppButton>
            </form>
          )}
        </div>

        <aside className="hidden lg:flex flex-col gap-4">
          <MiniContext data={data} />
        </aside>
      </div>
    </>
  );
}

function ChatPanel({
  state, loading, sending, error, suggestions, onSend, onProposal, listRef,
}: {
  state: ChatState;
  loading: boolean;
  sending: boolean;
  error: string | null;
  suggestions: string[];
  onSend: (text: string) => void;
  onProposal: (id: string, action: "apply" | "decline") => void;
  listRef: React.RefObject<HTMLDivElement | null>;
}) {
  return (
    <>
      {state.proposals.length > 0 ? (
        <div className="flex flex-col gap-2">
          {state.proposals.map((proposal) => (
            <div
              key={proposal.id}
              className="rounded-[14px] p-4"
              style={{ background: "var(--app-accent-soft)", border: "1px solid var(--app-accent)" }}
            >
              <p className="type-eyebrow" style={{ color: "var(--app-accent-strong)" }}>Proposal</p>
              <p className="mt-2 text-[14.5px]" style={{ color: "var(--app-text)" }}>{proposal.summary}</p>
              <div className="mt-4 flex gap-2">
                <AppButton variant="primary" onClick={() => onProposal(proposal.id, "apply")}>Apply</AppButton>
                <AppButton variant="ghost" onClick={() => onProposal(proposal.id, "decline")}>Decline</AppButton>
              </div>
            </div>
          ))}
        </div>
      ) : null}

      <div
        ref={listRef}
        className="max-h-[58vh] min-h-[360px] overflow-y-auto rounded-[16px] p-5 sm:p-6"
        style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}
      >
        {loading ? (
          <p className="text-[13.5px]" style={{ color: "var(--app-text-muted)" }}>Loading conversation…</p>
        ) : state.messages.length === 0 ? (
          <div className="flex flex-col items-start gap-4">
            <p className="text-[14px]" style={{ color: "var(--app-text-muted)" }}>
              Ask anything — Arcad has your subjects, schedule, and progress in mind.
            </p>
            <div className="flex flex-wrap gap-2">
              {suggestions.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => onSend(s)}
                  className="rounded-full px-3 py-1.5 text-[12.5px] transition-colors hover:bg-black/[0.03]"
                  style={{ border: "1px solid var(--app-border)", color: "var(--app-text-soft)" }}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <ul className="flex flex-col gap-4">
            {state.messages.map((msg) => (
              <MessageBubble key={msg.id} message={msg} />
            ))}
            {sending ? (
              <li className="flex justify-start">
                <div
                  className="flex items-center gap-2 rounded-[14px] px-4 py-2.5"
                  style={{ background: "var(--app-surface-soft)", color: "var(--app-text-muted)", border: "1px solid var(--app-border)" }}
                >
                  <ThinkingDots />
                  <span className="text-[13px]">Arcad is thinking…</span>
                </div>
              </li>
            ) : null}
          </ul>
        )}
      </div>

      {error ? (
        <p className="text-[13px]" style={{ color: "var(--app-danger)" }}>{error}</p>
      ) : null}
    </>
  );
}

function MessageBubble({ message }: { message: Message }) {
  const isUser = message.role === "user";
  const time = new Date(message.createdAt);
  const timeLabel = new Intl.DateTimeFormat("en-AU", { hour: "numeric", minute: "2-digit", hour12: true }).format(time);
  return (
    <li className={cn("flex flex-col", isUser ? "items-end" : "items-start")}>
      <div
        className="max-w-[80%] whitespace-pre-wrap rounded-[14px] px-4 py-2.5 text-[14.5px] leading-[1.5]"
        style={
          isUser
            ? { background: "var(--app-text)", color: "var(--app-bg)" }
            : { background: "var(--app-surface-soft)", color: "var(--app-text)", border: "1px solid var(--app-border)" }
        }
      >
        {message.content}
      </div>
      <span className="mt-1 px-1 text-[11px] font-mono" style={{ color: "var(--app-text-faint)" }}>
        {isUser ? "You" : "Arcad"} · {timeLabel}
      </span>
    </li>
  );
}

function ContextPanel({ data }: { data: DashboardResponse }) {
  const timezone = data.profile?.timezone || "Australia/Sydney";
  const pending = data.tasks.filter((t) => t.status === "pending");
  const totalMinutes = pending.reduce((s, t) => s + t.remainingMinutes, 0);
  return (
    <div className="rounded-[16px] p-6" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
      <p className="type-eyebrow" style={{ color: "var(--app-text-muted)" }}>What Arcad knows</p>
      <p className="mt-2 text-[14px]" style={{ color: "var(--app-text-muted)" }}>
        Every message is sent with this context so Arcad can plan around your real life — nothing generic.
      </p>

      <div className="mt-6 space-y-6">
        <ContextRow label="Student">
          <p className="text-[14.5px]" style={{ color: "var(--app-text)" }}>
            {data.user.name} · {data.profile?.grade || "Grade not set"}
          </p>
          <p className="mt-1 text-[12.5px] font-mono" style={{ color: "var(--app-text-muted)" }}>
            Timezone {timezone}
          </p>
        </ContextRow>
        <ContextRow label="Subjects">
          <div className="flex flex-wrap gap-1.5">
            {data.subjects.map((s) => (
              <span
                key={s.id}
                className="rounded-full px-2.5 py-1 text-[12px]"
                style={{
                  border: `1px solid ${s.colour || "var(--app-border)"}55`,
                  background: `${s.colour || "var(--app-border)"}0f`,
                  color: "var(--app-text-soft)",
                }}
              >
                {s.name}
              </span>
            ))}
          </div>
        </ContextRow>
        <ContextRow label="Open workload">
          <p className="text-[14.5px]" style={{ color: "var(--app-text)" }}>
            {pending.length} open {pending.length === 1 ? "task" : "tasks"} · {formatDurationMinutes(totalMinutes)}
          </p>
        </ContextRow>
        <ContextRow label="This week">
          <div className="grid grid-cols-3 gap-3">
            <Stat label="Streak" value={String(data.analytics?.currentStreak ?? 0)} />
            <Stat label="Today" value={`${data.analytics?.todayMinutes ?? 0} min`} />
            <Stat label="Week" value={`${data.analytics?.weekMinutes ?? 0} min`} />
          </div>
        </ContextRow>
        {data.focusTasks.length > 0 ? (
          <ContextRow label="Next deadlines">
            <ul className="flex flex-col gap-2">
              {data.focusTasks.slice(0, 3).map((task) => (
                <li key={task.id}>
                  <p className="text-[14px]" style={{ color: "var(--app-text)" }}>{task.title}</p>
                  <p className="text-[12px] font-mono" style={{ color: "var(--app-text-muted)" }}>
                    {task.subject ? `${task.subject} · ` : ""}
                    {formatDueSoon(task.dueAt, timezone)}
                  </p>
                </li>
              ))}
            </ul>
          </ContextRow>
        ) : null}
        <ContextRow label="Assistant">
          <p className="text-[13px]" style={{ color: "var(--app-text-muted)" }}>
            {data.assistant?.providerConfigured
              ? "OpenAI connected — Arcad interprets open-ended messages."
              : "Local mode — Arcad handles structured requests without a provider key."}
          </p>
        </ContextRow>
      </div>
    </div>
  );
}

function MiniContext({ data }: { data: DashboardResponse }) {
  return (
    <div className="rounded-[14px] p-4" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
      <p className="type-eyebrow" style={{ color: "var(--app-text-muted)" }}>Context</p>
      <ul className="mt-3 flex flex-col gap-2 text-[12.5px]" style={{ color: "var(--app-text-soft)" }}>
        <li className="flex justify-between">
          <span>Subjects</span>
          <span className="font-mono" style={{ color: "var(--app-text)" }}>{data.subjects.length}</span>
        </li>
        <li className="flex justify-between">
          <span>Open tasks</span>
          <span className="font-mono" style={{ color: "var(--app-text)" }}>{data.tasks.filter((t) => t.status === "pending").length}</span>
        </li>
        <li className="flex justify-between">
          <span>Streak</span>
          <span className="font-mono" style={{ color: "var(--app-text)" }}>{data.analytics?.currentStreak ?? 0}</span>
        </li>
        <li className="flex justify-between">
          <span>Today</span>
          <span className="font-mono" style={{ color: "var(--app-text)" }}>{data.analytics?.todayMinutes ?? 0} min</span>
        </li>
      </ul>
    </div>
  );
}

function ContextRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="type-eyebrow mb-2" style={{ color: "var(--app-text-muted)" }}>{label}</p>
      {children}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px]" style={{ color: "var(--app-text-muted)" }}>{label}</p>
      <p className="mt-1 text-[16px] font-mono font-medium" style={{ color: "var(--app-text)" }}>{value}</p>
    </div>
  );
}

function HistoryPanel({
  conversations, activeId, onSelect,
}: {
  conversations: Conversation[];
  activeId: string | null;
  onSelect: (id: string) => void;
}) {
  if (!conversations.length) {
    return (
      <div className="rounded-[16px] p-10 text-center" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
        <p className="text-[14.5px]" style={{ color: "var(--app-text-muted)" }}>No past conversations yet.</p>
      </div>
    );
  }
  return (
    <div className="rounded-[16px] overflow-hidden" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
      <ul className="divide-y" style={{ borderColor: "var(--app-border)" }}>
        {conversations.map((conv) => {
          const active = conv.id === activeId;
          return (
            <li key={conv.id}>
              <button
                type="button"
                onClick={() => onSelect(conv.id)}
                className="flex w-full items-center justify-between px-5 py-3.5 text-left transition-colors hover:bg-black/[0.02]"
                style={{ background: active ? "var(--app-accent-soft)" : "transparent" }}
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[14.5px] font-medium" style={{ color: active ? "var(--app-accent-strong)" : "var(--app-text)" }}>
                    {conv.title || "Untitled chat"}
                  </p>
                  <p className="mt-0.5 text-[12px] font-mono" style={{ color: "var(--app-text-muted)" }}>
                    {new Intl.DateTimeFormat("en-AU", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }).format(new Date(conv.updatedAt))}
                  </p>
                </div>
                {active ? (
                  <span className="ml-3 text-[11px] font-medium" style={{ color: "var(--app-accent-strong)" }}>Open</span>
                ) : null}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function ThinkingDots() {
  return (
    <span aria-hidden="true" className="flex gap-1">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="size-1.5 rounded-full animate-pulse"
          style={{ background: "var(--app-text-faint)", animationDelay: `${i * 0.15}s` }}
        />
      ))}
    </span>
  );
}
