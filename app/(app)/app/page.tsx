import type { Metadata } from "next";
import AppHome from "@/components/app/AppHome";

export const metadata: Metadata = { title: "Today" };

export default function AppPage() {
  return <AppHome />;
}
