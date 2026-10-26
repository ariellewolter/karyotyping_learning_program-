/**
 * Read gains, losses, and breakpoints from a written ISCN formula.
 * The source text is not rewritten, and the photograph is not read.
 */
import { exploreISCN } from "./iscn.js";

const ORDER = [...Array.from({ length: 22 }, (_, index) => String(index + 1)), "X", "Y"];

export function analyzeFormula(text) {
  const report = exploreISCN(text);
  const gains = [];
  const losses = [];
  const breakpoints = [];
  if (!report || report.status === "empty" || report.status === "unsupported") {
    return { status: report?.status || "empty", raw: report?.raw || "", prefix: "", lines: [], gains, losses, breakpoints };
  }
  report.lines.forEach((line, index) => {
    const lineLabel = line.label || (report.lines.length > 1 ? `Cell line ${index + 1}` : "Stemline");
    for (const item of line.items || []) classifyItem(item, lineLabel, gains, losses, breakpoints);
  });
  return { status: report.status, raw: report.raw, prefix: report.prefix || "", lines: report.lines, gains, losses, breakpoints };
}

function classifyItem(item, line, gains, losses, breakpoints) {
  const token = item.token;
  const chromosome = String(item.chromosomes?.[0] || chromosomeOf(item.breakpoints?.[0]) || "");
  if (item.kind === "numerical") {
    const bucket = String(token).startsWith("-") ? losses : gains;
    bucket.push({ line, chromosome, where: "whole chromosome", token });
    return;
  }
  for (const band of item.breakpoints || []) {
    breakpoints.push({ line, chromosome: chromosomeOf(band) || chromosome, band, token });
  }
  if (item.type === "deletion") losses.push({ line, chromosome, where: spanText(item), token });
  else if (item.type === "duplication") gains.push({ line, chromosome, where: spanText(item), token });
  else if (item.type === "isochromosome") {
    const arm = String(item.breakpoints?.[0] || "").match(/^([pq])/i)?.[1]?.toLowerCase();
    if (arm === "q" || arm === "p") {
      gains.push({ line, chromosome, where: `${arm} arm`, token });
      losses.push({ line, chromosome, where: `${arm === "q" ? "p" : "q"} arm`, token });
    }
  }
}

function spanText(item) {
  return item.breakpoints?.length ? item.breakpoints.join("–") : "written segment";
}

function chromosomeOf(band) {
  const match = String(band || "").match(/^(X|Y|\d+)/i);
  return match ? match[1].toUpperCase() : "";
}

/** Each saved formula is counted once per written cell line. */
export function analyzeCaseSet(records) {
  const tally = new Map(ORDER.map((id) => [id, { id, gains: 0, losses: 0, breakpoints: 0 }]));
  const bands = new Map();
  let used = 0;
  let skipped = 0;
  for (const record of records || []) {
    const formula = String(record?.formula || "").trim();
    if (!formula) {
      skipped += 1;
      continue;
    }
    const analysis = analyzeFormula(formula);
    if (analysis.status === "empty" || analysis.status === "unsupported") {
      skipped += 1;
      continue;
    }
    used += 1;
    for (const event of analysis.gains) addCount(tally, event.chromosome, "gains");
    for (const event of analysis.losses) addCount(tally, event.chromosome, "losses");
    for (const event of analysis.breakpoints) {
      addCount(tally, event.chromosome, "breakpoints");
      const key = event.band || event.chromosome;
      if (!key) continue;
      const row = bands.get(key) || { band: key, count: 0 };
      row.count += 1;
      bands.set(key, row);
    }
  }
  const rows = [...tally.values()].filter((row) => row.gains || row.losses || row.breakpoints);
  const max = rows.reduce((highest, row) => Math.max(highest, row.gains, row.losses, row.breakpoints), 1);
  const bandRows = [...bands.values()]
    .sort((a, b) => b.count - a.count || a.band.localeCompare(b.band, undefined, { numeric: true }))
    .slice(0, 12);
  return { used, skipped, rows, max, bandRows };
}

function addCount(tally, chromosome, key) {
  const row = tally.get(String(chromosome || ""));
  if (row) row[key] += 1;
}
