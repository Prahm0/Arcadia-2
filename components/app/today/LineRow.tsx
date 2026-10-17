"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { tap } from "@/lib/capacitor/haptics";
import CompletionBurst from "../CompletionBurst";
import { showContextMenu } from "../ContextMenu";

const ACTION_WIDTH = 84;
const LONG_PRESS_MS = 450;

export interface RowAction {
  label: string;
  onSelect: () => void;
  danger?: boolean;
}

/**
 * Every row on Today looks the same, whoever wrote it: the time on the left,
 * the title with a small subject dot, an optional grey note under it, and
 * the circle to tick on the right. Blocks Arcadia planned get a tiny spark.
 * Swipe left (or long press) for the row's actions; on a computer they show
 * on hover and on right click. Tapping the title opens the note, or the
 * session for a planned block.
 */
export default function LineRow({
  flipId,
  title,
  time,
  subtime,
  dot,
  spark,
  note,
  done,
  muted,
  busy,
  href,
  celebrate = 0,
  fresh,
  index = 0,
  actions,
  onToggle,
  onNote,
}: {
  /** For the slide-into-place animation (lib/app/useFlip). */
  flipId: string;
  title: string;
  time: string | null;
  /** Under the time, smaller: a block's length. */
  subtime?: string;
  /** The subject's colour, when the row has a subject. */
  dot?: string | null;
  /** Arcadia planned this one. */
  spark?: boolean;
  note: string;
  done: boolean;
  /** Missed: greyed like done, without the tick. */
  muted?: boolean;
  busy?: boolean;
  /** Tapping the title goes here instead of opening the note. */
  href?: string;
  celebrate?: number;
  /** Just added: it drops in, and its time and subject pop into place. */
  fresh?: boolean;
  /** Position in the list, for the staggered entrance. */
  index?: number;
  actions: RowAction[];
  onToggle: () => void;
  onNote?: (note: string) => void;
}) {
  const [offset, setOffset] = useState(0);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(note);
  const gesture = useRef<{ x: number; y: number; dx: number; pressed: boolean; timer: number | null } | null>(null);
  // The click a browser sends when a long press or swipe ends shouldn't also open the note.
  const swallowClick = useRef(false);
  const lastPointer = useRef<string>("mouse");
  const width = ACTION_WIDTH * actions.length;
  const faded = done || muted;

  function close() {
    setOpen(false);
    setOffset(0);
  }

  function onPointerDown(event: React.PointerEvent) {
    lastPointer.current = event.pointerType;
    if (event.pointerType === "mouse" || !actions.length) return;
    const timer = window.setTimeout(() => {
      if (!gesture.current) return;
      gesture.current.pressed = true;
      swallowClick.current = true;
      void tap();
      setOpen(true);
      setOffset(-width);
    }, LONG_PRESS_MS);
    gesture.current = { x: event.clientX, y: event.clientY, dx: 0, pressed: false, timer };
  }

  function onPointerMove(event: React.PointerEvent) {
    const current = gesture.current;
    if (!current) return;
    const dx = event.clientX - current.x;
    const dy = event.clientY - current.y;
    if (Math.abs(dx) > 8 || Math.abs(dy) > 8) {
      if (current.timer) window.clearTimeout(current.timer);
      current.timer = null;
    }
    // A sideways drag swipes; a vertical one is the page scrolling.
    if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 8) {
      current.dx = dx;
      setOffset(Math.max(-width - 24, Math.min(0, (open ? -width : 0) + dx)));
    }
  }

  function onPointerUp() {
    const current = gesture.current;
    gesture.current = null;
    if (!current) return;
    if (current.timer) window.clearTimeout(current.timer);
    if (current.pressed) return;
    if (current.dx !== 0) {
      swallowClick.current = true;
      const shouldOpen = (open ? -width : 0) + current.dx < -width / 2;
      setOpen(shouldOpen);
      setOffset(shouldOpen ? -width : 0);
    }
  }

  function saveNote() {
    setEditing(false);
    if (onNote && draft.trim() !== note) onNote(draft.trim());
  }

  function onTitle(event: React.MouseEvent) {
    if (swallowClick.current) {
      swallowClick.current = false;
      event.preventDefault();
      return;
    }
    if (open) {
      event.preventDefault();
      close();
    } else if (!href) {
      setEditing((value) => !value);
    }
  }

  const titleContent = (
    <>
      <span className={`w-[62px] shrink-0 pt-px text-[12.5px] tabular-nums leading-snug ${fresh && time ? "arcadia-pop-in" : ""}`} style={{ color: "var(--app-text-muted)" }}>
        {time}
        {subtime ? <span className="block text-[11px]" style={{ color: "var(--app-text-faint)" }}>{subtime}</span> : null}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          {dot ? <span aria-hidden="true" className={`size-[7px] shrink-0 rounded-full ${fresh ? "arcadia-pop-in" : ""}`} style={{ background: dot, opacity: faded ? 0.5 : 1 }} /> : null}
          <span
            className="min-w-0 text-[15px] leading-snug"
            style={{ color: faded ? "var(--app-text-muted)" : "var(--app-text)", textDecoration: done ? "line-through" : undefined }}
          >
            {title}
          </span>
          {spark ? (
            <svg aria-label="Planned by Arcadia" role="img" width="10" height="10" viewBox="0 0 10 10" className="shrink-0" style={{ color: "var(--app-arcad)", opacity: faded ? 0.5 : 0.8 }}>
              <path d="M5 0C5.4 2.9 7.1 4.6 10 5 7.1 5.4 5.4 7.1 5 10 4.6 7.1 2.9 5.4 0 5 2.9 4.6 4.6 2.9 5 0Z" fill="currentColor" />
            </svg>
          ) : null}
        </span>
        {note && !editing ? (
          <span className="mt-0.5 block whitespace-pre-line text-[13px] leading-snug" style={{ color: "var(--app-text-muted)" }}>
            {note}
          </span>
        ) : null}
      </span>
    </>
  );
  const titleClass = "flex min-w-0 flex-1 items-start gap-2 rounded-md px-3 py-3 text-left";

  return (
    <li
      data-flip-id={flipId}
      className={`group relative overflow-hidden rounded-md ${fresh ? "arcadia-drop" : ""}`}
      style={{ ["--i" as string]: index }}
      onContextMenu={(event) => {
        // A long press on a phone opens the swipe actions instead.
        if (lastPointer.current !== "mouse") {
          event.preventDefault();
          return;
        }
        showContextMenu(
          event,
          [
            ...actions.map((action) => ({ kind: "item" as const, label: action.label, onSelect: action.onSelect })),
            onNote ? { kind: "item" as const, label: note ? "Edit note" : "Add a note", onSelect: () => setEditing(true) } : false,
          ],
          title,
        );
      }}
    >
      {/* Revealed by the swipe. Only there while swiping, so it can't show through the row's rounded edge. */}
      {offset !== 0 || open ? (
        <div className="absolute inset-y-0 right-0 flex" style={{ width }}>
          {actions.map((action) => (
            <button
              key={action.label}
              type="button"
              onClick={() => { close(); action.onSelect(); }}
              className="flex-1 text-[13px] font-semibold"
              style={action.danger ? { background: "var(--app-danger)", color: "white" } : { background: "var(--app-surface-soft)", color: "var(--app-text)" }}
            >
              {action.label}
            </button>
          ))}
        </div>
      ) : null}

      <div
        className="relative flex items-start gap-1 pr-2 transition-transform duration-200 ease-out"
        style={{ transform: `translateX(${offset}px)`, background: "var(--app-surface)", touchAction: "pan-y", WebkitTouchCallout: "none", userSelect: "none" }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        {href ? (
          <Link href={href} onClick={onTitle} className={titleClass}>{titleContent}</Link>
        ) : (
          <button type="button" onClick={onTitle} className={titleClass}>{titleContent}</button>
        )}

        <span className="hidden shrink-0 items-center gap-2 self-center opacity-0 transition-opacity group-hover:opacity-100 lg:flex">
          {actions.map((action) => (
            <button key={action.label} type="button" onClick={action.onSelect} className="text-[11px] hover:underline" style={{ color: "var(--app-text-muted)" }}>
              {action.label}
            </button>
          ))}
        </span>

        <button
          type="button"
          onClick={onToggle}
          disabled={busy || muted}
          aria-label={done ? `Mark ${title} as not done` : `Mark ${title} as done`}
          aria-pressed={done}
          className="flex size-11 shrink-0 items-center justify-center self-center rounded-md sm:size-9"
        >
          <CompletionBurst trigger={celebrate} colour={dot}>
            <span
              aria-hidden="true"
              className="grid size-[24px] place-items-center rounded-full transition-colors duration-200 sm:size-[20px]"
              style={{
                background: done ? "var(--app-accent)" : "var(--app-surface)",
                border: `1.5px solid ${done ? "var(--app-accent)" : "var(--app-border-strong)"}`,
                color: done ? "var(--app-accent-on)" : "transparent",
                opacity: muted ? 0.4 : 1,
              }}
            >
              <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                <path d="M1 4l2.5 2.5L9 1" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
          </CompletionBurst>
        </button>
      </div>

      {editing && onNote ? (
        <div className="px-3 pb-3 pl-[82px]">
          <textarea
            autoFocus
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onBlur={saveNote}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                saveNote();
              } else if (event.key === "Escape") {
                setDraft(note);
                setEditing(false);
              }
            }}
            rows={2}
            placeholder="Add a note"
            className="w-full resize-none rounded-md px-3 py-2 text-[13.5px] outline-none"
            style={{ background: "var(--app-surface-soft)", color: "var(--app-text)" }}
          />
        </div>
      ) : null}
    </li>
  );
}
