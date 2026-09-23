"use client";

import Link from "next/link";
import { Fragment, useEffect, useState, type ReactNode } from "react";
import ArcadOrb from "../ArcadOrb";
import { copyText, showContextMenu } from "../ContextMenu";
import type { ChatMessage } from "./types";

/**
 * One turn in the thread. Your messages sit on the right in a soft bubble;
 * Arcad's are plain text on the page, like a reply you'd read, with copy and
 * the time underneath. `children` is whatever hangs off the reply: a plan
 * change to apply, or the memory chip.
 */
export function MessageRow({
  message,
  showMark,
  reveal,
  onRevealed,
  onRetry,
  onEdit,
  children,
}: {
  message: ChatMessage;
  /** First reply in a run gets Arcad's mark, so the thread doesn't repeat it. */
  showMark: boolean;
  /** Type the reply out: only for one that just arrived. */
  reveal?: boolean;
  onRevealed?: () => void;
  onRetry?: () => void;
  onEdit?: () => void;
  children?: ReactNode;
}) {
  // Selected text and links keep the browser's menu; this is for copying the lot.
  const onContextMenu = (event: React.MouseEvent) => {
    if ((event.target as Element).closest("a[href]")) return;
    showContextMenu(
      event,
      [
        { kind: "item", label: "Copy message", onSelect: () => void copyText(message.content) },
        { kind: "separator" },
        message.failed && onRetry && { kind: "item", label: "Try again", onSelect: onRetry },
        message.failed && onEdit && { kind: "item", label: "Edit", onSelect: onEdit },
      ],
      message.role === "user" ? "Your message" : "Arcad's reply",
    );
  };

  if (message.role === "user") {
    return (
      <li className="flex flex-col items-end">
        <div
          onContextMenu={onContextMenu}
          className="max-w-[85%] whitespace-pre-wrap break-words rounded-[14px] px-3.5 py-2 text-[15px] leading-[1.55]"
          style={{
            background: "color-mix(in oklab, var(--app-text) 7%, var(--app-surface))",
            color: "var(--app-text)",
            opacity: message.failed ? 0.6 : 1,
          }}
        >
          {message.content}
        </div>
        {message.failed ? (
          <div className="mt-1.5 flex items-center gap-3 text-[12.5px]">
            <span style={{ color: "var(--app-danger)" }}>Didn&apos;t send.</span>
            {onRetry ? (
              <button type="button" onClick={onRetry} className="font-medium hover:underline" style={{ color: "var(--app-text)" }}>
                Try again
              </button>
            ) : null}
            {onEdit ? (
              <button type="button" onClick={onEdit} className="font-medium hover:underline" style={{ color: "var(--app-text-muted)" }}>
                Edit
              </button>
            ) : null}
          </div>
        ) : null}
      </li>
    );
  }

  return (
    <li className="group flex gap-3">
      <span className="mt-0.5 w-6 shrink-0">{showMark ? <ArcadOrb size={24} /> : null}</span>
      <div className="min-w-0 flex-1">
        {reveal ? (
          <Typewriter text={message.content} onDone={onRevealed} />
        ) : (
          <div onContextMenu={onContextMenu}>
            <ArcadText text={message.content} />
          </div>
        )}
        {!reveal ? (
          <>
            {message.remembered?.length ? (
              <Link
                href="/app/profile#arcad"
                title={message.remembered.join("\n")}
                className="mt-2 inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[12px] ui-hover"
                style={{ color: "var(--app-arcad-strong)", boxShadow: "inset 0 0 0 1px color-mix(in oklab, var(--app-arcad) 30%, transparent)" }}
              >
                <svg viewBox="0 0 20 20" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M4 10.5l4 4 8-9" />
                </svg>
                Remembered: {message.remembered[0]}
                {message.remembered.length > 1 ? ` +${message.remembered.length - 1}` : ""}
              </Link>
            ) : null}
            {children}
            <MessageActions message={message} />
          </>
        ) : null}
      </div>
    </li>
  );
}

