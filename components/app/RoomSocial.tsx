"use client";

import { useCallback, useEffect, useState } from "react";
import {
  deleteRoomMessage,
  getRoomMemberProfile,
  listRoomMessages,
  sendRoomMessage,
  updateRoom,
  type RoomDashboard,
  type RoomMemberProfile,
  type RoomMessage,
  type StudyRoomMember,
} from "@/lib/api/rooms";
import { ROOM_COLOURS, roomColour } from "@/lib/app/roomColours";
import AppButton from "./AppButton";

export function RoomSettings({ code, room, isPaid, onSaved }: {
  code: string;
  room: Extract<RoomDashboard, { isMember: true }>["room"];
  isPaid: boolean;
  onSaved: (dashboard: RoomDashboard) => void;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(room.name);
  const [description, setDescription] = useState(room.description);
  const [colour, setColour] = useState(room.colour);
  const [icon, setIcon] = useState(room.icon);
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
        ...(isPaid ? { icon, weeklyGoalMinutes: goalHours ? Math.round(Number(goalHours) * 60) : null } : {}),
      }));
      setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save room settings.");
    } finally {
      setSaving(false);
    }
  }

  return <>
    <AppButton variant="ghost" onClick={() => setOpen((value) => !value)}>{open ? "Close settings" : "Room settings"}</AppButton>
    {open ? <form onSubmit={save} className="w-full rounded-lg p-5" style={{ background: "var(--app-surface)", boxShadow: "var(--elev-1)" }}>
      <p className="type-eyebrow mb-4" style={{ color: "var(--app-text-muted)" }}>Room settings · free on every plan</p>
      <label className="block text-[13px]" style={{ color: "var(--app-text-muted)" }}>Name
        <input value={name} onChange={(event) => setName(event.target.value)} required maxLength={60} className="mt-1 block w-full rounded-md p-2.5" style={{ background: "var(--app-surface-soft)", color: "var(--app-text)" }} />
      </label>
      <label className="mt-4 block text-[13px]" style={{ color: "var(--app-text-muted)" }}>Description
        <textarea value={description} onChange={(event) => setDescription(event.target.value)} maxLength={300} rows={2} className="mt-1 block w-full rounded-md p-2.5" style={{ background: "var(--app-surface-soft)", color: "var(--app-text)" }} />
      </label>
      <fieldset className="mt-4"><legend className="text-[13px]" style={{ color: "var(--app-text-muted)" }}>Colour</legend>
        <div className="mt-2 flex flex-wrap gap-2">{Object.entries(ROOM_COLOURS).map(([key, hex]) => <label key={key} className="cursor-pointer rounded-md px-3 py-2 text-[12px]" style={{ border: colour === key ? `2px solid ${hex}` : "2px solid transparent", background: "var(--app-surface-soft)", color: "var(--app-text)" }}>
          <input type="radio" name="room-colour" value={key} checked={colour === key} onChange={() => setColour(key)} className="sr-only" />
          <span className="mr-2 inline-block h-3 w-3 rounded-full align-middle" style={{ background: hex }} />{key}
        </label>)}</div>
      </fieldset>
      {isPaid ? <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <label className="block text-[13px]" style={{ color: "var(--app-text-muted)" }}>Room icon
          <select value={icon} onChange={(event) => setIcon(event.target.value)} className="mt-1 block w-full rounded-md p-2.5" style={{ background: "var(--app-surface-soft)", color: "var(--app-text)" }}>
            {["", "📚", "🎯", "🧪", "✏️", "🌙", "⚡"].map((value) => <option key={value} value={value}>{value || "None"}</option>)}
          </select>
        </label>
        <label className="block text-[13px]" style={{ color: "var(--app-text-muted)" }}>Shared 7-day focus goal · hours
          <input type="number" min={1} max={1000} step={1} value={goalHours} onChange={(event) => setGoalHours(event.target.value)} placeholder="No goal" className="mt-1 block w-full rounded-md p-2.5" style={{ background: "var(--app-surface-soft)", color: "var(--app-text)" }} />
        </label>
      </div> : <p className="mt-4 text-[12px]" style={{ color: "var(--app-text-muted)" }}>Pro adds a room icon and shared 7-day focus goal.</p>}
      {error ? <p className="mt-3 text-[12px]" style={{ color: "var(--app-danger)" }}>{error}</p> : null}
      <div className="mt-4"><AppButton type="submit" variant="primary" loading={saving}>Save room</AppButton></div>
    </form> : null}
  </>;
}

