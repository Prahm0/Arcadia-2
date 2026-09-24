import test from "node:test";
import assert from "node:assert/strict";
import { SHEET_SECTIONS_MAX, cardsFromSections, cleanSections, cleanSheetTitle, parseSections } from "../shared/sheets.ts";

test("titles collapse whitespace and are capped", () => {
  assert.equal(cleanSheetTitle("  Moles \n and  mass "), "Moles and mass");
  assert.equal(cleanSheetTitle("x".repeat(200)).length, 80);
});

test("empty sections drop, headless bodies become Notes, bodies keep line breaks", () => {
  const result = cleanSections([
    { heading: "", body: "" },
    { heading: "Key ideas", body: "- one\r\n- two  " },
    { heading: "  ", body: "loose text" },
  ]);
  assert.deepEqual(result, {
    sections: [
      { heading: "Key ideas", body: "- one\n- two" },
      { heading: "Notes", body: "loose text" },
    ],
  });
});

test("too many sections is an error, not a silent cut", () => {
  const many = Array.from({ length: SHEET_SECTIONS_MAX + 1 }, (_, i) => ({ heading: `S${i}`, body: "x" }));
  assert.ok("error" in cleanSections(many));
});

test("stored JSON that's broken reads as an empty sheet", () => {
  assert.deepEqual(parseSections("not json"), []);
  assert.deepEqual(parseSections('[{"heading":"A","body":"b"}]'), [{ heading: "A", body: "b" }]);
});

test("cards come from Definitions and Formulas lines and tables only", () => {
  const cards = cardsFromSections([
    { heading: "Key ideas", body: "- Mole: not a card, this section is prose" },
    { heading: "Definitions", body: "- **Mole**: 6.022 × 10²³ particles\n- Limiting reagent - the reactant that runs out first\njust a sentence" },
    { heading: "Formulas", body: "| Quantity | Formula |\n| --- | --- |\n| Moles | $n = m / M$ |\n- Concentration = $c = n / V$" },
  ]);
  assert.deepEqual(cards, [
    { front: "Mole", back: "6.022 × 10²³ particles" },
    { front: "Limiting reagent", back: "the reactant that runs out first" },
    { front: "Moles", back: "$n = m / M$" },
    { front: "Concentration", back: "$c = n / V$" },
  ]);
});
