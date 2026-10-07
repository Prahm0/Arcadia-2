"use client";

import Link from "next/link";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  blockRoomMember,
  deleteRoomMessage,
  listRoomMessages,
  reportRoomMessage,
  sendRoomMessage,
  type RoomFeedItem,
  type RoomMessage,
  type RoomReportReason,
  type StudyRoomMember,
} from "@/lib/api/rooms";
import AppButton from "../AppButton";
import { showContextMenu } from "../ContextMenu";
import { Avatar } from "../profile/ui";
import { CHEERS } from "@/shared/roomFeed";
import { feedText } from "./RoomActivity";
import { firstName, listNames } from "./format";

const REPORT_OPTIONS: Array<{ value: RoomReportReason; label: string }> = [
  { value: "bullying_harassment", label: "Bullying or harassment" },
  { value: "hateful_sexual", label: "Hateful or sexual content" },
  { value: "spam", label: "Spam" },
  { value: "other", label: "Something else" },
];

/** Room moments worth a line between messages. Starts and joins stay in Activity. */
const CHAT_EVENTS = new Set<RoomFeedItem["type"]>(["session", "cheer", "group", "goal", "milestone"]);

type Cheer = Extract<RoomFeedItem, { type: "cheer" }>;
type Line =
  | { kind: "message"; at: number; message: RoomMessage; continued: boolean }
  | { kind: "event"; at: number; item: RoomFeedItem }
  | { kind: "cheers"; at: number; items: Cheer[] };

/**
 * The room's chat, with what's happening in the room threaded through it:
 * finished sessions and cheers sit between messages as quiet one-liners.
 */
