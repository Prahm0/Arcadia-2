/**
 * Deliberately small, high-confidence block list for rooms used by teenagers.
 * Normalisation catches common leetspeak and punctuation splits without
 * attempting to make this a full language moderation system.
 */
const LEET: Record<string, string> = {
  "@": "a",
  "0": "o",
  "1": "i",
  "!": "i",
  "3": "e",
  "4": "a",
  "5": "s",
  "7": "t",
  "$": "s",
};

const BLOCKED_TERMS = [
  "fuck",
  "shit",
  "bitch",
  "cunt",
  "whore",
  "slut",
  "porn",
  "nude",
  "rape",
  "fag",
  "nigger",
  "retard",
  "spic",
  "kike",
  "chink",
  "tranny",
  "kys",
];

function normalise(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(/[@013457!$]/g, (character) => LEET[character] ?? character)
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function isObjectionableRoomMessage(text: string): boolean {
  const value = normalise(text);
  const compact = value.replace(/\s/g, "");
  return BLOCKED_TERMS.some((term) => new RegExp(`\\b${term}\\b`, "i").test(value) || compact.includes(term));
}

export function containsRoomContactInfo(text: string): boolean {
  const hasLink = /(?:https?:\/\/|www\.)/i.test(text);
  // Eight digits allows international and Australian numbers with common
  // spaces, brackets and dashes while avoiding ordinary dates and times.
  const hasPhone = /(?:\+?\d[\s().-]*){8,}/.test(text);
  return hasLink || hasPhone;
}
