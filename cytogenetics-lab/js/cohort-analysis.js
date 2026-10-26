/**
 * Cohort analysis over many written karyotypes: gain and loss frequency per
 * band, recurrent abnormalities, recurrent breakpoints, partner chromosome
 * pairs, and complexity. Every case goes through the same whole-karyotype
 * engine as a single formula, so a cohort plot and a single analysis agree.
 *
 * Input is text the reader supplies (one formula per line, or a TSV/CSV export
 * such as a Mitelman Database search result). Nothing is downloaded or stored.
 */

import { ORDER, analyzeFormula } from "./karyotype-analysis.js";

const KARYOTYPE_COLUMNS = [/^karyshort$/i, /^karyotype$/i, /^cloneshort$/i, /karyotype/i, /^iscn$/i, /iscn/i, /formula/i, /kary/i, /clone/i];
const CASE_COLUMNS = [/^caseno$/i, /^case[_ ]?id$/i, /^refno$/i, /^case$/i, /^id$/i];
const GROUP_COLUMNS = [/morph/i, /diagnos/i, /disease/i, /^group$/i, /topo/i];
const REF_COLUMNS = [/^refno$/i];

function parseDelimited(text, delimiter) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') { field += '"'; i += 1; }
      else if (char === '"') quoted = false;
      else field += char;
      continue;
    }
    if (char === '"' && field === "") { quoted = true; continue; }
    if (char === delimiter) { row.push(field); field = ""; continue; }
    if (char === "\n" || char === "\r") {
      if (char === "\r" && text[i + 1] === "\n") i += 1;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      continue;
    }
    field += char;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows.filter((cells) => cells.some((cell) => cell.trim()));
}

function findColumn(header, patterns) {
  for (const pattern of patterns) {
    const index = header.findIndex((cell) => pattern.test(cell.trim()));
    if (index >= 0) return index;
  }
  return -1;
}

/**
 * Read cohort text into records { id, formula, group }. A header row with a
 * karyotype column is used when present; otherwise each line is one formula.
 */
export function parseCohortText(text) {
  const raw = String(text || "").replace(/^\uFEFF/, "");
  const firstLine = raw.split(/\r?\n/, 1)[0] || "";
  const delimiter = firstLine.includes("\t") ? "\t" : (/^[^,]*[a-z][^,]*,/i.test(firstLine) && !/^\s*\d/.test(firstLine) ? "," : null);
  if (delimiter) {
    const rows = parseDelimited(raw, delimiter);
    const header = rows[0] || [];
    const karyotype = findColumn(header, KARYOTYPE_COLUMNS);
    if (karyotype >= 0) {
      const caseColumn = findColumn(header, CASE_COLUMNS);
      const refColumn = findColumn(header, REF_COLUMNS);
      const groupColumn = findColumn(header, GROUP_COLUMNS);
      const perClone = /clone/i.test(header[karyotype]) && !/kary/i.test(header[karyotype]);
      const byCase = new Map();
      rows.slice(1).forEach((cells, index) => {
        const formula = String(cells[karyotype] || "").trim();
        if (!formula) return;
        const caseId = caseColumn >= 0 ? `${refColumn >= 0 && refColumn !== caseColumn ? `${cells[refColumn]}:` : ""}${cells[caseColumn]}` : `row ${index + 2}`;
        const group = groupColumn >= 0 ? String(cells[groupColumn] || "").trim() : "";
        const existing = byCase.get(caseId);
        if (existing && perClone) existing.formula = `${existing.formula}/${formula}`;
        else if (!existing) byCase.set(caseId, { id: caseId, formula, group });
      });
      return {
        format: delimiter === "\t" ? "tsv" : "csv",
        column: header[karyotype],
        groupColumn: groupColumn >= 0 ? header[groupColumn] : "",
        records: [...byCase.values()],
      };
    }
  }
  const records = raw.split(/\r?\n/).map((line) => line.trim()).filter((line) => line && !line.startsWith("#"))
    .map((formula, index) => ({ id: `line ${index + 1}`, formula, group: "" }));
  return { format: "lines", column: "", groupColumn: "", records };
}

