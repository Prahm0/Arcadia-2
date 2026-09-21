/**
 * One earthy vocabulary for event categories.
 *
 * Four views each carried their own copy of the same sky/emerald/amber trio
 * (`#38bdf8` / `#34d399` / `#f59e0b`), which read as neon against the warm
 * surfaces. They share this module now.
 *
 * The category hues are CSS variables, not hexes, because no single mid-tone
 * clears 3:1 against both the light paper and the dark grey ground — so
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
  const hue = categoryColor(category);
  return {
    bg: `color-mix(in oklab, ${hue} 16%, var(--app-surface))`,
    text: "var(--app-text)",
    border: `color-mix(in oklab, ${hue} 45%, transparent)`,
  };
}

/**
 * Swatches offered when a student picks a colour for a subject.
 *
 * These stay literal hexes: Onboarding persists the chosen value to the
 * backend as `subject.color`, so it has to survive outside this stylesheet and
 * cannot be a per-theme variable. Each one clears 3:1 against both the light
 * and dark card surfaces.
 */
export const SUBJECT_COLORS = [
  "#b4623c", // terracotta
  "#5e7a8c", // denim
  "#6f7d4e", // olive
  "#a87b3a", // ochre
  "#8a6b7c", // mauve
  "#6b7f6a", // sage
];
