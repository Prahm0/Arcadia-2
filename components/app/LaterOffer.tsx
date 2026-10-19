"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api/client";
import { dateKey } from "@/lib/api/time";
import { useDashboardData } from "@/lib/app/DashboardProvider";
import { useNativeIOS } from "@/lib/capacitor/platform";
import { WinbackOffer } from "./OnboardingPaywall";

const SHOWN_KEY = "arcadia:winback-shown";
/** Ticked study blocks, and the days they're spread over, before the offer shows. */
const BLOCKS_NEEDED = 3;
const DAYS_NEEDED = 2;

/**
 * The one-time Pro offer (41% off the first month on the web), shown once a
 * free student has felt the app work: three blocks ticked across at least
 * two days. Before this it sat straight after onboarding, before they had
 * seen anything. The iPhone app offers the free week instead (App Store
 * prices can't be discounted this way).
 */
export default function LaterOffer() {
  const { data } = useDashboardData();
  const nativeIOS = useNativeIOS();
  const timezone = data.profile?.timezone || data.user.timezone || "Australia/Sydney";
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const done = data.events.filter((event) => event.category === "study" && event.outcome === "completed");
  const days = new Set(done.map((event) => dateKey(event.startAt, timezone))).size;
  const earned = done.length >= BLOCKS_NEEDED && days >= DAYS_NEEDED;
  const eligible = (data.user.tier ?? "free") === "free" && !nativeIOS && earned;

  useEffect(() => {
    if (!eligible) return;
    let shown = true;
    try { shown = Boolean(window.localStorage.getItem(SHOWN_KEY)); } catch { /* private mode: never */ }
    if (shown) return;
    // A moment after Today settles, not on top of it loading.
    const timer = window.setTimeout(() => {
      setOpen(true);
      try { window.localStorage.setItem(SHOWN_KEY, String(Date.now())); } catch { /* fine */ }
    }, 1_500);
    return () => window.clearTimeout(timer);
  }, [eligible]);

  if (!open) return null;

  async function claim() {
    setBusy(true);
    setError(null);
    try {
      const res = await api<{ url: string }>("/api/billing/checkout", {
        method: "POST",
        body: JSON.stringify({ plan: "pro", interval: "month", winback: true }),
      });
      if (!res?.url) throw new Error("Checkout URL missing.");
      window.location.assign(res.url);
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : "Couldn't reach checkout. Try again in a moment.");
      setBusy(false);
    }
  }

  return <WinbackOffer busy={busy} error={error} onClaim={() => void claim()} onDecline={() => setOpen(false)} later />;
}
