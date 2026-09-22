"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api/client";

interface Result {
  cardId: string;
  correct: boolean;
}

const BATCH = 100;

function sendWithKeepalive(results: Result[]) {
  const headers = new Headers({ "content-type": "application/json" });
  try {
    const csrf = window.localStorage.getItem("arcadia:csrf");
    if (csrf) headers.set("x-csrf-token", csrf);
  } catch {
    /* storage blocked; the server will refuse and the answers are lost */
  }
  void fetch("/api/cards/reviews", {
    method: "POST",
    body: JSON.stringify({ results }),
    headers,
    credentials: "same-origin",
    keepalive: true,
  }).catch(() => undefined);
}

/**
 * Answers from a study session, saved in the order they were given without
 * holding up the next card. Whatever hasn't gone yet when the page closes is
 * sent with keepalive.
 */
export function useReviewQueue() {
  const pending = useRef<Result[]>([]);
  const sending = useRef(false);
  const [failed, setFailed] = useState(false);

  const flush = useCallback(async () => {
    if (sending.current) return;
    sending.current = true;
    // Answers given while a batch is in flight go in the next one.
    while (pending.current.length > 0) {
      const batch = pending.current.splice(0, BATCH);
      try {
        await api("/api/cards/reviews", { method: "POST", body: JSON.stringify({ results: batch }) });
        setFailed(false);
      } catch {
        // Put them back in front; the next answer tries again.
        pending.current.unshift(...batch);
        setFailed(true);
        break;
      }
    }
    sending.current = false;
  }, []);

  const record = useCallback(
    (cardId: string, correct: boolean) => {
      pending.current.push({ cardId, correct });
      void flush();
    },
    [flush],
  );

  useEffect(() => {
    const sendRest = () => {
      if (pending.current.length === 0) return;
      sendWithKeepalive(pending.current.splice(0, BATCH));
    };
    window.addEventListener("pagehide", sendRest);
    return () => {
      window.removeEventListener("pagehide", sendRest);
      sendRest();
    };
  }, []);

  return { record, failed };
}
