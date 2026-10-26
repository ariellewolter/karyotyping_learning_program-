/**
 * General derivative chromosome model.
 * A drawn chromosome is an ordered list of band-map segments, centromeres, and
 * material of unknown origin. It is built from ISCN long notation, or from short
 * notation that the single-step transforms do not cover: add, ins, hsr, dic,
 * idic, markers, three-way t(), and der() with more than one rearrangement.
 * Unknown material is marked uncertain. Its drawn length is a placeholder.
 * Breakpoints are read at band level, so a band written at a junction is kept
 * on the retained side, as in the single-step transforms.
 */

import { cloneSegments, segmentMatches } from "./banding.js?v=20261024c";

export const UNKNOWN_BP = 5_000_000;
const MARKER_ARM_BP = 6_000_000;
const MARKER_CEN_BP = 1_500_000;
const ARROW = /-+>|→/;
const END_RE = /^(\d{1,2}|X|Y)?(pter|qter|cen|[pq]\d+(?:\.\d+)?)$/i;
const SUB_RE = /(t|del|dup|inv|ins|add|hsr)\(([^)]+)\)\(([^)]+)\)/gi;
const BAND_RE = /[pq]\d+(?:\.\d+)?|[pq]ter|cen/gi;

const CHECK_LABELS = {
  resolved: "Bands found in the map",
  centromere: "Centromere count",
  origin: "Material from the named chromosomes",
  uncertain: "Uncertain material",
};

function flip(segment) {
  return { ...segment, orientation: segment.orientation === "reverse" ? "forward" : "reverse" };
}

function isWholeArm(band) {
  return /^([pq]10|cen)$/i.test(String(band || ""));
}

function armOf(band) {
  return String(band || "").toLowerCase().startsWith("p") ? "p" : "q";
}

function splitList(text) {
  return String(text || "").split(";").map((item) => item.trim()).filter(Boolean);
}

function bandsIn(text) {
  return String(text || "").match(BAND_RE) || [];
}

function normal(maps, chromosome) {
  const id = String(chromosome);
  return cloneSegments(maps?.chromosomes?.[id]?.segments || []).map((segment) => ({ ...segment, origin: id }));
}

function bandSpan(segments, chromosome, band) {
  const id = String(chromosome);
  const text = String(band || "").toLowerCase();
  const hits = [];
  segments.forEach((segment, index) => {
    if (String(segment.chromosome) !== id) return;
    const hit = isWholeArm(text)
      ? segment.role === "centromere"
      : segment.role !== "centromere" && segment.role !== "unknown" && segmentMatches(segment, `${id}${text}`);
    if (hit) hits.push(index);
  });
  return hits.length ? { start: hits[0], end: hits[hits.length - 1] } : null;
}

/** Map segments from one written end to another, read in the written direction. */
function interval(maps, chromosome, from, to, options = {}) {
  const segments = normal(maps, chromosome);
  if (!segments.length) return null;
  const last = segments.length - 1;
  const at = (end) => {
    const text = String(end || "").toLowerCase();
    if (text === "pter") return { start: 0, end: 0 };
    if (text === "qter") return { start: last, end: last };
    return bandSpan(segments, chromosome, text);
  };
  const a = at(from);
  const b = at(to);
  if (!a || !b) return null;
  const start = String(from).toLowerCase();
  const end = String(to).toLowerCase();
  const forward = start === "pter" || end === "qter" ? true : start === "qter" || end === "pter" ? false : a.start <= b.start;
  const range = segments.slice(Math.min(a.start, b.start), Math.max(a.end, b.end) + 1);
  let slice = forward ? range : range.reverse().map(flip);
  if (options.dropCentromere) slice = slice.filter((segment) => segment.role !== "centromere");
  return slice;
}

function unknownSegment(label = "?") {
  const hsr = label === "hsr";
  return { id: "", label: hsr ? "hsr" : "?", chromosome: "?", origin: "?", arm: "", role: "unknown", stain: hsr ? 3 : 1, weight: UNKNOWN_BP, uncertain: true, orientation: "forward" };
}

