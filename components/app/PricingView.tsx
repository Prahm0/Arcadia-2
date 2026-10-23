"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api/client";
import { analytics } from "@/lib/analytics/events";
import { useDashboardData } from "@/lib/app/DashboardProvider";
import { isGuestEmail } from "@/lib/auth/guest";
import { useNativeIOS } from "@/lib/capacitor/platform";
import { PAID_PRICING, PRO_YEARLY_PER_MONTH, PRO_YEARLY_SAVING, TIER_COPY, aud } from "@/lib/app/pricing";
import PageHeader from "./PageHeader";
import AppButton from "./AppButton";
import IosPricingView from "./IosPricingView";

type TierKey = "free" | "pro" | "max";
type Interval = "month" | "year";

interface PaidPricing {
  /** Amount actually billed each period, in AUD. */
  monthly: number;
  yearly: number;
}

interface Tier {
  key: TierKey;
  name: string;
  headline: string;
  pricing: PaidPricing | null;
  features: string[];
  highlighted?: boolean;
  badge?: string;
}

export const TIERS: Tier[] = [
  { key: "free", name: "Free", headline: TIER_COPY.free.headline, features: [...TIER_COPY.free.features], pricing: null },
  {
    key: "pro",
    name: "Pro",
    headline: TIER_COPY.pro.headline,
    features: [...TIER_COPY.pro.features],
    pricing: PAID_PRICING.pro,
    highlighted: true,
    badge: "Most popular",
  },
];

export default function PricingView() {
  const router = useRouter();
  const { data } = useDashboardData();
  const currentTier: TierKey = data?.user?.tier ?? "free";
  const hasSubscription = Boolean(data?.user?.hasSubscription);
  const isGuest = isGuestEmail(data?.user?.email);
  // First-time subscribers get a free week of Pro (the server decides; this
  // only changes the wording).
  const trialEligible = !hasSubscription && !isGuest && !data?.user?.subscriptionStatus && !data?.user?.billingProvider;

  // Yearly first: it's the better deal, and what most students should pick.
  const [interval, setInterval] = useState<Interval>("year");
  const [busyTier, setBusyTier] = useState<TierKey | null>(null);
  const [error, setError] = useState<string | null>(null);
  const nativeIOS = useNativeIOS();
  // Stripe sends a cancelled checkout back here with ?upgrade=cancelled. Read
  // it in the initialiser (this subtree only mounts on the client, behind the
  // dashboard gate) so the effect just strips the param and never sets state.
  const [cancelled, setCancelled] = useState(() => {
    if (typeof window === "undefined") return false;
    return new URLSearchParams(window.location.search).get("upgrade") === "cancelled";
  });
  useEffect(() => {
    if (!cancelled) return;
    const url = new URL(window.location.href);
    if (url.searchParams.get("upgrade") !== "cancelled") return;
    url.searchParams.delete("upgrade");
    window.history.replaceState({}, "", url.toString());
  }, [cancelled]);

  useEffect(() => {
    analytics.paywallViewed("pricing");
  }, []);

  if (nativeIOS) return <IosPricingView tiers={TIERS} />;

  async function startCheckout(plan: "pro") {
    // Guests can't upgrade, they'd be paying for an @arcadia.local
    // account they can never sign back into. Show them a banner
    // instead of trying to check out. The tier card CTA also flips
    // to "Sign up for Pro" and takes them straight to register.
    if (isGuest) {
      router.push("/register");
      return;
    }
    setBusyTier(plan);
    setError(null);
    try {
      const response = await api<{ url: string }>("/api/billing/checkout", {
        method: "POST",
        body: JSON.stringify({ plan, interval }),
      });
      if (response?.url) {
        analytics.checkoutStarted(plan, interval);
        window.location.assign(response.url);
        return;
      }
      throw new Error("Checkout URL missing.");
    } catch (err) {
      console.warn("[pricing] checkout failed", err);
      setError(
        err instanceof Error && err.message
          ? err.message
          : "Couldn't reach Stripe. Try again in a moment.",
      );
      setBusyTier(null);
    }
  }

  async function openPortal() {
    setBusyTier("free"); // placeholder, reuses the loading spinner slot
    setError(null);
    try {
      const response = await api<{ url: string }>("/api/billing/portal", {
        method: "POST",
      });
      if (response?.url) {
        window.location.assign(response.url);
        return;
      }
      throw new Error("Portal URL missing.");
    } catch (err) {
      console.warn("[pricing] portal failed", err);
      setError(
        err instanceof Error && err.message
          ? err.message
          : "Couldn't open the billing portal.",
      );
      setBusyTier(null);
    }
  }

  return (
    <>
      <PageHeader width={1080}
        title={
          trialEligible ? (
            <>
              Try <span className="accent-serif">Pro</span> free for 7 days.
            </>
          ) : (
            <>
              Pick your <span className="accent-serif">Arcadia</span>.
            </>
          )
        }
        meta={trialEligible
          ? "Cancel anytime from Settings before the week is up. Prices in AUD, billed via Stripe."
          : "Prices in AUD, billed via Stripe. Cancel anytime from Settings."}
      />

      <div className="mx-auto flex w-full max-w-[1080px] flex-col gap-6 px-6 py-8 sm:px-10">
        {isGuest ? (
          <div
            role="note"
            className="flex flex-col gap-3 rounded-md px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between"
            style={{
              background: "var(--app-arcad-soft)",
              color: "var(--app-arcad-strong)",
              boxShadow: "var(--elev-1)",
            }}
          >
            <div>
              <p className="text-[13.5px] font-semibold">You&rsquo;re signed in as a guest.</p>
              <p className="mt-0.5 text-[13px] opacity-90">
                Guest accounts vanish when you close the tab, so we can&rsquo;t attach a
                subscription. Create a real account to upgrade to Pro.
              </p>
            </div>
            <AppButton variant="primary" onClick={() => router.push("/register")}>
              Create account
            </AppButton>
          </div>
        ) : null}

        {cancelled ? (
          <div
            role="status"
            className="flex items-center justify-between gap-3 rounded-md px-4 py-3 text-[13.5px]"
            style={{ background: "var(--app-surface-soft)", color: "var(--app-text-soft)" }}
          >
            <span>Checkout cancelled, no charge was made. Upgrade whenever you&rsquo;re ready.</span>
            <button
              type="button"
              onClick={() => setCancelled(false)}
              aria-label="Dismiss"
              className="shrink-0 text-[16px] leading-none"
              style={{ color: "var(--app-text-faint)" }}
            >
              ×
            </button>
          </div>
        ) : null}

        <IntervalToggle value={interval} onChange={setInterval} />

        {currentTier === "max" ? (
          <p className="text-center text-[13px]" style={{ color: "var(--app-text-muted)" }}>
            You&rsquo;re on Max, which isn&rsquo;t sold any more. You keep it for as long as you stay subscribed.
          </p>
        ) : null}

        <div className="mx-auto grid w-full max-w-[760px] gap-4 md:grid-cols-2">
          {TIERS.map((tier) => (
            <TierCard
              key={tier.key}
              tier={tier}
              interval={interval}
              currentTier={currentTier}
              hasSubscription={hasSubscription}
              isGuest={isGuest}
              trial={tier.key === "pro" && trialEligible}
              loading={busyTier === tier.key}
              onUpgrade={() => {
                if (tier.key !== "pro") return;
                if (hasSubscription) {
                  void openPortal();
                } else {
                  void startCheckout(tier.key);
                }
              }}
              onManage={openPortal}
            />
          ))}
        </div>

        {error ? (
          <div
            role="alert"
            className="rounded-md px-4 py-3 text-[13.5px]"
            style={{
              background: "color-mix(in oklab, var(--app-danger) 12%, var(--app-surface))",
              color: "var(--app-danger)",
              boxShadow: "var(--elev-1)",
            }}
          >
            {error}
          </div>
        ) : null}

        <Faq />
      </div>
    </>
  );
}

