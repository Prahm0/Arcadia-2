import type { Metadata } from "next";
import CommunityLeaderboardView from "@/components/app/CommunityLeaderboardView";

export const metadata: Metadata = { title: "Leaderboard" };

export default function LeaderboardPage() {
  return <CommunityLeaderboardView />;
}
