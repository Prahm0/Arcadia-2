"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useDashboardData } from "@/lib/app/DashboardProvider";
import {
  getRoom,
  heartbeatRoom,
  leaveRoom,
  type RoomState,
  type StudyRoom,
  type StudyRoomMember,
} from "@/lib/api/rooms";
import PageHeader from "./PageHeader";
import AppButton from "./AppButton";
import ArcadOrb from "./ArcadOrb";

const POLL_MS = 5_000;
const HEARTBEAT_MS = 15_000;
/** Members whose last_seen_at is older than this read as "away". */
const AWAY_THRESHOLD_MS = 60_000;

const DEFAULT_STATE: RoomState = { activity: "idle" };

interface RoomViewProps {
  code: string;
}

/**
 * A single study room — silent, presence-only. Polls the backend every 5s to
 * refresh member state and sends a heartbeat every 15s to hold this viewer's
 * own presence + timer state. No chat, no notifications.
 */
export default function RoomView({ code }: RoomViewProps) {
  const router = useRouter();
  const { data } = useDashboardData();
  const [room, setRoom] = useState<StudyRoom | null>(null);
  const [members, setMembers] = useState<StudyRoomMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [myState, setMyState] = useState<RoomState>(DEFAULT_STATE);
  const [copied, setCopied] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const stateRef = useRef<RoomState>(DEFAULT_STATE);

  useEffect(() => {
    stateRef.current = myState;
  }, [myState]);

  const load = useCallback(async () => {
    try {
      const response = await getRoom(code);
      setRoom(response.room);
      setMembers(response.members);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't load the room.");
    } finally {
      setLoading(false);
    }
  }, [code]);

  useEffect(() => {
    void load();
    const id = window.setInterval(() => {
      void load();
    }, POLL_MS);
    return () => window.clearInterval(id);
  }, [load]);

  // Send a heartbeat right away so this viewer registers as present.
  useEffect(() => {
    void heartbeatRoom(code, stateRef.current).catch(() => {
      /* first heartbeat can race the room fetch; the interval will retry */
    });
    const id = window.setInterval(() => {
      void heartbeatRoom(code, stateRef.current).then((response) => {
        // Keep the members list warm between poll ticks.
        setMembers(response.members);
      }).catch(() => {
        /* swallow — poll will refresh */
      });
    }, HEARTBEAT_MS);
    return () => window.clearInterval(id);
  }, [code]);

  async function copyCode() {
    if (!room) return;
    try {
      await navigator.clipboard.writeText(room.code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      /* ignore */
    }
  }

  async function leave() {
    if (!confirm("Leave the room?")) return;
    setLeaving(true);
    try {
      await leaveRoom(code);
      router.push("/app/rooms");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't leave the room.");
      setLeaving(false);
    }
  }

  const shareUrl = useMemo(() => {
    if (typeof window === "undefined" || !room) return "";
    return `${window.location.origin}/app/rooms/${room.code}`;
  }, [room]);

  async function copyLink() {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      /* ignore */
    }
  }

  const activeCount = members.filter((member) => !isAway(member.lastSeenAt)).length;

  return (
    <>
      <PageHeader
        eyebrow="Room"
        title={
          room ? (
            <><span className="accent-serif">{room.name}</span></>
          ) : (
            <>Loading…</>
          )
        }
        meta={room ? `${activeCount} active · code ${room.code}` : undefined}
        action={
          room ? (
            <div className="flex flex-wrap items-center gap-2">
              <AppButton variant="ghost" onClick={copyCode}>
                {copied ? "Copied" : "Copy code"}
              </AppButton>
              <AppButton variant="ghost" onClick={copyLink}>
                Copy link
              </AppButton>
              <AppButton variant="ghost" onClick={leave} loading={leaving}>
                Leave
              </AppButton>
            </div>
          ) : null
        }
      />

      <div className="mx-auto flex w-full max-w-[860px] flex-col gap-6 px-6 py-8 sm:px-10">
        {error ? (
          <div
            className="rounded-[12px] p-4 text-[13px]"
            style={{ background: "var(--app-surface-soft)", border: "1px solid var(--app-border)", color: "var(--app-danger)" }}
          >
            {error}
          </div>
        ) : null}

        {/* Your own status */}
        <div
          className="rounded-[14px] p-5"
          style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}
        >
          <p className="type-eyebrow" style={{ color: "var(--app-text-muted)" }}>Your status</p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {(
              [
                { key: "idle", label: "Idle" },
                { key: "focus", label: "Focus" },
                { key: "break", label: "Break" },
              ] as const
            ).map((option) => (
              <button
                key={option.key}
                type="button"
                onClick={() =>
                  setMyState((prev) => ({
                    ...prev,
                    activity: option.key,
                    startedAt:
                      option.key === prev.activity
                        ? prev.startedAt
                        : option.key === "idle"
                          ? null
                          : new Date().toISOString(),
                  }))
                }
                className="rounded-full px-3 py-1.5 text-[12.5px] font-medium transition-colors"
                style={{
                  background:
                    myState.activity === option.key
                      ? option.key === "focus"
                        ? "var(--app-accent)"
                        : option.key === "break"
                          ? "var(--app-success)"
                          : "var(--app-surface-soft)"
                      : "transparent",
                  color:
                    myState.activity === option.key
                      ? option.key === "idle"
                        ? "var(--app-text)"
                        : "white"
                      : "var(--app-text-soft)",
                  border: `1px solid ${
                    myState.activity === option.key ? "transparent" : "var(--app-border-strong)"
                  }`,
                }}
              >
                {option.label}
              </button>
            ))}
            <input
              type="text"
              value={myState.subject ?? ""}
              onChange={(e) =>
                setMyState((prev) => ({ ...prev, subject: e.target.value }))
              }
              placeholder="What are you on?"
              maxLength={80}
              className="ml-1 flex-1 rounded-[10px] px-3 py-1.5 text-[13px] outline-none"
              style={{
                background: "var(--app-surface-soft)",
                border: "1px solid var(--app-border)",
                color: "var(--app-text)",
              }}
            />
          </div>
          <p className="mt-3 text-[12px]" style={{ color: "var(--app-text-muted)" }}>
            Your presence updates every {Math.round(HEARTBEAT_MS / 1000)}s. Close the tab and you'll drop to "away" within a minute.
          </p>
        </div>

        {/* Members */}
        <div
          className="rounded-[14px] p-2"
          style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}
        >
          {loading ? (
            <p className="p-4 text-[13.5px]" style={{ color: "var(--app-text-muted)" }}>Loading…</p>
          ) : members.length === 0 ? (
            <p className="p-4 text-[13.5px]" style={{ color: "var(--app-text-muted)" }}>
              No one here yet. Share the code above.
            </p>
          ) : (
            <ul className="flex flex-col">
              {members.map((member) => (
                <MemberRow key={member.userId} member={member} isYou={member.userId === data.user.id} />
              ))}
            </ul>
          )}
        </div>

        <p className="text-[12px]" style={{ color: "var(--app-text-faint)" }}>
          Silent by design — no chat, no notifications. Just other people trying to focus at the same time.
        </p>

        <Link href="/app/rooms" className="text-[12.5px] font-medium underline underline-offset-4" style={{ color: "var(--app-text-muted)" }}>
          ← All rooms
        </Link>
      </div>
    </>
  );
}

