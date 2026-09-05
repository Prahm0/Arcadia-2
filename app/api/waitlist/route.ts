import { NextResponse } from "next/server";
import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { EMAIL_PATTERN } from "@/lib/waitlist";

export const runtime = "nodejs";

/**
 * Waitlist submission handler.
 *
 * Delivery is intentionally isolated here so it can be swapped for a real
 * provider without touching the UI:
 *  - If WAITLIST_WEBHOOK_URL is set, the submission is forwarded as JSON.
 *  - Otherwise it is appended to `.data/waitlist.jsonl` on the server.
 */
async function deliver(email: string): Promise<void> {
  const webhook = process.env.WAITLIST_WEBHOOK_URL;
  const payload = { email, source: "arcadia-landing", at: new Date().toISOString() };

  if (webhook) {
    const res = await fetch(webhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(`Webhook responded ${res.status}`);
    return;
  }

  const dir = path.join(process.cwd(), ".data");
  await mkdir(dir, { recursive: true });
  await appendFile(path.join(dir, "waitlist.jsonl"), JSON.stringify(payload) + "\n", "utf8");
}

export async function POST(request: Request) {
  let body: { email?: unknown };
  try {
    body = (await request.json()) as { email?: unknown };
  } catch {
    return NextResponse.json({ message: "Invalid request." }, { status: 400 });
  }

  const email = typeof body.email === "string" ? body.email.trim() : "";
  if (!EMAIL_PATTERN.test(email) || email.length > 254) {
    return NextResponse.json(
      { message: "Please enter a valid email address." },
      { status: 422 },
    );
  }

  try {
    await deliver(email);
  } catch (error) {
    console.error("[waitlist] delivery failed", error);
    return NextResponse.json(
      { message: "We couldn’t save your email just now. Please try again." },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true });
}
