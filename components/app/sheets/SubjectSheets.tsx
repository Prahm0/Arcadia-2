"use client";

import Link from "next/link";
import { useState } from "react";
import { useSheets } from "@/lib/api/sheets";
import AppButton from "../AppButton";
import { Section } from "../profile/ui";
import NewSheetSheet from "./NewSheetSheet";

/** On a subject's page: its summary sheets, and a way to start one. */
export default function SubjectSheets({ subjectId, subjectName }: { subjectId: string; subjectName: string }) {
  const { state } = useSheets();
  const [creating, setCreating] = useState(false);
  const sheets = state.status === "ready" ? state.data.sheets.filter((sheet) => sheet.subjectId === subjectId) : [];

  return (
    <Section
      id="sheets"
      title="Summary sheets"
      meta={`One page per topic for ${subjectName}: key ideas, formulas and definitions.`}
      action={<AppButton size="sm" onClick={() => setCreating(true)}>New sheet</AppButton>}
    >
      {state.status === "loading" ? (
        <p className="text-[13px]" style={{ color: "var(--app-text-muted)" }}>Loading sheets…</p>
      ) : sheets.length === 0 ? (
        <p className="text-[13px]" style={{ color: "var(--app-text-muted)" }}>
          None yet. Write one, or have Arcad draft it from this subject&apos;s syllabus or files.
        </p>
      ) : (
        <ul className="flex flex-col">
          {sheets.map((sheet) => (
            <li key={sheet.id} className="border-b last:border-b-0" style={{ borderColor: "var(--app-border)" }}>
              <Link href={`/app/sheets/${encodeURIComponent(sheet.id)}`} className="flex items-baseline justify-between gap-3 py-2 text-[13.5px] hover:underline">
                <span className="truncate font-medium" style={{ color: "var(--app-text)" }}>{sheet.title}</span>
                <span className="shrink-0 text-[12px]" style={{ color: "var(--app-text-muted)" }}>{sheet.topic?.title ?? `${sheet.sections.length} sections`}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <NewSheetSheet open={creating} onClose={() => setCreating(false)} subjectId={subjectId} />
    </Section>
  );
}
