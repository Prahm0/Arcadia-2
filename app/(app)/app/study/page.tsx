import type { Metadata } from "next";
import StudyToolsView from "@/components/app/StudyToolsView";

export const metadata: Metadata = { title: "Study tools" };

export default function StudyToolsPage() {
  return <StudyToolsView />;
}
