import type { Context } from "hono";
import type { Env, Variables } from "../types";

/**
 * Server-side PostHog events. Things the Worker saves (a focus session, a
 * deck, a payment) are counted here rather than in the browser, where ad
 * blockers and closed tabs drop a share of them. The distinct id is the
 * user id, the same one lib/analytics identifies the browser with, so both
 * streams land on one person.
 *
 * Sending never blocks or fails a request: it runs after the response via
 * waitUntil, and errors are only logged. Local dev never sends, so real
 * analytics stay clean (the browser side skips localhost the same way).
 */

type Ctx = Context<{ Bindings: Env; Variables: Variables }>;

export interface ServerEvent {
  userId: string;
  event: string;
  properties?: Record<string, unknown>;
}

function enabled(c: Ctx): boolean {
  if (!c.env.POSTHOG_KEY) return false;
  const host = new URL(c.req.url).hostname;
  return host !== "localhost" && host !== "127.0.0.1" && !host.endsWith(".local");
}

export function track(c: Ctx, userId: string, event: string, properties?: Record<string, unknown>): void {
  trackMany(c, [{ userId, event, properties }]);
}

export function trackMany(c: Ctx, events: ServerEvent[]): void {
  if (events.length === 0 || !enabled(c)) return;
  const host = (c.env.POSTHOG_HOST || "https://eu.i.posthog.com").replace(/\/$/, "");
  const timestamp = new Date().toISOString();
  const sending = fetch(`${host}/batch/`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      api_key: c.env.POSTHOG_KEY,
      batch: events.map(({ userId, event, properties }) => ({
        event,
        timestamp,
        properties: {
          ...properties,
          distinct_id: userId,
          $lib: "arcadia-api",
          // The request comes from Cloudflare, not the student, so its IP
          // would put everyone in the wrong city.
          $geoip_disable: true,
        },
      })),
    }),
  })
    .then((response) => {
      if (!response.ok) console.warn("[posthog] capture failed", response.status);
    })
    .catch((error) => console.warn("[posthog] capture failed", error));

  try {
    c.executionCtx.waitUntil(sending);
  } catch {
    // No execution context (tests); the promise still runs.
  }
}
