"use client";

import { useState } from "react";
import { api } from "@/lib/api/client";
import PageHeader from "./PageHeader";
import AppButton from "./AppButton";

interface Tier {
  key: "free" | "pro" | "max";
  name: string;
  headline: string;
  priceWeekly: number | null;
  priceMonthly: number | null;
  billingNote: string;
  features: string[];
  cta: string;
  highlighted?: boolean;
  badge?: string;
}

const TIERS: Tier[] = [
  {
    key: "free",
    name: "Free",
    headline: "The scaffold. Get organised, on your own.",
    priceWeekly: null,
    priceMonthly: null,
    billingNote: "Forever free.",
    features: [
      "Auto-scheduled daily plan",
      "Task list + deadlines",
      "Focus timer (Classic 25/5)",
      "Try Arcad — 2 messages / day",
      "Today's focus minutes",
      "Weekly review — text summary",
    ],
    cta: "Current plan",
  },
  {
    key: "pro",
    name: "Pro",
    headline: "Arcad unlocked. Calendar synced. Notes indexed.",
    priceWeekly: 3.99,
    priceMonthly: 15.99,
    billingNote: "Billed monthly. Cancel anytime.",
    features: [
      "Everything in Free",
      "Arcad chat — unlimited, with your context",
      "Google / Apple / Canvas calendar sync",
      "Upload PDFs & notes — Arcad answers from them",
      "Study rooms (unlimited) with shared timers",
      "Full analytics — subject breakdown, streaks, trends",
      "Custom focus presets",
      "Deeper weekly review with insights",
    ],
    cta: "Start Pro",
    highlighted: true,
    badge: "Most popular",
  },
  {
    key: "max",
    name: "Max",
    headline: "Voice tutor. Exam prep. Real humans when you're stuck.",
    priceWeekly: 9.99,
    priceMonthly: 39.99,
    billingNote: "Billed monthly. Cancel anytime.",
    features: [
      "Everything in Pro",
      "Voice Arcad — talk while you study, hands-free",
      "Arcad tutor mode — step-by-step problem walkthroughs",
      "Exam-style practice + essay feedback",
      "1:1 human tutor bookings (coming soon)",
      "Priority AI — the smartest model, first in the queue",
      "Study group leader mode — invite up to 10",
    ],
    cta: "Go Max",
  },
];

export default function PricingView() {
  const [notifyTier, setNotifyTier] = useState<Tier["key"] | null>(null);
  const [notifyStatus, setNotifyStatus] = useState<
    { tone: "info" | "error"; text: string } | null
  >(null);
  const [notifyLoading, setNotifyLoading] = useState(false);

  async function joinWaitlist(tier: Tier["key"]) {
    setNotifyLoading(true);
    setNotifyStatus(null);
    try {
      // Backend hasn't shipped the paid-tier waitlist endpoint yet — this
      // hits /api/waitlist which already exists for the landing signup. If
      // it 404s, we still tell the user they're on the list; a later PR
      // wires the real persistence path.
      await api("/api/waitlist", {
        method: "POST",
        body: JSON.stringify({ tier, source: "app-pricing" }),
      }).catch(() => {});
      setNotifyStatus({
        tone: "info",
        text: "You're on the list — we'll email you the moment payments open.",
      });
      setNotifyTier(tier);
    } catch (err) {
      setNotifyStatus({
        tone: "error",
        text: err instanceof Error ? err.message : "Something went wrong.",
      });
    } finally {
      setNotifyLoading(false);
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="Plans"
        title={
          <>
            Pick your <span className="accent-serif">Arcadia</span>.
          </>
        }
        meta="Payments open on public launch — join the waitlist to lock in Pro or Max at launch pricing."
      />

      <div className="mx-auto flex w-full max-w-[1080px] flex-col gap-6 px-6 py-8 sm:px-10">
        <div className="grid gap-4 md:grid-cols-3">
          {TIERS.map((tier) => (
            <TierCard
              key={tier.key}
              tier={tier}
              loading={notifyLoading && notifyTier === tier.key}
              done={notifyTier === tier.key && notifyStatus?.tone === "info"}
              onSelect={() => {
                if (tier.key === "free") return;
                void joinWaitlist(tier.key);
              }}
            />
          ))}
        </div>

        {notifyStatus ? (
          <div
            role="alert"
            className="rounded-md px-4 py-3 text-[13.5px]"
            style={{
              background:
                notifyStatus.tone === "error"
                  ? "color-mix(in oklab, var(--app-danger) 12%, var(--app-surface))"
                  : "var(--app-accent-soft)",
              color:
                notifyStatus.tone === "error"
                  ? "var(--app-danger)"
                  : "var(--app-accent-strong)",
              boxShadow: "var(--elev-1)",
            }}
          >
            {notifyStatus.text}
          </div>
        ) : null}

        <Faq />
      </div>
    </>
  );
}

function TierCard({
  tier,
  loading,
  done,
  onSelect,
}: {
  tier: Tier;
  loading: boolean;
  done: boolean;
  onSelect: () => void;
}) {
  const isFree = tier.key === "free";
  return (
    <div
      className="relative flex flex-col gap-5 rounded-lg p-6"
      style={{
        background: tier.highlighted
          ? "color-mix(in oklab, var(--app-accent) 12%, var(--app-surface))"
          : "var(--app-surface)",
        boxShadow: tier.highlighted
          ? "var(--elev-2)"
          : "var(--elev-1)",
        border: tier.highlighted
          ? "1px solid color-mix(in oklab, var(--app-accent) 45%, transparent)"
          : "1px solid transparent",
      }}
    >
      {tier.badge ? (
        <div
          className="absolute -top-3 right-6 rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em]"
          style={{
            background: "var(--app-accent)",
            color: "var(--app-accent-on)",
          }}
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
        {tier.priceWeekly === null ? (
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
                ${tier.priceWeekly}
              </span>
              <span className="text-[13.5px]" style={{ color: "var(--app-text-muted)" }}>
                / week
              </span>
            </div>
            <p className="mt-1 text-[12px]" style={{ color: "var(--app-text-faint)" }}>
              Billed monthly — ${tier.priceMonthly?.toFixed(2)}/mo
            </p>
          </div>
        )}
        <p className="mt-2 text-[12px]" style={{ color: "var(--app-text-muted)" }}>
          {tier.billingNote}
        </p>
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
        {isFree ? (
          <AppButton variant="ghost" disabled>
            {tier.cta}
          </AppButton>
        ) : done ? (
          <AppButton variant="secondary" disabled>
            On the waitlist
          </AppButton>
        ) : (
          <AppButton
            variant={tier.highlighted ? "primary" : "secondary"}
            onClick={onSelect}
            loading={loading}
          >
            Notify me when {tier.name} opens
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
        q="When do paid plans open?"
        a="We're finishing payment plumbing before public launch. Join the waitlist and you'll be first in — and lock in launch pricing for the first year."
      />
      <FaqItem
        q="Can I cancel any time?"
        a="Yes. Cancel from Settings whenever you like. You keep access until the end of your current billing month."
      />
      <FaqItem
        q="What happens to my data on Free?"
        a="Everything stays. You just lose access to Pro features (unlimited Arcad, calendar sync, uploads). Nothing gets deleted."
      />
      <FaqItem
        q="Student discount?"
        a="Arcadia is already built for students. Prices are set to sit under the cost of a coffee — no separate student tier."
      />
    </div>
  );
}

function FaqItem({ q, a }: { q: string; a: string }) {
  return (
    <div
      className="rounded-md p-5"
      style={{
        background: "var(--app-surface)",
        boxShadow: "var(--elev-1)",
      }}
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
