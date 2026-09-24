import type { Metadata } from "next";
import SheetPage from "@/components/app/sheets/SheetPage";

export const metadata: Metadata = { title: "Sheet" };

export default async function SheetRoute({
  params,
  searchParams,
}: {
  params: Promise<{ sheetId: string }>;
  searchParams: Promise<{ edit?: string; print?: string }>;
}) {
  const { sheetId } = await params;
  const { edit, print } = await searchParams;
  return <SheetPage key={sheetId} sheetId={decodeURIComponent(sheetId)} startEditing={edit === "1"} startPrinting={print === "1"} />;
}
