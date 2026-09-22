"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { cardCount, type Card } from "@/lib/api/cards";
import { TYPEABLE_MAX, isCloseEnough, normaliseAnswer } from "@/lib/app/cardAnswer";
import { useReviewQueue } from "@/lib/app/useReviewQueue";
import AppButton, { appButtonClass } from "../AppButton";
import { shuffled } from "./shared";
import StudyShell, { CardText, OptionToggle, ownsKey } from "./StudyShell";

/** Cards per round, and per sitting. */
const ROUND = 7;
const POOL = 20;

type Direction = "term" | "definition";

/** 0 = needs multiple choice, 1 = needs typing, 2 = learned this sitting. */
interface Progress {
  stage: 0 | 1 | 2;
  missed: boolean;
}

type Question =
  | { kind: "choice"; options: string[]; correct: number }
  | { kind: "written" }
  // Too long to type: show the answer and let the student mark it.
  | { kind: "reveal" };

interface Feedback {
  correct: boolean;
  given: string;
  picked?: number;
  /** Marked right, but not word for word. */
  close?: boolean;
}

interface Session {
  pool: Card[];
  progress: Record<string, Progress>;
  round: string[];
  roundNumber: number;
  pos: number;
  phase: "question" | "feedback" | "summary" | "done";
  question: Question | null;
  feedback: Feedback | null;
  revealed: boolean;
}

/**
 * Quizlet-style Learn: a sitting of up to 20 cards (due first, then new),
 * taken 7 at a time. Each card is multiple choice until you get it, then
 * you type it. Getting a card right first time moves it up the schedule;
 * missing it starts it again.
 */
