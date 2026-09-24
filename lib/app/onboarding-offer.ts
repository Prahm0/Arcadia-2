const STORAGE_KEY = "arcadia:onboarding-offer-pending";

function storageKey(userId: string): string {
  return `${STORAGE_KEY}:${userId}`;
}

export function isOnboardingOfferPending(userId: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(storageKey(userId)) === "true";
  } catch {
    return false;
  }
}

export function setOnboardingOfferPending(userId: string, pending: boolean): void {
  if (typeof window === "undefined") return;
  try {
    const key = storageKey(userId);
    if (pending) window.localStorage.setItem(key, "true");
    else window.localStorage.removeItem(key);
  } catch {
    // Storage can be unavailable in private browsing; onboarding still works
    // for the current page session in that case.
  }
}
