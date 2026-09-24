import { completeJson, type ContentPart } from "./openai";
import { SHEET_SECTIONS_MAX, type SheetSection } from "../../../shared/sheets";
import type { Env } from "../types";

interface DraftReply {
  title: string;
  sections: SheetSection[];
  /** Said plainly when the sources were too thin to fill a sheet. */
  note: string;
}

const DRAFT_SCHEMA = {
  name: "summary_sheet",
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["title", "sections", "note"],
    properties: {
      title: { type: "string" },
      note: { type: "string" },
      sections: {
        type: "array",
        maxItems: 8,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["heading", "body"],
          properties: { heading: { type: "string" }, body: { type: "string" } },
        },
      },
    },
  },
};

/**
 * A first draft of a one-page summary sheet, built only from the student's
 * own material. The route cleans it and hands it back unsaved; the student
 * edits and saves. Arcad never fills gaps from general knowledge: a thin
 * source gives a short sheet and a note saying what was missing.
 */
export async function draftSheet(
  env: Env,
  source: { label: string; content: ContentPart[] },
): Promise<DraftReply | null> {
  return completeJson<DraftReply>(
    env,
    [
      {
        role: "system",
        content: [
          "You turn a high school student's own study material into a one-page revision summary sheet.",
          "Use ONLY what is in the supplied material. Do not add facts, formulas, examples or topics that are not in it. If something is missing, leave it out.",
          `Write 2 to ${Math.min(8, SHEET_SECTIONS_MAX)} short sections. Pick headings from: Key ideas, Formulas, Definitions, Worked example, Common mistakes. Skip any the material doesn't support.`,
          "Bodies are light Markdown: '- ' bullets, **bold**, and '| a | b |' tables. Write maths inline between single dollar signs, e.g. $n = m / M$.",
          "In Definitions write one '- term: meaning' per line. In Formulas write one '- name: $formula$' per line, with what each symbol means.",
          "Be brief: this must fit on one A4 page. No study advice, no filler.",
          "Title: a short name for the sheet. Note: empty if the material was enough; otherwise one plain sentence on what was too thin to cover.",
        ].join("\n"),
      },
      {
        role: "user",
        content: [{ type: "text", text: `Make a summary sheet from: ${source.label}` }, ...source.content],
      },
    ],
    DRAFT_SCHEMA,
    2000,
  );
}