export default function LearnView({ title, backHref, cards }: { title: string; backHref: string; cards: Card[] }) {
  const { record, failed } = useReviewQueue();
  const [direction, setDirection] = useState<Direction>(() => defaultDirection(cards));
  const [session, setSessionState] = useState<Session>(() => newSession(pickPool(cards, new Set()), cards, direction));
  // Every card put in front of the student this visit, so "Learn the next" moves on.
  const [studied, setStudied] = useState<Set<string>>(() => new Set(session.pool.map((card) => card.id)));
  const ref = useRef(session);
  const directionRef = useRef(direction);
  const timer = useRef<number | null>(null);
  const [typed, setTyped] = useState("");

  // Handlers read the latest session through the ref: the auto-advance
  // timer would otherwise act on the one it was created with.
  const setSession = (next: Session) => {
    ref.current = next;
    setSessionState(next);
  };

  useEffect(() => () => clearTimer(), []);

  function clearTimer() {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
  }

  const byId = (id: string) => session.pool.find((card) => card.id === id)!;
  const current = session.phase === "question" || session.phase === "feedback" ? byId(session.round[session.pos]) : null;

  function ask(s: Session, dir = directionRef.current): Session {
    setTyped("");
    const card = s.pool.find((c) => c.id === s.round[s.pos])!;
    return { ...s, phase: "question", feedback: null, revealed: false, question: buildQuestion(card, s.progress[card.id].stage, cards, dir) };
  }

  function answerFor(card: Card, dir = direction) {
    return dir === "term" ? card.front : card.back;
  }

  function submit(correct: boolean, feedback: Omit<Feedback, "correct">) {
    const s = ref.current;
    if (s.phase !== "question" || !s.question) return;
    const id = s.round[s.pos];
    let progress = s.progress;
    if (correct) progress = advance(progress, id, s.question.kind === "choice" ? 1 : 2, record);
    setSession({ ...s, progress, phase: "feedback", feedback: { correct, ...feedback } });
    if (correct) {
      clearTimer();
      timer.current = window.setTimeout(next, feedback.close ? 1600 : 700);
    }
  }

  /** "I was right": count a marked-wrong typed answer as right. */
  function overrule() {
    const s = ref.current;
    if (s.phase !== "feedback" || !s.feedback || s.feedback.correct) return;
    const id = s.round[s.pos];
    setSession({ ...s, progress: advance(s.progress, id, 2, record), feedback: { ...s.feedback, correct: true } });
    timer.current = window.setTimeout(next, 500);
  }

  function next() {
    clearTimer();
    const s = ref.current;
    if (s.phase !== "feedback") return;
    let progress = s.progress;
    const id = s.round[s.pos];
    // A miss is saved once per sitting, when the student moves on, so "I was
    // right" can still take it back.
    if (s.feedback && !s.feedback.correct && !progress[id].missed) {
      record(id, false);
      progress = { ...progress, [id]: { ...progress[id], missed: true } };
    }
    const pos = s.pos + 1;
    if (pos < s.round.length) {
      setSession(ask({ ...s, progress, pos }));
      return;
    }
    const allLearned = s.pool.every((card) => progress[card.id].stage === 2);
    setSession({ ...s, progress, phase: allLearned ? "done" : "summary", question: null, feedback: null });
  }

  function nextRound() {
    const s = ref.current;
    const unfinished = s.pool.filter((card) => s.progress[card.id].stage < 2).map((card) => card.id);
    if (unfinished.length === 0) {
      setSession({ ...s, phase: "done" });
      return;
    }
    setSession(ask({ ...s, round: unfinished.slice(0, ROUND), roundNumber: s.roundNumber + 1, pos: 0 }));
  }

  function restart(pool: Card[]) {
    clearTimer();
    setSession(newSession(pool, cards, directionRef.current));
    setStudied((prev) => new Set([...prev, ...pool.map((card) => card.id)]));
    setTyped("");
  }

  function changeDirection(dir: Direction) {
    directionRef.current = dir;
    setDirection(dir);
    const s = ref.current;
    if (s.phase === "question") setSession(ask(s, dir));
  }

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey || ownsKey(event.target)) return;
      if (document.querySelector('[aria-modal="true"]')) return;
      const s = ref.current;
      if (s.phase === "question" && s.question?.kind === "choice") {
        const n = Number(event.key);
        if (n >= 1 && n <= s.question.options.length) {
          event.preventDefault();
          pick(n - 1);
        }
      } else if (s.phase === "question" && s.question?.kind === "reveal") {
        if (!s.revealed && (event.key === " " || event.key === "Enter")) {
          event.preventDefault();
          setSession({ ...s, revealed: true });
        } else if (s.revealed && (event.key === "ArrowRight" || event.key === "ArrowLeft")) {
          event.preventDefault();
          submit(event.key === "ArrowRight", { given: "" });
        }
      } else if ((s.phase === "feedback" || s.phase === "summary") && (event.key === "Enter" || event.key === " ")) {
        if (event.target instanceof HTMLButtonElement) return;
        event.preventDefault();
        if (s.phase === "feedback") next();
        else nextRound();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  function pick(index: number) {
    const s = ref.current;
    if (s.question?.kind !== "choice") return;
    submit(index === s.question.correct, { given: s.question.options[index], picked: index });
  }

  function onWritten(event: FormEvent) {
    event.preventDefault();
    if (!current || !typed.trim()) return;
    const answer = answerFor(current);
    const correct = isCloseEnough(typed, answer);
    submit(correct, { given: typed, close: correct && normaliseAnswer(typed) !== normaliseAnswer(answer) });
  }

  const learned = session.pool.filter((card) => session.progress[card.id].stage === 2).length;
  const steps = session.pool.reduce((sum, card) => sum + session.progress[card.id].stage, 0);
  const shell = {
    title,
    mode: "Learn",
    backHref,
    progress: steps / (session.pool.length * 2 || 1),
    progressLabel: `${learned} / ${session.pool.length} learned`,
    saveFailed: failed,
    options: (
      <OptionToggle on={direction === "definition"} onChange={(on) => changeDirection(on ? "definition" : "term")}>
        Answer with definition
      </OptionToggle>
    ),
  };

  if (session.phase === "done") {
    const firstTime = session.pool.filter((card) => !session.progress[card.id].missed).length;
    const remaining = cards.filter((card) => !studied.has(card.id));
    const nextPool = pickPool(remaining, new Set());
    return (
      <StudyShell {...shell} options={undefined}>
        <div className="mx-auto flex max-w-[460px] flex-col items-center text-center">
          <p className="text-[13px] font-medium" style={{ color: "var(--app-text-muted)" }}>
            Sitting done
          </p>
          <h2 className="mt-2 text-[24px] font-semibold tracking-[-0.015em]" style={{ color: "var(--app-text)" }}>
            You learned <span className="accent-serif">{cardCount(session.pool.length)}</span>.
          </h2>
          <p className="mt-2 text-[14px]" style={{ color: "var(--app-text-soft)" }}>
            {firstTime === session.pool.length
              ? "Every one right first time. They'll come back in a few days to make sure."
              : session.pool.length - firstTime === 1
                ? `${firstTime} right first time. The one you missed comes back tomorrow.`
                : `${firstTime} right first time. The ${session.pool.length - firstTime} you missed come back tomorrow.`}
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            {nextPool.length > 0 ? (
              <AppButton variant="primary" onClick={() => restart(nextPool)}>
                Learn the next {nextPool.length}
              </AppButton>
            ) : null}
            <AppButton variant={nextPool.length ? "secondary" : "primary"} onClick={() => restart(session.pool)}>
              Go again
            </AppButton>
            <Link href={backHref} className={appButtonClass("ghost")}>
              Done
            </Link>
          </div>
        </div>
      </StudyShell>
    );
  }

  if (session.phase === "summary") {
    const roundCards = session.round.map(byId);
    return (
      <StudyShell {...shell}>
        <div className="mx-auto w-full max-w-[520px]">
          <p className="text-center text-[13px] font-medium" style={{ color: "var(--app-text-muted)" }}>
            Round {session.roundNumber} done
          </p>
          <h2 className="mt-2 text-center text-[22px] font-semibold tracking-[-0.015em]" style={{ color: "var(--app-text)" }}>
            {learned} of {session.pool.length} learned
          </h2>
          <ul className="mt-6 overflow-hidden rounded-lg" style={{ background: "var(--app-surface)", boxShadow: "var(--elev-1)" }}>
            {roundCards.map((card) => {
              const done = session.progress[card.id].stage === 2;
              return (
                <li key={card.id} className="flex items-center gap-3 border-b px-4 py-2.5 last:border-b-0" style={{ borderColor: "var(--app-border)" }}>
                  <span className="min-w-0 flex-1 truncate text-[14px]" style={{ color: "var(--app-text)" }}>
                    {card.front}
                  </span>
                  <span className="shrink-0 text-[12.5px] font-medium" style={{ color: done ? "var(--app-success)" : "var(--app-text-muted)" }}>
                    {done ? "Learned" : "Still learning"}
                  </span>
                </li>
              );
            })}
          </ul>
          <div className="mt-6 flex justify-center">
            <AppButton variant="primary" onClick={nextRound} autoFocus>
              Keep going
            </AppButton>
          </div>
        </div>
      </StudyShell>
    );
  }

  const card = current!;
  const question = session.question!;
  const feedback = session.feedback;
  const answer = answerFor(card);
  const prompt = direction === "term" ? card.back : card.front;

  return (
    <StudyShell {...shell}>
      <div className="mx-auto w-full max-w-[640px]">
        <div className="flex min-h-[180px] flex-col rounded-xl p-6 sm:p-8" style={{ background: "var(--app-surface)", boxShadow: "var(--elev-2)" }}>
          <p className="text-[12px]" style={{ color: "var(--app-text-muted)" }}>
            {direction === "term" ? "Definition" : "Term"}
          </p>
          <div className="flex flex-1 items-center justify-center py-4">
            <CardText text={prompt} />
          </div>
        </div>

        <div className="mt-5">
          {question.kind === "choice" ? (
            <>
              <p className="mb-2 text-[12.5px] font-medium" style={{ color: "var(--app-text-muted)" }}>
                {feedback ? (feedback.correct ? "Nice." : "Not this time. Here's the right one.") : `Pick the ${direction}`}
              </p>
              <div className="grid gap-2 sm:grid-cols-2">
                {question.options.map((option, index) => (
                  <ChoiceButton
                    key={index}
                    number={index + 1}
                    text={option}
                    state={
                      !feedback
                        ? "idle"
                        : index === question.correct
                          ? "right"
                          : index === feedback.picked
                            ? "wrong"
                            : "faded"
                    }
                    onClick={() => pick(index)}
                  />
                ))}
              </div>
            </>
          ) : question.kind === "written" ? (
            feedback ? (
              <WrittenFeedback feedback={feedback} answer={answer} />
            ) : (
              <form onSubmit={onWritten} className="flex flex-col gap-2">
                <label className="text-[12.5px] font-medium" style={{ color: "var(--app-text-muted)" }} htmlFor="learn-answer">
                  Type the {direction}
                </label>
                <div className="flex gap-2">
                  <input
                    id="learn-answer"
                    key={`${session.roundNumber}-${session.pos}`}
                    autoFocus
                    autoComplete="off"
                    autoCapitalize="off"
                    spellCheck={false}
                    value={typed}
                    onChange={(event) => setTyped(event.target.value)}
                    className="min-w-0 flex-1 rounded-md px-3 py-2.5 text-[15px] outline-none"
                    style={{ background: "var(--app-surface)", boxShadow: "var(--elev-inset-strong)", color: "var(--app-text)" }}
                  />
                  <AppButton type="submit" variant="primary" className="h-auto" disabled={!typed.trim()}>
                    Answer
                  </AppButton>
                </div>
                <button
                  type="button"
                  onClick={() => submit(false, { given: "" })}
                  className="self-start rounded-md px-1.5 py-1 text-[12.5px] ui-hover"
                  style={{ color: "var(--app-text-muted)" }}
                >
                  Don&apos;t know
                </button>
              </form>
            )
          ) : feedback ? (
            <WrittenFeedback feedback={feedback} answer={answer} selfMarked />
          ) : session.revealed ? (
            <div className="flex flex-col gap-3">
              <div className="rounded-lg px-5 py-4" style={{ background: "var(--app-surface-soft)", boxShadow: "var(--elev-inset)" }}>
                <CardText text={answer} />
              </div>
              <p className="text-center text-[12.5px]" style={{ color: "var(--app-text-muted)" }}>
                Did you have it?
              </p>
              <div className="grid grid-cols-2 gap-3">
                <AppButton variant="secondary" className="h-11" onClick={() => submit(false, { given: "" })}>
                  Not yet
                </AppButton>
                <AppButton variant="primary" className="h-11" onClick={() => submit(true, { given: "" })}>
                  Got it
                </AppButton>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2">
              <p className="text-[12.5px]" style={{ color: "var(--app-text-muted)" }}>
                Say the {direction} to yourself, then check.
              </p>
              <AppButton variant="primary" autoFocus onClick={() => setSession({ ...ref.current, revealed: true })}>
                Show answer
              </AppButton>
            </div>
          )}
        </div>

        {feedback && !feedback.correct ? (
          <div className="mt-5 flex flex-wrap items-center justify-end gap-2">
            {question.kind === "written" && feedback.given ? (
              <AppButton variant="ghost" onClick={overrule}>
                I was right
              </AppButton>
            ) : null}
            <AppButton variant="primary" onClick={next} autoFocus>
              Continue
            </AppButton>
          </div>
        ) : null}
      </div>
    </StudyShell>
  );
}

