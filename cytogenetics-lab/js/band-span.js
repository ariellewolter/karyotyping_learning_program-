/**
 * Copy-number band spans on the stored GRCh38 cytoband map.
 *
 * The writing rules are the variant-level method in Illumina Connected
 * Annotations, "ISCN-like Simple Nomenclature":
 * https://help.connected.illumina.com/annotation/v4.0/core-functionality/simple-nomenclature-notation
 *
 * A loss or deletion is del. A gain or duplication is dup. Positions are
 * 1-based and inclusive. An interval that includes the first or last base
 * of the chromosome keeps only the inner band. Any other interval writes
 * the start band and the end band, repeating the band when both ends fall
 * in it. Sample-level microarray strings (xN, hmz) and VCF fields are not
 * produced here.
 */

import { parseAbnormality, parseISCN } from "./iscn.js";
import { escapeHtml } from "./util.js";

const CHROMOSOME_RE = /^(?:[1-9]|1\d|2[0-2]|X|Y)$/;

export function formatBase(value) {
  return Number(value).toLocaleString("en-US");
}

export function chromosomeEntry(maps, chromosome) {
  const id = String(chromosome || "").replace(/^chr/i, "").toUpperCase();
  if (!CHROMOSOME_RE.test(id)) return null;
  const record = maps?.chromosomes?.[id];
  if (!record) return null;
  return { id, length_bp: record.length_bp, segments: record.segments || [] };
}

export function bandAtBase(maps, chromosome, base) {
  const record = chromosomeEntry(maps, chromosome);
  if (!record) return { status: "unknown-chromosome" };
  if (!Number.isInteger(base) || base < 1 || base > record.length_bp) {
    return { status: "out-of-range", length: record.length_bp };
  }
  const index = base - 1;
  const segment = record.segments.find((item) => item.start_bp <= index && index < item.end_bp);
  if (!segment) return { status: "unmapped", length: record.length_bp };
  if (segment.role === "centromere" || segment.arm === "cen") {
    return { status: "centromere", segment, length: record.length_bp };
  }
  return {
    status: "band",
    segment,
    band: segment.label,
    bare: bareBand(record.id, segment.label),
    length: record.length_bp,
  };
}

function bareBand(chromosome, label) {
  const text = String(label || "");
  return text.toLowerCase().startsWith(String(chromosome).toLowerCase()) ? text.slice(String(chromosome).length) : text;
}

function symbolFor(change) {
  const text = String(change || "").toLowerCase();
  if (text === "dup" || text === "duplication" || text === "gain" || text === "copy number gain") return "dup";
  if (text === "del" || text === "deletion" || text === "loss" || text === "copy number loss") return "del";
  return "";
}

function fail(status, explanation, extra = {}) {
  return { ok: false, status, notation: "", explanation, ...extra };
}

/**
 * Build del() or dup() for one genomic interval.
 * start and end are 1-based inclusive bases on the stored GRCh38 map.
 */
export function copyNumberSpan(maps, spec) {
  const symbol = symbolFor(spec?.change);
  const record = chromosomeEntry(maps, spec?.chromosome);
  if (!symbol) return fail("unsupported", "This rule writes del for a loss and dup for a gain.");
  if (!record) return fail("unknown-chromosome", `Chromosome ${spec?.chromosome || ""} is not on the stored GRCh38 map.`);
  const start = Math.trunc(Number(spec.start));
  const end = Math.trunc(Number(spec.end));
  if (!Number.isInteger(start) || !Number.isInteger(end)) {
    return fail("invalid", "Start and end need to be whole base positions.");
  }
  const low = Math.min(start, end);
  const high = Math.max(start, end);
  if (low < 1 || high > record.length_bp) {
    return fail(
      "out-of-range",
      `Bases ${formatBase(low)}–${formatBase(high)} fall outside chromosome ${record.id}, which is ${formatBase(record.length_bp)} bases long on this GRCh38 map.`,
      { chromosome: record.id, start: low, end: high },
    );
  }
  if (low === 1 && high === record.length_bp) {
    return fail(
      "whole",
      `Bases 1–${formatBase(high)} are the whole of chromosome ${record.id}. A whole-chromosome change is written with a plus or minus sign beside the chromosome name.`,
      { chromosome: record.id, start: low, end: high },
    );
  }
  const left = bandAtBase(maps, record.id, low);
  const right = bandAtBase(maps, record.id, high);
  if (left.status !== "band" || right.status !== "band") {
    const problem = left.status !== "band" ? left : right;
    const base = left.status !== "band" ? low : high;
    return fail(problem.status || "unmapped", bandProblem(problem, record.id, base), { chromosome: record.id, start: low, end: high });
  }
  const terminalStart = low === 1;
  const terminalEnd = high === record.length_bp;
  let written;
  let pattern;
  if (terminalStart) {
    written = [right.bare];
    pattern = "start";
  } else if (terminalEnd) {
    written = [left.bare];
    pattern = "end";
  } else {
    written = [left.bare, right.bare];
    pattern = left.bare === right.bare ? "repeat" : "span";
  }
  const notation = `${symbol}(${record.id})(${written.join("")})`;
  const span = {
    ok: true,
    status: "span",
    symbol,
    chromosome: record.id,
    start: low,
    end: high,
    startBand: left.band,
    endBand: right.band,
    pattern,
    notation,
  };
  return { ...span, explanation: spanExplanation(span) };
}