function IntervalToggle({
  value,
  onChange,
}: {
  value: Interval;
  onChange: (v: Interval) => void;
}) {
  return (
    <div className="mx-auto flex items-center gap-1 rounded-full p-1"
      style={{ background: "var(--app-surface)", boxShadow: "var(--elev-1)" }}>
      <IntervalButton active={value === "year"} onClick={() => onChange("year")}>
        Yearly · save {PRO_YEARLY_SAVING}%
      </IntervalButton>
      <IntervalButton active={value === "month"} onClick={() => onChange("month")}>
        Monthly
      </IntervalButton>
    </div>
  );
}

function IntervalButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-md px-4 py-1.5 text-[13px] font-semibold transition-colors"
      style={{
        background: active ? "var(--app-arcad)" : "transparent",
        color: active ? "var(--app-arcad-on)" : "var(--app-text-muted)",
      }}
    >
      {children}
    </button>
  );
}

function TierCard({
  tier,
  interval,
  currentTier,
  hasSubscription,
  isGuest,
  trial,
  loading,
  onUpgrade,
  onManage,
}: {
  tier: Tier;
  interval: Interval;
  currentTier: TierKey;
  hasSubscription: boolean;
  isGuest: boolean;
  /** Show the free week (first-time Pro subscribers). */
  trial?: boolean;
  loading: boolean;
  onUpgrade: () => void;
  onManage: () => void;
}) {
  const isFree = tier.key === "free";
  const isCurrent = tier.key === currentTier;
  const pricing = tier.pricing;
  // Yearly reads as its monthly equivalent, with what's actually billed below.
  const perMonth = pricing ? (interval === "month" ? pricing.monthly : PRO_YEARLY_PER_MONTH) : null;
  const billedAmount = pricing ? (interval === "month" ? pricing.monthly : pricing.yearly) : null;
  const billedLabel = interval === "month" ? "month" : "year";

  return (
    <div
      className="relative flex flex-col gap-5 rounded-lg p-6"
      style={{
        background: tier.highlighted
          ? "color-mix(in oklab, var(--app-arcad) 12%, var(--app-surface))"
          : "var(--app-surface)",
        boxShadow: tier.highlighted ? "var(--elev-2)" : "var(--elev-1)",
        border: tier.highlighted
          ? "1px solid color-mix(in oklab, var(--app-arcad) 45%, transparent)"
          : "1px solid transparent",
      }}
    >
      {tier.badge ? (
        <div
          className="absolute -top-3 right-6 rounded-md px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em]"
          style={{ background: "var(--app-arcad)", color: "var(--app-arcad-on)" }}
        >
          {tier.badge}
        </div>
      ) : null}

      <div>
        <h3
          className="text-[20px] font-semibold"
          style={{ color: tier.highlighted ? "var(--app-arcad-strong)" : "var(--app-text)" }}
        >
          {tier.name}
        </h3>
        <p className="mt-1 text-[13.5px]" style={{ color: "var(--app-text-muted)" }}>
          {tier.headline}
        </p>
      </div>

      <div>
        {pricing === null || perMonth === null || billedAmount === null ? (
          <div className="flex items-baseline gap-1.5">
            <span className="text-[36px] font-semibold" style={{ color: "var(--app-text)" }}>
              $0
            </span>
            <span className="text-[13px]" style={{ color: "var(--app-text-muted)" }}>
              forever
            </span>
          </div>
        ) : (
          <div>
            <div className="flex items-baseline gap-1.5">
              <span className="text-[36px] font-semibold" style={{ color: "var(--app-text)" }}>
                {aud(perMonth)}
              </span>
              <span className="text-[13.5px]" style={{ color: "var(--app-text-muted)" }}>
                / month
              </span>
              {interval === "year" ? (
                <span className="ml-1 text-[13px] line-through" style={{ color: "var(--app-text-faint)" }}>
                  {aud(pricing.monthly)}
                </span>
              ) : null}
            </div>
            {trial ? (
              <p className="mt-1 text-[12.5px] font-medium" style={{ color: "var(--app-arcad-strong)" }}>
                First 7 days free
              </p>
            ) : null}
            <p className="mt-1 text-[12px]" style={{ color: "var(--app-text-faint)" }}>
              {trial ? "Then" : "Billed"} {aud(billedAmount)} a {billedLabel}{interval === "year" ? `, ${PRO_YEARLY_SAVING}% less than monthly` : ""}
            </p>
          </div>
        )}
      </div>

      <ul className="flex flex-col gap-2.5">
        {tier.features.map((f) => (
          <li
            key={f}
            className="flex items-start gap-2 text-[13.5px]"
            style={{ color: "var(--app-text-soft)" }}
          >
            <span
              aria-hidden="true"
              className="mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full"
              style={{
                background: tier.highlighted ? "var(--app-arcad)" : "var(--app-arcad-soft)",
                color: tier.highlighted ? "var(--app-arcad-on)" : "var(--app-arcad-strong)",
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

      <div className="mt-auto pt-2">
        {isCurrent && !isFree ? (
          <AppButton variant="secondary" onClick={onManage} loading={loading}>
            Manage subscription
          </AppButton>
        ) : isCurrent ? (
          <AppButton variant="ghost" disabled>
            Current plan
          </AppButton>
        ) : isFree ? (
          hasSubscription ? (
            <AppButton variant="ghost" onClick={onManage} loading={loading}>
              Downgrade
            </AppButton>
          ) : (
            <AppButton variant="ghost" disabled>
              Free plan
            </AppButton>
          )
        ) : (
          <AppButton
            variant={tier.highlighted ? "primary" : "secondary"}
            onClick={onUpgrade}
            loading={loading}
          >
            {isGuest
              ? `Sign up for ${tier.name}`
              : hasSubscription
              ? "Manage in Stripe"
              : trial
              ? "Try free for 7 days"
              : `Start ${tier.name}`}
          </AppButton>
        )}
      </div>
    </div>
  );
}

function Faq() {
  return (
    <div className="mt-4 grid gap-4 md:grid-cols-2">
      <FaqItem
        q="Can I cancel any time?"
        a="Yes. Manage from Settings or the Stripe portal whenever you like. You keep access until the end of your current billing period."
      />
      <FaqItem
        q="What if I hit the daily message cap?"
        a="Arcad tells you and shows when it resets at midnight. Pro raises it to 20 a day."
      />
      <FaqItem
        q="What happens to my data on Free?"
        a="Everything stays. You lose access to Pro features (higher message cap, calendar sync, uploads). Nothing gets deleted."
      />
      <FaqItem
        q="Student discount?"
        a={`Arcadia is already priced for students: Pro is ${aud(PRO_YEARLY_PER_MONTH)} a month on the yearly plan, so there's no separate student tier.`}
      />
    </div>
  );
}

function FaqItem({ q, a }: { q: string; a: string }) {
  return (
    <div
      className="rounded-md p-5"
      style={{ background: "var(--app-surface)", boxShadow: "var(--elev-1)" }}
    >
      <p className="text-[14px] font-semibold" style={{ color: "var(--app-text)" }}>
        {q}
      </p>
      <p className="mt-1.5 text-[13px]" style={{ color: "var(--app-text-muted)" }}>
        {a}
      </p>
    </div>
  );
}
