"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useDashboardData } from "@/lib/app/DashboardProvider";

type Tier = "free" | "pro" | "max";

const UNLOCKED: Record<"pro" | "max", string[]> = {
  pro: [
    "20 Arcad messages a day, 10x the free plan",
    "Google, Apple and Canvas calendar sync",
    "Upload notes and PDFs, Arcad answers from them",
    "Full analytics and unlimited study rooms",
  ],
  max: [
    "Everything in Pro",
    "100 Arcad messages a day",
    "Unlimited flashcard decks",
    "New study tools land here first",
  ],
};

export default function WelcomePage() {
  const { data, reload } = useDashboardData();
  const tier = (data?.user?.tier ?? "free") as Tier;
  const firstName = (data?.user?.name ?? "").trim().split(" ")[0];

  // The subscription webhook flips the tier a beat after checkout completes.
  // We land here from a full page load, so the tier is usually already live,
  // but reload a couple of times to catch the webhook if it is still in flight.
  // `checking` is derived, so the effect never sets state synchronously.
  const [gaveUp, setGaveUp] = useState(false);
  const checking = tier === "free" && !gaveUp;
  useEffect(() => {
    if (tier !== "free") return;
    let cancelled = false;
    let tries = 0;
    let timer = 0;
    const tick = async () => {
      tries += 1;
      await reload();
      if (cancelled) return;
      if (tries >= 3) setGaveUp(true);
      else timer = window.setTimeout(tick, 1500);
    };
    timer = window.setTimeout(tick, 1200);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [tier, reload]);

  const planName = tier === "max" ? "Max" : "Pro";
  const perks = tier === "max" ? UNLOCKED.max : UNLOCKED.pro;

  return (
    <div className="mx-auto flex min-h-[calc(100svh-2.5rem)] w-full max-w-[560px] flex-col items-center justify-center px-6 py-16 text-center">
      <div
        aria-hidden="true"
        className="grid h-16 w-16 place-items-center rounded-2xl"
        style={{
          background: "var(--app-arcad-soft)",
          color: "var(--app-arcad-strong)",
          boxShadow: "0 16px 40px -18px var(--app-arcad)",
        }}
      >
        <svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" strokeWidth="2.2">
          <path d="M5 12.5l4.2 4.2L19 7" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>

      <p className="mt-6 type-mono-label" style={{ color: "var(--app-arcad-strong)" }}>
        {checking ? "Activating your plan" : `Welcome to ${planName}`}
      </p>
      <h1
        className="mt-3 text-[34px] font-medium leading-[1.1] tracking-[-0.02em]"
        style={{ color: "var(--app-text)" }}
      >
        {firstName ? `You're all set, ${firstName}.` : "You're all set."}
        <br />
        <span className="accent-serif">Arcadia {planName}</span> is live.
      </h1>
      <p className="mt-4 max-w-[420px] text-[15px] leading-relaxed" style={{ color: "var(--app-text-muted)" }}>
        Your payment went through and your account is upgraded. Here&rsquo;s what you just unlocked.
      </p>

      <ul className="mt-8 flex w-full max-w-[420px] flex-col gap-2.5 text-left">
        {perks.map((perk) => (
          <li
            key={perk}
            className="flex items-start gap-3 rounded-lg px-4 py-3 text-[14px]"
            style={{ background: "var(--app-surface-soft)", color: "var(--app-text-soft)" }}
          >
            <span
              aria-hidden="true"
              className="mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full"
              style={{ background: "var(--app-arcad)", color: "var(--app-arcad-on)" }}
            >
              <svg viewBox="0 0 12 12" width="9" height="9" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M2.5 6.5l2.5 2.5 4.5-5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
            <span>{perk}</span>
          </li>
        ))}
      </ul>

      <div className="mt-9 flex w-full max-w-[420px] flex-col items-center gap-3">
        <Link
          href="/app"
          className="flex h-11 w-full items-center justify-center rounded-lg text-[15px] font-semibold transition-opacity hover:opacity-90"
          style={{
            background: "var(--app-arcad)",
            color: "var(--app-arcad-on)",
            boxShadow: "0 8px 22px -10px var(--app-arcad)",
          }}
        >
          Go to today&rsquo;s plan
        </Link>
        <Link
          href="/app/settings#billing"
          className="text-[13px] font-medium underline underline-offset-4"
          style={{ color: "var(--app-text-muted)" }}
        >
          Manage subscription
        </Link>
      </div>
    </div>
  );
}