function ChoiceButton({
  number,
  text,
  state,
  onClick,
}: {
  number: number;
  text: string;
  state: "idle" | "right" | "wrong" | "faded";
  onClick: () => void;
}) {
  const colour = state === "right" ? "var(--app-success)" : state === "wrong" ? "var(--app-danger)" : null;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={state !== "idle"}
      className="flex min-h-12 items-start gap-3 rounded-lg px-4 py-3 text-left text-[14px] transition-shadow enabled:hover:shadow-[0_0_0_1px_var(--app-border-strong)] disabled:cursor-default"
      style={{
        background: colour ? `color-mix(in oklab, ${colour} 10%, var(--app-surface))` : "var(--app-surface)",
        boxShadow: colour ? `inset 0 0 0 1.5px ${colour}` : "var(--elev-1)",
        color: "var(--app-text)",
        opacity: state === "faded" ? 0.5 : 1,
      }}
    >
      <span
        aria-hidden="true"
        className="mt-px grid h-5 w-5 shrink-0 place-items-center rounded font-mono text-[11px]"
        style={{ background: "var(--app-surface-soft)", color: "var(--app-text-muted)" }}
      >
        {number}
      </span>
      <span className="min-w-0 whitespace-pre-wrap break-words">{text}</span>
    </button>
  );
}

