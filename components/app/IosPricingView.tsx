"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api/client";
import { analytics } from "@/lib/analytics/events";
import { useDashboardData } from "@/lib/app/DashboardProvider";
import { isGuestEmail } from "@/lib/auth/guest";
import {
  getIosPurchaseOptions,
  getIosSubscriptionManagementUrl,
  purchaseIosOption,
  restoreIosPurchases,
  revenueCatIosConfigured,
  type IosPurchaseOption,
  type RevenueCatInterval,
  type RevenueCatTier,
} from "@/lib/capacitor/revenuecat";
import AppButton from "./AppButton";
import PageHeader from "./PageHeader";

type TierKey = "free" | RevenueCatTier;

interface IosTier {
  key: TierKey;
  name: string;
  headline: string;
  features: string[];
  highlighted?: boolean;
  badge?: string;
}

export default function IosPricingView({ tiers }: { tiers: IosTier[] }) {
  const router = useRouter();
  const { data, reload } = useDashboardData();
  const currentTier: TierKey = data.user.tier ?? "free";
  const isGuest = isGuestEmail(data.user.email);
  const billingProvider = data.user.billingProvider ?? null;
  const hasSubscription = Boolean(data.user.hasSubscription);
  const [interval, setInterval] = useState<RevenueCatInterval>("month");
  const [options, setOptions] = useState<IosPurchaseOption[]>([]);
  const [loadingOffers, setLoadingOffers] = useState(true);
  const [busy, setBusy] = useState<"purchase" | "restore" | "manage" | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    async function load() {
      if (!revenueCatIosConfigured()) {
        if (active) {
          setError("In-app purchases are not available in this build yet.");
          setLoadingOffers(false);
        }
        return;
      }
      try {
        const next = await getIosPurchaseOptions(data.user.id);
        if (active) {
          setOptions(next);
          if (next.length === 0) setError("App Store plans are still being prepared. Please check back soon.");
        }
      } catch (cause) {
        console.warn("[revenuecat] offerings failed", cause);
        if (active) setError("Could not load App Store plans. Please try again shortly.");
      } finally {
        if (active) setLoadingOffers(false);
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, [data.user.id]);

  const optionByTier = useMemo(
    () => new Map(options.map((option) => [`${option.tier}:${option.interval}`, option])),
    [options],
  );

  async function activateTier() {
    const response = await api<{ tier: RevenueCatTier }>("/api/billing/iap/activate", { method: "POST" });
    analytics.subscriptionActivated(response.tier);
    await reload();
  }

  async function startPurchase(tier: RevenueCatTier) {
    if (isGuest) {
      router.push("/register");
      return;
    }
    if (hasSubscription) {
      setError("Your current subscription is already active. Manage it where you bought it before changing plans.");
      return;
    }
    setBusy("purchase");
    setError(null);
    try {
      analytics.checkoutStarted(tier, interval);
      await purchaseIosOption(data.user.id, tier, interval);
      await activateTier();
    } catch (cause) {
      console.warn("[revenuecat] purchase failed", cause);
      setError(cause instanceof Error ? cause.message : "Could not complete that purchase.");
    } finally {
      setBusy(null);
    }
  }

  async function restore() {
    if (isGuest) {
      router.push("/register");
      return;
    }
    setBusy("restore");
    setError(null);
    try {
      await restoreIosPurchases(data.user.id);
      await activateTier();
    } catch (cause) {
      console.warn("[revenuecat] restore failed", cause);
      setError(cause instanceof Error ? cause.message : "No active App Store purchase was found.");
    } finally {
      setBusy(null);
    }
  }

  async function manage() {
    setBusy("manage");
    setError(null);
    try {
      const url = await getIosSubscriptionManagementUrl(data.user.id);
      if (!url) throw new Error("Your App Store subscription settings are not available yet.");
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (cause) {
      console.warn("[revenuecat] manage subscription failed", cause);
      setError(cause instanceof Error ? cause.message : "Could not open App Store subscription settings.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <PageHeader
        width={1080}
        eyebrow="Plans"
        title={
          <>
            Pick your <span className="accent-serif">Arcadia</span>.
          </>
        }
        meta="Subscriptions are securely processed through the App Store."
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
                Create an account before subscribing so your plan stays with you on every device.
              </p>
            </div>
            <AppButton variant="primary" onClick={() => router.push("/register")}>
              Create account
            </AppButton>
          </div>
        ) : null}

        <IntervalToggle value={interval} onChange={setInterval} />

        <div className="grid gap-4 md:grid-cols-3" aria-busy={loadingOffers}>
          {tiers.map((tier) => (
            <IosTierCard
              key={tier.key}
              tier={tier}
              option={tier.key === "free" ? null : optionByTier.get(`${tier.key}:${interval}`) ?? null}
              interval={interval}
              currentTier={currentTier}
              hasSubscription={hasSubscription}
              billingProvider={billingProvider}
              isGuest={isGuest}
              loading={busy === "purchase"}
              onPurchase={() => tier.key !== "free" && void startPurchase(tier.key)}
              onManage={() => void manage()}
            />
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <AppButton variant="secondary" onClick={() => void restore()} loading={busy === "restore"} disabled={loadingOffers}>
            Restore purchases
          </AppButton>
          <p className="text-[12.5px]" style={{ color: "var(--app-text-muted)" }}>
            Restore a subscription purchased with this Apple ID.
          </p>
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

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <IosFaqItem q="Can I cancel any time?" a="Yes. Manage your subscription from your Apple ID subscription settings. You keep access until the end of the current billing period." />
          <IosFaqItem q="What if I hit the daily message cap?" a="Arcad tells you and shows when it resets. Pro and Max include a higher daily cap." />
        </div>
      </div>
    </>
  );
}

function IntervalToggle({ value, onChange }: { value: RevenueCatInterval; onChange: (value: RevenueCatInterval) => void }) {
  return (
    <div className="mx-auto flex items-center gap-1 rounded-full p-1" style={{ background: "var(--app-surface)", boxShadow: "var(--elev-1)" }}>
      <IntervalButton active={value === "week"} onClick={() => onChange("week")}>Weekly</IntervalButton>
      <IntervalButton active={value === "month"} onClick={() => onChange("month")}>Monthly</IntervalButton>
      <IntervalButton active={value === "year"} onClick={() => onChange("year")}>Yearly</IntervalButton>
    </div>
  );
}

function IntervalButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-md px-4 py-1.5 text-[13px] font-semibold transition-colors"
      style={{ background: active ? "var(--app-arcad)" : "transparent", color: active ? "var(--app-arcad-on)" : "var(--app-text-muted)" }}
    >
      {children}
    </button>
  );
}

function IosTierCard({
  tier,
  option,
  interval,
  currentTier,
  hasSubscription,
  billingProvider,
  isGuest,
  loading,
  onPurchase,
  onManage,
}: {
  tier: IosTier;
  option: IosPurchaseOption | null;
  interval: RevenueCatInterval;
  currentTier: TierKey;
  hasSubscription: boolean;
  billingProvider: "stripe" | "app_store" | null;
  isGuest: boolean;
  loading: boolean;
  onPurchase: () => void;
  onManage: () => void;
}) {
  const isFree = tier.key === "free";
  const isCurrent = tier.key === currentTier;
  const billedLabel = interval === "week" ? "week" : interval === "month" ? "month" : "year";

  return (
    <div
      className="relative flex flex-col gap-5 rounded-lg p-6"
      style={{
        background: tier.highlighted ? "color-mix(in oklab, var(--app-arcad) 12%, var(--app-surface))" : "var(--app-surface)",
        boxShadow: tier.highlighted ? "var(--elev-2)" : "var(--elev-1)",
        border: tier.highlighted ? "1px solid color-mix(in oklab, var(--app-arcad) 45%, transparent)" : "1px solid transparent",
      }}
    >
      {tier.badge ? (
        <div className="absolute -top-3 right-6 rounded-md px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em]" style={{ background: "var(--app-arcad)", color: "var(--app-arcad-on)" }}>
          {tier.badge}
        </div>
      ) : null}
      <div>
        <h3 className="text-[20px] font-semibold" style={{ color: tier.highlighted ? "var(--app-arcad-strong)" : "var(--app-text)" }}>{tier.name}</h3>
        <p className="mt-1 text-[13.5px]" style={{ color: "var(--app-text-muted)" }}>{tier.headline}</p>
      </div>
      <div>
        {isFree ? (
          <div className="flex items-baseline gap-1.5">
            <span className="text-[36px] font-semibold" style={{ color: "var(--app-text)" }}>$0</span>
            <span className="text-[13px]" style={{ color: "var(--app-text-muted)" }}>forever</span>
          </div>
        ) : option ? (
          <div>
            <span className="text-[36px] font-semibold" style={{ color: "var(--app-text)" }}>{option.priceString}</span>
            <p className="mt-1 text-[12px]" style={{ color: "var(--app-text-faint)" }}>Billed per {billedLabel} through the App Store</p>
          </div>
        ) : (
          <p className="text-[14px]" style={{ color: "var(--app-text-muted)" }}>Not available yet</p>
        )}
      </div>
      <ul className="flex flex-col gap-2.5">
        {tier.features.map((feature) => (
          <li key={feature} className="flex items-start gap-2 text-[13.5px]" style={{ color: "var(--app-text-soft)" }}>
            <span aria-hidden="true" className="mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full" style={{ background: tier.highlighted ? "var(--app-arcad)" : "var(--app-arcad-soft)", color: tier.highlighted ? "var(--app-arcad-on)" : "var(--app-arcad-strong)" }}>✓</span>
            <span>{feature}</span>
          </li>
        ))}
      </ul>
      <div className="mt-auto pt-2">
        {isCurrent && !isFree ? (
          billingProvider === "app_store" ? (
            <AppButton variant="secondary" onClick={onManage} loading={loading}>Manage in App Store</AppButton>
          ) : (
            <AppButton variant="ghost" disabled>Current plan</AppButton>
          )
        ) : isCurrent ? (
          <AppButton variant="ghost" disabled>Current plan</AppButton>
        ) : isFree ? (
          <AppButton variant="ghost" disabled>{hasSubscription ? "Paid plan active" : "Free plan"}</AppButton>
        ) : (
          <AppButton variant={tier.highlighted ? "primary" : "secondary"} onClick={onPurchase} loading={loading} disabled={!option || hasSubscription}>
            {isGuest ? `Sign up for ${tier.name}` : hasSubscription ? "Current subscription active" : `Start ${tier.name}`}
          </AppButton>
        )}
      </div>
    </div>
  );
}

function IosFaqItem({ q, a }: { q: string; a: string }) {
  return (
    <div className="rounded-md p-5" style={{ background: "var(--app-surface)", boxShadow: "var(--elev-1)" }}>
      <p className="text-[14px] font-semibold" style={{ color: "var(--app-text)" }}>{q}</p>
      <p className="mt-1.5 text-[13px]" style={{ color: "var(--app-text-muted)" }}>{a}</p>
    </div>
  );
}
