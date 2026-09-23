"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api/client";
import { analytics } from "@/lib/analytics/events";
import { useDashboardData } from "@/lib/app/DashboardProvider";
import { isGuestEmail } from "@/lib/auth/guest";
import PageHeader from "./PageHeader";
import AppButton from "./AppButton";

type TierKey = "free" | "pro" | "max";
type Interval = "week" | "month" | "year";

interface PaidPricing {
  /** Amount actually billed each period, in AUD. */
  weekly: number;
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

const TIERS: Tier[] = [
  {
    key: "free",
    name: "Free",
    headline: "The scaffold. Get organised, on your own.",
    pricing: null,
    features: [
      "Auto-scheduled daily plan",
      "Task list + deadlines",
      "Focus timer (Classic 25/5)",
      "Arcad, 2 messages / day",
      "Today's focus minutes",
      "Weekly review, text summary",
    ],
  },
  {
    key: "pro",
    name: "Pro",
    headline: "Arcad unlocked. Calendar synced. Notes indexed.",
    // Prices target a per-week display of $4.95 / $2.95 / $0.95. The
    // monthly figure is 2.95 × (365.25 ÷ 12 ÷ 7) ≈ 12.82; the yearly
    // is 0.95 × 52 = 49.40.
    pricing: { weekly: 4.95, monthly: 12.82, yearly: 49.4 },
    features: [
      "Everything in Free",
      "Arcad, 20 messages / day",
      "Google / Apple / Canvas calendar sync",
      "Upload PDFs & notes, Arcad answers from them",
      "Study rooms (unlimited) with shared timers",
      "Full analytics, subject breakdown, streaks, trends",
      "Custom focus presets",
      "Deeper weekly review with insights",
    ],
    highlighted: true,
    badge: "Most popular",
  },
  {
    key: "max",
    name: "Max",
    headline: "Voice tutor. Exam prep. Real humans when you're stuck.",
    // Per-week display of $9.95 / $7.95 / $3.95. Monthly = 7.95 ×
    // 4.345 ≈ 34.54; yearly = 3.95 × 52 = 205.40.
    pricing: { weekly: 9.95, monthly: 34.54, yearly: 205.4 },
    features: [
      "Everything in Pro",
      "Arcad, 100 messages / day",
      "Voice Arcad, talk while you study, hands-free",
      "Arcad tutor mode, step-by-step problem walkthroughs",
      "Exam-style practice + essay feedback",
      "1:1 human tutor bookings (coming soon)",
      "Priority AI, the smartest model, first in the queue",
      "Study group leader mode, invite up to 10",
    ],
  },
];

/**
 * Turns each pricing option into a per-week rate so the headline number
 * is comparable across intervals. Weekly billing uses its own rate as
 * baseline; monthly divides across 4.345 weeks (365.25 ÷ 12 ÷ 7);
 * yearly divides across 52.
 */
function perWeek(pricing: PaidPricing, interval: Interval): number {
  if (interval === "week") return pricing.weekly;
  if (interval === "month") return pricing.monthly / (365.25 / 12 / 7);
  return pricing.yearly / 52;
}

function savingsVsWeekly(pricing: PaidPricing, interval: Interval): number {
  if (interval === "week") return 0;
  const baseline = pricing.weekly;
  const rate = perWeek(pricing, interval);
  return Math.round(((baseline - rate) / baseline) * 100);
}

export default function PricingView() {
  const router = useRouter();
  const { data } = useDashboardData();
  const currentTier: TierKey = data?.user?.tier ?? "free";
  const hasSubscription = Boolean(data?.user?.hasSubscription);
  const isGuest = isGuestEmail(data?.user?.email);

  const [interval, setInterval] = useState<Interval>("month");
  const [busyTier, setBusyTier] = useState<TierKey | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function startCheckout(plan: "pro" | "max") {
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
        window.location.href = response.url;
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
        window.location.href = response.url;
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
        eyebrow="Plans"
        title={
          <>
            Pick your <span className="accent-serif">Arcadia</span>.
          </>
        }
        meta="Prices in AUD, billed via Stripe. Cancel anytime from Settings."
      />

      <div className="mx-auto flex w-full max-w-[1080px] flex-col gap-6 px-6 py-8 sm:px-10">
        {isGuest ? (
          <div
            role="note"
            className="flex flex-col gap-3 rounded-md px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between"
            style={{
              background: "var(--app-accent-soft)",
              color: "var(--app-accent-strong)",
              boxShadow: "var(--elev-1)",
            }}
          >
            <div>
              <p className="text-[13.5px] font-semibold">You&rsquo;re signed in as a guest.</p>
              <p className="mt-0.5 text-[13px] opacity-90">
                Guest accounts vanish when you close the tab, so we can&rsquo;t attach a
                subscription. Create a real account to upgrade to Pro or Max.
              </p>
            </div>
            <AppButton variant="primary" onClick={() => router.push("/register")}>
              Create account
            </AppButton>
          </div>
        ) : null}

        <IntervalToggle value={interval} onChange={setInterval} />

        <div className="grid gap-4 md:grid-cols-3">
          {TIERS.map((tier) => (
            <TierCard
              key={tier.key}
              tier={tier}
              interval={interval}
              currentTier={currentTier}
              hasSubscription={hasSubscription}
              isGuest={isGuest}
              loading={busyTier === tier.key}
              onUpgrade={() => {
                if (tier.key === "free") return;
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
  // Uses Pro's pricing to headline the savings badge because Pro is the
  // "most popular" tier the toggle sits above. Max savings are similar
  // enough that showing Pro's number is honest for both tiers.
  const proPricing = TIERS.find((t) => t.key === "pro")?.pricing ?? null;
  const monthlySavings = proPricing ? savingsVsWeekly(proPricing, "month") : 0;
  const yearlySavings = proPricing ? savingsVsWeekly(proPricing, "year") : 0;

  return (
    <div className="mx-auto flex items-center gap-1 rounded-full p-1"
      style={{ background: "var(--app-surface)", boxShadow: "var(--elev-1)" }}>
      <IntervalButton active={value === "week"} onClick={() => onChange("week")}>
        Weekly
      </IntervalButton>
      <IntervalButton active={value === "month"} onClick={() => onChange("month")}>
        Monthly · save {monthlySavings}%
      </IntervalButton>
      <IntervalButton active={value === "year"} onClick={() => onChange("year")}>
        Yearly · save {yearlySavings}%
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
        background: active ? "var(--app-accent)" : "transparent",
        color: active ? "var(--app-accent-on)" : "var(--app-text-muted)",
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
  loading,
  onUpgrade,
  onManage,
}: {
  tier: Tier;
  interval: Interval;
  currentTier: TierKey;
  hasSubscription: boolean;
  isGuest: boolean;
  loading: boolean;
  onUpgrade: () => void;
  onManage: () => void;
}) {
  const isFree = tier.key === "free";
  const isCurrent = tier.key === currentTier;
  const pricing = tier.pricing;
  const perWeekRate = pricing ? perWeek(pricing, interval) : null;
  const billedAmount = pricing
    ? interval === "week"
      ? pricing.weekly
      : interval === "month"
      ? pricing.monthly
      : pricing.yearly
    : null;
  const billedLabel = interval === "week" ? "week" : interval === "month" ? "month" : "year";

  return (
    <div
      className="relative flex flex-col gap-5 rounded-lg p-6"
      style={{
        background: tier.highlighted
          ? "color-mix(in oklab, var(--app-accent) 12%, var(--app-surface))"
          : "var(--app-surface)",
        boxShadow: tier.highlighted ? "var(--elev-2)" : "var(--elev-1)",
        border: tier.highlighted
          ? "1px solid color-mix(in oklab, var(--app-accent) 45%, transparent)"
          : "1px solid transparent",
      }}
    >
      {tier.badge ? (
        <div
          className="absolute -top-3 right-6 rounded-md px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em]"
          style={{ background: "var(--app-accent)", color: "var(--app-accent-on)" }}
        >
          {tier.badge}
        </div>
      ) : null}

      <div>
        <h3
          className="text-[20px] font-semibold"
          style={{ color: tier.highlighted ? "var(--app-accent-strong)" : "var(--app-text)" }}
        >
          {tier.name}
        </h3>
        <p className="mt-1 text-[13.5px]" style={{ color: "var(--app-text-muted)" }}>
          {tier.headline}
        </p>
      </div>

      <div>
        {pricing === null || perWeekRate === null || billedAmount === null ? (
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
                ${perWeekRate.toFixed(2)}
              </span>
              <span className="text-[13.5px]" style={{ color: "var(--app-text-muted)" }}>
                / week AUD
              </span>
            </div>
            <p className="mt-1 text-[12px]" style={{ color: "var(--app-text-faint)" }}>
              Billed ${billedAmount.toFixed(billedAmount % 1 === 0 ? 0 : 2)} per {billedLabel}
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
                background: tier.highlighted ? "var(--app-accent)" : "var(--app-accent-soft)",
                color: tier.highlighted ? "var(--app-accent-on)" : "var(--app-accent-strong)",
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
        a="Arcad tells you and shows when it resets (midnight UTC). Upgrade to Pro or Max any time to lift the cap."
      />
      <FaqItem
        q="What happens to my data on Free?"
        a="Everything stays. You lose access to Pro features (higher message cap, calendar sync, uploads). Nothing gets deleted."
      />
      <FaqItem
        q="Student discount?"
        a="Arcadia is already built for students. Prices are set to sit under the cost of a coffee per week, no separate student tier."
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
