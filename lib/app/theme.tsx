"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api/client";
import { applyThemeColor } from "@/lib/app/themeColors";

export type Theme = "light" | "dark";
export type ThemeMode = "light" | "dark" | "system";

const STORAGE_KEY = "arcadia:theme";

interface ThemeContextValue {
  mode: ThemeMode;
  resolved: Theme;
  setMode: (mode: ThemeMode) => void;
  toggle: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function readStored(): ThemeMode {
  if (typeof window === "undefined") return "light";
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === "light" || stored === "dark" || stored === "system") return stored;
  } catch {
    /* ignore */
  }
  // Sage (light) unless the student picks Night or "match my phone" in
  // Settings: the calm daytime look is Arcadia's face.
  return "light";
}

function systemTheme(): Theme {
  if (typeof window === "undefined" || !window.matchMedia) return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function apply(theme: Theme) {
  if (typeof document === "undefined") return;
  document.documentElement.setAttribute("data-app-theme", theme);
  document.documentElement.style.colorScheme = theme;
  applyThemeColor(theme);
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>(() => readStored());
  // Resolved eagerly, not in the effect below: starting at "light" and
  // correcting afterwards repaints the whole shell one frame in, which defeats
  // the pre-paint script in app/(app)/layout.tsx.
  const [systemPref, setSystemPref] = useState<Theme>(systemTheme);

  // systemPref already starts from the device; this only follows changes.
  useEffect(() => {
    if (typeof window !== "undefined" && window.matchMedia) {
      const media = window.matchMedia("(prefers-color-scheme: dark)");
      const listener = (event: MediaQueryListEvent) =>
        setSystemPref(event.matches ? "dark" : "light");
      media.addEventListener("change", listener);
      return () => media.removeEventListener("change", listener);
    }
  }, []);

  const resolved: Theme = mode === "system" ? systemPref : mode;

  useEffect(() => {
    apply(resolved);
  }, [resolved]);

  // data-app-theme lives on <html>, which outlives this provider. Without an
  // explicit cleanup, routing from a product page back to the marketing page
  // leaves the app palette and the typewriter font applied to the landing.
  // Declared after the effect above so a StrictMode remount re-applies first.
  useEffect(
    () => () => {
      document.documentElement.removeAttribute("data-app-theme");
      document.documentElement.style.colorScheme = "";
    },
    [],
  );

  const setMode = useCallback((next: ThemeMode) => {
    setModeState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* ignore */
    }
    const nextTheme: Theme = next === "system" ? systemTheme() : next;
    void api("/api/account", {
      method: "PATCH",
      body: JSON.stringify({ theme: nextTheme }),
    }).catch(() => {
      /* silently ignore server sync errors */
    });
  }, []);

  const toggle = useCallback(() => {
    setMode(resolved === "dark" ? "light" : "dark");
  }, [resolved, setMode]);

  const value = useMemo(() => ({ mode, resolved, setMode, toggle }), [mode, resolved, setMode, toggle]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used inside <ThemeProvider>");
  return ctx;
}
