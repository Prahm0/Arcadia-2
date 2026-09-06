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
    throw new ApiError(message, response.status, data);
  }

  if (data && typeof data === "object" && "csrfToken" in data) {
    const token = (data as { csrfToken?: unknown }).csrfToken;
    if (typeof token === "string") saveCsrf(token);
  }

  return data as T;
}
