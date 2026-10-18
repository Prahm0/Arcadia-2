"use client";

import { usePathname, useRouter } from "next/navigation";
import { useSyncExternalStore } from "react";

/** The tab bar's own pages: you reach them from the tab bar, so they need no way back. */
const TAB_ROOTS = new Set(["/app", "/app/schedule", "/app/arcad"]);

const subscribe = () => () => {};
const hasHistory = () => window.history.length > 1;

/**
 * "‹ Back" above a page's title, for anything opened from More, Settings or
 * a link. The iPhone and iPad apps have no browser back button, so without
 * this the only way out was the tab bar.
 */
export default function BackButton() {
  const pathname = usePathname();
  const router = useRouter();
  const canGoBack = useSyncExternalStore(subscribe, hasHistory, () => false);
  if (TAB_ROOTS.has(pathname)) return null;

  return (
    <button
      type="button"
      onClick={() => (canGoBack ? router.back() : router.push("/app"))}
      className="ui-press -ml-2 mb-1 inline-flex h-8 items-center gap-1 rounded-full pl-1.5 pr-3 text-[14px] font-medium"
      style={{ color: "var(--app-text-muted)" }}
    >
      <svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 4l-6 6 6 6" /></svg>
      Back
    </button>
  );
}
