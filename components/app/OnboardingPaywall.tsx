"use client";

import { useEffect, useState } from "react";
import * as Sentry from "@sentry/nextjs";
import { api } from "@/lib/api/client";
import { analytics } from "@/lib/analytics/events";
import { useNativeIOS } from "@/lib/capacitor/platform";
import {
  getIosPurchaseOptions,
  iosIntroOfferStatus,
  iosStorefrontCountry,
  purchaseIosOption,
  type IosPurchaseOption,
} from "@/lib/capacitor/revenuecat";
import { useDashboardData } from "@/lib/app/DashboardProvider";
import AppButton from "./AppButton";
import IosPricingView from "./IosPricingView";
import { TIERS } from "./PricingView";

/**
 * Shown once, right after the plan is built, before the student reaches the
 * app. Presents Pro and Max; if they try to leave (X or "continue free"), a
 * one-time win-back offers Pro monthly at a discount before they drop to Free.
 */
type PlanKey = "pro" | "max";

const PRO_MONTHLY = 12.82;
const WINBACK_PERCENT = 41;
const WINBACK_PRICE = Math.round(PRO_MONTHLY * (1 - WINBACK_PERCENT / 100) * 100) / 100;

const PLANS: {
  key: PlanKey;
  name: string;
  price: number;
  blurb: string;
  features: string[];
  highlighted?: boolean;
}[] = [
  {
    key: "pro",
    name: "Pro",
    price: PRO_MONTHLY,
    blurb: "Planning on autopilot, Arcad in the loop.",
    features: [
      "20 Arcad messages a day, 10x the free plan",
      "Google, Apple and Canvas calendar sync",
      "Upload notes and PDFs, Arcad answers from them",
      "Full analytics, up to 3 flashcard decks",
    ],
    highlighted: true,
  },
  {
    key: "max",
    name: "Max",
    price: 34.54,
    blurb: "The learning layer. Study, not just plan.",
    features: [
      "Everything in Pro",
      "100 Arcad messages a day",
      "Unlimited flashcard decks",
      "New study tools land here first",
    ],
  },
];

export default function OnboardingPaywall({
  onContinueFree,
  onCheckoutStarted,
}: {
  onContinueFree: () => void;
  onCheckoutStarted?: () => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showWinback, setShowWinback] = useState(false);
  // In the iOS app, digital subscriptions must be sold through Apple In-App
  // Purchase (App Store guideline 3.1.1), never Stripe. Same moment, Apple's
  // prices and purchase sheet.
  const nativeIOS = useNativeIOS();
  useEffect(() => {
    analytics.paywallViewed("onboarding");
  }, []);
  if (nativeIOS) {
    return (
      <NativeOnboardingPaywall
        onContinueFree={onContinueFree}
        onPurchaseCompleted={onCheckoutStarted}
      />
    );
  }

  async function checkout(plan: PlanKey, winback = false) {
    setBusy(`${plan}${winback ? "-wb" : ""}`);
    setError(null);
    try {
      const res = await api<{ url: string }>("/api/billing/checkout", {
        method: "POST",
        body: JSON.stringify({ plan, interval: "month", winback }),
      });
      if (res?.url) {
        analytics.checkoutStarted(plan, "month");
        onCheckoutStarted?.();
        window.location.href = res.url;
        return;
      }
      throw new Error("Checkout URL missing.");
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : "Couldn't reach Stripe. Try again in a moment.");
      setBusy(null);
    }
  }

  // First attempt to leave shows the win-back; the second continues to Free.
  function dismiss() {
    if (!showWinback) {
      setShowWinback(true);
      return;
    }
    onContinueFree();
  }

  return (
    <div
      className="relative min-h-svh w-full overflow-y-auto"
      style={{ background: "var(--app-bg)", color: "var(--app-text)" }}
    >
      <button
        type="button"
        onClick={dismiss}
        aria-label="Continue with the free plan"
        className="absolute right-5 top-5 grid h-9 w-9 place-items-center rounded-full text-[18px] transition-opacity hover:opacity-70"
        style={{ background: "var(--app-surface-soft)", color: "var(--app-text-muted)" }}
      >
        ×
      </button>

      <div className="mx-auto flex w-full max-w-[860px] flex-col px-6 py-16 sm:px-10">
        <div className="text-center">
          <p className="type-eyebrow" style={{ color: "var(--app-arcad-strong)" }}>
            Your plan is ready
          </p>
          <h1 className="mt-3 text-[32px] font-medium leading-[1.1] tracking-[-0.02em] sm:text-[40px]">
            Get the <span className="accent-serif">most</span> out of your week.
          </h1>
          <p className="mx-auto mt-4 max-w-[460px] text-[15px]" style={{ color: "var(--app-text-muted)" }}>
            Free keeps you organised. Pro puts your planning on autopilot with Arcad in the loop, and Max adds the learning layer.
          </p>
        </div>

        <div className="mt-10 grid gap-4 md:grid-cols-2">
          {PLANS.map((plan) => (
            <div
              key={plan.key}
              className="relative flex flex-col gap-5 rounded-2xl p-6"
              style={{
                background: plan.highlighted ? "var(--app-arcad-soft)" : "var(--app-surface)",
                border: plan.highlighted ? "1px solid var(--app-arcad)" : "1px solid var(--app-border)",
                boxShadow: "var(--elev-1)",
              }}
            >
              {plan.highlighted ? (
                <div
                  className="type-mono-label absolute -top-2.5 right-5 rounded-full px-2.5 py-0.5 text-[10.5px]"
                  style={{ background: "var(--app-arcad)", color: "var(--app-arcad-on)" }}
                >
                  Most popular
                </div>
              ) : null}
              <div>
                <h2 className="text-[20px] font-semibold">{plan.name}</h2>
                <p className="mt-1 text-[13px]" style={{ color: "var(--app-text-muted)" }}>
                  {plan.blurb}
                </p>
              </div>
              <div className="flex items-baseline gap-1.5">
                <span className="text-[32px] font-medium tracking-[-0.02em]">${plan.price.toFixed(2)}</span>
                <span className="text-[13px]" style={{ color: "var(--app-text-muted)" }}>
                  / month AUD
                </span>
              </div>
              <ul className="flex flex-col gap-2">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-start gap-2.5 text-[13.5px]" style={{ color: "var(--app-text-soft)" }}>
                    <span
                      aria-hidden="true"
                      className="mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full"
                      style={{
                        background: plan.highlighted ? "var(--app-arcad)" : "var(--app-surface-soft)",
                        color: plan.highlighted ? "var(--app-arcad-on)" : "var(--app-text-soft)",
                      }}
                    >
                      <svg viewBox="0 0 12 12" width="9" height="9" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M2.5 6.5l2.5 2.5 4.5-5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </span>
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-auto pt-1">
                <AppButton
                  variant={plan.highlighted ? "primary" : "secondary"}
                  onClick={() => void checkout(plan.key)}
                  loading={busy === plan.key}
                  className="w-full"
                >
                  {plan.highlighted ? "Start Pro" : "Go Max"}
                </AppButton>
              </div>
            </div>
          ))}
        </div>

        {error ? (
          <p className="mt-5 text-center text-[13.5px]" style={{ color: "var(--app-danger)" }}>
            {error}
          </p>
        ) : null}

        <button
          type="button"
          onClick={dismiss}
          className="mx-auto mt-8 text-[13.5px] underline underline-offset-4 transition-opacity hover:opacity-70"
          style={{ color: "var(--app-text-muted)" }}
        >
          Continue with the free plan
        </button>
      </div>

      {showWinback ? (
        <WinbackOffer
          busy={busy === "pro-wb"}
          error={error}
          onClaim={() => void checkout("pro", true)}
          onDecline={onContinueFree}
        />
      ) : null}
    </div>
  );
}

