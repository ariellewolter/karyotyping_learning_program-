/**
 * Structural chromosome validation. The expected segment order is built directly
 * from the GRCh38 band map and the written breakpoints, then compared with the
 * segments the drawing uses. Supported: del, dup, inv, and the two derivatives of a
 * two-break reciprocal t(). Other events return status "not_checked".
 *
 * Breakpoints are band-level. A band that contains a breakpoint is kept whole on
 * the retained side of a terminal deletion boundary and on both derivatives of a
 * translocation, because ISCN does not place the break within the band.
 */
import { labelCovers } from "./banding.js?v=20261024c";
import { drawnSegments } from "./chromosomes.js?v=20261026p5";
import { parseAbnormality, reciprocalDerivatives } from "./iscn.js";
import { checkModel as checkDerivativeModel, isModelled, modelDerivatives, modelIdentity } from "./derivative-model.js";

/** Teaching heuristic, not a diagnostic boundary: visibility also depends on band level, region, and specimen quality. */
export const CONVENTIONAL_RESOLUTION_BP = 5000000;
export const BORDERLINE_RESOLUTION_BP = 10000000;
const LENGTH_TOLERANCE = 0.005;

const CHECK_LABELS = {
  chromosome_arm: "Correct chromosome and arm",
  breakpoint: "Correct breakpoint location",
  unaffected: "Unaffected bands preserved",
  ordering: "Retained or rearranged segments in order",
  length: "Relative chromosome length",
  centromere: "One centromere in the expected position",
};

function mapSegments(maps, chromosome) {
  return maps?.chromosomes?.[String(chromosome)]?.segments || [];
}

function bandSpan(segments, label) {
  const hits = [];
  segments.forEach((segment, index) => {
    if ([segment.id, segment.label, segment.parent_band].some((value) => labelCovers(label, value))) hits.push(index);
  });
  return hits.length ? { start: hits[0], end: hits[hits.length - 1] } : null;
}

function withChromosome(chromosome, band) {
  const text = String(band || "");
  return /^(\d+|X|Y)/i.test(text) ? text : `${chromosome}${text}`;
}

function flip(segment) {
  return { ...segment, orientation: segment.orientation === "reverse" ? "forward" : "reverse" };
}

function key(segment) {
  return `${segment.chromosome}:${String(segment.id).replace(/(dup|iso)$/, "")}:${segment.orientation || "forward"}`;
}

function totalWeight(segments) {
  return segments.reduce((sum, segment) => sum + (Number(segment.weight) || 0), 0);
}

function sameSequence(a, b) {
  return a.length === b.length && a.every((segment, index) => key(segment) === key(b[index]));
}

/** Expected model for one derivative chromosome. Returns null when a breakpoint is not in the map. */
function expectedModel(maps, parsed) {
  const chromosome = String(parsed.chromosomes?.[0] || "");
  const normal = mapSegments(maps, chromosome);
  if (!normal.length) return { error: `No band map for chromosome ${chromosome}.` };
  const bands = (parsed.bands || []).filter((band) => /^[pq]\d/i.test(band)).map((band) => withChromosome(chromosome, band));
  const spans = bands.map((band) => ({ band, span: bandSpan(normal, band) }));
  const missing = spans.find((item) => !item.span);
  if (missing) return { error: `${missing.band} is not a band in the chromosome ${chromosome} map.` };

  if (parsed.type === "deletion") {
    if (spans.length === 1) {
      const { span, band } = spans[0];
      const arm = band.replace(chromosome, "")[0].toLowerCase();
      const kept = arm === "q" ? normal.slice(0, span.start) : normal.slice(span.end + 1);
      const removed = arm === "q" ? normal.slice(span.start) : normal.slice(0, span.end + 1);
      return { kind: "terminal deletion", chromosome, arms: [arm], breakpoints: [band], expected: kept, removed, junctions: [], unaffected: kept, normal, centromereFrom: chromosome };
    }
    const lo = Math.min(spans[0].span.start, spans[1].span.start);
    const hi = Math.max(spans[0].span.end, spans[1].span.end);
    const expected = [...normal.slice(0, lo), ...normal.slice(hi + 1)];
    return {
      kind: "interstitial deletion", chromosome, arms: armsOf(bands, chromosome), breakpoints: bands, expected,
      removed: normal.slice(lo, hi + 1), junctions: lo > 0 && hi < normal.length - 1 ? [lo] : [], unaffected: expected, normal, centromereFrom: chromosome,
    };
  }
  if (parsed.type === "duplication") {
    const lo = Math.min(...spans.map((item) => item.span.start));
    const hi = Math.max(...spans.map((item) => item.span.end));
    const copy = normal.slice(lo, hi + 1);
    const expected = [...normal.slice(0, hi + 1), ...copy, ...normal.slice(hi + 1)];
    return {
      kind: "tandem duplication", chromosome, arms: armsOf(bands, chromosome), breakpoints: bands, expected,
      added: copy, junctions: [hi + 1], unaffected: [...normal.slice(0, lo), ...normal.slice(hi + 1)], normal, centromereFrom: chromosome,
    };
  }
  if (parsed.type === "inversion") {
    const lo = Math.min(...spans.map((item) => item.span.start));
    const hi = Math.max(...spans.map((item) => item.span.end));
    const inverted = normal.slice(lo, hi + 1).reverse().map(flip);
    const expected = [...normal.slice(0, lo), ...inverted, ...normal.slice(hi + 1)];
    const arms = armsOf(bands, chromosome);
    return {
      kind: new Set(arms).size > 1 ? "pericentric inversion" : "paracentric inversion", chromosome, arms, breakpoints: bands, expected,
      moved: inverted, junctions: [lo, hi + 1].filter((index) => index > 0 && index < normal.length), unaffected: [...normal.slice(0, lo), ...normal.slice(hi + 1)], normal, centromereFrom: chromosome,
    };
  }
  return null;
}

