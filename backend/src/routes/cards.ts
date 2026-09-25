import { and, asc, desc, eq, inArray, isNotNull, lte, sql } from "drizzle-orm";
import { Hono } from "hono";
import { db, schema, type Database } from "../db";
import {
  BACK_MAX,
  FRONT_MAX,
  MAX_CARDS,
  TITLE_MAX,
  answer,
  countCards,
  deckCounts,
  deleteCards,
  generateFlashcards,
  insertCards,
  runBatch,
  serialiseCard,
  updateCardText,
  updateSchedules,
  type CardCounts,
  type Statement,
} from "../lib/cards";
import { newId } from "../lib/ids";
import type { ContentPart } from "../lib/openai";
import { track } from "../lib/posthog";
import { MATERIAL_TYPES, filePart } from "../lib/syllabus";
import { iso } from "../lib/time";
import { DECK_LIMIT, getUserTier, isPaidTier, type Tier } from "../lib/tiers";
import type { Env, Variables } from "../types";

type App = Hono<{ Bindings: Env; Variables: Variables }>;
type DeckRow = typeof schema.decks.$inferSelect;

const SOURCES = ["manual", "import", "arcad"] as const;
const REVIEW_BATCH = 100;

interface DeckBody {
  title?: string;
  subjectId?: string | null;
  topicId?: string | null;
  source?: string;
  cards?: CardInput[];
}

interface CardInput {
  id?: string;
  front?: string;
  back?: string;
}

interface GenerateDeckBody {
  title?: string;
  subjectId?: string | null;
  topic?: string;
  subjectFileId?: string;
}

const cleanTitle = (value: unknown) => String(value ?? "").replace(/\s+/g, " ").trim().slice(0, TITLE_MAX);
// Cards keep their line breaks (lists, formulas over two lines); only the ends are trimmed.
const cleanSide = (value: unknown, max: number) => String(value ?? "").replace(/\r\n?/g, "\n").trim().slice(0, max);

/**
 * The cards as sent, trimmed. Rows with nothing on either side are dropped
 * (the editor's blank last row); a row with only one side is an error.
 */
function cleanCards(input: unknown): { cards: Array<{ id?: string; front: string; back: string }> } | { error: string } {
  if (!Array.isArray(input)) return { cards: [] };
  const cards: Array<{ id?: string; front: string; back: string }> = [];
  for (const [index, raw] of input.entries()) {
    const item = (raw ?? {}) as CardInput;
    const front = cleanSide(item.front, FRONT_MAX);
    const back = cleanSide(item.back, BACK_MAX);
    if (!front && !back) continue;
    if (!front || !back) return { error: `Card ${index + 1} needs both sides.` };
    cards.push({ id: typeof item.id === "string" ? item.id : undefined, front, back });
  }
  if (cards.length > MAX_CARDS) return { error: `A deck holds up to ${MAX_CARDS} cards. Split it into two.` };
  return { cards };
}

function serialiseDeck(deck: DeckRow, counts: CardCounts | undefined, topicTitle: string | null) {
  return {
    id: deck.id,
    title: deck.title,
    subjectId: deck.subjectId,
    topic: deck.topicId ? { id: deck.topicId, title: topicTitle ?? "" } : null,
    source: deck.source as (typeof SOURCES)[number],
    cardCount: counts?.total ?? 0,
    newCount: counts?.fresh ?? 0,
    dueCount: counts?.due ?? 0,
    masteredCount: counts?.mastered ?? 0,
    studiedAt: deck.studiedAt ? iso(deck.studiedAt) : null,
    createdAt: iso(deck.createdAt),
    updatedAt: iso(deck.updatedAt),
  };
}

async function ownedDeck(database: Database, userId: string, id: string) {
  const [row] = await database
    .select({ deck: schema.decks, topicTitle: schema.subjectTopics.title })
    .from(schema.decks)
    .leftJoin(schema.subjectTopics, eq(schema.subjectTopics.id, schema.decks.topicId))
    .where(and(eq(schema.decks.id, id), eq(schema.decks.userId, userId)))
    .limit(1);
  return row;
}