function WinbackOffer({
  busy,
  error,
  onClaim,
  onDecline,
}: {
  busy: boolean;
  error: string | null;
  onClaim: () => void;
  onDecline: () => void;
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="One-time offer"
      className="fixed inset-0 z-50 grid place-items-center px-5"
      style={{ background: "rgba(0,0,0,0.55)" }}
    >
      <div
        className="w-full max-w-[420px] rounded-2xl p-7 text-center"
        style={{ background: "var(--app-surface)", boxShadow: "var(--elev-3, 0 24px 60px -20px rgba(0,0,0,0.5))" }}
      >
        <p className="type-mono-label" style={{ color: "var(--app-arcad-strong)" }}>
          One-time offer
        </p>
        <h2 className="mt-3 text-[24px] font-semibold leading-[1.15] tracking-[-0.015em]" style={{ color: "var(--app-text)" }}>
          Wait, take <span className="accent-serif">{WINBACK_PERCENT}% off</span> Pro.
        </h2>
        <p className="mt-3 text-[14px]" style={{ color: "var(--app-text-muted)" }}>
          Your first look at Arcadia Pro, monthly, at the best price we offer. This offer won&rsquo;t show again.
        </p>

        <div className="mt-6 flex items-baseline justify-center gap-2">
          <span className="text-[15px] line-through" style={{ color: "var(--app-text-faint)" }}>
            ${PRO_MONTHLY.toFixed(2)}
          </span>
          <span className="text-[34px] font-medium tracking-[-0.02em]" style={{ color: "var(--app-text)" }}>
            ${WINBACK_PRICE.toFixed(2)}
          </span>
          <span className="text-[13px]" style={{ color: "var(--app-text-muted)" }}>
            / month
          </span>
        </div>

        {error ? (
          <p className="mt-4 text-[13px]" style={{ color: "var(--app-danger)" }}>
            {error}
          </p>
        ) : null}

        <div className="mt-7 flex flex-col gap-2.5">
          <AppButton variant="primary" onClick={onClaim} loading={busy} className="w-full">
            Claim {WINBACK_PERCENT}% off
          </AppButton>
          <button
            type="button"
            onClick={onDecline}
            className="text-[13px] underline underline-offset-4 transition-opacity hover:opacity-70"
            style={{ color: "var(--app-text-muted)" }}
          >
            No thanks, continue with Free
          </button>
        </div>
      </div>
    </div>
  );
}

