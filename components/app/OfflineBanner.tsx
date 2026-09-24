"use client";

import { useSyncExternalStore } from "react";

function subscribe(callback: () => void) {
  window.addEventListener("online", callback);
  window.addEventListener("offline", callback);
  return () => { window.removeEventListener("online", callback); window.removeEventListener("offline", callback); };
}

function online() { return navigator.onLine; }

export default function OfflineBanner() {
  const isOnline = useSyncExternalStore(subscribe, online, () => true);
  if (isOnline) return null;
  return <div role="status" className="fixed inset-x-0 top-0 z-[80] px-3 pt-[env(safe-area-inset-top)]"><div className="mx-auto max-w-[560px] rounded-b-lg px-4 py-2.5 text-center text-[13px] font-medium shadow-lg" style={{ background:"var(--app-text)", color:"var(--app-bg)" }}>You&rsquo;re offline. Reconnect to keep your plan in sync.</div></div>;
}
