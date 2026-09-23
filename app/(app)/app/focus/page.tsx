import type { Metadata } from "next";
import FocusView from "@/components/app/FocusView";

export const metadata: Metadata = { title: "Focus" };

export default function FocusPage() {
  return <FocusView />;
}
