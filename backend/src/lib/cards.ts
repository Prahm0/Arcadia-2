import { sql } from "drizzle-orm";
import { schema, type Database } from "../db";
import { completeJson, documentCall, type ContentPart } from "./openai";
import { DAY, iso, startOfLocalDay } from "./time";
import type { Env } from "../types";

type CardRow = typeof schema.cards.$inferSelect;

export const TITLE_MAX = 80;
export const FRONT_MAX = 500;
export const BACK_MAX = 1000;
export const MAX_CARDS = 500;
export const MAX_DECKS = 200;

interface GeneratedCardsReply {
  cards: Array<{ front: string; back: string }>;
}

const GENERATED_CARDS_SCHEMA = {
  name: "flashcard_deck",
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["cards"],
    properties: {
      cards: {
        type: "array",
        minItems: 8,
        maxItems: 20,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["front", "back"],
          properties: {
            front: { type: "string" },
            back: { type: "string" },
          },
        },
      },
    },
  },
};

/**
 * Makes a compact first deck from one topic or an existing subject resource.
 * The route validates and stores the cards after this returns, so a malformed
 * model answer can never create an empty or partial deck.
 */
export async function generateFlashcards(
  env: Env,
  userId: string,
  source: { label: string; content: ContentPart[] },
): Promise<Array<{ front: string; back: string }> | null> {
  const call = documentCall(env, { feature: "cards", userId }, 1600);
  const reply = await completeJson<GeneratedCardsReply>(
    env,
    [
      {
        role: "system",
        content: [
          "You create concise, useful study flashcards for a high school student.",
          "Make 8 to 20 cards based only on the supplied topic or resource.",
          "Each front is a clear retrieval question or term. Each back is a short, accurate answer.",
          "Cover the important ideas before minor details. Avoid duplicate cards, vague prompts, and study advice.",
          "Use plain text. Keep each side short enough to review quickly.",
        ].join("\n"),
      },
      {
        role: "user",
        content: [{ type: "text", text: `Create a flashcard deck from: ${source.label}` }, ...source.content],
      },
    ],
    GENERATED_CARDS_SCHEMA,
    call.maxTokens,
    call.options,
  );

  return reply?.cards ?? null;
}

/** Days until a card comes round again, by box. Box 0 is learning: due now. */
export const BOX_DAYS = [0, 1, 3, 7, 16, 35];
export const MAX_BOX = BOX_DAYS.length - 1;
/** From here a card has a week or more between looks: mastered. */
export const MASTERED_BOX = 3;

export interface Schedule {
  box: number;
  dueAt: number | null;
  reviewedAt: number | null;
  reviews: number;
  lapses: number;
}

/**
 * The schedule after one answer. Right moves a card up a box and out to the
 * start of the day that many days away; wrong drops it to box 0, due again
 * straight away. Right on a card that isn't due yet (running the whole deck
 * the night before) doesn't move it up, so the gaps only grow from real recall.
 */
export function answer(card: Schedule, correct: boolean, now: number, timeZone: string): Schedule {
  const reviews = card.reviews + 1;
  if (!correct) {
    return { box: 0, dueAt: now, reviewedAt: now, reviews, lapses: card.lapses + (card.box > 0 ? 1 : 0) };
  }
  if (card.dueAt !== null && card.dueAt > now) return { ...card, reviewedAt: now, reviews };
  const box = Math.min(MAX_BOX, card.box + 1);
  // Midday of the target day, floored to its midnight, so a DST change in
  // between can't land it on the wrong day.
  const today = startOfLocalDay(now, timeZone);
  const dueAt = startOfLocalDay(today + BOX_DAYS[box] * DAY + DAY / 2, timeZone);
  return { box, dueAt, reviewedAt: now, reviews, lapses: card.lapses };
}

export function isDue(card: Pick<CardRow, "reviews" | "dueAt">, now: number): boolean {
  return card.reviews > 0 && (card.dueAt ?? 0) <= now;
}

/** Matches Card in lib/api/cards.ts. */
export function serialiseCard(card: CardRow, now: number) {
  return {
    id: card.id,
    deckId: card.deckId,
    front: card.front,
    back: card.back,
    box: card.box,
    reviews: card.reviews,
    status: card.reviews === 0 ? "new" : card.box >= MASTERED_BOX ? "mastered" : "learning",
    due: isDue(card, now),
    dueAt: card.dueAt ? iso(card.dueAt) : null,
  } as const;
}

