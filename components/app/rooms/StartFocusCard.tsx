"use client";

import Link from "next/link";
import { useState } from "react";
import type { PlannerEvent, DashboardResponse } from "@/lib/api/types";
import type { StudyRoomMember } from "@/lib/api/rooms";
import { studyTitle, subjectColour } from "@/lib/app/subjectColour";
import { cn } from "@/lib/cn";
import AppButton from "../AppButton";
import { SubjectTag } from "../cards/shared";
import { AvatarStack } from "./MemberAvatar";
import { firstName, listNames, remainingSeconds } from "./format";

const LENGTHS = [
  { key: "25", minutes: 25, pro: false },
  { key: "45", minutes: 45, pro: true },
  { key: "60", minutes: 60, pro: true },
  { key: "custom", minutes: null, pro: true },
] as const;
type LengthKey = (typeof LENGTHS)[number]["key"];

const CUSTOM_KEY = "arcadia:room-focus:custom";

function readCustom(): number {
  try {
    const value = Number(window.localStorage.getItem(CUSTOM_KEY));
    return Number.isFinite(value) && value >= 5 && value <= 240 ? value : 30;
  } catch {
    return 30;
  }
}

/**
 * The room's call to action when you aren't studying: who's already at it,
 * one big button, a length and what it's for. Your next planned block and the
 * session you could join sit underneath, each one tap away.
 */
