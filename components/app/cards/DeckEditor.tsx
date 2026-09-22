"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ClipboardEvent, type KeyboardEvent } from "react";
import { cardCount, saveCards, type Card, type Deck, type DeckWithCards } from "@/lib/api/cards";
import { guessSeparator, parseCards } from "@/lib/app/cardImport";
import AppButton from "../AppButton";

interface Row {
  key: string;
  id?: string;
  front: string;
  back: string;
}

let nextKey = 0;
const blank = (): Row => ({ key: `row-${nextKey++}`, front: "", back: "" });
const isBlank = (row: Row) => !row.front.trim() && !row.back.trim();

/** There's always one empty row at the bottom to type the next card into. */
function withTrailingBlank(rows: Row[]): Row[] {
  const trimmed = [...rows];
  while (trimmed.length > 1 && isBlank(trimmed[trimmed.length - 1]) && isBlank(trimmed[trimmed.length - 2])) trimmed.pop();
  return trimmed.length && isBlank(trimmed[trimmed.length - 1]) ? trimmed : [...trimmed, blank()];
}

/**
 * Term and definition, one card per row. Tab moves across and down; the row
 * at the bottom is always blank so the next card is one Tab away. Pasting a
 * list into a term splits it into cards.
 */
export default function DeckEditor({
  deck,
  cards,
  onSaved,
  onCancel,
}: {
  deck: Deck;
  cards: Card[];
  onSaved: (data: DeckWithCards) => void;
  onCancel?: () => void;
}) {
  const [rows, setRows] = useState<Row[]>(() =>
    withTrailingBlank(cards.map((card) => ({ key: card.id, id: card.id, front: card.front, back: card.back }))),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<{ message: string; key?: string } | null>(null);
  const firstField = useRef<HTMLTextAreaElement>(null);

  const filled = rows.filter((row) => !isBlank(row));
  const dirty =
    filled.length !== cards.length ||
    filled.some((row, index) => row.id !== cards[index]?.id || row.front !== cards[index].front || row.back !== cards[index].back);

  useEffect(() => {
    if (cards.length === 0) firstField.current?.focus();
    // Only when the editor opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  function update(key: string, side: "front" | "back", value: string) {
    setRows((current) => withTrailingBlank(current.map((row) => (row.key === key ? { ...row, [side]: value } : row))));
    if (error?.key === key) setError(null);
  }

  function remove(key: string) {
    setRows((current) => withTrailingBlank(current.filter((row) => row.key !== key)));
  }

  function pasteList(event: ClipboardEvent<HTMLTextAreaElement>, key: string) {
    const text = event.clipboardData.getData("text");
    if (!text.includes("\n")) return;
    const { cards: pasted } = parseCards(text, guessSeparator(text));
    if (pasted.length < 2) return;
    event.preventDefault();
    setRows((current) => {
      const index = current.findIndex((row) => row.key === key);
      const incoming = pasted.map((card) => ({ ...blank(), front: card.front, back: card.back }));
      // An empty row is replaced; a filled one keeps its place with the list after it.
      const replaceRow = index >= 0 && isBlank(current[index]);
      const next = [...current];
      next.splice(replaceRow ? index : index + 1, replaceRow ? 1 : 0, ...incoming);
      return withTrailingBlank(next);
    });
  }

  async function save() {
    const half = rows.findIndex((row) => !isBlank(row) && (!row.front.trim() || !row.back.trim()));
    if (half >= 0) {
      setError({ message: `Card ${half + 1} needs both sides.`, key: rows[half].key });
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const data = await saveCards(
        deck.id,
        filled.map((row) => ({ id: row.id, front: row.front, back: row.back })),
      );
      onSaved(data);
    } catch (err) {
      setError({ message: err instanceof Error ? err.message : "Couldn't save." });
      setSaving(false);
    }
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      void save();
    }
  }

  return (
    <section aria-label="Edit cards" onKeyDown={onKeyDown} className="flex flex-col gap-3">
      <div className="hidden grid-cols-[28px_minmax(0,2fr)_minmax(0,3fr)_28px] gap-3 px-4 text-[12px] font-medium sm:grid" style={{ color: "var(--app-text-muted)" }}>
        <span />
        <span>Term</span>
        <span>Definition</span>
        <span />
      </div>
      <ol className="flex flex-col gap-2">
        {rows.map((row, index) => {
          const last = index === rows.length - 1;
          const flagged = error?.key === row.key;
          return (
            <li
              key={row.key}
              className="grid grid-cols-[28px_minmax(0,1fr)_28px] items-start gap-x-3 gap-y-2 rounded-lg px-4 py-3 sm:grid-cols-[28px_minmax(0,2fr)_minmax(0,3fr)_28px]"
              style={{
                background: "var(--app-surface)",
                boxShadow: flagged ? "0 0 0 1px var(--app-danger)" : "var(--elev-1)",
                opacity: last && isBlank(row) ? 0.75 : 1,
              }}
            >
              <span className="pt-2 text-right font-mono text-[12px] tabular-nums" style={{ color: "var(--app-text-faint)" }}>
                {index + 1}
              </span>
              <Field
                ref={index === 0 ? firstField : undefined}
                value={row.front}
                label={`Card ${index + 1} term`}
                placeholder={last ? "Next term" : "Term"}
                onChange={(value) => update(row.key, "front", value)}
                onPaste={(event) => pasteList(event, row.key)}
              />
              <span className="col-start-2 row-start-2 sm:col-start-3 sm:row-start-1">
                <Field
                  value={row.back}
                  label={`Card ${index + 1} definition`}
                  placeholder="Definition"
                  onChange={(value) => update(row.key, "back", value)}
                />
              </span>
              {last && isBlank(row) ? (
                <span />
              ) : (
                <button
                  type="button"
                  tabIndex={-1}
                  onClick={() => remove(row.key)}
                  aria-label={`Delete card ${index + 1}`}
                  className="col-start-3 row-start-1 mt-1 grid h-7 w-7 place-items-center rounded-md ui-hover sm:col-start-4"
                  style={{ color: "var(--app-text-muted)" }}
                >
                  <svg viewBox="0 0 20 20" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
                    <path d="M5 5l10 10M15 5L5 15" strokeLinecap="round" />
                  </svg>
                </button>
              )}
            </li>
          );
        })}
      </ol>

      <div
        className="sticky bottom-20 z-10 flex flex-wrap items-center justify-between gap-3 rounded-lg px-4 py-3"
        style={{ background: "var(--app-elev)", boxShadow: "var(--elev-2)" }}
      >
        <p className="text-[12.5px]" style={{ color: error ? "var(--app-danger)" : "var(--app-text-muted)" }} role={error ? "alert" : undefined}>
          {error ? (
            error.message
          ) : (
            <>
              {cardCount(filled.length)} · paste a list into a term to add many
            </>
          )}
        </p>
        <div className="flex items-center gap-2">
          {onCancel ? (
            <AppButton variant="ghost" onClick={onCancel} disabled={saving}>
              Cancel
            </AppButton>
          ) : null}
          <AppButton variant="primary" onClick={() => void save()} loading={saving} disabled={!dirty && cards.length > 0}>
            Save
          </AppButton>
        </div>
      </div>
    </section>
  );
}

function Field({
  ref,
  value,
  label,
  placeholder,
  onChange,
  onPaste,
}: {
  ref?: React.Ref<HTMLTextAreaElement>;
  value: string;
  label: string;
  placeholder: string;
  onChange: (value: string) => void;
  onPaste?: (event: ClipboardEvent<HTMLTextAreaElement>) => void;
}) {
  const inner = useRef<HTMLTextAreaElement | null>(null);

  // Grow with the text instead of scrolling inside a one-line box.
  useLayoutEffect(() => {
    const element = inner.current;
    if (!element) return;
    element.style.height = "auto";
    element.style.height = `${element.scrollHeight}px`;
  }, [value]);

  return (
    <textarea
      ref={(node) => {
        inner.current = node;
        if (typeof ref === "function") ref(node);
        else if (ref) (ref as React.RefObject<HTMLTextAreaElement | null>).current = node;
      }}
      rows={1}
      value={value}
      aria-label={label}
      placeholder={placeholder}
      onChange={(event) => onChange(event.target.value)}
      onPaste={onPaste}
      className="block w-full resize-none overflow-hidden rounded-md px-3 py-2 text-[14px] leading-[1.45] outline-none"
      style={{ background: "var(--app-surface-soft)", boxShadow: "var(--elev-inset)", color: "var(--app-text)" }}
    />
  );
}
