import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { db, schema } from "../db";
import type { Env, Variables } from "../types";

const companion = new Hono<{ Bindings: Env; Variables: Variables }>();

const FORMS = new Set(["orb", "comet", "nebula"]);
const PALETTES = new Set(["violet", "aqua", "coral", "gold"]);
const ACCESSORIES = new Set(["none", "ring", "star", "book", "headphones"]);

/**
 * Reads the caller's companion. Falls back to a "just created" default row if
 * the signup flow's insert somehow missed one (belt-and-braces — it shouldn't).
 */
companion.get("/", async (c) => {
  const { userId } = c.get("session");
  const database = db(c.env.DB);

  const [row] = await database
    .select()
    .from(schema.companions)
    .where(eq(schema.companions.userId, userId))
    .limit(1);
  if (!row) {
    await database.insert(schema.companions).values({ userId });
    return c.json({
      companion: {
        name: "Star",
        form: "orb",
        palette: "violet",
        accessory: "none",
        mood: "calm",
      },
    });
  }

  return c.json({ companion: rowToProfile(row) });
});

/**
 * Updates the fields the customization sheet controls. Anything the caller
 * didn't send is left alone, so the sheet can send a subset without wiping
 * unrelated columns.
 */
companion.patch("/", async (c) => {
  const { userId } = c.get("session");
  const body = await c.req
    .json<{ name?: string; form?: string; palette?: string; accessory?: string }>()
    .catch(() => null);
  if (!body) return c.json({ error: "Invalid request." }, 400);

  const patch: Record<string, string | null> = {};

  if (typeof body.name === "string") {
    const name = body.name.trim().slice(0, 40);
    if (!name) return c.json({ error: "Name cannot be empty." }, 422);
    patch.name = name;
  }

  if (typeof body.form === "string") {
    if (!FORMS.has(body.form)) return c.json({ error: "Unknown form." }, 422);
    patch.form = body.form;
  }

  if (typeof body.palette === "string") {
    if (!PALETTES.has(body.palette)) return c.json({ error: "Unknown palette." }, 422);
    patch.palette = body.palette;
  }

  if (typeof body.accessory === "string") {
    if (!ACCESSORIES.has(body.accessory)) return c.json({ error: "Unknown accessory." }, 422);
    // The schema stores "none" as null so absent-accessory reads uniformly.
    patch.accessory = body.accessory === "none" ? null : body.accessory;
  }

  if (Object.keys(patch).length === 0) return c.json({ ok: true });

  const database = db(c.env.DB);
  const updated = await database
    .update(schema.companions)
    .set(patch)
    .where(eq(schema.companions.userId, userId))
    .returning();

  if (updated.length === 0) {
    // No row yet — insert with the incoming patch merged on top of defaults.
    await database.insert(schema.companions).values({ userId, ...patch });
    const [row] = await database
      .select()
      .from(schema.companions)
      .where(eq(schema.companions.userId, userId))
      .limit(1);
    return c.json({ companion: rowToProfile(row!) });
  }

  return c.json({ companion: rowToProfile(updated[0]) });
});

function rowToProfile(row: typeof schema.companions.$inferSelect) {
  return {
    name: row.name,
    form: row.form,
    palette: normalisePalette(row.palette),
    accessory: row.accessory ?? "none",
    mood: row.mood,
  };
}

function normalisePalette(raw: string): string {
  return PALETTES.has(raw) ? raw : "violet";
}

export default companion;
