"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useState } from "react";
import { EASE_OUT } from "@/lib/animation";
import { mentorDefaultId, mentorExamples } from "@/lib/demo-data";
import { cn } from "@/lib/cn";
import { ArcadiaIndicator } from "./ScheduleDemo";
import Container from "./ui/Container";
import FadeIn from "./ui/FadeIn";
import RevealText from "./ui/RevealText";
import SectionLabel from "./ui/SectionLabel";
import { usePrefersReducedMotion } from "@/lib/hooks";

const understands = ["time", "priorities", "deadlines", "workload", "real life"];

export default function MentorSection() {
  const [activeId, setActiveId] = useState(mentorDefaultId);
  const reduced = usePrefersReducedMotion();
  const active = mentorExamples.find((m) => m.id === activeId) ?? mentorExamples[0];

  return (
    <section id="mentor" aria-labelledby="mentor-heading" className="bg-white py-[120px] text-black lg:py-[160px]">
      <Container>
        <div className="grid grid-cols-12 gap-x-6">
          <div className="col-span-12 lg:col-span-8">
            <FadeIn>
              <SectionLabel tone="light">AI Mentor</SectionLabel>
            </FadeIn>
            <RevealText
              id="mentor-heading"
              as="h2"
              lines={["More than a planner."]}
              className="type-display mt-8 text-black"
              delay={0.1}
            />
            <FadeIn delay={0.2}>
              <p className="type-title mt-6 text-black/45">Ask Arcadia what to do next.</p>
            </FadeIn>
          </div>
        </div>

        <div className="mt-16 grid grid-cols-12 gap-x-6 gap-y-10 lg:mt-24">
          <div className="col-span-12 lg:col-span-5">
            <FadeIn delay={0.1}>
              <ul className="flex flex-col" aria-label="Example questions">
                {mentorExamples.map((m) => {
                  const isActive = m.id === activeId;
                  return (
                    <li key={m.id}>
                      <button
                        type="button"
                        onClick={() => setActiveId(m.id)}
                        aria-pressed={isActive}
                        className={cn(
                          "group flex w-full items-center gap-4 border-t border-black/[0.08] py-4 text-left transition-colors duration-200",
                          isActive ? "text-black" : "text-black/45 hover:text-black",
                        )}
                      >
                        <span
                          aria-hidden="true"
                          className={cn(
                            "size-1.5 shrink-0 rounded-full transition-colors duration-200",
                            isActive ? "bg-accent" : "bg-black/15 group-hover:bg-black/30",
                          )}
                        />
                        <span className="text-[17px] leading-snug sm:text-[18px]">{m.prompt}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </FadeIn>
          </div>

          <div className="col-span-12 lg:col-span-6 lg:col-start-7">
            <FadeIn delay={0.2} y={24}>
              <div className="rounded-[16px] border border-ui-border bg-white p-5 shadow-[0_24px_60px_-30px_rgba(0,0,0,0.18)] sm:p-7">
                <AnimatePresence mode="wait" initial={false}>
                  <motion.div
                    key={active.id}
                    initial={{ opacity: 0, y: reduced ? 0 : 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: reduced ? 0 : -6 }}
                    transition={{ duration: 0.4, ease: EASE_OUT }}
                  >
                    <p className="text-[14px] text-ui-muted">You asked</p>
                    <p className="mt-1.5 text-[17px] font-medium text-ui-text">{active.prompt}</p>

                    <div className="mt-6 flex items-start gap-3">
                      <span className="mt-[7px]">
                        <ArcadiaIndicator />
                      </span>
                      <p className="text-[17px] leading-relaxed text-ui-text">{active.response}</p>
                    </div>

                    <div className="mt-6 border-t border-ui-border pt-4">
                      <p className="text-[12px] font-medium text-ui-muted">Based on</p>
                      <ul className="mt-2 flex flex-wrap gap-2">
                        {active.basis.map((b) => (
                          <li
                            key={b}
                            className="rounded-[6px] border border-ui-border px-2.5 py-1 text-[12px] text-ui-text"
                          >
                            {b}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </motion.div>
                </AnimatePresence>
              </div>
            </FadeIn>
          </div>
        </div>

        <FadeIn delay={0.1} className="mt-28 lg:mt-40">
          <p className="type-eyebrow text-black/50">Arcadia understands</p>
          <p className="type-title mt-6 flex flex-wrap items-baseline gap-x-4 gap-y-2 text-black">
            {understands.map((word, i) => (
              <span key={word} className="flex items-baseline gap-x-4">
                {i > 0 && (
                  <span aria-hidden="true" className="font-light text-black/25">
                    +
                  </span>
                )}
                <span>{word}</span>
              </span>
            ))}
          </p>
        </FadeIn>
      </Container>
    </section>
  );
}