function halves(segments) {
  return segments.map((segment) => ({ ...segment, weight: (segment.weight || 0) / 2, split: true }));
}

function sideOf(segments, span, band) {
  if (isWholeArm(band)) return armOf(band);
  const cen = segments.findIndex((segment) => segment.role === "centromere");
  if (cen < 0) return armOf(band);
  if (span.end < cen) return "p";
  if (span.start > cen) return "q";
  return armOf(band);
}

/** Partner material distal to a breakpoint, read toward the junction. */
function distal(maps, partner, band, placement) {
  const end = armOf(band) === "p" ? "pter" : "qter";
  const options = { dropCentromere: isWholeArm(band) };
  const piece = placement === "top" ? interval(maps, partner, end, band, options) : interval(maps, partner, band, end, options);
  return piece;
}

function receive(maps, segments, owner, ownBand, partner, partnerBand) {
  const span = bandSpan(segments, owner, ownBand);
  if (!span) return null;
  const side = sideOf(segments, span, ownBand);
  const piece = distal(maps, partner, partnerBand, side === "p" ? "top" : "bottom");
  if (!piece) return null;
  return side === "p" ? [...piece, ...segments.slice(span.start)] : [...segments.slice(0, span.end + 1), ...piece];
}

function addUnknown(segments, owner, band) {
  const span = bandSpan(segments, owner, band);
  if (!span) return null;
  return sideOf(segments, span, band) === "p"
    ? [unknownSegment(), ...segments.slice(span.start)]
    : [...segments.slice(0, span.end + 1), unknownSegment()];
}

function insertAt(segments, owner, band, insert) {
  const span = bandSpan(segments, owner, band);
  if (!span || !insert) return null;
  const at = segments.slice(span.start, span.end + 1);
  return [...segments.slice(0, span.start), ...halves(at), ...insert, ...halves(at), ...segments.slice(span.end + 1)];
}

function removeSpan(segments, owner, from, to) {
  const a = bandSpan(segments, owner, from);
  const b = bandSpan(segments, owner, to || from);
  if (!a || !b) return null;
  const lo = Math.min(a.start, b.start);
  const hi = Math.max(a.end, b.end);
  return [...segments.slice(0, lo), ...segments.slice(hi + 1)];
}

function terminalDelete(segments, owner, band) {
  const span = bandSpan(segments, owner, band);
  if (!span) return null;
  return sideOf(segments, span, band) === "p" ? segments.slice(span.end + 1) : segments.slice(0, span.start);
}

function duplicate(segments, owner, from, to) {
  const a = bandSpan(segments, owner, from);
  const b = bandSpan(segments, owner, to || from);
  if (!a || !b) return null;
  const lo = Math.min(a.start, b.start);
  const hi = Math.max(a.end, b.end);
  const copy = segments.slice(lo, hi + 1).map((segment) => ({ ...segment, duplicated: true }));
  return [...segments.slice(0, hi + 1), ...copy, ...segments.slice(hi + 1)];
}

function invert(segments, owner, from, to) {
  const a = bandSpan(segments, owner, from);
  const b = bandSpan(segments, owner, to || from);
  if (!a || !b) return null;
  const lo = Math.min(a.start, b.start);
  const hi = Math.max(a.end, b.end);
  const middle = segments.slice(lo, hi + 1).reverse().map((segment) => ({ ...flip(segment), inverted: true }));
  return [...segments.slice(0, lo), ...middle, ...segments.slice(hi + 1)];
}

/** Inserted segment oriented so the band written first is proximal in the recipient. */
function insertPiece(maps, recipientSegments, recipient, band, donor, first, second) {
  const span = bandSpan(recipientSegments, recipient, band);
  if (!span) return null;
  const side = sideOf(recipientSegments, span, band);
  return side === "p" ? interval(maps, donor, second, first) : interval(maps, donor, first, second);
}

