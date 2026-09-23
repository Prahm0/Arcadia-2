"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";

/**
 * Document Picture-in-Picture: a small always-on-top window the student can
 * drag anywhere on their desktop, while the page keeps the state. Chrome and
 * Edge have it; everywhere else `supported` is false and the page hides the
 * pop-out button.
 */

interface DocumentPictureInPicture {
  requestWindow(options?: { width?: number; height?: number; disallowReturnToOpener?: boolean }): Promise<Window>;
  window: Window | null;
}

function pipApi(): DocumentPictureInPicture | null {
  if (typeof window === "undefined") return null;
  return (window as unknown as { documentPictureInPicture?: DocumentPictureInPicture }).documentPictureInPicture ?? null;
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
  const supported = useSyncExternalStore(subscribeNever, () => pipApi() !== null, () => false);
  const [pipWindow, setPipWindow] = useState<Window | null>(null);

  const open = useCallback(async (size: { width: number; height: number }) => {
    const api = pipApi();
    if (!api) return null;
    if (api.window) return api.window;
    try {
      const win = await api.requestWindow(size);
      const stopMirroring = mirrorDocument(win);
      win.document.title = "Focus · Arcadia";
      win.addEventListener("pagehide", () => {
        stopMirroring();
        setPipWindow(null);
      }, { once: true });
      setPipWindow(win);
      return win;
    } catch {
      // Blocked (no user gesture, or the browser said no). The page timer is untouched.
      return null;
    }
  }, []);

  const close = useCallback(() => {
    pipApi()?.window?.close();
  }, []);

  // Leaving the focus page stops the timer, so the pop-out goes with it.
  useEffect(() => () => pipApi()?.window?.close(), []);

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
