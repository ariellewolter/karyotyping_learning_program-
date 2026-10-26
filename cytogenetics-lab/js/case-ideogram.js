/**
 * Sites to mark on a case ideogram.
 * Read from a written ISCN formula and the imported disease record.
 * Band names come from the stored GRCh38 cytoband map.
 */
import { analyzeFormula } from "./case-analysis.js";

export const CHROMOSOME_ORDER = [...Array.from({ length: 22 }, (_, index) => String(index + 1)), "X", "Y"];

export function genomeIssues(formula, disease) {
  const analysis = analyzeFormula(formula);
  const issues = [];
  for (const event of analysis.gains || []) addIssue(issues, eventIssue(event, "gain"));
  for (const event of analysis.losses || []) addIssue(issues, eventIssue(event, "loss"));
  for (const event of analysis.breakpoints || []) {
    addIssue(issues, {
      chromosome: event.chromosome,
      location: event.band || event.chromosome,
      effect: "Breakpoint",
      detail: event.token,
      origin: "ISCN",
    });
  }
  if (disease) addDiseaseIssues(issues, disease);
  const chromosomes = [...new Set(issues.map((issue) => issue.chromosome).filter((id) => CHROMOSOME_ORDER.includes(id)))];
  return {
    formula: analysis.raw || String(formula || "").trim(),
    readable: analysis.status !== "empty" && analysis.status !== "unsupported",
    issues,
    chromosomes,
  };
}

export function segmentsFor(maps, chromosome) {
  return (maps?.chromosomes?.[String(chromosome)]?.segments || []).filter((segment) => segment && segment.role !== "centromere");
}

export function matchingBands(segments, chromosome, location) {
  const list = (segments || []).filter((segment) => String(segment.chromosome) === String(chromosome));
  const text = String(location || "").trim();
  if (!list.length) return [];
  if (!text || /whole chromosome/i.test(text) || text === String(chromosome)) return list;
  const matched = new Set();
  for (const part of text.split(/[–—;]/).map((item) => item.trim()).filter(Boolean)) {
    const arm = part.match(/^(?:(?:X|Y|\d+)?([pq]))(?:\s*arm)?$/i);
    if (arm) {
      list.filter((segment) => segment.arm === arm[1].toLowerCase()).forEach((segment) => matched.add(segment.id));
      continue;
    }
    const written = part.match(/((?:X|Y|\d+)[pq]\d+(?:\.\d+)?)/i)?.[1]
      || (part.match(/^([pq]\d+(?:\.\d+)?)/i) ? `${chromosome}${part.match(/^([pq]\d+(?:\.\d+)?)/i)[1]}` : "");
    if (!written) continue;
    list.filter((segment) => bandCovers(written, segment)).forEach((segment) => matched.add(segment.id));
  }
  return list.filter((segment) => matched.has(segment.id));
}

export function issueBands(maps, issue) {
  return matchingBands(segmentsFor(maps, issue.chromosome), issue.chromosome, issue.location);
}

function eventIssue(event, kind) {
  return {
    chromosome: event.chromosome,
    location: event.where || event.chromosome,
    effect: effectFor(event.token, kind),
    detail: event.token,
    origin: "ISCN",
  };
}

function addDiseaseIssues(issues, disease) {
  const chromosomes = (disease.chromosomes || []).map(String).filter((id) => CHROMOSOME_ORDER.includes(id));
  const chromosome = chromosomes[0] || "";
  const raw = String(disease.locus || disease.region || "whole chromosome").trim();
  const location = raw === chromosome || /^(X|Y|\d+)$/.test(raw) ? "whole chromosome" : bandish(raw, chromosome);
  if (!chromosome || !location) return;
  const detail = [disease.visual, disease.missing && disease.missing !== "None" ? `Missing: ${disease.missing}` : "", disease.added && disease.added !== "None" ? `Added: ${disease.added}` : "", disease.mechanism]
    .filter(Boolean)
    .join(" ");
  addIssue(issues, {
    chromosome,
    location: bandish(location, chromosome),
    effect: effectFor(disease.abnormality, disease.abnormality),
    detail: detail || disease.interpretation || disease.caseTitle || "",
    origin: "Imported disease record",
  });
}

function bandish(location, chromosome) {
  const text = String(location || "").trim();
  if (/^[pq]\d/i.test(text)) return `${chromosome}${text}`;
  return text;
}

