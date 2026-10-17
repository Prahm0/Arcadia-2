import type { Metadata } from "next";
import PrioritiesView from "@/components/app/PrioritiesView";

export const metadata: Metadata = { title: "Priorities" };

export default function PrioritiesPage() {
  return <PrioritiesView />;
}
