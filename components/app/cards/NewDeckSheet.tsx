"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { cardCount, createDeck } from "@/lib/api/cards";
import { SEPARATOR_LABELS, guessSeparator, parseCards, type Separator } from "@/lib/app/cardImport";
import { cn } from "@/lib/cn";
import AppButton from "../AppButton";
import { Label, Select, Sheet, TextArea, TextInput } from "../profile/ui";
import { useSubjects } from "./shared";

type Start = "blank" | "paste";

/**
 * A new deck: a name, a subject, and either a blank editor or cards pasted
 * in (Quizlet's export, or any "term, tab, definition" list).
 */
export default function NewDeckSheet({
  open,
  onClose,
  subjectId: initialSubject = null,
}: {
  open: boolean;
  onClose: () => void;
  subjectId?: string | null;
}) {
  if (!open) return null;
  return <NewDeckForm onClose={onClose} initialSubject={initialSubject} />;
}

function NewDeckForm({ onClose, initialSubject }: { onClose: () => void; initialSubject: string | null }) {
  const router = useRouter();
  const { subjects } = useSubjects();
  const [title, setTitle] = useState("");
  const [subjectId, setSubjectId] = useState(initialSubject ?? subjects[0]?.id ?? "");
  const [start, setStart] = useState<Start>("blank");
  const [text, setText] = useState("");
  // null = follow the guess until the student picks one.
  const [separator, setSeparator] = useState<Separator | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const activeSeparator = separator ?? guessSeparator(text);
  const parsed = useMemo(() => parseCards(text, activeSeparator), [text, activeSeparator]);

  async function create() {
    if (!title.trim()) {
      setError("Give the deck a name.");
      return;
    }
    if (start === "paste" && parsed.cards.length === 0) {
      setError("Paste some cards first: one per line, term and definition split by a tab.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const { deck } = await createDeck({
        title: title.trim(),
        subjectId: subjectId || null,
        source: start === "paste" ? "import" : "manual",
        cards: start === "paste" ? parsed.cards : [],
      });
      router.push(`/app/cards/${encodeURIComponent(deck.id)}${start === "blank" ? "?edit=1" : ""}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't make the deck.");
      setSaving(false);
    }
  }

  return (
    <Sheet open eyebrow="Cards" title="New deck" onClose={onClose}>
      <form
        className="space-y-5"
        onSubmit={(event) => {
          event.preventDefault();
          void create();
        }}
      >
        <Label text="Name">
          <TextInput value={title} onChange={setTitle} placeholder="e.g. Stoichiometry" maxLength={80} required />
        </Label>
        <Label text="Subject">
          <Select value={subjectId} onChange={setSubjectId}>
            {subjects.map((subject) => (
              <option key={subject.id} value={subject.id}>
                {subject.name}
              </option>
            ))}
            <option value="">No subject</option>
          </Select>
        </Label>

        <div>
          <p className="mb-2 text-[12.5px] font-medium" style={{ color: "var(--app-text-muted)" }}>
            Cards
          </p>
          <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="How to start">
            <StartOption selected={start === "blank"} onSelect={() => setStart("blank")} title="Type them in" body="Start with an empty deck." />
            <StartOption
              selected={start === "paste"}
              onSelect={() => setStart("paste")}
              title="Paste a list"
              body="From Quizlet, notes, anywhere."
            />
          </div>
        </div>

        {start === "paste" ? (
          <div className="space-y-2">
            <TextArea
              value={text}
              onChange={setText}
              rows={7}
              placeholder={"Mole\t6.022 × 10²³ particles\nLimiting reagent\tThe reactant that runs out first"}
            />
            <div className="flex flex-wrap items-center justify-between gap-2 text-[12.5px]" style={{ color: "var(--app-text-muted)" }}>
              <span aria-live="polite">
                {text.trim()
                  ? `${cardCount(parsed.cards.length)}${parsed.skipped ? ` · ${parsed.skipped} line${parsed.skipped === 1 ? "" : "s"} skipped` : ""}`
                  : "One card per line."}
              </span>
              <label className="inline-flex items-center gap-2">
                Split on
                <select
                  value={activeSeparator}
                  onChange={(event) => setSeparator(event.target.value as Separator)}
                  className="rounded-md px-2 py-1 text-[12.5px] outline-none"
                  style={{ background: "var(--app-surface-soft)", boxShadow: "var(--elev-inset)", color: "var(--app-text)" }}
                >
                  {(Object.keys(SEPARATOR_LABELS) as Separator[]).map((key) => (
                    <option key={key} value={key}>
                      {SEPARATOR_LABELS[key]}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {parsed.cards.length > 0 ? (
              <ul className="overflow-hidden rounded-md text-[12.5px]" style={{ boxShadow: "var(--elev-inset)" }}>
                {parsed.cards.slice(0, 3).map((card, index) => (
                  <li key={index} className="grid grid-cols-[2fr_3fr] gap-3 border-b px-3 py-1.5 last:border-b-0" style={{ borderColor: "var(--app-border)" }}>
                    <span className="truncate font-medium" style={{ color: "var(--app-text)" }}>
                      {card.front}
                    </span>
                    <span className="truncate" style={{ color: "var(--app-text-soft)" }}>
                      {card.back}
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}
            <p className="text-[12px]" style={{ color: "var(--app-text-faint)" }}>
              From Quizlet: Export on a set you made, copy the text, paste it here. Typing it? Use &quot;term - definition&quot;.
            </p>
          </div>
        ) : null}

        {error ? (
          <p role="alert" className="text-[12.5px]" style={{ color: "var(--app-danger)" }}>
            {error}
          </p>
        ) : null}

        <div className="flex justify-end gap-2">
          <AppButton type="button" variant="ghost" onClick={onClose}>
            Cancel
          </AppButton>
          <AppButton type="submit" variant="primary" loading={saving}>
            {start === "paste" && parsed.cards.length ? `Make deck (${parsed.cards.length})` : "Make deck"}
          </AppButton>
        </div>
      </form>
    </Sheet>
  );
}

function StartOption({ selected, onSelect, title, body }: { selected: boolean; onSelect: () => void; title: string; body: string }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={cn("rounded-md px-3 py-2.5 text-left transition-shadow", !selected && "hover:shadow-[0_0_0_1px_var(--app-border-strong)]")}
      style={{
        background: selected ? "var(--app-accent-soft)" : "var(--app-surface-soft)",
        boxShadow: selected ? "inset 0 0 0 1px var(--app-accent)" : "var(--elev-inset)",
      }}
    >
      <span className="block text-[13.5px] font-medium" style={{ color: "var(--app-text)" }}>
        {title}
      </span>
      <span className="mt-0.5 block text-[12px]" style={{ color: "var(--app-text-muted)" }}>
        {body}
      </span>
    </button>
  );
}
