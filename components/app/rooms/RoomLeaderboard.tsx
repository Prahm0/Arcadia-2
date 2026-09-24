"use client";

import { useState } from "react";
import type { StudyRoomMember } from "@/lib/api/rooms";
import { cn } from "@/lib/cn";
import { Avatar, Sheet } from "../profile/ui";
import { ConstellationMark, LIVE } from "./MemberAvatar";
import { formatDuration, periodSeconds, type LeaderboardPeriod } from "./format";

const SIDEBAR_ROWS = 5;

/**
 * Who has put in the most time, today through all time. Only time since each
 * person joined the room counts, and a session on the clock counts as it goes,
 * so the order can shift while you watch.
 */
export default function RoomLeaderboard({
  members,
  now,
  userId,
  termLabel,
  onProfile,
}: {
  members: StudyRoomMember[];
  now: number;
  userId: string;
  termLabel: string;
  onProfile: (member: StudyRoomMember) => void;
}) {
  const [period, setPeriod] = useState<LeaderboardPeriod>("week");
  const [full, setFull] = useState(false);
  const ranked = rank(members, period, now);
  const mine = ranked.find((row) => row.member.userId === userId);
  const top = ranked.slice(0, SIDEBAR_ROWS);
  const showMine = mine && mine.place > SIDEBAR_ROWS;
  const periods: Array<{ key: LeaderboardPeriod; label: string }> = [
    { key: "today", label: "Today" },
    { key: "week", label: "Week" },
    { key: "term", label: termLabel.startsWith("Term") ? "Term" : termLabel },
    { key: "all", label: "All time" },
  ];

  const tabs = (
    <div role="tablist" aria-label="Leaderboard period" className="grid grid-cols-4 gap-1 rounded-md p-1" style={{ background: "var(--app-surface-soft)" }}>
      {periods.map((option) => {
        const active = option.key === period;
        return (
          <button
            key={option.key}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => setPeriod(option.key)}
            className={cn("h-7 rounded-[5px] text-[12px] font-medium transition-[background-color,box-shadow] duration-150", !active && "ui-hover")}
            style={{
              background: active ? "var(--app-surface)" : "transparent",
              boxShadow: active ? "var(--elev-1)" : undefined,
              color: active ? "var(--app-text)" : "var(--app-text-muted)",
            }}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );

  return (
    <section aria-labelledby="room-leaderboard-title" className="rounded-lg p-5" style={{ background: "var(--app-surface)", boxShadow: "var(--elev-1)" }}>
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 id="room-leaderboard-title" className="text-[15px] font-semibold" style={{ color: "var(--app-text)" }}>Leaderboard</h2>
        <span className="text-[12px]" style={{ color: "var(--app-text-faint)" }}>{caption(period, termLabel)}</span>
      </div>
      {tabs}
      <ol key={period} className="mt-3 flex flex-col gap-0.5">
        {top.length === 0 ? (
          <li className="py-3 text-[13px]" style={{ color: "var(--app-text-muted)" }}>
            No focus logged {period === "today" ? "today" : "yet"}. First session takes the top spot.
          </li>
        ) : (
          top.map((row, index) => <Row key={row.member.userId} row={row} lead={ranked[0].seconds} isYou={row.member.userId === userId} index={index} onProfile={onProfile} />)
        )}
        {showMine ? (
          <>
            <li aria-hidden="true" className="px-2 text-[12px] leading-3" style={{ color: "var(--app-text-faint)" }}>⋯</li>
            <Row row={mine} lead={ranked[0].seconds} isYou index={SIDEBAR_ROWS} onProfile={onProfile} />
          </>
        ) : null}
      </ol>
      <div className="mt-3 flex items-center justify-between gap-3 border-t pt-3 text-[12.5px]" style={{ borderColor: "var(--app-border)" }}>
        <span className="tabular-nums" style={{ color: "var(--app-text-muted)" }}>
          {mine ? <>You: <span className="font-semibold" style={{ color: "var(--app-text)" }}>#{mine.place}</span>{gap(ranked, mine)}</> : "You haven't logged time here yet"}
        </span>
        <button type="button" onClick={() => setFull(true)} className="shrink-0 font-medium underline-offset-4 hover:underline" style={{ color: "var(--app-text-soft)" }}>
          View all
        </button>
      </div>

      <Sheet open={full} eyebrow="Leaderboard" title={caption(period, termLabel)} onClose={() => setFull(false)}>
        {tabs}
        <ol className="mt-3 flex flex-col gap-0.5">
          {rank(members, period, now, true).map((row, index) => (
            <Row key={row.member.userId} row={row} lead={ranked[0]?.seconds ?? 0} isYou={row.member.userId === userId} index={index} onProfile={(member) => { setFull(false); onProfile(member); }} />
          ))}
        </ol>
        <p className="mt-4 text-[12px]" style={{ color: "var(--app-text-faint)" }}>
          Focus time since each person joined this room. Sessions on the clock count as they go.
        </p>
      </Sheet>
    </section>
  );
}

interface Ranked {
  member: StudyRoomMember;
  seconds: number;
  place: number;
}

function rank(members: StudyRoomMember[], period: LeaderboardPeriod, now: number, includeZero = false): Ranked[] {
  const rows = members
    .map((member) => ({ member, seconds: periodSeconds(member, period, now) }))
    .filter((row) => includeZero || row.seconds >= 60)
    .sort((a, b) => b.seconds - a.seconds || a.member.displayName.localeCompare(b.member.displayName));
  // Ties share a place, as they would on any podium.
  let place = 0;
  let last = -1;
  return rows.map((row, index) => {
    if (row.seconds !== last) place = index + 1;
    last = row.seconds;
    return { ...row, place: row.seconds < 60 ? rows.length : place };
  });
}

function gap(ranked: Ranked[], mine: Ranked): string {
  if (mine.place === 1) {
    const next = ranked.find((row) => row.place > 1);
    return next ? ` · ${formatDuration(mine.seconds - next.seconds)} ahead` : "";
  }
  const above = [...ranked].reverse().find((row) => row.place < mine.place);
  return above ? ` · ${formatDuration(above.seconds - mine.seconds)} to #${above.place}` : "";
}

function caption(period: LeaderboardPeriod, termLabel: string): string {
  if (period === "today") return "Today";
  if (period === "week") return "Past 7 days";
  if (period === "term") return termLabel.startsWith("Term") ? `This term · ${termLabel}` : `Past ${termLabel}`;
  return "Since joining";
}

function Row({ row, lead, isYou, index, onProfile }: { row: Ranked; lead: number; isYou: boolean; index: number; onProfile: (member: StudyRoomMember) => void }) {
  const { member, seconds, place } = row;
  const share = lead > 0 ? Math.max(0.04, seconds / lead) : 0;
  const focusing = member.activity === "focus";
  return (
    <li className="app-enter" style={{ "--d": `${index * 30}ms` } as React.CSSProperties}>
      <button
        type="button"
        onClick={() => onProfile(member)}
        className="ui-hover relative flex w-full items-center gap-2.5 overflow-hidden rounded-md px-2 py-1.5 text-left"
        style={{ boxShadow: isYou ? "inset 0 0 0 1px var(--app-border-strong)" : undefined, background: isYou ? "var(--app-accent-soft)" : undefined }}
      >
        {/* A faint bar behind the row: how close they are to the lead. */}
        <span
          aria-hidden="true"
          className="absolute inset-y-1 left-0 rounded-r-sm"
          style={{ width: `${share * 100}%`, background: "color-mix(in oklab, var(--app-text) 4%, transparent)", transition: "width 600ms var(--ease-out-expo)" }}
        />
        <span
          className="relative w-5 shrink-0 text-center font-mono text-[12px] tabular-nums"
          style={{ color: place === 1 && seconds > 0 ? "var(--app-gold)" : "var(--app-text-faint)", fontWeight: place <= 3 ? 600 : 400 }}
        >
          {seconds >= 60 ? place : "–"}
        </span>
        <span
          className="relative shrink-0 rounded-full"
          style={{ boxShadow: focusing ? `0 0 0 1.5px var(--app-surface), 0 0 0 3px ${LIVE}` : undefined }}
          title={focusing ? "Focusing now" : undefined}
        >
          <Avatar name={member.displayName} colour={member.avatarColour} size={24} />
        </span>
        <span className="relative min-w-0 flex-1 truncate text-[13.5px]" style={{ color: "var(--app-text)", fontWeight: isYou ? 600 : 500 }}>
          {member.displayName}
          {isYou ? <span className="ml-1 text-[11.5px] font-normal" style={{ color: "var(--app-text-muted)" }}>you</span> : null}
        </span>
        {member.constellation ? <span className="relative"><ConstellationMark id={member.constellation.id} cards={member.constellation.cards} size={18} /></span> : null}
        <span className="relative shrink-0 font-mono text-[12.5px] tabular-nums" style={{ color: "var(--app-text-soft)" }}>
          {formatDuration(seconds)}
        </span>
      </button>
    </li>
  );
}
