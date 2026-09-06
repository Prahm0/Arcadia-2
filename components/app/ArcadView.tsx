"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/lib/api/client";
import { useDashboardData } from "@/lib/app/DashboardProvider";
import { cn } from "@/lib/cn";
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

interface ChatState {
  conversationId: string | null;
  messages: Message[];
  proposals: Proposal[];
}

const SUGGESTIONS = [
  "Move my chemistry session to tomorrow",
  "How much have I studied this week?",
  "Add an English essay due Friday, 90 minutes",
  "I'm running out of time — what should I drop?",
];

export default function ArcadView() {
  const { reload } = useDashboardData();
  const [state, setState] = useState<ChatState>({ conversationId: null, messages: [], proposals: [] });
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    (async () => {
      try {
        const response = await api<{ conversationId: string; messages: Message[]; proposals: Proposal[] }>("/api/chat");
        setState(response);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load chat.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [state.messages]);

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
              if (event.schedule || event.action) void reload();
            } else if (event.type === "error") {
              setError(event.message || "Arcad couldn't respond.");
            }
          } catch {
            /* skip malformed lines */
          }
        }
      }
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

  return (
    <>
      <PageHeader
        eyebrow="Arcad"
        title="Your planning partner."
        meta="Ask about your week, request changes, or think out loud."
      />
      <div className="mx-auto flex w-full max-w-[820px] flex-col gap-4 px-6 py-8 sm:px-10">
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
                  <AppButton variant="primary" onClick={() => respondToProposal(proposal.id, "apply")}>Apply</AppButton>
                  <AppButton variant="ghost" onClick={() => respondToProposal(proposal.id, "decline")}>Decline</AppButton>
                </div>
              </div>
            ))}
          </div>
        ) : null}

        <div
          ref={listRef}
          className="max-h-[60vh] min-h-[320px] overflow-y-auto rounded-[16px] p-5 sm:p-6"
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
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => send(s)}
                    className="rounded-full px-3 py-1.5 text-[12.5px] transition-colors"
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
                <li
                  key={msg.id}
                  className={cn("flex", msg.role === "user" ? "justify-end" : "justify-start")}
                >
                  <div
                    className="max-w-[80%] whitespace-pre-wrap rounded-[14px] px-4 py-2.5 text-[14.5px] leading-[1.5]"
                    style={
                      msg.role === "user"
                        ? { background: "var(--app-text)", color: "var(--app-bg)" }
                        : { background: "var(--app-surface-soft)", color: "var(--app-text)", border: "1px solid var(--app-border)" }
                    }
                  >
                    {msg.content}
                  </div>
                </li>
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

        <form
          onSubmit={(e) => {
            e.preventDefault();
            send(message);
          }}
          className="flex items-end gap-2 rounded-[14px] p-2"
          style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}
        >
          <textarea
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
          <AppButton type="submit" variant="primary" loading={sending} disabled={!message.trim()}>Send</AppButton>
        </form>
      </div>
    </>
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