function bandProblem(found, chromosome, base) {
  if (found.status === "centromere") {
    return `Base ${formatBase(base)} of chromosome ${chromosome} falls in the centromere. This rule writes a G-band.`;
  }
  if (found.status === "out-of-range") {
    return `Base ${formatBase(base)} is outside chromosome ${chromosome} on this GRCh38 map.`;
  }
  return `Base ${formatBase(base)} of chromosome ${chromosome} has no G-band on this GRCh38 map.`;
}

function spanExplanation(span) {
  const range = `Bases ${formatBase(span.start)}–${formatBase(span.end)} of chromosome ${span.chromosome}`;
  if (span.pattern === "start") {
    return `${range} include the first base. The inner end falls in ${span.endBand}, so only that band is written: ${span.notation}.`;
  }
  if (span.pattern === "end") {
    return `${range} include the last base. The inner end falls in ${span.startBand}, so only that band is written: ${span.notation}.`;
  }
  if (span.pattern === "repeat") {
    return `${range} both fall in ${span.startBand}. The interval stops short of either chromosome end, so that band is written twice: ${span.notation}.`;
  }
  return `${range} fall in ${span.startBand} and ${span.endBand}. The interval stops short of either chromosome end, so both bands are written: ${span.notation}.`;
}

function abnormalitiesIn(text) {
  const raw = String(text || "").trim();
  if (!raw) return [];
  if (/^(del|dup)\(/i.test(raw)) {
    const one = parseAbnormality(raw);
    return one.type === "deletion" || one.type === "duplication" ? [one] : [];
  }
  const parsed = parseISCN(raw);
  return (parsed.cellLines || []).flatMap((line) => (line.abnormalities || []).filter((item) => item.type === "deletion" || item.type === "duplication"));
}

function armOnly(parsed) {
  const chrom = String(parsed.chromosomes?.[0] || "");
  const fused = chrom.match(/^(\d+|X|Y)([pq])$/i);
  const numbered = (parsed.bands || []).filter((band) => /[pq]\d/i.test(band));
  if (fused && !numbered.length) return { chromosome: fused[1].toUpperCase(), arm: fused[2].toLowerCase() };
  if ((parsed.bands || []).length === 1 && /^[pq]$/i.test(parsed.bands[0]) && CHROMOSOME_RE.test(chrom.toUpperCase())) {
    return { chromosome: chrom.toUpperCase(), arm: parsed.bands[0].toLowerCase() };
  }
  return null;
}

function resolveBand(record, band) {
  const bare = String(band || "").trim().replace(new RegExp(`^(?:chr)?${record.id}`, "i"), "").toLowerCase();
  const full = `${record.id}${bare}`.toLowerCase();
  const segments = record.segments.filter((item) => item.role !== "centromere" && item.arm !== "cen");
  const exact = segments.filter((item) => String(item.label).toLowerCase() === full || String(item.id).toLowerCase() === full);
  if (exact.length) return { written: band, exact: true, segments: exact };
  const group = segments.filter((item) => String(item.label).toLowerCase().startsWith(`${full}.`));
  return { written: band, exact: false, segments: group };
}

function interiorBase(segment, record) {
  const first = segment.start_bp + 1;
  const last = segment.end_bp;
  let base = Math.floor((segment.start_bp + segment.end_bp) / 2) + 1;
  if (base < first) base = first;
  if (base > last) base = last;
  if (base === 1 && last > 1) base = Math.min(2, last);
  if (base === record.length_bp && first < record.length_bp) base = Math.max(record.length_bp - 1, first);
  return base;
}

function interiorPair(segment, record) {
  let start = segment.start_bp + 1;
  let end = segment.end_bp;
  if (start === 1 && end > start) start += 1;
  if (end === record.length_bp && end > start) end -= 1;
  if (start < 1 || end > record.length_bp || start >= end || start === 1 || end === record.length_bp) return null;
  return { start, end };
}

function intervalFor(record, segments) {
  if (segments.length === 1) {
    const segment = segments[0];
    const mid = interiorBase(segment, record);
    if (segment.arm === "q") return { start: mid, end: record.length_bp };
    return { start: 1, end: mid };
  }
  const [first, second] = segments;
  if (bareBand(record.id, first.label) === bareBand(record.id, second.label)) return interiorPair(first, record);
  const ordered = first.start_bp <= second.start_bp ? [first, second] : [second, first];
  return { start: interiorBase(ordered[0], record), end: interiorBase(ordered[1], record) };
}

function clauseKey(token) {
  return String(token || "").replace(/\s+/g, "").toLowerCase();
}

function coverageSentence(segments) {
  const unique = [];
  for (const segment of segments) {
    if (!unique.some((item) => item.label === segment.label)) unique.push(segment);
  }
  return unique
    .map((segment) => `${segment.label} covers bases ${formatBase(segment.start_bp + 1)}–${formatBase(segment.end_bp)}`)
    .join(", and ");
}

function groupExample(maps, record, change, resolved) {
  if (resolved.length === 1) {
    const segments = resolved[0].segments;
    const arm = segments[0].arm;
    const inner = arm === "p"
      ? segments.reduce((left, right) => (left.start_bp > right.start_bp ? left : right))
      : segments.reduce((left, right) => (left.start_bp < right.start_bp ? left : right));
    const interval = arm === "q"
      ? { start: interiorBase(inner, record), end: record.length_bp }
      : { start: 1, end: interiorBase(inner, record) };
    return copyNumberSpan(maps, { chromosome: record.id, change, ...interval });
  }
  const startSeg = resolved[0].segments.reduce((left, right) => (left.start_bp < right.start_bp ? left : right));
  const endSeg = resolved[1].segments.reduce((left, right) => (left.end_bp > right.end_bp ? left : right));
  return copyNumberSpan(maps, {
    chromosome: record.id,
    change,
    start: interiorBase(startSeg, record),
    end: interiorBase(endSeg, record),
  });
}

function explainAbnormality(maps, parsed) {
  const token = parsed.token;
  const change = parsed.type === "duplication" ? "duplication" : "deletion";
  const arm = armOnly(parsed);
  if (arm) {
    const name = arm.arm === "p" ? "short" : "long";
    return {
      token,
      status: "arm",
      explanation: `This names the whole ${name} arm of chromosome ${arm.chromosome}. A coordinate span needs the band at each end, so this short form stays as written.`,
    };
  }
  const chromosome = String(parsed.chromosomes?.[0] || "").toUpperCase();
  const bands = (parsed.bands || []).filter((band) => /[pq]\d/i.test(band));
  const record = chromosomeEntry(maps, chromosome);
  if (!record || !bands.length) {
    return { token, status: "unmapped", explanation: `${token} does not name a band this GRCh38 map can place.` };
  }
  const resolved = bands.slice(0, 2).map((band) => resolveBand(record, band));
  if (resolved.some((item) => !item.segments.length)) {
    return { token, status: "unmapped", explanation: `${token} uses a band name that is not on the stored GRCh38 map.` };
  }
  if (resolved.some((item) => !item.exact)) {
    const parts = resolved.map((item) => {
      const names = item.segments.map((segment) => segment.label).join(", ");
      const written = `${record.id}${String(item.written).replace(new RegExp(`^(?:chr)?${record.id}`, "i"), "")}`;
      return `${written} is the group ${names}`;
    });
    const example = groupExample(maps, record, change, resolved);
    return {
      token,
      status: "group",
      notation: example?.notation || "",
      explanation: `On this GRCh38 map, ${parts.join("; ")}.${groupExampleSentence(change, example)} This formula keeps the group name.`,
    };
  }
  const segments = resolved.map((item) => item.segments[0]);
  const interval = intervalFor(record, segments);
  if (!interval) {
    return {
      token,
      status: "mismatch",
      explanation: `${token} repeats a band that reaches a chromosome end on this map. The coordinate rule writes that band once.`,
    };
  }
  const span = copyNumberSpan(maps, { chromosome: record.id, change, ...interval });
  if (!span.ok || clauseKey(span.notation) !== clauseKey(token)) {
    return {
      token,
      status: "mismatch",
      notation: span.notation || "",
      start: interval.start,
      end: interval.end,
      explanation: span.explanation || `${token} does not round-trip through the GRCh38 band map.`,
    };
  }
  return {
    token,
    status: "match",
    notation: span.notation,
    start: span.start,
    end: span.end,
    startBand: span.startBand,
    endBand: span.endBand,
    pattern: span.pattern,
    explanation: storedMatchExplanation(segments, span),
  };
}

function storedMatchExplanation(segments, span) {
  const coverage = `${coverageSentence(segments)}.`;
  const kind = span.symbol === "dup" ? "gain" : "loss";
  if (span.pattern === "start") {
    return `${coverage} A ${kind} from the first base of chromosome ${span.chromosome} to a base inside ${span.endBand} includes the start of the chromosome, so only that band is written: ${span.notation}.`;
  }
  if (span.pattern === "end") {
    return `${coverage} A ${kind} from a base inside ${span.startBand} through the last base of chromosome ${span.chromosome} includes the end of the chromosome, so only that band is written: ${span.notation}.`;
  }
  if (span.pattern === "repeat") {
    return `${coverage} Both ends can fall inside ${span.startBand} and still stop short of either chromosome end. The band is then written twice: ${span.notation}.`;
  }
  return `${coverage} A ${kind} from a base inside ${span.startBand} to a base inside ${span.endBand} stops short of either chromosome end, so both bands are written: ${span.notation}.`;
}

function groupExampleSentence(change, example) {
  if (!example?.ok) return "";
  const kind = change === "duplication" ? "gain" : "loss";
  if (example.pattern === "start") {
    return ` A short-arm ${kind} that ends inside ${example.endBand} is written ${example.notation}.`;
  }
  if (example.pattern === "end") {
    return ` A long-arm ${kind} that ends inside ${example.startBand} is written ${example.notation}.`;
  }
  return ` One interval inside those sub-bands is written ${example.notation}.`;
}

/** Explain each del or dup in a stored formula or a single token. */
export function explainCopyNumberText(maps, text) {
  if (!maps?.chromosomes) return [];
  return abnormalitiesIn(text).map((item) => explainAbnormality(maps, item));
}

/** Visible note for del and dup strings. Other symbols produce an empty string. */
export function bandSpanNoteHTML(maps, text) {
  const source = Array.isArray(text) ? text : [text];
  const seen = new Set();
  const notes = [];
  for (const item of source) {
    for (const note of explainCopyNumberText(maps, item)) {
      if (note.status !== "match" && note.status !== "group" && note.status !== "arm") continue;
      const key = `${note.status}|${note.token}`;
      if (seen.has(key)) continue;
      seen.add(key);
      notes.push(note);
    }
  }
  if (!notes.length) return "";
  return `<section class="band-span"><h4>How this del or dup band string is read</h4><ul>${notes.map((note) => `<li><code>${escapeHtml(note.token)}</code> ${escapeHtml(note.explanation)}</li>`).join("")}</ul><p class="muted">The coordinate rule is Illumina’s ISCN-like simple nomenclature, applied to this laboratory’s GRCh38 band map. <a href="#/credits">Credits</a></p></section>`;
}

/** Worked chromosome 8 intervals on this laboratory's GRCh38 map. */
export function demonstrationSpans(maps) {
  const record = chromosomeEntry(maps, "8");
  if (!record) return [];
  const at = (label) => record.segments.find((segment) => segment.label === label);
  const shortArm = at("8p21.3");
  const longArm = at("8q24.23");
  const same = at("8q24.21");
  if (!shortArm || !longArm || !same) return [];
  const specs = [
    { change: "deletion", chromosome: "8", start: 1, end: interiorBase(shortArm, record) },
    { change: "deletion", chromosome: "8", start: interiorBase(shortArm, record), end: interiorBase(longArm, record) },
    { change: "duplication", chromosome: "8", start: same.start_bp + 1, end: same.end_bp },
    { change: "deletion", chromosome: "8", start: interiorBase(longArm, record), end: record.length_bp },
  ];
  return specs.map((spec) => ({ ...copyNumberSpan(maps, spec), change: spec.change }));
}
