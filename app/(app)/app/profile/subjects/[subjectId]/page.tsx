import type { Metadata } from "next";
import SubjectView from "@/components/app/profile/SubjectView";

export const metadata: Metadata = { title: "Subject" };

export default async function SubjectPage({ params }: { params: Promise<{ subjectId: string }> }) {
  const { subjectId } = await params;
  return <SubjectView subjectId={decodeURIComponent(subjectId)} />;
}
