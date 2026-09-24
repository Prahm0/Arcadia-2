"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  clearDraft,
  createSheet,
  deckFromSheet,
  deleteSheet,
  readDraft,
  updateSheet,
  useSheet,
  type Sheet,
  type SheetSection,
} from "@/lib/api/sheets";
import { SECTION_PRESETS, SHEET_BODY_MAX, SHEET_SECTIONS_MAX } from "@/shared/sheets";
import AppButton from "../AppButton";
import { BackLink, LoadError, Spinner, SubjectTag, useSubjects } from "../cards/shared";
import SheetMarkdown from "./SheetMarkdown";

/** An existing sheet by id. Opens to read; ?edit=1 to edit, ?print=1 to print. */
export default function SheetPage({ sheetId, startEditing, startPrinting }: { sheetId: string; startEditing: boolean; startPrinting: boolean }) {
  const { state, replace } = useSheet(sheetId);
  if (state.status === "loading") return <Spinner />;
  if (state.status === "error") {
    return <LoadError message={state.error || "Couldn't load this sheet."} backHref="/app/sheets" backLabel="Back to sheets" />;
  }
  return <SheetScreen sheet={state.data.sheet} onSaved={(sheet) => replace({ sheet })} startEditing={startEditing} startPrinting={startPrinting} />;
}

/** A sheet that isn't saved yet: blank, or Arcad's draft, handed over by the new-sheet form. */
export function NewSheetPage() {
  const router = useRouter();
  // The app gate renders pages client-side only, so sessionStorage is there.
  const [draft] = useState(() => readDraft());
  useEffect(() => {
    if (!draft) router.replace("/app/sheets?new=1");
  }, [draft, router]);
  if (!draft) return <Spinner />;
  return (
    <div className="mx-auto flex w-full max-w-[1100px] flex-col gap-6 px-4 py-6 pb-28 sm:px-8 sm:py-8">
      <BackLink href="/app/sheets">Sheets</BackLink>
      <SheetEditor
        initialTitle={draft.title}
        initialSections={draft.sections}
        subjectId={draft.subjectId}
        banner={
          draft.source === "arcad"
            ? `Generated draft. Review and edit before saving.${draft.note ? ` ${draft.note}` : ""}`
            : null
        }
        saveLabel="Save sheet"
        onCancel={() => {
          clearDraft();
          router.push("/app/sheets");
        }}
        onSave={async (title, sections) => {
          const { sheet } = await createSheet({
            title,
            subjectId: draft.subjectId,
            topicId: draft.topicId,
            sections,
            source: draft.source,
          });
          clearDraft();
          router.replace(`/app/sheets/${encodeURIComponent(sheet.id)}`);
        }}
      />
    </div>
  );
}

