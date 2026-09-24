import type { Metadata } from "next";
import SheetsView from "@/components/app/sheets/SheetsView";

export const metadata: Metadata = { title: "Sheets" };

// A server page so ?new=1 reaches the view, like Cards.
export default async function SheetsPage({ searchParams }: { searchParams: Promise<{ new?: string }> }) {
  const { new: startNew } = await searchParams;
  return <SheetsView startCreating={startNew === "1"} />;
}
