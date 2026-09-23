import type { Metadata } from "next";
import StreaksView from "@/components/app/StreaksView";

export const metadata: Metadata = { title: "Streaks" };

export default function StreaksPage() {
  return <StreaksView />;
}
