"use client";

import { AnimatePresence, LayoutGroup, motion, useInView } from "framer-motion";
import { useCallback, useEffect, useRef, useState } from "react";
import { EASE_OUT } from "@/lib/animation";
import { useCardGlow, useIsMobile, usePrefersReducedMotion } from "@/lib/hooks";
import {
  DAYS,
  DAY_LABELS,
  WEEK_VIEW,
  applyChanges,
  changeSummaries,
  initialSchedule,
  scheduleChanges,
  type Day,
  type ScheduleBlock,
} from "@/lib/schedule";
import { cn } from "@/lib/cn";
import { GridEvent, RowEvent } from "./ScheduleEvent";
import Container from "./ui/Container";
import FadeIn from "./ui/FadeIn";
import RevealText from "./ui/RevealText";
import SectionLabel from "./ui/SectionLabel";

/** Milliseconds after the demo starts at which each phase begins. */
const PHASE_TIMES = [900, 2000, 2800, 3500, 4200, 5000];
const TOTAL_PHASES = PHASE_TIMES.length; // banner, four changes, status

const SPAN = WEEK_VIEW.end - WEEK_VIEW.start;
const HOUR_MARKS = [8, 10, 12, 14, 16, 18, 20, 22];

function gridPosition(block: ScheduleBlock) {
  const dayIndex = DAYS.indexOf(block.day);
  return {
    top: `${((block.start - WEEK_VIEW.start) / SPAN) * 100}%`,
    height: `${((block.end - block.start) / SPAN) * 100}%`,
    left: `${dayIndex * 20}%`,
    width: "20%",
  };
}

/** Diff-style lines for the rail: what left, what arrived. */
const DIFF: Record<string, { minus: string; plus: string }> = {
  "wed-bball": { minus: "6:00 pm  Basketball", plus: "5:30 pm  Basketball" },
  "wed-english": { minus: "4:30 pm  English Essay", plus: "7:15 pm  English Essay" },
  "wed-chem": { minus: "40 min  Chemistry", plus: "30 min  Chemistry" },
  "wed-methods": { minus: "Wed  Methods Practice", plus: "Thu  Methods Practice" },
};

export default function ScheduleDemo() {
  const sectionRef = useRef<HTMLDivElement>(null);
  const inView = useInView(sectionRef, { once: true, amount: 0.4 });
  const reduced = usePrefersReducedMotion();
  const isMobile = useIsMobile();
  const glow = useCardGlow();

  const [phase, setPhase] = useState(0);
  const [run, setRun] = useState(0);

  const replay = useCallback(() => {
    setPhase(0);
    setRun((r) => r + 1);
  }, []);

  useEffect(() => {
    if (!inView) return;
    const timers = PHASE_TIMES.map((t, i) =>
      window.setTimeout(() => setPhase(i + 1), reduced ? 200 + i * 350 : t),
    );
    return () => timers.forEach(clearTimeout);
  }, [inView, run, reduced]);

  const applied = Math.max(0, Math.min(scheduleChanges.length, phase - 1));
  const blocks = applyChanges(initialSchedule, scheduleChanges, applied);
  const changedIds = new Set(scheduleChanges.slice(0, applied).map((b) => b.id));
  const showBanner = phase >= 1 && phase < TOTAL_PHASES;
  const updated = phase >= TOTAL_PHASES;

  return (
    <section
      id="schedule"
      aria-labelledby="schedule-heading"
      className="section-seam bg-dusk py-[120px] text-white lg:py-[160px]"
    >
      <Container>
        <div className="grid grid-cols-12 gap-x-6">
          <div className="col-span-12 lg:col-span-8">
            <FadeIn>
              <SectionLabel time="Wed 9 Sep · 3:15 pm">Adaptive schedule</SectionLabel>
            </FadeIn>
            <RevealText
              id="schedule-heading"
              as="h2"
              lines={["Training moved.", "So did everything after it."]}
              accent="everything after it."
              className="type-display mt-8"
              delay={0.1}
            />
          </div>
          <div className="col-span-12 mt-8 lg:col-span-4 lg:mt-0 lg:self-end">
            <FadeIn delay={0.2}>
              <p className="type-body-lg max-w-[420px] text-white/60">
                Basketball shifts half an hour. Arcadia re-flows the evening, keeps your test
                prep ahead of Friday and still has you in bed by 10:30.
              </p>
            </FadeIn>
          </div>
        </div>

        <FadeIn delay={0.2} y={32} duration={1} amount={0.2} className="mt-16 lg:mt-20">
          <div className="grid grid-cols-12 gap-6">
            <div className="col-span-12 lg:col-span-9">
              <div
                ref={sectionRef}
                {...glow}
                className="card-glow overflow-hidden rounded-[16px] border border-white/10 bg-white text-ui-text shadow-[0_40px_120px_rgba(0,0,0,0.5)]"
              >
                <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-b border-ui-border px-4 py-3 sm:px-6">
                  <div className="flex items-center gap-4">
                    <span className="text-[14px] font-medium">Week 7</span>
                    <span className="tabular text-[12px] text-ui-muted">7 – 11 Sep</span>
                  </div>
                  <div className="flex items-center gap-4">
                    <StatusLine showBanner={showBanner} updated={updated} reduced={reduced} />
                    <button
                      type="button"
                      onClick={replay}
                      disabled={phase !== 0 && phase < TOTAL_PHASES}
                      className="type-mono-label rounded-[6px] px-2 py-1 text-ui-muted transition-colors hover:bg-ui-surface hover:text-ui-text disabled:opacity-40 disabled:hover:bg-transparent"
                    >
                      Replay
                    </button>
                  </div>
                </div>

                {isMobile ? (
                  <DayLists blocks={blocks} changedIds={changedIds} reduced={reduced} />
                ) : (
                  <WeekGrid blocks={blocks} changedIds={changedIds} reduced={reduced} />
                )}

                <div className="lg:hidden">
                  <ChangeStrip applied={applied} updated={updated} reduced={reduced} />
                </div>
              </div>
            </div>

            <div className="hidden lg:col-span-3 lg:block">
              <DiffRail applied={applied} updated={updated} reduced={reduced} />
            </div>
          </div>
        </FadeIn>
      </Container>
    </section>
  );
}

