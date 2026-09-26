"use client";

import posthog from "posthog-js";
import { PostHogProvider as PHProvider } from "posthog-js/react";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, useEffect } from "react";
import { isNativeIOS } from "@/lib/capacitor/platform";

// The project token is a public client-side key by design (it ships in the
// browser bundle, exactly like the Sentry DSN). Committing it as the default
// keeps analytics working without a build secret; an env override lets us
// point at a different project per environment.
const KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY ?? "phc_kWBHKrQWB7pvNdMT4GhnXRtnxZrzqR9x6r2VPEtAjYJA";
const HOST = process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://eu.i.posthog.com";

let started = false;

function shouldEnable(): boolean {
  if (typeof window === "undefined" || !KEY) return false;
  // Never send events from local dev, so real analytics stay clean.
  const host = window.location.hostname;
  if (host === "localhost" || host === "127.0.0.1" || host.endsWith(".local")) return false;
  return true;
}

function start(): void {
  if (started || !shouldEnable()) return;
  started = true;
  posthog.init(KEY, {
    api_host: HOST,
    // Only build person profiles for users we identify, not every anonymous
    // visitor, which is cheaper and more privacy-preserving.
    person_profiles: "identified_only",
    // We capture pageviews manually below, because the App Router does client
    // side navigations that the default listener misses.
    capture_pageview: false,
    respect_dnt: true,
    session_recording: {
      // Never record what people type or read. We want to see where they get
      // stuck, not their notes, names, chats or other personal details (our
      // users are mostly minors).
      maskAllInputs: true,
      maskTextSelector: "*",
    },
  });
  // Every event says whether it came from the iPhone app or the web, so each
  // funnel can be split by platform.
  posthog.register({ platform: isNativeIOS() ? "ios" : "web" });
}

function PageviewTracker() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  useEffect(() => {
    if (!started || !pathname) return;
    let url = window.location.origin + pathname;
    const qs = searchParams?.toString();
    if (qs) url += `?${qs}`;
    posthog.capture("$pageview", { $current_url: url });
  }, [pathname, searchParams]);
  return null;
}

export function PostHogProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    start();
  }, []);
  return (
    <PHProvider client={posthog}>
      <Suspense fallback={null}>
        <PageviewTracker />
      </Suspense>
      {children}
    </PHProvider>
  );
}
