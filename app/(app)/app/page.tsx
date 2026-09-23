"use client";

import TodayView from "@/components/app/TodayView";

// Onboarding (and its paywall) is gated in app/(app)/app/layout.tsx, so this
// page only renders once onboarding is complete.
export default function AppPage() {
  return <TodayView />;
}
