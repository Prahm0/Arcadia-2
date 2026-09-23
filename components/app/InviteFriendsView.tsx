"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api/client";
import AppButton from "./AppButton";
import PageHeader from "./PageHeader";

interface ReferralSummary {
  code: string;
  inviteLink: string;
  qualifiedReferrals: number;
  bonusDays: number;
}

type Status = "loading" | "ready" | "error";

export default function InviteFriendsView() {
  const [summary, setSummary] = useState<ReferralSummary | null>(null);
  const [status, setStatus] = useState<Status>("loading");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let active = true;
    api<ReferralSummary>("/api/referrals")
      .then((next) => {
        if (!active) return;
        setSummary(next);
        setStatus("ready");
      })
      .catch((reason) => {
        if (!active) return;
        setError(reason instanceof Error ? reason.message : "Could not load your invite link.");
        setStatus("error");
      });
    return () => {
      active = false;
    };
  }, []);

  async function copyInviteLink() {
    if (!summary) return;
    try {
      await navigator.clipboard.writeText(summary.inviteLink);
      setNotice("Invite link copied.");
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = summary.inviteLink;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      const copied = document.execCommand("copy");
      textarea.remove();
      setNotice(copied ? "Invite link copied." : "Copy the invite link above.");
    }
  }

  async function shareInvite() {
    if (!summary) return;
    const text = "Arcadia keeps your study plan useful when life changes. Join with my link and we both get 14 days of Pro after you finish setup.";
    if (navigator.share) {
      try {
        await navigator.share({ title: "Plan with Arcadia", text, url: summary.inviteLink });
        return;
      } catch (reason) {
        if (reason instanceof DOMException && reason.name === "AbortError") return;
      }
    }
    await copyInviteLink();
  }

  return (
    <>
      <PageHeader
        width={760}
        eyebrow="Community"
        title="Invite friends"
        meta="Give each other more room to plan."
      />
      <main className="mx-auto w-full max-w-[760px] px-6 pb-12 pt-6 sm:px-10">
        {status === "loading" ? <LoadingCard /> : null}
        {status === "error" ? (
          <section className="rounded-lg p-6 text-center" style={{ background: "var(--app-surface)", boxShadow: "var(--elev-1)" }}>
            <p className="text-[15px] font-medium" style={{ color: "var(--app-text)" }}>{error}</p>
            {error.includes("Create an account") ? null : (
              <AppButton className="mt-4" variant="secondary" onClick={() => window.location.reload()}>
                Try again
              </AppButton>
            )}
          </section>
        ) : null}
        {status === "ready" && summary ? (
          <div className="space-y-5">
            <section
              className="relative overflow-hidden rounded-xl p-6 sm:p-8"
              style={{
                background: "linear-gradient(135deg, color-mix(in oklab, var(--app-accent) 24%, var(--app-surface)), var(--app-surface))",
                boxShadow: "var(--elev-2)",
              }}
            >
              <div aria-hidden="true" className="absolute -right-8 -top-10 h-40 w-40 rounded-full opacity-30 blur-2xl" style={{ background: "var(--app-accent)" }} />
              <div className="relative max-w-[510px]">
                <div className="flex items-center gap-2 text-[13px] font-medium" style={{ color: "var(--app-accent-strong)" }}>
                  <StarsIcon />
                  A little more time, together
                </div>
                <h2 className="mt-3 text-[27px] font-semibold tracking-[-0.03em] sm:text-[32px]" style={{ color: "var(--app-text)" }}>
                  Give a friend 14 days of Pro.
                </h2>
                <p className="mt-3 text-[14.5px] leading-6" style={{ color: "var(--app-text-soft)" }}>
                  When they create a new account, verify their email and finish setup, you both receive 14 days of Pro time.
                </p>
              </div>

              <label className="relative mt-6 block">
                <span className="sr-only">Your invite link</span>
                <div className="flex items-center gap-2 rounded-lg border p-2 pl-3" style={{ background: "var(--app-surface)", borderColor: "var(--app-border-strong)" }}>
                  <input readOnly value={summary.inviteLink} className="min-w-0 flex-1 bg-transparent text-[13px] outline-none" style={{ color: "var(--app-text-soft)" }} aria-label="Your invite link" />
                  <AppButton size="sm" variant="secondary" onClick={() => void copyInviteLink()}>Copy link</AppButton>
                </div>
              </label>
              <div className="relative mt-3 flex flex-wrap gap-2">
                <AppButton variant="primary" onClick={() => void shareInvite()} icon={<ShareIcon />}>
                  Share invite
                </AppButton>
                {notice ? <p role="status" className="self-center text-[13px]" style={{ color: "var(--app-text-muted)" }}>{notice}</p> : null}
              </div>
            </section>

            <section className="rounded-lg p-5 sm:p-6" style={{ background: "var(--app-surface)", boxShadow: "var(--elev-1)" }}>
              <p className="type-eyebrow" style={{ color: "var(--app-text-muted)" }}>Your invite progress</p>
              <div className="mt-4 grid gap-px overflow-hidden rounded-lg border sm:grid-cols-2" style={{ background: "var(--app-border)", borderColor: "var(--app-border)" }}>
                <Stat value={String(summary.qualifiedReferrals)} label={summary.qualifiedReferrals === 1 ? "friend joined" : "friends joined"} />
                <Stat value={`${summary.bonusDays}`} label={summary.bonusDays === 1 ? "bonus day of Pro active" : "bonus days of Pro active"} />
              </div>
              <p className="mt-4 text-[13.5px]" style={{ color: "var(--app-text-muted)" }}>
                {summary.qualifiedReferrals === 0
                  ? "Your first completed invite unlocks Pro time for both of you."
                  : `${summary.qualifiedReferrals} ${summary.qualifiedReferrals === 1 ? "friend has" : "friends have"} joined through your link.`}
              </p>
            </section>

            <p className="px-1 text-center text-[12.5px] leading-5" style={{ color: "var(--app-text-muted)" }}>
              Referral bonuses are capped at 180 days of Pro time. Invite links are for new Arcadia accounts only.
            </p>
          </div>
        ) : null}
      </main>
    </>
  );
}

function LoadingCard() {
  return <div aria-label="Loading your invite link" className="h-[390px] animate-pulse rounded-xl" style={{ background: "var(--app-surface-soft)" }} />;
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="p-5" style={{ background: "var(--app-surface)" }}>
      <p className="text-[28px] font-semibold tabular-nums tracking-[-0.03em]" style={{ color: "var(--app-text)" }}>{value}</p>
      <p className="mt-1 text-[13px]" style={{ color: "var(--app-text-muted)" }}>{label}</p>
    </div>
  );
}

function StarsIcon() {
  return <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="m12 3 1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9L12 3Z" /><path d="m19 16 .8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8L19 16Z" /></svg>;
}

function ShareIcon() {
  return <svg aria-hidden="true" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" /><path d="m8.6 10.5 6.8-4M8.6 13.5l6.8 4" /></svg>;
}
