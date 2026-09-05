"use client";

import { AnimatePresence, motion, useMotionValueEvent } from "framer-motion";
import { useRef, useState } from "react";
import { EASE_OUT } from "@/lib/animation";
import { usePrefersReducedMotion, useScrollProgress } from "@/lib/hooks";
import { stages } from "@/lib/thinking";
import { cn } from "@/lib/cn";
import ThinkingVisual from "./ThinkingVisual";
import Container from "./ui/Container";
import SectionLabel from "./ui/SectionLabel";

export default function ThinkingSection() {
  const ref = useRef<HTMLDivElement>(null);
  const reduced = usePrefersReducedMotion();
  const [stage, setStage] = useState(0);

  const scrollYProgress = useScrollProgress(ref);

  useMotionValueEvent(scrollYProgress, "change", (p) => {
    const next = Math.min(stages.length - 1, Math.max(0, Math.floor(p * stages.length)));
    setStage((prev) => (prev === next ? prev : next));
  });

  return (
    <section id="how-it-works" aria-labelledby="thinking-heading" className="bg-black text-white">
      {reduced ? (
        <Container className="py-[120px] lg:py-[160px]">
          <SectionLabel>How Arcadia thinks</SectionLabel>
          <h2 id="thinking-heading" className="type-display mt-8 max-w-[900px]">
            From scattered to certain.
          </h2>
          <div className="mt-16 grid gap-12 lg:grid-cols-12 lg:gap-6">
            <ol className="flex flex-col gap-10 lg:col-span-5">
              {stages.map((s) => (
                <li key={s.index}>
                  <SectionLabel index={s.index}>{s.title}</SectionLabel>
                  <p className="type-body-lg mt-3 max-w-[520px] text-white/70">{s.body}</p>
                </li>
              ))}
            </ol>
            <div className="lg:col-span-7">
              <ThinkingVisual stage={3} reduced className="mx-auto w-full max-w-[560px]" />
            </div>
          </div>
        </Container>
      ) : (
        <div ref={ref} className="relative h-[400vh]">
          <div className="sticky top-0 flex h-[100svh] flex-col overflow-hidden">
            <Container className="flex h-full flex-col justify-center pb-6 pt-20 lg:pt-[88px]">
              <div className="grid flex-1 grid-cols-1 items-center gap-6 lg:grid-cols-12">
                <div className="order-2 lg:order-1 lg:col-span-5">
                  <SectionLabel>How Arcadia thinks</SectionLabel>
                  <h2 id="thinking-heading" className="sr-only">
                    How Arcadia thinks
                  </h2>
                  <ol className="mt-4 flex flex-col sm:mt-10" aria-live="polite">
                    {stages.map((s, i) => {
                      const active = i === stage;
                      return (
                        <li key={s.index} className="border-t border-white/[0.08] py-3 sm:py-5">
                          <div className="flex items-baseline gap-4">
                            <span
                              className={cn(
                                "tabular text-[13px] transition-colors duration-500",
                                active ? "text-accent-200" : "text-white/55",
                              )}
                            >
                              {s.index}
                            </span>
                            <span
                              className={cn(
                                "type-title transition-colors duration-500",
                                active ? "text-white" : "text-white/45",
                              )}
                            >
                              {s.title}
                            </span>
                          </div>
                          <AnimatePresence initial={false}>
                            {active && (
                              <motion.p
                                key="body"
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: "auto" }}
                                exit={{ opacity: 0, height: 0 }}
                                transition={{ duration: 0.55, ease: EASE_OUT }}
                                className="type-body max-w-[460px] overflow-hidden text-white/65"
                              >
                                <span className="block pt-3">{s.body}</span>
                              </motion.p>
                            )}
                          </AnimatePresence>
                        </li>
                      );
                    })}
                  </ol>
                </div>

                <div className="order-1 flex items-center justify-center lg:order-2 lg:col-span-7">
                  <ThinkingVisual
                    stage={stage}
                    reduced={false}
                    className="h-[30svh] w-auto max-w-full sm:h-[44svh] lg:h-auto lg:w-full lg:max-w-[600px]"
                  />
                </div>
              </div>
            </Container>
          </div>
        </div>
      )}
    </section>
  );
}
