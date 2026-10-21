import test from "node:test";
import assert from "node:assert/strict";
import { communityNickname, rankCommunityLeaderboard } from "./src/lib/community-leaderboard.ts";

test("community leaderboard uses stable anonymous names and competition ranking", () => {
  assert.equal(communityNickname("user-a"), communityNickname("user-a"));
  assert.match(communityNickname("user-a"), / learner \d{4}$/);

  const entries = rankCommunityLeaderboard([
    { userId: "user-a", seconds: 7200 },
    { userId: "user-b", seconds: 5400 },
    { userId: "user-c", seconds: 5400 },
    { userId: "user-d", seconds: 1800 },
  ], "user-c");

  assert.deepEqual(entries.map(({ place, name, isYou }) => ({ place, name, isYou })), [
    { place: 1, name: communityNickname("user-a"), isYou: false },
    { place: 2, name: communityNickname("user-b"), isYou: false },
    { place: 2, name: "You", isYou: true },
    { place: 4, name: communityNickname("user-d"), isYou: false },
  ]);
});
