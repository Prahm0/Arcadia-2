import type { Viewport } from "next";
import type { ReactNode } from "react";
import { ThemeProvider } from "@/lib/app/theme";
import { THEME_COLOR } from "@/lib/app/themeColors";

/**
 * Every product surface lives under this route group: the dashboard, the auth
 * screens and the legal pages. Mounting ThemeProvider here is what stamps
 * `data-app-theme` onto <html>, and that attribute is the single selector the
 * app palette, type and elevation tokens hang off in globals.css.
 *
 * The marketing page (app/page.tsx) sits outside this group and never gets the
 * attribute, so it keeps the landing design language untouched.
 */

// The app's own tint, not the landing's night one. Day is the default; the
// script below and ThemeProvider switch the meta to Night when that's chosen.
export const viewport: Viewport = {
  themeColor: THEME_COLOR.light,
  colorScheme: "light dark",
};

// Stamps the theme (and the browser's top bar tint) before first paint. It has to run as markup rather than in
// an effect, otherwise the first frame is painted with the landing's black body
// and the app palette snaps in a moment later. Kept in sync with lib/app/theme.
const noFlash = `(function(){try{var m=localStorage.getItem("arcadia:theme");var t=(m==="light"||m==="dark")?m:(m==="system"&&window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light");var e=document.documentElement;e.setAttribute("data-app-theme",t);e.style.colorScheme=t;var c=t==="dark"?"${THEME_COLOR.dark}":"${THEME_COLOR.light}";document.querySelectorAll('meta[name="theme-color"]').forEach(function(x){x.removeAttribute("media");x.content=c;});}catch(_){}})();`;

export default function ProductLayout({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider>
      <script dangerouslySetInnerHTML={{ __html: noFlash }} />
      {children}
    </ThemeProvider>
  );
}
