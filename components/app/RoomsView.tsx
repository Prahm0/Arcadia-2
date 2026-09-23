"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createRoom, joinRoom, listRooms, type StudyRoom } from "@/lib/api/rooms";
import { ROOM_COLOURS, roomColour } from "@/lib/app/roomColours";
import PageHeader from "./PageHeader";
import AppButton from "./AppButton";
import { copyText, showContextMenu } from "./ContextMenu";
import EmptyState, { ExampleRow } from "./EmptyState";

export default function RoomsView() {
  const router = useRouter();
  const [rooms, setRooms] = useState<StudyRoom[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const createNameInput = useRef<HTMLInputElement>(null);

  const [createName, setCreateName] = useState("");
  const [createDescription, setCreateDescription] = useState("");
  const [createColour, setCreateColour] = useState("slate");
  const [creating, setCreating] = useState(false);

  const [joinCode, setJoinCode] = useState("");
  const [joining, setJoining] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setRooms(await listRooms());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't load rooms.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function submitCreate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = createName.trim();
    if (!name) return;
    setCreating(true);
    setError(null);
    try {
      // No display name: the server uses the profile name, which keeps two
      // guests from both showing up as "Guest".
      const room = await createRoom(name, createDescription, createColour);
      setCreateName("");
      setCreateDescription("");
      router.push(`/app/rooms/${room.code}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't create the room.");
    } finally {
      setCreating(false);
    }
  }

  async function submitJoin(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const code = joinCode.trim().toUpperCase();
    if (!code) return;
    setJoining(true);
    setError(null);
    try {
      const joined = await joinRoom(code);
      setJoinCode("");
      router.push(`/app/rooms/${joined.room.code}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't join that room.");
    } finally {
      setJoining(false);
    }
  }

  return (
    <>
      <PageHeader width={860}
        eyebrow="Study"
        title="Rooms"
        meta={loading ? undefined : `${rooms.length} ${rooms.length === 1 ? "room" : "rooms"}`}
        tour="rooms"
      />

      <div className="mx-auto flex w-full max-w-[860px] flex-col gap-6 px-6 py-8 sm:px-10">
        <div className="grid gap-4 sm:grid-cols-2">
          <form
            onSubmit={submitCreate}
            className="rounded-lg p-5"
            style={{ background: "var(--app-surface)", boxShadow: "var(--elev-1)" }}
          >
            <p className="type-eyebrow" style={{ color: "var(--app-text-muted)" }}>Create a room</p>
            <label className="mt-3 block">
              <span className="mb-2 block text-[12.5px] font-medium" style={{ color: "var(--app-text-muted)" }}>
                Name
              </span>
              <input
                ref={createNameInput}
                type="text"
                required
                maxLength={60}
                value={createName}
                onChange={(e) => setCreateName(e.target.value)}
                placeholder="e.g. Study Fri night"
                className="w-full rounded-md px-3 py-2.5 text-[14.5px] outline-none"
                style={{
                  background: "var(--app-surface-soft)", boxShadow: "var(--elev-inset)",
                  color: "var(--app-text)",
                }}
              />
            </label>
            <label className="mt-3 block">
              <span className="mb-2 block text-[12.5px] font-medium" style={{ color: "var(--app-text-muted)" }}>Description <span style={{ color: "var(--app-text-faint)" }}>(optional)</span></span>
              <textarea value={createDescription} onChange={(event) => setCreateDescription(event.target.value)} maxLength={300} rows={2} placeholder="What are you studying together?" className="w-full rounded-md px-3 py-2.5 text-[13px] outline-none" style={{ background: "var(--app-surface-soft)", color: "var(--app-text)" }} />
            </label>
            <fieldset className="mt-3"><legend className="text-[12.5px] font-medium" style={{ color: "var(--app-text-muted)" }}>Colour</legend><div className="mt-2 flex flex-wrap gap-2">{Object.entries(ROOM_COLOURS).map(([key, hex]) => <label key={key} className="cursor-pointer rounded-full p-1" style={{ border: createColour === key ? `2px solid ${hex}` : "2px solid transparent" }} title={key}><input type="radio" name="create-room-colour" value={key} checked={createColour === key} onChange={() => setCreateColour(key)} className="sr-only" /><span className="block h-5 w-5 rounded-full" style={{ background: hex }} /></label>)}</div></fieldset>
            <div className="mt-4">
              <AppButton type="submit" variant="primary" loading={creating} disabled={!createName.trim()}>
                Create
              </AppButton>
            </div>
          </form>

          <form
            onSubmit={submitJoin}
            className="rounded-lg p-5"
            style={{ background: "var(--app-surface)", boxShadow: "var(--elev-1)" }}
          >
            <p className="type-eyebrow" style={{ color: "var(--app-text-muted)" }}>Join with a code</p>
            <label className="mt-3 block">
              <span className="mb-2 block text-[12.5px] font-medium" style={{ color: "var(--app-text-muted)" }}>
                6-letter code
              </span>
              <input
                type="text"
                required
                maxLength={12}
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                placeholder="ABC234"
                className="w-full rounded-md px-3 py-2.5 text-[15px] tabular-nums tracking-widest outline-none"
                style={{
                  background: "var(--app-surface-soft)", boxShadow: "var(--elev-inset)",
                  color: "var(--app-text)",
                }}
                autoCapitalize="characters"
                autoCorrect="off"
              />
            </label>
            <div className="mt-4">
              <AppButton type="submit" variant="secondary" loading={joining} disabled={!joinCode.trim()}>
                Join
              </AppButton>
            </div>
          </form>
        </div>

        {error ? (
          <div
            className="flex flex-wrap items-center justify-between gap-3 rounded-md px-4 py-3"
            style={{
              background: "var(--app-surface)", boxShadow: "var(--elev-1)",
              color: "var(--app-text-soft)",
            }}
          >
            <span className="text-[13px]" style={{ color: "var(--app-danger)" }}>{error}</span>
            <AppButton variant="secondary" onClick={() => void load()}>Try again</AppButton>
          </div>
        ) : null}

        <div>
          <p className="type-eyebrow" style={{ color: "var(--app-text-muted)" }}>Your rooms</p>
          {loading ? (
            <p className="mt-4 text-[13.5px]" style={{ color: "var(--app-text-muted)" }}>Loading…</p>
          ) : rooms.length === 0 ? (
            <div className="mt-4">
              <EmptyState
                title={<>Study works better <span className="accent-serif">together</span>.</>}
                body="A room is a quiet shared focus space. Create one for your friends, or join one with their code."
                example={
                  <>
                    <ExampleRow title="Josh" meta="Studying · Physics · 32 min in · 2h 10m today" />
                    <ExampleRow title="Priya" meta="Break · 1h 45m today" bar="var(--app-success)" />
                    <ExampleRow title="You" meta="Idle · 40m today" bar="var(--app-text-faint)" />
                  </>
                }
                action={
                  <AppButton variant="primary" onClick={() => createNameInput.current?.focus()}>
                    Create a room
                  </AppButton>
                }
                hint="No chat, no notifications, just who's working."
              />
            </div>
          ) : (
            <ul className="mt-3 flex flex-col gap-2">
              {rooms.map((room) => (
                <li
                  key={room.id}
                  onContextMenu={(event) => {
                    const href = `/app/rooms/${room.code}`;
                    showContextMenu(
                      event,
                      [
                        { kind: "item", label: "Open", onSelect: () => router.push(href) },
                        { kind: "item", label: "Open in new tab", onSelect: () => window.open(href, "_blank", "noopener") },
                        { kind: "separator" },
                        { kind: "item", label: "Copy invite link", onSelect: () => void copyText(`${window.location.origin}${href}`, "Link copied") },
                        { kind: "item", label: "Copy room code", onSelect: () => void copyText(room.code, "Code copied") },
                      ],
                      room.name,
                    );
                  }}
                >
                  <Link
                    href={`/app/rooms/${room.code}`}
                    className="group flex items-center gap-4 rounded-md px-4 py-4 transition-colors ui-hover"
                    style={{ background: "var(--app-surface)", boxShadow: "var(--elev-1)", borderLeft: `4px solid ${roomColour(room.colour)}` }}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-[15px] font-medium tracking-[-0.005em]" style={{ color: "var(--app-text)" }}>
                        {room.icon ? `${room.icon} ` : ""}{room.name}
                      </p>
                      {room.description ? <p className="mt-1 truncate text-[12px]" style={{ color: "var(--app-text-muted)" }}>{room.description}</p> : null}
                      <p className="mt-1 type-mono-label" style={{ color: "var(--app-text-muted)" }}>
                        {room.code} · {room.memberCount}/{room.capacity} members
                      </p>
                    </div>
                    {room.studyingCount > 0 ? (
                      <span
                        className="rounded-md px-2.5 py-0.5 text-[11.5px] font-medium"
                        style={{
                          background: "color-mix(in oklab, var(--app-accent) 15%, transparent)",
                          color: "var(--app-accent-strong)",
                        }}
                      >
                        {room.studyingCount} studying
                      </span>
                    ) : null}
                    <span className="text-[11.5px]" style={{ color: "var(--app-text-muted)" }}>
                      Open →
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </>
  );
}
