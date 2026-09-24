"use client";

import { useEffect, useState } from "react";
import {
  getRoomMemberProfile,
  updateRoom,
  type RoomDashboard,
  type RoomMemberProfile,
  type StudyRoomMember,
} from "@/lib/api/rooms";
import { ROOM_COLOURS } from "@/lib/app/roomColours";
import AppButton from "./AppButton";
import { Avatar, DeveloperTag, Sheet } from "./profile/ui";
import { ConstellationMark } from "./rooms/MemberAvatar";
import { StatusWord } from "./rooms/MemberFocusCard";
import { formatDuration } from "./rooms/format";

type MemberRoom = Extract<RoomDashboard, { isMember: true }>;

const FIELD = { background: "var(--app-surface-soft)", boxShadow: "var(--elev-inset)", color: "var(--app-text)" } as const;

/** Owner-only: name, look, shared goals and who's been removed. */
export function RoomSettingsSheet({ open, onClose, code, room, removedMembers, isPaid, onSaved, onAllow }: {
  open: boolean;
  onClose: () => void;
  code: string;
  room: MemberRoom["room"];
  removedMembers: MemberRoom["removedMembers"];
  isPaid: boolean;
  onSaved: (dashboard: RoomDashboard) => void;
  onAllow: (userId: string) => void;
}) {
  return (
    <Sheet open={open} eyebrow="Room settings" title={room.name} onClose={onClose}>
      {/* Mounted only while open, so each visit starts from the saved room. */}
      <RoomSettingsForm code={code} room={room} isPaid={isPaid} onSaved={(dashboard) => { onSaved(dashboard); onClose(); }} />
      {removedMembers.length > 0 ? (
        <div className="mt-6 border-t pt-5" style={{ borderColor: "var(--app-border)" }}>
          <p className="text-[13.5px] font-medium" style={{ color: "var(--app-text)" }}>Removed members</p>
          <p className="mt-1 text-[12px]" style={{ color: "var(--app-text-muted)" }}>Allow someone back in if you want them to use the room code again.</p>
          <ul className="mt-3 flex flex-col gap-2">
            {removedMembers.map((member) => (
              <li key={member.userId} className="flex items-center justify-between gap-3 rounded-md px-3 py-2" style={{ background: "var(--app-surface-soft)" }}>
                <span className="text-[13px]" style={{ color: "var(--app-text)" }}>{member.displayName}</span>
                <AppButton variant="ghost" onClick={() => onAllow(member.userId)}>Allow back</AppButton>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </Sheet>
  );
}

function RoomSettingsForm({ code, room, isPaid, onSaved }: {
  code: string;
  room: MemberRoom["room"];
  isPaid: boolean;
  onSaved: (dashboard: RoomDashboard) => void;
}) {
  const [name, setName] = useState(room.name);
  const [description, setDescription] = useState(room.description);
  const [colour, setColour] = useState(room.colour);
  const [icon, setIcon] = useState(room.icon);
  const [dailyHours, setDailyHours] = useState(room.dailyGoalMinutes ? String(room.dailyGoalMinutes / 60) : "");
  const [goalHours, setGoalHours] = useState(room.weeklyGoalMinutes ? String(room.weeklyGoalMinutes / 60) : "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      onSaved(await updateRoom(code, {
        name, description, colour,
        ...(isPaid
          ? {
              icon,
              weeklyGoalMinutes: goalHours ? Math.round(Number(goalHours) * 60) : null,
              dailyGoalMinutes: dailyHours ? Math.round(Number(dailyHours) * 60) : null,
            }
          : {}),
      }));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Couldn't save room settings.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={save}>
      <label className="block text-[12.5px] font-medium" style={{ color: "var(--app-text-muted)" }}>Name
        <input value={name} onChange={(event) => setName(event.target.value)} required maxLength={60} className="mt-1.5 block w-full rounded-md px-3 py-2.5 text-[14px] outline-none" style={FIELD} />
      </label>
      <label className="mt-4 block text-[12.5px] font-medium" style={{ color: "var(--app-text-muted)" }}>Description
        <textarea value={description} onChange={(event) => setDescription(event.target.value)} maxLength={300} rows={2} placeholder="A place to study together" className="mt-1.5 block w-full rounded-md px-3 py-2.5 text-[14px] outline-none" style={FIELD} />
      </label>
      <fieldset className="mt-4">
        <legend className="text-[12.5px] font-medium" style={{ color: "var(--app-text-muted)" }}>Colour</legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {Object.entries(ROOM_COLOURS).map(([key, hex]) => (
            <label
              key={key}
              className="cursor-pointer rounded-md px-3 py-1.5 text-[12.5px] capitalize"
              style={{
                color: colour === key ? `color-mix(in oklab, ${hex} 70%, var(--app-text))` : "var(--app-text-soft)",
                background: colour === key ? `color-mix(in oklab, ${hex} 13%, transparent)` : "var(--app-surface-soft)",
                boxShadow: colour === key ? `inset 0 0 0 1px ${hex}` : "var(--elev-inset)",
              }}
            >
              <input type="radio" name="room-colour" value={key} checked={colour === key} onChange={() => setColour(key)} className="sr-only" />
              {key}
            </label>
          ))}
        </div>
      </fieldset>
      {isPaid ? (
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <label className="block text-[12.5px] font-medium" style={{ color: "var(--app-text-muted)" }}>Icon
            <select value={icon} onChange={(event) => setIcon(event.target.value)} className="mt-1.5 block w-full rounded-md px-3 py-2.5 text-[14px] outline-none" style={FIELD}>
              {["", "📚", "🎯", "🧪", "✏️", "🌙", "⚡"].map((value) => <option key={value} value={value}>{value || "None"}</option>)}
            </select>
          </label>
          <label className="block text-[12.5px] font-medium" style={{ color: "var(--app-text-muted)" }}>Daily goal · hours
            <input type="number" min={0.5} max={300} step={0.5} value={dailyHours} onChange={(event) => setDailyHours(event.target.value)} placeholder="None" className="mt-1.5 block w-full rounded-md px-3 py-2.5 text-[14px] outline-none" style={FIELD} />
          </label>
          <label className="block text-[12.5px] font-medium" style={{ color: "var(--app-text-muted)" }}>7-day goal · hours
            <input type="number" min={1} max={1000} step={1} value={goalHours} onChange={(event) => setGoalHours(event.target.value)} placeholder="None" className="mt-1.5 block w-full rounded-md px-3 py-2.5 text-[14px] outline-none" style={FIELD} />
          </label>
        </div>
      ) : (
        <p className="mt-4 text-[12.5px]" style={{ color: "var(--app-text-muted)" }}>Pro adds a room icon and shared daily and 7-day goals.</p>
      )}
      {error ? <p className="mt-3 text-[12.5px]" style={{ color: "var(--app-danger)" }}>{error}</p> : null}
      <div className="mt-5"><AppButton type="submit" variant="primary" loading={saving}>Save room</AppButton></div>
    </form>
  );
}

/** A room member's card: how they're doing and what they've collected. */
export function RoomMemberProfileSheet({ code, member, isYou, canRemove, onRemove, onClose }: {
  code: string;
  member: StudyRoomMember | null;
  isYou: boolean;
  canRemove: boolean;
  onRemove: (member: StudyRoomMember) => void;
  onClose: () => void;
}) {
  return (
    <Sheet open={member !== null} eyebrow={isYou ? "You, in this room" : "Room member"} title={member?.displayName ?? ""} onClose={onClose}>
      {member ? <MemberProfile key={member.userId} code={code} member={member} canRemove={canRemove} onRemove={onRemove} /> : null}
    </Sheet>
  );
}

function MemberProfile({ code, member, canRemove, onRemove }: { code: string; member: StudyRoomMember; canRemove: boolean; onRemove: (member: StudyRoomMember) => void }) {
  const [profile, setProfile] = useState<RoomMemberProfile | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    void getRoomMemberProfile(code, member.userId)
      .then((value) => { if (active) setProfile(value); })
      .catch((caught) => { if (active) setError(caught instanceof Error ? caught.message : "Couldn't load profile."); });
    return () => { active = false; };
  }, [code, member.userId]);

  return (
    <div>
      <div className="flex items-center gap-4">
        <Avatar name={member.displayName} colour={profile?.avatarColour ?? member.avatarColour} size={52} developer={profile?.developerAccess ?? member.developerAccess} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <StatusWord activity={member.activity} />
            {profile?.developerAccess ? <DeveloperTag size="sm" /> : null}
          </div>
          <p className="mt-1 text-[12.5px]" style={{ color: "var(--app-text-muted)" }}>
            {member.activity === "focus" && member.subject ? `On ${member.subject} · ` : ""}
            Joined {new Date(member.joinedAt).toLocaleDateString([], { day: "numeric", month: "short" })}
          </p>
        </div>
        {member.constellation ? <ConstellationMark id={member.constellation.id} cards={member.constellation.cards} size={52} live={member.activity === "focus"} /> : null}
      </div>
      {error ? (
        <p className="mt-4 text-[13px]" style={{ color: "var(--app-danger)" }}>{error}</p>
      ) : (
        <dl className="mt-5 grid grid-cols-2 gap-4 text-[12.5px] sm:grid-cols-4">
          <Stat label="Today" value={formatDuration(member.todaySeconds)} />
          <Stat label="Past 7 days" value={profile ? formatDuration(profile.weekSeconds) : "…"} />
          <Stat label="All-time focus" value={profile ? formatDuration(profile.totalSeconds) : "…"} />
          <Stat label="Streak cards" value={member.constellation ? String(member.constellation.cards) : "0"} />
        </dl>
      )}
      {canRemove ? (
        <div className="mt-6 border-t pt-4" style={{ borderColor: "var(--app-border)" }}>
          <AppButton variant="danger" onClick={() => onRemove(member)}>Remove from room</AppButton>
        </div>
      ) : null}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt style={{ color: "var(--app-text-faint)" }}>{label}</dt>
      <dd className="mt-1 font-mono text-[17px] tabular-nums" style={{ color: "var(--app-text)" }}>{value}</dd>
    </div>
  );
}
