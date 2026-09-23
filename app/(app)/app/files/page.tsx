import type { Metadata } from "next";
import FilesView from "@/components/app/files/FilesView";

export const metadata: Metadata = { title: "Files" };

export default function FilesPage() {
  return <FilesView />;
}
