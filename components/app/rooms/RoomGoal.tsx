"use client";

import { useState } from "react";
import type { StudyRoom, StudyRoomMember } from "@/lib/api/rooms";
import { roomColour } from "@/lib/app/roomColours";
import { cn } from "@/lib/cn";
import CompletionBurst from "../CompletionBurst";
import { AvatarStack } from "./MemberAvatar";
import { formatDuration, periodSeconds } from "./format";

type GoalPeriod = "today" | "week";

/**
 * The room's shared target: everyone's focus adds to one bar. Owners set a
 * daily goal, a 7-day goal or both in room settings.
 */
export default function RoomGoal({
  room,
  members,
  now,
  isOwner,
  onEdit,
}: {
  room: StudyRoom;
  members: StudyRoomMember[];
  now: number;
  isOwner: boolean;
  onEdit: () => void;
}) {
  const goals: Array<{ period: GoalPeriod; minutes: number }> = [];
  if (room.dailyGoalMinutes) goals.push({ period: "today", minutes: room.dailyGoalMinutes });
  if (room.weeklyGoalMinutes) goals.push({ period: "week", minutes: room.weeklyGoalMinutes });
  const [picked, setPicked] = useState<GoalPeriod>("today");
  const goal = goals.find((item) => item.period === picked) ?? goals[0];

  const [celebrated, setCelebrated] = useState<number>(0);
  const done = goal ? members.reduce((sum, member) => sum + periodSeconds(member, goal.period, now), 0) : 0;
  const target = goal ? goal.minutes * 60 : 0;
  const reached = goal ? done >= target : false;
  const contributors = goal ? members.filter((member) => periodSeconds(member, goal.period, now) > 0).length : 0;
  const colour = roomColour(room.colour);

  // Burst once when the bar fills while you're watching.
  const [wasReached, setWasReached] = useState(reached);
  if (reached !== wasReached) {
    setWasReached(reached);
    if (reached) setCelebrated((count) => count + 1);
  }

  return (
    <section aria-labelledby="room-goal-title" className="flex flex-col rounded-lg p-5" style={{ background: "var(--app-surface)", boxShadow: "var(--elev-1)" }}>
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="room-goal-title" className="text-[15px] font-semibold" style={{ color: "var(--app-text)" }}>
          {goal ? (goal.period === "today" ? "Today's room goal" : "7-day room goal") : "Room goal"}
        </h2>
        {goals.length > 1 ? (
          <div className="flex gap-1 text-[12px]" role="tablist" aria-label="Goal period">
            {goals.map((item) => (
              <button
                key={item.period}
                type="button"
                role="tab"
                aria-selected={item.period === goal?.period}
                onClick={() => setPicked(item.period)}
                className={cn("rounded px-1.5 py-0.5", item.period !== goal?.period && "ui-hover")}
                style={{ color: item.period === goal?.period ? "var(--app-text)" : "var(--app-text-muted)", background: item.period === goal?.period ? "var(--app-accent-soft)" : undefined }}
              >
                {item.period === "today" ? "Today" : "Week"}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {goal ? (
        <>
          <p className="mt-3 flex items-baseline gap-1.5 tabular-nums">
            <span className="font-mono text-[26px] leading-none tracking-[-0.02em]" style={{ color: "var(--app-text)" }}>{formatDuration(done)}</span>
            <span className="text-[14px]" style={{ color: "var(--app-text-muted)" }}>/ {formatDuration(target)}</span>
          </p>
          <div
            className="relative mt-3 h-2 overflow-hidden rounded-full"
            style={{ background: "var(--app-surface-soft)" }}
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={target}
            aria-valuenow={Math.min(done, target)}
            aria-label="Room goal progress"
          >
            <div
              className="relative h-full overflow-hidden rounded-full"
              style={{ width: `${Math.min(100, (done / Math.max(1, target)) * 100)}%`, background: reached ? "var(--app-success)" : colour, transition: "width 900ms var(--ease-out-expo), background-color 600ms ease" }}
            >
              {reached ? (
                <span aria-hidden="true" className="room-goal-sweep absolute inset-0" style={{ background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.55), transparent)" }} />
              ) : null}
            </div>
          </div>
          <div className="mt-2.5 flex items-center justify-between gap-3 text-[12.5px]" style={{ color: "var(--app-text-muted)" }}>
            <span className="flex min-w-0 items-center gap-2 tabular-nums">
              {contributors ? <AvatarStack people={members.filter((member) => periodSeconds(member, goal.period, now) > 0)} size={18} max={5} /> : null}
              {contributors} {contributors === 1 ? "member" : "members"} contributed
            </span>
            {reached ? (
              <CompletionBurst trigger={celebrated}>
                <span className="font-medium" style={{ color: "var(--app-success)" }}>Goal reached</span>
              </CompletionBurst>
            ) : (
              <span className="tabular-nums">{formatDuration(target - done)} to go</span>
            )}
          </div>
        </>
      ) : (
        <div className="mt-2 flex flex-1 flex-col justify-between gap-3">
          <p className="text-[13px]" style={{ color: "var(--app-text-muted)" }}>
            A shared target everyone&apos;s focus adds to, for today or the week.
            {isOwner ? "" : " The room owner can set one."}
          </p>
          {isOwner ? (
            <button type="button" onClick={onEdit} className="self-start text-[12.5px] font-medium underline underline-offset-4" style={{ color: "var(--app-text)" }}>
              Set a room goal
            </button>
          ) : null}
        </div>
      )}
    </section>
  );
}
