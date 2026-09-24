"use client";

import { useEffect } from "react";
import { isNative } from "@/lib/capacitor/platform";

/**
 * Makes the iOS app behave like an app, not a web page:
 * - Locks the zoom. iOS zooms into any focused field under 16px and never
 *   zooms back out, leaving screens stuck enlarged. Native apps don't pinch.
 * - Keeps the student inside the app. The landing page ("/") is for the web;
 *   any link that lands there (e.g. a legal page's logo) goes back to /app.
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
  }, []);
  return null;
}
