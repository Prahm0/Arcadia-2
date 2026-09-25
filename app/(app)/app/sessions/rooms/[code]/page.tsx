import type { Metadata } from "next";
import RoomView from "@/components/app/RoomView";

export const metadata: Metadata = { title: "Study room" };

export default async function RoomDetailPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return <RoomView code={code} />;
}
