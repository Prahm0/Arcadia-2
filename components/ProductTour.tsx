"use client";

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { useInView } from "framer-motion";
import ConstellationCard from "@/components/app/sky/ConstellationCard";
import { constellationById, type SkyCard } from "@/shared/constellations";
import { usePrefersReducedMotion } from "@/lib/hooks";
import { cn } from "@/lib/cn";
import Container from "./ui/Container";
import FadeIn from "./ui/FadeIn";
import RevealText from "./ui/RevealText";
import SectionLabel from "./ui/SectionLabel";

/* Same hues the app hands out to a student's first three subjects. */
const SUBJECT = {
  methods: { name: "Methods", colour: "#2f7cf6" },
  english: { name: "English", colour: "#e8603c" },
  chem: { name: "Chemistry", colour: "#23a35a" },
};

/**
 * The rest of the app, past the plan: focus sessions, study rooms, flashcards
 * and the streak sky. Everything inside the tiles is drawn with the app's own
 * dark tokens (the `data-app-theme="dark"` wrapper), and the streak card is
 * the real ConstellationCard, so this section looks like the product because
 * it mostly is the product.
 */
export default function ProductTour() {
  return (
    <section
      id="inside"
      aria-labelledby="inside-heading"
      className="section-seam relative overflow-hidden bg-night-900 py-[120px] text-white lg:py-[160px]"
    >
      <Container>
        <div className="grid grid-cols-12 gap-x-6 gap-y-10">
          <div className="col-span-12 lg:col-span-7">
            <FadeIn>
              <SectionLabel time="Tue 8 Sep · 4:10 pm">Inside Arcadia</SectionLabel>
            </FadeIn>
            <RevealText
              id="inside-heading"
              as="h2"
              lines={["Then you actually", "sit down and study."]}
              accent="study."
              className="type-display mt-8"
              delay={0.1}
            />
          </div>
          <div className="col-span-12 lg:col-span-4 lg:col-start-9 lg:self-end">
            <FadeIn delay={0.2}>
              <p className="type-body-lg max-w-[400px] text-white/60">
                The plan is the start. The timer, your study room, your flashcards and your
                streak all live in the same app, so there&rsquo;s nothing to switch between.
              </p>
            </FadeIn>
          </div>
        </div>

        <div data-app-theme="dark" className="mt-16 grid grid-cols-12 gap-4 lg:mt-24 lg:gap-5">
          <Tile
            className="col-span-12 lg:col-span-7"
            label="Focus"
            title="A timer that knows what the session is for."
            body="Arcad sets up each block when you open it: the topic, why it matters now and up to three steps. On desktop, pop the timer out and it floats over your other windows."
          >
            <FocusMock />
          </Tile>
          <Tile
            className="col-span-12 md:col-span-6 lg:col-span-5"
            label="Streaks"
            title="Focus time lights up a sky."
            body="Minutes of focus light stars, and the stars form the 88 real constellations. You keep each card as it forms, one after another."
          >
            <StreakMock />
          </Tile>
          <Tile
            className="col-span-12 md:col-span-6 lg:col-span-5"
            label="Rooms"
            title="Study with your friends, live."
            body="See who’s focusing and on what, join their session, send a cheer and climb the week’s leaderboard."
          >
            <RoomMock />
          </Tile>
          <Tile
            className="col-span-12 lg:col-span-7"
            label="Resources"
            title="Your cards, sheets and files, by subject."
            body="Make flashcard decks and drill them, keep summary sheets and upload your notes. Arcad drafts from your own material and never does the work for you."
          >
            <CardsMock />
          </Tile>
        </div>

        <FadeIn delay={0.1} className="mt-10 lg:mt-12">
          <ul className="flex flex-wrap gap-x-6 gap-y-2" aria-label="Also in Arcadia">
            {[
              "Term · week · day planner",
              "Deadlines",
              "Google, Apple & Canvas calendars",
              "Analytics",
              "Weekly review",
              "Works in any browser",
            ].map((item) => (
              <li key={item} className="type-mono-label text-white/45">
                {item}
              </li>
            ))}
          </ul>
        </FadeIn>
      </Container>
    </section>
  );
}

function Tile({
  className,
  label,
  title,
  body,
  children,
}: {
  className?: string;
  label: string;
  title: string;
  body: string;
  children: ReactNode;
}) {
  return (
    <FadeIn className={cn("h-full", className)} y={28} duration={0.9} amount={0.2}>
      <article className="flex h-full flex-col overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03]">
        <div className="px-6 pt-6 sm:px-7 sm:pt-7">
          <p className="type-mono-label text-accent-200">{label}</p>
          <h3 className="mt-3 text-[22px] font-medium leading-[1.2] tracking-[-0.02em] text-white sm:text-[24px]">
            {title}
          </h3>
          <p className="mt-2 max-w-[520px] text-[15px] leading-relaxed text-white/55">{body}</p>
        </div>
        <div className="mt-6 flex flex-1 items-end px-4 pb-4 sm:px-6 sm:pb-6">{children}</div>
      </article>
    </FadeIn>
  );
}

