import posthog from "posthog-js";

// Thin, typed wrapper over PostHog so components never touch the SDK directly
// and the funnel event names live in exactly one place. Every call is a no-op
// on the server and before PostHog has started (e.g. local dev), so callers
// never need to guard.

function ready(): boolean {
  return typeof window !== "undefined" && posthog.__loaded === true;
}

/** Tie subsequent events to a known user. Call right after login/session load. */
export function identifyUser(userId: string, props?: Record<string, unknown>): void {
  if (!ready()) return;
  posthog.identify(userId, props);
}

/** Clear identity on logout so the next person on the device is separate. */
export function resetAnalytics(): void {
  if (!ready()) return;
  posthog.reset();
}

function track(event: string, props?: Record<string, unknown>): void {
  if (!ready()) return;
  posthog.capture(event, props);
}

/**
 * The acquisition-to-revenue funnel, named once. Anything the backend saves
 * (payments, focus sessions, decks, files…) is sent from the Worker instead,
 * see backend/src/lib/posthog.ts, so ad blockers and closed tabs don't drop
 * it. subscription_activated/changed/ended come from the billing webhooks.
 */
export const analytics = {
  signupStarted: () => track("signup_started"),
  signupCompleted: () => track("signup_completed"),
  emailVerified: () => track("email_verified"),
  onboardingCompleted: (subjectCount: number, taskCount: number) =>
    track("onboarding_completed", { subjectCount, taskCount }),
  checkoutStarted: (plan: string, interval: string) =>
    track("checkout_started", { plan, interval }),
  arcadMessageSent: () => track("arcad_message_sent"),
  /**
   * The core USP loop: a student told Arcad life changed and the plan reflowed.
   * `moved` is how many sessions it rearranged; `onboarding` marks the first-run
   * wow. This is the metric that says whether the magic is actually landing.
   */
  recoveryUsed: (reason: string, moved: number, onboarding = false) =>
    track("recovery_used", { reason, moved, onboarding }),
  studyWithMeStarted: (scene: string) => track("study_with_me_started", { scene }),
  studyWithMeShared: () => track("study_with_me_shared"),
};