function SheetScreen({
  sheet,
  onSaved,
  startEditing,
  startPrinting,
}: {
  sheet: Sheet;
  onSaved: (sheet: Sheet) => void;
  startEditing: boolean;
  startPrinting: boolean;
}) {
  const router = useRouter();
  const { find } = useSubjects();
  const subject = find(sheet.subjectId);
  const [editing, setEditing] = useState(startEditing || sheet.sections.length === 0);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!startPrinting) return;
    // Let the page paint before the print dialog takes over.
    const timer = window.setTimeout(() => window.print(), 300);
    return () => window.clearTimeout(timer);
  }, [startPrinting]);

  async function makeDeck() {
    setBusy(true);
    setNotice(null);
    try {
      const { deckId } = await deckFromSheet(sheet.id);
      router.push(`/app/cards/${encodeURIComponent(deckId)}`);
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "Couldn't make a deck.");
      setBusy(false);
    }
  }

  async function remove() {
    if (!confirm(`Delete ${sheet.title}? This can't be undone.`)) return;
    try {
      await deleteSheet(sheet.id);
      router.push("/app/sheets");
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "Couldn't delete it.");
    }
  }

  if (editing) {
    return (
      <div className="mx-auto flex w-full max-w-[1100px] flex-col gap-6 px-4 py-6 pb-28 sm:px-8 sm:py-8">
        <BackLink href="/app/sheets">Sheets</BackLink>
        <SheetEditor
          initialTitle={sheet.title}
          initialSections={sheet.sections}
          subjectId={sheet.subjectId}
          banner={null}
          saveLabel="Save"
          onCancel={sheet.sections.length > 0 ? () => setEditing(false) : undefined}
          onSave={async (title, sections) => {
            const { sheet: saved } = await updateSheet(sheet.id, { title, sections });
            onSaved(saved);
            setEditing(false);
          }}
        />
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-[900px] flex-col gap-6 px-4 py-6 pb-28 sm:px-8 sm:py-8">
      <div className="print:hidden">
        <BackLink href="/app/sheets">Sheets</BackLink>
      </div>
      <article className="sheet-print rounded-lg p-6 sm:p-8" style={{ background: "var(--app-surface)", boxShadow: "var(--elev-1)" }}>
        <header className="flex flex-wrap items-start justify-between gap-4 border-b pb-4" style={{ borderColor: "var(--app-border)" }}>
          <div className="min-w-0">
            <h1 className="text-[26px] font-semibold tracking-[-0.02em]" style={{ color: "var(--app-text)" }}>
              {sheet.title}
            </h1>
            <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px]" style={{ color: "var(--app-text-muted)" }}>
              <SubjectTag subject={subject} size="sm" />
              {sheet.topic?.title ? <span>{sheet.topic.title}</span> : null}
            </p>
          </div>
          <div className="flex flex-wrap gap-2 print:hidden">
            <AppButton variant="primary" onClick={() => setEditing(true)}>Edit</AppButton>
            <AppButton onClick={() => window.print()}>Print</AppButton>
            <AppButton onClick={() => void makeDeck()} loading={busy}>Make flashcards</AppButton>
            <AppButton variant="ghost" onClick={() => void remove()}>Delete</AppButton>
          </div>
        </header>
        {notice ? (
          <p role="alert" className="mt-4 text-[13px] print:hidden" style={{ color: "var(--app-danger)" }}>
            {notice}
          </p>
        ) : null}
        <SheetBody sections={sheet.sections} />
      </article>
    </div>
  );
}

/** The sheet's sections in two columns, the way a printed revision sheet reads. */
export function SheetBody({ sections, compact = false }: { sections: SheetSection[]; compact?: boolean }) {
  if (sections.length === 0) {
    return <p className="mt-5 text-[13px]" style={{ color: "var(--app-text-muted)" }}>Nothing on this sheet yet.</p>;
  }
  return (
    <div className={compact ? "mt-4 flex flex-col gap-5" : "mt-5 gap-x-8 md:columns-2 print:columns-2"}>
      {sections.map((section, index) => (
        <section key={index} className="mb-5 break-inside-avoid">
          <h2 className="mb-1.5 text-[12px] font-semibold uppercase tracking-[0.08em]" style={{ color: "var(--app-text-muted)" }}>
            {section.heading}
          </h2>
          {section.body ? <SheetMarkdown text={section.body} /> : <p className="text-[13px]" style={{ color: "var(--app-text-faint)" }}>Empty</p>}
        </section>
      ))}
    </div>
  );
}

