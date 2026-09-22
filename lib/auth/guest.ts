import { api } from "@/lib/api/client";

/**
 * Guest emails all live in this reserved suffix so the app can spot them and
 * tailor the UI (banner, disabled email/password fields, "sign in to save").
 */
export const GUEST_EMAIL_SUFFIX = "@arcadia.local";

export function isGuestEmail(email: string | null | undefined): boolean {
  return typeof email === "string" && email.endsWith(GUEST_EMAIL_SUFFIX);
}

/**
 * Spins up a throwaway account and signs in. One click, no email, the
 * backend recognises `@arcadia.local` addresses and marks them verified on
 * insert, so login goes straight through. Guest rows accumulate in the DB;
 * that's the trade-off for zero-friction demos.
 */
export async function continueAsGuest(): Promise<void> {
  const suffix = Math.random().toString(36).slice(2, 10);
  const guestEmail = `guest-${suffix}${GUEST_EMAIL_SUFFIX}`;
  const guestPassword = `guest-${suffix}-${Math.random().toString(36).slice(2, 10)}`;
  const guestName = `Guest ${suffix.slice(0, 4).toUpperCase()}`;

  await api("/api/auth/register", {
    method: "POST",
    body: JSON.stringify({ name: guestName, email: guestEmail, password: guestPassword }),
  });
  await api("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email: guestEmail, password: guestPassword }),
  });
}
