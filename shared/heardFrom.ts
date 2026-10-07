/** Answers to onboarding's "How did you hear about Arcadia?", shared by the app, API and admin. */
export const HEARD_FROM = [
  { key: "tiktok", label: "TikTok" },
  { key: "instagram", label: "Instagram" },
  { key: "youtube", label: "YouTube" },
  { key: "creator", label: "A creator I follow" },
  { key: "friend", label: "A friend" },
  { key: "app_store", label: "App Store" },
  { key: "google", label: "Google" },
  { key: "school", label: "School or a teacher" },
  { key: "other", label: "Somewhere else" },
] as const;

export type HeardFrom = (typeof HEARD_FROM)[number]["key"];

export function isHeardFrom(value: unknown): value is HeardFrom {
  return HEARD_FROM.some((option) => option.key === value);
}

export function heardFromLabel(key: string | null): string {
  if (!key) return "Not asked (joined before the question)";
  return HEARD_FROM.find((option) => option.key === key)?.label ?? key;
}

/** Which answers ask a follow-up, and what it asks. */
export const HEARD_FROM_DETAIL: Partial<Record<HeardFrom, { label: string; placeholder: string }>> = {
  creator: { label: "Which creator?", placeholder: "Their @ handle" },
  tiktok: { label: "From a creator? (optional)", placeholder: "Their @ handle" },
  instagram: { label: "From a creator? (optional)", placeholder: "Their @ handle" },
  youtube: { label: "From a creator? (optional)", placeholder: "Their channel" },
  other: { label: "Where?", placeholder: "Tell us where" },
};

/**
 * A creator's handle as typed ("@SejinNotes ", "sejinnotes") made comparable;
 * free text for "other" is kept as written, just trimmed.
 */
export function cleanHeardFromDetail(key: HeardFrom, value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().slice(0, 80);
  if (!trimmed) return null;
  if (key === "other") return trimmed;
  return trimmed.toLowerCase().replace(/^@+/, "").replace(/\s+/g, "").slice(0, 40) || null;
}
