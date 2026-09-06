"use client";

import { motion, useTransform } from "framer-motion";
import { useRef } from "react";
import { usePrefersReducedMotion, useScrollProgress } from "@/lib/hooks";
import { cn } from "@/lib/cn";
import { useEarlyAccess } from "./EarlyAccessProvider";
import HeroInterface from "./HeroInterface";
import LiveNow from "./LiveNow";
import Starfield from "./Starfield";
import Button from "./ui/Button";
import Container from "./ui/Container";

export default function Hero() {
  const ref = useRef<HTMLElement>(null);
  const reduced = usePrefersReducedMotion();
  const { open } = useEarlyAccess();

  const scrollYProgress = useScrollProgress(ref);

  const headlineY = useTransform(scrollYProgress, [0, 0.3], [0, -70]);
  const headlineOpacity = useTransform(scrollYProgress, [0, 0.28], [1, 0]);
  const headlineVisibility = useTransform(headlineOpacity, (v) => (v <= 0.01 ? "hidden" : "visible"));
  const cueOpacity = useTransform(scrollYProgress, [0, 0.08], [1, 0]);
  const starsOpacity = useTransform(scrollYProgress, [0.55, 1], [1, 0.5]);

  return (
    <section
      id="top"
      ref={ref}
      aria-label="Introduction"
      className={cn("relative bg-night-900", reduced ? "" : "h-[200svh]")}
    >
      <div
        className={cn(
          "bg-night-900",
          reduced ? "relative min-h-[100svh]" : "sticky top-0 h-[100svh] overflow-hidden",
        )}
      >
        {/* Aurora: one slow, faint wash of the accent behind the stars. */}
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
          <div
            className="aurora absolute -inset-[20%]"
            style={{
              background:
                "radial-gradient(38% 30% at 34% 22%, rgba(124,92,255,0.13) 0%, rgba(124,92,255,0.04) 45%, transparent 72%), radial-gradient(30% 26% at 72% 70%, rgba(220,238,255,0.05) 0%, transparent 70%)",
            }}
          />
        </div>

        <motion.div
          className="pointer-events-none absolute inset-0"
          style={reduced ? undefined : { opacity: starsOpacity }}
        >
          <Starfield
            parallax
            count={3000}
            mobileCount={1800}
            constellationCount={9}
            seed={11}
            brightness={1.55}
          />
        </motion.div>

        <Container className="relative z-10 flex h-full min-h-[100svh] flex-col justify-center pb-16 pt-24 sm:pt-28">
          <motion.div
            style={reduced ? undefined : { y: headlineY, opacity: headlineOpacity, visibility: headlineVisibility }}
            className="max-w-[1160px] [text-shadow:0_2px_24px_rgba(0,0,0,0.62)]"
          >
            <div className="hero-fade" style={{ "--d": "0.1s" } as React.CSSProperties}>
              <LiveNow className="text-white/60" />
            </div>

            <h1 className="type-hero mt-8 text-white">
              <Line delay={0.15}>Your week just changed.</Line>
              <Line delay={0.27}>
                Your plan <em className="accent-serif not-italic text-accent-200">already knows.</em>
              </Line>
            </h1>

            <p
              className="hero-fade-up type-body-lg mt-8 max-w-[640px] text-white/65"
              style={{ "--d": "0.5s" } as React.CSSProperties}
            >
              Arcadia builds your study plan around classes, deadlines, training and everything
              else in your life. Then it quietly rebuilds the plan every time something moves.
            </p>

            <div
              className="hero-fade-up mt-10 flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-6"
              style={{ "--d": "0.65s" } as React.CSSProperties}
            >
              <Button tone="dark" onClick={() => open("access")} className="sm:min-w-[172px]">
                Get early access
              </Button>
              <a
                href="#today"
                className="group inline-flex h-12 items-center gap-2 px-1 text-[15px] font-medium text-white/80 transition-colors duration-200 hover:text-white"
              >
                Watch a week re-plan itself
                <span
                  aria-hidden="true"
                  className="inline-block transition-transform duration-300 ease-[var(--ease-out-expo)] group-hover:translate-y-0.5"
                >
                  ↓
                </span>
              </a>
            </div>
          </motion.div>
        </Container>

        {!reduced && (
          <>
            <motion.div
              aria-hidden="true"
              style={{ opacity: cueOpacity }}
              className="absolute bottom-8 left-1/2 hidden -translate-x-1/2 flex-col items-center gap-3 sm:flex"
            >
              <span className="type-mono-label text-white/35">Scroll</span>
              <span className="block h-10 w-px bg-gradient-to-b from-white/40 to-transparent" />
            </motion.div>

            <div className="pointer-events-none absolute inset-0 flex items-center justify-center px-5 pt-20 sm:px-8 lg:px-12">
              <HeroInterface progress={scrollYProgress} />
            </div>
          </>
        )}
      </div>

      {reduced && (
        <Container className="pb-24">
          <HeroInterface />
        </Container>
      )}
    </section>
  );
}

function Line({ children, delay }: { children: React.ReactNode; delay: number }) {
  return (
    <span className="block overflow-hidden pb-[0.08em] -mb-[0.08em]">
      <span className="hero-rise block" style={{ "--d": `${delay}s` } as React.CSSProperties}>
        {children}
      </span>
    </span>
  );
}