/* ------------------------------------------------------------------ */
/* Pieces drawn in the app's own style                                 */
/* ------------------------------------------------------------------ */

const surface: CSSProperties = { background: "var(--app-surface)", boxShadow: "var(--elev-1)", color: "var(--app-text)" };
const muted: CSSProperties = { color: "var(--app-text-muted)" };
const faint: CSSProperties = { color: "var(--app-text-faint)" };

/** The app's SubjectTag: colour on the label itself, never a dot beside it. */
function Tag({ subject }: { subject: { name: string; colour: string } }) {
  return (
    <span
      className="inline-flex items-center rounded-[4px] px-1.5 py-px text-[12px] font-medium"
      style={{
        color: `color-mix(in oklab, ${subject.colour} 70%, var(--app-text))`,
        background: `color-mix(in oklab, ${subject.colour} 13%, transparent)`,
      }}
    >
      {subject.name}
    </span>
  );
}

const STEPS = ["Redo Q4–6 from last time", "Textbook 7.3, worked examples", "Two past-paper questions"];

function FocusMock() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { amount: 0.4 });
  const reduced = usePrefersReducedMotion();
  const [remaining, setRemaining] = useState(18 * 60 + 42);
  const [done, setDone] = useState<Set<number>>(() => new Set([0]));

  useEffect(() => {
    if (!inView || reduced) return;
    const id = window.setInterval(() => setRemaining((s) => (s <= 1 ? 25 * 60 : s - 1)), 1000);
    return () => window.clearInterval(id);
  }, [inView, reduced]);

  const mm = String(Math.floor(remaining / 60)).padStart(2, "0");
  const ss = String(remaining % 60).padStart(2, "0");
  const progress = 1 - remaining / (25 * 60);

  return (
    <div ref={ref} className="grid w-full gap-3 sm:grid-cols-[1fr_1.1fr]">
      <div className="flex flex-col justify-between rounded-lg p-5" style={surface}>
        <div className="flex items-center justify-between gap-3">
          <Tag subject={SUBJECT.chem} />
          <span className="text-[12px]" style={faint}>
            Classic 25/5
          </span>
        </div>
        <p
          className="mt-6 text-center font-mono text-[52px] font-medium leading-none tracking-[-0.04em] tabular-nums sm:text-[60px]"
          aria-label={`${mm} minutes ${ss} seconds left`}
        >
          {mm}:{ss}
        </p>
        <div className="mt-6 h-1 w-full overflow-hidden" style={{ background: "var(--app-accent-soft)" }}>
          <div className="h-full transition-[width] duration-1000 ease-linear" style={{ width: `${progress * 100}%`, background: "var(--app-accent)" }} />
        </div>
        <div className="mt-4 flex items-center justify-between text-[12.5px]" style={muted}>
          <span>Focus · 1 of 2</span>
          <span className="inline-flex items-center gap-1.5">
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <rect x="1.5" y="2.5" width="13" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.3" />
              <rect x="8" y="8" width="5" height="4" rx=".8" fill="currentColor" />
            </svg>
            Pop out
          </span>
        </div>
      </div>

      <div className="rounded-lg p-5" style={surface}>
        <p className="text-[12px] font-medium" style={{ color: "var(--app-arcad)" }}>
          Arcad&rsquo;s plan
        </p>
        <p className="mt-2 text-[15px] font-medium leading-snug">Equilibrium: Le Chatelier&rsquo;s principle</p>
        <p className="mt-1 text-[13px] leading-snug" style={muted}>
          Test on Monday, and you left Q4–6 unfinished last session.
        </p>
        <ul className="mt-4 flex flex-col gap-1" aria-label="Session steps">
          {STEPS.map((step, i) => {
            const checked = done.has(i);
            return (
              <li key={step}>
                <label className="flex cursor-pointer items-center gap-2.5 rounded-md px-1.5 py-1.5 text-[13.5px]">
                  <input
                    type="checkbox"
                    className="peer sr-only"
                    checked={checked}
                    onChange={() =>
                      setDone((prev) => {
                        const next = new Set(prev);
                        if (next.has(i)) next.delete(i);
                        else next.add(i);
                        return next;
                      })
                    }
                  />
                  <span
                    aria-hidden="true"
                    className="grid size-4 shrink-0 place-items-center rounded-[4px] border peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2"
                    style={{
                      borderColor: checked ? "var(--app-accent)" : "var(--app-border-strong)",
                      background: checked ? "var(--app-accent)" : "transparent",
                      color: "var(--app-accent-on)",
                    }}
                  >
                    {checked && (
                      <svg width="9" height="7" viewBox="0 0 10 8" fill="none">
                        <path d="M1 4l2.5 2.5L9 1" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                  </span>
                  <span className={cn("transition-opacity", checked && "line-through opacity-45")}>{step}</span>
                </label>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

/** Crux, part-way formed: the real card component on a sample streak. */
function StreakMock() {
  const definition = constellationById("crux");
  if (!definition) return null;
  const lit = Math.max(1, definition.points.length - 1);
  const card: SkyCard = {
    id: definition.id,
    value: lit,
    milestones: definition.points.map((_, index) => ({ index, earnedAt: index < lit ? 1 : null })),
    earnedAt: null,
    addedAt: 1,
    seen: true,
  };

  return (
    <div className="flex w-full items-end justify-between gap-5">
      <div className="w-[190px] shrink-0 sm:w-[210px]">
        <ConstellationCard card={card} following />
      </div>
      <dl className="flex flex-col gap-4 pb-1 text-right">
        <Stat value="12" label="day streak" />
        <Stat value={`${lit}/${definition.points.length}`} label="stars lit" />
        <Stat value="88" label="to collect" />
      </dl>
    </div>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <dt className="sr-only">{label}</dt>
      <dd className="font-mono text-[26px] font-medium leading-none tracking-[-0.03em] tabular-nums text-white">{value}</dd>
      <dd className="type-mono-label mt-1.5 text-white/45" aria-hidden="true">
        {label}
      </dd>
    </div>
  );
}

const MEMBERS = [
  { initials: "MO", name: "Mia", live: true, subject: SUBJECT.methods, minutes: 32, week: "9h 40m" },
  { initials: "JT", name: "Jack", live: true, subject: SUBJECT.chem, minutes: 14, week: "8h 05m" },
  { initials: "You", name: "You", live: false, subject: null, minutes: 0, week: "7h 20m" },
];

function RoomMock() {
  const [cheered, setCheered] = useState(false);

  return (
    <div className="flex w-full flex-col gap-3">
      <div className="rounded-lg p-4" style={surface}>
        <div className="flex items-baseline justify-between">
          <p className="text-[14px] font-semibold">Year 12 grind</p>
          <span className="text-[12px]" style={faint}>
            2 studying now
          </span>
        </div>
        <ul className="mt-3 flex flex-col gap-2">
          {MEMBERS.filter((m) => m.live).map((m, i) => (
            <li key={m.name} className="flex items-center gap-3">
              <Avatar initials={m.initials} live />
              <div className="min-w-0 flex-1">
                <p className="text-[13.5px] font-medium">{m.name}</p>
                <p className="flex items-center gap-1.5 text-[12px]" style={muted}>
                  {m.subject && <Tag subject={m.subject} />}
                  <span className="tabular-nums">{m.minutes}m in</span>
                </p>
              </div>
              {i === 0 ? (
                <button
                  type="button"
                  onClick={() => setCheered(true)}
                  disabled={cheered}
                  className="rounded-md px-2.5 py-1 text-[12px] font-medium transition-colors"
                  style={{
                    background: cheered ? "transparent" : "var(--app-accent-soft)",
                    color: cheered ? "var(--app-text-faint)" : "var(--app-text)",
                  }}
                >
                  {cheered ? "Cheered ✦" : "Cheer"}
                </button>
              ) : (
                <span className="rounded-md px-2.5 py-1 text-[12px] font-medium" style={{ background: "var(--app-accent-soft)" }}>
                  Join
                </span>
              )}
            </li>
          ))}
        </ul>
      </div>
      <div className="rounded-lg p-4" style={surface}>
        <div className="flex items-baseline justify-between">
          <p className="text-[14px] font-semibold">Leaderboard</p>
          <span className="text-[12px]" style={faint}>
            Past 7 days
          </span>
        </div>
        <ol className="mt-2 flex flex-col">
          {MEMBERS.map((m, i) => (
            <li key={m.name} className="flex items-center gap-3 py-1.5 text-[13px]">
              <span className="w-4 font-mono tabular-nums" style={faint}>
                {i + 1}
              </span>
              <span className="flex-1" style={m.name === "You" ? undefined : muted}>
                {m.name}
              </span>
              <span className="font-mono tabular-nums">{m.week}</span>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

/** Live members wear a green ring, the app's live colour, never a dot. */
function Avatar({ initials, live }: { initials: string; live?: boolean }) {
  return (
    <span
      className="grid size-8 shrink-0 place-items-center rounded-full text-[11px] font-semibold"
      style={{
        background: "var(--app-surface-soft)",
        boxShadow: live ? "0 0 0 1.5px var(--app-success)" : "0 0 0 1px var(--app-border)",
      }}
    >
      {initials}
    </span>
  );
}

const CARDS = [
  { front: "Le Chatelier’s principle", back: "A system at equilibrium shifts to partly oppose any change made to it." },
  { front: "Effect of a catalyst on equilibrium", back: "None on position. It speeds up both directions equally, so equilibrium is reached sooner." },
  { front: "Kc for an exothermic reaction as temperature rises", back: "Kc decreases. The system shifts left to absorb the added heat." },
];

function CardsMock() {
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [got, setGot] = useState(0);
  const card = CARDS[index % CARDS.length];

  const answer = (right: boolean) => {
    if (right) setGot((g) => g + 1);
    if (!flipped) {
      setIndex((i) => i + 1);
      return;
    }
    // Swap cards halfway through the flip back, when the card is edge-on, so
    // the next card's answer never shows on the way round.
    setFlipped(false);
    window.setTimeout(() => setIndex((i) => i + 1), 150);
  };

  return (
    <div className="grid w-full gap-3 sm:grid-cols-[1.35fr_1fr]">
      <div className="flex flex-col rounded-lg p-4" style={surface}>
        <div className="flex items-center justify-between">
          <Tag subject={SUBJECT.chem} />
          <span className="text-[12px] tabular-nums" style={faint}>
            {(index % CARDS.length) + 1} / 24
          </span>
        </div>
        <button
          type="button"
          onClick={() => setFlipped((f) => !f)}
          aria-label={flipped ? "Show the term" : "Flip to see the definition"}
          className="mt-3 [perspective:1000px]"
        >
          <span
            className="relative grid min-h-[132px] transition-transform duration-300 ease-out [transform-style:preserve-3d] motion-reduce:transition-none"
            style={{ transform: flipped ? "rotateY(180deg)" : "none" }}
          >
            <CardFace side="Term" text={card.front} hidden={flipped} />
            <CardFace side="Definition" text={card.back} hidden={!flipped} back />
          </span>
        </button>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => answer(false)}
            className="h-9 rounded-md text-[13px] font-medium"
            style={{ background: "var(--app-surface-soft)", color: "var(--app-text-soft)" }}
          >
            Not yet
          </button>
          <button
            type="button"
            onClick={() => answer(true)}
            className="h-9 rounded-md text-[13px] font-medium"
            style={{ background: "var(--app-accent)", color: "var(--app-accent-on)" }}
          >
            Got it
          </button>
        </div>
        <p className="mt-2 text-center text-[12px] tabular-nums" style={faint}>
          {got} got it this round
        </p>
      </div>

      <ul className="flex flex-col gap-2" aria-label="Resources by subject">
        {[
          { kind: "Deck", title: "Equilibrium", meta: "24 cards · 6 due", subject: SUBJECT.chem },
          { kind: "Sheet", title: "Complex numbers", meta: "Summary sheet", subject: SUBJECT.methods },
          { kind: "File", title: "Essay rubric.pdf", meta: "Uploaded notes", subject: SUBJECT.english },
        ].map((item) => (
          <li key={item.title} className="rounded-lg p-3.5" style={surface}>
            <div className="flex items-center justify-between gap-2">
              <span className="type-mono-label text-[11px]" style={faint}>
                {item.kind}
              </span>
              <Tag subject={item.subject} />
            </div>
            <p className="mt-2 text-[13.5px] font-medium">{item.title}</p>
            <p className="text-[12px]" style={muted}>
              {item.meta}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}

function CardFace({ side, text, hidden, back }: { side: string; text: string; hidden: boolean; back?: boolean }) {
  return (
    <span
      aria-hidden={hidden}
      className="col-start-1 row-start-1 flex flex-col items-center justify-center gap-2 rounded-md px-4 py-5 text-center [backface-visibility:hidden]"
      style={{ background: "var(--app-surface-soft)", transform: back ? "rotateY(180deg)" : undefined }}
    >
      <span className="text-[11px] font-medium uppercase tracking-[0.08em]" style={faint}>
        {side}
      </span>
      <span className={cn("leading-snug", back ? "text-[14px]" : "text-[17px] font-medium")}>{text}</span>
    </span>
  );
}
