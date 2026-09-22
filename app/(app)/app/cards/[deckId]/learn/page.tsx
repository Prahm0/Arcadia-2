"use client";

import { use } from "react";
import { DeckLearn } from "@/components/app/cards/StudyPages";

export default function DeckLearnPage({ params }: { params: Promise<{ deckId: string }> }) {
  const { deckId } = use(params);
  return <DeckLearn deckId={decodeURIComponent(deckId)} />;
}
