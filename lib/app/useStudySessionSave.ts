"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useStudySky } from "./StudySkyProvider";
import { flushStudySessions, pendingStudySessions, queueStudySession, type PendingStudySession } from "./pendingStudySessions";
import type { ConstellationId } from "@/shared/constellations";

export function useStudySessionSave(userId: string) {
  const { sky, refresh } = useStudySky();
  const latest = useRef(sky);
  useEffect(() => { latest.current = sky; }, [sky]);
  const [status, setStatus] = useState<"idle" | "saving" | "pending" | "saved">("idle");
  const [receipt, setReceipt] = useState<{ stars: number; cards: ConstellationId[] }>({ stars: 0, cards: [] });
  const retry = useCallback(async () => {
    if (!pendingStudySessions(userId).length) return;
    const before = latest.current;
    setStatus("saving");
    try {
      await flushStudySessions(userId);
      const after = await refresh();
      if (after && before) {
        const starsBefore = before.cards.reduce((sum, card) => sum + card.milestones.filter((star) => star.earnedAt !== null).length, 0);
        const starsAfter = after.cards.reduce((sum, card) => sum + card.milestones.filter((star) => star.earnedAt !== null).length, 0);
        setReceipt({ stars: Math.max(0, starsAfter - starsBefore), cards: after.cards.filter((card) => card.earnedAt !== null && !before.cards.find((old) => old.id === card.id)?.earnedAt).map((card) => card.id) });
      }
      setStatus("saved");
    } catch { setStatus("pending"); }
  }, [userId, refresh]);
  useEffect(() => {
    const initialRetry = window.setTimeout(() => void retry(), 0);
    const online = () => { void retry(); };
    window.addEventListener("online", online);
    return () => { window.clearTimeout(initialRetry); window.removeEventListener("online", online); };
  }, [retry]);
  const save = useCallback(async (session: PendingStudySession) => {
    if (session.seconds <= 0) return;
    queueStudySession(userId, session);
    await retry();
  }, [userId, retry]);
  return { save, retry, status, receipt };
}
