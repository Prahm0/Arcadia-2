import type { Metadata } from "next";
import RoomsView from "@/components/app/RoomsView";

export const metadata: Metadata = { title: "Study rooms" };

export default function RoomsPage() {
  return <RoomsView />;
}
