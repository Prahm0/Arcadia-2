"use client";

import Link from "next/link";
import type { StudyRoomMember } from "@/lib/api/rooms";
import AppButton from "../AppButton";
import { SubjectTag } from "../cards/shared";
import { AvatarStack, LIVE } from "./MemberAvatar";
import { StatusWord } from "./MemberFocusCard";
import { firstName, formatClock, listNames } from "./format";

/**
 * Your session, in the room. The clock counts down to the end; below it,
 * who's studying alongside you, which is the point of doing it here.
 */
export default function ActiveFocusCard({
  remaining,
  total,
  subject,
  subjectColour,
  topic,
  hostName,
  others,
  cheers,
  finishing,
  onFinish,
}: {
  remaining: number;
  total: number;
  subject: string;
  subjectColour: string | null;
  topic: string | null;
  /** Set when you joined someone's session. */
  hostName: string | null;
  others: StudyRoomMember[];
  cheers: number;
  finishing?: boolean;
  onFinish: () => void;
}) {
  const progress = total > 0 ? Math.min(1, Math.max(0, 1 - remaining / total)) : 0;
  return (
    <section
      aria-labelledby="room-active-title"
      className="app-enter rounded-lg p-5"
      style={{
        background: `linear-gradient(180deg, color-mix(in oklab, ${LIVE} 8%, var(--app-surface)) 0%, var(--app-surface) 60%)`,
        boxShadow: `0 0 0 1px color-mix(in oklab, ${LIVE} 30%, var(--app-border)), 0 10px 28px -16px color-mix(in oklab, ${LIVE} 60%, transparent)`,
      }}
    >
      <div className="flex items-center justify-between gap-3">
        <h2 id="room-active-title" className="sr-only">Your focus session</h2>
        <StatusWord activity="focus" />
        {hostName ? (
          <span className="text-[12px]" style={{ color: "var(--app-text-muted)" }}>
            With {firstName(hostName)}
          </span>
        ) : null}
      </div>
      <p
        className="mt-3 font-mono text-[46px] leading-none tabular-nums tracking-[-0.03em]"
        style={{ color: "var(--app-text)" }}
        role="timer"
        aria-label={`${Math.ceil(remaining / 60)} minutes left`}
      >
        {formatClock(remaining)}
      </p>
      <div className="mt-3 h-1 overflow-hidden rounded-full" style={{ background: "var(--app-surface-soft)" }} aria-hidden="true">
        <div className="h-full rounded-full" style={{ width: `${progress * 100}%`, background: LIVE, transition: "width 900ms linear" }} />
      </div>
      <p className="mt-1.5 text-[12px] tabular-nums" style={{ color: "var(--app-text-faint)" }}>
        {Math.round(total / 60)} min session{cheers > 0 ? ` · ${cheers} ${cheers === 1 ? "cheer" : "cheers"} so far` : ""}
      </p>

      <div className="mt-4">
        <SubjectTag subject={{ name: subject, colour: subjectColour ?? "" }} />
        {topic ? (
          <p className="mt-1.5 text-[14.5px] font-medium leading-snug" style={{ color: "var(--app-text)" }}>{topic}</p>
        ) : null}
      </div>

      <AppButton className="mt-4 w-full" onClick={onFinish} loading={finishing}>
        Finish session
      </AppButton>

      <div className="mt-4 flex items-center gap-2">
        {others.length ? (
          <>
            <AvatarStack people={others} size={20} />
            <p className="min-w-0 text-[12.5px]" style={{ color: "var(--app-text-muted)" }}>
              {others.length > 3
                ? `${firstName(others[0].displayName)} and ${others.length - 1} others are studying with you`
                : `${listNames(others.map((member) => firstName(member.displayName)))} ${others.length === 1 ? "is" : "are"} studying with you`}
            </p>
          </>
        ) : (
          <p className="text-[12.5px]" style={{ color: "var(--app-text-muted)" }}>
            You&apos;re first in. The room can see you studying.
          </p>
        )}
      </div>
    </section>
  );
}

/** You're focusing, but on a timer started outside this room (another tab or device). */
export function ElsewhereFocusCard({ member, elapsed }: { member: StudyRoomMember; elapsed: number }) {
  return (
    <section className="rounded-lg p-5" style={{ background: "var(--app-surface)", boxShadow: "var(--elev-1)" }} aria-label="Your focus session">
      <StatusWord activity={member.activity} />
      <p className="mt-3 font-mono text-[34px] leading-none tabular-nums tracking-[-0.03em]" style={{ color: "var(--app-text)" }}>
        {formatClock(elapsed)}
      </p>
      <p className="mt-2 text-[13px]" style={{ color: "var(--app-text-muted)" }}>
        A timer is running on the Focus page or another device{member.subject ? ` · ${member.subject}` : ""}. The room sees it.
      </p>
      <Link href="/app/focus" className="mt-3 inline-block text-[12.5px] font-medium underline underline-offset-4" style={{ color: "var(--app-text)" }}>
        Open the timer →
      </Link>
    </section>
  );
}
