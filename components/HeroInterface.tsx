"use client";

import { motion, useMotionTemplate, useTransform, type MotionStyle, type MotionValue } from "framer-motion";
import {
  DAYS,
  DAY_LABELS,
  WEEK_VIEW,
  initialSchedule,
  type ScheduleBlock,
} from "@/lib/schedule";
import { GridEvent } from "./ScheduleEvent";

/**
 * Scatter offsets (vw, vh) for the fragments that resolve into the week.
 * Deterministic so the sequence reads the same on every visit.
 */
const SCATTER: Record<string, [number, number]> = {
  "mon-methods": [-22, 26],
  "mon-bball": [-24, -10],
  "mon-english": [-14, 40],
  "tue-chem": [-10, -30],
  "tue-methods": [-24, 12],
  "tue-dinner": [-16, 34],
  "wed-english": [4, -34],
  "wed-bball": [0, 38],
  "wed-chem": [12, 28],
  "wed-methods": [-4, 44],
  "thu-chem": [18, -28],
  "thu-methods": [22, 20],
  "fri-plans": [20, 32],
};

const STATIC_CATEGORIES = new Set(["school", "sleep", "exam"]);
const SPAN = WEEK_VIEW.end - WEEK_VIEW.start;

function blockStyle(block: ScheduleBlock): React.CSSProperties {
  const dayIndex = DAYS.indexOf(block.day);
  return {
    top: `${((block.start - WEEK_VIEW.start) / SPAN) * 100}%`,
    height: `${((block.end - block.start) / SPAN) * 100}%`,
    left: `${dayIndex * 20}%`,
    width: "20%",
  };
}

const HOUR_MARKS = [9, 12, 15, 18, 21];

interface HeroInterfaceProps {
  /** Hero scroll progress 0–1. Omit for a static (reduced-motion) render. */
  progress?: MotionValue<number>;
}

export default function HeroInterface({ progress }: HeroInterfaceProps) {
  const staticBlocks = initialSchedule.filter((b) => STATIC_CATEGORIES.has(b.category));
  const fragments = initialSchedule.filter((b) => !STATIC_CATEGORIES.has(b.category));

  return (
    <div className="relative mx-auto w-full max-w-[940px]">
      {progress ? (
        <AnimatedFrame progress={progress} staticBlocks={staticBlocks} fragments={fragments} />
      ) : (
        <StaticFrame staticBlocks={staticBlocks} fragments={fragments} />
      )}
    </div>
  );
}

interface FrameParts {
  staticBlocks: ScheduleBlock[];
  fragments: ScheduleBlock[];
}

function AnimatedFrame({ progress, staticBlocks, fragments }: FrameParts & { progress: MotionValue<number> }) {
  const cardOpacity = useTransform(progress, [0.42, 0.68], [0, 1]);
  const blur = useTransform(progress, [0.42, 0.75], [14, 0]);
  const cardFilter = useMotionTemplate`blur(${blur}px)`;
  const cardScale = useTransform(progress, [0.42, 0.85], [0.965, 1]);
  const cardY = useTransform(progress, [0.42, 0.85], [48, 0]);
  const fragmentsOpacity = useTransform(progress, [0.05, 0.3], [0, 1]);
  const resolve = useTransform(progress, [0.6, 0.96], [0, 1]);

  return (
    <>
      <motion.div
        style={{ opacity: cardOpacity, filter: cardFilter, scale: cardScale, y: cardY }}
        className="will-change-[opacity,transform,filter]"
      >
        <Card staticBlocks={staticBlocks} />
      </motion.div>
      <motion.div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{ opacity: fragmentsOpacity, y: cardY, scale: cardScale, "--p": resolve } as MotionStyle}
      >
        <Fragments fragments={fragments} />
      </motion.div>
    </>
  );
}

function StaticFrame({ staticBlocks, fragments }: FrameParts) {
  return (
    <>
      <Card staticBlocks={staticBlocks} />
      <div aria-hidden="true" className="pointer-events-none absolute inset-0" style={{ "--p": 1 } as React.CSSProperties}>
        <Fragments fragments={fragments} />
      </div>
    </>
  );
}

/** Grid area offsets shared by the card body and the fragment layer. */
const BODY_TOP = "76px";
const GUTTER = "44px";

function Card({ staticBlocks }: { staticBlocks: ScheduleBlock[] }) {
  return (
    <div className="overflow-hidden rounded-[14px] border border-white/10 bg-white text-ui-text shadow-[0_40px_120px_rgba(0,0,0,0.55)]">
      <div className="flex h-11 items-center justify-between border-b border-ui-border px-4">
        <div className="flex items-center gap-4">
          <span className="text-[13px] font-medium">Week 7</span>
          <span className="tabular text-[12px] text-ui-muted">7 – 11 Sep</span>
        </div>
        <div className="tabular flex items-center gap-2 text-[11px] text-ui-muted">
          <span aria-hidden="true" className="animate-soft-pulse size-1.5 rounded-full bg-accent" />
          <span className="hidden sm:inline">Live ·</span> Up to date
        </div>
      </div>

      <div className="relative">
        <div className="flex h-8 items-end border-b border-ui-border pb-1.5" style={{ paddingLeft: GUTTER }}>
          {DAYS.map((d) => (
            <div key={d} className="flex-1 px-2 text-[11px] text-ui-muted sm:text-[12px]">
              <span className="font-medium text-ui-text">{d}</span>{" "}
              <span className="tabular">{DAY_LABELS[d].date}</span>
            </div>
          ))}
        </div>

        <div className="relative h-[300px] sm:h-[360px] lg:h-[400px]">
          {HOUR_MARKS.map((hour) => {
            const top = ((hour * 60 - WEEK_VIEW.start) / SPAN) * 100;
            return (
              <div key={hour} className="absolute inset-x-0" style={{ top: `${top}%` }}>
                <span className="tabular absolute -top-[7px] left-3 text-[10px] text-ui-muted sm:text-[11px]">
                  {hour > 12 ? hour - 12 : hour}
                  <span className="hidden sm:inline">{hour >= 12 ? " pm" : " am"}</span>
                </span>
                <div className="h-px bg-ui-border/80" style={{ marginLeft: GUTTER }} />
              </div>
            );
          })}
          {DAYS.slice(1).map((d, i) => (
            <div
              key={d}
              className="absolute bottom-0 top-0 w-px bg-ui-border/60"
              style={{ left: `calc(${GUTTER} + (100% - ${GUTTER}) * ${(i + 1) / 5})` }}
            />
          ))}
          <div className="absolute inset-y-0 right-0" style={{ left: GUTTER }}>
            {staticBlocks.map((b) => (
              <GridEvent key={b.id} block={b} dense style={blockStyle(b)} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function Fragments({ fragments }: { fragments: ScheduleBlock[] }) {
  return (
    <div className="absolute inset-0" style={{ top: BODY_TOP }}>
      <div className="absolute inset-y-0 right-0" style={{ left: GUTTER }}>
        {fragments.map((b) => {
          const [sx, sy] = SCATTER[b.id] ?? [0, 0];
          return (
            <GridEvent
              key={b.id}
              block={b}
              dense
              className="resolve-fragment"
              surfaceClassName="shadow-[0_8px_30px_rgba(0,0,0,0.35)]"
              style={{ ...blockStyle(b), "--sx": sx, "--sy": sy } as React.CSSProperties}
            />
          );
        })}
      </div>
    </div>
  );
}
