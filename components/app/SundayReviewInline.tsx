"use client";

import { useEffect, useState } from "react";
import { useDashboardData } from "@/lib/app/DashboardProvider";
import { previousWeekWindow, weekWindowContaining } from "@/lib/app/weeklyReview";
import WeeklyReviewCard from "./WeeklyReviewCard";

const STORAGE_PREFIX = "arcadia:review:dismissed:";

/**
 * Shows the previous-week review inline on Today, but only on Sundays so the
 * card lands the moment the week actually closes. Dismissal is remembered
 * against the current in-progress week so a refresh won't bring it back, and
 * the card returns automatically next Sunday.
 */
export default function SundayReviewInline() {
  const { data } = useDashboardData();
  const timezone = data.profile?.timezone || data.user.timezone || "Australia/Sydney";
  const [visible, setVisible] = useState(false);
  const [storageKey, setStorageKey] = useState<string | null>(null);

  useEffect(() => {
    const now = new Date();
    // Only render on Sunday. If a user wants to see the review any other day,
    // Review is one click from the sidebar.
    const weekday = new Intl.DateTimeFormat("en-AU", {
      timeZone: timezone,
      weekday: "short",
    }).format(now);
    if (weekday !== "Sun") return;

    // Sanity check that we actually have something to say about last week.
    const previousWindow = previousWeekWindow(now, timezone);
    if (
      !data.events.some(
        (event) =>
          event.category === "study" &&
          event.startAt.slice(0, 10) >= previousWindow.startKey &&
          event.startAt.slice(0, 10) <= previousWindow.endKey,
      )
    ) {
      return;
    }

    const key = `${STORAGE_PREFIX}${weekWindowContaining(now, timezone).startKey}`;
    setStorageKey(key);
    try {
      if (window.localStorage.getItem(key) !== "1") setVisible(true);
    } catch {
      setVisible(true);
    }
  }, [data.events, timezone]);

  function dismiss() {
    if (storageKey) {
      try {
        window.localStorage.setItem(storageKey, "1");
      } catch {
        /* ignore */
      }
    }
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div className="mb-6">
      <WeeklyReviewCard window="previous" inline cta={{ href: "/app/review", label: "See full review" }} />
      <div className="mt-2 flex justify-end">
        <button
          type="button"
          onClick={dismiss}
          className="text-[12px] font-medium"
          style={{ color: "var(--app-text-muted)" }}
        >
          Dismiss for the week
        </button>
      </div>
    </div>
  );
}
