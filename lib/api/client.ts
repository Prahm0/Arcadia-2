const CSRF_KEY = "arcadia:csrf";

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
    if (token) window.localStorage.setItem(CSRF_KEY, token);
    else window.localStorage.removeItem(CSRF_KEY);
  } catch {
    /* ignore */
  }
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
  saveCsrf(null);
  const next = window.location.pathname + window.location.search;
  try {
    window.dispatchEvent(new CustomEvent("arcadia:auth-expired"));
  } catch {
    /* ignore */
  }
  // Give the banner a heartbeat to render before we navigate away.
  window.setTimeout(() => {
    window.location.href = `/login?expired=1&next=${encodeURIComponent(next)}`;
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
