"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { cardCount, useDecks, type Deck } from "@/lib/api/cards";
import AppButton, { appButtonClass } from "../AppButton";
import EmptyState, { ExampleRow } from "../EmptyState";
import PageHeader from "../PageHeader";
import NewDeckSheet from "./NewDeckSheet";
import { CardsIcon, MasteryBar, PlusIcon, Spinner, SubjectTag, useSubjects, type SubjectInfo } from "./shared";

/**
 * Every deck, grouped by subject, with what's due today on top. Studying
 * happens on the deck pages; this is the shelf.
 */
export default function CardsView({ startCreating = false }: { startCreating?: boolean }) {
  const { state } = useDecks();
  const { subjects, find } = useSubjects();
  const [creating, setCreating] = useState(startCreating);

  const decks = useMemo(() => (state.status === "ready" ? state.data.decks : []), [state]);
  const groups = useMemo(() => groupBySubject(decks, subjects), [decks, subjects]);
  const due = decks.reduce((sum, deck) => sum + deck.dueCount, 0);
  const total = decks.reduce((sum, deck) => sum + deck.cardCount, 0);
  const fresh = decks.reduce((sum, deck) => sum + deck.newCount, 0);

  const newDeck = (
    <AppButton variant="primary" icon={<PlusIcon />} onClick={() => setCreating(true)}>
      New deck
    </AppButton>
  );

  return (
    <>
      <PageHeader width={820}
        eyebrow="Resources"
        title="Cards"
        meta={
          state.status !== "ready" || decks.length === 0
            ? undefined
            : `${decks.length} ${decks.length === 1 ? "deck" : "decks"} · ${cardCount(total)}${due ? ` · ${due} due` : ""}`
        }
        tour="cards"
        action={decks.length > 0 ? newDeck : undefined}
      />

      <div className="mx-auto flex w-full max-w-[820px] flex-col gap-8 px-6 py-8 sm:px-10">
        {state.status === "loading" ? (
          <Spinner />
        ) : state.status === "error" ? (
          <p role="alert" className="text-[14px]" style={{ color: "var(--app-danger)" }}>
            {state.error}
          </p>
        ) : decks.length === 0 ? (
          <EmptyState
            icon={<CardsIcon size={20} />}
            title={
              <>
                Your <span className="accent-serif">first</span> deck.
              </>
            }
            body="Cue cards for anything you have to remember. Type them in or paste a Quizlet set, and each card comes back just before you'd forget it."
            example={
              <>
                <ExampleRow title="Stoichiometry" meta="Chemistry · 42 cards · 12 due" />
                <ExampleRow title="Cell organelles" meta="Biology · 28 cards · all mastered" bar="var(--app-success)" />
                <ExampleRow title="Hamlet quotes" meta="English · 18 cards · 6 new" bar="var(--app-cat-extra)" />
              </>
            }
            action={newDeck}
            hint="Studying is free on every plan."
          />
        ) : (
          <>
            <DueStrip due={due} fresh={fresh} decks={decks} find={find} />
            {groups.map((group) => (
              <section key={group.subject?.id ?? "none"} aria-labelledby={`deck-group-${group.subject?.id ?? "none"}`}>
                <h2 id={`deck-group-${group.subject?.id ?? "none"}`} className="flex">
                  <SubjectTag subject={group.subject} />
                </h2>
                <ul className="mt-3 grid gap-2 sm:grid-cols-2">
                  {group.decks.map((deck) => (
                    <li key={deck.id}>
                      <DeckTile deck={deck} colour={group.subject?.colour} />
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </>
        )}
      </div>

      <NewDeckSheet open={creating} onClose={() => setCreating(false)} />
    </>
  );
}

function DueStrip({
  due,
  fresh,
  decks,
  find,
}: {
  due: number;
  fresh: number;
  decks: Deck[];
  find: (id: string | null) => SubjectInfo | null;
}) {
  // Due cards per subject, biggest first.
  const bySubject = new Map<string, { key: string; subject: SubjectInfo | null; count: number }>();
  for (const deck of decks) {
    if (!deck.dueCount) continue;
    const subject = find(deck.subjectId);
    const key = subject?.id ?? "none";
    const entry = bySubject.get(key) ?? { key, subject, count: 0 };
    entry.count += deck.dueCount;
    bySubject.set(key, entry);
  }
  const parts = [...bySubject.values()].sort((a, b) => b.count - a.count);

  return (
    <div
      className="flex flex-wrap items-center justify-between gap-4 rounded-lg px-5 py-4"
      style={{ background: "var(--app-surface)", boxShadow: "var(--elev-1)" }}
    >
      <div className="min-w-0">
        <p className="text-[15px] font-semibold" style={{ color: "var(--app-text)" }}>
          {due > 0 ? `${cardCount(due)} due today` : "Nothing due right now"}
        </p>
        <p className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[12.5px]" style={{ color: "var(--app-text-muted)" }}>
          {due > 0
            ? parts.map((part) => <SubjectTag key={part.key} subject={part.subject} count={part.count} size="sm" />)
            : fresh > 0
              ? `${cardCount(fresh)} you haven't studied yet. Open a deck and hit Learn.`
              : "Every card is scheduled. They'll come back when they're due."}
        </p>
      </div>
      {due > 0 ? (
        <Link href="/app/cards/review" className={appButtonClass("primary")}>
          Review all
        </Link>
      ) : null}
    </div>
  );
}

function DeckTile({ deck, colour }: { deck: Deck; colour?: string }) {
  const parts = [cardCount(deck.cardCount)];
  if (deck.cardCount > 0 && deck.masteredCount === deck.cardCount) parts.push("all mastered");
  else {
    if (deck.dueCount) parts.push(`${deck.dueCount} due`);
    if (deck.newCount && deck.newCount < deck.cardCount) parts.push(`${deck.newCount} new`);
  }
  return (
    <Link
      href={`/app/cards/${encodeURIComponent(deck.id)}`}
      className="flex h-full flex-col gap-3 rounded-lg px-4 py-3.5 transition-shadow hover:shadow-[0_0_0_1px_var(--app-border-strong)]"
      style={{ background: "var(--app-surface)", boxShadow: "var(--elev-1)", borderLeft: `3px solid ${colour ?? "var(--app-border-strong)"}` }}
    >
      <div className="min-w-0">
        <p className="truncate text-[14.5px] font-medium" style={{ color: "var(--app-text)" }}>
          {deck.title}
        </p>
        <p className="mt-0.5 truncate text-[12.5px] tabular-nums" style={{ color: "var(--app-text-muted)" }}>
          {parts.join(" · ")}
          {deck.topic?.title ? ` · ${deck.topic.title}` : ""}
        </p>
      </div>
      {deck.cardCount > 0 ? <MasteryBar deck={deck} height={4} /> : null}
    </Link>
  );
}

function groupBySubject(decks: Deck[], subjects: SubjectInfo[]) {
  const groups: Array<{ subject: SubjectInfo | null; decks: Deck[] }> = [];
  // Subjects in profile order, then anything without one.
  for (const subject of subjects) {
    const own = decks.filter((deck) => deck.subjectId === subject.id);
    if (own.length) groups.push({ subject, decks: own });
  }
  const known = new Set(subjects.map((subject) => subject.id));
  const rest = decks.filter((deck) => !deck.subjectId || !known.has(deck.subjectId));
  if (rest.length) groups.push({ subject: null, decks: rest });
  return groups;
}
