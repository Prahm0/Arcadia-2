"use client";

import { useEffect, useRef, useState } from "react";
import type { RoomCheers, StudyRoomMember } from "@/lib/api/rooms";
import { CHEERS } from "@/shared/roomFeed";
import { Avatar } from "../profile/ui";
import { firstName } from "./format";

const SEEN_KEY = "arcadia:room-cheers-seen:";
const SHOW_MS = 5000;

interface Toast {
  id: string;
  name: string;
  colour: string | null;
  emoji: string;
}

function readSeen(code: string): Set<string> {
  try {
    return new Set(JSON.parse(window.sessionStorage.getItem(SEEN_KEY + code) ?? "[]") as string[]);
  } catch {
    return new Set();
  }
}

function writeSeen(code: string, seen: Set<string>) {
  try {
    window.sessionStorage.setItem(SEEN_KEY + code, JSON.stringify([...seen].slice(-100)));
  } catch {
    /* a reload may show a cheer twice; harmless */
  }
}

/**
 * "Josh cheered you on 🔥": a small card in the corner that drops in, stays a
 * few seconds and goes. Never a modal, never a sound.
 */
export default function CheerToasts({ code, cheers, members }: { code: string; cheers: RoomCheers["received"]; members: StudyRoomMember[] }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  // Hide timers outlive the next poll; they only stop when the room closes.
  const timers = useRef<number[]>([]);
  useEffect(() => {
    const pending = timers.current;
    return () => pending.forEach((id) => window.clearTimeout(id));
  }, []);

  useEffect(() => {
    if (!cheers.length) return;
    const seen = readSeen(code);
    const fresh = cheers.filter((cheer) => !seen.has(cheer.id)).slice(0, 3).reverse();
    if (!fresh.length) return;
    fresh.forEach((cheer) => seen.add(cheer.id));
    writeSeen(code, seen);
    const people = new Map(members.map((member) => [member.userId, member]));
    const added = fresh.map((cheer) => {
      const from = people.get(cheer.fromUserId);
      return { id: cheer.id, name: firstName(from?.displayName ?? "Someone"), colour: from?.avatarColour ?? null, emoji: CHEERS[cheer.kind]?.emoji ?? "👏" };
    });
    timers.current.push(
      window.setTimeout(() => setToasts((current) => [...current, ...added].slice(-3)), 0),
      window.setTimeout(() => setToasts((current) => current.filter((toast) => !added.some((item) => item.id === toast.id))), SHOW_MS),
    );
    // Members only supply names; a new poll with the same cheers is a no-op.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cheers, code]);

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed right-4 top-[calc(env(safe-area-inset-top,0px)+64px)] z-40 flex flex-col items-end gap-2 lg:right-6 lg:top-14"
    >
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className="room-cheer-in pointer-events-auto flex items-center gap-2.5 rounded-full py-1.5 pl-1.5 pr-4 text-[13px]"
          style={{ background: "var(--app-elev)", boxShadow: "var(--elev-2)", color: "var(--app-text)" }}
        >
          <Avatar name={toast.name} colour={toast.colour} size={26} />
          <span>
            <strong className="font-semibold">{toast.name}</strong> cheered you on
          </span>
          <span className="app-pop text-[17px] leading-none" aria-hidden="true">{toast.emoji}</span>
        </div>
      ))}
    </div>
  );
}
