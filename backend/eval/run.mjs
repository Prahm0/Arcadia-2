// The test harness for the syllabus tagger: runs the same pipeline the app
// uses (src/lib/work-tagging.ts) over a folder of real work and measures it
// against hand-made answers. Results are filed under the prompt version so
// each design iteration's numbers sit side by side.
//
//   OPENAI_API_KEY=… node eval/run.mjs --accuracy --consistency --handwriting --cost
//
// Options:
//   --data <dir>     work files and gold.csv (default eval/data)
//   --runs <n>       repeats for --consistency (default 5)
//   --model <name>   default gpt-5-mini (the app's document model)
//   --effort <e>     reasoning effort, default minimal (as in the app)
//   --limit <n>      only the first n items
//   --note "<text>"  what changed in this iteration, saved with the results
//
// eval/data/gold.csv columns (header row required):
//   id,file,points,quality
//   id      anonymous item name, e.g. w01 (this is what results record)
//   file    path inside the data folder
//   points  the dot point ids a teacher or tutor tagged, separated by ;
//   quality optional, the tutor's 0-100 rubric score per point, same order, ;
// eval/data/transcripts/<id>.txt: optional hand transcripts for --handwriting.
import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync } from "node:fs";
import { dirname, extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { readWork, tagWork, TAGGING_PROMPT_VERSION } from "../src/lib/work-tagging.ts";
import { flattenSyllabus } from "../../shared/syllabusPoints.ts";

const here = dirname(fileURLToPath(import.meta.url));
const { values: args } = parseArgs({
  options: {
    data: { type: "string", default: join(here, "data") },
    runs: { type: "string", default: "5" },
    model: { type: "string", default: "gpt-5-mini" },
    effort: { type: "string", default: "minimal" },
    limit: { type: "string" },
    note: { type: "string", default: "" },
    accuracy: { type: "boolean", default: false },
    consistency: { type: "boolean", default: false },
    handwriting: { type: "boolean", default: false },
    cost: { type: "boolean", default: false },
  },
});
const modes = ["accuracy", "consistency", "handwriting", "cost"].filter((mode) => args[mode]);
if (modes.length === 0) modes.push("accuracy", "cost");

const KEY = process.env.OPENAI_API_KEY;
if (!KEY) {
  console.error("Set OPENAI_API_KEY.");
  process.exit(1);
}
const BASE = (process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, "");

// Same estimate as lib/openai.ts: USD per million tokens (input, cached, output).
const PRICES = {
  "gpt-5": [1.25, 0.125, 10],
  "gpt-5-mini": [0.25, 0.025, 2],
  "gpt-5-nano": [0.05, 0.005, 0.4],
  "gpt-4o-mini": [0.15, 0.075, 0.6],
  "gpt-4.1-mini": [0.4, 0.1, 1.6],
};
const TYPES = { ".pdf": "application/pdf", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".txt": "text/plain", ".md": "text/markdown" };

const doc = JSON.parse(readFileSync(join(here, "../../shared/syllabus/qcaa-methods.json"), "utf8"));
const points = flattenSyllabus(doc);

/** A JsonCall that talks to OpenAI directly and keeps the meter running. */
function meteredCall(meter) {
  return async (step, messages, schema, reply) => {
    const reasoning = /^(o\d|gpt-5)/.test(args.model);
    const body = {
      model: args.model,
      messages,
      response_format: { type: "json_schema", json_schema: { name: schema.name, strict: true, schema: schema.schema } },
      ...(reasoning
        ? { max_completion_tokens: reply + 2000, reasoning_effort: args.effort }
        : { max_tokens: reply, temperature: 0.3 }),
    };
    const started = Date.now();
    const response = await fetch(`${BASE}/chat/completions`, {
      method: "POST",
      headers: { authorization: `Bearer ${KEY}`, "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    meter.ms += Date.now() - started;
    if (!response.ok) throw new Error(`OpenAI ${response.status}: ${(await response.text()).slice(0, 300)}`);
    const data = await response.json();
    const usage = data.usage ?? {};
    const price = PRICES[args.model.replace(/-\d{4}-\d{2}-\d{2}$/, "")];
    const cached = usage.prompt_tokens_details?.cached_tokens ?? 0;
    if (price) meter.usd += ((usage.prompt_tokens - cached) * price[0] + cached * price[1] + usage.completion_tokens * price[2]) / 1e6;
    meter.calls += 1;
    try {
      return JSON.parse(data.choices?.[0]?.message?.content ?? "");
    } catch {
      return null;
    }
  };
}

function parseCsv(text) {
  const rows = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const cells = [];
    let cell = "";
    let quoted = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"' && line[i + 1] === '"' && quoted) {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = !quoted;
      else if (ch === "," && !quoted) {
        cells.push(cell);
        cell = "";
      } else cell += ch;
    }
    cells.push(cell);
    rows.push(cells.map((value) => value.trim()));
  }
  const [header, ...body] = rows;
  return body.map((cells) => Object.fromEntries(header.map((name, i) => [name, cells[i] ?? ""])));
}

const split = (value) => (value ? value.split(";").map((v) => v.trim()).filter(Boolean) : []);
const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const pct = (x) => (x === null ? null : Math.round(x * 1000) / 10);

function levenshtein(a, b) {
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[b.length];
}
const normalise = (text) => text.toLowerCase().replace(/\s+/g, " ").replace(/\s*([=+\-*/^(),])\s*/g, "$1").trim();

const goldPath = join(args.data, "gold.csv");
if (!existsSync(goldPath)) {
  console.error(`No ${goldPath}. See the header of this file for its format.`);
  process.exit(1);
}
let items = parseCsv(readFileSync(goldPath, "utf8"));
if (args.limit) items = items.slice(0, Number(args.limit));
const known = new Set(points.map((p) => p.id));
for (const item of items) {
  const unknown = split(item.points).filter((id) => !known.has(id));
  if (unknown.length) console.warn(`[${item.id}] gold has unknown dot points: ${unknown.join(", ")}`);
}

const perItem = [];
const meter = { ms: 0, usd: 0, calls: 0, pages: 0 };
const runs = Math.max(2, Number(args.runs) || 5);

for (const item of items) {
  const ext = extname(item.file).toLowerCase();
  const file = { bytes: readFileSync(join(args.data, item.file)), contentType: TYPES[ext], filename: `${item.id}${ext}` };
  if (!file.contentType) {
    console.warn(`[${item.id}] skipped: can't read ${ext} files`);
    continue;
  }
  const itemMeter = { ms: 0, usd: 0, calls: 0 };
  const call = meteredCall(itemMeter);
  const row = { id: item.id };
  try {
    const reading = await readWork(call, file, doc.subject);
    row.readable = Boolean(reading?.readable);
    row.kind = reading?.kind ?? null;
    row.pages = reading?.pages ?? 1;
    const tags = reading?.readable ? ((await tagWork(call, reading, points)) ?? []) : [];
    row.cost = { seconds: itemMeter.ms / 1000, usd: itemMeter.usd, calls: itemMeter.calls };

    if (modes.includes("accuracy")) {
      const gold = new Set(split(item.points));
      const got = new Set(tags.map((tag) => tag.pointId));
      const hit = [...got].filter((id) => gold.has(id)).length;
      const union = new Set([...gold, ...got]).size;
      row.accuracy = {
        gold: [...gold],
        predicted: tags.map((tag) => `${tag.pointId}:${tag.quality}`),
        hit,
        precision: got.size ? hit / got.size : gold.size ? 0 : 1,
        recall: gold.size ? hit / gold.size : 1,
        jaccard: union ? hit / union : 1,
        exact: hit === gold.size && hit === got.size,
      };
      const goldQuality = split(item.quality).map(Number);
      if (goldQuality.length) {
        const byPoint = new Map(split(item.points).map((id, i) => [id, goldQuality[i]]));
        const diffs = tags.filter((tag) => byPoint.has(tag.pointId)).map((tag) => Math.abs(tag.quality - byPoint.get(tag.pointId)));
        row.accuracy.qualityError = mean(diffs);
      }
    }

    if (modes.includes("consistency") && reading?.readable) {
      // Same transcript marked again and again: isolates the scoring step.
      const sets = [tags];
      for (let i = 1; i < runs; i++) sets.push((await tagWork(call, reading, points)) ?? []);
      const byPoint = new Map();
      for (const set of sets) for (const tag of set) byPoint.set(tag.pointId, [...(byPoint.get(tag.pointId) ?? []), tag.quality]);
      const spreads = [...byPoint.values()].filter((qs) => qs.length > 1).map((qs) => Math.max(...qs) - Math.min(...qs));
      const ids = sets.map((set) => new Set(set.map((tag) => tag.pointId)));
      const pairs = [];
      for (let i = 0; i < ids.length; i++)
        for (let j = i + 1; j < ids.length; j++) {
          const inter = [...ids[i]].filter((id) => ids[j].has(id)).length;
          const uni = new Set([...ids[i], ...ids[j]]).size;
          pairs.push(uni ? inter / uni : 1);
        }
      row.consistency = {
        runs,
        maxSpread: spreads.length ? Math.max(...spreads) : 0,
        meanSpread: mean(spreads) ?? 0,
        tagAgreement: mean(pairs),
      };
    }

    if (modes.includes("handwriting")) {
      const path = join(args.data, "transcripts", `${item.id}.txt`);
      if (existsSync(path) && reading) {
        const gold = normalise(readFileSync(path, "utf8"));
        const got = normalise(reading.transcript);
        row.handwriting = { cer: gold.length ? levenshtein(got, gold) / gold.length : 0, chars: gold.length };
      }
    }
  } catch (error) {
    row.error = String(error?.message ?? error);
  }
  // Cost is one pass (read + tag); consistency re-runs aren't what a student's upload costs.
  meter.ms += row.cost?.seconds ? row.cost.seconds * 1000 : 0;
  meter.usd += row.cost?.usd ?? 0;
  meter.calls += row.cost?.calls ?? 0;
  meter.pages += row.pages ?? 1;
  perItem.push(row);
  console.log(
    `[${item.id}]`,
    row.error ??
      [
        row.accuracy && `P ${pct(row.accuracy.precision)}% R ${pct(row.accuracy.recall)}%`,
        row.consistency && `spread ${row.consistency.maxSpread}`,
        row.handwriting && `CER ${pct(row.handwriting.cer)}%`,
        `${row.cost?.seconds.toFixed(1)}s $${row.cost?.usd.toFixed(4)}`,
      ]
        .filter(Boolean)
        .join(" · "),
  );
}

const ok = perItem.filter((row) => !row.error);
const acc = ok.filter((row) => row.accuracy).map((row) => row.accuracy);
const totalHit = acc.reduce((s, a) => s + a.hit, 0);
const totalPred = acc.reduce((s, a) => s + a.predicted.length, 0);
const totalGold = acc.reduce((s, a) => s + a.gold.length, 0);
const precision = totalPred ? totalHit / totalPred : null;
const recall = totalGold ? totalHit / totalGold : null;
const summary = {
  promptVersion: TAGGING_PROMPT_VERSION,
  model: args.model,
  effort: args.effort,
  date: new Date().toISOString(),
  note: args.note,
  items: perItem.length,
  errors: perItem.length - ok.length,
  accuracy: acc.length
    ? {
        precision: pct(precision),
        recall: pct(recall),
        f1: precision !== null && recall !== null && precision + recall > 0 ? pct((2 * precision * recall) / (precision + recall)) : null,
        agreement: pct(mean(acc.map((a) => a.jaccard))),
        exactMatch: pct(mean(acc.map((a) => (a.exact ? 1 : 0)))),
        qualityError: mean(acc.filter((a) => a.qualityError != null).map((a) => a.qualityError)),
      }
    : null,
  consistency: ok.some((row) => row.consistency)
    ? {
        runs,
        maxSpread: Math.max(...ok.filter((row) => row.consistency).map((row) => row.consistency.maxSpread)),
        meanSpread: mean(ok.filter((row) => row.consistency).map((row) => row.consistency.meanSpread)),
        tagAgreement: pct(mean(ok.filter((row) => row.consistency).map((row) => row.consistency.tagAgreement))),
      }
    : null,
  handwriting: ok.some((row) => row.handwriting)
    ? { cer: pct(mean(ok.filter((row) => row.handwriting).map((row) => row.handwriting.cer))) }
    : null,
  cost: {
    secondsPerPage: meter.pages ? Math.round((meter.ms / 1000 / meter.pages) * 10) / 10 : null,
    centsPerPage: meter.pages ? Math.round((meter.usd * 100 * 1000) / meter.pages) / 1000 : null,
    pages: meter.pages,
    calls: meter.calls,
  },
};

const outDir = join(here, "results");
mkdirSync(outDir, { recursive: true });
const stamp = summary.date.slice(0, 16).replace(/[:T]/g, "-");
writeFileSync(join(outDir, `${TAGGING_PROMPT_VERSION}-${stamp}.json`), JSON.stringify({ summary, items: perItem }, null, 2));

const table = join(outDir, "iterations.md");
if (!existsSync(table)) {
  writeFileSync(
    table,
    "# Tagger iterations\n\nOne row per eval run. Accuracy is against the tutor's tags; spread is the largest gap between quality scores for the same work over repeated runs.\n\n| Date | Prompt | Model | Items | Precision | Recall | F1 | Agreement | Exact | Max spread | Tag agreement | CER | s/page | ¢/page | Note |\n|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|\n",
  );
}
const cell = (value, suffix = "") => (value === null || value === undefined ? "–" : `${typeof value === "number" ? Math.round(value * 10) / 10 : value}${suffix}`);
appendFileSync(
  table,
  `| ${summary.date.slice(0, 10)} | ${summary.promptVersion} | ${summary.model} (${summary.effort}) | ${summary.items} | ${cell(summary.accuracy?.precision, "%")} | ${cell(summary.accuracy?.recall, "%")} | ${cell(summary.accuracy?.f1, "%")} | ${cell(summary.accuracy?.agreement, "%")} | ${cell(summary.accuracy?.exactMatch, "%")} | ${cell(summary.consistency?.maxSpread)} | ${cell(summary.consistency?.tagAgreement, "%")} | ${cell(summary.handwriting?.cer, "%")} | ${cell(summary.cost.secondsPerPage)} | ${cell(summary.cost.centsPerPage)} | ${summary.note.replace(/\|/g, "/")} |\n`,
);
console.log("\n", JSON.stringify(summary, null, 2));
