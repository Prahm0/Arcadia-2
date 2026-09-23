/**
 * One earthy vocabulary for event categories.
 *
 * Four views each carried their own copy of the same sky/emerald/amber trio
 * (`#38bdf8` / `#34d399` / `#f59e0b`), which read as neon against the warm
 * surfaces. They share this module now.
 *
 * The category hues are CSS variables, not hexes, because no single mid-tone
 * clears 3:1 against both the light paper and the dark grey ground, so
 * globals.css defines a darker light-mode value and a lighter dark-mode one
 * for each.
 */
export const CATEGORY_COLOR: Record<string, string> = {
  study: "var(--app-accent)",
  school: "var(--app-cat-school)",
  sport: "var(--app-cat-sport)",
  extracurricular: "var(--app-cat-extra)",
  sleep: "var(--app-text-faint)",
  other: "var(--app-text-muted)",
};

export function categoryColor(category: string): string {
  return CATEGORY_COLOR[category] ?? CATEGORY_COLOR.other;
}

export interface CategoryBlockStyle {
  bg: string;
  text: string;
  border: string;
}

/**
 * The bg/text/border triple a schedule block needs, mixed from the one hue so
 * every category stays theme-correct instead of being hand-tuned per entry.
 */
export function categoryBlock(category: string): CategoryBlockStyle {
  if (category === "sleep") {
    return {
      bg: "transparent",
      text: "var(--app-text-muted)",
      border: "var(--app-border)",
    };
  }
  if (category === "other" || category === "school") {
    // The quieter two sit back rather than taking a tint of their own.
    return {
      bg: "var(--app-surface-soft)",
      text: category === "school" ? "var(--app-text-muted)" : "var(--app-text-soft)",
      border: `color-mix(in oklab, ${categoryColor(category)} 40%, transparent)`,
    };
  }
  return hueBlock(categoryColor(category));
}

/**
 * The same block treatment for any hue, e.g. a subject's own colour: one flat
 * tint and text in the hue. No outline on top of the fill, which doubled
 * every colour.
 */
export function hueBlock(hue: string): CategoryBlockStyle {
  return {
    bg: `color-mix(in oklab, ${hue} 15%, var(--app-surface))`,
    text: hueInk(hue),
    border: "transparent",
  };
}

/** A hue as text: pulled toward the text colour so it reads on either theme. */
export function hueInk(hue: string): string {
  return `color-mix(in oklab, ${hue} 70%, var(--app-text))`;
}

/**
 * Swatches offered when a student picks a colour for a subject.
 *
 * Clean, saturated hues rather than the earthy terracotta-sage-ochre set,
 * which is the stock "tasteful" palette of generated UIs. They're only ever
 * used small: a tag's text and a faint wash, a calendar block's tint. Literal
 * hexes because the pick is saved on the subject; the backend maps colours
 * saved from the old palette onto these (see serialiseSubject).
 */
export const SUBJECT_COLORS = [
  "#2f7cf6", // blue
  "#e8603c", // orange
  "#23a35a", // green
  "#d9468f", // pink
  "#14a0b4", // teal
  "#d49b00", // yellow
  "#8a5cf0", // purple
];
