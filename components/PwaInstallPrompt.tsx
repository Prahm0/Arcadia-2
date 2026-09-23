"use client";

/**
 * Small bottom-sheet "Add to Home Screen" prompt for mobile web visitors.
 * Two branches:
 *   - Android / desktop Chrome fires `beforeinstallprompt`. We stash the
 *     event and offer a real install button that calls `.prompt()`.
 *   - iOS Safari never fires that event. We detect iOS via UA and show
 *     step-by-step instructions to tap Share → Add to Home Screen.
 *
 * Dismissal is remembered for 30 days in localStorage so the prompt
 * doesn't nag someone who already said no. Standalone-mode visitors
 * (already installed) never see it.
 */

import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { SplashScreen } from "@capacitor/splash-screen";
import { hidePwaBanner } from "@/lib/capacitor/platform";

const DISMISS_KEY = "arcadia:pwa-prompt-dismissed-at";
const DISMISS_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const AUTO_DISMISS_MS = 4_000;

// Chrome's BeforeInstallPromptEvent isn't in lib.dom yet.
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

type Mode = "hidden" | "ios" | "android";

export default function PwaInstallPrompt() {
  const pathname = usePathname();
  const [mode, setMode] = useState<Mode>("hidden");
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const nativeShell = hidePwaBanner();

  const dismiss = useCallback(() => {
    setMode("hidden");
    try {
      window.localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {
      /* ignore */
    }
  }, []);

  // Only show inside the product itself. On the landing the banner
  // competes with the primary Get Started CTA, especially on phones
  // where the fixed banner covers the button. Once a student has
  // signed in, the install pitch is welcome.
  const isInApp = pathname?.startsWith("/app");

  useEffect(() => {
    if (!nativeShell) return;
    // The native shell deliberately owns launch timing. Once the remote page
    // hydrates, it is safe to reveal the real UI beneath the branded splash.
    void SplashScreen.hide().catch(() => {});
  }, [nativeShell]);

  useEffect(() => {
    // Guard everything behind window checks so nothing runs during SSR
    // or in the pre-hydration snapshot.
    if (typeof window === "undefined") return;
    if (nativeShell) return;
    if (!isInApp) return;

    // Already installed, nothing to prompt.
    const isStandalone =
      window.matchMedia?.("(display-mode: standalone)").matches ||
      // Older Safari flag.
      (window.navigator as unknown as { standalone?: boolean }).standalone === true;
    if (isStandalone) return;

    // Only bother on phone-sized viewports.
    const isPhone = window.matchMedia?.("(max-width: 640px)").matches;
    if (!isPhone) return;

    // Respect a recent dismiss.
    try {
      const dismissedAt = Number(window.localStorage.getItem(DISMISS_KEY) ?? "0");
      if (Number.isFinite(dismissedAt) && Date.now() - dismissedAt < DISMISS_MS) return;
    } catch {
      /* private mode, ignore */
    }

    const ua = window.navigator.userAgent;
    const isIos = /iPhone|iPad|iPod/.test(ua) && !/CriOS|FxiOS/.test(ua);

    if (isIos) {
      // Wait longer than before so the student can see the app before
      // the pitch lands, and so it never slams over a first-paint CTA.
      const timer = window.setTimeout(() => setMode("ios"), 12000);
      return () => window.clearTimeout(timer);
    }

    // Android / desktop Chrome path, wait for the browser to say the
    // app meets install criteria (served from HTTPS, has manifest, has
    // service worker or valid icons). Only then show.
    const handler = (event: Event) => {
      event.preventDefault();
      setDeferred(event as BeforeInstallPromptEvent);
      setMode("android");
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, [isInApp, nativeShell]);

  // This is a small reminder, not a modal students must manage. It also
  // disappears after an iOS install action, which Safari cannot report back
  // to the page until the new standalone app is opened.
  useEffect(() => {
    if (mode === "hidden") return;
    const timer = window.setTimeout(dismiss, AUTO_DISMISS_MS);
    return () => window.clearTimeout(timer);
  }, [dismiss, mode]);

  async function install() {
    if (!deferred) return;
    try {
      await deferred.prompt();
      await deferred.userChoice;
    } catch {
      /* user cancelled, nothing to do */
    }
    dismiss();
  }

  if (nativeShell || mode === "hidden") return null;

  return (
    <div
      role="dialog"
      aria-label="Install Arcadia on your home screen"
      className="fixed inset-x-3 bottom-[calc(env(safe-area-inset-bottom,0px)+68px)] z-[60] mx-auto max-w-[440px] rounded-2xl p-4 shadow-2xl"
      style={{
        background: "var(--app-surface, #17131f)",
        border: "1px solid rgba(255,255,255,0.08)",
        color: "var(--app-text, #ffffff)",
      }}
    >
      <div className="flex items-start gap-3">
        <div
          className="mt-0.5 grid size-10 shrink-0 place-items-center rounded-xl"
          style={{ background: "rgba(124,92,255,0.14)" }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#a58bff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 3v12" />
            <path d="m7 8 5-5 5 5" />
            <path d="M5 21h14" />
          </svg>
        </div>
        <div className="flex-1">
          <p className="text-[14.5px] font-semibold">Add Arcadia to your Home Screen</p>
          {mode === "ios" ? (
            <p className="mt-1 text-[13px] leading-relaxed" style={{ color: "rgba(255,255,255,0.7)" }}>
              Tap <IosShareGlyph /> in Safari, then choose <strong>Add to Home Screen</strong>.
              Opens standalone, like a real app.
            </p>
          ) : (
            <p className="mt-1 text-[13px] leading-relaxed" style={{ color: "rgba(255,255,255,0.7)" }}>
              Install Arcadia for one-tap access from your home screen, standalone window and offline landing.
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Close install prompt"
          title="Close"
          className="grid size-8 shrink-0 place-items-center rounded-full border border-white/15 text-white/70 hover:border-white/30 hover:text-white"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M6 6l12 12M18 6 6 18" />
          </svg>
        </button>
      </div>
      {mode === "android" ? (
        <div className="mt-3 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={dismiss}
            className="rounded-full px-3 py-1.5 text-[13px] font-medium text-white/70 hover:text-white"
          >
            Not now
          </button>
          <button
            type="button"
            onClick={install}
            className="rounded-full px-4 py-1.5 text-[13px] font-semibold"
            style={{ background: "#7c5cff", color: "#0b0716" }}
          >
            Install
          </button>
        </div>
      ) : null}
    </div>
  );
}

function IosShareGlyph() {
  return (
    <span
      aria-hidden="true"
      className="mx-0.5 inline-flex size-5 items-center justify-center rounded-md align-[-4px]"
      style={{ background: "rgba(255,255,255,0.08)" }}
    >
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 3v12" />
        <path d="m7 8 5-5 5 5" />
        <rect x="4" y="12" width="16" height="9" rx="2" />
      </svg>
    </span>
  );
}
