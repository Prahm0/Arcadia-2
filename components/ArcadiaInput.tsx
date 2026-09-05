"use client";

import { AnimatePresence, LayoutGroup, motion, useInView } from "framer-motion";
import { useCallback, useEffect, useRef, useState } from "react";
import { EASE_OUT } from "@/lib/animation";
import { tellAfter, tellArcadia, tellBefore, tellDays } from "@/lib/demo-data";
import { CHANGE_LABELS, formatDuration, formatRange } from "@/lib/schedule";
import { cn } from "@/lib/cn";
import { ArcadiaIndicator } from "./ScheduleDemo";
import Container from "./ui/Container";
import FadeIn from "./ui/FadeIn";
import RevealText from "./ui/RevealText";
import SectionLabel from "./ui/SectionLabel";
import { usePrefersReducedMotion } from "@/lib/hooks";

type Step = "idle" | "typing" | "sent" | "thinking" | "answered";

const TYPE_MS = 28;

export default function ArcadiaInput() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.5 });
  const reduced = usePrefersReducedMotion();

  const [step, setStep] = useState<Step>("idle");
  const [typed, setTyped] = useState("");
  const [run, setRun] = useState(0);
  const typingTimer = useRef<number | null>(null);

  const message = tellArcadia.student;

  const stopTyping = useCallback(() => {
    if (typingTimer.current !== null) {
      window.clearInterval(typingTimer.current);
      typingTimer.current = null;
    }
  }, []);

  // Type the example request when the section arrives, or when replayed.
  useEffect(() => {
    if (!inView) return;
    if (reduced) {
      const id = window.setTimeout(() => {
        setTyped(message);
        setStep("idle");
      }, 0);
      return () => window.clearTimeout(id);
    }
    let i = 0;
    const start = window.setTimeout(() => {
      setStep("typing");
      typingTimer.current = window.setInterval(() => {
        i += 1;
        setTyped(message.slice(0, i));
        if (i >= message.length) {
          stopTyping();
          setStep("idle");
        }
      }, TYPE_MS);
    }, 500);
    return () => {
      window.clearTimeout(start);
      stopTyping();
    };
  }, [inView, run, reduced, message, stopTyping]);

  const send = useCallback(() => {
    if (step === "sent" || step === "thinking" || step === "answered") return;
    stopTyping();
    setTyped(message);
    setStep("sent");
  }, [step, message, stopTyping]);

  useEffect(() => {
    if (step === "sent") {
      const t = window.setTimeout(() => setStep("thinking"), reduced ? 100 : 500);
      return () => window.clearTimeout(t);
    }
    if (step === "thinking") {
      const t = window.setTimeout(() => setStep("answered"), reduced ? 200 : 1300);
      return () => window.clearTimeout(t);
    }
  }, [step, reduced]);

  // Auto-send shortly after typing finishes so the demo runs unattended.
  useEffect(() => {
    if (!inView || step !== "idle" || typed !== message) return;
    const t = window.setTimeout(() => setStep("sent"), reduced ? 400 : 1100);
    return () => window.clearTimeout(t);
  }, [inView, step, typed, message, reduced]);

  const reset = () => {
    stopTyping();
    setTyped("");
    setStep("idle");
    setRun((r) => r + 1);
  };

  const answered = step === "answered";
  const blocks = answered ? tellAfter : tellBefore;

  return (
    <section
      id="students"
      aria-labelledby="tell-heading"
      className="bg-white py-[120px] text-black lg:py-[160px]"
    >
      <Container>
        <div className="grid grid-cols-12 gap-x-6 gap-y-14">
          <div className="col-span-12 lg:col-span-5">
            <FadeIn>
              <SectionLabel tone="light">Tell Arcadia</SectionLabel>
            </FadeIn>
            <RevealText
              id="tell-heading"
              as="h2"
              lines={["Plans change.", "Tell Arcadia once."]}
              className="type-display mt-8 text-black"
              delay={0.1}
            />
            <FadeIn delay={0.25}>
              <p className="type-body-lg mt-8 max-w-[480px] text-black/60">
                Say what happened in plain words. Arcadia works out what it affects and
                updates the plan around it.
              </p>
            </FadeIn>
          </div>

          <div className="col-span-12 lg:col-span-7">
            <FadeIn delay={0.15} y={28} duration={0.9} amount={0.2}>
              <div ref={ref} className="rounded-[16px] border border-ui-border bg-white shadow-[0_24px_60px_-30px_rgba(0,0,0,0.18)]">
                <div className="border-b border-ui-border p-4 sm:p-5">
                  <AnimatePresence initial={false}>
                    {(step === "sent" || step === "thinking" || answered) && (
                      <motion.div
                        key="exchange"
                        initial={{ opacity: 0, y: reduced ? 0 : 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.5, ease: EASE_OUT }}
                        className="mb-4 flex flex-col gap-3"
                      >
                        <div className="flex justify-end">
                          <p className="max-w-[440px] rounded-[12px] bg-ui-surface px-4 py-2.5 text-[15px] leading-relaxed text-ui-text">
                            {message}
                          </p>
                        </div>
                        <div className="flex items-start gap-3">
                          <span className="mt-[5px] flex items-center">
                            <ArcadiaIndicator />
                          </span>
                          <div className="min-w-0 flex-1" aria-live="polite">
                            {answered ? (
                              <motion.p
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                transition={{ duration: 0.6, ease: EASE_OUT }}
                                className="max-w-[520px] text-[15px] leading-relaxed text-ui-text"
                              >
                                {tellArcadia.arcadia}
                              </motion.p>
                            ) : (
                              <p className="text-[14px] text-ui-muted">Rearranging your week…</p>
                            )}
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      send();
                    }}
                    className={cn(
                      "flex items-end gap-2 rounded-[12px] border bg-white p-2 pl-4 transition-colors duration-200",
                      answered ? "border-ui-border" : "border-[#d8d8d8]",
                    )}
                  >
                    <label htmlFor="tell-arcadia" className="sr-only">
                      Tell Arcadia what changed
                    </label>
                    <div className="relative min-h-[44px] flex-1 py-2.5">
                      <input
                        id="tell-arcadia"
                        type="text"
                        value={answered || step === "sent" || step === "thinking" ? "" : typed}
                        readOnly
                        placeholder={answered ? "Tell Arcadia what changed…" : ""}
                        className="w-full bg-transparent text-[15px] leading-6 text-ui-text outline-none placeholder:text-ui-muted"
                        aria-describedby="tell-example"
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={step !== "idle" || typed.length === 0}
                      aria-label="Send to Arcadia"
                      className="flex size-9 shrink-0 items-center justify-center rounded-[8px] bg-black text-white transition-[opacity,transform] duration-200 hover:-translate-y-px disabled:opacity-30 disabled:hover:translate-y-0"
                    >
                      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                        <path d="M7 12V2M3 6l4-4 4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </button>
                  </form>
                  <div className="mt-2 flex items-center justify-between px-1">
                    <p id="tell-example" className="text-[12px] text-ui-muted">
                      Example request
                    </p>
                    <button
                      type="button"
                      onClick={reset}
                      className="text-[12px] text-ui-muted transition-colors hover:text-ui-text"
                    >
                      Replay
                    </button>
                  </div>
                </div>

                <LayoutGroup id="tell-arcadia">
                  <div className="grid grid-cols-1 divide-y divide-ui-border sm:grid-cols-3 sm:divide-x sm:divide-y-0">
                    {tellDays.map((day) => {
                      const dayBlocks = blocks
                        .filter((b) => b.day === day.key)
                        .sort((a, b) => a.start - b.start);
                      return (
                        <div key={day.key} className="p-4 sm:p-5">
                          <p className="flex items-baseline gap-2 text-[13px]">
                            <span className="font-medium text-ui-text">{day.label}</span>
                            <span className="tabular text-ui-muted">{day.sub}</span>
                          </p>
                          <ul className="mt-3 flex min-h-[132px] flex-col gap-2">
                            <AnimatePresence initial={false}>
                              {dayBlocks.map((b) => (
                                <motion.li
                                  key={b.id}
                                  layout
                                  layoutId={`tell-${b.id}`}
                                  initial={{ opacity: 0 }}
                                  animate={{ opacity: 1 }}
                                  exit={{ opacity: 0 }}
                                  transition={{ duration: reduced ? 0 : 0.8, ease: EASE_OUT }}
                                  className={cn(
                                    "rounded-[8px] border px-3 py-2 text-[13px]",
                                    b.category === "sport"
                                      ? "border-transparent bg-ink-800 text-white"
                                      : "border-ui-border bg-white text-ui-text",
                                    b.change && b.change !== "kept" && "ring-1 ring-accent",
                                  )}
                                >
                                  <div className="flex items-center justify-between gap-2">
                                    <span className="truncate font-medium">{b.title}</span>
                                    {b.change && (
                                      <span className="shrink-0 text-[11px] font-medium text-accent">
                                        {CHANGE_LABELS[b.change]}
                                      </span>
                                    )}
                                  </div>
                                  <div className="tabular mt-0.5 text-[11px] opacity-70">
                                    {formatRange(b.start, b.end)} · {formatDuration(b.end - b.start)}
                                  </div>
                                </motion.li>
                              ))}
                            </AnimatePresence>
                          </ul>
                        </div>
                      );
                    })}
                  </div>
                </LayoutGroup>
              </div>
            </FadeIn>
          </div>
        </div>
      </Container>
    </section>
  );
}