function StatusLine({ showBanner, updated, reduced }: { showBanner: boolean; updated: boolean; reduced: boolean }) {
  return (
    <div className="flex min-h-[24px] items-center" aria-live="polite">
      <AnimatePresence mode="wait" initial={false}>
        {showBanner && (
          <motion.p
            key="banner"
            initial={{ opacity: 0, y: reduced ? 0 : 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: reduced ? 0 : -6 }}
            transition={{ duration: 0.45, ease: EASE_OUT }}
            className="flex items-center gap-2 text-[13px] text-ui-text"
          >
            <span aria-hidden="true" className="size-1.5 rounded-full bg-ui-text" />
            <span className="type-mono-label hidden text-ui-muted sm:inline">Calendar</span>
            <span className="hidden sm:inline">Basketball training moved to 5:30 PM.</span>
            <span className="tabular text-[12px] sm:hidden">Training → 5:30 pm</span>
          </motion.p>
        )}
        {updated && (
          <motion.p
            key="updated"
            initial={{ opacity: 0, y: reduced ? 0 : 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.45, ease: EASE_OUT }}
            className="flex items-center gap-2 text-[13px] font-medium text-ui-text"
          >
            <ArcadiaIndicator />
            Schedule updated.
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
}

/** Tiny purple Arcadia intelligence indicator. */
export function ArcadiaIndicator({ className }: { className?: string }) {
  return (
    <span aria-hidden="true" className={cn("relative flex size-3 items-center justify-center", className)}>
      <span className="animate-ping-once absolute inset-0 rounded-full bg-accent/50 motion-reduce:hidden" />
      <span className="size-1.5 rounded-full bg-accent shadow-[0_0_8px_rgba(124,92,255,0.8)]" />
    </span>
  );
}

function WeekGrid({ blocks, changedIds, reduced }: { blocks: ScheduleBlock[]; changedIds: Set<string>; reduced: boolean }) {
  const transition = { duration: reduced ? 0 : 1.1, ease: EASE_OUT };
  return (
    <div className="relative">
      <div className="flex h-9 items-end border-b border-ui-border pb-2 pl-14">
        {DAYS.map((d) => (
          <div key={d} className="flex-1 px-3 text-[13px]">
            <span className="font-medium text-ui-text">{DAY_LABELS[d].long}</span>{" "}
            <span className="tabular text-[12px] text-ui-muted">{DAY_LABELS[d].date}</span>
          </div>
        ))}
      </div>
      <div className="relative h-[600px]">
        {HOUR_MARKS.map((hour) => {
          const top = ((hour * 60 - WEEK_VIEW.start) / SPAN) * 100;
          return (
            <div key={hour} className="absolute inset-x-0" style={{ top: `${top}%` }}>
              <span className="tabular absolute -top-[8px] left-4 text-[10px] text-ui-muted">
                {hour > 12 ? hour - 12 : hour} {hour >= 12 ? "pm" : "am"}
              </span>
              <div className="ml-14 h-px bg-ui-border/80" />
            </div>
          );
        })}
        {DAYS.slice(1).map((d, i) => (
          <div
            key={d}
            className="absolute bottom-0 top-0 w-px bg-ui-border/60"
            style={{ left: `calc(56px + (100% - 56px) * ${(i + 1) / 5})` }}
          />
        ))}
        <div className="absolute inset-y-0 left-14 right-0">
          {blocks.map((b) => (
            <GridEvent
              key={b.id}
              block={b}
              changed={changedIds.has(b.id)}
              initial={false}
              animate={gridPosition(b)}
              transition={transition}
              className={cn(b.category === "exam" && "z-10")}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

const MOBILE_DAYS: Day[] = ["Wed", "Thu"];

function DayLists({ blocks, changedIds, reduced }: { blocks: ScheduleBlock[]; changedIds: Set<string>; reduced: boolean }) {
  const transition = { duration: reduced ? 0 : 0.9, ease: EASE_OUT };
  return (
    <LayoutGroup id="schedule-mobile">
      <div className="flex flex-col divide-y divide-ui-border">
        {MOBILE_DAYS.map((day) => {
          const dayBlocks = blocks
            .filter((b) => b.day === day)
            .sort((a, b) => a.start - b.start);
          return (
            <div key={day} className="px-4 py-4">
              <p className="text-[13px]">
                <span className="font-medium text-ui-text">{DAY_LABELS[day].long}</span>{" "}
                <span className="tabular text-[12px] text-ui-muted">{DAY_LABELS[day].date}</span>
              </p>
              <ul className="mt-3 flex flex-col gap-2">
                <AnimatePresence initial={false}>
                  {dayBlocks.map((b) => (
                    <RowEvent
                      key={b.id}
                      layout
                      layoutId={`row-${b.id}`}
                      block={b}
                      changed={changedIds.has(b.id)}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={transition}
                    />
                  ))}
                </AnimatePresence>
              </ul>
            </div>
          );
        })}
      </div>
    </LayoutGroup>
  );
}

/** Mono diff of the week, beside the grid on wide screens. */
function DiffRail({ applied, updated, reduced }: { applied: number; updated: boolean; reduced: boolean }) {
  return (
    <div className="flex h-full flex-col border-t border-white/[0.1] pt-5 font-mono text-[12.5px]" aria-live="polite">
      <p className="flex items-center justify-between text-white/45">
        <span>Changes</span>
        <span className="tabular">{applied}/{changeSummaries.length}</span>
      </p>
      <ol className="mt-5 flex flex-col gap-5">
        <AnimatePresence initial={false}>
          {changeSummaries.slice(0, applied).map((c, i) => {
            const d = DIFF[c.id];
            return (
              <motion.li
                key={c.id}
                initial={{ opacity: 0, x: reduced ? 0 : -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.5, ease: EASE_OUT }}
                className="flex flex-col gap-1 leading-snug"
              >
                <span className="text-white/30">0{i + 1}</span>
                <span className="whitespace-pre text-white/40 line-through decoration-white/25">− {d?.minus ?? c.label}</span>
                <span className="whitespace-pre text-accent-200">+ {d?.plus ?? c.detail}</span>
              </motion.li>
            );
          })}
        </AnimatePresence>
      </ol>
      {updated && (
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5 }}
          className="mt-auto border-t border-white/[0.1] pt-4 text-white/55"
        >
          <span className="text-white/35">= </span>Sleep kept · 10:30 pm
        </motion.p>
      )}
    </div>
  );
}

function ChangeStrip({ applied, updated, reduced }: { applied: number; updated: boolean; reduced: boolean }) {
  return (
    <div className="flex min-h-[52px] flex-wrap items-center gap-x-6 gap-y-2 border-t border-ui-border px-4 py-3 sm:px-6">
      <span className="type-mono-label font-medium text-ui-muted">
        {applied === 0 ? "No changes" : `${applied} ${applied === 1 ? "change" : "changes"}`}
      </span>
      <ul className="flex flex-wrap gap-x-5 gap-y-1.5">
        <AnimatePresence initial={false}>
          {changeSummaries.slice(0, applied).map((c) => (
            <motion.li
              key={c.id}
              initial={{ opacity: 0, x: reduced ? 0 : -6 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.5, ease: EASE_OUT }}
              className="flex items-center gap-2 text-[12px]"
            >
              <span aria-hidden="true" className="size-1 rounded-full bg-accent" />
              <span className="text-ui-text">{c.label}</span>
              <span className="tabular text-[11px] text-ui-muted">{c.detail}</span>
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>
      {updated && (
        <motion.span
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5 }}
          className="tabular ml-auto text-[11px] text-ui-muted"
        >
          Sleep kept · 10:30 pm
        </motion.span>
      )}
    </div>
  );
}
