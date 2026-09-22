"use client";

import Link from "next/link";
import { useState } from "react";
import { cardCount, useDeck, type Card, type DeckWithCards } from "@/lib/api/cards";
import AppButton, { appButtonClass } from "../AppButton";
import DeckEditor from "./DeckEditor";
import DeckSettingsSheet from "./DeckSettingsSheet";
import { BackLink, LoadError, MasteryBar, Spinner, SubjectTag, useSubjects } from "./shared";

/** One deck: how well it's known, the ways to study it, and its cards. */
export default function DeckView({ deckId, startEditing }: { deckId: string; startEditing: boolean }) {
  const { state, replace } = useDeck(deckId);

  if (state.status === "loading") return <Spinner />;
  if (state.status === "error") {
    return <LoadError message={state.error || "Couldn't load this deck."} backHref="/app/cards" backLabel="Back to cards" />;
  }
  return <Deck data={state.data} replace={replace} startEditing={startEditing || state.data.cards.length === 0} />;
}

function Deck({
  data,
  replace,
  startEditing,
}: {
  data: DeckWithCards;
  replace: (data: DeckWithCards) => void;
  startEditing: boolean;
}) {
  const { deck, cards } = data;
  const { find } = useSubjects();
  const subject = find(deck.subjectId);
  const [editing, setEditing] = useState(startEditing);
  const [settings, setSettings] = useState(false);
  const learning = deck.cardCount - deck.newCount - deck.masteredCount;
  const base = `/app/cards/${encodeURIComponent(deck.id)}`;

  const meta = [cardCount(deck.cardCount)];
  if (deck.topic?.title) meta.push(deck.topic.title);

  return (
    <div className="mx-auto flex w-full max-w-[820px] flex-col gap-6 px-4 py-6 pb-28 sm:px-8 sm:py-8">
      <div>
        <BackLink href="/app/cards">Cards</BackLink>
        <div className="mt-2 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="min-w-0 truncate text-[26px] font-semibold tracking-[-0.02em]" style={{ color: "var(--app-text)" }}>
              {deck.title}
            </h1>
            <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13.5px]" style={{ color: "var(--app-text-muted)" }}>
              <SubjectTag subject={subject} />
              <span>{meta.join(" · ")}</span>
            </p>
          </div>
          <AppButton variant="ghost" size="sm" onClick={() => setSettings(true)} aria-label="Deck settings">
            <svg viewBox="0 0 20 20" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
              <circle cx="10" cy="10" r="2.5" />
              <path d="M10 3v2M10 15v2M3 10h2M15 10h2M4.9 4.9l1.4 1.4M13.7 13.7l1.4 1.4M4.9 15.1l1.4-1.4M13.7 6.3l1.4-1.4" strokeLinecap="round" />
            </svg>
            Settings
          </AppButton>
        </div>
      </div>

      {editing ? (
        <DeckEditor
          deck={deck}
          cards={cards}
          onSaved={(next) => {
            replace(next);
            setEditing(false);
          }}
          onCancel={cards.length > 0 ? () => setEditing(false) : undefined}
        />
      ) : (
        <>
          <section
            aria-label="Study"
            className="flex flex-col gap-4 rounded-lg p-5"
            style={{ background: "var(--app-surface)", boxShadow: "var(--elev-1)" }}
          >
            <div className="flex flex-wrap gap-2">
              {deck.dueCount > 0 ? (
                <Link href={`${base}/flashcards?due=1`} className={appButtonClass("primary")}>
                  Review {deck.dueCount} due
                </Link>
              ) : null}
              <Link href={`${base}/learn`} className={appButtonClass(deck.dueCount > 0 ? "secondary" : "primary")}>
                Learn
              </Link>
              <Link href={`${base}/flashcards`} className={appButtonClass("secondary")}>
                Flashcards
              </Link>
            </div>
            <div>
              <MasteryBar deck={deck} />
              <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[12.5px] tabular-nums" style={{ color: "var(--app-text-muted)" }}>
                <Legend colour="var(--app-success)" count={deck.masteredCount} label="mastered" />
                <Legend colour="var(--app-accent)" count={learning} label="still learning" />
                <Legend count={deck.newCount} label="not studied" />
              </ul>
            </div>
          </section>

          <section aria-labelledby="deck-cards-title">
            <div className="flex items-center justify-between gap-3">
              <h2 id="deck-cards-title" className="text-[15px] font-semibold" style={{ color: "var(--app-text)" }}>
                {cardCount(cards.length)}
              </h2>
              <AppButton size="sm" variant="secondary" onClick={() => setEditing(true)}>
                Edit cards
              </AppButton>
            </div>
            <ul className="mt-3 overflow-hidden rounded-lg" style={{ background: "var(--app-surface)", boxShadow: "var(--elev-1)" }}>
              {cards.map((card) => (
                <CardRow key={card.id} card={card} />
              ))}
            </ul>
          </section>
        </>
      )}

      <DeckSettingsSheet
        open={settings}
        deck={deck}
        onClose={() => setSettings(false)}
        onSaved={(next) => {
          replace({ deck: next, cards });
          setSettings(false);
        }}
      />
    </div>
  );
}

/** The count in the colour it has in the bar above, so the words are the key. */
function Legend({ colour, count, label }: { colour?: string; count: number; label: string }) {
  return (
    <li>
      <span className="font-semibold" style={{ color: colour ?? "var(--app-text-soft)" }}>
        {count}
      </span>{" "}
      {label}
    </li>
  );
}

const STATUS: Record<Card["status"], { label: string; colour: string | null }> = {
  new: { label: "New", colour: null },
  learning: { label: "Learning", colour: "var(--app-accent)" },
  mastered: { label: "Mastered", colour: "var(--app-success)" },
};

/** Where a card stands, as an outlined word rather than a coloured dot. */
function StatusTag({ card }: { card: Card }) {
  const status = card.due ? { label: "Due", colour: "var(--app-cat-extra)" } : STATUS[card.status];
  return (
    <span
      className="inline-flex shrink-0 items-center rounded-md px-1.5 py-px text-[11.5px] font-medium"
      style={
        status.colour
          ? {
              color: `color-mix(in oklab, ${status.colour} 80%, var(--app-text))`,
              boxShadow: `inset 0 0 0 1px color-mix(in oklab, ${status.colour} 50%, transparent)`,
            }
          : { color: "var(--app-text-muted)", boxShadow: "inset 0 0 0 1px var(--app-border-strong)" }
      }
    >
      {status.label}
    </span>
  );
}

function CardRow({ card }: { card: Card }) {
  return (
    <li
      className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-1 border-b px-4 py-3 last:border-b-0 sm:grid-cols-[minmax(0,2fr)_minmax(0,3fr)_auto] sm:gap-x-6"
      style={{ borderColor: "var(--app-border)" }}
    >
      <span className="min-w-0 whitespace-pre-wrap break-words text-[14px] font-medium" style={{ color: "var(--app-text)" }}>
        {card.front}
      </span>
      <span
        className="col-start-1 row-start-2 min-w-0 whitespace-pre-wrap break-words text-[14px] sm:col-start-2 sm:row-start-1"
        style={{ color: "var(--app-text-soft)" }}
      >
        {card.back}
      </span>
      <span className="col-start-2 row-start-1 sm:col-start-3">
        <StatusTag card={card} />
      </span>
    </li>
  );
}