function armsOf(bands, chromosome) {
  return bands.map((band) => band.replace(chromosome, "")[0].toLowerCase());
}

function derivativeModel(maps, derivative, left, right, leftBand, rightBand) {
  const ownIsLeft = String(derivative) === String(left);
  const own = ownIsLeft ? { chromosome: left, band: withChromosome(left, leftBand) } : { chromosome: right, band: withChromosome(right, rightBand) };
  const partner = ownIsLeft ? { chromosome: right, band: withChromosome(right, rightBand) } : { chromosome: left, band: withChromosome(left, leftBand) };
  const ownMap = mapSegments(maps, own.chromosome);
  const partnerMap = mapSegments(maps, partner.chromosome);
  if (!ownMap.length || !partnerMap.length) return { error: "A partner chromosome has no band map." };
  const ownSpan = bandSpan(ownMap, own.band);
  const partnerSpan = bandSpan(partnerMap, partner.band);
  if (!ownSpan) return { error: `${own.band} is not a band in the chromosome ${own.chromosome} map.` };
  if (!partnerSpan) return { error: `${partner.band} is not a band in the chromosome ${partner.chromosome} map.` };
  const ownArm = own.band.replace(own.chromosome, "")[0].toLowerCase();
  const partnerArm = partner.band.replace(partner.chromosome, "")[0].toLowerCase();
  const partnerPiece = partnerArm === "q" ? partnerMap.slice(partnerSpan.start) : partnerMap.slice(0, partnerSpan.end + 1);
  let expected;
  let kept;
  let junction;
  if (ownArm === "q") {
    kept = ownMap.slice(0, ownSpan.end + 1);
    const attach = partnerArm === "q" ? partnerPiece : partnerPiece.slice().reverse().map(flip);
    expected = [...kept, ...attach];
    junction = kept.length;
  } else {
    kept = ownMap.slice(ownSpan.start);
    const attach = partnerArm === "p" ? partnerPiece : partnerPiece.slice().reverse().map(flip);
    expected = [...attach, ...kept];
    junction = attach.length;
  }
  return {
    kind: `der(${derivative}) of a reciprocal translocation`, chromosome: String(derivative), arms: [ownArm, partnerArm],
    breakpoints: [own.band, partner.band], expected, received: partnerPiece, removed: ownArm === "q" ? ownMap.slice(ownSpan.end + 1) : ownMap.slice(0, ownSpan.start),
    junctions: [junction], unaffected: kept, normal: ownMap, centromereFrom: String(derivative), partner: partner.chromosome,
  };
}

