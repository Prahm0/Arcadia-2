"use client";

import { useState, type ReactNode } from "react";
import type { RoomFeedItem, StudyRoom, StudyRoomMember } from "@/lib/api/rooms";
import { roomColour } from "@/lib/app/roomColours";
import { CHEERS } from "@/shared/roomFeed";
import { cn } from "@/lib/cn";
import { Avatar } from "../profile/ui";
import { formatDuration, listNames, periodSeconds, timeAgo } from "./format";

const COLLAPSED = 6;

/**
 * What's been happening: sessions finished, people starting, the room passing
 * milestones. The numbers behind it live one tab over in Insights.
 */
export default function RoomActivity({
  room,
  feed,
  members,
  userId,
  now,
}: {
  room: StudyRoom;
  feed: RoomFeedItem[];
  members: StudyRoomMember[];
  userId: string;
  now: number;
}) {
  const [tab, setTab] = useState<"activity" | "insights">("activity");
  const [expanded, setExpanded] = useState(false);
  // Cheers show up on the session they were for, and in chat.
  const items = feed.filter((item) => item.type !== "cheer");
  const shown = expanded ? items : items.slice(0, COLLAPSED);
  const people = new Map(members.map((member) => [member.userId, member]));

  return (
    <section aria-labelledby="room-activity-title" className="rounded-lg p-5" style={{ background: "var(--app-surface)", boxShadow: "var(--elev-1)" }}>
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="room-activity-title" className="text-[15px] font-semibold" style={{ color: "var(--app-text)" }}>
          {tab === "activity" ? "Room activity" : "Insights"}
        </h2>
        <div className="flex gap-1 text-[12px]" role="tablist" aria-label="Room activity view">
          {(["activity", "insights"] as const).map((key) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={tab === key}
              onClick={() => setTab(key)}
              className={cn("rounded px-1.5 py-0.5", tab !== key && "ui-hover")}
              style={{ color: tab === key ? "var(--app-text)" : "var(--app-text-muted)", background: tab === key ? "var(--app-accent-soft)" : undefined }}
            >
              {key === "activity" ? "Activity" : "Insights"}
            </button>
          ))}
        </div>
      </div>

      {tab === "activity" ? (
        items.length === 0 ? (
          <p className="mt-3 text-[13px]" style={{ color: "var(--app-text-muted)" }}>
            Quiet so far. Finished sessions, cheers and milestones show up here.
          </p>
        ) : (
          <>
            <ol className="mt-3 flex flex-col">
              {shown.map((item, index) => (
                <FeedRow key={item.id} item={item} people={people} userId={userId} now={now} index={index} />
              ))}
            </ol>
            {items.length > COLLAPSED ? (
              <button type="button" onClick={() => setExpanded((value) => !value)} className="mt-2 text-[12.5px] font-medium underline-offset-4 hover:underline" style={{ color: "var(--app-text-soft)" }}>
                {expanded ? "Show less" : `Show ${items.length - COLLAPSED} more`}
              </button>
            ) : null}
          </>
        )
      ) : (
        <Insights room={room} members={members} now={now} />
      )}
    </section>
  );
}

type People = Map<string, StudyRoomMember>;

function nameOf(people: People, userId: string, you: string): string {
  return userId === you ? "You" : people.get(userId)?.displayName ?? "Someone";
}

