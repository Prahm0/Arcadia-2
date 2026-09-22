"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api/client";

/** Matches serialiseCard in backend/src/lib/cards.ts. */
export interface Card {
  id: string;
  deckId: string;
  front: string;
  back: string;
  /** 0 = learning, 1-5 = known, each a longer gap. */
  box: number;
  reviews: number;
  status: "new" | "learning" | "mastered";
  due: boolean;
  dueAt: string | null;
}

export interface Deck {
  id: string;
  title: string;
  subjectId: string | null;
  topic: { id: string; title: string } | null;
  source: "manual" | "import" | "arcad";
  cardCount: number;
  newCount: number;
  dueCount: number;
  masteredCount: number;
  studiedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DeckWithCards {
  deck: Deck;
  cards: Card[];
}

export interface CardDraft {
  id?: string;
  front: string;
  back: string;
}

export function createDeck(body: {
  title: string;
  subjectId: string | null;
  topicId?: string | null;
  source?: "manual" | "import";
  cards?: CardDraft[];
}): Promise<DeckWithCards> {
  return api<DeckWithCards>("/api/decks", { method: "POST", body: JSON.stringify(body) });
}

export function updateDeck(
  id: string,
  body: Partial<{ title: string; subjectId: string | null; topicId: string | null }>,
): Promise<{ deck: Deck }> {
  return api<{ deck: Deck }>(`/api/decks/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(body) });
}

export function deleteDeck(id: string): Promise<unknown> {
  return api(`/api/decks/${encodeURIComponent(id)}`, { method: "DELETE" });
}

/** Saves the editor: the full list, in order. Cards with an id keep their progress. */
export function saveCards(id: string, cards: CardDraft[]): Promise<DeckWithCards> {
  return api<DeckWithCards>(`/api/decks/${encodeURIComponent(id)}/cards`, {
    method: "PUT",
    body: JSON.stringify({ cards }),
  });
}

export function fetchDueCards(): Promise<{ cards: Card[] }> {
  return api<{ cards: Card[] }>("/api/cards/due");
}

type Load<T> = { status: "loading" } | { status: "error"; error: string } | { status: "ready"; data: T };

function useLoad<T>(path: string | null) {
  const [state, setState] = useState<Load<T>>({ status: "loading" });

  const refresh = useCallback(async () => {
    if (!path) return;
    try {
      const data = await api<T>(path);
      setState({ status: "ready", data });
    } catch (err) {
      setState((prev) =>
        prev.status === "ready" ? prev : { status: "error", error: err instanceof Error ? err.message : "Couldn't load." },
      );
    }
  }, [path]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const replace = useCallback((data: T) => setState({ status: "ready", data }), []);
  return { state, refresh, replace };
}

export function useDecks() {
  return useLoad<{ decks: Deck[] }>("/api/decks");
}

export function useDeck(id: string) {
  return useLoad<DeckWithCards>(`/api/decks/${encodeURIComponent(id)}`);
}

/** "12 cards", "1 card". */
export function cardCount(count: number): string {
  return `${count} card${count === 1 ? "" : "s"}`;
}
