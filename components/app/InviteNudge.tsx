"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { fetchReferralSummary, shareInviteLink } from "@/lib/app/invite";

/**
 * "Invite a friend, get a free week of Pro", with the share sheet one tap
 * away. Each friend who joins and finishes setup gives the sharer 7 days of
 * Pro (backend lib/referrals). The link is fetched on tap, not on show.
 */
export default function InviteNudge({ tone = "hero", onShared }: { tone?: "hero" | "plain"; onShared?: () => void }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  async function invite() {
    setBusy(true);
    setNote(null);
    try {
      const { inviteLink } = await fetchReferralSummary();
      const result = await shareInviteLink(inviteLink);
      if (result === "copied") setNote("Link copied. Send it to a friend.");
      if (result === "shared" || result === "copied") onShared?.();
      if (result === "failed") router.push("/app/invite");
    } catch {
      // Guests and anything unexpected: the invite page explains.
      router.push("/app/invite");
    } finally {
      setBusy(false);
    }
  }

  const hero = tone === "hero";
  return (
    <div
      className="w-full rounded-[20px] p-4 text-left"
      style={hero
        ? { background: "color-mix(in oklab, var(--app-hero-on) 10%, transparent)", color: "var(--app-hero-on)" }
        : { background: "var(--app-surface)", boxShadow: "inset 0 0 0 1px var(--app-border)", color: "var(--app-text)" }}
    >
      <p className="text-[15px] font-semibold leading-snug">Get a free week of Pro</p>
      <p className="mt-0.5 text-[13px] leading-snug" style={{ opacity: 0.75 }}>
        For every friend who joins with your link. Know someone who&apos;d use this?
      </p>
      <button
        type="button"
        onClick={() => void invite()}
        disabled={busy}
        className="ui-press mt-3 inline-flex h-10 w-full items-center justify-center rounded-full text-[14.5px] font-semibold disabled:opacity-60"
        style={hero
          ? { background: "var(--app-hero-on)", color: "var(--app-hero)" }
          : { background: "var(--app-accent)", color: "var(--app-accent-on)" }}
      >
        {busy ? "Getting your link…" : "Invite a friend"}
      </button>
      {note ? <p role="status" className="mt-2 text-center text-[12.5px]" style={{ opacity: 0.8 }}>{note}</p> : null}
    </div>
  );
}
