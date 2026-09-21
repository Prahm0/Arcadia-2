import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import { db, schema } from "../db";
import { decryptToken, encryptToken } from "../lib/crypto";
import {
  authorizationUrl,
  exchangeCode,
  fetchEvents,
  redirectUri,
  refreshAccessToken,
  revokeToken,
  signState,
  verifyState,
} from "../lib/google-oauth";
import { newId } from "../lib/ids";
import { DAY } from "../lib/time";
import type { Env, Variables } from "../types";

const google = new Hono<{ Bindings: Env; Variables: Variables }>();

const SYNC_WINDOW_MS = 60 * DAY;
// If the access token has less than this left on it, refresh proactively so
// mid-request expiry doesn't cause a spurious 401 from the Calendar API.
const REFRESH_THRESHOLD_MS = 60 * 1000;

/**
 * Initiates the OAuth flow. Redirects the browser to Google's consent
 * screen with a signed `state` param carrying the userId so the callback
 * (which may or may not have the session cookie in flight) can attribute
 * the tokens correctly.
 */
google.get("/connect", async (c) => {
  const { userId } = c.get("session");
  if (!c.env.GOOGLE_CLIENT_ID || !c.env.GOOGLE_CLIENT_SECRET) {
    return c.json({ error: "Google Calendar isn't set up yet." }, 503);
  }
  const state = await signState(c.env, userId);
  const url = await authorizationUrl(c.env, state);
  return c.redirect(url);
});

/**
 * Google redirects back here after consent (or denial). Runs before the
 * session middleware — see `PUBLIC_PREFIXES` in index.ts — because the
 * redirect is a top-level navigation and the state signature is what
 * identifies the user.
 */
google.get("/callback", async (c) => {
  const code = c.req.query("code");
  const state = c.req.query("state");
  const errorParam = c.req.query("error");
  const settingsUrl = `${c.env.APP_ORIGIN}/app/settings`;

  // "User clicked Cancel" or "consent screen not published for this
  // account" — either way, no code came through. Bounce back to
  // Settings with a flag the UI already knows how to render.
  if (errorParam || !code || !state) {
    return c.redirect(`${settingsUrl}?google=denied`);
  }

  const userId = state ? await verifyState(c.env, state) : null;
  if (!userId) {
    return c.redirect(`${settingsUrl}?google=denied`);
  }

  try {
    const tokens = await exchangeCode(c.env, code);
    if (!c.env.TOKEN_ENCRYPTION_KEY) {
      throw new Error("TOKEN_ENCRYPTION_KEY missing on Worker.");
    }
    // We only get a refresh token on the first consent (or a re-consent with
    // prompt=consent). Persist whatever came back — the row-level UNIQUE
    // constraint on userId means "connect" idempotently upserts.
    const accessEnc = await encryptToken(tokens.accessToken, c.env.TOKEN_ENCRYPTION_KEY);
    const refreshEnc = tokens.refreshToken
      ? await encryptToken(tokens.refreshToken, c.env.TOKEN_ENCRYPTION_KEY)
      : null;

    const database = db(c.env.DB);
    const [existing] = await database
      .select()
      .from(schema.googleAccounts)
      .where(eq(schema.googleAccounts.userId, userId))
      .limit(1);

    if (existing) {
      await database
        .update(schema.googleAccounts)
        .set({
          accessTokenEnc: accessEnc,
          // Keep the previous refresh token if this consent didn't include
          // a new one — Google only re-issues on prompt=consent. Otherwise
          // we'd wipe our only means of refreshing later.
          refreshTokenEnc: refreshEnc ?? existing.refreshTokenEnc,
          expiresAt: tokens.expiresAt,
        })
        .where(eq(schema.googleAccounts.userId, userId));
    } else {
      await database.insert(schema.googleAccounts).values({
        userId,
        accessTokenEnc: accessEnc,
        refreshTokenEnc: refreshEnc,
        expiresAt: tokens.expiresAt,
      });
    }

    return c.redirect(`${settingsUrl}?google=connected`);
  } catch (err) {
    console.error("[google] callback failed", err);
    return c.redirect(`${settingsUrl}?google=denied`);
  }
});

