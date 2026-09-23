"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ApiError } from "@/lib/api/client";
import { useDashboardData } from "@/lib/app/DashboardProvider";
import {
  getRoom,
  joinRoom,
  leaveRoom,
  type RoomDashboard,
  type StudyRoomMember,
} from "@/lib/api/rooms";
import { roomColour } from "@/lib/app/roomColours";
import PageHeader from "./PageHeader";
import AppButton from "./AppButton";
import { RoomChat, RoomMemberProfilePanel, RoomSettings } from "./RoomSocial";

/**
 * How often the dashboard re-reads the room. Friends' timers tick locally
 * between polls, so this only bounds how quickly a start/stop shows up.
 */
const POLL_MS = 20_000;

const ACTIVITY_ORDER = { focus: 0, break: 1, idle: 2 } as const;

interface RoomViewProps {
  code: string;
}

/**
 * A study room's live dashboard: who's studying, on what, for how long, and
 * how much they've done today. Status comes from each member's focus timer ,
 * nothing to set here. Read-only polling; viewing a room never writes.
 */
export default function RoomView({ code }: RoomViewProps) {
  const router = useRouter();
  const { data } = useDashboardData();
  const [dash, setDash] = useState<RoomDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  // A failed poll keeps the last good data on screen and just says so.
  const [reconnecting, setReconnecting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [copied, setCopied] = useState<"code" | "link" | null>(null);
  const [leaving, setLeaving] = useState(false);
  const [joining, setJoining] = useState(false);
  const [joinName, setJoinName] = useState("");
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);
  const now = useNow(dash?.members.some((member) => member.activity !== "idle") ?? false);

  const load = useCallback(async () => {
    try {
      setDash(await getRoom(code));
      setReconnecting(false);
      setNotFound(false);
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) setNotFound(true);
      else setReconnecting(true);
    } finally {
      setLoading(false);
    }
  }, [code]);

  // Poll while the tab is visible; a hidden tab costs nothing and catches up
  // the moment it's looked at again.
  useEffect(() => {
    void load();
    let id: number | null = null;
    const startPolling = () => {
      if (id === null) id = window.setInterval(() => void load(), POLL_MS);
    };
    const stopPolling = () => {
      if (id !== null) window.clearInterval(id);
      id = null;
    };
    const onVisibility = () => {
      if (document.hidden) {
        stopPolling();
      } else {
        void load();
        startPolling();
      }
    };
    if (!document.hidden) startPolling();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stopPolling();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [load]);

  async function join(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setJoining(true);
    setActionError(null);
    try {
      setDash(await joinRoom(code, joinName.trim() || undefined));
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Couldn't join the room.");
    } finally {
      setJoining(false);
    }
  }

  async function leave() {
    if (!confirm("Leave the room? You can rejoin with the code.")) return;
    setLeaving(true);
    setActionError(null);
    try {
      await leaveRoom(code);
      router.push("/app/rooms");
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Couldn't leave the room.");
      setLeaving(false);
    }
  }

  async function copy(kind: "code" | "link") {
    if (!dash) return;
    const text =
      kind === "code" ? dash.room.code : `${window.location.origin}/app/rooms/${dash.room.code}`;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(kind);
      window.setTimeout(() => setCopied(null), 1600);
    } catch {
      /* ignore */
    }
  }

  const members = useMemo(() => {
    if (!dash?.isMember) return [];
    return [...dash.members].sort(
      (a, b) =>
        ACTIVITY_ORDER[a.activity] - ACTIVITY_ORDER[b.activity] ||
        liveTodaySeconds(b, now) - liveTodaySeconds(a, now),
    );
  }, [dash, now]);

  const studyingNow = members.filter((member) => member.activity === "focus").length;
  const roomToday = members.reduce((sum, member) => sum + liveTodaySeconds(member, now), 0);
  const roomWeek = members.reduce((sum, member) => sum + member.weekSeconds, 0);
  const me = members.find((member) => member.userId === data.user.id);

  if (notFound) {
    return (
      <>
        <PageHeader width={860} eyebrow="Rooms" title="No room with that code" />
        <div className="mx-auto w-full max-w-[860px] px-6 py-8 sm:px-10">
          <p className="text-[13.5px]" style={{ color: "var(--app-text-muted)" }}>
            It may have been closed when the last person left. Double-check the code, or start a new room.
          </p>
          <Link href="/app/rooms" className="mt-4 inline-block text-[12.5px] font-medium underline underline-offset-4" style={{ color: "var(--app-text-muted)" }}>
            ← All rooms
          </Link>
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader width={860}
        eyebrow="Rooms"
        title={dash ? `${dash.room.icon ? `${dash.room.icon} ` : ""}${dash.room.name}` : "Loading…"}
        tour="rooms"
        meta={
          dash?.isMember
            ? `${studyingNow} studying now · ${formatDuration(roomToday)} together today · code ${dash.room.code}`
            : undefined
        }
        action={
          dash?.isMember ? (
            <div className="flex flex-wrap items-center gap-2">
              <AppButton variant="ghost" onClick={() => void copy("code")}>
                {copied === "code" ? "Copied" : "Copy code"}
              </AppButton>
              <AppButton variant="ghost" onClick={() => void copy("link")}>
                {copied === "link" ? "Copied" : "Copy link"}
              </AppButton>
              <AppButton variant="ghost" onClick={leave} loading={leaving}>
                Leave
              </AppButton>
            </div>
          ) : null
        }
      />

      <div className="mx-auto flex w-full max-w-[860px] flex-col gap-6 px-6 py-8 sm:px-10">
        {dash ? <div className="rounded-md px-4 py-3 text-[13px]" style={{ background: "var(--app-surface-soft)", color: "var(--app-text-soft)", borderLeft: `4px solid ${roomColour(dash.room.colour)}` }}>
          {dash.room.description || "A place to study together."} <span className="ml-2 whitespace-nowrap" style={{ color: "var(--app-text-muted)" }}>{dash.room.memberCount}/{dash.room.capacity} members</span>
        </div> : null}
        {actionError ? (
          <div
            className="rounded-md p-4 text-[13px]"
            style={{ background: "var(--app-surface-soft)", boxShadow: "var(--elev-inset)", color: "var(--app-danger)" }}
          >
            {actionError}
          </div>
        ) : null}

        {loading && !dash ? (
          <p className="text-[13.5px]" style={{ color: "var(--app-text-muted)" }}>Loading…</p>
        ) : !dash && reconnecting ? (
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-[13.5px]" style={{ color: "var(--app-danger)" }}>Couldn&apos;t load the room.</p>
            <AppButton variant="secondary" onClick={() => void load()}>Try again</AppButton>
          </div>
        ) : dash && !dash.isMember ? (
          <form
            onSubmit={join}
            className="rounded-lg p-6"
            style={{ background: "var(--app-surface)", boxShadow: "var(--elev-1)" }}
          >
            <p className="type-eyebrow" style={{ color: "var(--app-text-muted)" }}>You&apos;re invited</p>
            <p className="mt-2 text-[20px] tracking-[-0.01em]" style={{ color: "var(--app-text)" }}>
              Join <span className="accent-serif">{dash.room.name}</span>
            </p>
            <p className="mt-1 type-mono-label" style={{ color: "var(--app-text-muted)" }}>
              {dash.room.memberCount} {dash.room.memberCount === 1 ? "member" : "members"} · code {dash.room.code}
            </p>
            <label className="mt-5 block max-w-[320px]">
              <span className="mb-2 block text-[12.5px] font-medium" style={{ color: "var(--app-text-muted)" }}>
                Show me as <span style={{ color: "var(--app-text-faint)" }}>(optional)</span>
              </span>
              <input
                type="text"
                maxLength={40}
                value={joinName}
                onChange={(e) => setJoinName(e.target.value)}
                placeholder={data.profile?.displayName || data.user.name || "Your name"}
                className="w-full rounded-md px-3 py-2.5 text-[14.5px] outline-none"
                style={{ background: "var(--app-surface-soft)", boxShadow: "var(--elev-inset)", color: "var(--app-text)" }}
              />
            </label>
            <div className="mt-4">
              <AppButton type="submit" variant="primary" loading={joining}>
                Join room
              </AppButton>
            </div>
          </form>
        ) : dash?.isMember ? (
          <>
            {dash.room.ownerUserId === data.user.id ? <RoomSettings key={dash.room.id} code={code} room={dash.room} isPaid={data.user.tier === "pro" || data.user.tier === "max"} onSaved={setDash} /> : null}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <RoomMetric label="Studying now" value={String(studyingNow)} />
              <RoomMetric label="Focus today" value={formatDuration(roomToday)} />
              <RoomMetric label="Past 7 days" value={formatDuration(roomWeek)} />
              <RoomMetric label="Members" value={`${dash.room.memberCount}/${dash.room.capacity}`} />
            </div>
            {dash.room.weeklyGoalMinutes ? <div className="rounded-md p-4" style={{ background: "var(--app-surface)", boxShadow: "var(--elev-1)" }}><div className="flex justify-between gap-2 text-[13px]" style={{ color: "var(--app-text-soft)" }}><span>Shared 7-day goal</span><span>{formatDuration(roomWeek)} / {formatDuration(dash.room.weeklyGoalMinutes * 60)}</span></div><div className="mt-2 h-2 overflow-hidden rounded-full" style={{ background: "var(--app-surface-soft)" }}><div className="h-full rounded-full" style={{ width: `${Math.min(100, (roomWeek / (dash.room.weeklyGoalMinutes * 60)) * 100)}%`, background: roomColour(dash.room.colour) }} /></div></div> : null}
            <RoomActivityChart days={dash.room.weekActivity ?? []} colour={dash.room.colour} />
            {me && me.activity === "idle" ? (
              <div
                className="flex flex-wrap items-center justify-between gap-3 rounded-md px-4 py-3"
                style={{ background: "var(--app-surface-soft)", boxShadow: "var(--elev-inset)" }}
              >
                <span className="text-[13px]" style={{ color: "var(--app-text-soft)" }}>
                  Start a focus timer and the room sees you studying.
                </span>
                <Link
                  href="/app/focus"
                  className="text-[12.5px] font-medium underline underline-offset-4"
                  style={{ color: "var(--app-text)" }}
                >
                  Start focusing →
                </Link>
              </div>
            ) : null}

            <ul className="grid gap-3 sm:grid-cols-2">
              {members.map((member) => (
                <MemberCard
                  key={member.userId}
                  member={member}
                  now={now}
                  isYou={member.userId === data.user.id}
                  isOwner={member.userId === dash.room.ownerUserId}
                  onProfile={() => setSelectedMemberId(member.userId)}
                />
              ))}
            </ul>

            {selectedMemberId && members.some((member) => member.userId === selectedMemberId) ? <RoomMemberProfilePanel key={selectedMemberId} code={code} member={members.find((member) => member.userId === selectedMemberId)!} onClose={() => setSelectedMemberId(null)} /> : null}

            <RoomChat code={code} userId={data.user.id} ownerUserId={dash.room.ownerUserId} memberIds={members.map((member) => member.userId)} onMemberClick={setSelectedMemberId} />

            <p className="text-[12px]" style={{ color: reconnecting ? "var(--app-danger)" : "var(--app-text-faint)" }}>
              {reconnecting
                ? "Reconnecting… showing the last update."
                : "Updates about every 20 seconds. Timers tick live in between."}
            </p>
          </>
        ) : null}

        <Link href="/app/rooms" className="text-[12.5px] font-medium underline underline-offset-4" style={{ color: "var(--app-text-muted)" }}>
          ← All rooms
        </Link>
      </div>
    </>
  );
}