function insertion(maps, segments, owner, chromosomes, clause) {
  const groups = splitList(clause);
  if (chromosomes.length === 1) {
    const [at, first, second] = bandsIn(clause);
    if (!at || !first || !second) return null;
    const removed = removeSpan(segments, owner, first, second);
    if (!removed) return null;
    return insertAt(removed, owner, at, insertPiece(maps, removed, owner, at, owner, first, second));
  }
  const [recipient, donor] = chromosomes;
  const at = bandsIn(groups[0])[0];
  const [first, second] = bandsIn(groups[1]);
  if (!at || !first || !second) return null;
  if (owner === recipient) return insertAt(segments, owner, at, insertPiece(maps, segments, owner, at, donor, first, second));
  if (owner === donor) return removeSpan(segments, owner, first, second);
  return null;
}

function translocation(maps, segments, owner, chromosomes, clause) {
  const bands = splitList(clause).map((group) => bandsIn(group)[0]);
  const index = chromosomes.indexOf(owner);
  if (index < 0 || bands.length !== chromosomes.length || bands.some((band) => !band)) return null;
  const from = (index - 1 + chromosomes.length) % chromosomes.length;
  return receive(maps, segments, owner, bands[index], chromosomes[from], bands[from]);
}

function applyStep(maps, segments, owner, type, chromosomes, clause) {
  if (!segments) return null;
  const single = chromosomes.length === 1;
  const bands = bandsIn(clause);
  if (type === "t") return translocation(maps, segments, owner, chromosomes, clause);
  if (type === "ins") return insertion(maps, segments, owner, chromosomes, clause);
  if (!single || chromosomes[0] !== owner || !bands.length) return null;
  if (type === "add") return addUnknown(segments, owner, bands[0]);
  if (type === "hsr") return insertAt(segments, owner, bands[0], [unknownSegment("hsr")]);
  if (type === "del") return bands.length === 1 ? terminalDelete(segments, owner, bands[0]) : removeSpan(segments, owner, bands[0], bands[1]);
  if (type === "dup") return duplicate(segments, owner, bands[0], bands[1]);
  if (type === "inv") return invert(segments, owner, bands[0], bands[1]);
  return null;
}

function parseEnd(text, fallback) {
  const match = String(text || "").trim().match(END_RE);
  if (!match) return null;
  return { chromosome: (match[1] || fallback || "").toUpperCase(), band: match[2].toLowerCase() };
}

/** Pieces of a long-notation clause such as 22pter->22q11.2::9q34->9qter. */
export function longFormPieces(clause, owner) {
  const body = String(clause || "").replace(/\s+/g, "").replace(/^:+|:+$/g, "");
  if (!body || !ARROW.test(body)) return null;
  let current = String(owner || "");
  const pieces = [];
  for (const part of body.split("::")) {
    if (!part || part === "?") {
      pieces.push({ kind: "unknown", label: "?" });
      continue;
    }
    if (/^hsr$/i.test(part)) {
      pieces.push({ kind: "unknown", label: "hsr" });
      continue;
    }
    const ends = part.split(ARROW);
    const first = parseEnd(ends[0], current);
    if (!first?.chromosome) return null;
    current = first.chromosome;
    const last = ends.length > 1 ? parseEnd(ends[1], current) : first;
    if (!last) return null;
    pieces.push({ kind: "interval", chromosome: first.chromosome, from: first.band, to: last.band });
  }
  return pieces;
}

