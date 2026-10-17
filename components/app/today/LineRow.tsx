"use client";

import { useRef, useState } from "react";
import { tap } from "@/lib/capacitor/haptics";
import { showContextMenu } from "../ContextMenu";

const ACTIONS_WIDTH = 168;
const LONG_PRESS_MS = 450;

/**
 * One of the student's own lines in Today's note: a circle to tick, the
 * time if it has one, the text and its note. Swipe left (or long press) for
 * Tomorrow and Delete; on a computer they show on hover and on right click.
 * Tapping the text opens its note.
 */
export default function LineRow({
  flipId,
  title,
  time,
  note,
  done,
  busy,
  onToggle,
  onTomorrow,
  onDelete,
  onNote,
}: {
  /** For the slide-into-place animation (lib/app/useFlip). */
  flipId: string;
  title: string;
  time: string | null;
  note: string;
  done: boolean;
  busy?: boolean;
  onToggle: () => void;
  onTomorrow: () => void;
  onDelete: () => void;
  onNote: (note: string) => void;
}) {
  const [offset, setOffset] = useState(0);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(note);
  const gesture = useRef<{ x: number; y: number; dx: number; pressed: boolean; timer: number | null } | null>(null);
  // The click a browser sends when a long press or swipe ends shouldn't also open the note.
  const swallowClick = useRef(false);
  const lastPointer = useRef<string>("mouse");

  function close() {
    setOpen(false);
    setOffset(0);
  }

  function onPointerDown(event: React.PointerEvent) {
    lastPointer.current = event.pointerType;
    if (event.pointerType === "mouse") return;
    const timer = window.setTimeout(() => {
      if (!gesture.current) return;
      gesture.current.pressed = true;
      swallowClick.current = true;
      void tap();
      setOpen(true);
      setOffset(-ACTIONS_WIDTH);
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
      setOffset(Math.max(-ACTIONS_WIDTH - 24, Math.min(0, (open ? -ACTIONS_WIDTH : 0) + dx)));
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
      const shouldOpen = (open ? -ACTIONS_WIDTH : 0) + current.dx < -ACTIONS_WIDTH / 2;
      setOpen(shouldOpen);
      setOffset(shouldOpen ? -ACTIONS_WIDTH : 0);
    }
  }

  function saveNote() {
    setEditing(false);
    if (draft.trim() !== note) onNote(draft.trim());
  }

  return (
    <li
      data-flip-id={flipId}
      className="group relative overflow-hidden rounded-md"
      onContextMenu={(event) => {
        // A long press on a phone opens the swipe actions instead.
        if (lastPointer.current !== "mouse") {
          event.preventDefault();
          return;
        }
        showContextMenu(
          event,
          [
            { kind: "item", label: "Move to tomorrow", onSelect: onTomorrow },
            { kind: "item", label: note ? "Edit note" : "Add a note", onSelect: () => setEditing(true) },
            { kind: "item", label: "Delete", onSelect: onDelete },
          ],
          title,
        );
      }}
    >
      {/* Revealed by the swipe. Only there while swiping, so it can't show through the row's rounded edge. */}
      {offset !== 0 || open ? (
      <div className="absolute inset-y-0 right-0 flex" style={{ width: ACTIONS_WIDTH }}>
        <button
          type="button"
          onClick={() => { close(); onTomorrow(); }}
          className="flex-1 text-[13px] font-semibold"
          style={{ background: "var(--app-surface-soft)", color: "var(--app-text)" }}
        >
          Tomorrow
        </button>
        <button
          type="button"
          onClick={() => { close(); onDelete(); }}
          className="flex-1 text-[13px] font-semibold"
          style={{ background: "var(--app-danger)", color: "white" }}
        >
          Delete
        </button>
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
        <button
          type="button"
          onClick={() => {
            if (swallowClick.current) {
              swallowClick.current = false;
              return;
            }
            if (open) close();
            else setEditing((value) => !value);
          }}
          className="flex min-w-0 flex-1 items-baseline gap-3 rounded-md px-3 py-3 text-left"
        >
          <span className="min-w-0 flex-1">
            <span
              className="block text-[15px] leading-snug"
              style={{ color: done ? "var(--app-text-muted)" : "var(--app-text)", textDecoration: done ? "line-through" : undefined }}
            >
              {title}
            </span>
            {note && !editing ? (
              <span className="mt-0.5 block whitespace-pre-line text-[13px] leading-snug" style={{ color: "var(--app-text-muted)" }}>
                {note}
              </span>
            ) : null}
          </span>
          {time ? (
            <span className="shrink-0 text-[12.5px] tabular-nums" style={{ color: "var(--app-text-muted)" }}>
              {time}
            </span>
          ) : null}
        </button>

        <span className="hidden shrink-0 items-center gap-2 self-center opacity-0 transition-opacity group-hover:opacity-100 lg:flex">
          <button type="button" onClick={onTomorrow} className="text-[11px] hover:underline" style={{ color: "var(--app-text-muted)" }}>
            Tomorrow
          </button>
          <button type="button" onClick={onDelete} className="text-[11px] hover:underline" style={{ color: "var(--app-text-muted)" }}>
            Delete
          </button>
        </span>

        <button
          type="button"
          onClick={onToggle}
          disabled={busy}
          aria-label={done ? `Mark ${title} as not done` : `Mark ${title} as done`}
          aria-pressed={done}
          className="flex size-11 shrink-0 items-center justify-center self-center rounded-md sm:size-9"
        >
          <span
            aria-hidden="true"
            className="grid size-[24px] place-items-center rounded-full transition-colors duration-200 sm:size-[20px]"
            style={{
              background: done ? "var(--app-accent)" : "var(--app-surface)",
              border: `1.5px solid ${done ? "var(--app-accent)" : "var(--app-border-strong)"}`,
              color: done ? "var(--app-accent-on)" : "transparent",
            }}
          >
            <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
              <path d="M1 4l2.5 2.5L9 1" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
        </button>
      </div>

      {editing ? (
        <div className="px-3 pb-3">
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
