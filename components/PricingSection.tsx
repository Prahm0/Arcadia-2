import Link from "next/link";
import Container from "./ui/Container";
import FadeIn from "./ui/FadeIn";
import RevealText from "./ui/RevealText";
import SectionLabel from "./ui/SectionLabel";
import Button from "./ui/Button";

interface Tier {
  key: "free" | "pro" | "max";
  name: string;
  headline: string;
  priceLabel: string;
  priceNote: string;
  features: string[];
  cta: string;
  highlighted?: boolean;
  badge?: string;
}

const TIERS: Tier[] = [
  {
    key: "free",
    name: "Free",
    headline: "Get organised, on your own.",
    priceLabel: "$0",
    priceNote: "Forever free.",
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
    // Mirrors what the in-app PricingView charges. Landing quotes monthly
    // rather than weekly so the number matches what a customer sees on
    // their statement, no "wait, why was I charged $16?" moment.
    headline: "Arcad turned up. Calendar synced. Notes indexed.",
    priceLabel: "$15.99",
    priceNote: "AUD / month · or $149 / yr (save ~22%)",
    features: [
      "Everything in Free",
      "20 Arcad messages / day",
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
    headline: "Voice tutor. Exam prep. Real humans when you're stuck.",
    priceLabel: "$39.99",
    priceNote: "AUD / month · or $379 / yr",
    features: [
      "Everything in Pro",
      "100 Arcad messages / day",
      "Voice Arcad, hands-free while you study",
      "Tutor mode, step-by-step walkthroughs",
      "1:1 human tutor bookings (coming soon)",
      "Study group leader mode, invite up to 10",
    ],
    cta: "Go Max",
  },
];

export default function PricingSection() {
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
                Start free, you'll feel it in your first week. When you're ready,
                Pro turns Arcad into a proper study partner. Max adds a voice tutor
                and, soon, real humans.
              </p>
            </FadeIn>
          </div>
        </div>

        <div className="mt-14 grid gap-5 md:grid-cols-3 lg:mt-20">
          {TIERS.map((tier, i) => (
            <FadeIn key={tier.key} delay={0.1 + i * 0.08}>
              <TierCard tier={tier} />
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

function TierCard({ tier }: { tier: Tier }) {
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
          style={{
            background: "rgb(124,92,255)",
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
        <div className="flex items-baseline gap-2">
          <span className="text-[38px] font-medium tracking-[-0.02em] text-white">
            {tier.priceLabel}
          </span>
          {tier.key !== "free" ? (
            <span className="text-[13px] text-white/45">/ mo</span>
          ) : null}
        </div>
        <p className="mt-1 type-mono-label text-white/45">{tier.priceNote}</p>
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
        <Button
          tone="dark"
          variant={tier.highlighted ? "primary" : "secondary"}
          // Everyone goes through /register first; paid tiers surface
          // Checkout from the in-app pricing page after signup.
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