export function RoomChat({ code, userId, ownerUserId, memberIds, onMemberClick }: {
  code: string;
  userId: string;
  ownerUserId: string;
  memberIds: string[];
  onMemberClick: (userId: string) => void;
}) {
  const [messages, setMessages] = useState<RoomMessage[]>([]);
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    try { setMessages(await listRoomMessages(code)); setError(null); }
    catch (err) { setError(err instanceof Error ? err.message : "Couldn't load chat."); }
  }, [code]);

  useEffect(() => {
    void listRoomMessages(code).then(setMessages).catch((err) => setError(err instanceof Error ? err.message : "Couldn't load chat."));
    const interval = window.setInterval(() => { if (!document.hidden) void load(); }, 10000);
    return () => window.clearInterval(interval);
  }, [code, load]);

  async function send(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!body.trim()) return;
    setSending(true);
    setError(null);
    try {
      const message = await sendRoomMessage(code, body.trim());
      setMessages((current) => [...current.filter((item) => item.id !== message.id), message].slice(-50));
      setBody("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't send message.");
    } finally { setSending(false); }
  }

  async function remove(messageId: string) {
    try {
      await deleteRoomMessage(code, messageId);
      setMessages((current) => current.filter((item) => item.id !== messageId));
    } catch (err) { setError(err instanceof Error ? err.message : "Couldn't remove message."); }
  }

  return <section className="rounded-lg p-5" style={{ background: "var(--app-surface)", boxShadow: "var(--elev-1)" }} aria-label="Room chat">
    <div className="flex items-center justify-between gap-3"><h2 className="text-[17px] font-semibold" style={{ color: "var(--app-text)" }}>Room chat</h2><span className="text-[11px]" style={{ color: "var(--app-text-faint)" }}>Members only</span></div>
    <div className="mt-4 flex max-h-[360px] min-h-[120px] flex-col gap-3 overflow-y-auto" aria-live="polite">
      {messages.length === 0 ? <p className="text-[13px]" style={{ color: "var(--app-text-muted)" }}>No messages yet. Say hello to your room.</p> : messages.map((message) => <div key={message.id} className="rounded-md px-3 py-2" style={{ background: "var(--app-surface-soft)" }}>
        <div className="flex items-center gap-2 text-[11px]">{memberIds.includes(message.userId) ? <button type="button" onClick={() => onMemberClick(message.userId)} className="font-semibold underline underline-offset-2" style={{ color: "var(--app-text)" }}>{message.displayName}</button> : <span className="font-semibold" style={{ color: "var(--app-text)" }}>{message.displayName}</span>}<time style={{ color: "var(--app-text-faint)" }} dateTime={message.createdAt}>{new Date(message.createdAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</time>
          {(message.userId === userId || ownerUserId === userId) ? <button type="button" onClick={() => void remove(message.id)} className="ml-auto underline underline-offset-2" style={{ color: "var(--app-text-muted)" }} aria-label={`Remove message from ${message.displayName}`}>Remove</button> : null}
        </div><p className="mt-1 whitespace-pre-wrap break-words text-[13px]" style={{ color: "var(--app-text-soft)" }}>{message.body}</p>
      </div>)}
    </div>
    <form onSubmit={send} className="mt-4 flex gap-2"><input value={body} onChange={(event) => setBody(event.target.value)} maxLength={500} placeholder="Message the room" aria-label="Message the room" className="min-w-0 flex-1 rounded-md px-3 py-2 text-[13px]" style={{ background: "var(--app-surface-soft)", color: "var(--app-text)" }} /><AppButton type="submit" variant="primary" loading={sending} disabled={!body.trim()}>Send</AppButton></form>
    {error ? <p className="mt-2 text-[12px]" style={{ color: "var(--app-danger)" }}>{error}</p> : null}
  </section>;
}

export function RoomMemberProfilePanel({ code, member, onClose }: { code: string; member: StudyRoomMember; onClose: () => void }) {
  const [profile, setProfile] = useState<RoomMemberProfile | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    void getRoomMemberProfile(code, member.userId).then((value) => { if (active) setProfile(value); }).catch((err) => { if (active) setError(err instanceof Error ? err.message : "Couldn't load profile."); });
    return () => { active = false; };
  }, [code, member.userId]);
  return <section className="rounded-lg p-5" style={{ background: "var(--app-surface)", boxShadow: "var(--elev-1)", borderLeft: `4px solid ${roomColour("blue")}` }} aria-label={`${member.displayName}'s room profile`}>
    <div className="flex items-start justify-between gap-3"><div><p className="type-eyebrow" style={{ color: "var(--app-text-muted)" }}>Room member</p><h2 className="mt-1 text-[20px] font-semibold" style={{ color: "var(--app-text)" }}>{member.displayName}</h2></div><AppButton variant="ghost" onClick={onClose}>Close</AppButton></div>
    {error ? <p className="mt-3 text-[13px]" style={{ color: "var(--app-danger)" }}>{error}</p> : !profile ? <p className="mt-3 text-[13px]" style={{ color: "var(--app-text-muted)" }}>Loading profile…</p> : <div className="mt-4 grid grid-cols-2 gap-4 text-[13px] sm:grid-cols-4">
      <Stat label="Today" value={duration(member.todaySeconds)} /><Stat label="Past 7 days" value={duration(profile.weekSeconds)} /><Stat label="All-time focus" value={duration(profile.totalSeconds)} /><Stat label="Sessions" value={String(profile.sessions)} />
    </div>}
  </section>;
}

function Stat({ label, value }: { label: string; value: string }) { return <div><p className="type-eyebrow" style={{ color: "var(--app-text-faint)" }}>{label}</p><p className="mt-1 text-[18px] font-semibold" style={{ color: "var(--app-text)" }}>{value}</p></div>; }
function duration(seconds: number) { const minutes = Math.floor(seconds / 60); return minutes >= 60 ? `${Math.floor(minutes / 60)}h ${minutes % 60}m` : `${minutes}m`; }
