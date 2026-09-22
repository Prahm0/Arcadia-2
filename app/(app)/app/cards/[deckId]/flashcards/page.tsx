"use client";

import { use } from "react";
import { DeckFlashcards } from "@/components/app/cards/StudyPages";

export default function DeckFlashcardsPage({
  params,
  searchParams,
}: {
  params: Promise<{ deckId: string }>;
  searchParams: Promise<{ due?: string }>;
}) {
  const { deckId } = use(params);
  const { due } = use(searchParams);
  return <DeckFlashcards deckId={decodeURIComponent(deckId)} dueOnly={due === "1"} />;
}
