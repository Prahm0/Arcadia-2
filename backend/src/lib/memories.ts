import { asc, eq, inArray } from "drizzle-orm";
import { schema, type Database } from "../db";
import { newId } from "./ids";

/** Oldest memories drop off past this, so the context Arcad reads stays small. */
export const MAX_MEMORIES = 100;
const MAX_PER_SAVE = 5;
const MAX_LENGTH = 300;

export interface SavedMemory {
  id: string;
  content: string;
  source: string;
  createdAt: number;
}

/**
 * Stores new facts about the student, skipping blanks, duplicates of what's
 * already saved, and anything past a handful per call. Returns what was
 * actually added, so the chat can say "Saved to memory".
 */
export async function saveMemories(
  database: Database,
  userId: string,
  facts: unknown[],
  source: "chat" | "manual" = "chat",
): Promise<SavedMemory[]> {
  const existing = await database
    .select()
    .from(schema.memories)
    .where(eq(schema.memories.userId, userId))
    .orderBy(asc(schema.memories.createdAt));

  const seen = new Set(existing.map((row) => normalise(row.content)));
  const fresh: SavedMemory[] = [];
  const now = Date.now();
  for (const fact of facts) {
    if (typeof fact !== "string") continue;
    const content = fact.replace(/\s+/g, " ").trim().slice(0, MAX_LENGTH);
    if (content.length < 3 || seen.has(normalise(content))) continue;
    seen.add(normalise(content));
    // Distinct timestamps keep the saved order when several land at once.
    fresh.push({ id: newId("mem"), content, source, createdAt: now + fresh.length });
    if (fresh.length >= MAX_PER_SAVE) break;
  }
  if (fresh.length === 0) return [];

  const overflow = existing.length + fresh.length - MAX_MEMORIES;
  const drop = overflow > 0 ? existing.slice(0, overflow).map((row) => row.id) : [];

  const writes = [
    ...(drop.length ? [database.delete(schema.memories).where(inArray(schema.memories.id, drop))] : []),
    ...fresh.map((memory) => database.insert(schema.memories).values({ ...memory, userId })),
  ];
  await database.batch(writes as [(typeof writes)[number], ...(typeof writes)[number][]]);
  return fresh;
}

function normalise(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}
