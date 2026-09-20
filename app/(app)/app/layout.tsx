"use client";

import { useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import AppShell from "@/components/app/AppShell";
import { DashboardDataProvider, useDashboard } from "@/lib/app/DashboardProvider";
import { useDashboardAutoRefresh } from "@/lib/app/useDashboardAutoRefresh";

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

  const briefing = state.data.user.onboardingComplete ? state.data.briefing : null;

  return (
    <DashboardDataProvider data={state.data} reload={reload} patch={patch}>
      <AppShell user={state.data.user} briefing={briefing}>
        {children}
      </AppShell>
    </DashboardDataProvider>
  );
}