/** Groups present in a record list, largest first. */
export function cohortGroups(records) {
  const counts = new Map();
  for (const record of records) if (record.group) counts.set(record.group, (counts.get(record.group) || 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([name, count]) => ({ name, count }));
}

function bump(map, key, extra = {}) {
  const entry = map.get(key) || { key, cases: 0, ...extra };
  entry.cases += 1;
  map.set(key, entry);
}

function structuralKey(item) {
  return String(item.variant || item.token).replace(/^[+-]/, "");
}

function bandGroup(label) {
  return String(label).replace(/(\d+|X|Y)([pq]\d+)(?:\.\d+)?/i, "$1$2");
}

function ranked(map, total) {
  return [...map.values()].map((entry) => ({ ...entry, percent: total ? entry.cases / total * 100 : 0 }))
    .sort((a, b) => b.cases - a.cases || String(a.key).localeCompare(String(b.key), "en", { numeric: true }));
}

/**
 * Analyze a cohort. clones: "any" counts a change when any clone carries it;
 * "stemline" uses the first clone only. Each case counts once per feature.
 */
export function analyzeCohort(maps, records, { clones = "any" } = {}) {
  const bandFreq = new Map(ORDER.map((id) => [id, (maps?.chromosomes?.[id]?.segments || []).map((segment) => ({ segment, gain: 0, loss: 0 }))]));
  const abnormalities = new Map();
  const breakpoints = new Map();
  const breakpointGroups = new Map();
  const partners = new Map();
  const complexity = { buckets: [0, 0, 0, 0, 0, 0], complex: 0, monosomal: 0 };
  const unreadable = [];
  let analyzed = 0;
  let unresolvedCases = 0;
  let multiClone = 0;

  for (const record of records) {
    const analysis = analyzeFormula(maps, record.formula, { skipSuggestions: true });
    if (analysis.status !== "ok" || !analysis.clones.length) {
      unreadable.push(record);
      continue;
    }
    analyzed += 1;
    if (analysis.clones.length > 1) multiClone += 1;
    const used = clones === "stemline" ? analysis.clones.slice(0, 1) : analysis.clones;
    const gains = new Set();
    const losses = new Set();
    const seenAbn = new Set();
    const seenBp = new Set();
    const seenGroup = new Set();
    const seenPair = new Set();
    let unresolved = false;
    let maxAbn = 0;
    let complex = false;
    let monosomal = false;
    for (const clone of used) {
      for (const run of clone.imbalances || []) {
        if (run.partial || run.usual) continue;
        const segments = bandFreq.get(run.chromosome) || [];
        let inside = false;
        for (let i = 0; i < segments.length; i += 1) {
          const segment = segments[i].segment;
          if (segment === run.from || segment.id === run.from.id) inside = true;
          if (inside && segment.role !== "centromere") (run.delta > 0 ? gains : losses).add(`${run.chromosome}|${i}`);
          if (segment === run.to || segment.id === run.to.id) break;
        }
      }
      for (const item of clone.items || []) {
        if (item.kind === "annotation") continue;
        const key = item.kind === "numerical" ? item.token : structuralKey(item);
        if (!seenAbn.has(key)) { seenAbn.add(key); bump(abnormalities, key, { kind: item.kind === "numerical" ? "numerical" : "structural", type: item.type || "" }); }
        const ids = [...new Set((item.chromosomes || []).map(String).filter((id) => ORDER.includes(id)))];
        if (item.kind !== "numerical" && ids.length >= 2) {
          const pair = ids.sort((a, b) => ORDER.indexOf(a) - ORDER.indexOf(b)).join(";");
          if (!seenPair.has(pair)) { seenPair.add(pair); bump(partners, pair); }
        }
      }
      for (const row of clone.breakpoints || []) {
        if (!seenBp.has(row.band)) { seenBp.add(row.band); bump(breakpoints, row.band, { chromosome: row.chromosome }); }
        const group = bandGroup(row.band);
        if (!seenGroup.has(group)) { seenGroup.add(group); bump(breakpointGroups, group, { chromosome: row.chromosome }); }
      }
      if (clone.unresolved?.length) unresolved = true;
      maxAbn = Math.max(maxAbn, clone.complexity?.abnormalities || 0);
      complex = complex || Boolean(clone.complexity?.complex);
      monosomal = monosomal || Boolean(clone.complexity?.monosomal);
    }
    for (const key of gains) { const [id, i] = key.split("|"); bandFreq.get(id)[Number(i)].gain += 1; }
    for (const key of losses) { const [id, i] = key.split("|"); bandFreq.get(id)[Number(i)].loss += 1; }
    complexity.buckets[Math.min(5, maxAbn)] += 1;
    if (complex) complexity.complex += 1;
    if (monosomal) complexity.monosomal += 1;
    if (unresolved) unresolvedCases += 1;
  }

  const chromosomeSummary = ORDER.map((id) => {
    const rows = bandFreq.get(id) || [];
    return {
      id,
      maxGain: Math.max(0, ...rows.map((row) => row.gain)),
      maxLoss: Math.max(0, ...rows.map((row) => row.loss)),
    };
  });

  return {
    total: records.length,
    analyzed,
    unreadable,
    multiClone,
    unresolvedCases,
    clones,
    bandFreq,
    chromosomeSummary,
    abnormalities: ranked(abnormalities, analyzed),
    breakpoints: ranked(breakpoints, analyzed),
    breakpointGroups: ranked(breakpointGroups, analyzed),
    partners: ranked(partners, analyzed),
    complexity,
  };
}

/** Band-level frequency table as CSV text. */
export function cohortCSV(cohort) {
  const lines = ["chromosome,band,start_bp,end_bp,gain_cases,loss_cases,gain_percent,loss_percent"];
  for (const id of ORDER) {
    for (const row of cohort.bandFreq.get(id) || []) {
      if (row.segment.role === "centromere") continue;
      const pct = (value) => (cohort.analyzed ? (value / cohort.analyzed * 100).toFixed(1) : "0");
      lines.push([id, row.segment.label, row.segment.start_bp, row.segment.end_bp, row.gain, row.loss, pct(row.gain), pct(row.loss)].join(","));
    }
  }
  return `${lines.join("\n")}\n`;
}
