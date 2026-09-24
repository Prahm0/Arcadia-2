"use client";

import { useEffect } from "react";
import { isNative } from "@/lib/capacitor/platform";

/**
 * Makes the iOS app behave like an app, not a web page:
 * - Locks the zoom. iOS zooms into any focused field under 16px and never
 *   zooms back out, leaving screens stuck enlarged. Native apps don't pinch.
 * - Keeps the student inside the app. The landing page ("/") is for the web;
 *   any link that lands there (e.g. a legal page's logo) goes back to /app.
 * - Keeps the clock readable: the status bar text is dark on light screens
 *   and light on dark ones, following the page background and theme.
 * A no-op on the web.
 */
export default function NativeShell() {
  useEffect(() => {
    if (!isNative()) return;
    const meta = document.querySelector<HTMLMetaElement>('meta[name="viewport"]');
    if (meta && !meta.content.includes("maximum-scale")) {
      meta.content = `${meta.content}, maximum-scale=1, user-scalable=no`;
    }
    if (window.location.pathname === "/") window.location.replace("/app");

    let cancelled = false;
    const syncStatusBar = async () => {
      const { StatusBar, Style } = await import("@capacitor/status-bar");
      if (cancelled) return;
      const light = isLightBackground();
      await StatusBar.setStyle({ style: light ? Style.Light : Style.Dark });
    };
    void syncStatusBar();
    const observer = new MutationObserver(() => void syncStatusBar());
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "style", "data-app-theme"] });
    observer.observe(document.body, { attributes: true, attributeFilter: ["class", "style"] });
    const scheme = window.matchMedia("(prefers-color-scheme: dark)");
    const onScheme = () => void syncStatusBar();
    scheme.addEventListener("change", onScheme);
    return () => {
      cancelled = true;
      observer.disconnect();
      scheme.removeEventListener("change", onScheme);
    };
  }, []);
  return null;
}

/** Whether the page behind the status bar is light (so the text should be dark). */
function isLightBackground(): boolean {
  for (const el of [document.body, document.documentElement]) {
    const [r, g, b, a = 1] = (getComputedStyle(el).backgroundColor.match(/[\d.]+/g) ?? []).map(Number);
    if (r === undefined || a === 0) continue;
    return 0.299 * r + 0.587 * g + 0.114 * b > 150;
  }
  return !window.matchMedia("(prefers-color-scheme: dark)").matches;
}