export default function RoomChat({ code, userId, ownerUserId, members, feed, onMemberClick }: {
  code: string;
  userId: string;
  ownerUserId: string;
  members: StudyRoomMember[];
  feed: RoomFeedItem[];
  onMemberClick: (userId: string) => void;
}) {
  const [messages, setMessages] = useState<RoomMessage[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [reporting, setReporting] = useState<RoomMessage | null>(null);
  const [reportReason, setReportReason] = useState<RoomReportReason>("bullying_harassment");
  const [reportNote, setReportNote] = useState("");
  const [reportingBusy, setReportingBusy] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const pinned = useRef(true);

  const load = useCallback(async () => {
    try {
      setMessages(await listRoomMessages(code));
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Couldn't load chat.");
    } finally {
      setLoaded(true);
    }
  }, [code]);

  useEffect(() => {
    const initialLoad = window.setTimeout(() => void load(), 0);
    const interval = window.setInterval(() => { if (!document.hidden) void load(); }, 10_000);
    return () => {
      window.clearTimeout(initialLoad);
      window.clearInterval(interval);
    };
  }, [load]);

  const memberIds = useMemo(() => new Set(members.map((member) => member.userId)), [members]);
  const people = useMemo(() => new Map(members.map((member) => [member.userId, member])), [members]);

  const lines = useMemo<Line[]>(() => {
    // Events only from around the conversation (an hour before its first
    // loaded message), so a quiet chat doesn't open on a wall of sessions.
    // With no messages yet, the last few moments set the scene.
    const since = messages.length ? Date.parse(messages[0].createdAt) - 3_600_000 : 0;
    const events: Line[] = feed
      .filter((item) => CHAT_EVENTS.has(item.type) && Date.parse(item.at) >= since)
      .slice(0, messages.length ? undefined : 5)
      .map((item) => ({ kind: "event", at: Date.parse(item.at), item }));
    const said: Line[] = messages.map((message) => ({ kind: "message", at: Date.parse(message.createdAt), message, continued: false }));
    const all = [...said, ...events].sort((a, b) => a.at - b.at);
    const out: Line[] = [];
    for (const line of all) {
      const previous = out[out.length - 1];
      // A run of cheers with no messages between them reads as one line.
      if (line.kind === "event" && line.item.type === "cheer") {
        if (previous?.kind === "cheers") previous.items.push(line.item);
        else out.push({ kind: "cheers", at: line.at, items: [line.item] });
        continue;
      }
      // Back-to-back messages from one person within a few minutes read as one.
      if (line.kind === "message" && previous?.kind === "message") {
        out.push({ ...line, continued: previous.message.userId === line.message.userId && line.at - previous.at < 5 * 60_000 });
        continue;
      }
      out.push(line);
    }
    return out;
  }, [messages, feed]);

  // Stay at the bottom as lines arrive, unless you've scrolled up to read.
  useLayoutEffect(() => {
    const element = scroller.current;
    if (element && pinned.current) element.scrollTop = element.scrollHeight;
  }, [lines]);

  async function send(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!body.trim()) return;
    setSending(true);
    setError(null);
    try {
      const message = await sendRoomMessage(code, body.trim());
      pinned.current = true;
      setMessages((current) => [...current.filter((item) => item.id !== message.id), message].slice(-50));
      setBody("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Couldn't send message.");
    } finally {
      setSending(false);
    }
  }

  async function remove(messageId: string) {
    try {
      await deleteRoomMessage(code, messageId);
      setMessages((current) => current.filter((message) => message.id !== messageId));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Couldn't remove message.");
    }
  }

  async function submitReport(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!reporting) return;
    setReportingBusy(true);
    try {
      const response = await reportRoomMessage(code, reporting.id, reportReason, reportNote.trim());
      setMessages((current) => current.filter((message) => message.id !== reporting.id));
      setReporting(null);
      setNotice(response.message);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Couldn't send that report.");
    } finally {
      setReportingBusy(false);
    }
  }

  async function block(message: RoomMessage) {
    if (!confirm(`Block ${message.displayName}? Their messages will be hidden in every room.`)) return;
    try {
      await blockRoomMember(code, message.userId);
      setMessages((current) => current.filter((item) => item.userId !== message.userId));
      setNotice(`${message.displayName} is blocked. You can unblock them in Settings.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Couldn't block that person.");
    }
  }

  function actionsFor(message: RoomMessage) {
    if (message.userId === userId) return [{ kind: "item" as const, label: "Delete message", onSelect: () => void remove(message.id) }];
    return [
      { kind: "item" as const, label: "Report message", onSelect: () => { setReporting(message); setReportReason("bullying_harassment"); setReportNote(""); } },
      { kind: "item" as const, label: "Block person", onSelect: () => void block(message) },
      ownerUserId === userId ? { kind: "separator" as const } : null,
      ownerUserId === userId ? { kind: "item" as const, label: "Delete message", onSelect: () => void remove(message.id) } : null,
    ];
  }

  return (
    <section aria-labelledby="room-chat-title" className="rounded-lg p-5" style={{ background: "var(--app-surface)", boxShadow: "var(--elev-1)" }}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 id="room-chat-title" className="text-[15px] font-semibold" style={{ color: "var(--app-text)" }}>Chat</h2>
        <p className="text-[12px]" style={{ color: "var(--app-text-faint)" }}>
          Members only. Be kind. <Link href="/support" className="underline underline-offset-2">Report anything that isn&apos;t okay.</Link>
        </p>
      </div>
      <div
        ref={scroller}
        onScroll={(event) => {
          const element = event.currentTarget;
          pinned.current = element.scrollHeight - element.scrollTop - element.clientHeight < 40;
        }}
        className="mt-3 flex max-h-[340px] min-h-[120px] flex-col overflow-y-auto pr-1"
        aria-live="polite"
      >
        {loaded && lines.length === 0 ? (
          <p className="my-auto text-center text-[13px]" style={{ color: "var(--app-text-muted)" }}>No messages yet. Say hi, or who&apos;s up for a session?</p>
        ) : (
          lines.map((line) =>
            line.kind === "cheers" ? (
              line.items.length === 1 ? (
                <EventLine key={line.items[0].id} item={line.items[0]} people={people} userId={userId} />
              ) : (
                <CheersLine key={line.items[0].id} items={line.items} people={people} userId={userId} />
              )
            ) : line.kind === "event" ? (
              <EventLine key={line.item.id} item={line.item} people={people} userId={userId} />
            ) : (
              <MessageLine
                key={line.message.id}
                message={line.message}
                continued={line.continued}
                member={people.get(line.message.userId)}
                isMember={memberIds.has(line.message.userId)}
                onMemberClick={onMemberClick}
                onMenu={(event) => showContextMenu(event, actionsFor(line.message), `${line.message.displayName}'s message`)}
              />
            ),
          )
        )}
      </div>
      {reporting ? <ReportForm reason={reportReason} note={reportNote} busy={reportingBusy} onReason={setReportReason} onNote={setReportNote} onCancel={() => setReporting(null)} onSubmit={submitReport} /> : null}
      <form onSubmit={send} className="mt-3 flex gap-2">
        <input
          value={body}
          onChange={(event) => setBody(event.target.value)}
          maxLength={500}
          placeholder="Message the room"
          aria-label="Message the room"
          className="min-w-0 flex-1 rounded-md px-3 py-2 text-[13px] outline-none"
          style={{ background: "var(--app-surface-soft)", boxShadow: "var(--elev-inset)", color: "var(--app-text)" }}
        />
        <AppButton type="submit" variant="primary" loading={sending} disabled={!body.trim()}>Send</AppButton>
      </form>
      {notice ? <p className="mt-2 text-[12px]" style={{ color: "var(--app-success)" }}>{notice}</p> : null}
      {error ? <p className="mt-2 text-[12px]" style={{ color: "var(--app-danger)" }}>{error}</p> : null}
    </section>
  );
}