/** Join pieces. A band written at two junctions of one chromosome is split between them. */
function assemble(maps, pieces) {
  const key = (chromosome, band) => `${chromosome}|${band}`;
  const counts = new Map();
  for (const piece of pieces) {
    if (piece.kind !== "interval") continue;
    for (const band of new Set([piece.from, piece.to])) {
      if (band === "pter" || band === "qter") continue;
      counts.set(key(piece.chromosome, band), (counts.get(key(piece.chromosome, band)) || 0) + 1);
    }
  }
  const out = [];
  for (const piece of pieces) {
    if (piece.kind === "unknown") {
      out.push(unknownSegment(piece.label));
      continue;
    }
    const segments = interval(maps, piece.chromosome, piece.from, piece.to, { dropCentromere: piece.dropCentromere });
    if (!segments?.length) return null;
    const shared = [piece.from, piece.to].filter((band) => (counts.get(key(piece.chromosome, band)) || 0) >= 2);
    for (const segment of segments) {
      const split = shared.some((band) => (isWholeArm(band) ? segment.role === "centromere" : bandSpan([segment], piece.chromosome, band)));
      out.push(split ? { ...segment, weight: (segment.weight || 0) / 2, split: true } : segment);
    }
  }
  return out;
}

function mergeCentromeres(segments) {
  const out = [];
  for (const segment of segments) {
    const last = out[out.length - 1];
    if (last && segment.role === "centromere" && last.role === "centromere" && String(last.chromosome) === String(segment.chromosome)) {
      out[out.length - 1] = { ...last, weight: (last.weight || 0) + (segment.weight || 0) };
      continue;
    }
    out.push(segment);
  }
  return out;
}

function markerSegments() {
  const arm = (side) => ({ ...unknownSegment(), arm: side, weight: MARKER_ARM_BP });
  return [arm("p"), { id: "", label: "cen", chromosome: "?", origin: "?", arm: "cen", role: "centromere", stain: 0, weight: MARKER_CEN_BP, uncertain: true, orientation: "forward" }, arm("q")];
}

function chromosomeList(text) {
  return splitList(text).map((item) => item.toUpperCase());
}

/** Kind of a token this model draws, or "" when the single-step transforms or nothing applies. */
export function modelKind(token) {
  const text = String(token || "").trim();
  let match;
  if (/^mar\d*$/i.test(text)) return "marker";
  if ((match = text.match(/^([a-z]+)\(([^)]+)\)\((.+)\)$/i)) && ARROW.test(match[3])) return "long";
  if (/^add\([^);]+\)\([pq]\d+(?:\.\d+)?\)$/i.test(text)) return "add";
  if (/^hsr\([^);]+\)\([pq]\d+(?:\.\d+)?\)$/i.test(text)) return "hsr";
  if (/^ins\([^)]+\)\([^)]+\)$/i.test(text)) return "ins";
  if (/^(dic|psudic)\([^)]+;[^)]+\)\([^)]+;[^)]+\)$/i.test(text)) return "dic";
  if (/^idic\([^);]+\)\([pq]\d+(?:\.\d+)?\)$/i.test(text)) return "idic";
  if ((match = text.match(/^t\(([^)]+)\)\(([^)]+)\)$/i)) && chromosomeList(match[1]).length >= 3) return "multi_t";
  if ((match = text.match(/^der\(([^);]+)\)((?:[a-z]+\([^)]*\)\([^)]*\))+)$/i))) {
    const steps = [...match[2].matchAll(SUB_RE)];
    if (!steps.length || steps.map((step) => step[0]).join("") !== match[2]) return "";
    const single = steps.length === 1 && steps[0][1].toLowerCase() === "t" && chromosomeList(steps[0][2]).length === 2;
    return single ? "" : "chain";
  }
  return "";
}

export function isModelled(token) {
  return Boolean(modelKind(token));
}

/** Chromosomes named in the first parentheses of a token. */
export function modelChromosomes(token) {
  if (modelKind(token) === "marker") return [];
  return chromosomeList(String(token || "").match(/\(([^)]+)\)/)?.[1]);
}

/** Karyogram slot for a modelled token: its own chromosome, or "mar" for a marker. */
export function modelIdentity(token) {
  if (modelKind(token) === "marker") return "mar";
  return modelChromosomes(token)[0] || "";
}

