// Prints the INSERT statements that load a shared syllabus into syllabus_points.
//   node scripts/syllabus-seed.mjs ../shared/syllabus/qcaa-methods.json >> migrations/00xx_….sql
// Ids come from each point's place in the file (see shared/syllabusPoints.ts),
// so re-running after an append only adds rows.
import { readFileSync } from "node:fs";
import { flattenSyllabus } from "../../shared/syllabusPoints.ts";

const file = process.argv[2];
if (!file) {
  console.error("usage: node scripts/syllabus-seed.mjs <syllabus.json>");
  process.exit(1);
}
const doc = JSON.parse(readFileSync(file, "utf8"));
const sql = (value) => (typeof value === "number" ? String(value) : `'${String(value).replace(/'/g, "''")}'`);

console.log(`-- ${doc.subject}: ${doc.source}`);
console.log(`-- ${doc.attribution}`);
for (const p of flattenSyllabus(doc)) {
  const values = [p.id, p.syllabus, p.unit, p.unitTitle, p.topic, p.topicTitle, p.subtopic, p.text, p.hours, p.position].map(sql);
  console.log(
    `INSERT OR REPLACE INTO syllabus_points (id, syllabus, unit, unit_title, topic, topic_title, subtopic, text, hours, position) VALUES (${values.join(", ")});`,
  );
}
