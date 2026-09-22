"use client";

import { useEffect, useState } from "react";
import { fetchDueCards, useDeck, useDecks, type Card } from "@/lib/api/cards";
import FlashcardsView from "./FlashcardsView";
import LearnView from "./LearnView";
import { LoadError, Spinner, useSubjects } from "./shared";

/** Flashcards for one deck: every card, or just the due ones. */
export function DeckFlashcards({ deckId, dueOnly }: { deckId: string; dueOnly: boolean }) {
  const { state } = useDeck(deckId);
  const back = `/app/cards/${encodeURIComponent(deckId)}`;
  if (state.status === "loading") return <Spinner />;
  if (state.status === "error") return <LoadError message={state.error} backHref="/app/cards" backLabel="Back to cards" />;

  const cards = dueOnly ? state.data.cards.filter((card) => card.due) : state.data.cards;
  if (cards.length === 0) {
    return (
      <LoadError
        message={dueOnly ? "Nothing's due in this deck right now." : "This deck has no cards yet."}
        backHref={back}
        backLabel={`Back to ${state.data.deck.title}`}
      />
    );
  }
  return <FlashcardsView title={state.data.deck.title} backHref={back} cards={cards} />;
}

export function DeckLearn({ deckId }: { deckId: string }) {
  const { state } = useDeck(deckId);
  const back = `/app/cards/${encodeURIComponent(deckId)}`;
  if (state.status === "loading") return <Spinner />;
  if (state.status === "error") return <LoadError message={state.error} backHref="/app/cards" backLabel="Back to cards" />;
  if (state.data.cards.length === 0) {
    return <LoadError message="This deck has no cards yet." backHref={back} backLabel={`Back to ${state.data.deck.title}`} />;
  }
  return <LearnView title={state.data.deck.title} backHref={back} cards={state.data.cards} />;
}

/** Every due card across every deck, as flashcards. */
export function DueReview() {
  const [cards, setCards] = useState<Card[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { state: decks } = useDecks();
  const { find } = useSubjects();

  useEffect(() => {
    let live = true;
    fetchDueCards()
      .then((data) => live && setCards(data.cards))
      .catch((err) => live && setError(err instanceof Error ? err.message : "Couldn't load your cards."));
    return () => {
      live = false;
    };
  }, []);

  if (error) return <LoadError message={error} backHref="/app/cards" backLabel="Back to cards" />;
  if (!cards) return <Spinner />;
  if (cards.length === 0) return <LoadError message="Nothing's due right now." backHref="/app/cards" backLabel="Back to cards" />;

  const deckById = new Map(decks.status === "ready" ? decks.data.decks.map((deck) => [deck.id, deck]) : []);
  const labelFor = (card: Card) => {
    const deck = deckById.get(card.deckId);
    if (!deck) return "";
    const subject = find(deck.subjectId);
    return subject ? `${subject.name} · ${deck.title}` : deck.title;
  };
  return <FlashcardsView title="Due cards" backHref="/app/cards" cards={cards} labelFor={labelFor} />;
}