function WrittenFeedback({ feedback, answer, selfMarked }: { feedback: Feedback; answer: string; selfMarked?: boolean }) {
  if (feedback.correct) {
    return (
      <div role="status" className="rounded-lg px-5 py-4" style={{ background: "color-mix(in oklab, var(--app-success) 10%, var(--app-surface))" }}>
        <p className="text-[14px] font-medium" style={{ color: "var(--app-success)" }}>
          {feedback.close ? "Close enough." : "Correct."}
        </p>
        {feedback.close ? (
          <p className="mt-1 text-[13.5px]" style={{ color: "var(--app-text-soft)" }}>
            It&apos;s <span style={{ color: "var(--app-text)" }}>{answer}</span>
          </p>
        ) : null}
      </div>
    );
  }
  return (
    <div role="status" className="flex flex-col gap-3 rounded-lg px-5 py-4" style={{ background: "var(--app-surface)", boxShadow: "var(--elev-1)" }}>
      <p className="text-[14px] font-medium" style={{ color: "var(--app-danger)" }}>
        {selfMarked ? "Not yet. It's this:" : feedback.given ? "Not quite." : "Here's the answer."}
      </p>
      {!selfMarked && feedback.given ? (
        <div>
          <p className="text-[12px]" style={{ color: "var(--app-text-muted)" }}>
            You wrote
          </p>
          <p className="mt-0.5 whitespace-pre-wrap break-words text-[14.5px] line-through decoration-1" style={{ color: "var(--app-text-soft)" }}>
            {feedback.given}
          </p>
        </div>
      ) : null}
      <div>
        <p className="text-[12px]" style={{ color: "var(--app-text-muted)" }}>
          Answer
        </p>
        <p className="mt-0.5 whitespace-pre-wrap break-words text-[15px] font-medium" style={{ color: "var(--app-text)" }}>
          {answer}
        </p>
      </div>
    </div>
  );
}

