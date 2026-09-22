"use client";

import { use } from "react";
import CardsView from "@/components/app/cards/CardsView";

export default function CardsPage({ searchParams }: { searchParams: Promise<{ new?: string }> }) {
  const { new: startNew } = use(searchParams);
  return <CardsView startCreating={startNew === "1"} />;
}
