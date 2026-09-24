"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, type MouseEvent as ReactMouseEvent } from "react";
import { api, ApiError } from "@/lib/api/client";
import type { PlannerEvent } from "@/lib/api/types";
import { useDashboardData } from "@/lib/app/DashboardProvider";
import { useReplaceEvent } from "@/lib/app/useSessionPlan";
import { subjectColour } from "@/lib/app/subjectColour";
import {
  allowRoomMember,
  getRoom,
  joinRoom,
  leaveRoom,
  removeRoomMember,
  sendCheer,
  type RoomDashboard,
  type StudyRoomMember,
} from "@/lib/api/rooms";
import type { CheerKind } from "@/shared/roomFeed";
import AppButton from "./AppButton";
import CheckoutSheet from "./CheckoutSheet";
import { showContextMenu } from "./ContextMenu";
import PageHeader from "./PageHeader";
import { RoomMemberProfileSheet, RoomSettingsSheet } from "./RoomSocial";
import { pickSession } from "./StartNowCard";
import ActiveFocusCard, { ElsewhereFocusCard } from "./rooms/ActiveFocusCard";
import CheerToasts from "./rooms/CheerToasts";
import LiveMembers from "./rooms/LiveMembers";
import RoomActivity from "./rooms/RoomActivity";
import RoomChat from "./rooms/RoomChat";
import RoomGoal from "./rooms/RoomGoal";
import RoomHeader from "./rooms/RoomHeader";
import RoomLeaderboard from "./rooms/RoomLeaderboard";
import StartFocusCard from "./rooms/StartFocusCard";
import { elapsedSeconds, formatDuration } from "./rooms/format";
import { useRoomFocus, type FinishedFocus } from "./rooms/useRoomFocus";

/**
 * How often the room re-reads itself. Timers tick locally in between, and your
 * own changes show at once, so this only bounds how fast other people's do.
 */
const POLL_MS = 15_000;
const WIDTH = 1120;

type MemberDashboard = Extract<RoomDashboard, { isMember: true }>;

/**
 * A study room as a live space: who's studying and on what, a way to start
 * (or join someone) right here, the room's standings and goal, what's been
 * happening, and the chat. Viewing never writes; starting a session does.
 */