google.post("/sync", async (c) => {
  const { userId } = c.get("session");
  const database = db(c.env.DB);

  const [row] = await database
    .select()
    .from(schema.googleAccounts)
    .where(eq(schema.googleAccounts.userId, userId))
    .limit(1);

  if (!row || !row.accessTokenEnc) {
    return c.json({ error: "Google Calendar isn't connected." }, 400);
  }
  if (!c.env.TOKEN_ENCRYPTION_KEY) {
    return c.json({ error: "Server misconfigured." }, 500);
  }

  let accessToken = await decryptToken(row.accessTokenEnc, c.env.TOKEN_ENCRYPTION_KEY);
  let expiresAt = row.expiresAt ?? 0;

  // Refresh eagerly if we're near or past expiry. If Google's clock and
  // ours disagree by a minute we'd rather refresh once than get a 401
  // mid-page.
  if (expiresAt - Date.now() < REFRESH_THRESHOLD_MS && row.refreshTokenEnc) {
    try {
      const refreshToken = await decryptToken(row.refreshTokenEnc, c.env.TOKEN_ENCRYPTION_KEY);
      const refreshed = await refreshAccessToken(c.env, refreshToken);
      accessToken = refreshed.accessToken;
      expiresAt = refreshed.expiresAt;
      const nextEnc = await encryptToken(refreshed.accessToken, c.env.TOKEN_ENCRYPTION_KEY);
      await database
        .update(schema.googleAccounts)
        .set({ accessTokenEnc: nextEnc, expiresAt: refreshed.expiresAt })
        .where(eq(schema.googleAccounts.userId, userId));
    } catch (err) {
      console.error("[google] refresh failed", err);
      return c.json({ error: "Google session expired. Reconnect Google Calendar." }, 401);
    }
  }

  const now = Date.now();
  let events;
  try {
    events = await fetchEvents(accessToken, { start: now, end: now + SYNC_WINDOW_MS });
  } catch (err) {
    console.error("[google] event fetch failed", err);
    return c.json({ error: "Couldn't reach Google Calendar." }, 502);
  }

  // Reconcile against previously-imported google events. Match by the
  // google-side id we stored in `externalUid` so re-syncs update in place
  // and disappeared events get pruned.
  const existing = await database
    .select({ id: schema.events.id, externalUid: schema.events.externalUid })
    .from(schema.events)
    .where(and(eq(schema.events.userId, userId), eq(schema.events.source, "google")));
  const existingByUid = new Map<string, string>();
  for (const e of existing) {
    if (e.externalUid) existingByUid.set(e.externalUid, e.id);
  }

  const seen = new Set<string>();
  for (const ev of events) {
    seen.add(ev.id);
    const description = [ev.description, ev.location].filter(Boolean).join(" · ").slice(0, 500);
    const existingId = existingByUid.get(ev.id);
    if (existingId) {
      await database
        .update(schema.events)
        .set({
          title: ev.title,
          subject: description || null,
          startAt: ev.startAt,
          endAt: ev.endAt,
          // Refresh `kind` on every sync so rows written before the
          // all-day handling landed get corrected on the next pass.
          kind: ev.allDay ? "all-day" : "external",
          editable: false,
          pinned: true,
        })
        .where(eq(schema.events.id, existingId));
    } else {
      await database.insert(schema.events).values({
        id: newId("evt"),
        userId,
        externalUid: ev.id,
        title: ev.title,
        subject: description || null,
        category: "external",
        kind: ev.allDay ? "all-day" : "external",
        startAt: ev.startAt,
        endAt: ev.endAt,
        status: "planned",
        outcome: "planned",
        source: "google",
        editable: false,
        pinned: true,
      });
    }
  }
  for (const [uid, id] of existingByUid) {
    if (!seen.has(uid)) {
      await database.delete(schema.events).where(eq(schema.events.id, id));
    }
  }

  const syncedAt = Date.now();
  await database
    .update(schema.googleAccounts)
    .set({ lastSyncAt: syncedAt })
    .where(eq(schema.googleAccounts.userId, userId));

  return c.json({
    ok: true,
    lastSyncAt: new Date(syncedAt).toISOString(),
    eventsWritten: events.length,
  });
});

google.delete("/connection", async (c) => {
  const { userId } = c.get("session");
  const database = db(c.env.DB);

  const [row] = await database
    .select()
    .from(schema.googleAccounts)
    .where(eq(schema.googleAccounts.userId, userId))
    .limit(1);

  // Even if we've somehow lost the row, wipe imported events so the UI is
  // consistent with "you clicked disconnect".
  if (row?.refreshTokenEnc && c.env.TOKEN_ENCRYPTION_KEY) {
    try {
      const refreshToken = await decryptToken(row.refreshTokenEnc, c.env.TOKEN_ENCRYPTION_KEY);
      await revokeToken(refreshToken);
    } catch {
      /* best-effort */
    }
  }

  await database
    .delete(schema.events)
    .where(and(eq(schema.events.userId, userId), eq(schema.events.source, "google")));
  await database
    .delete(schema.googleAccounts)
    .where(eq(schema.googleAccounts.userId, userId));

  return c.json({ ok: true });
});

// Small debug helper: lets us verify the exact URL we've registered in
// Google Cloud console matches what the Worker actually uses. Not routed
// through /connect so we can hit it without redirecting.
google.get("/config", async (c) => {
  return c.json({
    configured: Boolean(c.env.GOOGLE_CLIENT_ID && c.env.GOOGLE_CLIENT_SECRET),
    redirectUri: redirectUri(c.env),
  });
});

export default google;