function visibility(model) {
  const lost = totalWeight(model.removed || []);
  const gained = totalWeight(model.added || model.received || []);
  const moved = totalWeight(model.moved || []);
  const changed = model.kind.includes("translocation") ? Math.min(lost || Infinity, gained || Infinity) : (lost || gained || moved);
  const mb = (changed / 1e6).toFixed(1);
  if (!Number.isFinite(changed) || changed <= 0) return { changedBp: 0, level: "unknown", note: "" };
  const oneBand = model.breakpoints.length > 1 && new Set(model.breakpoints).size === 1;
  const withinBand = oneBand ? " Both breakpoints lie in one band, so the change may be much smaller than the band." : "";
  if (changed < CONVENTIONAL_RESOLUTION_BP) {
    return {
      changedBp: changed,
      level: "below",
      note: `The written bands span at most ${mb} Mb. As a teaching guide, changes under about 5 Mb are often not seen on a routine 400–550 band karyotype. Visibility also depends on band level, the region's banding pattern, and specimen quality. FISH or chromosomal microarray is the usual way to confirm a change of this size.${withinBand}`,
    };
  }
  if (changed < BORDERLINE_RESOLUTION_BP || oneBand) {
    return {
      changedBp: changed,
      level: "borderline",
      note: `The written bands span at most ${mb} Mb. As a teaching guide, a change of this size may be seen only at higher band levels, depending on the region and specimen quality. FISH or microarray can confirm it.${withinBand}`,
    };
  }
  return { changedBp: changed, level: "visible", note: `The written bands span about ${mb} Mb, usually within routine G-band resolution, though a subtle banding change can still be missed.` };
}

function centromereIndex(segments) {
  return segments.map((segment, index) => (segment.role === "centromere" ? index : -1)).filter((index) => index >= 0);
}

function checkModel(model, drawn) {
  const checks = [];
  const push = (id, pass, detail) => checks.push({ id, label: CHECK_LABELS[id], status: pass ? "pass" : "fail", detail });
  const sources = new Set([model.chromosome, model.partner].filter(Boolean).map(String));
  const arms = [...new Set(model.arms)];
  const breakpoints = [...new Set(model.breakpoints)];
  const foreign = drawn.filter((segment) => !sources.has(String(segment.chromosome)));
  push("chromosome_arm", !foreign.length, foreign.length
    ? `The drawing contains material from chromosome ${foreign[0].chromosome}.`
    : `Chromosome ${model.chromosome}${model.partner ? ` with chromosome ${model.partner}` : ""}; breakpoint arm${arms.length > 1 ? "s" : ""} ${arms.join(" and ")}.`);

  const junctionsOk = model.junctions.every((index) => drawn[index - 1] && drawn[index]
    && key(drawn[index - 1]) === key(model.expected[index - 1]) && key(drawn[index]) === key(model.expected[index]));
  const edgeOk = model.kind === "terminal deletion"
    ? key(drawn[model.arms[0] === "q" ? drawn.length - 1 : 0] || {}) === key(model.expected[model.arms[0] === "q" ? model.expected.length - 1 : 0] || {})
    : true;
  push("breakpoint", junctionsOk && edgeOk, junctionsOk && edgeOk
    ? `Junction${breakpoints.length > 1 ? "s" : ""} at ${breakpoints.join(" and ")}.`
    : `The drawn junction does not fall at ${breakpoints.join(" and ")}.`);

  const drawnKeys = new Set(drawn.map(key));
  const lostUnaffected = model.unaffected.filter((segment) => !drawnKeys.has(key(segment)));
  push("unaffected", !lostUnaffected.length, lostUnaffected.length
    ? `${lostUnaffected.length} unaffected band${lostUnaffected.length === 1 ? " is" : "s are"} missing, starting with ${lostUnaffected[0].label || lostUnaffected[0].id}.`
    : `${model.unaffected.length} unaffected segments are present.`);

  const ordered = sameSequence(drawn, model.expected);
  push("ordering", ordered, ordered
    ? `${model.expected.length} segments in the expected order and orientation.`
    : "The drawn segment order or orientation differs from the band map.");

  const drawnLength = totalWeight(drawn);
  const expectedLength = totalWeight(model.expected);
  const normalLength = totalWeight(model.normal);
  const lengthOk = Math.abs(drawnLength - expectedLength) <= expectedLength * LENGTH_TOLERANCE;
  const percent = Math.round((expectedLength / normalLength) * 1000) / 10;
  push("length", lengthOk, lengthOk
    ? `${percent}% of a normal chromosome ${model.chromosome}.`
    : `Drawn at ${Math.round((drawnLength / normalLength) * 1000) / 10}% of normal; the band map gives ${percent}%.`);

  const drawnCen = centromereIndex(drawn);
  const expectedCen = centromereIndex(model.expected);
  const cenOk = drawnCen.length === 1 && drawnCen[0] === expectedCen[0] && String(drawn[drawnCen[0]].chromosome) === String(model.centromereFrom);
  push("centromere", cenOk, cenOk
    ? `Centromere of chromosome ${model.centromereFrom} at segment ${drawnCen[0] + 1} of ${drawn.length}.`
    : `${drawnCen.length} centromere segment${drawnCen.length === 1 ? "" : "s"} drawn; expected one from chromosome ${model.centromereFrom} at segment ${expectedCen[0] + 1}.`);
  return checks;
}

