/**
 * Marking a typed answer. Case, spacing, punctuation, accents and a leading
 * "the/a/an" don't count, and a slip or two is forgiven on longer answers.
 * The student can always overrule it with "I was right".
 */
export function normaliseAnswer(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^(the|a|an) /, "");
}

export function isCloseEnough(typed: string, answer: string): boolean {
  const a = normaliseAnswer(typed);
  const b = normaliseAnswer(answer);
  if (!a) return false;
  if (a === b) return true;
  // Numbers and short answers have to be exact: "12" isn't "13".
  if (b.length < 4 || /\d/.test(b)) return false;
  return editDistance(a, b) <= Math.max(1, Math.floor(b.length / 8));
}

function editDistance(a: string, b: string): number {
  if (Math.abs(a.length - b.length) > 3) return 99;
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    for (let j = 1; j <= b.length; j++) {
      current[j] = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    previous = current;
  }
  return previous[b.length];
}

/** Answers longer than this are marked by the student instead of typed. */
export const TYPEABLE_MAX = 60;
