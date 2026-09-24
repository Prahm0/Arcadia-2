"use client";

import { useMemo, useState, type MouseEvent as ReactMouseEvent } from "react";
import type { StudyRoomMember } from "@/lib/api/rooms";
import type { CheerKind } from "@/shared/roomFeed";
import MemberFocusCard from "./MemberFocusCard";
import { byActivity, firstName, remainingSeconds } from "./format";

/** Joining makes sense while there's a real stretch of their session left. */
const JOIN_MIN_SECONDS_LEFT = 5 * 60;
// In a big room, a few idle people are enough to show; the rest fold away.
const IDLE_SHOWN = 3;
const FOLD_FROM = 7;

/**
 * The heart of the room: everyone in it, whoever is studying first, with the
 * people in a group session side by side.
 */
export default function LiveMembers({
  members,
  now,
  userId,
  youAreFocusing,
  cooldowns,
  subjectColour,
  onJoin,
  onCheer,
  onProfile,
  onMemberMenu,
}: {
  members: StudyRoomMember[];
  now: number;
  userId: string;
  youAreFocusing: boolean;
  cooldowns: Record<string, string>;
  subjectColour: (subject: string | null) => string | null;
  onJoin: (member: StudyRoomMember) => void;
  onCheer: (member: StudyRoomMember, kind: CheerKind) => Promise<void>;
  onProfile: (member: StudyRoomMember) => void;
  onMemberMenu: (event: ReactMouseEvent, member: StudyRoomMember) => void;
}) {
  const { ordered, groupOf, hostOfMember } = useMemo(() => {
    const focusing = new Set(members.filter((member) => member.activity === "focus").map((member) => member.userId));
    // Everyone in a group, keyed by host: host first, then whoever joined.
    const groups = new Map<string, string[]>();
    for (const member of members) {
      const host = member.groupHostId;
      if (member.activity !== "focus" || !host || !focusing.has(host) || host === member.userId) continue;
      groups.set(host, [...(groups.get(host) ?? [host]), member.userId]);
    }
    const hostOf = new Map<string, string>();
    groups.forEach((ids, host) => ids.forEach((id) => hostOf.set(id, host)));
    const sorted = [...members].sort(byActivity(now));
    // Pull each group together at its host's place in the order.
    const placed = new Set<string>();
    const out: StudyRoomMember[] = [];
    for (const member of sorted) {
      if (placed.has(member.userId)) continue;
      const host = hostOf.get(member.userId);
      const ids = host ? groups.get(host)! : [member.userId];
      for (const id of ids) {
        const found = members.find((item) => item.userId === id);
        if (found && !placed.has(id)) {
          out.push(found);
          placed.add(id);
        }
      }
    }
    const names = new Map(members.map((member) => [member.userId, member.displayName]));
    const groupOf = (id: string) => {
      const host = hostOf.get(id);
      return host ? groups.get(host)!.filter((other) => other !== id).map((other) => firstName(names.get(other) ?? "")) : [];
    };
    const hostOfMember = (id: string) => {
      const host = hostOf.get(id);
      return host && host !== id ? members.find((item) => item.userId === host) ?? null : null;
    };
    return { ordered: out, groupOf, hostOfMember };
    // `now` only changes the order of idle people by today's total; resorting
    // every second would shuffle cards under the pointer, so it's left out.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [members]);

  const [showAll, setShowAll] = useState(false);
  const idle = ordered.filter((member) => member.activity === "idle");
  const folded = !showAll && members.length >= FOLD_FROM && idle.length > IDLE_SHOWN ? idle.slice(IDLE_SHOWN) : [];
  const visible = folded.length ? ordered.filter((member) => !folded.includes(member)) : ordered;

  const focusingCount = members.filter((member) => member.activity === "focus").length;
  const breakCount = members.filter((member) => member.activity === "break").length;

  return (
    <section aria-labelledby="room-live-title">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 id="room-live-title" className="text-[15px] font-semibold" style={{ color: "var(--app-text)" }}>
          In the room
        </h2>
        <p className="text-[13px] tabular-nums" style={{ color: "var(--app-text-muted)" }}>
          {focusingCount === 0
            ? "No one's focusing right now"
            : `${focusingCount} focusing${breakCount ? ` · ${breakCount} on a break` : ""}`}
        </p>
      </div>
      <ul className="grid grid-cols-1 gap-3 @xl/main:grid-cols-2 @6xl/main:grid-cols-3">
        {visible.map((member, index) => {
          const left = remainingSeconds(member, now);
          return (
            <MemberFocusCard
              key={member.userId}
              index={index}
              member={member}
              now={now}
              isYou={member.userId === userId}
              subjectColour={subjectColour(member.subject)}
              groupNames={groupOf(member.userId)}
              clockFrom={hostOfMember(member.userId)}
              cooldownUntil={cooldowns[member.userId] ? Date.parse(cooldowns[member.userId]) : null}
              canJoin={!youAreFocusing && member.activity === "focus" && left !== null && left > JOIN_MIN_SECONDS_LEFT}
              onJoin={() => onJoin(member)}
              onCheer={(kind) => onCheer(member, kind)}
              onProfile={() => onProfile(member)}
              onContextMenu={(event) => onMemberMenu(event, member)}
            />
          );
        })}
      </ul>
      {folded.length || (showAll && members.length >= FOLD_FROM && idle.length > IDLE_SHOWN) ? (
        <button
          type="button"
          onClick={() => setShowAll((value) => !value)}
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg py-2.5 text-[12.5px] font-medium ui-hover"
          style={{ color: "var(--app-text-muted)", boxShadow: "var(--elev-inset)" }}
        >
          {showAll ? "Show fewer" : `${folded.length} more not studying right now`}
        </button>
      ) : null}
    </section>
  );
}
