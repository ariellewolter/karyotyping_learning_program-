/**
 * Check del/dup band spans against the stored GRCh38 map.
 * Published Illumina examples that fit GRCh38 must match.
 * Exact bands in stored formulas must round-trip. Broader band names are reported and kept.
 */
import { readdirSync, readFileSync } from "node:fs";
import { copyNumberSpan, explainCopyNumberText } from "../js/band-span.js";

const read = (path) => JSON.parse(readFileSync(new URL(path, import.meta.url)));
const maps = read("../data/chromosome-maps.json");

const published = [
  ["8", 1, 19200001, "deletion", "del(8)(p21.3)"],
  ["8", 1, 19200001, "duplication", "dup(8)(p21.3)"],
  ["8", 19200001, 135400001, "deletion", "del(8)(p21.3q24.23)"],
  ["8", 19200001, 135400001, "duplication", "dup(8)(p21.3q24.23)"],
  ["8", 127300001, 131500000, "duplication", "dup(8)(q24.21q24.22)"],
  ["8", 127300001, 131500000, "copy number gain", "dup(8)(q24.21q24.22)"],
  ["8", 128746677, 128749160, "duplication", "dup(8)(q24.21q24.21)"],
  ["8", 128746677, 128749160, "copy number gain", "dup(8)(q24.21q24.21)"],
  ["8", 135400001, 138900001, "duplication", "dup(8)(q24.23q24.3)"],
  ["8", 135400001, 145138635, "duplication", "dup(8)(q24.23q24.3)"],
  ["8", 135400001, 138900001, "copy number loss", "del(8)(q24.23q24.3)"],
  ["8", 135400001, 146364022, "deletion", null],
  ["8", 135400001, 146364022, "duplication", null],
  ["X", 86200001, 103700000, "copy number loss", "del(X)(q21.2q22.2)", "del(X)(q21.31q22.2)"],
  ["X", 86200001, 103700000, "deletion", "del(X)(q21.2q22.2)", "del(X)(q21.31q22.2)"],
];

let failed = 0;

console.log("Published intervals");
for (const [chromosome, start, end, change, expected, publishedForm] of published) {
  const span = copyNumberSpan(maps, { chromosome, start, end, change });
  if (expected == null) {
    const outside = span.status === "out-of-range";
    console.log(`${outside ? "PASS" : "FAIL"}  chr${chromosome}:${start}-${end} is outside GRCh38 (${span.status})`);
    if (!outside) failed += 1;
    continue;
  }
  const ok = span.notation === expected;
  const note = publishedForm && publishedForm !== expected ? `  published ${publishedForm} uses a different band boundary` : "";
  console.log(`${ok ? "PASS" : "FAIL"}  ${expected}  got ${span.notation || span.status}${note}`);
  if (!ok) failed += 1;
}

function stringsIn(value, found = []) {
  if (typeof value === "string") {
    if (/\b(del|dup)\(/i.test(value)) found.push(value);
    return found;
  }
  if (Array.isArray(value)) {
    value.forEach((item) => stringsIn(item, found));
    return found;
  }
  if (value && typeof value === "object") {
    Object.values(value).forEach((item) => stringsIn(item, found));
  }
  return found;
}

console.log("\nStored formulas");
const files = [
  ...readdirSync(new URL("../data/cases/", import.meta.url)).filter((name) => name.endsWith(".json")).map((name) => `../data/cases/${name}`),
  "../data/diseases.json",
];
const counts = { match: 0, group: 0, arm: 0, mismatch: 0, unmapped: 0 };
for (const file of files) {
  const data = read(file);
  const seen = new Set();
  for (const text of stringsIn(data)) {
    for (const note of explainCopyNumberText(maps, text)) {
      const key = `${file}|${note.token}|${note.status}`;
      if (seen.has(key)) continue;
      seen.add(key);
      counts[note.status] = (counts[note.status] || 0) + 1;
      const label = note.status === "mismatch" || note.status === "unmapped" ? "FAIL" : "OK";
      console.log(`${label}  ${note.status}  ${file.replace("../", "")}  ${note.token}${note.notation && note.notation !== note.token ? `  → ${note.notation}` : ""}`);
      if (note.status === "mismatch" || note.status === "unmapped") failed += 1;
    }
  }
}
console.log(counts);
if (failed) {
  console.error(`\n${failed} band-span check${failed === 1 ? "" : "s"} failed.`);
  process.exit(1);
}
console.log("\nBand-span checks passed.");