function MemberCard({
  member,
  now,
  isYou,
  isOwner,
  onProfile,
}: {
  member: StudyRoomMember;
  now: number;
  isYou: boolean;
  isOwner: boolean;
  onProfile: () => void;
}) {
  const elapsed = elapsedSeconds(member, now);
  const studying = member.activity === "focus";
  const chip =
    member.activity === "focus"
      ? { label: "Studying", bg: "color-mix(in oklab, var(--app-accent) 15%, transparent)", fg: "var(--app-accent-strong)" }
      : member.activity === "break"
        ? { label: "Break", bg: "color-mix(in oklab, var(--app-success) 15%, transparent)", fg: "var(--app-success)" }
        : { label: "Idle", bg: "var(--app-surface-soft)", fg: "var(--app-text-muted)" };

  let detail: string;
  if (member.activity === "focus") {
    detail = member.subject || "Focusing";
  } else if (member.activity === "break" && member.durationSeconds) {
    const left = Math.max(0, member.durationSeconds - elapsed);
    detail = `${Math.ceil(left / 60)} min left`;
  } else if (member.activity === "break") {
    detail = "On a break";
  } else {
    detail = member.todaySeconds > 0 ? "Done for now" : "Not started today";
  }

  return (
    <li
      className="flex flex-col gap-4 rounded-lg p-5"
      style={{
        background: "var(--app-surface)",
        boxShadow: "var(--elev-1)",
        opacity: member.activity === "idle" ? 0.78 : 1,
      }}
    >
      <div className="flex items-center gap-3">
        <span
          aria-hidden
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[14px] font-semibold"
          style={{
            background: studying ? "var(--app-accent)" : "var(--app-surface-soft)",
            color: studying ? "var(--app-accent-on)" : "var(--app-text-soft)",
            boxShadow: studying ? undefined : "var(--elev-inset)",
          }}
        >
          {initial(member.displayName)}
        </span>
        <div className="min-w-0 flex-1">
          <button type="button" onClick={onProfile} className="truncate text-left text-[14.5px] font-medium underline-offset-2 hover:underline" style={{ color: "var(--app-text)" }}>
            {member.displayName}
            {isYou ? <span className="ml-1.5 text-[11px]" style={{ color: "var(--app-text-muted)" }}>you</span> : null}
            {isOwner ? <span className="ml-1.5 text-[11px]" style={{ color: "var(--app-text-faint)" }}>owner</span> : null}
          </button>
          <p className="truncate type-mono-label" style={{ color: "var(--app-text-muted)" }}>{detail}</p>
        </div>
        <span
          className="shrink-0 rounded-md px-2.5 py-0.5 text-[11.5px] font-medium"
          style={{ background: chip.bg, color: chip.fg }}
        >
          {chip.label}
        </span>
      </div>

      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="type-eyebrow" style={{ color: "var(--app-text-faint)" }}>
            {studying ? "This session" : member.activity === "break" ? "Break" : "Session"}
          </p>
          <p
            className="tabular-nums text-[22px]  tracking-[-0.01em]"
            style={{ color: member.activity === "idle" ? "var(--app-text-faint)" : "var(--app-text)" }}
          >
            {member.activity === "idle" ? "," : formatClock(elapsed)}
          </p>
        </div>
        <div className="text-right">
          <p className="type-eyebrow" style={{ color: "var(--app-text-faint)" }}>Today</p>
          <p className="tabular-nums text-[22px]  tracking-[-0.01em]" style={{ color: "var(--app-text)" }}>
            {formatDuration(liveTodaySeconds(member, now))}
          </p>
        </div>
      </div>
      <p className="text-[11px]" style={{ color: "var(--app-text-faint)" }}>Past 7 days: {formatDuration(member.weekSeconds)}</p>
    </li>
  );
}

