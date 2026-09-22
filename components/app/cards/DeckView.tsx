"use client";

import Link from "next/link";
import { useState } from "react";
import { cardCount, useDeck, type Card, type DeckWithCards } from "@/lib/api/cards";
import AppButton, { appButtonClass } from "../AppButton";
import DeckEditor from "./DeckEditor";
import DeckSettingsSheet from "./DeckSettingsSheet";
import { BackLink, LoadError, MasteryBar, Spinner, useSubjects } from "./shared";

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

  const meta = [subject?.name ?? "No subject", cardCount(deck.cardCount)];
  if (deck.topic?.title) meta.push(deck.topic.title);

  return (
    <div className="mx-auto flex w-full max-w-[820px] flex-col gap-6 px-4 py-6 pb-28 sm:px-8 sm:py-8">
      <div>
        <BackLink href="/app/cards">Cards</BackLink>
        <div className="mt-2 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-3">
              <span
                aria-hidden="true"
                className="h-3.5 w-3.5 shrink-0 rounded-full"
                style={{ background: subject?.colour ?? "var(--app-border-strong)" }}
              />
              <h1 className="min-w-0 truncate text-[26px] font-semibold tracking-[-0.02em]" style={{ color: "var(--app-text)" }}>
                {deck.title}
              </h1>
            </div>
            <p className="mt-1 text-[13.5px]" style={{ color: "var(--app-text-muted)" }}>
              {meta.join(" · ")}
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
                <Legend colour="var(--app-success)" label={`${deck.masteredCount} mastered`} />
                <Legend colour="var(--app-accent)" label={`${learning} still learning`} />
                <Legend colour="var(--app-border-strong)" label={`${deck.newCount} not studied`} />
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

function Legend({ colour, label }: { colour: string; label: string }) {
  return (
    <li className="inline-flex items-center gap-1.5">
      <span aria-hidden="true" className="h-2 w-2 rounded-full" style={{ background: colour }} />
      {label}
    </li>
  );
}

const STATUS: Record<Card["status"], { label: string; colour: string }> = {
  new: { label: "Not studied", colour: "var(--app-border-strong)" },
  learning: { label: "Still learning", colour: "var(--app-accent)" },
  mastered: { label: "Mastered", colour: "var(--app-success)" },
};

function CardRow({ card }: { card: Card }) {
  const status = STATUS[card.status];
  return (
    <li
      className="grid gap-1 border-b px-4 py-3 last:border-b-0 sm:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] sm:gap-6"
      style={{ borderColor: "var(--app-border)" }}
    >
      <span className="flex min-w-0 items-start gap-2.5">
        <span
          className="mt-[7px] h-2 w-2 shrink-0 rounded-full"
          style={{ background: status.colour }}
          title={card.due ? `${status.label} · due` : status.label}
          aria-label={card.due ? `${status.label}, due` : status.label}
          role="img"
        />
        <span className="min-w-0 whitespace-pre-wrap break-words text-[14px] font-medium" style={{ color: "var(--app-text)" }}>
          {card.front}
        </span>
      </span>
      <span className="min-w-0 whitespace-pre-wrap break-words pl-[18px] text-[14px] sm:pl-0" style={{ color: "var(--app-text-soft)" }}>
        {card.back}
      </span>
    </li>
  );
}
