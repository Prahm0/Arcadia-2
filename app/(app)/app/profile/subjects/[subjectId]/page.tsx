"use client";

import { use } from "react";
import SubjectView from "@/components/app/profile/SubjectView";

export default function SubjectPage({ params }: { params: Promise<{ subjectId: string }> }) {
  const { subjectId } = use(params);
  return <SubjectView subjectId={decodeURIComponent(subjectId)} />;
}
