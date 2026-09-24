"use client";

import Link from "next/link";
import type { MouseEvent as ReactMouseEvent } from "react";
import type { StudyRoom, StudyRoomMember } from "@/lib/api/rooms";
import AppButton from "../AppButton";
import { copyText, showContextMenu, type ContextMenuEntry } from "../ContextMenu";
import PageTour from "../tour/PageTour";
import { AvatarStack, LIVE } from "./MemberAvatar";
import { byActivity, formatHours, periodSeconds } from "./format";

/**
 * The top of a room, kept to one compact block: its name, who's in it, how
 * many are studying and how much the room has done this week. Invite and the
 * rest live in menus rather than a row of buttons.
 */
export default function RoomHeader({
  room,
  members,
  now,
  isOwner,
  width,
  onSettings,
  onLeave,
}: {
  room: StudyRoom;
  members: StudyRoomMember[];
  now: number;
  isOwner: boolean;
  width: number;
  onSettings: () => void;
  onLeave: () => void;
}) {
  const studying = members.filter((member) => member.activity === "focus").length;
  const week = members.reduce((sum, member) => sum + periodSeconds(member, "week", now), 0);
  const link = () => `${window.location.origin}/app/rooms/${room.code}`;

  const inviteEntries = (): ContextMenuEntry[] => [
    { kind: "label", label: `Code ${room.code}` },
    { kind: "item", label: "Copy invite link", onSelect: () => void copyText(link(), "Link copied") },
    { kind: "item", label: "Copy room code", onSelect: () => void copyText(room.code, "Code copied") },
    typeof navigator !== "undefined" && "share" in navigator
      ? {
          kind: "item",
          label: "Share…",
          onSelect: () => void navigator.share({ title: room.name, text: `Study with me in ${room.name} on Arcadia`, url: link() }).catch(() => {}),
        }
      : null,
  ];

  const moreEntries = (): ContextMenuEntry[] => [
    { kind: "item", label: "Copy invite link", onSelect: () => void copyText(link(), "Link copied") },
    { kind: "item", label: "Copy room code", onSelect: () => void copyText(room.code, "Code copied") },
    isOwner ? { kind: "separator" } : null,
    isOwner ? { kind: "item", label: "Room settings", onSelect: onSettings } : null,
    { kind: "separator" },
    { kind: "item", label: "Leave room", danger: true, onSelect: onLeave },
  ];

  const open = (entries: () => ContextMenuEntry[], label: string) => (event: ReactMouseEvent) => showContextMenu(event, entries(), label);

  return (
    <header className="mx-auto w-full px-6 pb-2 pt-8 sm:px-10 sm:pt-10" style={{ maxWidth: width }}>
      <Link href="/app/rooms" className="text-[12.5px] font-medium hover:underline" style={{ color: "var(--app-text-muted)" }}>
        Rooms
      </Link>
      <div className="mt-1 flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          <h1 className="text-[30px] font-semibold leading-[1.1] tracking-[-0.03em]" style={{ color: "var(--app-text)" }}>
            {room.icon ? <span className="mr-2" aria-hidden="true">{room.icon}</span> : null}
            {room.name}
          </h1>
          <p className="mt-1 text-[14px]" style={{ color: "var(--app-text-muted)" }}>
            {room.description || "A place to study together"}
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <PageTour id="rooms" />
          <AppButton variant="secondary" onClick={open(inviteEntries, "Invite to room")} aria-haspopup="menu">
            <svg aria-hidden="true" viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M8 3v10M3 8h10" /></svg>
            Invite
          </AppButton>
          {isOwner ? (
            <button type="button" onClick={onSettings} aria-label="Room settings" title="Room settings" className="grid h-8 w-8 place-items-center rounded-md ui-hover" style={{ color: "var(--app-text-muted)" }}>
              <svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true">
                <circle cx="10" cy="10" r="2.4" />
                <path d="M10 2.5v2M10 15.5v2M17.5 10h-2M4.5 10h-2M15.3 4.7l-1.4 1.4M6.1 13.9l-1.4 1.4M15.3 15.3l-1.4-1.4M6.1 6.1 4.7 4.7" strokeLinecap="round" />
              </svg>
            </button>
          ) : null}
          <button type="button" onClick={open(moreEntries, "Room menu")} aria-label="More room actions" aria-haspopup="menu" className="grid h-8 w-8 place-items-center rounded-md ui-hover" style={{ color: "var(--app-text-muted)" }}>
            <svg viewBox="0 0 20 20" width="16" height="16" fill="currentColor" aria-hidden="true"><circle cx="4.5" cy="10" r="1.4" /><circle cx="10" cy="10" r="1.4" /><circle cx="15.5" cy="10" r="1.4" /></svg>
          </button>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2">
        <AvatarStack people={[...members].sort(byActivity(now))} size={26} max={7} />
        <p className="text-[13.5px] tabular-nums" style={{ color: "var(--app-text-muted)" }}>
          <span style={{ color: studying ? `color-mix(in oklab, ${LIVE} 80%, var(--app-text))` : undefined, fontWeight: studying ? 600 : undefined }}>
            {studying} studying
          </span>
          {" · "}
          {room.memberCount} {room.memberCount === 1 ? "member" : "members"}
          {" · "}
          {formatHours(week)} this week
        </p>
      </div>
    </header>
  );
}