export default function StartFocusCard({
  subjects,
  defaultSubject,
  paidPlan,
  nextTask,
  others,
  now,
  onStart,
  onJoin,
}: {
  subjects: DashboardResponse["subjects"];
  defaultSubject: string;
  paidPlan: boolean;
  nextTask: PlannerEvent | null;
  /** Everyone else focusing right now. */
  others: StudyRoomMember[];
  now: number;
  onStart: (options: { minutes: number; subject: string; topic?: string | null; eventId?: string | null }) => void;
  onJoin: (member: StudyRoomMember) => void;
}) {
  const [length, setLength] = useState<LengthKey>("25");
  const [custom, setCustom] = useState<number>(() => (typeof window === "undefined" ? 30 : readCustom()));
  const [subject, setSubject] = useState(defaultSubject);
  const locked = (pro: boolean) => pro && !paidPlan;
  const minutes = length === "custom" ? custom : Number(length);

  // The session with the most time left is the one worth joining.
  const joinable = others
    .filter((member) => (remainingSeconds(member, now) ?? 0) > 5 * 60)
    .sort((a, b) => (remainingSeconds(b, now) ?? 0) - (remainingSeconds(a, now) ?? 0))[0];

  const taskMinutes = nextTask ? Math.round((Date.parse(nextTask.endAt) - Date.parse(nextTask.startAt)) / 60000) : 0;

  return (
    <section
      aria-labelledby="room-start-title"
      className="rounded-lg p-5"
      style={{ background: "var(--app-surface)", boxShadow: "var(--elev-1)" }}
    >
      <h2 id="room-start-title" className="text-[20px] font-semibold tracking-[-0.02em]" style={{ color: "var(--app-text)" }}>
        Ready to focus?
      </h2>
      {others.length ? (
        <div className="mt-2 flex items-center gap-2">
          <AvatarStack people={others} size={20} />
          <p className="min-w-0 text-[13px]" style={{ color: "var(--app-text-muted)" }}>
            {others.length > 3
              ? `${firstName(others[0].displayName)} and ${others.length - 1} others are studying`
              : `${listNames(others.map((member) => firstName(member.displayName)))} ${others.length === 1 ? "is" : "are"} studying`}
          </p>
        </div>
      ) : (
        <p className="mt-1 text-[13px]" style={{ color: "var(--app-text-muted)" }}>
          Start a session and the room sees you studying.
        </p>
      )}

      <button
        type="button"
        onClick={() => onStart({ minutes, subject })}
        className="ui-press mt-4 flex h-11 w-full items-center justify-center gap-2 rounded-md text-[14.5px] font-semibold shadow-[0_1px_2px_rgba(var(--shadow-rgb),0.12)] hover:bg-[var(--app-accent-strong)]"
        style={{ background: "var(--app-accent)", color: "var(--app-accent-on)" }}
      >
        <svg aria-hidden="true" viewBox="0 0 16 16" width="13" height="13" fill="currentColor"><path d="M4.5 2.8v10.4a.6.6 0 0 0 .9.5l8.3-5.2a.6.6 0 0 0 0-1L5.4 2.3a.6.6 0 0 0-.9.5Z" /></svg>
        Start {minutes}-minute session
      </button>

      <div className="mt-3 grid grid-cols-4 gap-1 rounded-md p-1" role="radiogroup" aria-label="Session length" style={{ background: "var(--app-surface-soft)" }}>
        {LENGTHS.map((option) => {
          const isLocked = locked(option.pro);
          const active = length === option.key;
          const label = option.minutes ? `${option.minutes}m` : "Custom";
          return isLocked ? (
            <Link
              key={option.key}
              href="/app/pricing"
              className="flex h-8 items-center justify-center gap-1 rounded-[5px] text-[12.5px] font-medium ui-hover"
              style={{ color: "var(--app-text-faint)" }}
              title="Longer sessions come with Pro"
            >
              {label}
              <span className="rounded-full px-1.5 text-[10px] font-semibold leading-[1.5]" style={{ background: "var(--app-arcad-soft)", color: "var(--app-arcad-strong)" }}>Pro</span>
            </Link>
          ) : (
            <button
              key={option.key}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => setLength(option.key)}
              className={cn("h-8 rounded-[5px] text-[12.5px] font-medium tabular-nums transition-[background-color,box-shadow] duration-150", !active && "ui-hover")}
              style={{
                background: active ? "var(--app-surface)" : "transparent",
                boxShadow: active ? "var(--elev-1)" : undefined,
                color: active ? "var(--app-text)" : "var(--app-text-muted)",
              }}
            >
              {label}
            </button>
          );
        })}
      </div>
      {length === "custom" ? (
        <label className="mt-2 flex items-center gap-2 text-[12.5px]" style={{ color: "var(--app-text-muted)" }}>
          <input
            type="number"
            min={5}
            max={240}
            step={5}
            value={custom}
            onChange={(event) => {
              const value = Math.min(240, Math.max(5, Math.round(Number(event.target.value) || 5)));
              setCustom(value);
              try {
                window.localStorage.setItem(CUSTOM_KEY, String(value));
              } catch {
                /* remembered for this visit only */
              }
            }}
            className="w-20 rounded-md px-2.5 py-1.5 text-[13px] tabular-nums outline-none"
            style={{ background: "var(--app-surface-soft)", boxShadow: "var(--elev-inset)", color: "var(--app-text)" }}
          />
          minutes
        </label>
      ) : null}

      <label className="mt-3 flex items-center gap-2 text-[12.5px]" style={{ color: "var(--app-text-muted)" }}>
        <span className="shrink-0">Working on</span>
        <select
          value={subject}
          onChange={(event) => setSubject(event.target.value)}
          className="min-w-0 flex-1 rounded-md px-2.5 py-1.5 text-[13px] outline-none"
          style={{ background: "var(--app-surface-soft)", boxShadow: "var(--elev-inset)", color: "var(--app-text)" }}
        >
          {subjects.map((item) => <option key={item.id} value={item.name}>{item.name}</option>)}
          {subjects.some((item) => item.name === "General") ? null : <option value="General">General</option>}
        </select>
      </label>

      {nextTask ? (
        <div className="mt-5 border-t pt-4" style={{ borderColor: "var(--app-border)" }}>
          <p className="text-[12px] font-medium" style={{ color: "var(--app-text-faint)" }}>Next task</p>
          <div className="mt-2">
            <SubjectTag size="sm" subject={{ name: nextTask.subject ?? "Study", colour: subjectColour(subjects, nextTask.subject) ?? "" }} />
          </div>
          {studyTitle(nextTask) !== nextTask.subject ? (
            <p className="mt-1.5 text-[14.5px] font-medium leading-snug" style={{ color: "var(--app-text)" }}>
              {studyTitle(nextTask)}
            </p>
          ) : null}
          <p className="mt-0.5 text-[12.5px] tabular-nums" style={{ color: "var(--app-text-muted)" }}>Planned {taskMinutes} min</p>
          <AppButton
            className="mt-3 w-full"
            onClick={() => onStart({ minutes: taskMinutes, subject: nextTask.subject || subject, topic: nextTask.plan?.topic ?? nextTask.title, eventId: nextTask.id })}
          >
            Start in this room
          </AppButton>
        </div>
      ) : null}

      {joinable ? (
        <div className="mt-4 flex items-center justify-between gap-3 rounded-md px-3 py-2.5" style={{ background: "var(--app-surface-soft)" }}>
          <p className="min-w-0 text-[12.5px]" style={{ color: "var(--app-text-soft)" }}>
            Join {firstName(joinable.displayName)}&apos;s session
            <span className="block tabular-nums" style={{ color: "var(--app-text-muted)" }}>
              {Math.ceil((remainingSeconds(joinable, now) ?? 0) / 60)} min left, you finish together
            </span>
          </p>
          <AppButton size="sm" onClick={() => onJoin(joinable)}>Join</AppButton>
        </div>
      ) : null}
    </section>
  );
}
