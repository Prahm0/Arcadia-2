"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/cn";
import SessionTodos, { type TodoItem } from "./SessionTodos";
import { resizePip } from "./useDocumentPip";

export const PIP_WIDTH = 320;
export const PIP_COMPACT_HEIGHT = 148;
export const PIP_EXPANDED_HEIGHT = 460;

interface PipTimerProps {
  win: Window;
  phase: "focus" | "break" | "idle";
  clock: string;
  progress: number;
  running: boolean;
  subject: string;
  accent: string;
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
  onPlay: () => void;
  onPause: () => void;
  onSkip: () => void;
  todos: TodoItem[];
  onToggleTodo: (key: string) => void;
  onAddTodo: (text: string) => void;
  onRemoveTodo: (key: string) => void;
}

/**
 * The timer, shrunk into a window the student can park anywhere on their
 * desktop. Tap the clock and it opens into the session's to-do list; tap it
 * again and it tucks back down.
 */
export default function PipTimer(props: PipTimerProps) {
  const { win, phase, clock, progress, running, subject, accent, expanded, onExpandedChange, onPlay, onPause, onSkip, todos } = props;
  const done = todos.filter((item) => item.done).length;
  const phaseColour = phase === "break" ? "var(--app-success)" : accent;

  function toggleExpanded() {
    const next = !expanded;
    onExpandedChange(next);
    resizePip(win, PIP_WIDTH, next ? PIP_EXPANDED_HEIGHT : PIP_COMPACT_HEIGHT);
  }

  // Space plays and pauses, as long as you're not typing a to-do.
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key !== " ") return;
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "BUTTON")) return;
      event.preventDefault();
      if (running) onPause();
      else onPlay();
    }
    win.document.addEventListener("keydown", onKey);
    return () => win.document.removeEventListener("keydown", onKey);
  }, [win, running, onPlay, onPause]);

  return createPortal(
    <div className="flex h-screen flex-col overflow-hidden" style={{ background: "var(--app-bg)", color: "var(--app-text)" }}>
      <div className="flex shrink-0 items-center gap-2 px-3 pt-3">
        <button
          type="button"
          onClick={toggleExpanded}
          aria-expanded={expanded}
          title={expanded ? "Hide to-dos" : "Show to-dos"}
          className="ui-press group flex min-w-0 flex-1 flex-col items-start rounded-lg px-2 py-1 text-left hover:bg-[color-mix(in_oklab,var(--app-text)_5%,transparent)]"
        >
          <span className="flex w-full items-center gap-1.5 text-[11.5px] font-medium" style={{ color: "var(--app-text-muted)" }}>
            <span className={cn(running && "app-breathe")} style={{ color: running ? phaseColour : undefined }}>
              {phase === "break" ? "Break" : phase === "focus" ? "Focus" : "Ready"}
            </span>
            <span aria-hidden="true">·</span>
            <span className="truncate">{subject}</span>
          </span>
          <span className="flex w-full items-center gap-2">
            <span className="text-[40px] font-medium leading-[1.1] tabular-nums tracking-[-0.03em]">{clock}</span>
            <span
              className="ml-auto flex items-center gap-1 rounded-full px-2 py-0.5 text-[11.5px] tabular-nums"
              style={{ background: "color-mix(in oklab, var(--app-text) 6%, transparent)", color: "var(--app-text-soft)" }}
            >
              {todos.length ? `${done}/${todos.length}` : "To-do"}
              <svg
                viewBox="0 0 12 12" width="10" height="10" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
                className="transition-transform duration-300 ease-[var(--ease-out-expo)]"
                style={{ transform: expanded ? "rotate(180deg)" : undefined }}
              >
                <path d="M3 4.5 6 7.5l3-3" />
              </svg>
            </span>
          </span>
        </button>

        <div className="flex shrink-0 flex-col gap-1.5">
          <button
            type="button"
            onClick={running ? onPause : onPlay}
            aria-label={running ? "Pause" : phase === "idle" ? "Start" : "Resume"}
            className="ui-press grid h-10 w-10 place-items-center rounded-full"
            style={{ background: phaseColour, color: "var(--app-accent-on)" }}
          >
            <PlayPauseIcon running={running} />
          </button>
          <button
            type="button"
            onClick={onSkip}
            disabled={phase === "idle"}
            aria-label={phase === "break" ? "Skip break" : "Skip to break"}
            className="ui-press mx-auto grid h-7 w-7 place-items-center rounded-full disabled:opacity-40"
            style={{ color: "var(--app-text-muted)", boxShadow: "inset 0 0 0 1px var(--app-border)" }}
          >
            <svg viewBox="0 0 12 12" width="10" height="10" fill="currentColor" aria-hidden="true">
              <path d="M2 2.5v7l5-3.5zM8 2.5h1.5v7H8z" />
            </svg>
          </button>
        </div>
      </div>

      <div className="mx-5 mt-2 h-1 shrink-0 overflow-hidden rounded-full" style={{ background: "var(--app-border)" }}>
        <div className="h-full rounded-full transition-[width] duration-1000 ease-linear" style={{ width: `${Math.min(1, Math.max(0, progress)) * 100}%`, background: phaseColour }} />
      </div>

      {expanded ? (
        <SessionTodos
          compact
          items={todos}
          accent={accent}
          onToggle={props.onToggleTodo}
          onAdd={props.onAddTodo}
          onRemove={props.onRemoveTodo}
          className="app-enter mt-3 min-h-0 flex-1 px-3 pb-3"
        />
      ) : null}
    </div>,
    win.document.body,
  );
}

export function PlayPauseIcon({ running, size = 14 }: { running: boolean; size?: number }) {
  return (
    <svg key={running ? "pause" : "play"} viewBox="0 0 14 14" width={size} height={size} fill="currentColor" aria-hidden="true" className="app-pop">
      {running ? <path d="M3.5 2.5h2.5v9H3.5zM8 2.5h2.5v9H8z" /> : <path d="M4 2.2v9.6L11.5 7z" />}
    </svg>
  );
}
