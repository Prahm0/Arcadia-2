import { and, asc, desc, eq, sql } from "drizzle-orm";
import { Hono } from "hono";
import { db, schema, type Database } from "../db";
import { insertCards, runBatch } from "../lib/cards";
import { newId } from "../lib/ids";
import type { ContentPart } from "../lib/openai";
import { aiConfigured } from "../lib/openai";
import { track } from "../lib/posthog";
import { draftSheet } from "../lib/sheets";
import { MATERIAL_TYPES, filePart } from "../lib/syllabus";
import { iso } from "../lib/time";
import { DECK_LIMIT, getUserTier, isPaidTier } from "../lib/tiers";
import {
  MAX_SHEETS,
  cardsFromSections,
  cleanSections,
  cleanSheetTitle,
  parseSections,
} from "../../../shared/sheets";
import type { Env, Variables } from "../types";

type App = Hono<{ Bindings: Env; Variables: Variables }>;
type SheetRow = typeof schema.sheets.$inferSelect;

interface SheetBody {
  title?: string;
  subjectId?: string | null;
  topicId?: string | null;
  sections?: unknown;
  source?: string;
}

interface DraftBody {
  subjectId?: string | null;
  topicId?: string;
  subjectFileId?: string;
  deckId?: string;
}

function serialiseSheet(sheet: SheetRow, topicTitle: string | null) {
  return {
    id: sheet.id,
    title: sheet.title,
    subjectId: sheet.subjectId,
    topic: sheet.topicId ? { id: sheet.topicId, title: topicTitle ?? "" } : null,
    sections: parseSections(sheet.sections),
    source: sheet.source === "arcad" ? "arcad" : "manual",
    createdAt: iso(sheet.createdAt),
    updatedAt: iso(sheet.updatedAt),
  } as const;
}

async function ownedSheet(database: Database, userId: string, id: string) {
  const [row] = await database
    .select({ sheet: schema.sheets, topicTitle: schema.subjectTopics.title })
    .from(schema.sheets)
    .leftJoin(schema.subjectTopics, eq(schema.subjectTopics.id, schema.sheets.topicId))
    .where(and(eq(schema.sheets.id, id), eq(schema.sheets.userId, userId)))
    .limit(1);
  return row;
}

/** Null when the subject and topic are the student's and the topic is in that subject. */
async function checkLinks(database: Database, userId: string, subjectId: string | null, topicId: string | null) {
  if (subjectId) {
    const [subject] = await database
      .select({ id: schema.subjects.id })
      .from(schema.subjects)
      .where(and(eq(schema.subjects.id, subjectId), eq(schema.subjects.userId, userId)))
      .limit(1);
    if (!subject) return "Subject not found.";
  }
  if (topicId) {
    const [topic] = await database
      .select({ subjectId: schema.subjectTopics.subjectId })
      .from(schema.subjectTopics)
      .where(and(eq(schema.subjectTopics.id, topicId), eq(schema.subjectTopics.userId, userId)))
      .limit(1);
    if (!topic || topic.subjectId !== subjectId) return "That topic isn't in this subject.";
  }
  return null;
}

async function isGuest(database: Database, userId: string) {
  const [user] = await database.select({ email: schema.users.email }).from(schema.users).where(eq(schema.users.id, userId)).limit(1);
  return Boolean(user?.email.endsWith("@arcadia.local"));
}

/** /api/sheets: summary sheets. Writing them is free; Arcad drafts are Pro and Max. */
export const sheets: App = new Hono();

sheets.get("/", async (c) => {
  const { userId } = c.get("session");
  const rows = await db(c.env.DB)
    .select({ sheet: schema.sheets, topicTitle: schema.subjectTopics.title })
    .from(schema.sheets)
    .leftJoin(schema.subjectTopics, eq(schema.subjectTopics.id, schema.sheets.topicId))
    .where(eq(schema.sheets.userId, userId))
    .orderBy(desc(schema.sheets.updatedAt));
  return c.json({ sheets: rows.map((row) => serialiseSheet(row.sheet, row.topicTitle)) });
});

sheets.post("/", async (c) => {
  const { userId } = c.get("session");
  const body = await c.req.json<SheetBody>().catch(() => null);
  if (!body) return c.json({ error: "Invalid request." }, 400);
  const title = cleanSheetTitle(body.title);
  if (!title) return c.json({ error: "Give the sheet a name." }, 422);
  const cleaned = cleanSections(body.sections);
  if ("error" in cleaned) return c.json({ error: cleaned.error }, 422);

  const database = db(c.env.DB);
  const subjectId = body.subjectId || null;
  const topicId = body.topicId || null;
  const linkError = await checkLinks(database, userId, subjectId, topicId);
  if (linkError) return c.json({ error: linkError }, 422);

  const [{ count }] = await database
    .select({ count: sql<number>`count(*)` })
    .from(schema.sheets)
    .where(eq(schema.sheets.userId, userId));
  if (Number(count) >= MAX_SHEETS) return c.json({ error: "That's a lot of sheets. Delete an old one first." }, 422);

  const id = newId("sheet");
  const source = body.source === "arcad" ? "arcad" : "manual";
  await database.insert(schema.sheets).values({
    id,
    userId,
    subjectId,
    topicId,
    title,
    sections: JSON.stringify(cleaned.sections),
    source,
  });
  track(c, userId, "sheet_created", { source });
  const row = await ownedSheet(database, userId, id);
  return c.json({ sheet: serialiseSheet(row.sheet, row.topicTitle) }, 201);
});

