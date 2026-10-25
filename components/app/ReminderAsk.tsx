"use client";

import { useEffect, useState } from "react";
import { enablePushCheckins, pushCheckinsSupported, pushPermission } from "@/lib/app/pushCheckins";

/**
 * On the block-done screen, right after a student has felt the plan work:
 * "want a heads-up before your next block?" Reminders are what bring
 * students back, and this is the moment they say yes. Shown only while the
 * device hasn't been asked yet; reports whether it's showing, so the screen
 * can leave out the invite card.
 */
export default function ReminderAsk({ onShowing }: { onShowing?: (showing: boolean) => void }) {
  const [askable, setAskable] = useState(false);
  const [state, setState] = useState<"idle" | "busy" | "on" | "error">("idle");

  useEffect(() => {
    if (!pushCheckinsSupported()) return;
    let active = true;
    void pushPermission()
      .then((permission) => {
        if (!active || permission !== "prompt") return;
        setAskable(true);
        onShowing?.(true);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
    // Asked once when the screen opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function turnOn() {
    setState("busy");
    try {
      await enablePushCheckins();
      setState("on");
    } catch {
      setState("error");
    }
  }

  if (!askable) return null;
  return (
    <div className="w-full rounded-[20px] p-4 text-left" style={{ background: "color-mix(in oklab, var(--app-hero-on) 10%, transparent)", color: "var(--app-hero-on)" }}>
      {state === "on" ? (
        <p role="status" className="text-[15px] font-semibold">✓ You&apos;ll get a heads-up before your next block</p>
      ) : (
        <>
          <p className="text-[15px] font-semibold leading-snug">Want a heads-up before your next block?</p>
          <p className="mt-0.5 text-[13px] leading-snug" style={{ opacity: 0.75 }}>
            A nudge 5 minutes before, and one if it starts without you. Change them any time in Settings.
          </p>
          <button
            type="button"
            onClick={() => void turnOn()}
            disabled={state === "busy"}
            className="ui-press mt-3 inline-flex h-10 w-full items-center justify-center rounded-full text-[14.5px] font-semibold disabled:opacity-60"
            style={{ background: "var(--app-hero-on)", color: "var(--app-hero)" }}
          >
            {state === "busy" ? "Turning on…" : "Turn on reminders"}
          </button>
          {state === "error" ? (
            <p role="alert" className="mt-2 text-center text-[12.5px]" style={{ opacity: 0.8 }}>
              Couldn&apos;t turn them on. Try again in Settings.
            </p>
          ) : null}
        </>
      )}
    </div>
  );
}