/** Answer with whichever side is shorter on average: easier to type. */
function defaultDirection(cards: Card[]): Direction {
  const average = (pick: (card: Card) => string) => cards.reduce((sum, card) => sum + pick(card).length, 0) / (cards.length || 1);
  return average((card) => card.front) <= average((card) => card.back) ? "term" : "definition";
}

/** Due cards first, then new, then the least known. */
function pickPool(cards: Card[], exclude: Set<string>): Card[] {
  const rank = (card: Card) => (card.due ? 0 : card.status === "new" ? 1 : card.status === "learning" ? 2 : 3);
  return cards
    .map((card, index) => ({ card, index }))
    .filter(({ card }) => !exclude.has(card.id))
    .sort((a, b) => rank(a.card) - rank(b.card) || a.card.box - b.card.box || a.index - b.index)
    .slice(0, POOL)
    .map(({ card }) => card);
}

function newSession(pool: Card[], cards: Card[], direction: Direction): Session {
  const progress: Record<string, Progress> = {};
  // Cards already known a few days skip straight to typing.
  for (const card of pool) progress[card.id] = { stage: card.box >= 2 ? 1 : 0, missed: false };
  const round = pool.slice(0, ROUND).map((card) => card.id);
  const first = pool[0];
  return {
    pool,
    progress,
    round,
    roundNumber: 1,
    pos: 0,
    phase: first ? "question" : "done",
    question: first ? buildQuestion(first, progress[first.id].stage, cards, direction) : null,
    feedback: null,
    revealed: false,
  };
}

function buildQuestion(card: Card, stage: number, cards: Card[], direction: Direction): Question {
  const answerOf = (c: Card) => (direction === "term" ? c.front : c.back);
  const answer = answerOf(card);
  if (stage === 0) {
    const seen = new Set([normaliseAnswer(answer)]);
    const others: string[] = [];
    for (const other of shuffled(cards)) {
      const text = answerOf(other);
      const key = normaliseAnswer(text);
      if (seen.has(key)) continue;
      seen.add(key);
      others.push(text);
      if (others.length === 3) break;
    }
    if (others.length > 0) {
      const options = shuffled([answer, ...others]);
      return { kind: "choice", options, correct: options.indexOf(answer) };
    }
  }
  return answer.length > TYPEABLE_MAX || answer.includes("\n") ? { kind: "reveal" } : { kind: "written" };
}

/**
 * Moves a card on: multiple choice right takes it to typing, typing (or
 * self-marking) right means learned, which is saved as a right answer.
 */
function advance(
  progress: Record<string, Progress>,
  id: string,
  to: 1 | 2,
  record: (id: string, correct: boolean) => void,
): Record<string, Progress> {
  const current = progress[id];
  const stage = Math.max(current.stage, to) as 1 | 2;
  if (stage === 2 && current.stage < 2) record(id, true);
  return { ...progress, [id]: { ...current, stage } };
}