/**
 * An unsaved first draft from one of the student's own sources: a syllabus
 * topic (with the subject's resource notes), an uploaded file, or a deck.
 */
sheets.post("/draft", async (c) => {
  const { userId } = c.get("session");
  const body = await c.req.json<DraftBody>().catch(() => null);
  if (!body) return c.json({ error: "Invalid request." }, 400);
  const chosen = [body.topicId, body.subjectFileId, body.deckId].filter((value) => typeof value === "string" && value);
  if (chosen.length !== 1) return c.json({ error: "Choose a topic, a file or a deck to draft from." }, 422);

  const database = db(c.env.DB);
  if (await isGuest(database, userId)) {
    return c.json({ error: "Guest accounts cannot draft sheets with Arcad.", code: "guest_cannot_use" }, 403);
  }
  if (!isPaidTier(await getUserTier(database, userId))) {
    return c.json({ error: "Upgrade to have Arcad draft sheets.", code: "upgrade_required" }, 403);
  }
  if (!aiConfigured(c.env)) return c.json({ error: "Arcad isn't available right now." }, 503);

  let subjectId: string | null = body.subjectId || null;
  let topicId: string | null = null;
  let label: string;
  const content: ContentPart[] = [];

  if (body.topicId) {
    const [topic] = await database
      .select()
      .from(schema.subjectTopics)
      .where(and(eq(schema.subjectTopics.id, body.topicId), eq(schema.subjectTopics.userId, userId)))
      .limit(1);
    if (!topic) return c.json({ error: "Topic not found." }, 404);
    subjectId = topic.subjectId;
    topicId = topic.id;
    const [subject] = await database.select({ name: schema.subjects.name }).from(schema.subjects).where(eq(schema.subjects.id, topic.subjectId)).limit(1);
    // The topic's own syllabus text, plus what each of the subject's files covers.
    const files = await database
      .select({ filename: schema.subjectFiles.filename, summary: schema.subjectFiles.summary })
      .from(schema.subjectFiles)
      .where(and(eq(schema.subjectFiles.userId, userId), eq(schema.subjectFiles.subjectId, topic.subjectId)));
    label = `${subject?.name ?? "Subject"} syllabus topic: ${topic.title}`;
    content.push({
      type: "text",
      text: [
        `Topic: ${topic.title}`,
        topic.detail ? `Syllabus detail: ${topic.detail}` : "",
        ...files.filter((file) => file.summary).map((file) => `Resource "${file.filename}": ${file.summary}`),
      ].filter(Boolean).join("\n"),
    });
  } else if (body.subjectFileId) {
    const [file] = await database
      .select()
      .from(schema.subjectFiles)
      .where(and(eq(schema.subjectFiles.id, body.subjectFileId), eq(schema.subjectFiles.userId, userId)))
      .limit(1);
    if (!file) return c.json({ error: "Uploaded file not found." }, 404);
    const object = file.storageKey && c.env.UPLOADS && MATERIAL_TYPES[file.contentType] ? await c.env.UPLOADS.get(file.storageKey) : null;
    if (!object) return c.json({ error: "This file isn't available to draft from. Try a topic instead." }, 422);
    subjectId = file.subjectId;
    label = `Uploaded ${file.kind}: ${file.filename}`;
    content.push(filePart(await object.arrayBuffer(), file.contentType, file.filename));
  } else {
    const [deck] = await database
      .select()
      .from(schema.decks)
      .where(and(eq(schema.decks.id, body.deckId!), eq(schema.decks.userId, userId)))
      .limit(1);
    if (!deck) return c.json({ error: "Deck not found." }, 404);
    const cards = await database
      .select({ front: schema.cards.front, back: schema.cards.back })
      .from(schema.cards)
      .where(eq(schema.cards.deckId, deck.id))
      .orderBy(asc(schema.cards.position))
      .limit(200);
    if (cards.length === 0) return c.json({ error: "That deck has no cards yet." }, 422);
    subjectId = deck.subjectId;
    topicId = deck.topicId;
    label = `Flashcard deck: ${deck.title}`;
    content.push({ type: "text", text: cards.map((card) => `${card.front} — ${card.back}`).join("\n") });
  }

  let reply: Awaited<ReturnType<typeof draftSheet>>;
  try {
    reply = await draftSheet(c.env, { label, content });
  } catch (error) {
    console.error("[sheets] draft failed", error);
    return c.json({ error: "Arcad couldn't draft a sheet right now. Try again in a moment." }, 502);
  }
  const cleaned = cleanSections(reply?.sections);
  if (!reply || "error" in cleaned || cleaned.sections.length === 0) {
    return c.json({ error: "There wasn't enough in that source to draft a sheet. Try a fuller file or topic." }, 422);
  }
  track(c, userId, "sheet_drafted", { from: body.topicId ? "topic" : body.subjectFileId ? "file" : "deck" });
  return c.json({
    draft: {
      title: cleanSheetTitle(reply.title) || "Summary sheet",
      subjectId,
      topicId,
      sections: cleaned.sections,
      note: String(reply.note ?? "").trim().slice(0, 300),
    },
  });
});

