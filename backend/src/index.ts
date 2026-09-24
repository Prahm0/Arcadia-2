import { Hono } from "hono";
import { cors } from "hono/cors";
import { secureHeaders } from "hono/secure-headers";
import { requireSession } from "./lib/session";
import account from "./routes/account";
import analytics from "./routes/analytics";
import auth from "./routes/auth";
import billing from "./routes/billing";
import calendarFeeds from "./routes/calendar-feeds";
import { cards, decks } from "./routes/cards";
import { sheets } from "./routes/sheets";
import google from "./routes/google";
import chat, { conversations, proposals } from "./routes/chat";
import commitments from "./routes/commitments";
import companion from "./routes/companion";
import constellations from "./routes/constellations";
import dashboard from "./routes/dashboard";
import events from "./routes/events";
import feedback from "./routes/feedback";
import goals from "./routes/goals";
import memories from "./routes/memories";
import onboarding from "./routes/onboarding";
import plan from "./routes/plan";
import presence from "./routes/presence";
import profile from "./routes/profile";
import progress from "./routes/progress";
import push from "./routes/push";
import referrals from "./routes/referrals";
import studyRooms from "./routes/study-rooms";
import studySessions from "./routes/study-sessions";
import subjects from "./routes/subjects";
import { assessments, subjectFiles, subjectMaterials, topics } from "./routes/syllabus";
import tasks from "./routes/tasks";
import uploads from "./routes/uploads";
import waitlist from "./routes/waitlist";
import type { Env, Variables } from "./types";
import { dispatchPushCheckIns } from "./lib/push";
import { refreshWantedLayouts } from "./lib/day-plan";

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
    allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  })(c, next);
});

/**
 * Every /api route needs a session and, on writes, a matching CSRF token,
 * except the two public ones. Listing the exceptions here rather than relying
 * on route registration order means adding a route defaults to protected.
 */
const PUBLIC_PREFIXES = [
  "/api/auth/",
  "/api/waitlist",
  // Google's OAuth redirect lands here without our session cookie in play
  // — the state parameter carries the userId, verified by HMAC.
  "/api/google/callback",
  "/api/google/config",
  // Stripe posts webhook events from its own IPs; the HMAC signature
  // header is the authentication.
  "/api/billing/webhook",
  // RevenueCat uses the configured authorization header, verified by the
  // billing route before any subscription data is reconciled.
  "/api/billing/iap/webhook",
];

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
app.route("/api/billing", billing);
app.route("/api/calendar-feeds", calendarFeeds);
app.route("/api/cards", cards);
app.route("/api/chat", chat);
app.route("/api/commitments", commitments);
app.route("/api/companion", companion);
app.route("/api/constellations", constellations);
app.route("/api/conversations", conversations);
app.route("/api/dashboard", dashboard);
app.route("/api/decks", decks);
app.route("/api/events", events);
app.route("/api/feedback", feedback);
app.route("/api/goals", goals);
app.route("/api/google", google);
app.route("/api/memories", memories);
app.route("/api/onboarding", onboarding);
app.route("/api/plan", plan);
app.route("/api/presence", presence);
app.route("/api/profile", profile);
app.route("/api/progress", progress);
app.route("/api/push", push);
app.route("/api/referrals", referrals);
app.route("/api/proposals", proposals);
app.route("/api/sheets", sheets);
app.route("/api/study-rooms", studyRooms);
app.route("/api/study-sessions", studySessions);
app.route("/api/subjects", subjects);
app.route("/api/subjects", subjectMaterials);
app.route("/api/subject-files", subjectFiles);
app.route("/api/topics", topics);
app.route("/api/assessments", assessments);
app.route("/api/tasks", tasks);
app.route("/api/uploads", uploads);

app.notFound((c) => c.json({ error: "Not found." }, 404));

app.onError((error, c) => {
  console.error("[arcadia-api]", error);
  return c.json({ error: "Something went wrong." }, 500);
});

export default {
  fetch: app.fetch,
  async scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(dispatchPushCheckIns(env));
    ctx.waitUntil(refreshWantedLayouts(env));
  },
} satisfies ExportedHandler<Env>;
