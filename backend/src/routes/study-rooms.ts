import { and, asc, count, eq, gte, inArray } from "drizzle-orm";
import { Hono } from "hono";
import { db, schema, type Database } from "../db";
import { newId } from "../lib/ids";
import { livePresence } from "../lib/presence";
import { HOUR, iso, startOfLocalDay } from "../lib/time";
import type { Env, Variables } from "../types";

/** Small on purpose: a room is a study group of friends, not a lobby. */
const MAX_MEMBERS = 20;
const MAX_OWNED_ROOMS = 10;
const MAX_MEMBERSHIPS = 30;

// No 0/O or 1/I, so a code read aloud or off a phone screen types cleanly.
// 32 symbols keeps `byte % 32` unbiased.
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 6;

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

  if (rows.length === 0) return [];

  // 36h covers "today" in every timezone; each member's own day is cut below.
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
        gte(schema.studySessions.endedAt, now - 36 * HOUR),
      ),
    );

  return rows.map((row) => {
    const dayStart = startOfLocalDay(now, row.timezone ?? "Australia/Brisbane");
    const todaySeconds = sessions
      .filter((session) => session.userId === row.userId && session.endedAt >= dayStart)
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
    };
  });
}

async function dashboard(database: Database, room: Room, userId: string) {
  const members = await roomMembers(database, room.id, Date.now());
  const me = members.find((member) => member.userId === userId);
  if (!me) {
    // Enough for an invite link to say "Join <name>?" — nothing about who.
    return {
      isMember: false,
      room: { code: room.code, name: room.name, memberCount: members.length },
      members: [],
    };
  }
  return {
    isMember: true,
    room: serialiseRoom(room, {
      joinedAt: me.joinedAt,
      memberCount: members.length,
      studyingCount: members.filter((member) => member.activity === "focus").length,
    }),
    members,
  };
}

const studyRooms = new Hono<{ Bindings: Env; Variables: Variables }>();

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
        studyingCount,
      });
    }),
  });
});

studyRooms.post("/", async (c) => {
  const { userId } = c.get("session");
  const body = await c.req.json<{ name?: string; displayName?: string }>().catch(() => null);
  const name = cleanName(body?.name, 60);
  if (!name) return c.json({ error: "Give the room a name." }, 422);

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
      { room: serialiseRoom(room, { joinedAt: iso(room.createdAt), memberCount: 1, studyingCount: 0 }) },
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
    if ((members?.n ?? 0) >= MAX_MEMBERS) {
      return c.json({ error: `This room is full (${MAX_MEMBERS} people).` }, 409);
    }
    if ((memberships?.n ?? 0) >= MAX_MEMBERSHIPS) {
      return c.json({ error: `You can be in up to ${MAX_MEMBERSHIPS} rooms.` }, 409);
    }
    const displayName = cleanName(body?.displayName, 40) || (await defaultDisplayName(database, userId));
    await database
      .insert(schema.studyRoomMembers)
      .values({ roomId: room.id, userId, displayName, joinedAt: Date.now() })
      .onConflictDoNothing();
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
