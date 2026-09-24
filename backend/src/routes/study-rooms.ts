import { and, asc, count, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { Hono } from "hono";
import { db, schema, type Database } from "../db";
import { roomReportEmail, sendEmail } from "../lib/email";
import { newId } from "../lib/ids";
import { containsRoomContactInfo, isObjectionableRoomMessage } from "../lib/moderation";
import { livePresence } from "../lib/presence";
import { effectiveTier, getUserTier, type Tier } from "../lib/tiers";
import { DAY, iso, startOfLocalDay } from "../lib/time";
import type { Env, Variables } from "../types";

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
    ownerUserId: room.ownerUserId,
    createdAt: iso(room.createdAt),
    ...extra,
  };
}

/**
 * Everything the room dashboard shows: each member's live presence and their
 * focus total for their own local "today". Two reads, no writes.
 */
async function roomMembers(database: Database, roomId: string, now: number) {
  const rows = await database
    .select({
      userId: schema.studyRoomMembers.userId,
      displayName: schema.studyRoomMembers.displayName,
      joinedAt: schema.studyRoomMembers.joinedAt,
      timezone: schema.profiles.timezone,
      activity: schema.userPresence.activity,
      subject: schema.userPresence.subject,
      startedAt: schema.userPresence.startedAt,
      durationSeconds: schema.userPresence.durationSeconds,
      updatedAt: schema.userPresence.updatedAt,
    })
    .from(schema.studyRoomMembers)
    .leftJoin(schema.profiles, eq(schema.profiles.userId, schema.studyRoomMembers.userId))
    .leftJoin(schema.userPresence, eq(schema.userPresence.userId, schema.studyRoomMembers.userId))
    .where(eq(schema.studyRoomMembers.roomId, roomId))
    .orderBy(asc(schema.studyRoomMembers.joinedAt));

  if (rows.length === 0) return { members: [], sessions: [] };

  // Eight days covers local today and the rolling seven-day activity view.
  const sessions = await database
    .select({
      userId: schema.studySessions.userId,
      seconds: schema.studySessions.seconds,
      endedAt: schema.studySessions.endedAt,
    })
    .from(schema.studySessions)
    .where(
      and(
        inArray(
          schema.studySessions.userId,
          rows.map((row) => row.userId),
        ),
        eq(schema.studySessions.type, "focus"),
        gte(schema.studySessions.endedAt, now - 8 * DAY),
      ),
    );
  const joinedAtByUser = new Map(rows.map((row) => [row.userId, row.joinedAt]));
  const roomSessions = sessions.filter((session) => session.endedAt >= (joinedAtByUser.get(session.userId) ?? now));

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
            updatedAt: row.updatedAt,
          },
      now,
    );
    return {
      userId: row.userId,
      displayName: row.displayName,
      joinedAt: iso(row.joinedAt),
      activity: presence.activity,
      subject: presence.activity === "idle" ? null : presence.subject,
      startedAt: presence.startedAt === null ? null : iso(presence.startedAt),
      durationSeconds: presence.durationSeconds,
      updatedAt: presence.updatedAt === null ? null : iso(presence.updatedAt),
      todaySeconds,
      weekSeconds,
    };
  });
  return { members, sessions: roomSessions };
}

async function dashboard(database: Database, room: Room, userId: string) {
  const now = Date.now();
  const { members, sessions } = await roomMembers(database, room.id, now);
  const ownerTier = await getUserTier(database, room.ownerUserId);
  const capacity = ROOM_CAPACITY[ownerTier];
  const me = members.find((member) => member.userId === userId);
  if (!me) {
    // Enough for an invite link to say "Join <name>?" — nothing about who.
    return {
      isMember: false,
      room: { code: room.code, name: room.name, description: room.description, colour: room.colour, icon: room.icon, weeklyGoalMinutes: room.weeklyGoalMinutes, memberCount: members.length, capacity },
      members: [],
    };
  }
  const removedMembers = room.ownerUserId === userId
    ? await database
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
    : [];

  return {
    isMember: true,
    room: serialiseRoom(room, {
      joinedAt: me.joinedAt,
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
    }),
    members,
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
  const body = await c.req.json<{ name?: unknown; description?: unknown; colour?: unknown; icon?: unknown; weeklyGoalMinutes?: unknown }>().catch(() => null);
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
  if (body.icon !== undefined || body.weeklyGoalMinutes !== undefined) {
    const tier = await getUserTier(database, userId);
    if (tier === "free") return c.json({ error: "Room icon and shared weekly goal require Pro or Max." }, 403);
    if (body.icon !== undefined) {
      if (!ROOM_ICONS.some((value) => value === body.icon)) return c.json({ error: "Choose a listed room icon." }, 422);
      patch.icon = body.icon as string;
    }
    if (body.weeklyGoalMinutes !== undefined) {
      if (body.weeklyGoalMinutes !== null && (!Number.isInteger(body.weeklyGoalMinutes) || Number(body.weeklyGoalMinutes) < 60 || Number(body.weeklyGoalMinutes) > 60000)) return c.json({ error: "Set a shared goal between 1 and 1,000 hours per week." }, 422);
      patch.weeklyGoalMinutes = body.weeklyGoalMinutes as number | null;
    }
  }
  if (Object.keys(patch).length === 0) return c.json({ error: "Nothing to update." }, 422);
  await database.update(schema.studyRooms).set(patch).where(eq(schema.studyRooms.id, room.id));
  return c.json(await dashboard(database, { ...room, ...patch }, userId));
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