export default function RoomView({ code }: { code: string }) {
  const router = useRouter();
  const { data, reload } = useDashboardData();
  const replaceEvent = useReplaceEvent();
  const userId = data.user.id;
  const [dash, setDash] = useState<RoomDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  // A failed poll keeps the last good data on screen and just says so.
  const [reconnecting, setReconnecting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);
  const [joinName, setJoinName] = useState("");
  const [profileId, setProfileId] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [cooldowns, setCooldowns] = useState<Record<string, string>>({});
  const [finished, setFinished] = useState<(FinishedFocus & { at: number }) | null>(null);
  const [checkout, setCheckout] = useState<{ event: PlannerEvent; minutes: number } | null>(null);

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

  const focus = useRoomFocus(userId, (done) => {
    setFinished({ ...done, at: Date.now() });
    const event = done.eventId ? data.events.find((item) => item.id === done.eventId) : null;
    if (event && !event.checkout) setCheckout({ event, minutes: Math.max(1, Math.round(done.seconds / 60)) });
    // The session saves in the background; read the room once it has landed.
    window.setTimeout(() => {
      void load();
      void reload().catch(() => {});
    }, 1500);
  });

  // Poll while the tab is visible; a hidden tab costs nothing and catches up
  // the moment it's looked at again.
  useEffect(() => {
    const first = window.setTimeout(() => void load(), 0);
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
      window.clearTimeout(first);
      stopPolling();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [load]);

  const member = dash?.isMember ? (dash as MemberDashboard) : null;

  // Your own session shows the moment you start it, not on the next poll.
  const members = useMemo<StudyRoomMember[]>(() => {
    if (!member) return [];
    const session = focus.session;
    return member.members.map((item) => {
      if (item.userId !== userId) return item;
      if (session) {
        return {
          ...item,
          activity: "focus",
          subject: session.subject,
          startedAt: new Date(session.startedAt).toISOString(),
          durationSeconds: Math.round((session.endsAt - session.startedAt) / 1000),
          groupHostId: session.groupHostId,
        };
      }
      // Until the room hears you stopped, don't show the session you just ended.
      const stale = finished && item.activity === "focus" && (!item.updatedAt || Date.parse(item.updatedAt) <= finished.at);
      return stale ? { ...item, activity: "idle", startedAt: null, durationSeconds: null, groupHostId: null } : item;
    });
  }, [member, focus.session, finished, userId]);

  const anyoneLive = members.some((item) => item.activity !== "idle");
  const now = useNow(anyoneLive);
  const me = members.find((item) => item.userId === userId) ?? null;
  const others = members.filter((item) => item.userId !== userId && item.activity === "focus");
  const allCooldowns = { ...(member?.cheers?.cooldowns ?? {}), ...cooldowns };
  const timezone = data.profile?.timezone || data.user.timezone || "Australia/Brisbane";
  const nextTask = useMemo(() => pickSession(data.events, now, timezone).target, [data.events, now, timezone]);
  const defaultSubject = data.subjects[0]?.name ?? "General";
  const colourOf = useCallback((subject: string | null) => subjectColour(data.subjects, subject), [data.subjects]);
  const isOwner = member?.room.ownerUserId === userId;
  const paidPlan = data.user.tier === "pro" || data.user.tier === "max";

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
    setActionError(null);
    try {
      await leaveRoom(code);
      router.push("/app/rooms");
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Couldn't leave the room.");
    }
  }

  async function removeMember(target: StudyRoomMember) {
    if (!confirm(`Remove ${target.displayName} from this room? They won't be able to rejoin until you allow them back.`)) return;
    setActionError(null);
    try {
      await removeRoomMember(code, target.userId);
      setProfileId(null);
      await load();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Couldn't remove that member.");
    }
  }

  async function allowMember(memberId: string) {
    setActionError(null);
    try {
      await allowRoomMember(code, memberId);
      await load();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Couldn't allow that person back in.");
    }
  }

  function startSession(options: { minutes: number; subject: string; topic?: string | null; eventId?: string | null }) {
    setFinished(null);
    setActionError(null);
    focus.start(options);
    // A planned block moves to now, as "Start now" on Today does.
    if (options.eventId) {
      const id = options.eventId;
      void api<{ event: PlannerEvent }>(`/api/events/${encodeURIComponent(id)}/start`, { method: "POST" })
        .then((response) => replaceEvent(response.event))
        .catch(() => {
          /* the session still runs; the block just isn't moved */
        });
    }
    window.setTimeout(() => void load(), 1500);
  }

  function joinSession(host: StudyRoomMember) {
    if (!host.startedAt || !host.durationSeconds) return;
    const startedAt = Date.parse(host.startedAt);
    const endsAt = startedAt + host.durationSeconds * 1000;
    // Your session goes on your subject: theirs if you study it too.
    const subject = data.subjects.find((item) => item.name === host.subject)?.name ?? defaultSubject;
    setFinished(null);
    focus.start({ minutes: Math.round((endsAt - Date.now()) / 60000), subject, join: { hostId: host.userId, startedAt, endsAt } });
    window.setTimeout(() => void load(), 1500);
  }

  async function cheer(target: StudyRoomMember, kind: CheerKind) {
    const { retryAt } = await sendCheer(code, target.userId, kind);
    setCooldowns((current) => ({ ...current, [target.userId]: retryAt }));
  }

  function memberMenu(event: ReactMouseEvent, target: StudyRoomMember) {
    showContextMenu(event, [
      { kind: "item", label: target.userId === userId ? "View your room card" : `View ${target.displayName}`, onSelect: () => setProfileId(target.userId) },
      target.userId !== userId && target.activity === "focus" && !focus.session && target.durationSeconds
        ? { kind: "item", label: "Join their session", onSelect: () => joinSession(target) }
        : null,
      isOwner && target.userId !== userId ? { kind: "separator" } : null,
      isOwner && target.userId !== userId ? { kind: "item", label: "Remove from room", danger: true, onSelect: () => void removeMember(target) } : null,
    ], target.displayName);
  }

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

  if (!member) {
    return (
      <>
        <PageHeader width={860} eyebrow="Rooms" title={dash ? `${dash.room.icon ? `${dash.room.icon} ` : ""}${dash.room.name}` : "Loading…"} />
        <div className="mx-auto flex w-full max-w-[860px] flex-col gap-6 px-6 py-8 sm:px-10">
          {actionError ? <ErrorNote text={actionError} /> : null}
          {loading && !dash ? (
            <p className="text-[13.5px]" style={{ color: "var(--app-text-muted)" }}>Loading…</p>
          ) : !dash && reconnecting ? (
            <div className="flex flex-wrap items-center gap-3">
              <p className="text-[13.5px]" style={{ color: "var(--app-danger)" }}>Couldn&apos;t load the room.</p>
              <AppButton variant="secondary" onClick={() => void load()}>Try again</AppButton>
            </div>
          ) : dash ? (
            <form onSubmit={join} className="rounded-lg p-6" style={{ background: "var(--app-surface)", boxShadow: "var(--elev-1)" }}>
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
                <AppButton type="submit" variant="primary" loading={joining}>Join room</AppButton>
              </div>
            </form>
          ) : null}
          <Link href="/app/rooms" className="text-[12.5px] font-medium underline underline-offset-4" style={{ color: "var(--app-text-muted)" }}>
            ← All rooms
          </Link>
        </div>
      </>
    );
  }

  const session = focus.session;
  const host = session?.groupHostId ? members.find((item) => item.userId === session.groupHostId) ?? null : null;
  const profileMember = profileId ? members.find((item) => item.userId === profileId) ?? null : null;

  return (
    <>
      <RoomHeader
        room={member.room}
        members={members}
        now={now}
        isOwner={isOwner}
        width={WIDTH}
        onSettings={() => setSettingsOpen(true)}
        onLeave={() => void leave()}
      />

      <div className="mx-auto flex w-full flex-col gap-6 px-6 pb-12 pt-5 sm:px-10" style={{ maxWidth: WIDTH }}>
        {actionError ? <ErrorNote text={actionError} /> : null}

        <div className="grid items-start gap-6 @5xl/main:grid-cols-[minmax(0,1fr)_320px]">
          <LiveMembers
            members={members}
            now={now}
            userId={userId}
            youAreFocusing={Boolean(session) || me?.activity === "focus"}
            cooldowns={allCooldowns}
            subjectColour={colourOf}
            onJoin={joinSession}
            onCheer={cheer}
            onProfile={(target) => setProfileId(target.userId)}
            onMemberMenu={memberMenu}
          />

          <aside className="flex flex-col gap-4" aria-label="Your session and the leaderboard">
            {finished && !session ? (
              <FinishedNote finished={finished} status={focus.save.status} receipt={focus.save.receipt} onDismiss={() => setFinished(null)} />
            ) : null}
            {session ? (
              <ActiveFocusCard
                remaining={focus.remaining}
                total={focus.total}
                subject={session.subject}
                subjectColour={colourOf(session.subject)}
                topic={session.topic}
                hostName={host?.displayName ?? null}
                others={others}
                cheers={me?.sessionCheers ?? 0}
                onFinish={() => void focus.finish()}
              />
            ) : me && me.activity === "focus" ? (
              <ElsewhereFocusCard member={me} elapsed={elapsedSeconds(me, now)} />
            ) : (
              <StartFocusCard
                subjects={data.subjects}
                defaultSubject={defaultSubject}
                paidPlan={paidPlan}
                nextTask={nextTask}
                others={others}
                now={now}
                onStart={startSession}
                onJoin={joinSession}
              />
            )}
            <RoomLeaderboard
              members={members}
              now={now}
              userId={userId}
              termLabel={member.room.term?.label ?? "30 days"}
              onProfile={(target) => setProfileId(target.userId)}
            />
          </aside>
        </div>

        <div className="grid items-start gap-4 @3xl/main:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)]">
          <RoomGoal room={member.room} members={members} now={now} isOwner={isOwner} onEdit={() => setSettingsOpen(true)} />
          <RoomActivity room={member.room} feed={member.feed ?? []} members={members} userId={userId} now={now} />
        </div>

        <RoomChat
          code={code}
          userId={userId}
          ownerUserId={member.room.ownerUserId}
          members={members}
          feed={member.feed ?? []}
          onMemberClick={setProfileId}
        />

        <div className="flex flex-wrap items-center justify-between gap-3 text-[12px]">
          <Link href="/app/rooms" className="font-medium underline underline-offset-4" style={{ color: "var(--app-text-muted)" }}>
            ← All rooms
          </Link>
          <p style={{ color: reconnecting ? "var(--app-danger)" : "var(--app-text-faint)" }}>
            {reconnecting ? "Reconnecting… showing the last update." : "Live. Timers tick as you watch; the room refreshes every few seconds."}
          </p>
        </div>
      </div>

      <CheerToasts code={code} cheers={member.cheers?.received ?? []} members={members} />

      <RoomMemberProfileSheet
        code={code}
        member={profileMember}
        isYou={profileMember?.userId === userId}
        canRemove={isOwner && Boolean(profileMember) && profileMember?.userId !== userId}
        onRemove={(target) => void removeMember(target)}
        onClose={() => setProfileId(null)}
      />

      {isOwner ? (
        <RoomSettingsSheet
          open={settingsOpen}
          onClose={() => setSettingsOpen(false)}
          code={code}
          room={member.room}
          removedMembers={member.removedMembers}
          isPaid={paidPlan}
          onSaved={setDash}
          onAllow={(id) => void allowMember(id)}
        />
      ) : null}

      {checkout ? (
        <CheckoutSheet
          open
          event={checkout.event}
          initialDone={[]}
          minutes={checkout.minutes}
          onClose={() => setCheckout(null)}
          onSaved={async (updated) => {
            replaceEvent(updated);
            await reload();
          }}
        />
      ) : null}
    </>
  );
}

