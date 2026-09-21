/**
 * Thin Stripe client over `fetch` — the official SDK is Node-only and
 * heavier than we need. Every call returns Stripe's own JSON, or throws
 * on non-2xx with the error message so route handlers can bubble it up.
 *
 * We hit Stripe's REST API directly: form-urlencoded request bodies,
 * bearer auth, versioned via the `Stripe-Version` header so a Stripe-side
 * API bump doesn't silently reshape our responses.
 */

import type { Env } from "../types";

const STRIPE_API = "https://api.stripe.com/v1";
const STRIPE_VERSION = "2025-01-27.acacia";

interface StripeCallOptions {
  method?: "GET" | "POST" | "DELETE";
  body?: Record<string, unknown>;
  idempotencyKey?: string;
}

/**
 * Serialises the nested body Stripe expects (form-urlencoded, but with
 * `foo[bar]=baz` keys for nested objects and `foo[0]=…&foo[1]=…` for
 * arrays). Only handles the depths we actually use — good enough for
 * Checkout sessions and Portal calls.
 */
function encodeStripeForm(body: Record<string, unknown>): string {
  const params = new URLSearchParams();
  const walk = (prefix: string, value: unknown) => {
    if (value === undefined || value === null) return;
    if (Array.isArray(value)) {
      value.forEach((item, i) => walk(`${prefix}[${i}]`, item));
      return;
    }
    if (typeof value === "object") {
      for (const [k, v] of Object.entries(value)) walk(`${prefix}[${k}]`, v);
      return;
    }
    params.append(prefix, String(value));
  };
  for (const [k, v] of Object.entries(body)) walk(k, v);
  return params.toString();
}

async function stripeCall<T>(env: Env, path: string, opts: StripeCallOptions = {}): Promise<T> {
  if (!env.STRIPE_SECRET_KEY) throw new Error("STRIPE_SECRET_KEY missing on Worker.");
  const headers: Record<string, string> = {
    authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
    "stripe-version": STRIPE_VERSION,
  };
  const init: RequestInit = { method: opts.method ?? (opts.body ? "POST" : "GET"), headers };
  if (opts.body) {
    headers["content-type"] = "application/x-www-form-urlencoded";
    init.body = encodeStripeForm(opts.body);
  }
  if (opts.idempotencyKey) headers["idempotency-key"] = opts.idempotencyKey;

  const response = await fetch(`${STRIPE_API}${path}`, init);
  const text = await response.text();
  if (!response.ok) {
    // Stripe returns { error: { message, type, code } } — surface the
    // message and status so callers can decide whether to retry.
    let message = text;
    try {
      const parsed = JSON.parse(text) as { error?: { message?: string } };
      message = parsed.error?.message ?? text;
    } catch {
      /* text was not JSON */
    }
    throw new Error(`Stripe ${response.status}: ${message}`);
  }
  return JSON.parse(text) as T;
}

// ────────── Types ──────────

export interface CheckoutSession {
  id: string;
  url: string | null;
  customer: string | null;
  subscription: string | null;
}

export interface PortalSession {
  id: string;
  url: string;
}

export interface StripeCustomer {
  id: string;
  email: string | null;
}

export interface StripeSubscription {
  id: string;
  status: string;
  customer: string;
  current_period_end: number;
  cancel_at_period_end: boolean;
  items: {
    data: Array<{ price: { id: string } }>;
  };
}

// ────────── Calls we make ──────────

export async function createCustomer(env: Env, email: string, userId: string): Promise<StripeCustomer> {
  return stripeCall<StripeCustomer>(env, "/customers", {
    body: {
      email,
      metadata: { userId },
    },
  });
}

/**
 * Kicks off Stripe Checkout for a subscription. `client_reference_id` is
 * the userId so the webhook can attribute the resulting subscription
 * even before the browser has re-hit our success page.
 */
export async function createCheckoutSession(
  env: Env,
  params: {
    customerId?: string;
    customerEmail?: string;
    userId: string;
    priceId: string;
    successUrl: string;
    cancelUrl: string;
  },
): Promise<CheckoutSession> {
  const body: Record<string, unknown> = {
    mode: "subscription",
    line_items: [{ price: params.priceId, quantity: 1 }],
    success_url: params.successUrl,
    cancel_url: params.cancelUrl,
    client_reference_id: params.userId,
    allow_promotion_codes: true,
    subscription_data: { metadata: { userId: params.userId } },
  };
  if (params.customerId) {
    body.customer = params.customerId;
  } else if (params.customerEmail) {
    body.customer_email = params.customerEmail;
  }
  return stripeCall<CheckoutSession>(env, "/checkout/sessions", { body });
}

export async function createPortalSession(
  env: Env,
  params: { customerId: string; returnUrl: string },
): Promise<PortalSession> {
  return stripeCall<PortalSession>(env, "/billing_portal/sessions", {
    body: { customer: params.customerId, return_url: params.returnUrl },
  });
}

export async function retrieveSubscription(env: Env, id: string): Promise<StripeSubscription> {
  return stripeCall<StripeSubscription>(env, `/subscriptions/${encodeURIComponent(id)}`);
}

// ────────── Webhook signature verification ──────────

/**
 * Stripe signs the raw request body with a shared secret and sends the
 * result in the `Stripe-Signature` header, formatted:
 *   t=<unix ts>,v1=<hex hmac-sha256>,v0=<legacy>
 * We recompute HMAC(`${t}.${body}`) and constant-time compare against v1.
 * Also enforces a 5-minute tolerance so an intercepted request can't be
 * replayed weeks later.
 */
const TOLERANCE_MS = 5 * 60 * 1000;

export async function verifyWebhookSignature(
  secret: string,
  body: string,
  signatureHeader: string,
): Promise<{ event: StripeEvent }> {
  const parts = Object.fromEntries(
    signatureHeader.split(",").map((p) => {
      const idx = p.indexOf("=");
      return [p.slice(0, idx).trim(), p.slice(idx + 1).trim()];
    }),
  );
  const timestamp = Number(parts.t);
  const signature = parts.v1;
  if (!Number.isFinite(timestamp) || !signature) {
    throw new Error("Stripe signature header malformed.");
  }
  if (Math.abs(Date.now() - timestamp * 1000) > TOLERANCE_MS) {
    throw new Error("Stripe signature timestamp outside tolerance.");
  }

  const payload = `${timestamp}.${body}`;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sigBytes = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload)));
  const expected = Array.from(sigBytes, (b) => b.toString(16).padStart(2, "0")).join("");
  if (!constantTimeEqual(expected, signature)) {
    throw new Error("Stripe signature mismatch.");
  }
  return { event: JSON.parse(body) as StripeEvent };
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export interface StripeEvent {
  id: string;
  type: string;
  data: { object: unknown };
}