function SheetEditor({
  initialTitle,
  initialSections,
  subjectId,
  banner,
  saveLabel,
  onSave,
  onCancel,
}: {
  initialTitle: string;
  initialSections: SheetSection[];
  subjectId: string | null;
  banner: string | null;
  saveLabel: string;
  onSave: (title: string, sections: SheetSection[]) => Promise<void>;
  onCancel?: () => void;
}) {
  const { find } = useSubjects();
  const [title, setTitle] = useState(initialTitle);
  const [sections, setSections] = useState<SheetSection[]>(initialSections.length ? initialSections : [{ heading: "Key ideas", body: "" }]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const edit = (index: number, patch: Partial<SheetSection>) =>
    setSections((list) => list.map((section, i) => (i === index ? { ...section, ...patch } : section)));
  const move = (index: number, by: number) =>
    setSections((list) => {
      const next = [...list];
      [next[index], next[index + by]] = [next[index + by], next[index]];
      return next;
    });
  const unused = SECTION_PRESETS.filter((preset) => !sections.some((section) => section.heading === preset));

  async function save() {
    if (!title.trim()) {
      setError("Give the sheet a name.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSave(title.trim(), sections);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save the sheet.");
      setSaving(false);
    }
  }

  return (
    <form
      className="flex flex-col gap-5"
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      {banner ? (
        <p className="rounded-lg px-4 py-3 text-[13px] leading-[1.5]" style={{ background: "var(--app-surface-soft)", boxShadow: "var(--elev-inset)", color: "var(--app-text-soft)" }}>
          {banner}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          maxLength={80}
          aria-label="Sheet name"
          placeholder="Sheet name"
          className="min-w-0 flex-1 bg-transparent text-[24px] font-semibold tracking-[-0.02em] outline-none"
          style={{ color: "var(--app-text)" }}
        />
        <SubjectTag subject={find(subjectId)} size="sm" />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="flex flex-col gap-3">
          {sections.map((section, index) => (
            <div key={index} className="rounded-lg p-3" style={{ background: "var(--app-surface)", boxShadow: "var(--elev-1)" }}>
              <div className="flex items-center gap-2">
                <input
                  value={section.heading}
                  onChange={(event) => edit(index, { heading: event.target.value })}
                  maxLength={60}
                  aria-label={`Section ${index + 1} heading`}
                  placeholder="Heading"
                  className="min-w-0 flex-1 bg-transparent text-[13.5px] font-semibold outline-none"
                  style={{ color: "var(--app-text)" }}
                />
                <AppButton type="button" size="sm" variant="ghost" disabled={index === 0} onClick={() => move(index, -1)} aria-label="Move section up"><Glyph d="M5 12l5-5 5 5" /></AppButton>
                <AppButton type="button" size="sm" variant="ghost" disabled={index === sections.length - 1} onClick={() => move(index, 1)} aria-label="Move section down"><Glyph d="M5 8l5 5 5-5" /></AppButton>
                <AppButton type="button" size="sm" variant="ghost" onClick={() => setSections((list) => list.filter((_, i) => i !== index))} aria-label="Remove section"><Glyph d="M6 6l8 8M14 6l-8 8" /></AppButton>
              </div>
              <textarea
                value={section.body}
                onChange={(event) => edit(index, { body: event.target.value })}
                maxLength={SHEET_BODY_MAX}
                rows={Math.min(14, Math.max(4, section.body.split("\n").length + 1))}
                aria-label={`${section.heading || `Section ${index + 1}`} text`}
                placeholder={placeholderFor(section.heading)}
                className="mt-2 w-full resize-y rounded-md px-3 py-2 font-mono text-[12.5px] leading-[1.55] outline-none"
                style={{ background: "var(--app-surface-soft)", boxShadow: "var(--elev-inset)", color: "var(--app-text)" }}
              />
            </div>
          ))}
          {sections.length < SHEET_SECTIONS_MAX ? (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[12.5px]" style={{ color: "var(--app-text-muted)" }}>Add</span>
              {[...unused, "Other"].map((heading) => (
                <AppButton
                  key={heading}
                  type="button"
                  size="sm"
                  onClick={() => setSections((list) => [...list, { heading: heading === "Other" ? "" : heading, body: "" }])}
                >
                  + {heading}
                </AppButton>
              ))}
            </div>
          ) : null}
          <p className="text-[12px] leading-[1.5]" style={{ color: "var(--app-text-faint)" }}>
            &quot;- &quot; for bullets, **bold**, | a | b | for tables, and $maths$ like $v = u + at$ or $x^2$. In Definitions and Formulas, one &quot;term: meaning&quot; per line becomes a flashcard.
          </p>
        </div>

        <div className="hidden lg:block">
          <p className="mb-2 text-[12px] font-medium" style={{ color: "var(--app-text-muted)" }}>Preview</p>
          <div className="rounded-lg p-5" style={{ background: "var(--app-surface)", boxShadow: "var(--elev-1)" }}>
            <SheetBody sections={sections.filter((section) => section.heading || section.body)} compact />
          </div>
        </div>
      </div>

      {error ? (
        <p role="alert" className="text-[13px]" style={{ color: "var(--app-danger)" }}>
          {error}
        </p>
      ) : null}
      <div className="flex justify-end gap-2">
        {onCancel ? (
          <AppButton type="button" variant="ghost" onClick={onCancel}>
            Cancel
          </AppButton>
        ) : null}
        <AppButton type="submit" variant="primary" loading={saving}>
          {saveLabel}
        </AppButton>
      </div>
    </form>
  );
}

function Glyph({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 20 20" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}

function placeholderFor(heading: string): string {
  if (/formula/i.test(heading)) return "- Moles: $n = m / M$\n- Concentration: $c = n / V$";
  if (/definition/i.test(heading)) return "- Mole: 6.022 × 10²³ particles\n- Limiting reagent: the reactant that runs out first";
  if (/example/i.test(heading)) return "1. Write the balanced equation\n2. Convert grams to moles\n3. …";
  if (/mistake/i.test(heading)) return "- Forgetting to balance the equation first";
  return "- The main ideas, in your own words";
}
