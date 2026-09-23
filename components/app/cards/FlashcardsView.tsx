"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { Card } from "@/lib/api/cards";
import { useReviewQueue } from "@/lib/app/useReviewQueue";
import AppButton, { appButtonClass } from "../AppButton";
import { shuffled } from "./shared";
import StudyShell, { CardText, OptionToggle, ownsKey } from "./StudyShell";

/**
 * Flip, then say whether you knew it. "Not yet" cards come round again at
 * the end; every answer goes into the card's review schedule.
 */
export default function FlashcardsView({
  title,
  backHref,
  cards,
  labelFor,
}: {
  title: string;
  backHref: string;
  cards: Card[];
  /** Where a card is from, when studying across decks. */
  labelFor?: (card: Card) => string;
}) {
  const { record, failed } = useReviewQueue();
  const [shuffle, setShuffle] = useState(false);
  const [backFirst, setBackFirst] = useState(false);
  const [order, setOrder] = useState<Card[]>(cards);
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [missed, setMissed] = useState<Card[]>([]);
  const [round, setRound] = useState(1);

  const card = order[index] as Card | undefined;
  const done = index >= order.length;

  const answer = useCallback(
    (knew: boolean) => {
      if (!card) return;
      record(card.id, knew);
      if (!knew) setMissed((list) => [...list, card]);
      setFlipped(false);
      setIndex((i) => i + 1);
      // A focused button would take the next Space as a click.
      (document.activeElement as HTMLElement | null)?.blur?.();
    },
    [card, record],
  );

  function restart(next: Card[]) {
    setOrder(shuffle ? shuffled(next) : next);
    setIndex(0);
    setFlipped(false);
    setMissed([]);
    setRound((r) => r + 1);
  }

  function toggleShuffle(on: boolean) {
    setShuffle(on);
    // Re-deal what's left of this round.
    setOrder((current) => {
      const seen = current.slice(0, index);
      const rest = current.slice(index);
      const restIds = new Set(rest.map((c) => c.id));
      return [...seen, ...(on ? shuffled(rest) : cards.filter((c) => restIds.has(c.id)))];
    });
  }

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (done || event.metaKey || event.ctrlKey || event.altKey || ownsKey(event.target)) return;
      if (document.querySelector('[aria-modal="true"]')) return;
      // A focused button (the card itself, an option) does its own Space.
      if (event.key === " " && event.target instanceof HTMLButtonElement) return;
      if (event.key === " " || event.key === "ArrowUp" || event.key === "ArrowDown") {
        event.preventDefault();
        setFlipped((f) => !f);
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        answer(true);
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        answer(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [answer, done]);

  const options = (
    <>
      <OptionToggle on={shuffle} onChange={toggleShuffle}>
        Shuffle
      </OptionToggle>
      <OptionToggle on={backFirst} onChange={setBackFirst}>
        Definition first
      </OptionToggle>
    </>
  );

  if (done) {
    const knew = order.length - missed.length;
    return (
      <StudyShell title={title} mode="Flashcards" backHref={backHref} progress={1} progressLabel={`${order.length} / ${order.length}`} saveFailed={failed}>
        <div className="mx-auto flex max-w-[440px] flex-col items-center text-center">
          <p className="text-[13px] font-medium" style={{ color: "var(--app-text-muted)" }}>
            {round > 1 ? `Round ${round} done` : "Done"}
          </p>
          <h2 className="mt-2 text-[24px] font-semibold tracking-[-0.015em]" style={{ color: "var(--app-text)" }}>
            {missed.length === 0 ? (
              <>
                You knew <span className="accent-serif">all {order.length}</span>.
              </>
            ) : (
              `You knew ${knew} of ${order.length}.`
            )}
          </h2>
          <p className="mt-2 text-[14px]" style={{ color: "var(--app-text-soft)" }}>
            {missed.length === 0
              ? "They're scheduled. Each one comes back just before you'd forget it."
              : missed.length === 1
                ? "Go again with the one you didn't know while it's fresh."
                : `Go again with the ${missed.length} you didn't know while they're fresh.`}
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            {missed.length > 0 ? (
              <AppButton variant="primary" onClick={() => restart(missed)}>
                Go again with {missed.length}
              </AppButton>
            ) : null}
            <AppButton variant="secondary" onClick={() => restart(cards)}>
              Start over
            </AppButton>
            <Link href={backHref} className={appButtonClass("ghost")}>
              Done
            </Link>
          </div>
        </div>
      </StudyShell>
    );
  }

  const front = backFirst ? card!.back : card!.front;
  const back = backFirst ? card!.front : card!.back;
  const label = labelFor?.(card!);

  return (
    <StudyShell
      title={title}
      mode="Flashcards"
      backHref={backHref}
      progress={index / order.length}
      progressLabel={`${index + 1} / ${order.length}`}
      options={options}
      saveFailed={failed}
    >
      <div className="mx-auto w-full max-w-[640px]">
        <button
          type="button"
          onClick={() => setFlipped((f) => !f)}
          className="block w-full text-left [perspective:1400px]"
        >
          <span
            className="relative grid min-h-[300px] w-full transition-transform duration-300 ease-out [transform-style:preserve-3d] motion-reduce:transition-none sm:min-h-[340px]"
            style={{ transform: flipped ? "rotateY(180deg)" : "none" }}
          >
            <Face side={backFirst ? "Definition" : "Term"} label={label} text={front} hidden={flipped} />
            <Face side={backFirst ? "Term" : "Definition"} label={label} text={back} hidden={!flipped} back />
          </span>
        </button>
        <p className="mt-3 text-center text-[12px]" style={{ color: "var(--app-text-faint)" }}>
          <span className="sm:hidden">Tap the card to flip</span>
          <span className="hidden sm:inline">Click the card or press Space to flip</span>
        </p>

        <div className="mt-6 grid grid-cols-2 gap-3">
          <AnswerButton tone="miss" onClick={() => answer(false)} hint="←">
            Not yet
          </AnswerButton>
          <AnswerButton tone="hit" onClick={() => answer(true)} hint="→">
            Got it
          </AnswerButton>
        </div>
        <p className="mt-3 text-center text-[12.5px] tabular-nums" style={{ color: "var(--app-text-muted)" }}>
          {index - missed.length} got it · {missed.length} not yet
        </p>
      </div>
    </StudyShell>
  );
}

function Face({ side, label, text, hidden, back }: { side: string; label?: string; text: string; hidden: boolean; back?: boolean }) {
  return (
    <span
      aria-hidden={hidden}
      className="col-start-1 row-start-1 flex flex-col rounded-xl p-6 [backface-visibility:hidden] sm:p-8"
      style={{
        background: "var(--app-surface)",
        boxShadow: "var(--elev-2)",
        transform: back ? "rotateY(180deg)" : undefined,
      }}
    >
      <span className="flex items-center justify-between gap-3 text-[12px]" style={{ color: "var(--app-text-muted)" }}>
        <span>{side}</span>
        {label ? <span className="truncate">{label}</span> : null}
      </span>
      <span className="flex flex-1 items-center justify-center py-6">
        <CardText text={text} />
      </span>
    </span>
  );
}

function AnswerButton({
  tone,
  onClick,
  hint,
  children,
}: {
  tone: "hit" | "miss";
  onClick: () => void;
  hint: string;
  children: string;
}) {
  const colour = tone === "hit" ? "var(--app-success)" : "var(--app-danger)";
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-12 items-center justify-center gap-2 rounded-lg text-[14.5px] font-medium transition-[background-color,box-shadow] duration-100 hover:shadow-[0_0_0_1px_currentColor]"
      style={{ background: `color-mix(in oklab, ${colour} 10%, var(--app-surface))`, color: colour, boxShadow: "var(--elev-1)" }}
    >
      <span aria-hidden="true" className="hidden tabular-nums text-[12px] opacity-70 sm:inline">
        {hint}
      </span>
      {children}
    </button>
  );
}
