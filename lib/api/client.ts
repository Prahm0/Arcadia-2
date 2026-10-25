const CSRF_KEY = "arcadia:csrf";
/** Set the first time this device signs in, and never cleared. */
const SIGNED_IN_BEFORE_KEY = "arcadia:signed-in-before";

export class ApiError extends Error {
  status: number;
  data: unknown;
  constructor(message: string, status: number, data: unknown) {
    super(message);
    this.status = status;
    this.data = data;
  }
}

function readCsrf(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(CSRF_KEY);
  } catch {
    return null;
  }
}

export function saveCsrf(token: string | null | undefined) {
  if (typeof window === "undefined") return;
  try {
    if (token) {
      window.localStorage.setItem(CSRF_KEY, token);
      window.localStorage.setItem(SIGNED_IN_BEFORE_KEY, "1");
    } else {
      window.localStorage.removeItem(CSRF_KEY);
    }
  } catch {
    /* ignore */
  }
}

/**
 * Where a signed-out visitor to the app goes. Someone who has never signed in
 * on this device (a fresh iPhone download opens straight onto /app) gets
 * "create account", not "Welcome back, your session expired".
 */
export function signedOutPath(next?: string): string {
  let before = false;
  try {
    before = Boolean(window.localStorage.getItem(SIGNED_IN_BEFORE_KEY) || window.localStorage.getItem(CSRF_KEY));
  } catch {
    /* treat as new */
  }
  if (!before) return "/register";
  return next ? `/login?expired=1&next=${encodeURIComponent(next)}` : "/login";
}

/**
 * Broadcast a session-expiry event and redirect to /login. Debounced with a
 * module-level flag so a page whose parallel fetches all 401 together only
 * fires the redirect once. Preserves the current URL as ?next= so /login
 * can send the student back where they were after signing in.
 */
let sessionExpiryFired = false;
function onSessionExpired(): void {
  if (typeof window === "undefined") return;
  if (sessionExpiryFired) return;
  // Don't loop if we're already on the login/register surface.
  if (window.location.pathname.startsWith("/login") || window.location.pathname.startsWith("/register")) return;
  sessionExpiryFired = true;
  // Decided before the token is cleared, which counts as having signed in.
  const target = signedOutPath(window.location.pathname + window.location.search);
  saveCsrf(null);
  try {
    window.dispatchEvent(new CustomEvent("arcadia:auth-expired"));
  } catch {
    /* ignore */
  }
  // Give the banner a heartbeat to render before we navigate away.
  window.setTimeout(() => {
    window.location.href = target;
  }, 350);
}

export async function api<T = unknown>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const method = (init.method ?? "GET").toUpperCase();
  const headers = new Headers(init.headers);
  if (init.body !== undefined && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }
  if (method !== "GET" && method !== "HEAD") {
    const csrf = readCsrf();
    if (csrf) headers.set("x-csrf-token", csrf);
  }

  const response = await fetch(path, {
    ...init,
    method,
    headers,
    credentials: "same-origin",
  });

  const contentType = response.headers.get("content-type") || "";
  const data = contentType.includes("application/json")
    ? await response.json().catch(() => null)
    : await response.text().catch(() => "");

  if (!response.ok) {
    const message =
      (data && typeof data === "object" && "error" in data && String((data as { error: unknown }).error)) ||
      response.statusText ||
      `Request failed (${response.status})`;
    if (response.status === 401 && !path.startsWith("/api/auth/")) {
      onSessionExpired();
    }
    throw new ApiError(message, response.status, data);
  }

  if (data && typeof data === "object" && "csrfToken" in data) {
    const token = (data as { csrfToken?: unknown }).csrfToken;
    if (typeof token === "string") saveCsrf(token);
  }

  return data as T;
}
