import { and, asc, count, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { Hono } from "hono";
import { db, schema, type Database } from "../db";
import { roomReportEmail, sendEmail } from "../lib/email";
import { newId } from "../lib/ids";
import { containsRoomContactInfo, isObjectionableRoomMessage } from "../lib/moderation";
import { livePresence } from "../lib/presence";
import { currentTerm } from "../lib/terms";
import { effectiveTier, getUserTier, type Tier } from "../lib/tiers";
import { DAY, iso, localDateKey, startOfLocalDay } from "../lib/time";
import type { Env, Variables } from "../types";
import {
  CHEER_COOLDOWN_MS,
  CHEERS_PER_HOUR,
  buildRoomFeed,
  cheersDuring,
  isCheerKind,
} from "../../../shared/roomFeed";

/** Room size follows the owner's subscription. Guests can join any room. */
const ROOM_CAPACITY: Record<Tier, number> = { free: 12, pro: 30, max: 50 };
const MAX_OWNED_ROOMS = 10;
const MAX_MEMBERSHIPS = 30;
const ROOM_COLOURS = ["slate", "blue", "green", "purple", "orange", "pink"] as const;
const ROOM_ICONS = ["", "📚", "🎯", "🧪", "✏️", "🌙", "⚡"] as const;

// No 0/O or 1/I, so a code read aloud or off a phone screen types cleanly.
// 32 symbols keeps `byte % 32` unbiased.
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 6;
const MAX_REPORTS_PER_DAY = 10;
const MAX_MESSAGES_PER_MINUTE = 20;
const REPORT_REASONS = ["bullying_harassment", "hateful_sexual", "spam", "other"] as const;
type ReportReason = (typeof REPORT_REASONS)[number];
/** How long a cheer stays "new" for the person it was sent to. */
const CHEER_TOAST_MS = 10 * 60_000;

type Room = typeof schema.studyRooms.$inferSelect;

function newRoomCode(): string {
  const bytes = new Uint8Array(CODE_LENGTH);
  crypto.getRandomValues(bytes);
  let out = "";
  for (const byte of bytes) out += CODE_ALPHABET[byte % CODE_ALPHABET.length];
  return out;
}

function normaliseCode(raw: string): string {
  return raw.trim().toUpperCase();
}

function cleanName(raw: unknown, max: number): string {
  return typeof raw === "string" ? raw.replace(/\s+/g, " ").trim().slice(0, max) : "";
}

async function isRoomMember(database: Database, roomId: string, userId: string): Promise<boolean> {
  const [member] = await database.select({ userId: schema.studyRoomMembers.userId })
    .from(schema.studyRoomMembers)
    .where(and(eq(schema.studyRoomMembers.roomId, roomId), eq(schema.studyRoomMembers.userId, userId)))
    .limit(1);
  return Boolean(member);
}

async function findRoom(database: Database, code: string): Promise<Room | undefined> {
  const [room] = await database
    .select()
    .from(schema.studyRooms)
    .where(eq(schema.studyRooms.code, normaliseCode(code)))
    .limit(1);
  return room;
}

/** The name a user shows up as when they don't pick one for the room. */
async function defaultDisplayName(database: Database, userId: string): Promise<string> {
  const [row] = await database
    .select({ displayName: schema.profiles.displayName, name: schema.users.name })
    .from(schema.users)
    .leftJoin(schema.profiles, eq(schema.profiles.userId, schema.users.id))
    .where(eq(schema.users.id, userId))
    .limit(1);
  return cleanName(row?.displayName, 40) || cleanName(row?.name, 40) || "Student";
}

function serialiseRoom(room: Room, extra: Record<string, unknown> = {}) {
  return {
    id: room.id,
    code: room.code,
    name: room.name,
    description: room.description,
    colour: room.colour,
    icon: room.icon,
    weeklyGoalMinutes: room.weeklyGoalMinutes,
    dailyGoalMinutes: room.dailyGoalMinutes,
    ownerUserId: room.ownerUserId,
    createdAt: iso(room.createdAt),
    ...extra,
  };
}

/**
 * Everything the room dashboard shows about its people: live presence, focus
 * totals for their own local "today", the past 7 days, the term and all time
 * (only time since they joined counts), and the streak card they show off.
 */
async function roomMembers(database: Database, roomId: string, now: number, termStart: number) {
  const rows = await database
    .select({
      userId: schema.studyRoomMembers.userId,
      displayName: schema.studyRoomMembers.displayName,
      joinedAt: schema.studyRoomMembers.joinedAt,
      timezone: schema.profiles.timezone,
      avatarColour: schema.profiles.avatarColour,
      developerAccess: schema.users.developerAccess,
      featured: schema.constellationPreferences.featured,
      activity: schema.userPresence.activity,
      subject: schema.userPresence.subject,
      startedAt: schema.userPresence.startedAt,
      durationSeconds: schema.userPresence.durationSeconds,
      groupHostId: schema.userPresence.groupHostId,
      updatedAt: schema.userPresence.updatedAt,
    })
    .from(schema.studyRoomMembers)
    .leftJoin(schema.profiles, eq(schema.profiles.userId, schema.studyRoomMembers.userId))
    .leftJoin(schema.users, eq(schema.users.id, schema.studyRoomMembers.userId))
    .leftJoin(schema.constellationPreferences, eq(schema.constellationPreferences.userId, schema.studyRoomMembers.userId))
    .leftJoin(schema.userPresence, eq(schema.userPresence.userId, schema.studyRoomMembers.userId))
    .where(eq(schema.studyRoomMembers.roomId, roomId))
    .orderBy(asc(schema.studyRoomMembers.joinedAt));

  if (rows.length === 0) return { members: [], sessions: [] };
  const userIds = rows.map((row) => row.userId);

  const [sessions, totals, cards] = await Promise.all([
    // Eight days covers local today and the rolling seven-day views.
    database
      .select({
        userId: schema.studySessions.userId,
        seconds: schema.studySessions.seconds,
        endedAt: schema.studySessions.endedAt,
      })
      .from(schema.studySessions)
      .where(
        and(
          inArray(schema.studySessions.userId, userIds),
          eq(schema.studySessions.type, "focus"),
          gte(schema.studySessions.endedAt, now - 8 * DAY),
        ),
      ),
    database
      .select({
        userId: schema.studySessions.userId,
        totalSeconds: sql<number>`coalesce(sum(${schema.studySessions.seconds}), 0)`,
        termSeconds: sql<number>`coalesce(sum(case when ${schema.studySessions.endedAt} >= ${termStart} then ${schema.studySessions.seconds} else 0 end), 0)`,
      })
      .from(schema.studySessions)
      .innerJoin(
        schema.studyRoomMembers,
        and(eq(schema.studyRoomMembers.userId, schema.studySessions.userId), eq(schema.studyRoomMembers.roomId, roomId)),
      )
      .where(and(eq(schema.studySessions.type, "focus"), gte(schema.studySessions.endedAt, schema.studyRoomMembers.joinedAt)))
      .groupBy(schema.studySessions.userId),
    // SQLite returns the bare column from the row max() picked: the newest card.
    database
      .select({
        userId: schema.constellationCards.userId,
        latest: schema.constellationCards.constellationId,
        latestAt: sql<number>`max(${schema.constellationCards.earnedAt})`,
        count: count(),
      })
      .from(schema.constellationCards)
      .where(inArray(schema.constellationCards.userId, userIds))
      .groupBy(schema.constellationCards.userId),
  ]);
  const joinedAtByUser = new Map(rows.map((row) => [row.userId, row.joinedAt]));
  const roomSessions = sessions.filter((session) => session.endedAt >= (joinedAtByUser.get(session.userId) ?? now));
  const totalsByUser = new Map(totals.map((row) => [row.userId, row]));
  const cardsByUser = new Map(cards.map((row) => [row.userId, row]));

  const members = rows.map((row) => {
    const dayStart = startOfLocalDay(now, row.timezone ?? "Australia/Brisbane");
    const todaySeconds = roomSessions
      .filter((session) => session.userId === row.userId && session.endedAt >= dayStart)
      .reduce((sum, session) => sum + session.seconds, 0);
    const weekSeconds = roomSessions
      .filter((session) => session.userId === row.userId && session.endedAt >= now - 7 * DAY)
      .reduce((sum, session) => sum + session.seconds, 0);
    const presence = livePresence(
      row.activity === null || row.updatedAt === null
        ? null
        : {
            activity: row.activity,
            subject: row.subject,
            startedAt: row.startedAt,
            durationSeconds: row.durationSeconds,
            groupHostId: row.groupHostId,
            updatedAt: row.updatedAt,
          },
      now,
    );
    const total = totalsByUser.get(row.userId);
    const card = cardsByUser.get(row.userId);
    return {
      userId: row.userId,
      displayName: row.displayName,
      joinedAt: row.joinedAt,
      avatarColour: row.avatarColour ?? null,
      developerAccess: row.developerAccess ?? false,
      // The card they chose to feature, else the newest one they collected.
      constellation: card ? { id: row.featured ?? card.latest, cards: Number(card.count) } : null,
      activity: presence.activity,
      subject: presence.activity === "idle" ? null : presence.subject,
      startedAt: presence.startedAt,
      durationSeconds: presence.durationSeconds,
      groupHostId: presence.groupHostId,
      updatedAt: presence.updatedAt,
      todaySeconds,
      weekSeconds,
      termSeconds: Number(total?.termSeconds ?? 0),
      totalSeconds: Number(total?.totalSeconds ?? 0),
    };
  });
  return { members, sessions: roomSessions };
}

async function dashboard(database: Database, room: Room, userId: string) {
  const now = Date.now();
  const [viewer] = await database
    .select({ timezone: schema.profiles.timezone, state: schema.profiles.state })
    .from(schema.profiles)
    .where(eq(schema.profiles.userId, userId))
    .limit(1);
  const timezone = viewer?.timezone ?? "Australia/Brisbane";
  // "Term" is the viewer's school term; without a known calendar, 30 days.
  const term = currentTerm(viewer?.state, localDateKey(now, timezone));
  const termStart = term ? startOfLocalDay(Date.parse(`${term.start}T12:00:00Z`), timezone) : now - 30 * DAY;

  const { members, sessions } = await roomMembers(database, room.id, now, termStart);
  const ownerTier = await getUserTier(database, room.ownerUserId);
  const capacity = ROOM_CAPACITY[ownerTier];
  const me = members.find((member) => member.userId === userId);
  if (!me) {
    // Enough for an invite link to say "Join <name>?" — nothing about who.
    return {
      isMember: false,
      room: { code: room.code, name: room.name, description: room.description, colour: room.colour, icon: room.icon, weeklyGoalMinutes: room.weeklyGoalMinutes, dailyGoalMinutes: room.dailyGoalMinutes, memberCount: members.length, capacity },
      members: [],
    };
  }
  const [removedMembers, cheerRows, blocks] = await Promise.all([
    room.ownerUserId === userId
      ? database
        .select({
          userId: schema.studyRoomRemovedMembers.userId,
          profileName: schema.profiles.displayName,
          accountName: schema.users.name,
          removedAt: schema.studyRoomRemovedMembers.removedAt,
        })
        .from(schema.studyRoomRemovedMembers)
        .leftJoin(schema.profiles, eq(schema.profiles.userId, schema.studyRoomRemovedMembers.userId))
        .leftJoin(schema.users, eq(schema.users.id, schema.studyRoomRemovedMembers.userId))
        .where(eq(schema.studyRoomRemovedMembers.roomId, room.id))
        .orderBy(desc(schema.studyRoomRemovedMembers.removedAt))
      : Promise.resolve([]),
    database
      .select({
        id: schema.studyRoomCheers.id,
        fromUserId: schema.studyRoomCheers.fromUserId,
        toUserId: schema.studyRoomCheers.toUserId,
        kind: schema.studyRoomCheers.kind,
        createdAt: schema.studyRoomCheers.createdAt,
      })
      .from(schema.studyRoomCheers)
      .where(and(eq(schema.studyRoomCheers.roomId, room.id), gte(schema.studyRoomCheers.createdAt, now - 2 * DAY)))
      .orderBy(desc(schema.studyRoomCheers.createdAt))
      .limit(300),
    database
      .select({ blockedUserId: schema.userBlocks.blockedUserId })
      .from(schema.userBlocks)
      .where(eq(schema.userBlocks.blockerUserId, userId)),
  ]);
  // Someone you blocked can't cheer you, or show up cheering in your feed.
  const blocked = new Set(blocks.map((block) => block.blockedUserId));
  const cheers = cheerRows.filter((cheer) => !blocked.has(cheer.fromUserId));
  const dayStart = startOfLocalDay(now, timezone);

  const feed = buildRoomFeed({
    members: members.map((member) => ({
      userId: member.userId,
      joinedAt: member.joinedAt,
      activity: member.activity,
      subject: member.subject,
      startedAt: member.startedAt,
      groupHostId: member.groupHostId,
    })),
    sessions,
    cheers,
    now,
    dayStart,
    dailyGoalSeconds: room.dailyGoalMinutes ? room.dailyGoalMinutes * 60 : null,
  });

  return {
    isMember: true,
    room: serialiseRoom(room, {
      joinedAt: iso(me.joinedAt),
      memberCount: members.length,
      capacity,
      studyingCount: members.filter((member) => member.activity === "focus").length,
      todaySeconds: members.reduce((sum, member) => sum + member.todaySeconds, 0),
      weekSeconds: members.reduce((sum, member) => sum + member.weekSeconds, 0),
      weekActivity: Array.from({ length: 7 }, (_, offset) => {
        const day = new Date(now - (6 - offset) * DAY).toISOString().slice(0, 10);
        const matching = sessions.filter((session) => new Date(session.endedAt).toISOString().slice(0, 10) === day);
        return { day, seconds: matching.reduce((sum, session) => sum + session.seconds, 0), sessions: matching.length };
      }),
      term: { label: term ? `Term ${term.term}` : "30 days", since: iso(termStart) },
    }),
    members: members.map((member) => ({
      ...member,
      joinedAt: iso(member.joinedAt),
      startedAt: member.startedAt === null ? null : iso(member.startedAt),
      updatedAt: member.updatedAt === null ? null : iso(member.updatedAt),
      sessionCheers: member.activity === "focus" && member.startedAt !== null
        ? cheersDuring(cheers, member.userId, member.startedAt, now)
        : 0,
    })),
    feed: feed.map((event) => ({ ...event, at: iso(event.at) })),
    cheers: {
      received: cheers
        .filter((cheer) => cheer.toUserId === userId && cheer.createdAt >= now - CHEER_TOAST_MS)
        .map((cheer) => ({ id: cheer.id, fromUserId: cheer.fromUserId, kind: cheer.kind, createdAt: iso(cheer.createdAt) })),
      // When each person can next be cheered by you. Oldest first, so the
      // newest cheer to each person is the one that sticks.
      cooldowns: Object.fromEntries(
        [...cheers]
          .reverse()
          .filter((cheer) => cheer.fromUserId === userId && cheer.createdAt > now - CHEER_COOLDOWN_MS)
          .map((cheer) => [cheer.toUserId, iso(cheer.createdAt + CHEER_COOLDOWN_MS)]),
      ),
    },
    removedMembers: removedMembers.map((member) => ({
      userId: member.userId,
      displayName: cleanName(member.profileName, 40) || cleanName(member.accountName, 40) || "Student",
      removedAt: iso(member.removedAt),
    })),
  };
}


const studyRooms = new Hono<{ Bindings: Env; Variables: Variables }>();

studyRooms.get("/blocked", async (c) => {
  const { userId } = c.get("session");
  const database = db(c.env.DB);
  const rows = await database
    .select({
      userId: schema.userBlocks.blockedUserId,
      profileName: schema.profiles.displayName,
      accountName: schema.users.name,
      createdAt: schema.userBlocks.createdAt,
    })
    .from(schema.userBlocks)
    .leftJoin(schema.profiles, eq(schema.profiles.userId, schema.userBlocks.blockedUserId))
    .leftJoin(schema.users, eq(schema.users.id, schema.userBlocks.blockedUserId))
    .where(eq(schema.userBlocks.blockerUserId, userId))
    .orderBy(desc(schema.userBlocks.createdAt));
  return c.json({
    people: rows.map((person) => ({
      userId: person.userId,
      displayName: cleanName(person.profileName, 40) || cleanName(person.accountName, 40) || "Student",
      blockedAt: iso(person.createdAt),
    })),
  });
});

studyRooms.delete("/blocked/:userId", async (c) => {
  const { userId } = c.get("session");
  const database = db(c.env.DB);
  await database
    .delete(schema.userBlocks)
    .where(and(eq(schema.userBlocks.blockerUserId, userId), eq(schema.userBlocks.blockedUserId, c.req.param("userId"))));
  return c.json({ ok: true });
});

studyRooms.get("/", async (c) => {
  const { userId } = c.get("session");
  const database = db(c.env.DB);

  const mine = await database
    .select({ room: schema.studyRooms, joinedAt: schema.studyRoomMembers.joinedAt })
    .from(schema.studyRoomMembers)
    .innerJoin(schema.studyRooms, eq(schema.studyRooms.id, schema.studyRoomMembers.roomId))
    .where(eq(schema.studyRoomMembers.userId, userId))
    .orderBy(asc(schema.studyRoomMembers.joinedAt));
  if (mine.length === 0) return c.json({ rooms: [] });

  const memberRows = await database
    .select({
      roomId: schema.studyRoomMembers.roomId,
      activity: schema.userPresence.activity,
      subject: schema.userPresence.subject,
      startedAt: schema.userPresence.startedAt,
      durationSeconds: schema.userPresence.durationSeconds,
      updatedAt: schema.userPresence.updatedAt,
    })
    .from(schema.studyRoomMembers)
    .leftJoin(schema.userPresence, eq(schema.userPresence.userId, schema.studyRoomMembers.userId))
    .where(
      inArray(
        schema.studyRoomMembers.roomId,
        mine.map((entry) => entry.room.id),
      ),
    );

  const now = Date.now();
  const ownerIds = [...new Set(mine.map(({ room }) => room.ownerUserId))];
  const tiers = await database.select({ id: schema.users.id, tier: schema.users.tier, developerAccess: schema.users.developerAccess, developerTier: schema.users.developerTier, proBonusUntil: schema.users.proBonusUntil }).from(schema.users).where(inArray(schema.users.id, ownerIds));
  const capacityByOwner = new Map(tiers.map((row) => [row.id, ROOM_CAPACITY[effectiveTier(row.tier, row.developerAccess, row.proBonusUntil, Date.now(), row.developerTier)]]));
  return c.json({
    rooms: mine.map(({ room, joinedAt }) => {
      const members = memberRows.filter((row) => row.roomId === room.id);
      const studyingCount = members.filter(
        (row) =>
          row.activity !== null &&
          row.updatedAt !== null &&
          livePresence(
            {
              activity: row.activity,
              subject: row.subject,
              startedAt: row.startedAt,
              durationSeconds: row.durationSeconds,
              updatedAt: row.updatedAt,
            },
            now,
          ).activity === "focus",
      ).length;
      return serialiseRoom(room, {
        joinedAt: iso(joinedAt),
        memberCount: members.length,
        capacity: capacityByOwner.get(room.ownerUserId) ?? ROOM_CAPACITY.free,
        studyingCount,
      });
    }),
  });
});

studyRooms.post("/", async (c) => {
  const { userId } = c.get("session");
  const body = await c.req.json<{ name?: string; description?: string; colour?: string; displayName?: string }>().catch(() => null);
  const name = cleanName(body?.name, 60);
  if (!name) return c.json({ error: "Give the room a name." }, 422);
  const description = cleanName(body?.description, 300);
  const colour = ROOM_COLOURS.find((value) => value === body?.colour) ?? "slate";

  const database = db(c.env.DB);
  const [[owned], [memberships]] = await Promise.all([
    database
      .select({ n: count() })
      .from(schema.studyRooms)
      .where(eq(schema.studyRooms.ownerUserId, userId)),
    database
      .select({ n: count() })
      .from(schema.studyRoomMembers)
      .where(eq(schema.studyRoomMembers.userId, userId)),
  ]);
  if ((owned?.n ?? 0) >= MAX_OWNED_ROOMS) {
    return c.json({ error: `You can own up to ${MAX_OWNED_ROOMS} rooms.` }, 409);
  }
  if ((memberships?.n ?? 0) >= MAX_MEMBERSHIPS) {
    return c.json({ error: `You can be in up to ${MAX_MEMBERSHIPS} rooms.` }, 409);
  }

  const displayName = cleanName(body?.displayName, 40) || (await defaultDisplayName(database, userId));

  // Room + owner membership land together or not at all. A code collision
  // fails the unique index, so just roll a new code.
  for (let attempt = 0; attempt < 5; attempt++) {
    const room: Room = {
      id: newId("room"),
      code: newRoomCode(),
      name,
      description,
      colour,
      icon: "",
      weeklyGoalMinutes: null,
      dailyGoalMinutes: null,
      ownerUserId: userId,
      createdAt: Date.now(),
    };
    try {
      await database.batch([
        database.insert(schema.studyRooms).values(room),
        database
          .insert(schema.studyRoomMembers)
          .values({ roomId: room.id, userId, displayName, joinedAt: room.createdAt }),
      ]);
    } catch (error) {
      if (String(error).includes("UNIQUE")) continue;
      throw error;
    }
    return c.json(
      { room: serialiseRoom(room, { joinedAt: iso(room.createdAt), memberCount: 1, studyingCount: 0, capacity: ROOM_CAPACITY[await getUserTier(database, userId)], todaySeconds: 0, weekSeconds: 0 }) },
      201,
    );
  }
  return c.json({ error: "Couldn't create the room. Try again." }, 503);
});

studyRooms.get("/:code", async (c) => {
  const { userId } = c.get("session");
  const database = db(c.env.DB);
  const room = await findRoom(database, c.req.param("code"));
  if (!room) return c.json({ error: "No room with that code." }, 404);
  return c.json(await dashboard(database, room, userId));
});

studyRooms.patch("/:code", async (c) => {
  const { userId } = c.get("session");
  const database = db(c.env.DB);
  const room = await findRoom(database, c.req.param("code"));
  if (!room) return c.json({ error: "No room with that code." }, 404);
  if (room.ownerUserId !== userId) return c.json({ error: "Only the room owner can edit it." }, 403);
  const body = await c.req.json<{ name?: unknown; description?: unknown; colour?: unknown; icon?: unknown; weeklyGoalMinutes?: unknown; dailyGoalMinutes?: unknown }>().catch(() => null);
  if (!body || typeof body !== "object") return c.json({ error: "Invalid request." }, 400);
  const patch: Partial<Room> = {};
  if (body.name !== undefined) {
    patch.name = cleanName(body.name, 60);
    if (!patch.name) return c.json({ error: "Give the room a name." }, 422);
  }
  if (body.description !== undefined) patch.description = cleanName(body.description, 300);
  if (body.colour !== undefined) {
    if (!ROOM_COLOURS.some((value) => value === body.colour)) return c.json({ error: "Choose a listed room colour." }, 422);
    patch.colour = body.colour as string;
  }
  if (body.icon !== undefined || body.weeklyGoalMinutes !== undefined || body.dailyGoalMinutes !== undefined) {
    const tier = await getUserTier(database, userId);
    if (tier === "free") return c.json({ error: "Room icon and shared goals require Pro or Max." }, 403);
    if (body.icon !== undefined) {
      if (!ROOM_ICONS.some((value) => value === body.icon)) return c.json({ error: "Choose a listed room icon." }, 422);
      patch.icon = body.icon as string;
    }
    if (body.weeklyGoalMinutes !== undefined) {
      if (body.weeklyGoalMinutes !== null && (!Number.isInteger(body.weeklyGoalMinutes) || Number(body.weeklyGoalMinutes) < 60 || Number(body.weeklyGoalMinutes) > 60000)) return c.json({ error: "Set a shared goal between 1 and 1,000 hours per week." }, 422);
      patch.weeklyGoalMinutes = body.weeklyGoalMinutes as number | null;
    }
    if (body.dailyGoalMinutes !== undefined) {
      if (body.dailyGoalMinutes !== null && (!Number.isInteger(body.dailyGoalMinutes) || Number(body.dailyGoalMinutes) < 30 || Number(body.dailyGoalMinutes) > 18000)) return c.json({ error: "Set a daily goal between 30 minutes and 300 hours." }, 422);
      patch.dailyGoalMinutes = body.dailyGoalMinutes as number | null;
    }
  }
  if (Object.keys(patch).length === 0) return c.json({ error: "Nothing to update." }, 422);
  await database.update(schema.studyRooms).set(patch).where(eq(schema.studyRooms.id, room.id));
  return c.json(await dashboard(database, { ...room, ...patch }, userId));
});

studyRooms.post("/:code/cheers", async (c) => {
  const { userId } = c.get("session");
  const body = await c.req.json<{ toUserId?: unknown; kind?: unknown }>().catch(() => null);
  const toUserId = typeof body?.toUserId === "string" ? body.toUserId : "";
  if (!toUserId || !isCheerKind(body?.kind)) return c.json({ error: "Pick a cheer to send." }, 422);
  if (toUserId === userId) return c.json({ error: "You can't cheer yourself on." }, 422);
  const database = db(c.env.DB);
  const room = await findRoom(database, c.req.param("code"));
  if (!room) return c.json({ error: "No room with that code." }, 404);
  const now = Date.now();
  const [[sender], [target], [recentPair], [recentAll], [blockedBy]] = await Promise.all([
    database.select({ userId: schema.studyRoomMembers.userId }).from(schema.studyRoomMembers)
      .where(and(eq(schema.studyRoomMembers.roomId, room.id), eq(schema.studyRoomMembers.userId, userId))).limit(1),
    database
      .select({
        activity: schema.userPresence.activity,
        subject: schema.userPresence.subject,
        startedAt: schema.userPresence.startedAt,
        durationSeconds: schema.userPresence.durationSeconds,
        updatedAt: schema.userPresence.updatedAt,
      })
      .from(schema.studyRoomMembers)
      .leftJoin(schema.userPresence, eq(schema.userPresence.userId, schema.studyRoomMembers.userId))
      .where(and(eq(schema.studyRoomMembers.roomId, room.id), eq(schema.studyRoomMembers.userId, toUserId)))
      .limit(1),
    database.select({ createdAt: schema.studyRoomCheers.createdAt }).from(schema.studyRoomCheers)
      .where(and(eq(schema.studyRoomCheers.fromUserId, userId), eq(schema.studyRoomCheers.toUserId, toUserId), gte(schema.studyRoomCheers.createdAt, now - CHEER_COOLDOWN_MS)))
      .orderBy(desc(schema.studyRoomCheers.createdAt)).limit(1),
    database.select({ n: count() }).from(schema.studyRoomCheers)
      .where(and(eq(schema.studyRoomCheers.roomId, room.id), eq(schema.studyRoomCheers.fromUserId, userId), gte(schema.studyRoomCheers.createdAt, now - 3_600_000))),
    database.select({ blockerUserId: schema.userBlocks.blockerUserId }).from(schema.userBlocks)
      .where(and(eq(schema.userBlocks.blockerUserId, toUserId), eq(schema.userBlocks.blockedUserId, userId))).limit(1),
  ]);
  if (!sender) return c.json({ error: "Join the room to cheer people on." }, 403);
  if (!target) return c.json({ error: "They're not in this room any more." }, 404);
  const presence = livePresence(
    target.activity === null || target.updatedAt === null
      ? null
      : { activity: target.activity, subject: target.subject, startedAt: target.startedAt, durationSeconds: target.durationSeconds, updatedAt: target.updatedAt },
    now,
  );
  if (presence.activity === "idle") return c.json({ error: "They've just stopped. Catch them next session." }, 409);
  if (recentPair) {
    return c.json({ error: "You just cheered them. Give it a few minutes.", retryAt: iso(recentPair.createdAt + CHEER_COOLDOWN_MS) }, 429);
  }
  if ((recentAll?.n ?? 0) >= CHEERS_PER_HOUR) return c.json({ error: "That's a lot of cheering. Try again in a bit." }, 429);

  const cheer = { id: newId("cheer"), roomId: room.id, fromUserId: userId, toUserId, kind: body.kind, createdAt: now };
  // Someone who blocked you never sees your cheer, and you aren't told.
  if (!blockedBy) await database.insert(schema.studyRoomCheers).values(cheer);
  return c.json({ ok: true, retryAt: iso(now + CHEER_COOLDOWN_MS) }, 201);
});

studyRooms.get("/:code/messages", async (c) => {
  const { userId } = c.get("session");
  const database = db(c.env.DB);
  const room = await findRoom(database, c.req.param("code"));
  if (!room) return c.json({ error: "No room with that code." }, 404);
  if (!(await isRoomMember(database, room.id, userId))) return c.json({ error: "Join the room to read its chat." }, 403);
  const rows = await database.select({
    id: schema.studyRoomMessages.id,
    userId: schema.studyRoomMessages.userId,
    body: schema.studyRoomMessages.body,
    createdAt: schema.studyRoomMessages.createdAt,
    displayName: schema.studyRoomMessages.displayName,
  }).from(schema.studyRoomMessages)
    .where(eq(schema.studyRoomMessages.roomId, room.id))
    .orderBy(desc(schema.studyRoomMessages.createdAt))
    .limit(50);
  const [blocks, reports] = await Promise.all([
    database
      .select({ blockedUserId: schema.userBlocks.blockedUserId })
      .from(schema.userBlocks)
      .where(eq(schema.userBlocks.blockerUserId, userId)),
    database
      .select({ messageId: schema.roomReports.messageId })
      .from(schema.roomReports)
      .where(and(eq(schema.roomReports.roomId, room.id), eq(schema.roomReports.reporterUserId, userId))),
  ]);
  const blockedUserIds = new Set(blocks.map((block) => block.blockedUserId));
  const reportedMessageIds = new Set(reports.map((report) => report.messageId));
  const visible = rows.filter((row) => !blockedUserIds.has(row.userId) && !reportedMessageIds.has(row.id));
  return c.json({ messages: visible.reverse().map((row) => ({ ...row, createdAt: iso(row.createdAt) })) });
});

studyRooms.post("/:code/messages", async (c) => {
  const { userId } = c.get("session");
  const database = db(c.env.DB);
  const room = await findRoom(database, c.req.param("code"));
  if (!room) return c.json({ error: "No room with that code." }, 404);
  if (!(await isRoomMember(database, room.id, userId))) return c.json({ error: "Join the room to chat." }, 403);
  const body = await c.req.json<{ body?: unknown }>().catch(() => null);
  const message = typeof body?.body === "string" ? body.body.trim() : "";
  if (!message || message.length > 500) return c.json({ error: "Messages must be 1–500 characters." }, 422);
  if (isObjectionableRoomMessage(message) || containsRoomContactInfo(message)) {
    return c.json({ error: "That message can't be sent in Arcadia." }, 422);
  }
  const createdAt = Date.now();
  const [recent] = await database.select({ n: count() })
    .from(schema.studyRoomMessages)
    .where(and(
      eq(schema.studyRoomMessages.roomId, room.id),
      eq(schema.studyRoomMessages.userId, userId),
      gte(schema.studyRoomMessages.createdAt, createdAt - 60 * 1000),
    ));
  if ((recent?.n ?? 0) >= MAX_MESSAGES_PER_MINUTE) return c.json({ error: "You've sent a lot of messages. Try again in a minute." }, 429);
  const [last] = await database.select({ createdAt: schema.studyRoomMessages.createdAt })
    .from(schema.studyRoomMessages)
    .where(and(eq(schema.studyRoomMessages.roomId, room.id), eq(schema.studyRoomMessages.userId, userId)))
    .orderBy(desc(schema.studyRoomMessages.createdAt)).limit(1);
  if (last && createdAt - last.createdAt < 2000) return c.json({ error: "Wait a moment before sending another message." }, 429);
  const [member] = await database.select({ displayName: schema.studyRoomMembers.displayName })
    .from(schema.studyRoomMembers)
    .where(and(eq(schema.studyRoomMembers.roomId, room.id), eq(schema.studyRoomMembers.userId, userId))).limit(1);
  const row = { id: newId("rmsg"), roomId: room.id, userId, displayName: member?.displayName ?? "Student", body: message, createdAt };
  await database.insert(schema.studyRoomMessages).values(row);
  return c.json({ message: { id: row.id, userId, body: message, createdAt: iso(createdAt), displayName: member?.displayName ?? "Student" } }, 201);
});

studyRooms.post("/:code/messages/:messageId/report", async (c) => {
  const { userId } = c.get("session");
  const database = db(c.env.DB);
  const room = await findRoom(database, c.req.param("code"));
  if (!room) return c.json({ error: "No room with that code." }, 404);
  if (!(await isRoomMember(database, room.id, userId))) return c.json({ error: "Join the room to report a message." }, 403);
  const body = await c.req.json<{ reason?: unknown; note?: unknown }>().catch(() => null);
  const reason = typeof body?.reason === "string" ? body.reason : "";
  const note = cleanName(body?.note, 300);
  if (!REPORT_REASONS.some((value) => value === reason)) return c.json({ error: "Choose a report reason." }, 422);
  const [message] = await database
    .select({ id: schema.studyRoomMessages.id, userId: schema.studyRoomMessages.userId, body: schema.studyRoomMessages.body })
    .from(schema.studyRoomMessages)
    .where(and(eq(schema.studyRoomMessages.roomId, room.id), eq(schema.studyRoomMessages.id, c.req.param("messageId"))))
    .limit(1);
  if (!message) return c.json({ error: "Message not found." }, 404);
  if (message.userId === userId) return c.json({ error: "You can't report your own message." }, 422);

  const [[reportCount], [existing]] = await Promise.all([
    database
      .select({ n: count() })
      .from(schema.roomReports)
      .where(and(eq(schema.roomReports.reporterUserId, userId), gte(schema.roomReports.createdAt, Date.now() - DAY))),
    database
      .select({ id: schema.roomReports.id })
      .from(schema.roomReports)
      .where(and(eq(schema.roomReports.reporterUserId, userId), eq(schema.roomReports.messageId, message.id)))
      .limit(1),
  ]);
  if (existing) return c.json({ ok: true, message: "Thanks. We'll review this within 24 hours." });
  if ((reportCount?.n ?? 0) >= MAX_REPORTS_PER_DAY) return c.json({ error: "You've reached today's report limit." }, 429);

  const report = {
    id: newId("report"), roomId: room.id, messageId: message.id, reporterUserId: userId,
    reportedUserId: message.userId, reason: reason as ReportReason, note, messageBody: message.body,
    createdAt: Date.now(), status: "open",
  };
  await database.insert(schema.roomReports).values(report);
  try {
    await sendEmail(c.env, {
      to: "teamarcadiahq@gmail.com",
      ...roomReportEmail({
        roomCode: room.code,
        reason: report.reason,
        note,
        messageBody: message.body,
        reporterUserId: userId,
        reportedUserId: message.userId,
      }),
    });
  } catch {
    console.error("[study-rooms] report email delivery failed");
  }
  return c.json({ ok: true, message: "Thanks. We'll review this within 24 hours." }, 201);
});

studyRooms.post("/:code/members/:memberId/block", async (c) => {
  const { userId } = c.get("session");
  const targetUserId = c.req.param("memberId");
  if (targetUserId === userId) return c.json({ error: "You can't block yourself." }, 422);
  const database = db(c.env.DB);
  const room = await findRoom(database, c.req.param("code"));
  if (!room) return c.json({ error: "No room with that code." }, 404);
  if (!(await isRoomMember(database, room.id, userId))) return c.json({ error: "Join the room to block a member." }, 403);
  const [[member], [messageAuthor]] = await Promise.all([
    database
      .select({ userId: schema.studyRoomMembers.userId })
      .from(schema.studyRoomMembers)
      .where(and(eq(schema.studyRoomMembers.roomId, room.id), eq(schema.studyRoomMembers.userId, targetUserId)))
      .limit(1),
    database
      .select({ userId: schema.studyRoomMessages.userId })
      .from(schema.studyRoomMessages)
      .where(and(eq(schema.studyRoomMessages.roomId, room.id), eq(schema.studyRoomMessages.userId, targetUserId)))
      .limit(1),
  ]);
  if (!member && !messageAuthor) return c.json({ error: "Member not found." }, 404);
  await database
    .insert(schema.userBlocks)
    .values({ blockerUserId: userId, blockedUserId: targetUserId, createdAt: Date.now() })
    .onConflictDoNothing();
  return c.json({ ok: true });
});

studyRooms.delete("/:code/messages/:messageId", async (c) => {
  const { userId } = c.get("session");
  const database = db(c.env.DB);
  const room = await findRoom(database, c.req.param("code"));
  if (!room) return c.json({ error: "No room with that code." }, 404);
  const [message] = await database.select({ userId: schema.studyRoomMessages.userId })
    .from(schema.studyRoomMessages)
    .where(and(eq(schema.studyRoomMessages.roomId, room.id), eq(schema.studyRoomMessages.id, c.req.param("messageId")))).limit(1);
  if (!message) return c.json({ error: "Message not found." }, 404);
  if (message.userId !== userId && room.ownerUserId !== userId) return c.json({ error: "You cannot remove this message." }, 403);
  await database.delete(schema.studyRoomMessages).where(and(eq(schema.studyRoomMessages.roomId, room.id), eq(schema.studyRoomMessages.id, c.req.param("messageId"))));
  return c.json({ ok: true });
});

studyRooms.post("/:code/members/:memberId/remove", async (c) => {
  const { userId } = c.get("session");
  const targetUserId = c.req.param("memberId");
  const database = db(c.env.DB);
  const room = await findRoom(database, c.req.param("code"));
  if (!room) return c.json({ error: "No room with that code." }, 404);
  if (room.ownerUserId !== userId) return c.json({ error: "Only the room owner can remove members." }, 403);
  if (targetUserId === userId) return c.json({ error: "The room owner can't be removed." }, 422);
  const [member] = await database
    .select({ userId: schema.studyRoomMembers.userId })
    .from(schema.studyRoomMembers)
    .where(and(eq(schema.studyRoomMembers.roomId, room.id), eq(schema.studyRoomMembers.userId, targetUserId)))
    .limit(1);
  if (!member) return c.json({ error: "Member not found." }, 404);
  await database.batch([
    database
      .insert(schema.studyRoomRemovedMembers)
      .values({ roomId: room.id, userId: targetUserId, removedAt: Date.now() })
      .onConflictDoUpdate({ target: [schema.studyRoomRemovedMembers.roomId, schema.studyRoomRemovedMembers.userId], set: { removedAt: Date.now() } }),
    database.delete(schema.studyRoomMembers).where(and(eq(schema.studyRoomMembers.roomId, room.id), eq(schema.studyRoomMembers.userId, targetUserId))),
  ]);
  return c.json({ ok: true });
});

studyRooms.delete("/:code/members/:memberId/removal", async (c) => {
  const { userId } = c.get("session");
  const database = db(c.env.DB);
  const room = await findRoom(database, c.req.param("code"));
  if (!room) return c.json({ error: "No room with that code." }, 404);
  if (room.ownerUserId !== userId) return c.json({ error: "Only the room owner can allow members back in." }, 403);
  await database
    .delete(schema.studyRoomRemovedMembers)
    .where(and(eq(schema.studyRoomRemovedMembers.roomId, room.id), eq(schema.studyRoomRemovedMembers.userId, c.req.param("memberId"))));
  return c.json({ ok: true });
});

studyRooms.get("/:code/members/:memberId", async (c) => {
  const { userId } = c.get("session");
  const database = db(c.env.DB);
  const room = await findRoom(database, c.req.param("code"));
  if (!room) return c.json({ error: "No room with that code." }, 404);
  if (!(await isRoomMember(database, room.id, userId))) return c.json({ error: "Join the room to view member profiles." }, 403);
  const memberId = c.req.param("memberId");
  const [member] = await database.select({
    displayName: schema.studyRoomMembers.displayName,
    joinedAt: schema.studyRoomMembers.joinedAt,
    avatarColour: schema.profiles.avatarColour,
    developerAccess: schema.users.developerAccess,
  }).from(schema.studyRoomMembers)
    .leftJoin(schema.profiles, eq(schema.profiles.userId, schema.studyRoomMembers.userId))
    .leftJoin(schema.users, eq(schema.users.id, schema.studyRoomMembers.userId))
    .where(and(eq(schema.studyRoomMembers.roomId, room.id), eq(schema.studyRoomMembers.userId, memberId))).limit(1);
  if (!member) return c.json({ error: "Member not found." }, 404);
  const now = Date.now();
  const [stats] = await database.select({
    weekSeconds: sql<number>`coalesce(sum(case when ${schema.studySessions.endedAt} >= ${now - 7 * DAY} then ${schema.studySessions.seconds} else 0 end), 0)`,
    totalSeconds: sql<number>`coalesce(sum(${schema.studySessions.seconds}), 0)`,
    sessions: count(),
  }).from(schema.studySessions)
    .where(and(eq(schema.studySessions.userId, memberId), eq(schema.studySessions.type, "focus")));
  return c.json({ profile: {
    userId: memberId,
    displayName: member.displayName,
    avatarColour: member.avatarColour,
    developerAccess: member.developerAccess ?? false,
    joinedAt: iso(member.joinedAt),
    weekSeconds: Number(stats?.weekSeconds ?? 0),
    totalSeconds: Number(stats?.totalSeconds ?? 0),
    sessions: Number(stats?.sessions ?? 0),
  } });
});

studyRooms.post("/:code/join", async (c) => {
  const { userId } = c.get("session");
  const body = await c.req.json<{ displayName?: string }>().catch(() => null);
  const database = db(c.env.DB);
  const room = await findRoom(database, c.req.param("code"));
  if (!room) return c.json({ error: "No room with that code." }, 404);

  const [existing] = await database
    .select({ userId: schema.studyRoomMembers.userId })
    .from(schema.studyRoomMembers)
    .where(and(eq(schema.studyRoomMembers.roomId, room.id), eq(schema.studyRoomMembers.userId, userId)))
    .limit(1);

  // Joining twice (double click, re-opened link) is a no-op, not an error.
  if (!existing) {
    const [removed] = await database
      .select({ userId: schema.studyRoomRemovedMembers.userId })
      .from(schema.studyRoomRemovedMembers)
      .where(and(eq(schema.studyRoomRemovedMembers.roomId, room.id), eq(schema.studyRoomRemovedMembers.userId, userId)))
      .limit(1);
    if (removed) return c.json({ error: "The room owner has removed you from this room." }, 403);
    const capacity = ROOM_CAPACITY[await getUserTier(database, room.ownerUserId)];
    const [[members], [memberships]] = await Promise.all([
      database
        .select({ n: count() })
        .from(schema.studyRoomMembers)
        .where(eq(schema.studyRoomMembers.roomId, room.id)),
      database
        .select({ n: count() })
        .from(schema.studyRoomMembers)
        .where(eq(schema.studyRoomMembers.userId, userId)),
    ]);
    if ((members?.n ?? 0) >= capacity) {
      return c.json({ error: `This room is full (${capacity} people).` }, 409);
    }
    if ((memberships?.n ?? 0) >= MAX_MEMBERSHIPS) {
      return c.json({ error: `You can be in up to ${MAX_MEMBERSHIPS} rooms.` }, 409);
    }
    const displayName = cleanName(body?.displayName, 40) || (await defaultDisplayName(database, userId));
    // The capacity check and insert must be one D1 statement: two concurrent
    // invites at the boundary must not both take the last place.
    const inserted = await c.env.DB.prepare(`
      INSERT INTO study_room_members (room_id, user_id, display_name, joined_at)
      SELECT ?, ?, ?, ?
      WHERE (SELECT count(*) FROM study_room_members WHERE room_id = ?) < ?
        AND (SELECT count(*) FROM study_room_members WHERE user_id = ?) < ?
      ON CONFLICT(room_id, user_id) DO NOTHING
    `).bind(room.id, userId, displayName, Date.now(), room.id, capacity, userId, MAX_MEMBERSHIPS).run();
    if (!inserted.meta.changes) return c.json({ error: "This room is full, or you've joined your maximum number of rooms." }, 409);
  }

  return c.json(await dashboard(database, room, userId));
});

studyRooms.post("/:code/leave", async (c) => {
  const { userId } = c.get("session");
  const database = db(c.env.DB);
  const room = await findRoom(database, c.req.param("code"));
  if (!room) return c.json({ error: "No room with that code." }, 404);

  const removed = await database
    .delete(schema.studyRoomMembers)
    .where(and(eq(schema.studyRoomMembers.roomId, room.id), eq(schema.studyRoomMembers.userId, userId)))
    .returning({ userId: schema.studyRoomMembers.userId });
  if (removed.length === 0) return c.json({ error: "You're not in this room." }, 404);

  const [next] = await database
    .select({ userId: schema.studyRoomMembers.userId })
    .from(schema.studyRoomMembers)
    .where(eq(schema.studyRoomMembers.roomId, room.id))
    .orderBy(asc(schema.studyRoomMembers.joinedAt))
    .limit(1);

  if (!next) {
    // Last one out: the room goes with them.
    await database.delete(schema.studyRooms).where(eq(schema.studyRooms.id, room.id));
  } else if (room.ownerUserId === userId) {
    // Ownership passes to whoever has been there longest.
    await database
      .update(schema.studyRooms)
      .set({ ownerUserId: next.userId })
      .where(eq(schema.studyRooms.id, room.id));
  }

  return c.json({ ok: true });
});

export default studyRooms;
