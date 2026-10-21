export interface CommunityLeaderboardRow {
  userId: string;
  seconds: number;
}

export interface CommunityLeaderboardEntry extends CommunityLeaderboardRow {
  place: number;
  name: string;
  isYou: boolean;
}

const nicknameStarts = ["Sage", "Nova", "Orbit", "Comet", "Aurora", "Atlas", "Sol", "Lumen"];

/** A stable, non-identifying public name. */
export function communityNickname(userId: string): string {
  let hash = 0;
  for (const character of userId) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  return `${nicknameStarts[hash % nicknameStarts.length]} learner ${String((hash >>> 8) % 10000).padStart(4, "0")}`;
}

export function rankCommunityLeaderboard(rows: CommunityLeaderboardRow[], viewerId: string): CommunityLeaderboardEntry[] {
  let place = 0;
  let previousSeconds = -1;
  return rows.map((row, index) => {
    if (row.seconds !== previousSeconds) place = index + 1;
    previousSeconds = row.seconds;
    const isYou = row.userId === viewerId;
    return { ...row, place, name: isYou ? "You" : communityNickname(row.userId), isYou };
  });
}