export interface CardCounts {
  total: number;
  fresh: number;
  due: number;
  mastered: number;
}

export function countCards(cards: CardRow[], now: number): CardCounts {
  return {
    total: cards.length,
    fresh: cards.filter((card) => card.reviews === 0).length,
    due: cards.filter((card) => isDue(card, now)).length,
    mastered: cards.filter((card) => card.box >= MASTERED_BOX).length,
  };
}

/** Card counts for every deck the student has, in one read. */
export async function deckCounts(database: Database, userId: string, now: number): Promise<Map<string, CardCounts>> {
  const rows = await database
    .select({
      deckId: schema.cards.deckId,
      total: sql<number>`count(*)`,
      fresh: sql<number>`sum(${schema.cards.reviews} = 0)`,
      due: sql<number>`sum(${schema.cards.reviews} > 0 and ${schema.cards.dueAt} <= ${now})`,
      mastered: sql<number>`sum(${schema.cards.box} >= ${MASTERED_BOX})`,
    })
    .from(schema.cards)
    .where(sql`${schema.cards.userId} = ${userId}`)
    .groupBy(schema.cards.deckId);
  return new Map(
    rows.map((row) => [
      row.deckId,
      { total: Number(row.total), fresh: Number(row.fresh ?? 0), due: Number(row.due ?? 0), mastered: Number(row.mastered ?? 0) },
    ]),
  );
}

/** Anything that can go in a D1 batch: a Drizzle query, or a statement below. */
export interface Statement {
  toSQL(): { sql: string; params: unknown[] };
}

/**
 * Runs statements in one D1 batch (one transaction). Goes straight to D1
 * because Drizzle can't batch a raw statement that has parameters.
 */
export async function runBatch(d1: D1Database, statements: Statement[]): Promise<void> {
  if (statements.length === 0) return;
  await d1.batch(
    statements.map((statement) => {
      const { sql: text, params } = statement.toSQL();
      return d1.prepare(text).bind(...params);
    }),
  );
}

const statement = (text: string, ...params: unknown[]): Statement => ({ toSQL: () => ({ sql: text, params }) });

// Bulk writes pass the rows as one JSON value and unpack it with json_each,
// so a whole deck is one statement with three parameters, well clear of D1's
// per-statement parameter limit however many cards there are.

export function insertCards(
  userId: string,
  deckId: string,
  rows: Array<{ id: string; front: string; back: string; position: number }>,
): Statement {
  return statement(
    `INSERT INTO cards (id, user_id, deck_id, front, back, position)
     SELECT json_extract(value, '$.id'), ?, ?, json_extract(value, '$.front'), json_extract(value, '$.back'),
            json_extract(value, '$.position')
     FROM json_each(?)`,
    userId,
    deckId,
    JSON.stringify(rows),
  );
}

export function updateCardText(deckId: string, rows: Array<{ id: string; front: string; back: string }>): Statement {
  return statement(
    `UPDATE cards
     SET front = json_extract(j.value, '$.front'), back = json_extract(j.value, '$.back')
     FROM json_each(?) AS j
     WHERE cards.id = json_extract(j.value, '$.id') AND cards.deck_id = ?`,
    JSON.stringify(rows),
    deckId,
  );
}

export function deleteCards(deckId: string, ids: string[]): Statement {
  return statement(
    `DELETE FROM cards WHERE deck_id = ? AND id IN (SELECT value FROM json_each(?))`,
    deckId,
    JSON.stringify(ids),
  );
}

export function updateSchedules(userId: string, rows: Array<Schedule & { id: string }>): Statement {
  return statement(
    `UPDATE cards
     SET box = json_extract(j.value, '$.box'),
         due_at = json_extract(j.value, '$.dueAt'),
         reviewed_at = json_extract(j.value, '$.reviewedAt'),
         reviews = json_extract(j.value, '$.reviews'),
         lapses = json_extract(j.value, '$.lapses')
     FROM json_each(?) AS j
     WHERE cards.id = json_extract(j.value, '$.id') AND cards.user_id = ?`,
    JSON.stringify(rows),
    userId,
  );
}
