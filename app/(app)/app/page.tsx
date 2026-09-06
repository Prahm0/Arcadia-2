"use client";

import Onboarding from "@/components/app/Onboarding";
import TodayView from "@/components/app/TodayView";
import { useDashboardData } from "@/lib/app/DashboardProvider";

export default function AppPage() {
  const { data, reload } = useDashboardData();

  if (!data.user.onboardingComplete) {
    return (
      <Onboarding
        defaultName={data.user.name}
        defaultTimezone={
          data.profile?.timezone ||
          (typeof Intl !== "undefined"
            ? Intl.DateTimeFormat().resolvedOptions().timeZone
            : "Australia/Sydney")
        }
        onComplete={() => reload()}
      />
    );
  }

  return <TodayView />;
}
