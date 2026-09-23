import type { Metadata } from "next";
import ReviewView from "@/components/app/ReviewView";

export const metadata: Metadata = { title: "Weekly review" };

export default function ReviewPage() {
  return <ReviewView />;
}
