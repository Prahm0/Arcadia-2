"use client";

import { useState } from "react";
import Link from "next/link";
import Container from "./ui/Container";
import FadeIn from "./ui/FadeIn";
import RevealText from "./ui/RevealText";
import SectionLabel from "./ui/SectionLabel";
import Button from "./ui/Button";
import { PAID_PRICING, PRO_YEARLY_PER_MONTH, PRO_YEARLY_SAVING, TIER_COPY, aud } from "@/lib/app/pricing";

type Interval = "month" | "year";

interface PaidPricing {
  monthly: number;
  yearly: number;
}

interface Tier {
  key: "free" | "pro";
  name: string;
  headline: string;
  pricing: PaidPricing | null;
  features: string[];
  cta: string;
  highlighted?: boolean;
  badge?: string;
}

const TIERS: Tier[] = [
  {
    key: "free",
    name: "Free",
    headline: TIER_COPY.free.headline,
    pricing: null,
    features: [...TIER_COPY.free.features],
    cta: "Start free",
  },
  {
    key: "pro",
    name: "Pro",
    headline: TIER_COPY.pro.headline,
    pricing: PAID_PRICING.pro,
    features: [...TIER_COPY.pro.features],
    cta: "Try Pro free for 7 days",
    highlighted: true,
    badge: "Most popular",
  },
];

export default function PricingSection() {
  // Yearly first: it's the better deal, and what most students should pick.
  const [interval, setInterval] = useState<Interval>("year");

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
            "radial-gradient(70% 55% at 50% 30%, rgba(226,184,79,0.10) 0%, rgba(226,184,79,0.02) 45%, rgba(0,0,0,0) 75%)",
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
                Start free, you&rsquo;ll feel it in your first week. Pro puts your
                planning on autopilot with Arcad in the loop, and the first 7 days
                are on us.
              </p>
            </FadeIn>
          </div>
        </div>

        <FadeIn delay={0.25} className="mt-12 flex justify-center lg:mt-16">
          <IntervalToggle value={interval} onChange={setInterval} />
        </FadeIn>

        <div className="mx-auto mt-8 grid max-w-[820px] gap-5 md:grid-cols-2 lg:mt-12">
          {TIERS.map((tier, i) => (
            <FadeIn key={tier.key} delay={0.1 + i * 0.08}>
              <TierCard tier={tier} interval={interval} />
            </FadeIn>
          ))}
        </div>

        <FadeIn delay={0.35} className="mt-10 text-center">
          <p className="type-mono-label text-white/50">
            7 days free, then cancel any time · Prices in AUD ·{" "}
            <Link href="/refunds" className="underline underline-offset-4 hover:text-white">
              refund policy
            </Link>
          </p>
        </FadeIn>
      </Container>
    </section>
  );
}

function IntervalToggle({ value, onChange }: { value: Interval; onChange: (v: Interval) => void }) {
  return (
    <div
      className="flex items-center gap-1 rounded-full p-1"
      style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
    >
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
      className="rounded-full px-4 py-1.5 text-[12.5px] font-semibold whitespace-nowrap transition-colors"
      style={{
        background: active ? "rgb(226,184,79)" : "transparent",
        color: active ? "white" : "rgba(255,255,255,0.7)",
      }}
    >
      {children}
    </button>
  );
}

function TierCard({ tier, interval }: { tier: Tier; interval: Interval }) {
  const pricing = tier.pricing;
  // Yearly reads as its monthly equivalent, with what's actually billed below.
  const perMonth = pricing ? (interval === "month" ? pricing.monthly : PRO_YEARLY_PER_MONTH) : null;
  const billedAmount = pricing ? (interval === "month" ? pricing.monthly : pricing.yearly) : null;
  const billedLabel = interval === "month" ? "month" : "year";

  return (
    <div
      className="relative flex h-full flex-col gap-6 rounded-2xl p-7"
      style={{
        background: tier.highlighted
          ? "linear-gradient(180deg, rgba(226,184,79,0.14) 0%, rgba(226,184,79,0.04) 100%)"
          : "rgba(255,255,255,0.03)",
        border: tier.highlighted
          ? "1px solid rgba(226,184,79,0.42)"
          : "1px solid rgba(255,255,255,0.08)",
        boxShadow: tier.highlighted
          ? "0 20px 60px -20px rgba(226,184,79,0.35)"
          : "none",
      }}
    >
      {tier.badge ? (
        <div
          className="type-mono-label absolute -top-3 right-6 rounded-full px-3 py-1 text-[10.5px]"
          style={{
            background: "rgb(226,184,79)",
            color: "white",
          }}
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
        {pricing === null || perMonth === null || billedAmount === null ? (
          <>
            <div className="flex items-baseline gap-2">
              <span className="text-[38px] font-medium tracking-[-0.02em] text-white">$0</span>
              <span className="text-[13px] text-white/45">/ month</span>
            </div>
            <p className="mt-1 type-mono-label text-white/45">Forever free.</p>
          </>
        ) : (
          <>
            <div className="flex items-baseline gap-2">
              <span className="text-[38px] font-medium tracking-[-0.02em] text-white">
                {aud(perMonth)}
              </span>
              <span className="text-[13px] text-white/45">/ month</span>
              {interval === "year" ? (
                <span className="text-[13px] text-white/35 line-through">{aud(pricing.monthly)}</span>
              ) : null}
            </div>
            <p className="mt-1 type-mono-label text-white/45">
              7 days free, then {aud(billedAmount)} a {billedLabel}
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
                background: tier.highlighted ? "rgb(226,184,79)" : "rgba(255,255,255,0.08)",
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
        <Button
          tone="dark"
          variant={tier.highlighted ? "primary" : "secondary"}
          href="/register"
          size="md"
          className="w-full"
        >
          {tier.cta}
        </Button>
      </div>
    </div>
  );
}
