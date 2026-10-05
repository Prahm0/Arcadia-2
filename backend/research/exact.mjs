// node research/exact.mjs export <from> <to> > problems.json
// node research/exact.mjs eval <solutions.json> > results.csv
import "./hooks.mjs";
const mode = process.argv[2];
if (mode === "export") await import("./src/exact-export.ts");
else await import("./src/exact-eval.ts");
