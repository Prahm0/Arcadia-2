import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Verification endpoint for Sentry wiring.
 *
 * GET /api/sentry-test?token=<SENTRY_TEST_TOKEN>
 *
 * Throws an uncaught error so Sentry's `onRequestError` hook fires and a
 * server issue appears in the dashboard. Guarded by a shared token so it
 * can't be used to spam the ingest quota. Also refuses to run at all
 * unless SENTRY_DSN is configured, no point failing on demand otherwise.
 */
export async function GET(request: Request) {
  if (!process.env.SENTRY_DSN) {
    return NextResponse.json(
      { ok: false, reason: "SENTRY_DSN is not set." },
      { status: 503 },
    );
  }

  const expected = process.env.SENTRY_TEST_TOKEN;
  if (!expected) {
    return NextResponse.json(
      { ok: false, reason: "SENTRY_TEST_TOKEN is not set." },
      { status: 503 },
    );
  }

  const url = new URL(request.url);
  if (url.searchParams.get("token") !== expected) {
    return NextResponse.json({ ok: false, reason: "Bad token." }, { status: 401 });
  }

  throw new Error("Sentry test error, if you can see this in Sentry, wiring works.");
}
