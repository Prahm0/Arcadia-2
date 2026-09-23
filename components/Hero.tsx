"use client";

import { motion, useSpring, useTransform, type MotionStyle, type MotionValue } from "framer-motion";
import { useRef } from "react";
import { usePrefersReducedMotion, useScrollProgress } from "@/lib/hooks";
import { cn } from "@/lib/cn";
import HeroInterface from "./HeroInterface";
import LiveNow from "./LiveNow";
import Starfield from "./Starfield";
import Button from "./ui/Button";
import Container from "./ui/Container";

/**
 * Hero scroll acts, in progress units. The section is 300svh over a 100svh
 * sticky child, so progress 0–1 spans two viewports and 0.01 is about 2svh.
 *
 *   0.03 – 0.30  the ARCADIA constellation comes apart
 *   0.32 – 0.44  the copy rises in, staggered
 *   0.44 – 0.62  the copy holds
 *   0.62 – 0.70  the copy lifts away
 *   0.68 – 0.94  the schedule card arrives and settles (see HeroInterface)
 */
const COPY_IN = 0.32;
const COPY_IN_END = 0.44;
const COPY_OUT = 0.62;
const COPY_OUT_END = 0.7;

export default function Hero() {
  const ref = useRef<HTMLElement>(null);
  const reduced = usePrefersReducedMotion();

  // Raw scroll position drives everything in this section. A mouse wheel
  // delivers it in big discrete jumps, which made the scrubbed animation feel
  // step-by-step; a spring eases the value so wheel jumps glide instead. The
  // trackpad already felt smooth and stays that way.
  const rawProgress = useScrollProgress(ref);
  const scrollYProgress = useSpring(rawProgress, { stiffness: 150, damping: 30, mass: 0.3 });

  /* The block travels as one: it settles as it arrives, then lifts as it goes. */
  const copyY = useTransform(scrollYProgress, [COPY_IN, COPY_IN_END, COPY_OUT, COPY_OUT_END + 0.01], [28, 0, 0, -56]);
  const copyExit = useTransform(scrollYProgress, [COPY_OUT, COPY_OUT_END], [1, 0]);
  /* Gates the buttons only, so the h1 stays in the accessibility tree throughout. */
  const ctaGate = useTransform(scrollYProgress, [COPY_IN, COPY_IN + 0.02, COPY_OUT, COPY_OUT_END], [0, 1, 1, 0]);
  const ctaVisibility = useTransform(ctaGate, (v) => (v <= 0.01 ? "hidden" : "visible"));
  const ctaPointer = useTransform(ctaGate, (v) => (v < 0.5 ? "none" : "auto"));

  const cueOpacity = useTransform(scrollYProgress, [0, 0.06], [1, 0]);
  const starsOpacity = useTransform(scrollYProgress, [0.32, 0.62, 0.9], [1, 0.68, 0.42]);

  return (
    <section
      id="top"
      ref={ref}
      aria-label="Introduction"
      className={cn("relative bg-night-900", reduced ? "" : "h-[300svh]")}
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
            interactive
            progress={reduced ? undefined : scrollYProgress}
            revealWord="ARCADIA"
            revealMode="disperse"
            revealRange={[0.03, 0.30]}
            count={3600}
            mobileCount={2050}
            constellationCount={9}
            seed={11}
            brightness={1.55}
          />
        </motion.div>

        <Container className="relative z-10 flex h-full min-h-[100svh] flex-col justify-center pb-16 pt-24 sm:pt-28">
          <motion.div
            style={reduced ? undefined : { y: copyY, opacity: copyExit }}
            className="max-w-[1160px] [text-shadow:0_2px_24px_rgba(0,0,0,0.62)]"
          >
            <CopyItem progress={scrollYProgress} reduced={reduced} delay={0} restClass="hero-fade" restDelay="0.1s">
              <LiveNow className="text-white/60" />
            </CopyItem>

            <h1 className="type-hero mt-8 text-white">
              <Line progress={scrollYProgress} reduced={reduced} delay={0.015} restDelay="0.15s">
                Your study plan
              </Line>
              <Line progress={scrollYProgress} reduced={reduced} delay={0.03} restDelay="0.27s">
                survives <em className="accent-serif not-italic text-accent-200">real life.</em>
              </Line>
            </h1>

            <CopyItem
              progress={scrollYProgress}
              reduced={reduced}
              delay={0.05}
              className="mt-8"
              restClass="hero-fade-up"
              restDelay="0.5s"
            >
              <p className="type-body-lg max-w-[640px] text-white/65">
                Arcadia plans around your school, deadlines, sport, work and the rest of your
                week. When something changes, it rebuilds the plan and shows you what to do next.
              </p>
            </CopyItem>

            <CopyItem
              progress={scrollYProgress}
              reduced={reduced}
              delay={0.07}
              className="mt-10"
              restClass="hero-fade-up"
              restDelay="0.65s"
              style={reduced ? undefined : { visibility: ctaVisibility, pointerEvents: ctaPointer }}
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-6">
                <Button tone="dark" href="/register" className="sm:min-w-[172px]">
                  Get started
                </Button>
                <a
                  href="#recovery"
                  className="group inline-flex h-12 items-center gap-2 px-1 text-[15px] font-medium text-white/80 transition-colors duration-200 hover:text-white"
                >
                  Watch the recovery moment
                  <span
                    aria-hidden="true"
                    className="inline-block transition-transform duration-300 ease-[var(--ease-out-expo)] group-hover:translate-y-0.5"
                  >
                    ↓
                  </span>
                </a>
              </div>
            </CopyItem>
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

interface CopyItemProps {
  progress: MotionValue<number>;
  reduced: boolean;
  /** Offset into the shared arrival window, so the block assembles in order. */
  delay: number;
  className?: string;
  /** Load-time animation used only on the reduced-motion path. */
  restClass?: string;
  restDelay?: string;
  /** Extra motion-aware style, e.g. the CTA visibility gate. Animated path only. */
  style?: MotionStyle;
  children: React.ReactNode;
}

/**
 * One piece of hero copy, arriving on scroll rather than on load.
 *
 * The reduced-motion path keeps the original CSS entrance. The animated path
 * must not, because those utilities are declared `both` and a filled CSS
 * animation outranks inline styles, so a finished `hero-fade-up` would clobber
 * the transform Framer is driving on the same element.
 */
function CopyItem({ progress, reduced, delay, className, restClass, restDelay, style, children }: CopyItemProps) {
  const opacity = useTransform(progress, [COPY_IN + delay, COPY_IN_END + delay], [0, 1]);
  const y = useTransform(progress, [COPY_IN + delay, COPY_IN_END + delay], [26, 0]);

  if (reduced) {
    return (
      <div className={cn(className, restClass)} style={{ "--d": restDelay } as React.CSSProperties}>
        {children}
      </div>
    );
  }

  return (
    <motion.div className={className} style={{ opacity, y, ...style }}>
      {children}
    </motion.div>
  );
}

/** One headline line, revealed from behind its own top edge. */
function Line({
  progress,
  reduced,
  delay,
  restDelay,
  children,
}: {
  progress: MotionValue<number>;
  reduced: boolean;
  delay: number;
  restDelay: string;
  children: React.ReactNode;
}) {
  const y = useTransform(progress, [COPY_IN + delay, COPY_IN_END + delay], ["105%", "0%"]);
  const opacity = useTransform(progress, [COPY_IN + delay, COPY_IN_END + delay], [0, 1]);

  return (
    <span className="block overflow-hidden pb-[0.08em] -mb-[0.08em]">
      {reduced ? (
        <span className="hero-rise block" style={{ "--d": restDelay } as React.CSSProperties}>
          {children}
        </span>
      ) : (
        <motion.span className="block" style={{ y, opacity }}>
          {children}
        </motion.span>
      )}
    </span>
  );
}
