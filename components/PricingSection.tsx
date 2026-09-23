"use client";

import { useState } from "react";
import Link from "next/link";
import Container from "./ui/Container";
import FadeIn from "./ui/FadeIn";
import RevealText from "./ui/RevealText";
import SectionLabel from "./ui/SectionLabel";
import Button from "./ui/Button";

type Interval = "week" | "month" | "year";

interface PaidPricing {
  weekly: number;
  monthly: number;
  yearly: number;
}

interface Tier {
  key: "free" | "pro" | "max";
  name: string;
  headline: string;
  pricing: PaidPricing | null;
  features: string[];
  cta: string;
  highlighted?: boolean;
  badge?: string;
  /** A tier we show but can't sell yet: no price, no CTA, "coming soon". */
  comingSoon?: boolean;
}

const TIERS: Tier[] = [
  {
    key: "free",
    name: "Free",
    headline: "Get organised, on your own.",
    pricing: null,
    features: [
      "Auto-scheduled daily plan",
      "Tasks & deadlines",
      "Classic focus timer",
      "2 Arcad messages / day",
    ],
    cta: "Start free",
  },
  {
    key: "pro",
    name: "Pro",
    headline: "Arcad becomes your study partner.",
    pricing: { weekly: 4.95, monthly: 12.82, yearly: 49.4 },
    features: [
      "Everything in Free",
      "20 Arcad messages a day, 10x the free plan",
      "Google · Apple · Canvas calendar sync",
      "Upload PDFs & notes, Arcad answers from them",
      "Unlimited study rooms with shared timers",
      "Full analytics, streaks, subjects, trends",
    ],
    cta: "Start Pro",
    highlighted: true,
    badge: "Most popular",
  },
  {
    key: "max",
    name: "Max",
    headline: "The power tier, coming soon.",
    pricing: null,
    comingSoon: true,
    features: [
      "Everything in Pro",
      "A deeper tutoring layer we're building now",
    ],
    cta: "Coming soon",
    badge: "Coming soon",
  },
];

/**
 * Turns each pricing option into a per-week rate so the headline number
 * is comparable across intervals. Monthly divides across 4.345 weeks
 * (365.25 ÷ 12 ÷ 7); yearly divides across 52.
 */
function perWeek(pricing: PaidPricing, interval: Interval): number {
  if (interval === "week") return pricing.weekly;
  if (interval === "month") return pricing.monthly / (365.25 / 12 / 7);
  return pricing.yearly / 52;
}

function savingsVsWeekly(pricing: PaidPricing, interval: Interval): number {
  if (interval === "week") return 0;
  return Math.round(((pricing.weekly - perWeek(pricing, interval)) / pricing.weekly) * 100);
}

export default function PricingSection() {
  const [interval, setInterval] = useState<Interval>("month");
  const proPricing = TIERS.find((t) => t.key === "pro")?.pricing ?? null;
  const monthlySavings = proPricing ? savingsVsWeekly(proPricing, "month") : 0;
  const yearlySavings = proPricing ? savingsVsWeekly(proPricing, "year") : 0;

  return (
    <section
      id="pricing"
      aria-labelledby="pricing-heading"
      className="section-seam relative overflow-hidden bg-night-900 py-[120px] text-white lg:py-[160px]"
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(70% 55% at 50% 30%, rgba(124,92,255,0.10) 0%, rgba(124,92,255,0.02) 45%, rgba(0,0,0,0) 75%)",
        }}
      />

      <Container className="relative">
        <div className="grid grid-cols-12 gap-x-6 gap-y-10">
          <div className="col-span-12 lg:col-span-6">
            <FadeIn>
              <SectionLabel tone="dark">Pricing</SectionLabel>
            </FadeIn>
            <RevealText
              id="pricing-heading"
              as="h2"
              lines={["Less than a coffee.", "More than a planner."]}
              accent="coffee."
              className="type-display mt-8"
              delay={0.1}
            />
          </div>
          <div className="col-span-12 lg:col-span-5 lg:col-start-8 lg:self-end">
            <FadeIn delay={0.2}>
              <p className="type-body-lg max-w-[440px] text-white/60">
                Start free, you&rsquo;ll feel it in your first week. When you&rsquo;re ready,
                Pro turns Arcad into a proper study partner. A power tier is on the way.
              </p>
            </FadeIn>
          </div>
        </div>

        <FadeIn delay={0.25} className="mt-12 flex justify-center lg:mt-16">
          <IntervalToggle
            value={interval}
            onChange={setInterval}
            monthlySavings={monthlySavings}
            yearlySavings={yearlySavings}
          />
        </FadeIn>

        <div className="mt-8 grid gap-5 md:grid-cols-3 lg:mt-12">
          {TIERS.map((tier, i) => (
            <FadeIn key={tier.key} delay={0.1 + i * 0.08}>
              <TierCard tier={tier} interval={interval} />
            </FadeIn>
          ))}
        </div>

        <FadeIn delay={0.35} className="mt-10 text-center">
          <p className="type-mono-label text-white/50">
            Cancel any time from Settings · Prices in AUD, billed via Stripe ·{" "}
            <Link href="/refunds" className="underline underline-offset-4 hover:text-white">
              refund policy
            </Link>
          </p>
        </FadeIn>
      </Container>
    </section>
  );
}