function result(token, model, drawn) {
  if (model?.error) return { token, status: "failed", kind: "", checks: [], visibility: null, note: model.error };
  if (!drawn?.length) return { token, status: "not_checked", kind: model.kind, checks: [], visibility: null, note: "No drawing is produced for this event." };
  const checks = checkModel(model, drawn);
  return {
    token,
    kind: model.kind,
    status: checks.every((check) => check.status === "pass") ? "validated" : "failed",
    checks,
    visibility: visibility(model),
    note: "",
  };
}

/**
 * Validate the drawing of one written structural event.
 * Returns one record per drawn chromosome: one for del/dup/inv, two for t().
 * options.draw replaces the drawing source, for testing a faulty drawing.
 */
export function validateStructure(maps, token, options = {}) {
  const draw = options.draw || drawnSegments;
  const text = String(token || "").trim();
  const parsed = parseAbnormality(text);
  if (!parsed || parsed.kind !== "structural") {
    return [{ token: text, status: "not_checked", kind: "", checks: [], visibility: null, note: "Structure validation covers del, dup, inv, and two-break reciprocal t()." }];
  }
  if (isModelled(text)) {
    const derivatives = modelDerivatives(text);
    if (derivatives) return derivatives.map((piece) => checkDerivativeModel(maps, piece.variant, draw(piece.identity, piece.variant)));
    return [checkDerivativeModel(maps, text, draw(modelIdentity(text), text))];
  }
  if (["isochromosome", "ring chromosome", "Robertsonian translocation"].includes(parsed.type)) {
    const identity = String(parsed.chromosomes?.[0] || "");
    const drawn = draw(identity, text);
    if (drawn?.length) return [checkDerivativeModel(maps, text, drawn)];
  }
  if (parsed.type === "reciprocal translocation") {
    const pieces = reciprocalDerivatives(text);
    const [left, right] = (parsed.chromosomes || []).map(String);
    const [leftBand, rightBand] = (parsed.bands || []).filter((band) => /^[pq]\d/i.test(band));
    if (!pieces || !leftBand || !rightBand) {
      return [{ token: text, status: "not_checked", kind: "reciprocal translocation", checks: [], visibility: null, note: "Only two-break reciprocal translocations are validated." }];
    }
    return pieces.map((piece) => result(piece.variant, derivativeModel(maps, piece.identity, left, right, leftBand, rightBand), draw(piece.identity, piece.variant)));
  }
  if (parsed.type === "derivative chromosome" && parsed.rearrangement?.type === "reciprocal translocation") {
    const [left, right] = (parsed.rearrangement.chromosomes || []).map(String);
    const [leftBand, rightBand] = parsed.rearrangement.bands || [];
    const identity = String(parsed.chromosomes?.[0] || "");
    return [result(text, derivativeModel(maps, identity, left, right, leftBand, rightBand), draw(identity, text))];
  }
  const model = expectedModel(maps, parsed);
  if (!model) {
    return [{ token: text, status: "not_checked", kind: parsed.type, checks: [], visibility: null, note: "Structure validation covers del, dup, inv, and two-break reciprocal t()." }];
  }
  const identity = String(parsed.chromosomes?.[0] || "");
  return [result(text, model, draw(identity, text))];
}

/** Overall status for a list of per-chromosome results. */
export function structureStatus(results) {
  if (!results?.length) return "not_checked";
  if (results.some((item) => item.status === "failed")) return "failed";
  if (results.every((item) => item.status === "validated")) return "validated";
  return "not_checked";
}