function RoomMetric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-md p-3" style={{ background: "var(--app-surface)", boxShadow: "var(--elev-1)" }}><p className="type-eyebrow" style={{ color: "var(--app-text-faint)" }}>{label}</p><p className="mt-1 text-[18px] font-semibold" style={{ color: "var(--app-text)" }}>{value}</p></div>;
}

function RoomActivityChart({ days, colour }: { days: Array<{ day: string; seconds: number; sessions: number }>; colour: string }) {
  const max = Math.max(1, ...days.map((day) => day.seconds));
  return <section className="rounded-lg p-5" style={{ background: "var(--app-surface)", boxShadow: "var(--elev-1)" }} aria-label="Room activity in the past seven days">
    <h2 className="text-[16px] font-semibold" style={{ color: "var(--app-text)" }}>Room activity · past 7 days</h2>
    <div className="mt-4 grid grid-cols-7 gap-2">{days.map((day) => <div key={day.day} className="flex flex-col items-center justify-end gap-2" title={`${day.day}: ${formatDuration(day.seconds)} across ${day.sessions} focus sessions`}>
      <span className="text-[10px] tabular-nums" style={{ color: "var(--app-text-muted)" }}>{formatDuration(day.seconds)}</span>
      <div className="flex h-20 w-full items-end rounded-sm" style={{ background: "var(--app-surface-soft)" }}><div className="w-full rounded-sm" style={{ height: `${Math.max(day.seconds ? 8 : 0, (day.seconds / max) * 100)}%`, background: roomColour(colour) }} /></div>
      <span className="text-[11px]" style={{ color: "var(--app-text-faint)" }}>{new Date(`${day.day}T12:00:00Z`).toLocaleDateString("en-AU", { weekday: "short" })}</span>
    </div>)}</div>
    <p className="mt-3 text-[11px]" style={{ color: "var(--app-text-faint)" }}>Completed focus sessions, grouped by UTC day.</p>
  </section>;
}

/** A 1s clock, only while someone's timer is actually running. */
function useNow(ticking: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!ticking) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [ticking]);
  return now;
}

function elapsedSeconds(member: StudyRoomMember, now: number): number {
  if (member.activity === "idle" || !member.startedAt) return 0;
  return Math.max(0, Math.floor((now - Date.parse(member.startedAt)) / 1000));
}

/** Logged time today plus the focus session still on the clock. */
function liveTodaySeconds(member: StudyRoomMember, now: number): number {
  return member.todaySeconds + (member.activity === "focus" ? elapsedSeconds(member, now) : 0);
}

function formatClock(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const mm = String(m).padStart(h > 0 ? 2 : 1, "0");
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

function formatDuration(totalSeconds: number): string {
  const totalMin = Math.floor(totalSeconds / 60);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

function initial(name: string): string {
  return (name.trim()[0] ?? "?").toUpperCase();
}
