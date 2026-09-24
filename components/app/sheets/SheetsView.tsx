"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { deckFromSheet, deleteSheet, useSheets, type Sheet } from "@/lib/api/sheets";
import AppButton from "../AppButton";
import { flashMenuNotice, linkEntries, showContextMenu } from "../ContextMenu";
import EmptyState, { ExampleRow } from "../EmptyState";
import PageHeader from "../PageHeader";
import { PlusIcon, Spinner, SubjectTag, useSubjects, type SubjectInfo } from "../cards/shared";
import NewSheetSheet from "./NewSheetSheet";

/**
 * Every summary sheet, grouped by subject. A sheet is one page per topic:
 * the key ideas, formulas and definitions, ready to print or pull up in Focus.
 */
export default function SheetsView({ startCreating = false }: { startCreating?: boolean }) {
  const { state, refresh } = useSheets();
  const { subjects } = useSubjects();
  const router = useRouter();
  const [creating, setCreating] = useState(startCreating);

  const sheets = useMemo(() => (state.status === "ready" ? state.data.sheets : []), [state]);
  const groups = useMemo(() => groupBySubject(sheets, subjects), [sheets, subjects]);

  const newSheet = (
    <AppButton variant="primary" icon={<PlusIcon />} onClick={() => setCreating(true)}>
      New sheet
    </AppButton>
  );

  async function remove(sheet: Sheet) {
    if (!confirm(`Delete ${sheet.title}? This can't be undone.`)) return;
    try {
      await deleteSheet(sheet.id);
    } catch (err) {
      flashMenuNotice(err instanceof Error ? err.message : "Couldn't delete it.");
    }
    await refresh();
  }

  async function makeDeck(sheet: Sheet) {
    try {
      const { deckId, cardCount } = await deckFromSheet(sheet.id);
      flashMenuNotice(`Made a deck of ${cardCount} card${cardCount === 1 ? "" : "s"}.`);
      router.push(`/app/cards/${encodeURIComponent(deckId)}`);
    } catch (err) {
      flashMenuNotice(err instanceof Error ? err.message : "Couldn't make a deck.");
    }
  }

  function sheetMenu(event: React.MouseEvent, sheet: Sheet) {
    const base = `/app/sheets/${encodeURIComponent(sheet.id)}`;
    showContextMenu(
      event,
      [
        { kind: "item", label: "Open", onSelect: () => router.push(base) },
        { kind: "item", label: "Edit", onSelect: () => router.push(`${base}?edit=1`) },
        { kind: "item", label: "Print…", onSelect: () => router.push(`${base}?print=1`) },
        { kind: "item", label: "Make flashcards", onSelect: () => void makeDeck(sheet) },
        { kind: "separator" },
        ...linkEntries(base),
        { kind: "separator" },
        { kind: "item", label: "Delete sheet…", danger: true, onSelect: () => void remove(sheet) },
      ],
      sheet.title,
    );
  }

  return (
    <>
      <PageHeader
        width={820}
        eyebrow="Resources"
        title="Sheets"
        meta={state.status === "ready" && sheets.length > 0 ? `${sheets.length} ${sheets.length === 1 ? "sheet" : "sheets"}` : undefined}
        tour="sheets"
        action={sheets.length > 0 ? newSheet : undefined}
      />

      <div className="mx-auto flex w-full max-w-[820px] flex-col gap-8 px-6 py-8 sm:px-10">
        {state.status === "loading" ? (
          <Spinner />
        ) : state.status === "error" ? (
          <p role="alert" className="text-[14px]" style={{ color: "var(--app-danger)" }}>
            {state.error}
          </p>
        ) : sheets.length === 0 ? (
          <EmptyState
            icon={<SheetIcon size={20} />}
            title={
              <>
                Your <span className="accent-serif">first</span> sheet.
              </>
            }
            body="One page per topic: the key ideas, formulas and definitions you need the night before. Write it yourself, or have Arcad draft it from your syllabus, notes or a deck."
            example={
              <>
                <ExampleRow title="Stoichiometry" meta="Chemistry · Formulas, Definitions, Common mistakes" />
                <ExampleRow title="Kinematics" meta="Physics · Formulas, Worked example" bar="var(--app-cat-extra)" />
                <ExampleRow title="Hamlet: themes" meta="English · Key ideas, Quotes" bar="var(--app-success)" />
              </>
            }
            action={newSheet}
            hint="Writing sheets is free. Arcad drafts are on Pro and Max."
          />
        ) : (
          groups.map((group) => (
            <section key={group.subject?.id ?? "none"} aria-labelledby={`sheet-group-${group.subject?.id ?? "none"}`}>
              <h2 id={`sheet-group-${group.subject?.id ?? "none"}`} className="flex">
                <SubjectTag subject={group.subject} />
              </h2>
              <ul className="mt-3 grid gap-2 sm:grid-cols-2">
                {group.sheets.map((sheet) => (
                  <li key={sheet.id} onContextMenu={(event) => sheetMenu(event, sheet)}>
                    <SheetTile sheet={sheet} colour={group.subject?.colour} />
                  </li>
                ))}
              </ul>
            </section>
          ))
        )}
      </div>

      <NewSheetSheet open={creating} onClose={() => setCreating(false)} />
    </>
  );
}

function SheetTile({ sheet, colour }: { sheet: Sheet; colour?: string }) {
  const headings = sheet.sections.map((section) => section.heading).slice(0, 4);
  return (
    <Link
      href={`/app/sheets/${encodeURIComponent(sheet.id)}`}
      className="flex h-full flex-col gap-1 rounded-lg px-4 py-3.5 transition-shadow hover:shadow-[0_0_0_1px_var(--app-border-strong)]"
      style={{ background: "var(--app-surface)", boxShadow: "var(--elev-1)", borderLeft: `3px solid ${colour ?? "var(--app-border-strong)"}` }}
    >
      <p className="truncate text-[14.5px] font-medium" style={{ color: "var(--app-text)" }}>
        {sheet.title}
      </p>
      <p className="truncate text-[12.5px]" style={{ color: "var(--app-text-muted)" }}>
        {[sheet.topic?.title, headings.length ? headings.join(", ") : "Empty"].filter(Boolean).join(" · ")}
      </p>
    </Link>
  );
}

function groupBySubject(sheets: Sheet[], subjects: SubjectInfo[]) {
  const groups: Array<{ subject: SubjectInfo | null; sheets: Sheet[] }> = [];
  for (const subject of subjects) {
    const own = sheets.filter((sheet) => sheet.subjectId === subject.id);
    if (own.length) groups.push({ subject, sheets: own });
  }
  const known = new Set(subjects.map((subject) => subject.id));
  const rest = sheets.filter((sheet) => !sheet.subjectId || !known.has(sheet.subjectId));
  if (rest.length) groups.push({ subject: null, sheets: rest });
  return groups;
}

export function SheetIcon({ size = 16 }: { size?: number }) {
  return (
    <svg viewBox="0 0 20 20" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="4" y="2.5" width="12" height="15" rx="1.5" />
      <path d="M7 6.5h6M7 9.5h6M7 12.5h3.5" />
    </svg>
  );
}
