import type { Metadata } from "next";
import TodayView from "@/components/app/TodayView";

export const metadata: Metadata = { title: "Today" };

// Onboarding (and its paywall) is gated in app/(app)/app/layout.tsx, so this
// page only renders once onboarding is complete.
export default function AppPage() {
  return <TodayView />;
}