function ErrorNote({ text }: { text: string }) {
  return (
    <div role="alert" className="rounded-md p-4 text-[13px]" style={{ background: "var(--app-surface-soft)", boxShadow: "var(--elev-inset)", color: "var(--app-danger)" }}>
      {text}
    </div>
  );
}

/** The moment after a session: how long it was, and what it earned. */
function FinishedNote({ finished, status, receipt, onDismiss }: {
  finished: FinishedFocus;
  status: "idle" | "saving" | "pending" | "saved";
  receipt: { stars: number; cards: string[]; xp: number };
  onDismiss: () => void;
}) {
  const logged = finished.seconds >= 30;
  const reward = receipt.cards.length
    ? `New streak card${receipt.cards.length === 1 ? "" : "s"} collected`
    : receipt.stars
      ? `${receipt.stars} new ${receipt.stars === 1 ? "star" : "stars"} on your streak cards`
      : receipt.xp
        ? `+${receipt.xp} XP`
        : null;
  return (
    <div role="status" className="app-enter flex items-start justify-between gap-3 rounded-lg px-4 py-3" style={{ background: "var(--app-surface)", boxShadow: "var(--elev-1)" }}>
      <div className="min-w-0 text-[13px]">
        <p className="font-medium" style={{ color: "var(--app-text)" }}>
          {logged ? `${finished.complete ? "Session done" : "Stopped"} · ${finished.seconds < 60 ? `${finished.seconds}s` : formatDuration(finished.seconds)} logged` : "Too short to log"}
        </p>
        {logged ? (
          <p className="mt-0.5" style={{ color: "var(--app-text-muted)" }}>
            {status === "saving" ? "Saving…" : status === "pending" ? "Waiting to sync, it'll retry." : reward ? <><span style={{ color: "var(--app-gold)" }}>✦</span> {reward}</> : "Saved to your streaks."}
            {status === "saved" && (receipt.cards.length || receipt.stars) ? (
              <Link href="/app/streaks" className="ml-1.5 underline underline-offset-2">View</Link>
            ) : null}
          </p>
        ) : null}
      </div>
      <button type="button" onClick={onDismiss} aria-label="Dismiss" className="grid h-6 w-6 shrink-0 place-items-center rounded ui-hover" style={{ color: "var(--app-text-faint)" }}>
        <svg viewBox="0 0 20 20" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M5 5l10 10M15 5L5 15" strokeLinecap="round" /></svg>
      </button>
    </div>
  );
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
