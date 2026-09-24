import type { Metadata } from "next";
import { NewSheetPage } from "@/components/app/sheets/SheetPage";

export const metadata: Metadata = { title: "New sheet" };

export default function NewSheet() {
  return <NewSheetPage />;
}