/** "dicentric" uses up two normal chromosomes; "marker" is extra; "replace" takes one homolog's place. */
export function modelRole(token) {
  const kind = modelKind(token);
  if (kind === "dic") return "dicentric";
  if (kind === "marker") return "marker";
  return "replace";
}

/** Every derivative implied by an ins() between two chromosomes or a three-way t(). */
export function modelDerivatives(token) {
  const text = String(token || "").trim();
  const kind = modelKind(text);
  if (kind !== "multi_t" && !(kind === "ins" && modelChromosomes(text).length === 2)) return null;
  return modelChromosomes(text).map((identity) => ({ identity, variant: `der(${identity})${text}` }));
}

function finalize(segments, owner, kind, notes) {
  if (!segments?.length) return null;
  const merged = mergeCentromeres(segments).map((segment, index) => ({
    ...segment,
    id: segment.role === "unknown" || (segment.uncertain && segment.role === "centromere") ? `unknown-${index}` : segment.id,
    translocated: Boolean(segment.translocated || (segment.origin && segment.origin !== "?" && String(segment.origin) !== String(owner))),
    proximal_order: index,
  }));
  return {
    kind,
    owner: String(owner),
    segments: merged,
    centromeres: merged.filter((segment) => segment.role === "centromere").length,
    origins: [...new Set(merged.filter((segment) => segment.role !== "centromere").map((segment) => String(segment.origin || segment.chromosome)))],
    uncertain: notes,
  };
}

/** Build the drawn chromosome for a modelled token. Returns null when a band is not in the map. */
export function buildModel(maps, token, identity = "") {
  const text = String(token || "").trim();
  const kind = modelKind(text);
  if (!kind || !maps?.chromosomes) return null;
  if (kind === "marker") {
    return finalize(markerSegments(), "mar", kind, ["A marker chromosome of unknown origin. Its size and banding are not known, so it is drawn as a small chromosome of uncertain material."]);
  }
  const named = modelChromosomes(text);
  const owner = String(identity || named[0] || "").toUpperCase();
  const clause = text.match(/^[a-z]+\([^)]+\)\((.+)\)$/i)?.[1] || "";
  const unknownNote = "Material of unknown origin is attached here. Its drawn length is a placeholder.";
  const hsrNote = "A homogeneously staining region is drawn as uncertain material. Its length and content are not known.";
  if (kind === "long") {
    const pieces = longFormPieces(clause, owner);
    if (!pieces) return null;
    const notes = [];
    if (pieces.some((piece) => piece.kind === "unknown" && piece.label === "?")) notes.push(unknownNote);
    if (pieces.some((piece) => piece.label === "hsr")) notes.push(hsrNote);
    return finalize(assemble(maps, pieces), owner, kind, notes);
  }
  if (kind === "add") return finalize(addUnknown(normal(maps, owner), owner, bandsIn(clause)[0]), owner, kind, [unknownNote]);
  if (kind === "hsr") return finalize(insertAt(normal(maps, owner), owner, bandsIn(clause)[0], [unknownSegment("hsr")]), owner, kind, [hsrNote]);
  if (kind === "ins") return finalize(insertion(maps, normal(maps, owner), owner, named, clause), owner, kind, []);
  if (kind === "dic") {
    const [left, right] = named;
    const [a, b] = splitList(clause).map((group) => bandsIn(group)[0]);
    if (!left || !right || !a || !b) return null;
    const pieces = [
      { kind: "interval", chromosome: left, from: armOf(a) === "q" ? "pter" : "qter", to: a.toLowerCase() },
      { kind: "interval", chromosome: right, from: b.toLowerCase(), to: armOf(b) === "q" ? "pter" : "qter" },
    ];
    const notes = /^psudic/i.test(text) ? ["Pseudodicentric: two centromeres are drawn, and one of them is inactive."] : [];
    return finalize(assemble(maps, pieces), left, kind, notes);
  }
  if (kind === "idic") {
    const band = bandsIn(clause)[0].toLowerCase();
    const end = armOf(band) === "q" ? "pter" : "qter";
    return finalize(assemble(maps, [
      { kind: "interval", chromosome: owner, from: end, to: band },
      { kind: "interval", chromosome: owner, from: band, to: end },
    ]), owner, kind, []);
  }
  if (kind === "multi_t") return finalize(translocation(maps, normal(maps, owner), owner, named, clause), owner, kind, []);
  if (kind === "chain") {
    const steps = [...text.slice(text.indexOf(")") + 1).matchAll(SUB_RE)];
    let segments = normal(maps, owner);
    const notes = [];
    for (const [, type, list, stepClause] of steps) {
      segments = applyStep(maps, segments, owner, type.toLowerCase(), chromosomeList(list), stepClause);
      if (!segments) return null;
      if (type.toLowerCase() === "add") notes.push(unknownNote);
      if (type.toLowerCase() === "hsr") notes.push(hsrNote);
    }
    return finalize(segments, owner, kind, [...new Set(notes)]);
  }
  return null;
}

