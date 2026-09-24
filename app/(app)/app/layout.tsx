"use client";

import { useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import AppShell from "@/components/app/AppShell";
import Onboarding from "@/components/app/Onboarding";
import { DashboardDataProvider, useDashboard } from "@/lib/app/DashboardProvider";
import { useDashboardAutoRefresh } from "@/lib/app/useDashboardAutoRefresh";
import { StudySkyProvider } from "@/lib/app/StudySkyProvider";
import { FocusSessionProvider } from "@/components/app/focus/FocusSession";

// ThemeProvider is mounted one level up in app/(app)/layout.tsx so the auth
// and legal pages share the dashboard's theme.
export default function AppLayout({ children }: { children: ReactNode }) {
  return <Gate>{children}</Gate>;
}

function Gate({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { state, reload, patch } = useDashboard();
  useDashboardAutoRefresh(reload);

  useEffect(() => {
    if (state.status === "unauthenticated") router.replace("/login");
  }, [state.status, router]);

  if (state.status === "loading") {
    return (
      <div
        className="grid min-h-svh place-items-center"
        style={{ background: "var(--app-bg)", color: "var(--app-text)" }}
      >
        <div
          aria-label="Loading"
          className="h-6 w-6 animate-spin rounded-full border-2"
          style={{ borderColor: "var(--app-border)", borderTopColor: "var(--app-accent)" }}
        />
      </div>
    );
  }

  if (state.status === "unauthenticated") return null;

  if (state.status === "error") {
    return (
      <div
        className="flex min-h-svh flex-col items-center justify-center gap-4 px-6 text-center"
        style={{ background: "var(--app-bg)", color: "var(--app-text)" }}
      >
        <p className="text-[20px] font-medium tracking-[-0.015em]">
          Couldn't <span className="accent-serif">reach</span> the server.
        </p>
        <p className="max-w-[380px] text-[14px]" style={{ color: "var(--app-text-muted)" }}>
          {state.error}
        </p>
        <button
          onClick={reload}
          className="rounded-full px-4 py-2 text-[13px] font-medium"
          style={{ background: "var(--app-accent)", color: "var(--app-accent-on)" }}
        >
          Try again
        </button>
      </div>
    );
  }

  const { user, profile } = state.data;
  const notices = user.onboardingComplete ? (state.data.notices ?? []) : [];

  return (
    <DashboardDataProvider data={state.data} reload={reload} patch={patch}>
      {user.onboardingComplete ? (
        <StudySkyProvider key={user.id}>
          {/* Above the pages, so a focus timer and its pop-out survive moving between them. */}
          <FocusSessionProvider>
            <AppShell user={user} notices={notices}>
              {children}
            </AppShell>
          </FocusSessionProvider>
        </StudySkyProvider>
      ) : (
        // Until onboarding (and its paywall) finishes, the whole app is the
        // onboarding flow: no sidebar, no nav, no other routes reachable.
        <Onboarding
          defaultName={user.name}
          defaultTimezone={
            profile?.timezone ||
            (typeof Intl !== "undefined"
              ? Intl.DateTimeFormat().resolvedOptions().timeZone
              : "Australia/Sydney")
          }
          onComplete={() => reload()}
        />
      )}
    </DashboardDataProvider>
  );
}
