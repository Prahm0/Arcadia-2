import type { Metadata } from "next";
import { DeckFlashcards } from "@/components/app/cards/StudyPages";

export const metadata: Metadata = { title: "Flashcards" };

export default async function DeckFlashcardsPage({
  params,
  searchParams,
}: {
  params: Promise<{ deckId: string }>;
  searchParams: Promise<{ due?: string }>;
}) {
  const { deckId } = await params;
  const { due } = await searchParams;
  return <DeckFlashcards deckId={decodeURIComponent(deckId)} dueOnly={due === "1"} />;
}
