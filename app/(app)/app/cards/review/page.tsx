import type { Metadata } from "next";
import { DueReview } from "@/components/app/cards/StudyPages";

export const metadata: Metadata = { title: "Review cards" };

export default function DueReviewPage() {
  return <DueReview />;
}