function MessageActions({ message }: { message: ChatMessage }) {
  const [copied, setCopied] = useState(false);
  const time = new Intl.DateTimeFormat("en-AU", { hour: "numeric", minute: "2-digit", hour12: true }).format(
    new Date(message.createdAt),
  );

  async function copy() {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch {
      /* clipboard blocked; nothing useful to say */
    }
  }

  return (
    <div className="mt-1 flex h-7 items-center gap-1 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
      <button
        type="button"
        onClick={() => void copy()}
        aria-label={copied ? "Copied" : "Copy reply"}
        title={copied ? "Copied" : "Copy"}
        className="grid h-7 w-7 place-items-center rounded-md ui-hover"
        style={{ color: "var(--app-text-muted)" }}
      >
        {copied ? (
          <svg viewBox="0 0 20 20" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M4 10.5l4 4 8-9" />
          </svg>
        ) : (
          <svg viewBox="0 0 20 20" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" aria-hidden="true">
            <rect x="7" y="7" width="9" height="9" rx="1.5" />
            <path d="M13 7V5.5A1.5 1.5 0 0011.5 4h-6A1.5 1.5 0 004 5.5v6A1.5 1.5 0 005.5 13H7" />
          </svg>
        )}
      </button>
      <span className="text-[11.5px] tabular-nums" style={{ color: "var(--app-text-faint)" }}>
        {time}
      </span>
    </div>
  );
}

/** Things Arcad actually does before it answers, shown in turn while it thinks. */
const THINKING = ["Looking at what's due", "Checking your subjects", "Working it out"];

export function ThinkingRow() {
  const [step, setStep] = useState(0);
  useEffect(() => {
    const timer = window.setInterval(() => setStep((s) => Math.min(s + 1, THINKING.length - 1)), 1600);
    return () => window.clearInterval(timer);
  }, []);
  return (
    <li className="flex items-center gap-3" aria-live="polite">
      <span className="w-6 shrink-0">
        <ArcadOrb size={24} state="thinking" />
      </span>
      <span className="arcad-shimmer text-[14px]" style={{ color: "var(--app-text-muted)" }}>
        {THINKING[step]}…
      </span>
    </li>
  );
}

/** Types a fresh reply out word by word. Skipped for people who ask for less motion. */
function Typewriter({ text, onDone }: { text: string; onDone?: () => void }) {
  const words = text.split(/(\s+)/);
  const [reduced] = useState(() => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false);
  const [shown, setShown] = useState(reduced ? words.length : 0);

  useEffect(() => {
    if (reduced) {
      onDone?.();
      return;
    }
    let i = 0;
    const timer = window.setInterval(() => {
      i += 2;
      setShown(i);
      if (i >= words.length) {
        window.clearInterval(timer);
        onDone?.();
      }
    }, 28);
    return () => window.clearInterval(timer);
    // Runs once per reply.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);

  return <ArcadText text={words.slice(0, shown).join("")} />;
}

/**
 * Arcad replies are short, but sometimes carry up to three steps. Renders
 * paragraphs, "-" or "1." lists and **bold**; nothing else.
 */
export function ArcadText({ text }: { text: string }) {
  const blocks: Array<{ type: "p"; lines: string[] } | { type: "ul" | "ol"; items: string[] }> = [];
  for (const raw of text.split("\n")) {
    const line = raw.trimEnd();
    const bullet = line.match(/^\s*[-*•]\s+(.*)$/);
    const numbered = line.match(/^\s*\d+[.)]\s+(.*)$/);
    const last = blocks[blocks.length - 1];
    if (bullet || numbered) {
      const type = bullet ? "ul" : "ol";
      const item = (bullet ?? numbered)![1];
      if (last && last.type === type) last.items.push(item);
      else blocks.push({ type, items: [item] });
    } else if (!line.trim()) {
      blocks.push({ type: "p", lines: [] });
    } else if (last && last.type === "p") {
      last.lines.push(line);
    } else {
      blocks.push({ type: "p", lines: [line] });
    }
  }

  return (
    <div className="flex flex-col gap-2 text-[15px] leading-[1.6]" style={{ color: "var(--app-text)" }}>
      {blocks.map((block, index) => {
        if (block.type === "p") {
          if (!block.lines.length) return null;
          return (
            <p key={index} className="whitespace-pre-wrap break-words">
              {block.lines.map((line, i) => (
                <Fragment key={i}>
                  {i ? "\n" : null}
                  <Inline text={line} />
                </Fragment>
              ))}
            </p>
          );
        }
        const List = block.type;
        return (
          <List key={index} className={`flex flex-col gap-1 pl-5 ${block.type === "ul" ? "list-disc" : "list-decimal"}`}>
            {block.items.map((item, i) => (
              <li key={i} className="pl-0.5 marker:text-[var(--app-text-muted)]">
                <Inline text={item} />
              </li>
            ))}
          </List>
        );
      })}
    </div>
  );
}

function Inline({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return (
    <>
      {parts.map((part, i) =>
        part.startsWith("**") && part.endsWith("**") && part.length > 4 ? (
          <strong key={i} className="font-semibold">
            {part.slice(2, -2)}
          </strong>
        ) : (
          <Fragment key={i}>{part}</Fragment>
        ),
      )}
    </>
  );
}