function effectFor(token, kind) {
  const text = String(token || "");
  if (/deletion/i.test(text) || /^del\(/i.test(text)) return "Deletion";
  if (/duplication/i.test(text) || /^dup\(/i.test(text)) return "Duplication";
  if (/inversion/i.test(text) || /^inv\(/i.test(text)) return "Inversion";
  if (/isochromosome/i.test(text) || /^i\(/i.test(text)) return "Isochromosome";
  if (/translocation|derivative/i.test(text) || /^(t|der)\(/i.test(text)) return kind === "breakpoint" ? "Breakpoint" : "Translocation";
  if (/whole-chromosome gain|trisomy|\bextra\b/i.test(text) || (kind === "gain" && text.startsWith("+"))) return "Gain of a whole chromosome";
  if (/monosomy|whole-chromosome loss/i.test(text) || (kind === "loss" && text.startsWith("-"))) return "Loss of a whole chromosome";
  if (kind === "gain") return "Gain of material";
  if (kind === "loss") return "Loss of material";
  if (kind === "breakpoint") return "Breakpoint";
  return "Structural change";
}

function addIssue(issues, issue) {
  if (!issue?.chromosome) return;
  const key = `${issue.chromosome}|${issue.location}|${issue.effect}`;
  const found = issues.find((item) => item.key === key);
  if (found) {
    if (issue.origin && !found.origins.includes(issue.origin)) found.origins.push(issue.origin);
    if (issue.detail && !found.details.includes(issue.detail)) found.details.push(issue.detail);
    return;
  }
  issues.push({
    ...issue,
    key,
    origins: [issue.origin].filter(Boolean),
    details: [issue.detail].filter(Boolean),
  });
}

export const WHOLE_CHROMOSOME_EFFECTS = ["Gain of a whole chromosome", "Loss of a whole chromosome"];

function allSegments(maps, chromosome) {
  return (maps?.chromosomes?.[String(chromosome)]?.segments || []).filter(Boolean);
}

/**
 * A written band position on one chromosome: "p15.2", "5p15.2", "pter", "qter", or "cen".
 * Returns its base-pair interval, or an error naming what was not found. Nothing is guessed.
 */
export function resolveBand(maps, chromosome, written) {
  const id = String(chromosome);
  const segments = allSegments(maps, id);
  const raw = String(written || "").trim().replace(/\s+/g, "");
  if (!segments.length) return { error: `No band map is stored for chromosome ${id}.` };
  if (!raw) return { error: "Enter a band." };
  const text = raw.replace(new RegExp(`^(?:chr)?${id}(?=[pq]|cen)`, "i"), "").toLowerCase();
  const arm = (letter) => segments.filter((segment) => segment.arm === letter && segment.gie_stain !== "acen");
  const span = (list, label) => list.length
    ? { start: Math.min(...list.map((segment) => segment.start_bp)), end: Math.max(...list.map((segment) => segment.end_bp)), label }
    : { error: `${id}${label} is not in the stored map.` };
  if (text === "pter") { const list = arm("p"); return list.length ? { start: Math.min(...list.map((s) => s.start_bp)), end: Math.min(...list.map((s) => s.start_bp)), label: "pter" } : { error: `Chromosome ${id} has no stored p-arm bands.` }; }
  if (text === "qter") { const list = arm("q"); return list.length ? { start: Math.max(...list.map((s) => s.end_bp)), end: Math.max(...list.map((s) => s.end_bp)), label: "qter" } : { error: `Chromosome ${id} has no stored q-arm bands.` }; }
  if (text === "cen") return span(segments.filter((segment) => segment.gie_stain === "acen"), "cen");
  if (!/^[pq]\d+(?:\.\d+)?$/.test(text)) return { error: `"${raw}" is not a band. Use a form such as p15.2, q21, pter, qter, or cen.` };
  return span(segments.filter((segment) => bandCovers(`${id}${text}`, segment)), text);
}

/** Display text for a mark, e.g. "whole chromosome 21", "5p15.2→pter", "9q34.1". */
export function markLocation(mark) {
  if (WHOLE_CHROMOSOME_EFFECTS.includes(mark.effect) || mark.whole) return `whole chromosome ${mark.chromosome}`;
  if (mark.from && mark.to && mark.from !== mark.to) return `${mark.chromosome}${mark.from}→${mark.to}`;
  if (mark.from) return `${mark.chromosome}${mark.from}`;
  return String(mark.location || "");
}

/** Bands covered by a student mark: the whole chromosome, a from→to range, or a single band. */
export function markBands(maps, mark) {
  const segments = segmentsFor(maps, mark.chromosome);
  if (WHOLE_CHROMOSOME_EFFECTS.includes(mark.effect) || mark.whole) return segments;
  if (mark.from) {
    const a = resolveBand(maps, mark.chromosome, mark.from);
    const b = resolveBand(maps, mark.chromosome, mark.to || mark.from);
    if (a.error || b.error) return [];
    const lo = Math.min(a.start, b.start);
    const hi = Math.max(a.end, b.end);
    return segments.filter((segment) => (lo === hi ? segment.start_bp <= lo && segment.end_bp >= hi : segment.end_bp > lo && segment.start_bp < hi));
  }
  return matchingBands(segments, mark.chromosome, mark.location);
}

const STAIN_FILL = { gneg: "#ffffff", gpos25: "#c8ccd2", gpos50: "#8d96a3", gpos75: "#4e5866", gpos100: "#111821", gvar: "#a9b8c9", stalk: "#dfe6ee", acen: "#7f8c9b" };

/**
 * Genome-wide view: every chromosome as a horizontal bar to scale, like a genome ideogram viewer.
 * marked: Set of band ids the student marked. read: Set of band ids read from the formula or record.
 */
export function genomeSVG(maps, { marked = new Set(), read = new Set(), involved = new Set(), selected = "", selectedBand = "", width = 760, interactive = false } = {}) {
  const rows = CHROMOSOME_ORDER.map((id) => ({ id, segments: allSegments(maps, id) })).filter((row) => row.segments.length);
  if (!rows.length) return "";
  const longest = Math.max(...rows.map((row) => Math.max(...row.segments.map((segment) => segment.end_bp))));
  const left = 46;
  const usable = width - left - 8;
  const rowH = 21;
  const barH = 10;
  const scale = (bp) => left + (bp / longest) * usable;
  const body = rows.map((row, index) => {
    const y = 9 + index * rowH;
    const focus = row.id === selected;
    const touched = involved.has(row.id);
    const bars = row.segments.map((segment) => {
      const x = scale(segment.start_bp);
      const w = Math.max(0.6, scale(segment.end_bp) - x);
      const hit = marked.has(segment.id) ? "your" : read.has(segment.id) ? "read" : "";
      const attrs = interactive ? ` data-seg="${segment.id}" data-chromosome="${row.id}"` : "";
      const band = `<rect x="${x.toFixed(1)}" y="${y}" width="${w.toFixed(1)}" height="${barH}" fill="${STAIN_FILL[segment.gie_stain] || "#fff"}" stroke="#56606c" stroke-width="0.4"${attrs}><title>${segment.id} · ${segment.gie_stain}</title></rect>`;
      const color = hit === "your" ? "#c0392b" : "#d68910";
      const overlay = hit ? `<rect x="${x.toFixed(1)}" y="${y}" width="${w.toFixed(1)}" height="${barH}" fill="${color}" fill-opacity="0.45" pointer-events="none"/><rect x="${x.toFixed(1)}" y="${y - 5}" width="${w.toFixed(1)}" height="4" fill="${color}" pointer-events="none"/>` : "";
      const pick = segment.id === selectedBand ? `<rect x="${(x - 0.8).toFixed(1)}" y="${y - 1}" width="${(w + 1.6).toFixed(1)}" height="${barH + 2}" fill="none" stroke="#138d99" stroke-width="1.6" pointer-events="none"/>` : "";
      return band + overlay + pick;
    }).join("");
    const end = scale(Math.max(...row.segments.map((segment) => segment.end_bp)));
    const frame = focus ? `<rect x="${left - 3}" y="${y - 4}" width="${(end - left + 6).toFixed(1)}" height="${barH + 8}" rx="3" fill="#eef8f7" stroke="#138d99" stroke-width="1"/>` : "";
    const label = `<text x="${left - 6}" y="${y + barH - 1}" text-anchor="end" font-size="10" font-family="Helvetica, Arial, sans-serif" font-weight="${touched || focus ? 700 : 400}" fill="${touched ? "#b03a2e" : "#243044"}"${interactive ? ` data-chromosome="${row.id}" style="cursor:pointer"` : ""}>chr${row.id}</text>`;
    return frame + label + bars;
  }).join("");
  const height = 12 + rows.length * rowH;
  return `<svg xmlns="http://www.w3.org/2000/svg" class="genome-ideogram" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-label="Genome ideogram of all chromosomes. Red: your marks. Amber: read from the written formula or record.">${body}</svg>`;
}

function bandCovers(target, segment) {
  const names = [segment.id, segment.label, segment.parent_band, segment.parent_region].filter(Boolean).map(String);
  return names.some((name) => name === target || name.startsWith(`${target}.`) || target.startsWith(`${name}.`));
}
