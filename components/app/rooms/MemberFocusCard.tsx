"use client";

import type { MouseEvent as ReactMouseEvent } from "react";
import type { StudyRoomMember } from "@/lib/api/rooms";
import type { CheerKind } from "@/shared/roomFeed";
import { cn } from "@/lib/cn";
import { SubjectTag } from "../cards/shared";
import CheerButton from "./CheerButton";
import { ConstellationMark, LIVE, MemberAvatar } from "./MemberAvatar";
import { elapsedSeconds, formatClock, formatDuration, periodSeconds, remainingSeconds } from "./format";

/**
 * One person in the room. Someone focusing gets the live treatment: a ring
 * that fills as their session goes, a ticking clock, what they're on, and a
 * way to cheer them or join in. Everyone else is a quiet line about today.
 */
export default function MemberFocusCard({
  member,
  now,
  isYou,
  subjectColour,
  groupNames,
  clockFrom,
  cooldownUntil,
  canJoin,
  onJoin,
  onCheer,
  onProfile,
  onContextMenu,
  index = 0,
}: {
  member: StudyRoomMember;
  now: number;
  isYou: boolean;
  subjectColour?: string | null;
  /** Everyone else in this member's group session, if they're in one. */
  groupNames?: string[];
  /** In a group, everyone shows the host's clock so the timers read as one. */
  clockFrom?: StudyRoomMember | null;
  cooldownUntil: number | null;
  canJoin: boolean;
  onJoin: () => void;
  onCheer: (kind: CheerKind) => Promise<void>;
  onProfile: () => void;
  onContextMenu: (event: ReactMouseEvent) => void;
  index?: number;
}) {
  const focusing = member.activity === "focus";
  const onBreak = member.activity === "break";
  const clock = clockFrom ?? member;
  const elapsed = elapsedSeconds(clock, now);
  const left = remainingSeconds(clock, now);
  const progress = clock.durationSeconds ? elapsed / clock.durationSeconds : null;
  const today = periodSeconds(member, "today", now);
  const cheers = member.sessionCheers ?? 0;

  return (
    <li
      onContextMenu={onContextMenu}
      className="app-enter group relative flex min-h-[132px] flex-col gap-3 rounded-lg p-4 transition-[box-shadow,background-color] duration-500"
      style={{
        "--d": `${Math.min(index, 8) * 40}ms`,
        background: focusing
          ? `linear-gradient(180deg, color-mix(in oklab, ${LIVE} 7%, var(--app-surface)) 0%, var(--app-surface) 70%)`
          : "var(--app-surface)",
        boxShadow: focusing
          ? `0 0 0 1px color-mix(in oklab, ${LIVE} 32%, var(--app-border)), 0 6px 18px -10px color-mix(in oklab, ${LIVE} 55%, transparent)`
          : "var(--elev-1)",
      } as React.CSSProperties}
    >
      {member.constellation ? (
        <span className="pointer-events-auto absolute right-3 top-3">
          <ConstellationMark id={member.constellation.id} cards={member.constellation.cards} live={focusing} size={34} />
        </span>
      ) : null}

      <div className="flex items-center gap-3 pr-9">
        <MemberAvatar
          name={member.displayName}
          colour={member.avatarColour}
          developer={member.developerAccess}
          size={38}
          focusing={focusing}
          onBreak={onBreak}
          progress={progress}
        />
        <div className="min-w-0">
          <button
            type="button"
            onClick={onProfile}
            className="block max-w-full truncate text-left text-[14.5px] font-semibold tracking-[-0.01em] underline-offset-2 hover:underline"
            style={{ color: "var(--app-text)" }}
          >
            {member.displayName}
            {isYou ? <span className="ml-1.5 text-[11.5px] font-normal" style={{ color: "var(--app-text-muted)" }}>you</span> : null}
          </button>
          <StatusWord activity={member.activity} />
        </div>
      </div>

      {focusing ? (
        <>
          <div className="flex items-end justify-between gap-3">
            <div className="min-w-0">
              {member.subject ? <SubjectTag size="sm" subject={{ name: member.subject, colour: subjectColour ?? "" }} /> : null}
              <p className="mt-1 truncate text-[12px] tabular-nums" style={{ color: "var(--app-text-muted)" }}>
                {[
                  groupNames?.length ? `With ${groupNames.join(", ")}` : null,
                  left !== null ? `${Math.ceil(left / 60)} min left` : `${formatDuration(today)} today`,
                  cheers > 0 ? `👏 ${cheers}` : null,
                ].filter(Boolean).join(" · ")}
              </p>
            </div>
            <p
              className="shrink-0 font-mono text-[24px] leading-none tabular-nums tracking-[-0.02em]"
              style={{ color: "var(--app-text)" }}
              aria-label={`${Math.floor(elapsed / 60)} minutes in`}
            >
              {formatClock(elapsed)}
            </p>
          </div>
          {!isYou ? (
            <div className="mt-auto flex items-center justify-end gap-1.5">
              {canJoin ? (
                <button
                  type="button"
                  onClick={onJoin}
                  className="ui-press inline-flex h-8 items-center whitespace-nowrap rounded-md px-3 text-[12.5px] font-medium hover:bg-[color-mix(in_oklab,var(--app-text)_6%,transparent)]"
                  style={{ color: "var(--app-text-soft)", boxShadow: "var(--elev-inset)" }}
                  title={`Start a session that ends with ${member.displayName}'s`}
                >
                  Join
                </button>
              ) : null}
              <CheerButton name={member.displayName} cooldownUntil={cooldownUntil} onSend={onCheer} />
            </div>
          ) : null}
        </>
      ) : (
        <div className="mt-auto flex items-end justify-between gap-3">
          <p className="text-[12.5px] tabular-nums" style={{ color: "var(--app-text-muted)" }}>
            {onBreak
              ? left !== null ? `Back in ${Math.max(1, Math.ceil(left / 60))} min` : "Taking a breather"
              : today > 0 ? `Studied ${formatDuration(today)} today` : "Not started today"}
          </p>
          {onBreak && !isYou ? <CheerButton size="sm" name={member.displayName} cooldownUntil={cooldownUntil} onSend={onCheer} /> : null}
        </div>
      )}
    </li>
  );
}

/** Focusing, On a break, Idle: the word carries the state, no dot. */
export function StatusWord({ activity }: { activity: StudyRoomMember["activity"] }) {
  if (activity === "focus") {
    return (
      <span
        className={cn("mt-1 inline-flex items-center rounded-[4px] px-1.5 py-px text-[11.5px] font-medium")}
        style={{
          color: `color-mix(in oklab, ${LIVE} 80%, var(--app-text))`,
          boxShadow: `inset 0 0 0 1px color-mix(in oklab, ${LIVE} 40%, transparent)`,
          background: `color-mix(in oklab, ${LIVE} 8%, transparent)`,
        }}
      >
        Focusing
      </span>
    );
  }
  return (
    <span className="mt-0.5 block text-[12px]" style={{ color: activity === "break" ? "var(--app-text-muted)" : "var(--app-text-faint)" }}>
      {activity === "break" ? "On a break" : "Idle"}
    </span>
  );
}
