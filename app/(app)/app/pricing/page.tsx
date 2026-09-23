import type { Metadata } from "next";
import PricingView from "@/components/app/PricingView";

export const metadata: Metadata = { title: "Plans" };

export default function PricingPage() {
  return <PricingView />;
}
