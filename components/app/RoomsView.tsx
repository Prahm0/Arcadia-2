"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useDashboardData } from "@/lib/app/DashboardProvider";
import { createRoom, joinRoom, listRooms, type StudyRoom } from "@/lib/api/rooms";
import PageHeader from "./PageHeader";
import AppButton from "./AppButton";
import EmptyState, { ExampleRow } from "./EmptyState";

export default function RoomsView() {
  const router = useRouter();
  const { data } = useDashboardData();
  const [rooms, setRooms] = useState<StudyRoom[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [createName, setCreateName] = useState("");
  const [creating, setCreating] = useState(false);

  const [joinCode, setJoinCode] = useState("");
  const [joining, setJoining] = useState(false);

  const displayName = data.user.name.split(" ")[0];

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

  useEffect(() => { void load(); }, [load]);

  async function submitCreate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = createName.trim();
    if (!name) return;
    setCreating(true);
    setError(null);
    try {
      const room = await createRoom(name, displayName);
      setCreateName("");
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
      await joinRoom(code, displayName);
      setJoinCode("");
      router.push(`/app/rooms/${code}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't join that room.");
    } finally {
      setJoining(false);
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="Rooms"
        title={<>Focus with your <span className="accent-serif">people</span>.</>}
        meta="Silent group study. Share a code. See each other's timers, nothing else."
      />

      <div className="mx-auto flex w-full max-w-[860px] flex-col gap-6 px-6 py-8 sm:px-10">
        <div className="grid gap-4 sm:grid-cols-2">
          <form
            onSubmit={submitCreate}
            className="rounded-[14px] p-5"
            style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}
          >
            <p className="type-eyebrow" style={{ color: "var(--app-text-muted)" }}>Create a room</p>
            <label className="mt-3 block">
              <span className="mb-2 block text-[12.5px] font-medium" style={{ color: "var(--app-text-muted)" }}>
                Name
              </span>
              <input
                type="text"
                required
                maxLength={60}
                value={createName}
                onChange={(e) => setCreateName(e.target.value)}
                placeholder="e.g. Study Fri night"
                className="w-full rounded-[10px] px-3 py-2.5 text-[14.5px] outline-none"
                style={{
                  background: "var(--app-surface-soft)",
                  border: "1px solid var(--app-border)",
                  color: "var(--app-text)",
                }}
              />
            </label>
            <div className="mt-4">
              <AppButton type="submit" variant="primary" loading={creating} disabled={!createName.trim()}>
                Create
              </AppButton>
            </div>
          </form>

          <form
            onSubmit={submitJoin}
            className="rounded-[14px] p-5"
            style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}
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
                className="w-full rounded-[10px] px-3 py-2.5 text-[15px] font-mono tracking-widest outline-none"
                style={{
                  background: "var(--app-surface-soft)",
                  border: "1px solid var(--app-border)",
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
          <p className="text-[13px]" style={{ color: "var(--app-danger)" }}>{error}</p>
        ) : null}

        <div>
          <p className="type-eyebrow" style={{ color: "var(--app-text-muted)" }}>Your rooms</p>
          {loading ? (
            <p className="mt-4 text-[13.5px]" style={{ color: "var(--app-text-muted)" }}>Loading…</p>
          ) : rooms.length === 0 ? (
            <div className="mt-4">
              <EmptyState
                title={<>No rooms <span className="accent-serif">yet</span>.</>}
                body="Create one and share the code with a friend, or drop a code someone sent you. You'll see each other's timers — that's it."
                example={
                  <>
                    <ExampleRow title="Josh" meta="Focus · Physics · 32 min in · 18 min left" />
                    <ExampleRow title="Priya" meta="Break · 4 min left" bar="var(--app-success)" />
                    <ExampleRow title="You" meta="Idle" bar="var(--app-text-faint)" />
                  </>
                }
                hint="No chat, no notifications — just presence."
              />
            </div>
          ) : (
            <ul className="mt-3 flex flex-col gap-2">
              {rooms.map((room) => (
                <li key={room.id}>
                  <Link
                    href={`/app/rooms/${room.code}`}
                    className="group flex items-center gap-4 rounded-[12px] px-4 py-4 transition-colors hover:bg-black/[0.02]"
                    style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-[15px] font-medium tracking-[-0.005em]" style={{ color: "var(--app-text)" }}>
                        {room.name}
                      </p>
                      <p className="mt-1 type-mono-label" style={{ color: "var(--app-text-muted)" }}>
                        {room.code} · joined {relativeTime(room.joinedAt ?? room.createdAt)}
                      </p>
                    </div>
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

function relativeTime(iso: string): string {
  const then = Date.parse(iso);
  const diff = Date.now() - then;
  const min = Math.round(diff / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min} min ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr} hr ago`;
  const day = Math.round(hr / 24);
  return `${day} day${day === 1 ? "" : "s"} ago`;
}
