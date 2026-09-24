"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useSheets, type Sheet as SummarySheet } from "@/lib/api/sheets";
import { Sheet } from "../profile/ui";
import { useSubjects } from "../cards/shared";
import { SheetBody } from "./SheetPage";

/**
 * In Focus: the summary sheet for this session's subject, best matched to
 * its topic, one click from a side panel. Nothing shows when there isn't one.
 */
export default function SessionSheetLink({ subject, topic }: { subject: string | null | undefined; topic: string | null | undefined }) {
  const { state } = useSheets();
  const { subjects } = useSubjects();
  const [open, setOpen] = useState(false);

  const sheet = useMemo(() => {
    if (state.status !== "ready" || !subject) return null;
    const subjectId = subjects.find((item) => item.name.toLowerCase() === subject.toLowerCase())?.id;
    if (!subjectId) return null;
    return bestMatch(state.data.sheets.filter((item) => item.subjectId === subjectId), topic ?? "");
  }, [state, subjects, subject, topic]);

  if (!sheet) return null;
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-3 flex w-full items-center justify-between gap-3 rounded-md px-3 py-2 text-left text-[12.5px] transition-shadow hover:shadow-[0_0_0_1px_var(--app-border-strong)]"
        style={{ background: "var(--app-surface-soft)", boxShadow: "var(--elev-inset)", color: "var(--app-text-soft)" }}
      >
        <span className="min-w-0 truncate">
          Summary sheet · <span style={{ color: "var(--app-text)" }}>{sheet.title}</span>
        </span>
        <span className="shrink-0 font-medium" style={{ color: "var(--app-text)" }}>Open</span>
      </button>
      <Sheet open={open} eyebrow="Summary sheet" title={sheet.title} onClose={() => setOpen(false)}>
        <SheetBody sections={sheet.sections} compact />
        <Link href={`/app/sheets/${encodeURIComponent(sheet.id)}`} className="mt-2 inline-block text-[12.5px] underline underline-offset-4" style={{ color: "var(--app-text-muted)" }}>
          Open the full sheet
        </Link>
      </Sheet>
    </>
  );
}

/** A sheet whose topic or title overlaps the session's topic, else the newest one for the subject. */
function bestMatch(sheets: SummarySheet[], topic: string): SummarySheet | null {
  const words = (text: string) => new Set(text.toLowerCase().match(/[a-z0-9.]{3,}/g) ?? []);
  const wanted = words(topic);
  let best: { sheet: SummarySheet; score: number } | null = null;
  for (const sheet of sheets) {
    const have = words(`${sheet.topic?.title ?? ""} ${sheet.title}`);
    const score = [...wanted].filter((word) => have.has(word)).length;
    if (!best || score > best.score) best = { sheet, score };
  }
  return best?.sheet ?? null;
}
