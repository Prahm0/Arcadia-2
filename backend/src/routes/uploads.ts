import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import { db, schema } from "../db";
import { newId } from "../lib/ids";
import { iso } from "../lib/time";
import type { Env, Variables } from "../types";

const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "application/pdf",
  "text/plain",
  "text/csv",
];

const uploads = new Hono<{ Bindings: Env; Variables: Variables }>();

uploads.get("/", async (c) => {
  const { userId } = c.get("session");
  const rows = await db(c.env.DB)
    .select()
    .from(schema.uploads)
    .where(eq(schema.uploads.userId, userId));

  return c.json({
    uploads: rows.map((row) => ({
      id: row.id,
      filename: row.filename,
      contentType: row.contentType,
      bytes: row.bytes,
      createdAt: iso(row.createdAt),
    })),
  });
});

uploads.post("/", async (c) => {
  const { userId } = c.get("session");

  const form = await c.req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return c.json({ error: "Attach a file." }, 422);

  if (file.size > MAX_BYTES) return c.json({ error: "That file is over 10 MB." }, 413);
  const contentType = file.type || "application/octet-stream";
  if (!ALLOWED.includes(contentType)) return c.json({ error: "Unsupported file type." }, 415);

  const id = newId("upl");
  const key = `${userId}/${id}`;

  await c.env.UPLOADS.put(key, file.stream(), {
    httpMetadata: { contentType },
  });

  await db(c.env.DB).insert(schema.uploads).values({
    id,
    userId,
    key,
    filename: file.name.slice(0, 200) || "upload",
    contentType,
    bytes: file.size,
  });

  return c.json({ ok: true, id }, 201);
});

uploads.get("/:id", async (c) => {
  const { userId } = c.get("session");
  const id = c.req.param("id");

  const [row] = await db(c.env.DB)
    .select()
    .from(schema.uploads)
    .where(and(eq(schema.uploads.id, id), eq(schema.uploads.userId, userId)))
    .limit(1);
  if (!row) return c.json({ error: "Not found." }, 404);

  const object = await c.env.UPLOADS.get(row.key);
  if (!object) return c.json({ error: "Not found." }, 404);

  return new Response(object.body, {
    headers: {
      "content-type": row.contentType,
      "content-disposition": `inline; filename="${row.filename.replace(/"/g, "")}"`,
      "cache-control": "private, max-age=3600",
    },
  });
});

uploads.delete("/:id", async (c) => {
  const { userId } = c.get("session");
  const id = c.req.param("id");
  const database = db(c.env.DB);

  const [row] = await database
    .select()
    .from(schema.uploads)
    .where(and(eq(schema.uploads.id, id), eq(schema.uploads.userId, userId)))
    .limit(1);
  if (!row) return c.json({ error: "Not found." }, 404);

  await c.env.UPLOADS.delete(row.key);
  await database.delete(schema.uploads).where(eq(schema.uploads.id, id));

  return c.json({ ok: true });
});

export default uploads;