async function deckCards(database: Database, deckId: string) {
  return database
    .select()
    .from(schema.cards)
    .where(eq(schema.cards.deckId, deckId))
    .orderBy(asc(schema.cards.position), asc(schema.cards.createdAt));
}

/** Null when the subject and topic are the student's and the topic is in that subject. */
async function checkLinks(
  database: Database,
  userId: string,
  subjectId: string | null,
  topicId: string | null,
): Promise<string | null> {
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

function deckLimitMessage(tier: Tier): string {
  return tier === "free"
    ? "Free includes 1 flashcard deck. Upgrade to Pro for 3, or Max for unlimited decks."
    : tier === "pro"
      ? "Pro includes 3 flashcard decks. Upgrade to Max for unlimited decks."
      : "That's a lot of decks. Delete an old one first.";
}

/** Kept in one place so manual and Arcad-created decks have identical limits. */
async function deckLimitError(database: Database, userId: string, tier: Tier) {
  const [{ count }] = await database
    .select({ count: sql<number>`count(*)` })
    .from(schema.decks)
    .where(eq(schema.decks.userId, userId));
  return Number(count) >= DECK_LIMIT[tier]
    ? { error: deckLimitMessage(tier), code: "deck_limit_reached" as const }
    : null;
}

function titleFromFilename(filename: string): string {
  return cleanTitle(filename.replace(/\.[^.]+$/, ""));
}


async function timezoneOf(database: Database, userId: string): Promise<string> {
  const [row] = await database
    .select({ timezone: schema.profiles.timezone })
    .from(schema.profiles)
    .where(eq(schema.profiles.userId, userId))
    .limit(1);
  return row?.timezone || "Australia/Brisbane";
}

/** /api/decks: the student's decks and the cards in them. */
export const decks: App = new Hono();

decks.get("/", async (c) => {
  const { userId } = c.get("session");
  const database = db(c.env.DB);
  const now = Date.now();
  const [rows, counts] = await Promise.all([
    database
      .select({ deck: schema.decks, topicTitle: schema.subjectTopics.title })
      .from(schema.decks)
      .leftJoin(schema.subjectTopics, eq(schema.subjectTopics.id, schema.decks.topicId))
      .where(eq(schema.decks.userId, userId))
      .orderBy(desc(schema.decks.updatedAt)),
    deckCounts(database, userId, now),
  ]);
  return c.json({ decks: rows.map((row) => serialiseDeck(row.deck, counts.get(row.deck.id), row.topicTitle)) });
});

decks.post("/", async (c) => {
  const { userId } = c.get("session");
  const body = await c.req.json<DeckBody>().catch(() => null);
  if (!body) return c.json({ error: "Invalid request." }, 400);

  const title = cleanTitle(body.title);
  if (!title) return c.json({ error: "Give the deck a name." }, 422);
  const cleaned = cleanCards(body.cards);
  if ("error" in cleaned) return c.json({ error: cleaned.error }, 422);

  const database = db(c.env.DB);
  const subjectId = body.subjectId || null;
  const topicId = body.topicId || null;
  const linkError = await checkLinks(database, userId, subjectId, topicId);
  if (linkError) return c.json({ error: linkError }, 422);

  const tier = await getUserTier(database, userId);
  const limitError = await deckLimitError(database, userId, tier);
  if (limitError) return c.json(limitError, 422);

  const id = newId("deck");
  const source = SOURCES.includes(body.source as (typeof SOURCES)[number]) ? body.source! : "manual";
  const writes: Statement[] = [
    database.insert(schema.decks).values({ id, userId, subjectId, topicId, title, source }),
  ];
  if (cleaned.cards.length > 0) {
    writes.push(
      insertCards(
        userId,
        id,
        cleaned.cards.map((card, position) => ({ id: newId("card"), front: card.front, back: card.back, position })),
      ),
    );
  }
  await runBatch(c.env.DB, writes);
  track(c, userId, "deck_created", { source, cards: cleaned.cards.length });

  const row = await ownedDeck(database, userId, id);
  const cards = await deckCards(database, id);
  const now = Date.now();
  return c.json(
    { deck: serialiseDeck(row.deck, countCards(cards, now), row.topicTitle), cards: cards.map((card) => serialiseCard(card, now)) },
    201,
  );
});

/** Creates a paid, Arcad-generated deck from a topic or an existing subject file. */
decks.post("/generate", async (c) => {
  const { userId } = c.get("session");
  const body = await c.req.json<GenerateDeckBody>().catch(() => null);
  if (!body) return c.json({ error: "Invalid request." }, 400);

  const topic = String(body.topic ?? "").replace(/\s+/g, " ").trim();
  const subjectFileId = typeof body.subjectFileId === "string" ? body.subjectFileId.trim() : "";
  if (Boolean(topic) === Boolean(subjectFileId)) {
    return c.json({ error: "Choose a topic or an uploaded file." }, 422);
  }
  if (topic.length > 2_000) return c.json({ error: "Keep the topic under 2,000 characters." }, 422);

  const database = db(c.env.DB);
  const [user] = await database
    .select({ email: schema.users.email })
    .from(schema.users)
    .where(eq(schema.users.id, userId))
    .limit(1);
  if (user?.email.endsWith("@arcadia.local")) {
    return c.json({ error: "Guest accounts cannot generate flashcards.", code: "guest_cannot_use" }, 403);
  }

  const tier = await getUserTier(database, userId);
  if (!isPaidTier(tier)) {
    return c.json({ error: "Upgrade to generate flashcards.", code: "upgrade_required" }, 403);
  }
  const limitError = await deckLimitError(database, userId, tier);
  if (limitError) return c.json(limitError, 422);

  let subjectId = body.subjectId || null;
  let sourceLabel: string;
  let sourceContent: ContentPart[];
  let fallbackTitle: string;

  if (subjectFileId) {
    const [file] = await database
      .select()
      .from(schema.subjectFiles)
      .where(and(eq(schema.subjectFiles.id, subjectFileId), eq(schema.subjectFiles.userId, userId)))
      .limit(1);
    if (!file) return c.json({ error: "Uploaded file not found." }, 404);
    if (!file.storageKey || !c.env.UPLOADS || !MATERIAL_TYPES[file.contentType]) {
      return c.json({ error: "This file is not available to generate from. Try a topic instead." }, 422);
    }

    const object = await c.env.UPLOADS.get(file.storageKey);
    if (!object) return c.json({ error: "This file is not available to generate from. Try a topic instead." }, 422);
    const [subject] = await database
      .select({ name: schema.subjects.name })
      .from(schema.subjects)
      .where(and(eq(schema.subjects.id, file.subjectId), eq(schema.subjects.userId, userId)))
      .limit(1);
    subjectId = file.subjectId;
    sourceLabel = `${subject?.name ?? "Subject"} resource: ${file.filename}`;
    sourceContent = [filePart(await object.arrayBuffer(), file.contentType, file.filename)];
    fallbackTitle = titleFromFilename(file.filename);
  } else {
    const linkError = await checkLinks(database, userId, subjectId, null);
    if (linkError) return c.json({ error: linkError }, 422);
    sourceLabel = `Topic: ${topic}`;
    sourceContent = [{ type: "text", text: topic }];
    fallbackTitle = cleanTitle(topic);
  }

  let generated: Awaited<ReturnType<typeof generateFlashcards>>;
  try {
    generated = await generateFlashcards(c.env, { label: sourceLabel, content: sourceContent });
  } catch (error) {
    console.error("[cards] generation failed", error);
    return c.json({ error: "Arcad couldn't make a deck right now. Try again in a moment." }, 502);
  }
  const cleaned = cleanCards(generated);
  if (!generated || "error" in cleaned || cleaned.cards.length < 8 || cleaned.cards.length > 20) {
    console.error("[cards] unusable generated deck", "error" in cleaned ? cleaned.error : "wrong card count");
    return c.json({ error: "Arcad couldn't make a usable deck. Try a clearer topic or resource." }, 502);
  }

  // Generation can take a moment. Check again just before writing so a deck
  // made in another tab while Arcad was working cannot push the tier over.
  const postGenerationLimitError = await deckLimitError(database, userId, tier);
  if (postGenerationLimitError) return c.json(postGenerationLimitError, 422);

  const id = newId("deck");
  const title = cleanTitle(body.title) || fallbackTitle || "Arcad flashcards";
  const writes: Statement[] = [
    database.insert(schema.decks).values({ id, userId, subjectId, title, source: "arcad" }),
    insertCards(
      userId,
      id,
      cleaned.cards.map((card, position) => ({ id: newId("card"), front: card.front, back: card.back, position })),
    ),
  ];
  await runBatch(c.env.DB, writes);
  track(c, userId, "deck_created", { source: "arcad", cards: cleaned.cards.length });

  const row = await ownedDeck(database, userId, id);
  const cards = await deckCards(database, id);
  const now = Date.now();
  return c.json(
    { deck: serialiseDeck(row.deck, countCards(cards, now), row.topicTitle), cards: cards.map((card) => serialiseCard(card, now)) },
    201,
  );
});

decks.get("/:id", async (c) => {
  const { userId } = c.get("session");
  const database = db(c.env.DB);
  const row = await ownedDeck(database, userId, c.req.param("id"));
  if (!row) return c.json({ error: "Deck not found." }, 404);
  const cards = await deckCards(database, row.deck.id);
  const now = Date.now();
  return c.json({
    deck: serialiseDeck(row.deck, countCards(cards, now), row.topicTitle),
    cards: cards.map((card) => serialiseCard(card, now)),
  });
});

decks.patch("/:id", async (c) => {
  const { userId } = c.get("session");
  const body = await c.req.json<DeckBody>().catch(() => null);
  if (!body) return c.json({ error: "Invalid request." }, 400);

  const database = db(c.env.DB);
  const row = await ownedDeck(database, userId, c.req.param("id"));
  if (!row) return c.json({ error: "Deck not found." }, 404);

  const patch: Partial<typeof schema.decks.$inferInsert> = {};
  if (body.title !== undefined) {
    const title = cleanTitle(body.title);
    if (!title) return c.json({ error: "Give the deck a name." }, 422);
    patch.title = title;
  }
  if (body.subjectId !== undefined || body.topicId !== undefined) {
    const subjectId = body.subjectId === undefined ? row.deck.subjectId : body.subjectId || null;
    // Moving to another subject drops a topic from the old one.
    const topicId =
      body.topicId !== undefined ? body.topicId || null : subjectId === row.deck.subjectId ? row.deck.topicId : null;
    const linkError = await checkLinks(database, userId, subjectId, topicId);
    if (linkError) return c.json({ error: linkError }, 422);
    patch.subjectId = subjectId;
    patch.topicId = topicId;
  }

  if (Object.keys(patch).length > 0) {
    await database
      .update(schema.decks)
      .set({ ...patch, updatedAt: Date.now() })
      .where(eq(schema.decks.id, row.deck.id));
  }
  const updated = await ownedDeck(database, userId, row.deck.id);
  const cards = await deckCards(database, row.deck.id);
  return c.json({ deck: serialiseDeck(updated.deck, countCards(cards, Date.now()), updated.topicTitle) });
});

decks.delete("/:id", async (c) => {
  const { userId } = c.get("session");
  const database = db(c.env.DB);
  const result = await database
    .delete(schema.decks)
    .where(and(eq(schema.decks.id, c.req.param("id")), eq(schema.decks.userId, userId)))
    .returning({ id: schema.decks.id });
  if (result.length === 0) return c.json({ error: "Deck not found." }, 404);
  return c.json({ ok: true });
});

/**
 * Saves the editor: the full list of cards as it should be. Cards with an id
 * keep their review history; new ones go on the end; missing ones are deleted.
 */
decks.put("/:id/cards", async (c) => {
  const { userId } = c.get("session");
  const body = await c.req.json<{ cards?: CardInput[] }>().catch(() => null);
  if (!body) return c.json({ error: "Invalid request." }, 400);
  const cleaned = cleanCards(body.cards);
  if ("error" in cleaned) return c.json({ error: cleaned.error }, 422);

  const database = db(c.env.DB);
  const row = await ownedDeck(database, userId, c.req.param("id"));
  if (!row) return c.json({ error: "Deck not found." }, 404);
  const deckId = row.deck.id;

  const existing = await deckCards(database, deckId);
  const byId = new Map(existing.map((card) => [card.id, card]));
  const kept = new Set<string>();
  const changed: Array<{ id: string; front: string; back: string }> = [];
  const added: Array<{ id: string; front: string; back: string; position: number }> = [];
  let position = existing.reduce((max, card) => Math.max(max, card.position + 1), 0);

  for (const card of cleaned.cards) {
    const current = card.id ? byId.get(card.id) : undefined;
    if (current && !kept.has(current.id)) {
      kept.add(current.id);
      if (current.front !== card.front || current.back !== card.back) {
        changed.push({ id: current.id, front: card.front, back: card.back });
      }
    } else {
      added.push({ id: newId("card"), front: card.front, back: card.back, position: position++ });
    }
  }
  const removed = existing.filter((card) => !kept.has(card.id)).map((card) => card.id);

  const writes: Statement[] = [];
  if (removed.length) writes.push(deleteCards(deckId, removed));
  if (changed.length) writes.push(updateCardText(deckId, changed));
  if (added.length) writes.push(insertCards(userId, deckId, added));
  if (writes.length) {
    writes.push(database.update(schema.decks).set({ updatedAt: Date.now() }).where(eq(schema.decks.id, deckId)));
  }
  await runBatch(c.env.DB, writes);

  const cards = await deckCards(database, deckId);
  const now = Date.now();
  return c.json({
    deck: serialiseDeck(row.deck, countCards(cards, now), row.topicTitle),
    cards: cards.map((card) => serialiseCard(card, now)),
  });
});

/** /api/cards: studying across decks. */
export const cards: App = new Hono();

/** Every card that's due, oldest first, for "Review all due". */
cards.get("/due", async (c) => {
  const { userId } = c.get("session");
  const database = db(c.env.DB);
  const now = Date.now();
  const rows = await database
    .select()
    .from(schema.cards)
    .where(
      and(
        eq(schema.cards.userId, userId),
        isNotNull(schema.cards.dueAt),
        lte(schema.cards.dueAt, now),
        sql`${schema.cards.reviews} > 0`,
      ),
    )
    .orderBy(asc(schema.cards.dueAt))
    .limit(MAX_CARDS);
  return c.json({ cards: rows.map((card) => serialiseCard(card, now)) });
});

/**
 * Answers from a study session, in the order they were given, so a card got
 * wrong then right in the same sitting ends up where it should.
 */
cards.post("/reviews", async (c) => {
  const { userId } = c.get("session");
  const body = await c.req.json<{ results?: Array<{ cardId?: string; correct?: boolean }> }>().catch(() => null);
  const results = (body?.results ?? [])
    .filter((item) => typeof item?.cardId === "string" && typeof item.correct === "boolean")
    .slice(0, REVIEW_BATCH) as Array<{ cardId: string; correct: boolean }>;
  if (results.length === 0) return c.json({ error: "Nothing to save." }, 400);

  const database = db(c.env.DB);
  const ids = [...new Set(results.map((item) => item.cardId))];
  const [rows, timezone] = await Promise.all([
    database
      .select()
      .from(schema.cards)
      .where(and(eq(schema.cards.userId, userId), inArray(schema.cards.id, ids))),
    timezoneOf(database, userId),
  ]);
  const state = new Map(rows.map((card) => [card.id, card]));
  const now = Date.now();
  for (const result of results) {
    const card = state.get(result.cardId);
    if (!card) continue;
    state.set(card.id, { ...card, ...answer(card, result.correct, now, timezone) });
  }

  const updated = [...state.values()];
  if (updated.length === 0) return c.json({ cards: [] });
  const deckIds = [...new Set(updated.map((card) => card.deckId))];
  await runBatch(c.env.DB, [
    updateSchedules(
      userId,
      updated.map(({ id, box, dueAt, reviewedAt, reviews, lapses }) => ({ id, box, dueAt, reviewedAt, reviews, lapses })),
    ),
    database
      .update(schema.decks)
      .set({ studiedAt: now })
      .where(and(eq(schema.decks.userId, userId), inArray(schema.decks.id, deckIds))),
  ]);
  track(c, userId, "cards_reviewed", {
    answers: results.length,
    correct: results.filter((result) => result.correct).length,
  });
  return c.json({ cards: updated.map((card) => serialiseCard(card, now)) });
});
