import type { Metadata } from "next";
import ArcadView from "@/components/app/ArcadView";

export const metadata: Metadata = { title: "Arcad" };

export default function ArcadPage() {
  return <ArcadView />;
}
