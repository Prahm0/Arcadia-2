"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { useDecks } from "@/lib/api/cards";
import { useProfile } from "@/lib/api/profile";
import { draftSheet, stashDraft } from "@/lib/api/sheets";
import { cn } from "@/lib/cn";
import { SECTION_PRESETS } from "@/shared/sheets";
import AppButton from "../AppButton";
import { Label, Select, Sheet, TextInput } from "../profile/ui";
import { useSubjects } from "../cards/shared";

type Start = "blank" | "arcad";
type Source = "file" | "deck";

/**
 * A new summary sheet: blank with the usual headings, or an Arcad draft from
 * one of the student's own sources. Either way it opens in the editor
 * unsaved, so nothing Arcad wrote is kept until the student has read it.
 */
export default function NewSheetSheet({
  open,
  onClose,
  subjectId: initialSubject = null,
}: {
  open: boolean;
  onClose: () => void;
  subjectId?: string | null;
}) {
  if (!open) return null;
  return <NewSheetForm onClose={onClose} initialSubject={initialSubject} />;
}

function NewSheetForm({ onClose, initialSubject }: { onClose: () => void; initialSubject: string | null }) {
  const router = useRouter();
  const { subjects } = useSubjects();
  const { state: profileState } = useProfile();
  const { state: decksState } = useDecks();
  const [title, setTitle] = useState("");
  const [subjectId, setSubjectId] = useState(initialSubject ?? subjects[0]?.id ?? "");
  const [start, setStart] = useState<Start>("blank");
  const [source, setSource] = useState<Source>("file");
  const [fileId, setFileId] = useState("");
  const [deckId, setDeckId] = useState("");
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const profileSubjects = useMemo(() => (profileState.status === "ready" ? profileState.data.subjects : []), [profileState]);
  const files = useMemo(
    () =>
      profileSubjects
        .filter((subject) => !subjectId || subject.id === subjectId)
        .flatMap((subject) =>
          [subject.syllabus, ...subject.resources]
            .filter((file): file is NonNullable<typeof file> => Boolean(file?.read && file.stored))
            .map((file) => ({ id: file.id, label: `${subject.name} · ${file.filename}` })),
        ),
    [profileSubjects, subjectId],
  );
  const decks = useMemo(
    () => (decksState.status === "ready" ? decksState.data.decks.filter((deck) => deck.cardCount > 0 && (!subjectId || deck.subjectId === subjectId)) : []),
    [decksState, subjectId],
  );

  async function create() {
    setError(null);
    if (start === "blank") {
      if (!title.trim()) {
        setError("Give the sheet a name.");
        return;
      }
      stashDraft({
        title: title.trim(),
        subjectId: subjectId || null,
        topicId: null,
        sections: SECTION_PRESETS.slice(0, 3).map((heading) => ({ heading, body: "" })),
        note: "",
        source: "manual",
      });
      router.push("/app/sheets/new");
      return;
    }
    const pick = source === "file" ? { subjectFileId: fileId } : { deckId };
    if (!Object.values(pick)[0]) {
      setError(source === "file" ? "Choose a file." : "Choose a deck.");
      return;
    }
    setWorking(true);
    try {
      const { draft } = await draftSheet(pick);
      stashDraft({ ...draft, title: title.trim() || draft.title, source: "arcad" });
      router.push("/app/sheets/new");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't generate the draft.");
      setWorking(false);
    }
  }

  return (
    <Sheet open eyebrow="Sheets" title="New sheet" onClose={onClose}>
      <form
        className="space-y-5"
        onSubmit={(event) => {
          event.preventDefault();
          void create();
        }}
      >
        <Label text={start === "arcad" ? "Name (optional)" : "Name"}>
          <TextInput
            value={title}
            onChange={setTitle}
            placeholder={start === "arcad" ? "Uses the source's title if blank" : "e.g. Stoichiometry"}
            maxLength={80}
            required={start === "blank"}
          />
        </Label>
        <Label text="Subject">
          <Select
            value={subjectId}
            onChange={(id) => {
              setSubjectId(id);
              setFileId("");
              setDeckId("");
            }}
          >
            {subjects.map((subject) => (
              <option key={subject.id} value={subject.id}>
                {subject.name}
              </option>
            ))}
            <option value="">No subject</option>
          </Select>
        </Label>

        <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="How to start">
          <Option selected={start === "blank"} onSelect={() => setStart("blank")} title="Blank" body="Key ideas, Formulas, Definitions." />
          <Option selected={start === "arcad"} onSelect={() => setStart("arcad")} title="Generate draft" body="From an uploaded file or a deck." />
        </div>

        {start === "arcad" ? (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Draft from">
              <Option selected={source === "file"} onSelect={() => setSource("file")} title="File" body="Uploaded notes" />
              <Option selected={source === "deck"} onSelect={() => setSource("deck")} title="Deck" body="Flashcards" />
            </div>
            {source === "file" ? (
              <Label text="Uploaded file" hint="Files that have been read and stored.">
                <Select value={fileId} onChange={setFileId}>
                  <option value="">{profileState.status === "loading" ? "Loading files…" : "Choose a file"}</option>
                  {files.map((file) => (
                    <option key={file.id} value={file.id}>
                      {file.label}
                    </option>
                  ))}
                </Select>
              </Label>
            ) : (
              <Label text="Flashcard deck">
                <Select value={deckId} onChange={setDeckId}>
                  <option value="">{decksState.status === "loading" ? "Loading decks…" : "Choose a deck"}</option>
                  {decks.map((deck) => (
                    <option key={deck.id} value={deck.id}>
                      {deck.title} · {deck.cardCount} cards
                    </option>
                  ))}
                </Select>
              </Label>
            )}
            <p className="text-[12px] leading-[1.45]" style={{ color: "var(--app-text-faint)" }}>
              Only content from the selected source is used. The draft isn&apos;t saved until you save it. Pro and Max.
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
          <AppButton type="submit" variant="primary" loading={working}>
            {start === "arcad" ? (working ? "Generating…" : "Generate draft") : "Create sheet"}
          </AppButton>
        </div>
      </form>
    </Sheet>
  );
}

function Option({ selected, onSelect, title, body }: { selected: boolean; onSelect: () => void; title: string; body: string }) {
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
