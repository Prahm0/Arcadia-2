import type { Metadata } from "next";
import DeckView from "@/components/app/cards/DeckView";

export const metadata: Metadata = { title: "Deck" };

export default async function DeckPage({
  params,
  searchParams,
}: {
  params: Promise<{ deckId: string }>;
  searchParams: Promise<{ edit?: string }>;
}) {
  const { deckId } = await params;
  const { edit } = await searchParams;
  return <DeckView key={deckId} deckId={decodeURIComponent(deckId)} startEditing={edit === "1"} />;
}
