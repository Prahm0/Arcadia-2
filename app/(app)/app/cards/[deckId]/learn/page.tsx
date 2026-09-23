import type { Metadata } from "next";
import { DeckLearn } from "@/components/app/cards/StudyPages";

export const metadata: Metadata = { title: "Learn" };

export default async function DeckLearnPage({ params }: { params: Promise<{ deckId: string }> }) {
  const { deckId } = await params;
  return <DeckLearn deckId={decodeURIComponent(deckId)} />;
}