function MemberRow({ member, isYou }: { member: StudyRoomMember; isYou: boolean }) {
  const away = isAway(member.lastSeenAt);
  const activityLabel = away
    ? "Away"
    : member.activity === "focus"
      ? "Focus"
      : member.activity === "break"
        ? "Break"
        : "Idle";
  const chipColor = away
    ? { bg: "var(--app-surface-soft)", fg: "var(--app-text-muted)" }
    : member.activity === "focus"
      ? { bg: "color-mix(in oklab, var(--app-accent) 15%, transparent)", fg: "var(--app-accent-strong)" }
      : member.activity === "break"
        ? { bg: "color-mix(in oklab, var(--app-success) 15%, transparent)", fg: "var(--app-success)" }
        : { bg: "var(--app-surface-soft)", fg: "var(--app-text-muted)" };
  const timingLine = buildTimingLine(member);

  return (
    <li
      className="flex items-center gap-4 rounded-[10px] px-3 py-3.5"
      style={{ borderBottom: "1px solid var(--app-border)" }}
    >
      <ArcadOrb size={22} state={member.activity === "focus" && !away ? "thinking" : "idle"} />
      <div className="min-w-0 flex-1">
        <p className="text-[14px] font-medium" style={{ color: "var(--app-text)" }}>
          {member.displayName}
          {isYou ? (
            <span className="ml-1.5 text-[11px]" style={{ color: "var(--app-text-muted)" }}>
              you
            </span>
          ) : null}
        </p>
        <p className="mt-0.5 type-mono-label" style={{ color: "var(--app-text-muted)" }}>
          {timingLine}
        </p>
      </div>
      <span
        className="rounded-full px-2.5 py-0.5 text-[11.5px] font-medium"
        style={{ background: chipColor.bg, color: chipColor.fg }}
      >
        {activityLabel}
      </span>
    </li>
  );
}

function isAway(lastSeenIso: string): boolean {
  return Date.now() - Date.parse(lastSeenIso) > AWAY_THRESHOLD_MS;
}

function buildTimingLine(member: StudyRoomMember): string {
  const parts: string[] = [];
  if (member.subject) parts.push(member.subject);
  if (member.activity !== "idle" && member.startedAt) {
    const elapsedMin = Math.max(0, Math.round((Date.now() - Date.parse(member.startedAt)) / 60000));
    parts.push(`${elapsedMin} min in`);
    if (typeof member.durationSeconds === "number" && member.durationSeconds > 0) {
      const remainingMin = Math.max(
        0,
        Math.round((member.durationSeconds - (Date.now() - Date.parse(member.startedAt)) / 1000) / 60),
      );
      parts.push(`${remainingMin} min left`);
    }
  }
  parts.push(lastSeenRelative(member.lastSeenAt));
  return parts.join(" · ");
}

function lastSeenRelative(iso: string): string {
  const diffSec = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 1000));
  if (diffSec < 20) return "here now";
  if (diffSec < 60) return `seen ${diffSec}s ago`;
  const min = Math.round(diffSec / 60);
  if (min < 60) return `seen ${min} min ago`;
  const hr = Math.round(min / 60);
  return `seen ${hr} hr ago`;
}
