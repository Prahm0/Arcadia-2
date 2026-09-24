"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api/client";
import type { Sheet, SheetSection } from "@/shared/sheets";

export type { Sheet, SheetSection } from "@/shared/sheets";

export interface SheetDraft {
  title: string;
  subjectId: string | null;
  topicId: string | null;
  sections: SheetSection[];
  /** Arcad's note when the source was too thin to fill a sheet. */
  note: string;
}

export function createSheet(body: {
  title: string;
  subjectId: string | null;
  topicId?: string | null;
  sections: SheetSection[];
  source?: "manual" | "arcad";
}): Promise<{ sheet: Sheet }> {
  return api<{ sheet: Sheet }>("/api/sheets", { method: "POST", body: JSON.stringify(body) });
}

export function updateSheet(
  id: string,
  body: Partial<{ title: string; subjectId: string | null; topicId: string | null; sections: SheetSection[] }>,
): Promise<{ sheet: Sheet }> {
  return api<{ sheet: Sheet }>(`/api/sheets/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(body) });
}

export function deleteSheet(id: string): Promise<unknown> {
  return api(`/api/sheets/${encodeURIComponent(id)}`, { method: "DELETE" });
}

/** Arcad's unsaved first draft, from exactly one of the student's own sources. */
export function draftSheet(body: { topicId?: string; subjectFileId?: string; deckId?: string }): Promise<{ draft: SheetDraft }> {
  return api<{ draft: SheetDraft }>("/api/sheets/draft", { method: "POST", body: JSON.stringify(body) });
}

export function deckFromSheet(id: string): Promise<{ deckId: string; cardCount: number }> {
  return api<{ deckId: string; cardCount: number }>(`/api/sheets/${encodeURIComponent(id)}/deck`, { method: "POST" });
}

type Load<T> = { status: "loading" } | { status: "error"; error: string } | { status: "ready"; data: T };

function useLoad<T>(path: string | null) {
  const [state, setState] = useState<Load<T>>({ status: "loading" });
  const refresh = useCallback(async () => {
    if (!path) return;
    try {
      setState({ status: "ready", data: await api<T>(path) });
    } catch (err) {
      setState((prev) =>
        prev.status === "ready" ? prev : { status: "error", error: err instanceof Error ? err.message : "Couldn't load." },
      );
    }
  }, [path]);
  useEffect(() => {
    void refresh();
  }, [refresh]);
  const replace = useCallback((data: T) => setState({ status: "ready", data }), []);
  return { state, refresh, replace };
}

export function useSheets() {
  return useLoad<{ sheets: Sheet[] }>("/api/sheets");
}

export function useSheet(id: string | null) {
  return useLoad<{ sheet: Sheet }>(id ? `/api/sheets/${encodeURIComponent(id)}` : null);
}

/** A draft handed from the new-sheet form to the editor page, for one visit. */
const DRAFT_KEY = "arcadia:sheet-draft";

export function stashDraft(draft: SheetDraft & { source: "manual" | "arcad" }) {
  try {
    sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  } catch {
    /* private mode: the editor opens blank */
  }
}

/** Read without clearing: React may run an initialiser twice in development. */
export function readDraft(): (SheetDraft & { source: "manual" | "arcad" }) | null {
  try {
    const raw = sessionStorage.getItem(DRAFT_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function clearDraft() {
  try {
    sessionStorage.removeItem(DRAFT_KEY);
  } catch {
    /* nothing to clear */
  }
}
