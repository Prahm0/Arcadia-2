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
import { useCardGlow, usePrefersReducedMotion } from "@/lib/hooks";

export default function MentorSection() {
  const [activeId, setActiveId] = useState(mentorDefaultId);
  const reduced = usePrefersReducedMotion();
  const glow = useCardGlow();
  const active = mentorExamples.find((m) => m.id === activeId) ?? mentorExamples[0];

  return (
    <section
      id="mentor"
      aria-labelledby="mentor-heading"
      className="section-seam-light bg-afternoon py-[120px] text-day-text lg:py-[160px]"
    >
      <Container>
        <div className="grid grid-cols-12 gap-x-6 gap-y-10">
          <div className="col-span-12 lg:col-span-6">
            <FadeIn>
              <SectionLabel tone="light" time="Tue 8 Sep · 9:10 pm">
                AI Mentor
              </SectionLabel>
            </FadeIn>
            <RevealText
              id="mentor-heading"
              as="h2"
              lines={["Ask it why."]}
              accent="why."
              className="type-display mt-8 text-day-text"
              delay={0.1}
            />
          </div>
          <div className="col-span-12 lg:col-span-5 lg:col-start-8 lg:self-end">
            <FadeIn delay={0.2}>
              <p className="type-body-lg max-w-[440px] text-day-text/60">
                Not a chatbot. A mentor that already knows your week, so every answer comes
                with a reason.
              </p>
            </FadeIn>
          </div>
        </div>

        <FadeIn delay={0.1} className="mt-14 lg:mt-20">
          <div
            className="-mx-5 overflow-x-auto px-5 pb-2 [scrollbar-width:none] sm:-mx-8 sm:px-8 lg:mx-0 lg:px-0 [&::-webkit-scrollbar]:hidden"
            role="group"
            aria-label="Example questions"
          >
            <ul className="flex w-max gap-2 lg:w-auto lg:flex-wrap">
              {mentorExamples.map((m) => {
                const isActive = m.id === activeId;
                return (
                  <li key={m.id}>
                    <button
                      type="button"
                      onClick={() => setActiveId(m.id)}
                      aria-pressed={isActive}
                      className={cn(
                        "flex items-center gap-2.5 whitespace-nowrap rounded-full border px-4 py-2.5 font-mono text-[13px] transition-[background-color,color,border-color] duration-200",
                        isActive
                          ? "border-day-text bg-day-text text-white"
                          : "border-day-text/15 bg-white/60 text-day-text/70 hover:border-day-text/40 hover:text-day-text",
                      )}
                    >
                      <span
                        aria-hidden="true"
                        className={cn("size-1.5 rounded-full", isActive ? "bg-accent-200" : "bg-day-text/20")}
                      />
                      {m.prompt}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        </FadeIn>

        <div className="mt-8 grid grid-cols-12 gap-x-6">
          <div className="col-span-12 lg:col-span-8">
            <FadeIn delay={0.2} y={24}>
              <div
                {...glow}
                className="card-glow overflow-hidden rounded-[16px] border border-day-border bg-white p-5 shadow-[0_30px_80px_-30px_rgba(60,40,20,0.22)] sm:p-7"
              >
                <AnimatePresence mode="wait" initial={false}>
                  <motion.div
                    key={active.id}
                    initial={{ opacity: 0, y: reduced ? 0 : 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: reduced ? 0 : -6 }}
                    transition={{ duration: 0.4, ease: EASE_OUT }}
                    className="relative"
                  >
                    <p className="type-mono-label text-ui-muted">You asked</p>
                    <p className="mt-1.5 font-serif text-[24px] italic leading-tight text-ui-text sm:text-[28px]">
                      {active.prompt}
                    </p>

                    <div className="mt-7 flex items-start gap-3">
                      <span className="mt-[9px]">
                        <ArcadiaIndicator />
                      </span>
                      <p className="text-[18px] leading-relaxed text-ui-text sm:text-[20px]">{active.response}</p>
                    </div>

                    <div className="mt-7 flex flex-wrap items-center gap-2 border-t border-ui-border pt-4">
                      <span className="type-mono-label mr-2 text-ui-muted">Based on</span>
                      {active.basis.map((b) => (
                        <span
                          key={b}
                          className="tabular rounded-[6px] border border-ui-border bg-ui-surface px-2.5 py-1 text-[12px] text-ui-text"
                        >
                          {b}
                        </span>
                      ))}
                    </div>
                  </motion.div>
                </AnimatePresence>
              </div>
            </FadeIn>
          </div>
        </div>

        <FadeIn delay={0.1} className="mt-24 lg:mt-36">
          <RevealText
            as="p"
            lines={["It knows your week.", "So it can reason about it."]}
            accent="reason"
            className="type-title max-w-[700px] text-day-text"
          />
        </FadeIn>
      </Container>
    </section>
  );
}
