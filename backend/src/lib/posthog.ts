/**
 * Server-side PostHog events, for funnel steps that happen in more than one
 * place in the app but only one place on the server. The distinct id is the
 * Arcadia user id, the same one the web app passes to `posthog.identify`, so
 * these join the student's client-side events.
 *
 * The project key is the public client key (it already ships in the browser
 * bundle), so it's safe as a default. Sending is fire-and-forget: analytics
 * must never slow down or fail the request that triggered it.
 */

const DEFAULT_KEY = "phc_kWBHKrQWB7pvNdMT4GhnXRtnxZrzqR9x6r2VPEtAjYJA";
const DEFAULT_HOST = "https://eu.i.posthog.com";

interface PostHogEnv {
  APP_ORIGIN: string;
  POSTHOG_KEY?: string;
  POSTHOG_HOST?: string;
}

export function captureServerEvent(
  env: PostHogEnv,
  waitUntil: (promise: Promise<unknown>) => void,
  userId: string,
  event: string,
  properties: Record<string, unknown> = {},
): void {
  const key = env.POSTHOG_KEY ?? DEFAULT_KEY;
  // Keep local development out of real analytics, as the web app does.
  if (!key || /localhost|127\.0\.0\.1/.test(env.APP_ORIGIN)) return;
  const send = fetch(`${env.POSTHOG_HOST ?? DEFAULT_HOST}/capture/`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      api_key: key,
      event,
      distinct_id: userId,
      properties: { ...properties, $lib: "arcadia-api" },
      timestamp: new Date().toISOString(),
    }),
  }).catch((error) => console.warn("[posthog] capture failed", event, error));
  waitUntil(send);
}
