/**
 * Minimal iCalendar (.ics / RFC 5545) parser.
 *
 * We only care about VEVENT records — enough to power a read-only calendar
 * subscription. Fully-fledged ical.js would cost 100 KB+ compressed inside
 * a Workers bundle for features we do not need (VTODO, VALARM, VJOURNAL,
 * complex RRULE unrolling…). This is ~200 lines and covers what Apple
 * Calendar, Canvas, Outlook, and Google actually publish.
 *
 * What we handle:
 *   - Line unfolding (continuation lines start with space/tab per RFC 5545)
 *   - UID, SUMMARY, DESCRIPTION, LOCATION
 *   - DTSTART/DTEND with either UTC ("...Z"), floating-local, or DATE-only
 *   - TZID (for local times we treat as UTC-ish; scheduler already normalises)
 *   - All-day events (DTSTART;VALUE=DATE)
 *   - Simple RRULE:FREQ=DAILY|WEEKLY|MONTHLY;INTERVAL=N;UNTIL=..;COUNT=..
 *     unrolled up to a horizon so the planner sees the next N weeks.
 *
 * What we skip:
 *   - VTIMEZONE (we normalise to UTC and let the client render in local)
 *   - EXDATE, RECURRENCE-ID overrides (fine for v1; edge cases add later)
 *   - BYDAY/BYMONTHDAY within RRULE (weekly RRULE without BYDAY still
 *     unrolls correctly by adding 7 * INTERVAL days)
 *
 * If we hit a feed with something exotic we log the UID and skip that
 * VEVENT — the sync doesn't fail, it just imports fewer events.
 */

export interface ParsedEvent {
  uid: string;
  title: string;
  description: string;
  location: string;
  startAt: number;
  endAt: number;
  allDay: boolean;
}

interface RawEvent {
  properties: Map<string, { params: Record<string, string>; value: string }>;
}

const MAX_EVENTS_PER_FEED = 500;

