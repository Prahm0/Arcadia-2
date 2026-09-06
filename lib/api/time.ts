export function formatClock(iso: string, timezone: string): string {
  return new Intl.DateTimeFormat("en-AU", {
    timeZone: timezone,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  })
    .format(new Date(iso))
    .replace(" ", "")
    .toLowerCase();
}

export function formatRange(startIso: string, endIso: string, timezone: string): string {
  return `${formatClock(startIso, timezone)}–${formatClock(endIso, timezone)}`;
}

export function formatDurationMinutes(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours === 0) return `${mins} min`;
  if (mins === 0) return `${hours} hr`;
  return `${hours} hr ${mins} min`;
}

export function isToday(iso: string, timezone: string): boolean {
  const target = dateKey(iso, timezone);
  const today = dateKey(new Date().toISOString(), timezone);
  return target === today;
}

export function dateKey(iso: string, timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(iso));
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function formatFriendlyDate(iso: string, timezone: string): string {
  return new Intl.DateTimeFormat("en-AU", {
    timeZone: timezone,
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date(iso));
}

export function formatDueSoon(dueIso: string, timezone: string): string {
  const dueKey = dateKey(dueIso, timezone);
  const todayKey = dateKey(new Date().toISOString(), timezone);
  const dueMs = new Date(`${dueKey}T00:00:00Z`).getTime();
  const todayMs = new Date(`${todayKey}T00:00:00Z`).getTime();
  const days = Math.round((dueMs - todayMs) / 86_400_000);
  if (days <= 0) return "Due today";
  if (days === 1) return "Due tomorrow";
  if (days < 7) return `Due in ${days} days`;
  return `Due ${new Intl.DateTimeFormat("en-AU", { timeZone: timezone, weekday: "short", day: "numeric", month: "short" }).format(new Date(dueIso))}`;
}
