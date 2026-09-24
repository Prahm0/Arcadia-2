"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { isNative } from "@/lib/capacitor/platform";

/**
 * A floating "pop-out" timer window. Two paths:
 *   1. Document Picture-in-Picture (Chrome/Edge): a real always-on-top window.
 *   2. Everywhere else on desktop (Safari, Firefox, embedded webviews, or when
 *      Document PiP is present but requestWindow is blocked): a normal
 *      window.open popup. Not always-on-top, but a detached, draggable window.
 * Either way the caller renders into `pipWindow`, so the pop-out works on every
 * desktop browser instead of only Chromium. Hidden on mobile and in the native
 * shell, where there is no windowing.
 */

interface DocumentPictureInPicture {
  requestWindow(options?: { width?: number; height?: number; disallowReturnToOpener?: boolean }): Promise<Window>;
  window: Window | null;
}

function pipApi(): DocumentPictureInPicture | null {
  if (typeof window === "undefined") return null;
  return (window as unknown as { documentPictureInPicture?: DocumentPictureInPicture }).documentPictureInPicture ?? null;
}

/** Desktop web only: a popup opens a tab on mobile, and the native shell has no windows. */
function isDesktop(): boolean {
  if (typeof window === "undefined") return false;
  if (isNative()) return false;
  if (typeof window.open !== "function") return false;
  const coarse = window.matchMedia?.("(pointer: coarse)")?.matches ?? false;
  const narrow = window.innerWidth < 900;
  return !coarse && !narrow;
}

/** The page's styles, fonts and theme, copied so the pop-out looks like Arcadia. */
function mirrorDocument(target: Window) {
  const doc = target.document;
  for (const sheet of Array.from(document.styleSheets)) {
    try {
      const style = doc.createElement("style");
      style.textContent = Array.from(sheet.cssRules, (rule) => rule.cssText).join("\n");
      doc.head.appendChild(style);
    } catch {
      // A cross-origin sheet can't be read; link it instead.
      if (!sheet.href) continue;
      const link = doc.createElement("link");
      link.rel = "stylesheet";
      link.href = sheet.href;
      doc.head.appendChild(link);
    }
  }
  const syncRoot = () => {
    const from = document.documentElement;
    const to = doc.documentElement;
    to.className = from.className;
    to.setAttribute("style", from.getAttribute("style") ?? "");
    const theme = from.getAttribute("data-app-theme");
    if (theme) to.setAttribute("data-app-theme", theme);
    doc.body.className = document.body.className;
    doc.body.style.margin = "0";
  };
  syncRoot();
  // A theme switch in the app follows it into the pop-out.
  const observer = new MutationObserver(syncRoot);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-app-theme", "class", "style"] });
  return () => observer.disconnect();
}

// Support doesn't change while the page is open.
const subscribeNever = () => () => {};

export function useDocumentPip() {
  const supported = useSyncExternalStore(subscribeNever, isDesktop, () => false);
  const [pipWindow, setPipWindow] = useState<Window | null>(null);
  const winRef = useRef<Window | null>(null);

  const attach = useCallback((win: Window) => {
    const stopMirroring = mirrorDocument(win);
    win.document.title = "Focus · Arcadia";
    const cleanup = () => {
      stopMirroring();
      winRef.current = null;
      setPipWindow(null);
    };
    win.addEventListener("pagehide", cleanup, { once: true });
    winRef.current = win;
    setPipWindow(win);
    return win;
  }, []);

  const open = useCallback(
    async (size: { width: number; height: number }) => {
      if (winRef.current && !winRef.current.closed) return winRef.current;

      // 1. Document Picture-in-Picture, the always-on-top path.
      const api = pipApi();
      if (api) {
        if (api.window) return attach(api.window);
        try {
          return attach(await api.requestWindow(size));
        } catch {
          // Present but blocked (embedded contexts, permissions). Fall back.
        }
      }

      // 2. A normal detached popup. Works on Safari, Firefox and webviews.
      try {
        const left = Math.max(0, (window.screen?.availWidth ?? 1280) - size.width - 40);
        const features = `popup=yes,width=${size.width},height=${size.height},left=${left},top=80`;
        const win = window.open("", "arcadia-focus", features);
        if (!win) return null;
        // about:blank inherits our origin, so styles and the portal work.
        win.document.body.innerHTML = "";
        return attach(win);
      } catch {
        return null;
      }
    },
    [attach],
  );

  const close = useCallback(() => {
    const win = winRef.current ?? pipApi()?.window ?? null;
    try {
      win?.close();
    } catch {
      /* already gone */
    }
    winRef.current = null;
    setPipWindow(null);
  }, []);

  // Leaving the app (signing out) stops the timer, so the pop-out goes with it.
  useEffect(
    () => () => {
      try {
        (winRef.current ?? pipApi()?.window)?.close();
      } catch {
        /* already gone */
      }
    },
    [],
  );

  return { supported, pipWindow, open, close };
}

/** Grow or shrink the pop-out to fit what it shows. Needs the click that asked for it. */
export function resizePip(win: Window | null, width: number, height: number) {
  if (!win) return;
  try {
    const chromeHeight = win.outerHeight - win.innerHeight;
    const chromeWidth = win.outerWidth - win.innerWidth;
    win.resizeTo(width + chromeWidth, height + chromeHeight);
  } catch {
    /* no activation; the student can still drag the edge */
  }
}