function MessageLine({ message, continued, member, isMember, onMemberClick, onMenu }: {
  message: RoomMessage;
  continued: boolean;
  member: StudyRoomMember | undefined;
  isMember: boolean;
  onMemberClick: (userId: string) => void;
  onMenu: (event: React.MouseEvent) => void;
}) {
  return (
    <div onContextMenu={onMenu} className={`group flex gap-2.5 rounded-md px-1.5 py-0.5 hover:bg-[color-mix(in_oklab,var(--app-text)_3%,transparent)] ${continued ? "" : "mt-2.5 first:mt-0"}`}>
      <span className="w-6 shrink-0 pt-0.5">
        {continued ? null : <Avatar name={message.displayName} colour={member?.avatarColour} size={24} />}
      </span>
      <div className="min-w-0 flex-1">
        {continued ? null : (
          <div className="flex items-baseline gap-2 text-[12px]">
            {isMember ? (
              <button type="button" onClick={() => onMemberClick(message.userId)} className="font-semibold hover:underline" style={{ color: "var(--app-text)" }}>{message.displayName}</button>
            ) : (
              <span className="font-semibold" style={{ color: "var(--app-text)" }}>{message.displayName}</span>
            )}
            <time style={{ color: "var(--app-text-faint)" }} dateTime={message.createdAt}>
              {new Date(message.createdAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
            </time>
          </div>
        )}
        <p className="whitespace-pre-wrap break-words text-[13.5px] leading-snug" style={{ color: "var(--app-text-soft)" }}>{message.body}</p>
      </div>
      <button
        type="button"
        onClick={onMenu}
        // Touch screens have no hover, so the menu stays visible there; with a
        // mouse it appears on hover. The larger box makes it easy to hit.
        className="-mr-1 grid min-h-8 min-w-8 place-items-center self-start rounded text-[13px] transition-opacity focus-visible:opacity-100 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100"
        style={{ color: "var(--app-text-muted)" }}
        aria-label={`Actions for ${message.displayName}'s message`}
      >
        •••
      </button>
    </div>
  );
}

function EventLine({ item, people, userId }: { item: RoomFeedItem; people: Map<string, StudyRoomMember>; userId: string }) {
  const { text, detail } = feedText(item, people, userId);
  return (
    <div className="my-2.5 flex items-center gap-3 text-[12px]" style={{ color: "var(--app-text-muted)" }}>
      <span className="h-px flex-1" style={{ background: "var(--app-border)" }} aria-hidden="true" />
      <span className="max-w-[80%] text-center">
        {text}
        {detail ? <span style={{ color: "var(--app-text-faint)" }}> · {detail}</span> : null}
      </span>
      <span className="h-px flex-1" style={{ background: "var(--app-border)" }} aria-hidden="true" />
    </div>
  );
}

/** "Layla, you and Josh sent 5 cheers 🔥🫡⭐", with each one in the tooltip. */
function CheersLine({ items, people, userId }: { items: Cheer[]; people: Map<string, StudyRoomMember>; userId: string }) {
  const name = (id: string) => (id === userId ? "you" : firstName(people.get(id)?.displayName ?? "Someone"));
  const senders = [...new Set(items.map((item) => item.fromUserId))].map(name);
  const sentence = listNames(senders);
  const detail = items.map((item) => `${name(item.fromUserId)} → ${name(item.toUserId)} ${CHEERS[item.kind]?.emoji ?? ""}`).join("\n");
  return (
    <div className="my-2.5 flex items-center gap-3 text-[12px]" style={{ color: "var(--app-text-muted)" }} title={detail}>
      <span className="h-px flex-1" style={{ background: "var(--app-border)" }} aria-hidden="true" />
      <span className="max-w-[80%] text-center">
        <strong className="font-semibold" style={{ color: "var(--app-text)" }}>{sentence.charAt(0).toUpperCase() + sentence.slice(1)}</strong>
        {" "}sent {items.length} cheers{" "}
        <span aria-hidden="true">{[...new Set(items.map((item) => CHEERS[item.kind]?.emoji))].join("")}</span>
      </span>
      <span className="h-px flex-1" style={{ background: "var(--app-border)" }} aria-hidden="true" />
    </div>
  );
}

function ReportForm({ reason, note, busy, onReason, onNote, onCancel, onSubmit }: {
  reason: RoomReportReason;
  note: string;
  busy: boolean;
  onReason: (value: RoomReportReason) => void;
  onNote: (value: string) => void;
  onCancel: () => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
}) {
  return <form onSubmit={onSubmit} className="mt-4 rounded-md p-4" style={{ background: "var(--app-surface-soft)", boxShadow: "var(--elev-inset)" }}>
    <div className="flex items-start justify-between gap-3"><div><p className="text-[13px] font-medium" style={{ color: "var(--app-text)" }}>Report message</p><p className="mt-1 text-[12px]" style={{ color: "var(--app-text-muted)" }}>This message will be hidden for you. We review reports within 24 hours.</p></div><button type="button" onClick={onCancel} className="text-[12px] underline underline-offset-2" style={{ color: "var(--app-text-muted)" }}>Cancel</button></div>
    <div className="mt-3 grid gap-2 sm:grid-cols-2">{REPORT_OPTIONS.map((option) => <label key={option.value} className="flex cursor-pointer items-center gap-2 rounded-md px-2.5 py-2 text-[12px]" style={{ background: reason === option.value ? "var(--app-accent-soft)" : "var(--app-surface)", color: "var(--app-text-soft)" }}><input type="radio" name="report-reason" value={option.value} checked={reason === option.value} onChange={() => onReason(option.value)} />{option.label}</label>)}</div>
    <textarea value={note} onChange={(event) => onNote(event.target.value)} maxLength={300} rows={2} placeholder="Add a note (optional)" className="mt-3 w-full rounded-md px-3 py-2 text-[13px] outline-none" style={{ background: "var(--app-surface)", color: "var(--app-text)" }} />
    <div className="mt-3"><AppButton type="submit" variant="primary" loading={busy}>Send report</AppButton></div>
  </form>;
}
