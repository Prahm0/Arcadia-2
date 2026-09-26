import { and, asc, desc, eq, gte } from "drizzle-orm";
import { Hono } from "hono";
import { db, schema } from "../db";
import { newId } from "../lib/ids";
import { track } from "../lib/posthog";
import type { Env, Variables } from "../types";

const feedback = new Hono<{ Bindings: Env; Variables: Variables }>();
const TYPES = ["bug", "idea", "other"] as const;
type FeedbackType = (typeof TYPES)[number];
const PAGE_SIZE = 50;

function isFeedbackType(value: unknown): value is FeedbackType {
  return typeof value === "string" && TYPES.includes(value as FeedbackType);
}

feedback.post("/", async (c) => {
  const { userId } = c.get("session");
  const body = await c.req.json<{ type?: unknown; message?: unknown; contactMe?: unknown }>().catch(() => null);
  if (!body || !isFeedbackType(body.type) || typeof body.message !== "string" || typeof body.contactMe !== "boolean") {
    return c.json({ error: "Please complete the feedback form." }, 400);
  }

  const message = body.message.trim();
  if (!message || message.length > 3000) {
    return c.json({ error: "Write a message between 1 and 3,000 characters." }, 422);
  }

  const database = db(c.env.DB);
  const [user] = await database.select({ email: schema.users.email })
    .from(schema.users).where(eq(schema.users.id, userId)).limit(1);
  if (!user) return c.json({ error: "Account not found." }, 404);
  if (body.contactMe && user.email.endsWith("@arcadia.local")) {
    return c.json({ error: "Guest accounts cannot be contacted by email." }, 422);
  }

  // A signed-in account can send a few reports per day without filling the inbox.
  const recent = await database.select({ id: schema.feedback.id })
    .from(schema.feedback)
    .where(and(eq(schema.feedback.userId, userId), gte(schema.feedback.createdAt, Date.now() - 24 * 60 * 60 * 1000)))
    .limit(5);
  if (recent.length >= 5) return c.json({ error: "You've sent five messages in the past 24 hours. Please try again later." }, 429);

  await database.insert(schema.feedback).values({
    id: newId("feedback"),
    userId,
    type: body.type,
    message,
    email: body.contactMe ? user.email : null,
  });
  track(c, userId, "feedback_sent", { type: body.type });
  return c.json({ ok: true }, 201);
});

feedback.get("/developer", async (c) => {
  const { userId } = c.get("session");
  const database = db(c.env.DB);
  const [user] = await database.select({ developerAccess: schema.users.developerAccess })
    .from(schema.users).where(eq(schema.users.id, userId)).limit(1);
  if (!user?.developerAccess) return c.json({ error: "Developer access required." }, 403);

  const typeParam = c.req.query("type") ?? "all";
  const sortParam = c.req.query("sort") ?? "newest";
  const offsetParam = Number(c.req.query("offset") ?? "0");
  if (typeParam !== "all" && !isFeedbackType(typeParam)) return c.json({ error: "Unknown feedback type." }, 400);
  if (!["newest", "oldest", "type"].includes(sortParam)) return c.json({ error: "Unknown sort order." }, 400);
  if (!Number.isSafeInteger(offsetParam) || offsetParam < 0) return c.json({ error: "Invalid page offset." }, 400);

  const order = sortParam === "oldest"
    ? [asc(schema.feedback.createdAt), asc(schema.feedback.id)]
    : sortParam === "type"
      ? [asc(schema.feedback.type), desc(schema.feedback.createdAt), desc(schema.feedback.id)]
      : [desc(schema.feedback.createdAt), desc(schema.feedback.id)];
  const rows = await database.select({
    id: schema.feedback.id,
    type: schema.feedback.type,
    message: schema.feedback.message,
    email: schema.feedback.email,
    createdAt: schema.feedback.createdAt,
  }).from(schema.feedback)
    .where(typeParam === "all" ? undefined : eq(schema.feedback.type, typeParam as FeedbackType))
    .orderBy(...order)
    .limit(PAGE_SIZE + 1)
    .offset(offsetParam);

  return c.json({
    items: rows.slice(0, PAGE_SIZE).map((row) => ({ ...row, createdAt: new Date(row.createdAt).toISOString() })),
    hasMore: rows.length > PAGE_SIZE,
  });
});

export default feedback;