sheets.get("/:id", async (c) => {
  const { userId } = c.get("session");
  const row = await ownedSheet(db(c.env.DB), userId, c.req.param("id"));
  if (!row) return c.json({ error: "Sheet not found." }, 404);
  return c.json({ sheet: serialiseSheet(row.sheet, row.topicTitle) });
});

sheets.patch("/:id", async (c) => {
  const { userId } = c.get("session");
  const body = await c.req.json<SheetBody>().catch(() => null);
  if (!body) return c.json({ error: "Invalid request." }, 400);
  const database = db(c.env.DB);
  const row = await ownedSheet(database, userId, c.req.param("id"));
  if (!row) return c.json({ error: "Sheet not found." }, 404);

  const patch: Partial<typeof schema.sheets.$inferInsert> = {};
  if (body.title !== undefined) {
    const title = cleanSheetTitle(body.title);
    if (!title) return c.json({ error: "Give the sheet a name." }, 422);
    patch.title = title;
  }
  if (body.sections !== undefined) {
    const cleaned = cleanSections(body.sections);
    if ("error" in cleaned) return c.json({ error: cleaned.error }, 422);
    patch.sections = JSON.stringify(cleaned.sections);
  }
  if (body.subjectId !== undefined || body.topicId !== undefined) {
    const subjectId = body.subjectId === undefined ? row.sheet.subjectId : body.subjectId || null;
    const topicId =
      body.topicId !== undefined ? body.topicId || null : subjectId === row.sheet.subjectId ? row.sheet.topicId : null;
    const linkError = await checkLinks(database, userId, subjectId, topicId);
    if (linkError) return c.json({ error: linkError }, 422);
    patch.subjectId = subjectId;
    patch.topicId = topicId;
  }
  if (Object.keys(patch).length > 0) {
    await database.update(schema.sheets).set({ ...patch, updatedAt: Date.now() }).where(eq(schema.sheets.id, row.sheet.id));
  }
  const updated = await ownedSheet(database, userId, row.sheet.id);
  return c.json({ sheet: serialiseSheet(updated.sheet, updated.topicTitle) });
});

sheets.delete("/:id", async (c) => {
  const { userId } = c.get("session");
  const result = await db(c.env.DB)
    .delete(schema.sheets)
    .where(and(eq(schema.sheets.id, c.req.param("id")), eq(schema.sheets.userId, userId)))
    .returning({ id: schema.sheets.id });
  if (result.length === 0) return c.json({ error: "Sheet not found." }, 404);
  return c.json({ ok: true });
});

/** A flashcard deck from the sheet's Definitions and Formulas lines. No AI. */
sheets.post("/:id/deck", async (c) => {
  const { userId } = c.get("session");
  const database = db(c.env.DB);
  const row = await ownedSheet(database, userId, c.req.param("id"));
  if (!row) return c.json({ error: "Sheet not found." }, 404);
  const cards = cardsFromSections(parseSections(row.sheet.sections));
  if (cards.length === 0) {
    return c.json({ error: "Add a Definitions or Formulas section with one 'term: meaning' per line first." }, 422);
  }

  const tier = await getUserTier(database, userId);
  const [{ count }] = await database.select({ count: sql<number>`count(*)` }).from(schema.decks).where(eq(schema.decks.userId, userId));
  if (Number(count) >= DECK_LIMIT[tier]) {
    return c.json({ error: "You're at your deck limit. Delete a deck or upgrade first.", code: "deck_limit_reached" }, 422);
  }

  const deckId = newId("deck");
  await runBatch(c.env.DB, [
    database.insert(schema.decks).values({
      id: deckId,
      userId,
      subjectId: row.sheet.subjectId,
      topicId: row.sheet.topicId,
      title: row.sheet.title,
      source: "import",
    }),
    insertCards(userId, deckId, cards.slice(0, 500).map((card, position) => ({ id: newId("card"), ...card, position }))),
  ]);
  track(c, userId, "deck_created", { source: "sheet", cards: Math.min(cards.length, 500) });
  return c.json({ deckId, cardCount: Math.min(cards.length, 500) }, 201);
});
