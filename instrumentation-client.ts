// Sentry browser init. Runs after the HTML loads, before hydration.
//
// Guarded by NEXT_PUBLIC_SENTRY_DSN so a clone without env vars stays
// completely inert (the SDK bytes still ship because next/webpack can't
// dead-code-eliminate the import, but init never fires).
import * as Sentry from "@sentry/nextjs";

if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    environment:
      process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT || process.env.NODE_ENV,
    tracesSampleRate: Number(
      process.env.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE ?? 0.1,
    ),
    // Session Replay only fires when an error is captured — no cost on
    // clean sessions, full context when something breaks.
    replaysOnErrorSampleRate: 1.0,
    replaysSessionSampleRate: 0,
    integrations: [
      Sentry.replayIntegration({
        maskAllText: false,
        blockAllMedia: false,
      }),
    ],
    enabled: process.env.NODE_ENV === "production",
  });
}

// Forwards App Router navigations to Sentry so breadcrumbs know where the
// user was when an error fires. Safe to export even when init is skipped.
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