function NativeOnboardingPaywall({
  onContinueFree,
  onPurchaseCompleted,
}: {
  onContinueFree: () => void;
  onPurchaseCompleted?: () => void;
}) {
  const { data, reload } = useDashboardData();
  const [offer, setOffer] = useState<IosPurchaseOption | null>(null);
  const [offerOpen, setOfferOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Apple's introductory price on Pro monthly, if it's set up and this Apple
  // ID can still use it. Without a real offer, leaving just continues to Free.
  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const options = await getIosPurchaseOptions(data.user.id);
        const proMonthly = options.find((option) => option.tier === "pro" && option.interval === "month");
        const status = proMonthly?.introPriceString
          ? await iosIntroOfferStatus(data.user.id, proMonthly.productIdentifier)
          : null;
        // 2 = eligible. Anything else means no offer; 1 (already subscribed
        // before) is expected, the rest point at a setup problem worth seeing.
        if (proMonthly && status === 2) {
          if (active) setOffer(proMonthly);
        } else if (status !== 1) {
          Sentry.captureMessage("iOS intro offer not shown", {
            level: "info",
            extra: {
              optionCount: options.length,
              hasProMonthly: Boolean(proMonthly),
              price: proMonthly?.priceString ?? null,
              introPrice: proMonthly?.introPriceString ?? null,
              eligibilityStatus: status,
              storefront: await iosStorefrontCountry(data.user.id),
            },
          });
        }
      } catch (cause) {
        // No offer: Free is still one tap away.
        Sentry.captureException(cause);
      }
    })();
    return () => {
      active = false;
    };
  }, [data.user.id]);

  // First attempt to leave shows the intro offer (when there is one).
  function leave() {
    if (offer && !offerOpen) {
      setOfferOpen(true);
      return;
    }
    onContinueFree();
  }

  async function claim() {
    setBusy(true);
    setError(null);
    try {
      analytics.checkoutStarted("pro", "month");
      await purchaseIosOption(data.user.id, "pro", "month");
      const res = await api<{ tier: string }>("/api/billing/iap/activate", { method: "POST" });
      analytics.subscriptionActivated(res.tier);
      onPurchaseCompleted?.();
      await reload();
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "";
      if (!/cancel/i.test(message)) setError(message || "Could not complete that purchase.");
      setBusy(false);
    }
  }

  return (
    <div className="relative min-h-svh w-full overflow-y-auto" style={{ background: "var(--app-bg)", color: "var(--app-text)" }}>
      <div className="mx-auto flex w-full max-w-[860px] flex-col px-5 pb-[calc(env(safe-area-inset-bottom,0px)+32px)] pt-[calc(env(safe-area-inset-top,0px)+24px)]">
        <div className="text-center">
          <p className="type-eyebrow" style={{ color: "var(--app-arcad-strong)" }}>
            Your plan is ready
          </p>
          <h1 className="mt-3 text-[30px] font-medium leading-[1.1] tracking-[-0.02em]">
            Get the <span className="accent-serif">most</span> out of your week.
          </h1>
        </div>
        <div className="mt-6">
          <IosPricingView tiers={TIERS} />
        </div>
        <button
          type="button"
          onClick={leave}
          className="mx-auto mt-6 text-[14px] underline underline-offset-4"
          style={{ color: "var(--app-text-muted)" }}
        >
          Continue with Free
        </button>
      </div>

      {offerOpen && offer ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center" role="dialog" aria-modal="true" aria-labelledby="ios-offer-title">
          <div className="w-full max-w-[420px] rounded-2xl p-6 text-center" style={{ background: "var(--app-surface)", boxShadow: "var(--elev-3)" }}>
            <p className="type-eyebrow" style={{ color: "var(--app-arcad-strong)" }}>
              New subscriber offer
            </p>
            <h2 id="ios-offer-title" className="mt-2 text-[24px] font-medium leading-[1.15] tracking-[-0.02em]">
              Your first month of Pro for {offer.introPriceString}
            </h2>
            <p className="mt-3 text-[14px]" style={{ color: "var(--app-text-muted)" }}>
              Then {offer.priceString} a month. Cancel any time in your iPhone&rsquo;s Settings.
            </p>
            {error ? (
              <p className="mt-3 text-[13px]" style={{ color: "var(--app-danger)" }}>
                {error}
              </p>
            ) : null}
            <AppButton variant="primary" onClick={() => void claim()} loading={busy} className="mt-5 w-full">
              Claim offer
            </AppButton>
            <button type="button" onClick={onContinueFree} disabled={busy} className="mt-3 text-[13.5px] underline underline-offset-4" style={{ color: "var(--app-text-muted)" }}>
              No thanks, continue with Free
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
