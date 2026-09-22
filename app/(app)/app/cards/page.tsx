import CardsView from "@/components/app/cards/CardsView";

// A server page so ?new=1 (File → New card deck…) reaches the view; as a
// client page this route is prerendered and the query arrives empty.
export default async function CardsPage({ searchParams }: { searchParams: Promise<{ new?: string }> }) {
  const { new: startNew } = await searchParams;
  return <CardsView startCreating={startNew === "1"} />;
}
