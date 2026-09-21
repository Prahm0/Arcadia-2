import { Hono } from "hono";
import { cors } from "hono/cors";
import { secureHeaders } from "hono/secure-headers";
import { requireSession } from "./lib/session";
import account from "./routes/account";
import analytics from "./routes/analytics";
import auth from "./routes/auth";
import chat, { conversations, proposals } from "./routes/chat";
import commitments from "./routes/commitments";
import companion from "./routes/companion";
import dashboard from "./routes/dashboard";
import events from "./routes/events";
import onboarding from "./routes/onboarding";
import studySessions from "./routes/study-sessions";
import tasks from "./routes/tasks";
import uploads from "./routes/uploads";
import waitlist from "./routes/waitlist";
import type { Env, Variables } from "./types";

const app = new Hono<{ Bindings: Env; Variables: Variables }>();

app.use("*", secureHeaders());

/**
 * In production the browser talks to the Next.js app, which proxies /api/*
 * here server-side, so CORS is not on the hot path. It is configured anyway
 * for local development, where the frontend may call the Worker directly.
 */
app.use("/api/*", async (c, next) => {
  const allowed = [c.env.APP_ORIGIN, "http://localhost:3000", "http://127.0.0.1:3000"];
  return cors({
    origin: (origin) => (allowed.includes(origin) ? origin : allowed[0]),
    credentials: true,
    allowHeaders: ["content-type", "x-csrf-token"],
    allowMethods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
  })(c, next);
});

/**
 * Every /api route needs a session and, on writes, a matching CSRF token,
 * except the two public ones. Listing the exceptions here rather than relying
 * on route registration order means adding a route defaults to protected.
 */
const PUBLIC_PREFIXES = ["/api/auth/", "/api/waitlist"];

app.use("/api/*", async (c, next) => {
  const path = c.req.path;
  if (PUBLIC_PREFIXES.some((prefix) => path.startsWith(prefix))) return next();
  return requireSession(c, next);
});

app.get("/health", (c) => c.json({ ok: true, service: "arcadia-api" }));

app.route("/api/auth", auth);
app.route("/api/waitlist", waitlist);
app.route("/api/account", account);
app.route("/api/analytics", analytics);
app.route("/api/chat", chat);
app.route("/api/commitments", commitments);
app.route("/api/companion", companion);
app.route("/api/conversations", conversations);
app.route("/api/dashboard", dashboard);
app.route("/api/events", events);
app.route("/api/onboarding", onboarding);
app.route("/api/proposals", proposals);
app.route("/api/study-sessions", studySessions);
app.route("/api/tasks", tasks);
app.route("/api/uploads", uploads);

app.notFound((c) => c.json({ error: "Not found." }, 404));

app.onError((error, c) => {
  console.error("[arcadia-api]", error);
  return c.json({ error: "Something went wrong." }, 500);
});

export default app;