/** One line of activity, in the words a friend would use. */
export function feedText(item: RoomFeedItem, people: People, you: string): { text: ReactNode; detail?: string; who: string[] } {
  const name = (id: string) => <strong className="font-semibold" style={{ color: "var(--app-text)" }}>{nameOf(people, id, you)}</strong>;
  switch (item.type) {
    case "session":
      return {
        who: [item.userId],
        text: <>{name(item.userId)} finished a {formatDuration(item.seconds)} session</>,
        detail: item.cheers ? `👏 ${item.cheers} ${item.cheers === 1 ? "cheer" : "cheers"}` : undefined,
      };
    case "start":
      return { who: [item.userId], text: <>{name(item.userId)} started studying{item.subject ? <> · {item.subject}</> : null}</> };
    case "group":
      return {
        who: item.userIds,
        text: <><strong className="font-semibold" style={{ color: "var(--app-text)" }}>{listNames(item.userIds.map((id) => nameOf(people, id, you)))}</strong> are in a group session</>,
      };
    case "cheer":
      return { who: [item.fromUserId], text: <>{name(item.fromUserId)} cheered {item.toUserId === you ? "you" : nameOf(people, item.toUserId, you)} on {CHEERS[item.kind]?.emoji}</> };
    case "join":
      return { who: [item.userId], text: <>{name(item.userId)} joined the room</> };
    case "rank":
      return { who: [item.userId], text: <>{name(item.userId)} moved to #{item.rank} for the week</> };
    case "milestone":
      return { who: [], text: <>The room passed <strong className="font-semibold" style={{ color: "var(--app-text)" }}>{item.hours} hours</strong> in the past 7 days</> };
    case "goal":
      return { who: [], text: <>The room reached today&apos;s goal</> };
  }
}

function FeedRow({ item, people, userId, now, index }: { item: RoomFeedItem; people: People; userId: string; now: number; index: number }) {
  const { text, detail, who } = feedText(item, people, userId);
  const person = who[0] ? people.get(who[0]) : undefined;
  const roomWide = item.type === "milestone" || item.type === "goal";
  return (
    <li className="app-enter flex items-start gap-3 border-t py-2.5 first:border-t-0 first:pt-0" style={{ borderColor: "var(--app-border)", "--d": `${index * 30}ms` } as React.CSSProperties}>
      <span className="mt-0.5 shrink-0">
        {person ? (
          <Avatar name={person.displayName} colour={person.avatarColour} size={22} />
        ) : (
          <span
            aria-hidden="true"
            className="grid h-[22px] w-[22px] place-items-center rounded-full text-[11px]"
            style={{ background: roomWide ? "var(--app-gold-soft)" : "var(--app-surface-soft)", color: "var(--app-gold)" }}
          >
            ✦
          </span>
        )}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[13px] leading-snug" style={{ color: "var(--app-text-soft)" }}>{text}</p>
        {detail ? <p className="mt-0.5 text-[12px]" style={{ color: "var(--app-text-muted)" }}>{detail}</p> : null}
      </div>
      <time dateTime={item.at} className="shrink-0 text-[11.5px] tabular-nums" style={{ color: "var(--app-text-faint)" }}>
        {timeAgo(item.at, now)}
      </time>
    </li>
  );
}

/** The room's numbers, kept to one compact panel. */
function Insights({ room, members, now }: { room: StudyRoom; members: StudyRoomMember[]; now: number }) {
  const days = room.weekActivity ?? [];
  const max = Math.max(1, ...days.map((day) => day.seconds));
  const week = members.reduce((sum, member) => sum + periodSeconds(member, "week", now), 0);
  const today = members.reduce((sum, member) => sum + periodSeconds(member, "today", now), 0);
  const sessions = days.reduce((sum, day) => sum + day.sessions, 0);
  const busiest = days.reduce<(typeof days)[number] | null>((best, day) => (!best || day.seconds > best.seconds ? day : best), null);
  const colour = roomColour(room.colour);
  const weekday = (day: string) => new Date(`${day}T12:00:00Z`).toLocaleDateString([], { weekday: "short" });

  return (
    <div className="mt-3">
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-[12.5px] sm:grid-cols-4">
        <Fact label="Today" value={formatDuration(today)} />
        <Fact label="Past 7 days" value={formatDuration(week)} />
        <Fact label="Sessions" value={String(sessions)} />
        <Fact label="Busiest" value={busiest && busiest.seconds > 0 ? weekday(busiest.day) : "–"} />
      </dl>
      <div className="mt-4 grid h-20 grid-cols-7 items-end gap-1.5" aria-label="Focus per day, past 7 days">
        {days.map((day) => (
          <div key={day.day} className="flex h-full flex-col items-center justify-end gap-1" title={`${weekday(day.day)}: ${formatDuration(day.seconds)} across ${day.sessions} sessions`}>
            <div className="w-full rounded-sm" style={{ height: `${Math.max(day.seconds ? 6 : 2, (day.seconds / max) * 100)}%`, background: day.seconds ? colour : "var(--app-surface-soft)", transition: "height 600ms var(--ease-out-expo)" }} />
            <span className="text-[10.5px]" style={{ color: "var(--app-text-faint)" }}>{weekday(day.day).slice(0, 2)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt style={{ color: "var(--app-text-faint)" }}>{label}</dt>
      <dd className="mt-0.5 font-mono text-[14px] tabular-nums" style={{ color: "var(--app-text)" }}>{value}</dd>
    </div>
  );
}
