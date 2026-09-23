"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { api } from "@/lib/api/client";
import type { StudySkyResponse, SkyPreferences, ConstellationId } from "@/shared/constellations";

interface SkyContext {
  sky: StudySkyResponse | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<StudySkyResponse | null>;
  update: (patch: Partial<SkyPreferences>) => Promise<void>;
  acknowledge: (id: ConstellationId) => Promise<void>;
}
const Context = createContext<SkyContext | null>(null);
export function StudySkyProvider({ children }: { children: ReactNode }) {
  const [sky, setSky] = useState<StudySkyResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const request = useRef(0);
  const refresh = useCallback(async () => {
    const sequence = ++request.current;
    try {
      const result = await api<StudySkyResponse>("/api/constellations");
      if (sequence === request.current) { setSky(result); setError(null); }
      return result;
    } catch (err) {
      if (sequence === request.current) setError(err instanceof Error ? err.message : "Couldn't read your sky.");
      return null;
    } finally { if (sequence === request.current) setLoading(false); }
  }, []);
  useEffect(() => {
    const initialLoad = window.setTimeout(() => void refresh(), 0);
    const invalidate = () => { request.current++; };
    const visible = () => { if (document.visibilityState === "visible") void refresh(); };
    document.addEventListener("visibilitychange", visible);
    return () => { window.clearTimeout(initialLoad); invalidate(); document.removeEventListener("visibilitychange", visible); };
  }, [refresh]);
  const update = useCallback(async (patch: Partial<SkyPreferences>) => {
    const sequence = ++request.current;
    const result = await api<StudySkyResponse>("/api/constellations", { method: "PATCH", body: JSON.stringify(patch) });
    if (sequence === request.current) { setSky(result); setError(null); setLoading(false); }
  }, []);
  const acknowledge = useCallback(async (id: ConstellationId) => {
    await api(`/api/constellations/${id}/seen`, { method: "POST" });
    setSky((previous) => previous ? { ...previous, cards: previous.cards.map((card) => card.id === id ? { ...card, seen: true } : card) } : previous);
  }, []);
  return <Context.Provider value={{ sky, loading, error, refresh, update, acknowledge }}>{children}</Context.Provider>;
}
export function useStudySky() {
  const value = useContext(Context);
  if (!value) throw new Error("useStudySky requires StudySkyProvider");
  return value;
}
