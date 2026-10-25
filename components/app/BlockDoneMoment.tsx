"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { PlannerEvent, PlannerTask } from "@/lib/api/types";
import { formatClock } from "@/lib/api/time";
import { blockDoneLine, blockMinutes, ringMinutes } from "@/lib/app/blockDone";
import { attemptsLine } from "@/lib/app/autoBlocking";
import type { BlockReport } from "@/lib/capacitor/focusGuard";
import { tap } from "@/lib/capacitor/haptics";
import { useDashboardData } from "@/lib/app/DashboardProvider";
import { PAID_PRICING } from "@/lib/app/pricing";
import { isGuestEmail } from "@/lib/auth/guest";
import { announceBlockDoneMomentClosed } from "@/lib/app/firstStudyBlock";
import InviteNudge from "./InviteNudge";


const TRIAL_OFFER_KEY = "arcadia:trial-offer-shown";
const INVITE_NUDGE_KEY = "arcadia:invite-nudge-shown";
/** The invite card shows at most once every few days, so it never nags. */
const INVITE_NUDGE_EVERY_MS = 3 * 24 * 60 * 60 * 1000;

function inviteNudgeDue(user: { tier?: string; hasSubscription?: boolean; email?: string } | undefined): boolean {
  if (!user || user.hasSubscription || isGuestEmail(user.email)) return false;
  try {
    const last = Number(window.localStorage.getItem(INVITE_NUDGE_KEY));
    return !last || Date.now() - last > INVITE_NUDGE_EVERY_MS;
  } catch {
    return false;
  }
}

/** A free account's first block done: the one time we offer the free week here. */
function firstOffer(tier: string | undefined): boolean {
  if (tier && tier !== "free") return false;
  try {
    return !window.localStorage.getItem(TRIAL_OFFER_KEY);
  } catch {
    return false;
  }
}

const RING_R = 88;
const RING_C = 2 * Math.PI * RING_R;
/** How long the ring takes to fill. The soft haptic lands as it finishes. */
const FILL_MS = 900;

/**
 * The calm moment after ticking a block on Today. The block is already
 * saved when this shows, so nothing here is a required step: the next block
 * is one tap away, and "Back to today", Escape or the break all close it.
 */