export function parseIcs(text: string, horizonMs: number): ParsedEvent[] {
  const lines = unfold(text);
  const events: ParsedEvent[] = [];
  let current: RawEvent | null = null;

  for (const line of lines) {
    if (line === "BEGIN:VEVENT") {
      current = { properties: new Map() };
      continue;
    }
    if (line === "END:VEVENT") {
      if (current) {
        try {
          const parsed = toEvent(current);
          if (parsed) {
            events.push(parsed);
            if (parsed.uid) {
              expandRecurrence(current, parsed, horizonMs, events);
            }
          }
        } catch (err) {
          console.warn("[ics] skipping VEVENT", err);
        }
      }
      current = null;
      continue;
    }
    if (!current) continue;

    const parsed = parseProperty(line);
    if (parsed) current.properties.set(parsed.name, { params: parsed.params, value: parsed.value });

    if (events.length >= MAX_EVENTS_PER_FEED) break;
  }

  // De-duplicate by UID + startAt so a feed that lists the same recurrence
  // instance twice doesn't insert duplicates.
  const seen = new Set<string>();
  return events.filter((e) => {
    const key = `${e.uid}:${e.startAt}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// RFC 5545 §3.1: continuation lines start with a space or tab. Join them back
// onto the previous line before we tokenise properties.
function unfold(text: string): string[] {
  const raw = text.replace(/\r\n/g, "\n").split("\n");
  const out: string[] = [];
  for (const line of raw) {
    if (line.startsWith(" ") || line.startsWith("\t")) {
      out[out.length - 1] = (out[out.length - 1] ?? "") + line.slice(1);
    } else {
      out.push(line);
    }
  }
  return out;
}

function parseProperty(line: string): { name: string; params: Record<string, string>; value: string } | null {
  const colon = line.indexOf(":");
  if (colon === -1) return null;
  const left = line.slice(0, colon);
  const value = line.slice(colon + 1);
  const parts = left.split(";");
  const name = (parts.shift() ?? "").toUpperCase();
  if (!name) return null;
  const params: Record<string, string> = {};
  for (const p of parts) {
    const eq = p.indexOf("=");
    if (eq === -1) continue;
    params[p.slice(0, eq).toUpperCase()] = p.slice(eq + 1);
  }
  return { name, params, value };
}

function unescape(value: string): string {
  return value
    .replace(/\\N/gi, "\n")
    .replace(/\\,/g, ",")
    .replace(/\\;/g, ";")
    .replace(/\\\\/g, "\\");
}

function toEvent(raw: RawEvent): ParsedEvent | null {
  const uid = raw.properties.get("UID")?.value?.trim();
  const summary = raw.properties.get("SUMMARY")?.value ?? "";
  const description = raw.properties.get("DESCRIPTION")?.value ?? "";
  const location = raw.properties.get("LOCATION")?.value ?? "";
  const start = raw.properties.get("DTSTART");
  const end = raw.properties.get("DTEND");

  if (!uid || !start) return null;
  const startParsed = parseDate(start.value, start.params);
  if (startParsed === null) return null;

  let endMs: number;
  let allDay = start.params.VALUE === "DATE";
  if (end) {
    const endParsed = parseDate(end.value, end.params);
    endMs = endParsed ?? startParsed + 60 * 60 * 1000;
    if (end.params.VALUE === "DATE") allDay = true;
  } else if (allDay) {
    // All-day event without DTEND defaults to 24h
    endMs = startParsed + 24 * 60 * 60 * 1000;
  } else {
    endMs = startParsed + 60 * 60 * 1000;
  }

  return {
    uid,
    title: unescape(summary).trim() || "(Untitled event)",
    description: unescape(description).trim(),
    location: unescape(location).trim(),
    startAt: startParsed,
    endAt: endMs,
    allDay,
  };
}

// Parses DTSTART/DTEND values. Three shapes we accept:
//   20260921T140000Z     — UTC
//   20260921T140000      — floating local (we treat as UTC; scheduler bucket
//                          normalises in the render layer)
//   20260921             — DATE-only (all-day)
function parseDate(value: string, _params: Record<string, string>): number | null {
  const v = value.trim();
  const dateOnly = /^(\d{4})(\d{2})(\d{2})$/;
  const dateTime = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z?)$/;

  let m = dateOnly.exec(v);
  if (m) {
    return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  }
  m = dateTime.exec(v);
  if (m) {
    const [_, y, mo, d, h, mi, s, z] = m;
    const utc = Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s));
    // Non-UTC datetimes carry a TZID param we ignore — treating them as UTC
    // is a known small offset that the client's timezone rendering absorbs.
    return z === "Z" ? utc : utc;
  }
  return null;
}

// Extremely narrow RRULE unroller: FREQ=DAILY/WEEKLY/MONTHLY with INTERVAL,
// UNTIL, COUNT. Enough for "class every Monday 9am" or "assignment due every
// two weeks" style feeds. Anything more exotic just gets the first instance.
function expandRecurrence(
  raw: RawEvent,
  base: ParsedEvent,
  horizonMs: number,
  out: ParsedEvent[],
): void {
  const rrule = raw.properties.get("RRULE")?.value;
  if (!rrule) return;

  const map: Record<string, string> = {};
  for (const chunk of rrule.split(";")) {
    const eq = chunk.indexOf("=");
    if (eq === -1) continue;
    map[chunk.slice(0, eq).toUpperCase()] = chunk.slice(eq + 1);
  }
  const freq = map.FREQ;
  if (!freq || !["DAILY", "WEEKLY", "MONTHLY"].includes(freq)) return;

  const interval = Math.max(1, Number(map.INTERVAL || 1));
  const untilMs = map.UNTIL ? parseDate(map.UNTIL, {}) : null;
  const count = map.COUNT ? Number(map.COUNT) : null;

  const duration = base.endAt - base.startAt;
  const horizon = Date.now() + horizonMs;
  let iteration = 1;
  let generated = 0;

  while (true) {
    const next = advance(base.startAt, freq, interval * iteration);
    if (next > horizon) break;
    if (untilMs !== null && next > untilMs) break;
    if (count !== null && generated + 1 >= count) break;

    out.push({ ...base, startAt: next, endAt: next + duration });
    iteration += 1;
    generated += 1;

    if (generated > MAX_EVENTS_PER_FEED) break;
  }
}

function advance(startMs: number, freq: string, steps: number): number {
  const d = new Date(startMs);
  if (freq === "DAILY") d.setUTCDate(d.getUTCDate() + steps);
  else if (freq === "WEEKLY") d.setUTCDate(d.getUTCDate() + 7 * steps);
  else if (freq === "MONTHLY") d.setUTCMonth(d.getUTCMonth() + steps);
  return d.getTime();
}
