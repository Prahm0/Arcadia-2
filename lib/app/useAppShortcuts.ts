"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { GO_TARGETS, isTypingTarget } from "./commands";

interface Handlers {
  onNewTask: () => void;
  onShowShortcuts: () => void;
  onToggleSidebar: () => void;
}

/** How long after pressing G the second key still counts. */
const SEQUENCE_MS = 1200;

/**
 * Single-key shortcuts, GitHub/Linear style: they never fire while typing in
 * a field or with a modifier held, so they can't fight the browser or text
 * input. The menu bar shows the same keys next to each entry.
 */
export function useAppShortcuts({ onNewTask, onShowShortcuts, onToggleSidebar }: Handlers): void {
  const router = useRouter();
  const pendingG = useRef(0);
  const handlers = useRef({ onNewTask, onShowShortcuts, onToggleSidebar });

  useEffect(() => {
    handlers.current = { onNewTask, onShowShortcuts, onToggleSidebar };
  });

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
      if (isTypingTarget(event.target)) return;
      // A dialog or sheet owns the keyboard while it's open.
      if (document.querySelector('[aria-modal="true"]')) return;

      const key = event.key.toLowerCase();

      if (pendingG.current && Date.now() - pendingG.current < SEQUENCE_MS) {
        pendingG.current = 0;
        const target = GO_TARGETS.find((entry) => entry.key === key);
        if (target) {
          event.preventDefault();
          router.push(target.href);
        }
        return;
      }

      if (key === "g") {
        pendingG.current = Date.now();
        return;
      }
      if (event.key === "?") {
        event.preventDefault();
        handlers.current.onShowShortcuts();
      } else if (key === "n") {
        event.preventDefault();
        handlers.current.onNewTask();
      } else if (key === "[") {
        event.preventDefault();
        handlers.current.onToggleSidebar();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [router]);
}