export default function BlockDoneMoment({
  event,
  task,
  blocks,
  breakMinutes,
  timezone,
  report,
  onClose,
}: {
  event: PlannerEvent;
  task: PlannerTask | undefined;
  /** Today's study blocks as they were before the tick. */
  blocks: PlannerEvent[];
  breakMinutes: number;
  timezone: string;
  /** What the phone saw while apps were blocked; arrives a moment after the tick, iPhone only. */
  report?: BlockReport | null;
  onClose: () => void;
}) {
  // Captured once, so the moment doesn't change under the student when the
  // dashboard data updates behind it.
  const [view] = useState(() => {
    const ring = ringMinutes(event, blocks);
    const next = blocks
      .filter((block) => block.id !== event.id && block.outcome === "planned" && Date.parse(block.endAt) > Date.now())
      .sort((a, b) => Date.parse(a.startAt) - Date.parse(b.startAt))[0];
    return { ring, next, line: blockDoneLine(event, task, blocks) };
  });
  const [filled, setFilled] = useState(false);
  const [breakEndsAt, setBreakEndsAt] = useState<number | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const primary = useRef<HTMLAnchorElement | HTMLButtonElement | null>(null);
  // Escape closes; read through a ref so a new onClose doesn't replay the fill.
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = () => {
      announceBlockDoneMomentClosed();
      onClose();
    };
  }, [onClose]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => setFilled(true));
    const buzz = window.setTimeout(() => void tap(), FILL_MS);
    primary.current?.focus();
    const onKey = (keyEvent: KeyboardEvent) => {
      if (keyEvent.key === "Escape") closeRef.current();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(buzz);
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  useEffect(() => {
    if (breakEndsAt === null) return;
    const timer = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [breakEndsAt]);

  const { ring, next, line } = view;
  const { data } = useDashboardData();
  // Decided once when the moment opens, and only ever shown once.
  const [offer] = useState(() => firstOffer(data.user.tier));
  // The free-week offer comes first; the invite card waits for a later block.
  const [inviteNudge] = useState(() => !offer && inviteNudgeDue(data.user));
  // The App Store charges the same as the web.
  const monthly = PAID_PRICING.pro.monthly;
  useEffect(() => {
    if (!inviteNudge) return;
    try { window.localStorage.setItem(INVITE_NUDGE_KEY, String(Date.now())); } catch { /* shown again next time, fine */ }
  }, [inviteNudge]);
  useEffect(() => {
    if (!offer) return;
    try { window.localStorage.setItem(TRIAL_OFFER_KEY, String(Date.now())); } catch { /* shown again next time, fine */ }
  }, [offer]);
  const ratio = (filled ? ring.after : ring.before) / ring.goal;
  const name = event.subject || event.title;
  const breakLeft = breakEndsAt === null ? 0 : Math.max(0, Math.ceil((breakEndsAt - nowMs) / 1000));

  const on = "var(--app-hero-on)";
  const soft = "color-mix(in oklab, var(--app-hero-on) 72%, transparent)";
  const line16 = "color-mix(in oklab, var(--app-hero-on) 16%, transparent)";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="block-done-title"
      className="fixed inset-0 z-[130] flex flex-col items-center justify-center overflow-y-auto px-6 py-10 text-center app-enter"
      style={{ background: "var(--app-hero)", color: on }}
    >
      <svg width="200" height="200" viewBox="0 0 200 200" aria-hidden="true" className="shrink-0">
        <circle cx="100" cy="100" r={RING_R} fill="none" stroke={line16} strokeWidth="14" />
        <circle
          cx="100"
          cy="100"
          r={RING_R}
          fill="none"
          stroke="var(--app-hero-cta)"
          strokeWidth="14"
          strokeLinecap="round"
          strokeDasharray={RING_C}
          strokeDashoffset={RING_C * (1 - Math.min(1, ratio))}
          transform="rotate(-90 100 100)"
          className="motion-safe:transition-[stroke-dashoffset] motion-safe:ease-out"
          style={{ transitionDuration: `${FILL_MS}ms` }}
        />
        <text x="100" y="98" textAnchor="middle" fontSize="34" fontWeight="600" fill="currentColor" className="tabular-nums">
          {ring.after}
        </text>
        <text x="100" y="124" textAnchor="middle" fontSize="13" fill={soft}>
          of {ring.goal} min today
        </text>
      </svg>

      <h2 id="block-done-title" className="mt-8 text-[30px] font-semibold leading-tight tracking-[-0.02em]">
        {name} done
      </h2>
      <p className="mt-2 max-w-sm text-[15.5px] leading-6" style={{ color: soft }}>
        {line}
      </p>
      {report ? (
        <p className="mt-1 max-w-sm text-[14px] leading-6" style={{ color: soft }}>
          {attemptsLine(report.attempts)}
        </p>
      ) : null}

      {breakEndsAt !== null ? (
        <p className="mt-8 text-[15px] tabular-nums" role="timer" aria-live="off" style={{ color: soft }}>
          {breakLeft > 0
            ? `Break · ${Math.floor(breakLeft / 60)}:${String(breakLeft % 60).padStart(2, "0")}`
            : "Break's over. Ready when you are."}
        </p>
      ) : null}

      {next ? (
        <div className="mt-8 w-full max-w-sm rounded-[24px] p-5 text-left" style={{ boxShadow: `inset 0 0 0 1px ${line16}` }}>
          <p className="text-[13px] font-medium" style={{ color: soft }}>
            Next · {formatClock(next.startAt, timezone)} · {blockMinutes(next)} min
          </p>
          <p className="mt-1 truncate text-[18px] font-semibold">{next.subject || next.title}</p>
          <div className="mt-4 flex flex-wrap gap-2.5">
            {breakEndsAt === null ? (
              <button
                type="button"
                onClick={() => setBreakEndsAt(Date.now() + breakMinutes * 60_000)}
                className="ui-press inline-flex h-11 items-center rounded-full px-5 text-[15px] font-semibold"
                style={{ boxShadow: `inset 0 0 0 1.5px ${line16}`, color: on }}
              >
                {breakMinutes} min break
              </button>
            ) : null}
            <Link
              ref={(node) => {
                primary.current = node;
              }}
              href={`/app/sessions?eventId=${encodeURIComponent(next.id)}&start=1`}
              className="ui-press inline-flex h-11 items-center rounded-full px-5 text-[15px] font-semibold"
              style={{ background: "var(--app-hero-cta)", color: "var(--app-hero-cta-on)" }}
            >
              Keep going
            </Link>
          </div>
        </div>
      ) : null}

      {offer ? (
        <div className="mt-6 w-full max-w-sm rounded-[24px] p-5 text-left" style={{ background: "var(--app-hero-cta)", color: "var(--app-hero-cta-on)" }}>
          <p className="text-[13px] font-semibold opacity-80">That&apos;s how it feels when the plan works</p>
          <p className="mt-1 text-[19px] font-semibold leading-snug">Try Pro free for 7 days</p>
          <ul className="mt-3 flex flex-col gap-1.5 text-[14px] leading-snug">
            <li>✦ Tell Arcad anything, 20 times a day, and your week rebuilds itself</li>
            <li>✦ Your school, Google and Apple calendars in your plan</li>
            <li>✦ Upload your notes and Arcad answers from them</li>
          </ul>
          <p className="mt-3 text-[12.5px] opacity-75">
            Then A${monthly.toFixed(2)} a month. ChatGPT Plus is about A$30, and it doesn&apos;t know your week.
          </p>
          <Link
            href="/app/pricing"
            className="ui-press mt-4 inline-flex h-11 w-full items-center justify-center rounded-full text-[15px] font-semibold"
            style={{ background: "var(--app-hero)", color: "var(--app-hero-on)" }}
          >
            Start my free week
          </Link>
        </div>
      ) : null}

      {inviteNudge ? (
        <div className="mt-6 w-full max-w-sm">
          <InviteNudge />
        </div>
      ) : null}

      <button
        type="button"
        ref={next ? undefined : (node) => {
          primary.current = node;
        }}
        onClick={() => closeRef.current()}
        className="ui-press mt-6 rounded-full px-4 py-2 text-[14.5px] font-medium underline-offset-4 hover:underline"
        style={{ color: soft }}
      >
        Back to today
      </button>
    </div>
  );
}
