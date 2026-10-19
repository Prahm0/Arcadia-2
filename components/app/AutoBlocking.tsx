"use client";

import { useEffect, useRef, useState } from "react";
import { GUARD_HORIZON_MS, MAX_GUARDED, guardedBlocks, liveBlock } from "@/lib/app/autoBlocking";
import { BLOCK_TIMES_CHANGED, blockTimeBlocks, readBlockTimes, readUnlockWait } from "@/lib/app/blockTimes";
import { useDashboardData } from "@/lib/app/DashboardProvider";
import { FocusGuard, guardBlocks, useFocusGuardStatus } from "@/lib/capacitor/focusGuard";

/** How often the in-app fallback checks whether a block has started or ended. */
const TICK_MS = 30_000;

/**
 * Opal's job, with no per-session setup: every study block, and every block
 * time the student set ("Night, 9pm to 7am"), blocks the picked apps from
 * its start until it's ticked or ends. Hands the coming blocks to
 * the phone whenever the plan changes. Renders nothing; does nothing on the
 * web or with no apps picked.
 */
export default function AutoBlocking() {
  const { data } = useDashboardData();
  const [status] = useFocusGuardStatus();
  const [now, setNow] = useState(() => Date.now());
  const sent = useRef<string | null>(null);
  // The student's own block times ("Night, 9pm to 7am"), read again when they change.
  const [times, setTimes] = useState(readBlockTimes);
  const [wait, setWait] = useState(readUnlockWait);
  useEffect(() => {
    const changed = () => {
      setTimes(readBlockTimes());
      setWait(readUnlockWait());
    };
    window.addEventListener(BLOCK_TIMES_CHANGED, changed);
    return () => window.removeEventListener(BLOCK_TIMES_CHANGED, changed);
  }, []);

  // The block screen's "5 more minutes" waits as long as the student chose.
  const supported = Boolean(status?.blockingSupported);
  useEffect(() => {
    if (!supported) return;
    void FocusGuard.setPreferences({ unlockWaitSeconds: wait }).catch(() => {});
  }, [supported, wait]);

  useEffect(() => {
    if (!status?.blockingSupported) return;
    const timer = window.setInterval(() => setNow(Date.now()), TICK_MS);
    return () => window.clearInterval(timer);
  }, [status?.blockingSupported]);

  useEffect(() => {
    if (!status?.blockingSupported) return;
    // Block times are Pro; study blocks block apps on every plan.
    const paid = data.user.tier === "pro" || data.user.tier === "max";
    const blocks = [...guardedBlocks(data.events, now), ...(paid ? blockTimeBlocks(times, now, GUARD_HORIZON_MS) : [])]
      .sort((a, b) => a.startsAt - b.startsAt)
      .slice(0, MAX_GUARDED);
    const live = liveBlock(blocks, now);
    // Only changes reach the phone: a new plan, or a block starting or ending.
    const key = status.autoBlocking
      ? `auto|${blocks.map((block) => `${block.id}@${block.startsAt}-${block.endsAt}`).join(",")}`
      : `app|${live ? `${live.id}@${live.endsAt}` : ""}`;
    if (key === sent.current) return;
    sent.current = key;
    void guardBlocks(blocks, live, status);
  }, [data.events, data.user.tier, now, status, times]);

  return null;
}
