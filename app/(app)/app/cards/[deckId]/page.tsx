"use client";

import { use } from "react";
import DeckView from "@/components/app/cards/DeckView";

export default function DeckPage({
  params,
  searchParams,
}: {
  params: Promise<{ deckId: string }>;
  searchParams: Promise<{ edit?: string }>;
}) {
  const { deckId } = use(params);
  const { edit } = use(searchParams);
  return <DeckView key={deckId} deckId={decodeURIComponent(deckId)} startEditing={edit === "1"} />;
}