function expectedCentromeres(token) {
  const kind = modelKind(token);
  if (kind === "dic" || kind === "idic") return 2;
  if (kind === "long" && /^(dic|idic|psudic)\(/i.test(String(token))) return 2;
  return 1;
}

/** Structure checks for a modelled token against the drawn segments. */
export function checkModel(maps, token, drawn) {
  const text = String(token || "").trim();
  const kind = modelKind(text);
  const model = buildModel(maps, text, modelIdentity(text))
    || (!kind && drawn?.length ? { owner: modelIdentity(text), segments: drawn, uncertain: [] } : null);
  if (!model) {
    return { token: text, status: "failed", kind, checks: [], visibility: null, note: "A written band is not in the GRCh38 band map, so this chromosome is not drawn." };
  }
  const segments = drawn?.length ? drawn : model.segments;
  const checks = [];
  const push = (id, status, detail) => checks.push({ id, label: CHECK_LABELS[id], status, detail });
  push("resolved", "pass", `${segments.length} segments joined from the written notation.`);
  const centromeres = segments.filter((segment) => segment.role === "centromere").length;
  const expected = expectedCentromeres(text);
  push("centromere", centromeres === expected ? "pass" : "fail", centromeres === expected
    ? (expected === 2 ? "Two centromeres, as written for a dicentric chromosome." : "One centromere.")
    : `${centromeres} centromere${centromeres === 1 ? "" : "s"} drawn; the notation implies ${expected}.`);
  const listed = [...text.matchAll(/\(([\dXY;]+)\)/gi)].flatMap((match) => chromosomeList(match[1]));
  const named = new Set([...listed, ...(longFormPieces(text.match(/^[a-z]+\([^)]+\)\((.+)\)$/i)?.[1], model.owner) || []).filter((piece) => piece.chromosome).map((piece) => piece.chromosome)]);
  const origins = [...new Set(segments.filter((segment) => segment.role !== "centromere").map((segment) => String(segment.origin || segment.chromosome)))];
  const foreign = origins.filter((origin) => origin !== "?" && !named.has(origin));
  if (kind !== "marker") {
    push("origin", foreign.length ? "fail" : "pass", foreign.length
      ? `Material from chromosome ${foreign.join(", ")} is not named in the notation.`
      : `Material from chromosome${origins.filter((origin) => origin !== "?").length === 1 ? "" : "s"} ${origins.filter((origin) => origin !== "?").join(", ")}.`);
  }
  if (model.uncertain.length) push("uncertain", "info", model.uncertain.join(" "));
  const failed = checks.some((check) => check.status === "fail");
  return {
    token: text,
    kind,
    status: failed ? "failed" : "validated",
    checks,
    visibility: null,
    note: model.uncertain.length ? "Uncertain material is shown, not invented. Only the written bands are drawn from the map." : "",
  };
}
