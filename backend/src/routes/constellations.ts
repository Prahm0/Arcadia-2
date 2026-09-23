import { Hono } from "hono";
import { and, eq } from "drizzle-orm";
import { db, schema } from "../db";
import { readStudySky } from "../lib/constellations";
import type { Env, Variables } from "../types";

const constellations = new Hono<{ Bindings: Env; Variables: Variables }>();
constellations.get("/", async (c) => c.json(await readStudySky(db(c.env.DB), c.get("session").userId)));
constellations.patch("/", async (c) => {
  const body = await c.req.json<Record<string, unknown>>().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) return c.json({ error: "Invalid appearance settings." }, 400);
  if (Object.keys(body).some((key) => !["followed", "featured", "backdrop", "showcase", "favourites", "ambientMotion"].includes(key))) return c.json({ error: "Unknown appearance setting." }, 422);
  const userId = c.get("session").userId;
  const database = db(c.env.DB);
  const sky = await readStudySky(database, userId);
  const available = new Set(sky.cards.map((card) => String(card.id)));
  const owned = new Set(sky.cards.filter((card) => card.earnedAt !== null).map((card) => String(card.id)));
  const patch: Partial<typeof schema.constellationPreferences.$inferInsert> = {};
  if ("followed" in body) {
    if (typeof body.followed !== "string" || !available.has(body.followed)) return c.json({ error: "Choose an available constellation." }, 422);
    patch.followed = body.followed;
  }
  for (const key of ["featured", "backdrop"] as const) {
    if (!(key in body)) continue;
    if (body[key] !== null && (typeof body[key] !== "string" || !owned.has(body[key]))) return c.json({ error: "Collect this constellation before equipping it." }, 422);
    patch[key] = body[key] as string | null;
  }
  for (const key of ["showcase", "favourites"] as const) {
    if (!(key in body)) continue;
    const ids = body[key];
    if (!Array.isArray(ids) || ids.length > (key === "showcase" ? 3 : available.size) || new Set(ids).size !== ids.length || ids.some((id) => typeof id !== "string" || !owned.has(id))) return c.json({ error: key === "showcase" ? "Choose up to three different collected cards." : "Choose collected cards for your favourites." }, 422);
    patch[key] = JSON.stringify(ids);
  }
  if ("ambientMotion" in body) {
    if (typeof body.ambientMotion !== "boolean") return c.json({ error: "Invalid motion preference." }, 422);
    patch.ambientMotion = body.ambientMotion;
  }
  if (Object.keys(patch).length) await database.update(schema.constellationPreferences).set(patch).where(eq(schema.constellationPreferences.userId, userId));
  return c.json(await readStudySky(database, userId));
});
constellations.post("/:id/seen", async (c) => {
  const updated = await db(c.env.DB).update(schema.constellationCards).set({ seenAt: Date.now() }).where(and(eq(schema.constellationCards.userId, c.get("session").userId), eq(schema.constellationCards.constellationId, c.req.param("id")))).returning({ id: schema.constellationCards.constellationId });
  if (!updated.length) return c.json({ error: "Card not found." }, 404);
  return c.json({ ok: true });
});
export default constellations;