function IntervalToggle({
  value,
  onChange,
  monthlySavings,
  yearlySavings,
}: {
  value: Interval;
  onChange: (v: Interval) => void;
  monthlySavings: number;
  yearlySavings: number;
}) {
  return (
    <div
      className="flex items-center gap-1 rounded-full p-1"
      style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
    >
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
      className="rounded-full px-4 py-1.5 text-[12.5px] font-semibold whitespace-nowrap transition-colors"
      style={{
        background: active ? "rgb(124,92,255)" : "transparent",
        color: active ? "white" : "rgba(255,255,255,0.7)",
      }}
    >
      {children}
    </button>
  );
}

function TierCard({ tier, interval }: { tier: Tier; interval: Interval }) {
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
      className="relative flex h-full flex-col gap-6 rounded-2xl p-7"
      style={{
        background: tier.highlighted
          ? "linear-gradient(180deg, rgba(124,92,255,0.14) 0%, rgba(124,92,255,0.04) 100%)"
          : "rgba(255,255,255,0.03)",
        border: tier.highlighted
          ? "1px solid rgba(124,92,255,0.42)"
          : "1px solid rgba(255,255,255,0.08)",
        boxShadow: tier.highlighted
          ? "0 20px 60px -20px rgba(124,92,255,0.35)"
          : "none",
      }}
    >
      {tier.badge ? (
        <div
          className="type-mono-label absolute -top-3 right-6 rounded-full px-3 py-1 text-[10.5px]"
          style={
            tier.comingSoon
              ? { background: "rgba(255,255,255,0.12)", color: "rgba(255,255,255,0.7)" }
              : { background: "rgb(124,92,255)", color: "white" }
          }
        >
          {tier.badge}
        </div>
      ) : null}

      <div>
        <h3 className="text-[22px] font-medium tracking-[-0.01em] text-white">
          {tier.name}
        </h3>
        <p className="mt-1 text-[13.5px] text-white/55">{tier.headline}</p>
      </div>

      <div>
        {tier.comingSoon ? (
          <div className="text-[24px] font-medium tracking-[-0.01em] text-white/70">Coming soon</div>
        ) : pricing === null || perWeekRate === null || billedAmount === null ? (
          <>
            <div className="flex items-baseline gap-2">
              <span className="text-[38px] font-medium tracking-[-0.02em] text-white">$0</span>
              <span className="text-[13px] text-white/45">/ week</span>
            </div>
            <p className="mt-1 type-mono-label text-white/45">Forever free.</p>
          </>
        ) : (
          <>
            <div className="flex items-baseline gap-2">
              <span className="text-[38px] font-medium tracking-[-0.02em] text-white">
                ${perWeekRate.toFixed(2)}
              </span>
              <span className="text-[13px] text-white/45">/ week</span>
            </div>
            <p className="mt-1 type-mono-label text-white/45">
              Billed ${billedAmount.toFixed(billedAmount % 1 === 0 ? 0 : 2)} AUD per {billedLabel}
            </p>
          </>
        )}
      </div>

      <ul className="flex flex-col gap-2.5">
        {tier.features.map((f) => (
          <li key={f} className="flex items-start gap-2.5 text-[13.5px] text-white/75">
            <span
              aria-hidden="true"
              className="mt-1 grid h-4 w-4 shrink-0 place-items-center rounded-full"
              style={{
                background: tier.highlighted ? "rgb(124,92,255)" : "rgba(255,255,255,0.08)",
                color: tier.highlighted ? "white" : "rgba(255,255,255,0.75)",
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
        {tier.comingSoon ? (
          <span
            className="flex w-full items-center justify-center rounded-full px-4 py-3 text-[14px] font-medium"
            style={{ background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.5)" }}
          >
            {tier.cta}
          </span>
        ) : (
          <Button
            tone="dark"
            variant={tier.highlighted ? "primary" : "secondary"}
            href="/register"
            size="md"
            className="w-full"
          >
            {tier.cta}
          </Button>
        )}
      </div>
    </div>
  );
}
