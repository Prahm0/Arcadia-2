"use client";

import { use } from "react";
import RoomView from "@/components/app/RoomView";

export default function RoomDetailPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = use(params);
  return <RoomView code={code} />;
}
