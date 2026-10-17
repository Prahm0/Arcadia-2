"use client";

import { useEffect, useRef, useState } from "react";
import { guardedBlocks, liveBlock } from "@/lib/app/autoBlocking";
import { useDashboardData } from "@/lib/app/DashboardProvider";
import { guardBlocks, useFocusGuardStatus } from "@/lib/capacitor/focusGuard";

/** How often the in-app fallback checks whether a block has started or ended. */
const TICK_MS = 30_000;

/**
 * Opal's job, with no per-session setup: every study block blocks the picked
 * apps from its start until it's ticked or ends. Hands the coming blocks to
 * the phone whenever the plan changes. Renders nothing; does nothing on the
 * web or with no apps picked.
 */
export default function AutoBlocking() {
  const { data } = useDashboardData();
  const [status] = useFocusGuardStatus();
  const [now, setNow] = useState(() => Date.now());
  const sent = useRef<string | null>(null);

  useEffect(() => {
    if (!status?.blockingSupported) return;
    const timer = window.setInterval(() => setNow(Date.now()), TICK_MS);
    return () => window.clearInterval(timer);
  }, [status?.blockingSupported]);

  useEffect(() => {
    if (!status?.blockingSupported) return;
    const blocks = guardedBlocks(data.events, now);
    const live = liveBlock(blocks, now);
    // Only changes reach the phone: a new plan, or a block starting or ending.
    const key = status.autoBlocking
      ? `auto|${blocks.map((block) => `${block.id}@${block.startsAt}-${block.endsAt}`).join(",")}`
      : `app|${live ? `${live.id}@${live.endsAt}` : ""}`;
    if (key === sent.current) return;
    sent.current = key;
    void guardBlocks(blocks, live, status);
  }, [data.events, now, status]);

  return null;
}
