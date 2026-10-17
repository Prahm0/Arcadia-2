/** The browser and status bar tint for each app theme: the page ground, so the top bar blends in. */
export const THEME_COLOR = { light: "#f3f1ea", dark: "#0f1527" } as const;

/** Points every theme-color meta at the current theme (iOS Safari, Android Chrome, installed PWA). */
export function applyThemeColor(theme: keyof typeof THEME_COLOR): void {
  if (typeof document === "undefined") return;
  document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]').forEach((meta) => {
    meta.removeAttribute("media");
    meta.content = THEME_COLOR[theme];
  });
}
