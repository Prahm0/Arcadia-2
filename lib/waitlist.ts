/**
 * Client-side waitlist submission. The request goes to the app's own route
 * handler (`app/api/waitlist/route.ts`), which is the single place to connect
 * a real provider.
 */

export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function isValidEmail(value: string): boolean {
  return EMAIL_PATTERN.test(value.trim());
}

export type WaitlistResult =
  | { ok: true }
  | { ok: false; message: string };

export async function submitWaitlist(email: string): Promise<WaitlistResult> {
  try {
    const res = await fetch("/api/waitlist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: email.trim() }),
    });

    if (res.ok) return { ok: true };

    const data = (await res.json().catch(() => null)) as
      | { message?: string }
      | null;
    return {
      ok: false,
      message: data?.message ?? "Something went wrong. Please try again.",
    };
  } catch {
    return { ok: false, message: "Network error. Please try again." };
  }
}
