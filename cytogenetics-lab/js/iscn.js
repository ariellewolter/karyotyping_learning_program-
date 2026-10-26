/**
 * ISCN parsing and component comparison.
 * Only interprets strings supplied by cases or students — it does not invent abnormalities.
 */

import { isModelled, modelDerivatives, modelIdentity } from "./derivative-model.js";

const SEX_RE = /^(X{1,5}|Y{1,4}|X{1,4}Y{1,2}|X{0,4}Y{1,3})$/i;
const COUNT_RE = /^\d+(?:~\d+)?(?:<\d*n[±+-]?>)?$/i;
const IDENTITY_RE = /^([1-9]|1\d|2[0-2]|X|Y)$/;
export function stripSpace(str) {
  return String(str || "").replace(/\s+/g, "").trim();
}

export function normalizeISCN(str) {
  const parts = stripSpace(str).split("/").map(normalizeCellLine).filter(Boolean);
  return parts.join("/");
}

function normalizeCellLine(line) {
  if (!line) return "";
  const clone = line.match(/^(.+?)\[(cp)?(\d+)\]$/i);
  const body = clone ? clone[1] : line;
  const size = clone ? `[${clone[2] ? "cp" : ""}${clone[3]}]` : "";
  const bits = body.split(",").filter(Boolean);
  if (!bits.length) return "";
  bits[0] = COUNT_RE.test(bits[0]) ? bits[0] : bits[0].replace(/[^\d]/g, "");
  if (bits[1]) bits[1] = bits[1].toUpperCase().replace(/O$/, "");
  const rest = bits.slice(2).map(normalizeToken);
  return [bits[0], bits[1], ...rest].filter(Boolean).join(",") + size;
}

function normalizeToken(token) {
  return token
    .replace(/DEL/g, "del")
    .replace(/DUP/g, "dup")
    .replace(/INV/g, "inv")
    .replace(/ROB/g, "rob")
    .replace(/DER/g, "der")
    .replace(/ADD/g, "add")
    .replace(/MAR/gi, "mar")
    .replace(/^T\(/, "t(")
    .replace(/^R\(/, "r(")
    .replace(/^I\(/, "i(");
}

export function parseISCN(str) {
  const raw = String(str || "").trim();
  const normalized = normalizeISCN(raw);
  if (!normalized) return { raw, normalized: "", mosaic: false, cellLines: [], error: "empty" };
  const cellLines = normalized.split("/").map(parseCellLine);
  return {
    raw,
    normalized,
    mosaic: cellLines.length > 1,
    cellLines,
  };
}

function parseCellLine(line) {
  const clone = line.match(/^(.+?)\[(cp)?(\d+)\]$/i);
  const body = clone ? clone[1] : line;
  const cloneSize = clone ? Number(clone[3]) : null;
  const bits = body.split(",").filter(Boolean);
  const range = String(bits[0] || "").match(/^(\d+)(?:~(\d+))?(?:<(\d*n[±+-]?)>)?$/i);
  const count = range ? Number(range[1]) : Number(bits[0]);
  const sex = (bits[1] || "").toUpperCase();
  const abnormalities = bits.slice(2).map(parseAbnormality);
  return {
    count,
    countRange: range?.[2] ? [Number(range[1]), Number(range[2])] : null,
    ploidy: range?.[3] || "",
    composite: Boolean(clone?.[2]),
    sex,
    abnormalities,
    cloneSize,
    raw: line,
  };
}

export function parseAbnormality(token) {
  const t = token.trim();
  let m;
  if ((m = t.match(/^([+-])(\d+|[XY])$/i))) {
    return {
      token: t,
      kind: "numerical",
      type: m[1] === "+" ? "trisomy" : "monosomy",
      chromosomes: [m[2].toUpperCase()],
      arms: [],
      bands: [],
    };
  }
  if ((m = t.match(/^([+-])(\d*)(\D.*)$/))) {
    const inner = parseAbnormality(m[3]);
    if (inner.kind === "structural") {
      return { ...inner, token: t, variant: inner.variant || inner.token, gain: m[1] === "+", loss: m[1] === "-", copies: (Number(m[2]) || 1) * (inner.copies || 1) };
    }
  }
  if ((m = t.match(/^(\d*)mar(\d*)$/i))) {
    return { token: t, variant: `mar${m[2]}`, kind: "structural", type: "marker chromosome", chromosomes: [], arms: [], bands: [], copies: Number(m[1]) || 1 };
  }
  if ((m = t.match(/^(\d*)dmin$/i))) {
    return { token: t, kind: "structural", type: "double minutes", chromosomes: [], arms: [], bands: [], copies: Number(m[1]) || 1 };
  }
  if (/^(inc|idem|sl|sdl\d*)$/i.test(t)) {
    return { token: t, kind: "annotation", type: /^inc$/i.test(t) ? "incomplete karyotype" : "clone reference", chromosomes: [], arms: [], bands: [] };
  }
  if ((m = t.match(/^(del|dup|inv|r|i|rob|add|dic|idic|ins|trp|tri|rec|psudic|hsr)\(([^)]+)\)(?:\((.+)\))?$/i))) {
    const abbr = m[1].toLowerCase();
    const map = {
      del: "deletion",
      dup: "duplication",
      inv: "inversion",
      r: "ring chromosome",
      i: "isochromosome",
      rob: "Robertsonian translocation",
      add: "derivative chromosome",
      dic: "dicentric chromosome",
      idic: "isodicentric chromosome",
      ins: "insertion",
      trp: "triplication",
      tri: "trisomy",
      rec: "recombinant chromosome",
      psudic: "pseudodicentric chromosome",
      hsr: "homogeneously staining region",
    };
    const chromosomes = splitChromList(m[2]);
    const longForm = LONG_ARROW.test(m[3] || "");
    return {
      token: t,
      kind: "structural",
      type: map[abbr],
      chromosomes,
      ...(longForm ? { arms: [], bands: [] } : parseBreakpoints(m[3])),
      longForm,
      breakpointLabels: longForm ? longFormBreakpoints(m[3], chromosomes[0]) : labelledBands(chromosomes, m[3]),
    };
  }
  if ((m = t.match(/^t\(([^)]+)\)(?:\(([^)]+)\))?$/i))) {
    return {
      token: t,
      kind: "structural",
      type: "reciprocal translocation",
      chromosomes: splitChromList(m[1]),
      ...parseBreakpoints(m[2]),
    };
  }
  if ((m = t.match(/^der\(([^)]+)\)(.*)$/i))) {
    const remainder = String(m[2] || "").replace(/^,/, "");
    const longClause = remainder.match(/^\((.+)\)$/)?.[1] || "";
    const steps = [...remainder.matchAll(/(t|del|dup|inv|ins|add|hsr|dic)\(([^)]+)\)\(([^)]+)\)/gi)];
    const rearrangement = remainder && steps.length <= 1 && !longClause ? parseAbnormality(remainder) : null;
    const linked = rearrangement && rearrangement.kind !== "unknown" ? rearrangement : null;
    const chromosomes = splitChromList(m[1]);
    const breakpointLabels = longClause && LONG_ARROW.test(longClause)
      ? longFormBreakpoints(longClause, chromosomes[0])
      : steps.flatMap((step) => labelledBands(splitChromList(step[2]), step[3]));
    return {
      token: t,
      kind: "structural",
      type: "derivative chromosome",
      chromosomes,
      arms: [],
      bands: [],
      rearrangement: linked,
      steps: steps.map((step) => step[0]),
      breakpointLabels,
    };
  }
  if (/^mar/i.test(t)) {
    return { token: t, kind: "structural", type: "marker chromosome", chromosomes: [], arms: [], bands: [] };
  }
  return { token: t, kind: "unknown", type: "unknown", chromosomes: [], arms: [], bands: [] };
}

const LONG_ARROW = /-+>|→/;

/** Bands written in a short-notation clause, each with its chromosome: (9;22)(q34;q11.2) gives 9q34 and 22q11.2. */
function labelledBands(chromosomes, clause) {
  if (!clause) return [];
  const groups = String(clause).includes(";") ? String(clause).split(";") : [String(clause)];
  return groups.flatMap((group, index) => {
    const chromosome = chromosomes[index] ?? chromosomes[0] ?? "";
    return (group.match(/[pq]\d+(?:\.\d+)?/gi) || []).map((band) => `${chromosome}${band}`);
  });
}

/** Junction bands of a long-notation clause, without pter, qter, or unknown material. */
function longFormBreakpoints(clause, owner) {
  const labels = [];
  let current = String(owner || "");
  for (const part of String(clause).replace(/^:+|:+$/g, "").split("::")) {
    for (const end of part.split(LONG_ARROW)) {
      const match = end.trim().match(/^(\d{1,2}|X|Y)?([pq]\d+(?:\.\d+)?|cen)$/i);
      if (!match) {
        const chromosome = end.trim().match(/^(\d{1,2}|X|Y)/i)?.[1];
        if (chromosome) current = chromosome.toUpperCase();
        continue;
      }
      current = (match[1] || current).toUpperCase();
      labels.push(`${current}${match[2]}`);
    }
  }
  return [...new Set(labels)];
}

function splitChromList(s) {
  return String(s || "")
    .split(";")
    .map((x) => x.trim())
    .filter(Boolean);
}

function bandPieces(clause) {
  if (!clause) return [];
  const text = String(clause).trim();
  if (!text) return [];
  if (text.includes(";")) return text.split(";").map((part) => part.trim()).filter(Boolean);
  const found = text.match(/[pq]\d+(?:\.\d+)?/gi);
  return found?.length ? found : [text];
}

function parseBreakpoints(bp) {
  const parts = bandPieces(bp);
  const arms = parts.map((part) => (String(part).match(/[pq]/i) || [""])[0].toLowerCase()).filter(Boolean);
  return { arms, bands: parts };
}

export function compareISCN(studentStr, expectedStr, variants = []) {
  const student = parseISCN(studentStr);
  const expected = parseISCN(expectedStr);
  const accepted = [expectedStr, ...(variants || [])].map(normalizeISCN);

  if (!student.normalized) {
    return {
      match: false,
      parsed: student,
      components: blankComponents("missing"),
    };
  }

  if (accepted.includes(student.normalized)) {
    return {
      match: true,
      parsed: student,
      components: blankComponents("correct"),
    };
  }

  const s0 = student.cellLines[0] || {};
  const e0 = expected.cellLines[0] || {};
  const sAbn = (s0.abnormalities || [])[0];
  const eAbn = (e0.abnormalities || [])[0];
  const eSexOnly = !eAbn && e0.sex && !["XX", "XY"].includes(e0.sex);

  const countOk = s0.count === e0.count;
  const sexOk = (s0.sex || "") === (e0.sex || "");

  let abnormality = "incorrect";
  if (!eAbn && !eSexOnly && !(s0.abnormalities || []).length && !student.mosaic) {
    abnormality = sexOk && countOk ? "correct" : "incorrect";
    if (!eAbn && ["XX", "XY"].includes(e0.sex) && !(s0.abnormalities || []).length) {
      abnormality = "correct";
    }
  } else if (!eAbn && eSexOnly) {
    abnormality = sexOk ? "correct" : "incorrect";
  } else if (!sAbn && !student.mosaic) {
    abnormality = "missing";
  } else if (student.mosaic || expected.mosaic) {
    abnormality = student.mosaic === expected.mosaic && sexOk ? "correct" : "incorrect";
  } else if (sAbn && eAbn) {
    const typeOk = typesCompatible(sAbn.type, eAbn.type);
    const chrOk = sameSet(sAbn.chromosomes, eAbn.chromosomes);
    abnormality = typeOk && chrOk ? "correct" : "incorrect";
  }

  const chrComponent = compareList(
    sAbn?.chromosomes || extraSexChromosomes(s0.sex, e0.sex),
    eAbn?.chromosomes || extraSexChromosomes(e0.sex, "XY")
  );
  const armComponent = compareList(sAbn?.arms || [], eAbn?.arms || []);
  const bandComponent = compareBands(sAbn?.bands || [], eAbn?.bands || []);

  if (!eAbn) {
    /* leave chromosome/arm/band as N/A-correct when none expected */
  }

  return {
    match: false,
    parsed: student,
    components: {
      chromosome_count: countOk ? "correct" : "incorrect",
      sex_chromosomes: sexOk ? "correct" : "incorrect",
      abnormality,
      chromosomes_involved: eAbn || eSexOnly ? chrComponent : "correct",
      arms: eAbn?.arms?.length ? armComponent : "na",
      bands: eAbn?.bands?.length ? bandComponent : "na",
      mosaicism: expected.mosaic ? (student.mosaic ? "correct" : "incorrect") : "na",
    },
  };
}

function extraSexChromosomes(sex) {
  if (!sex) return [];
  if (sex === "X") return ["X"];
  if (sex === "XXY") return ["X"];
  return [];
}

function typesCompatible(a, b) {
  if (a === b) return true;
  const pair = new Set([a, b]);
  if (pair.has("translocation") && pair.has("reciprocal translocation")) return true;
  if (pair.has("translocation") && pair.has("Robertsonian translocation")) return false;
  return false;
}

function sameSet(a, b) {
  const aa = [...(a || [])].map(String).sort().join(",");
  const bb = [...(b || [])].map(String).sort().join(",");
  return aa === bb;
}

function compareList(a, b) {
  if (!b || !b.length) return "na";
  if (!a || !a.length) return "missing";
  return sameSet(a, b) ? "correct" : "incorrect";
}

function compareBands(a, b) {
  if (!b || !b.length) return "na";
  if (!a || !a.length) return "missing";
  const na = a.map(normalizeBand);
  const nb = b.map(normalizeBand);
  if (sameSet(na, nb)) return "correct";
  const looseA = na.map((x) => x.replace(/\.\d+$/, ""));
  const looseB = nb.map((x) => x.replace(/\.\d+$/, ""));
  return sameSet(looseA, looseB) ? "correct" : "incorrect";
}

function normalizeBand(b) {
  return String(b).toLowerCase().replace(/\s/g, "");
}

function blankComponents(value) {
  return {
    chromosome_count: value,
    sex_chromosomes: value,
    abnormality: value,
    chromosomes_involved: value,
    arms: value,
    bands: value,
    mosaicism: "na",
  };
}

export function iscnComponentLabels() {
  return {
    chromosome_count: "Chromosome count",
    sex_chromosomes: "Sex chromosome complement",
    abnormality: "Abnormality notation",
    chromosomes_involved: "Chromosome(s) involved",
    arms: "Arm(s)",
    bands: "Band/sub-band",
    mosaicism: "Mosaicism notation",
  };
}

export function SEX_PATTERN_OK(sex) {
  return SEX_RE.test(sex || "");
}

function withChromosome(chromosome, band) {
  const text = String(band || "");
  if (!text || text === "p" || text === "q") return "";
  if (/^(\d+|X|Y)/i.test(text)) return text;
  return `${chromosome}${text}`;
}

const ACROCENTRIC = new Set(["13", "14", "15", "21", "22"]);

/**
 * Drawing spec for the supported notation subset:
 * del, dup, inv, der()t() with two breakpoints,
 * i()(p10) or i()(q10), whole-arm rob() or der()(q10;q10),
 * and r() between two bands.
 * A balanced t() is drawn by reciprocalDerivatives, not by this function.
 * Other tokens return null and are not drawn.
 */
export function segmentTransform(token) {
  const parsed = parseAbnormality(String(token || "").trim());
  if (!parsed || parsed.kind !== "structural") return null;
  const chromosome = String(parsed.chromosomes?.[0] || "");
  if (parsed.type === "deletion") return deletionSpec(chromosome, parsed);
  if (parsed.type === "duplication") return spanSpec("duplication", chromosome, parsed);
  if (parsed.type === "inversion") return spanSpec("inversion", chromosome, parsed);
  if (parsed.type === "isochromosome") return isochromosomeSpec(parsed);
  if (parsed.type === "ring chromosome") return ringSpec(chromosome, parsed);
  const fusion = robertsonianSpec(parsed);
  if (fusion) return fusion;
  if (parsed.type === "derivative chromosome") return derivativeSpec(parsed);
  return null;
}

function isochromosomeSpec(parsed) {
  const chromosome = String(parsed.chromosomes?.[0] || "");
  const arm = String(parsed.bands?.[0] || "").match(/^([pq])10$/i)?.[1]?.toLowerCase();
  if (!arm || !/^([1-9]|1\d|2[0-2]|X|Y)$/.test(chromosome)) return null;
  return { type: "isochromosome", arm };
}

function ringSpec(chromosome, parsed) {
  const bands = (parsed.bands || []).filter((band) => /^[pq]\d/i.test(band));
  if (!chromosome || bands.length < 2) return null;
  return {
    type: "ring",
    from: withChromosome(chromosome, bands[0]),
    to: withChromosome(chromosome, bands[1]),
  };
}

function robertsonianSpec(parsed) {
  const chromosomes = (parsed.chromosomes || []).map(String);
  if (chromosomes.length !== 2 || !chromosomes.every((item) => ACROCENTRIC.has(item))) return null;
  const fromBands = parsed.type === "Robertsonian translocation"
    ? (parsed.bands || [])
    : (/\(q10;q10\)/i.test(parsed.token) ? ["q10", "q10"] : []);
  if (fromBands.length !== 2 || !fromBands.every((band) => /^q10$/i.test(band))) return null;
  return { type: "robertsonian", partner: chromosomes[1], chromosomes };
}

function deletionSpec(chromosome, parsed) {
  const bands = (parsed.bands || []).filter((band) => /[pq]\d/i.test(band));
  if (bands.length >= 2) {
    return { type: "deletion", from: withChromosome(chromosome, bands[0]), to: withChromosome(chromosome, bands[1]) };
  }
  if (bands.length === 1) {
    return {
      type: "deletion",
      arm: bands[0][0].toLowerCase(),
      terminal_through: withChromosome(chromosome, bands[0]),
    };
  }
  if (parsed.arms?.[0]) return { type: "deletion", arm_only: parsed.arms[0] };
  return null;
}

function spanSpec(type, chromosome, parsed) {
  const bands = (parsed.bands || []).filter((band) => /[pq]\d/i.test(band));
  if (!bands.length) return null;
  return {
    type,
    from: withChromosome(chromosome, bands[0]),
    to: withChromosome(chromosome, bands[1] || bands[0]),
  };
}

function derivativeSpec(parsed) {
  const rearrangement = parsed.rearrangement;
  if (!rearrangement || rearrangement.type !== "reciprocal translocation") return null;
  const partners = rearrangement.chromosomes || [];
  const bands = rearrangement.bands || [];
  if (partners.length !== 2 || bands.length < 2) return null;
  const derivative = String(parsed.chromosomes[0]);
  const left = String(partners[0]);
  const right = String(partners[1]);
  const ownIsLeft = derivative === left;
  if (!ownIsLeft && derivative !== right) return null;
  const own = ownIsLeft
    ? { chromosome: left, band: withChromosome(left, bands[0]), arm: bands[0][0].toLowerCase() }
    : { chromosome: right, band: withChromosome(right, bands[1]), arm: bands[1][0].toLowerCase() };
  const partner = ownIsLeft
    ? { chromosome: right, band: withChromosome(right, bands[1]), arm: bands[1][0].toLowerCase() }
    : { chromosome: left, band: withChromosome(left, bands[0]), arm: bands[0][0].toLowerCase() };
  const ownIsQ = own.arm === "q";
  return {
    type: "translocation_derivative",
    ...(ownIsQ ? { keep_through: own.band } : { keep_from: own.band }),
    attach_from: {
      chromosome: partner.chromosome,
      arm: partner.arm,
      band: partner.band,
      ...(ownIsQ === (partner.arm === "q") ? {} : { orientation: "reverse" }),
    },
  };
}

/**
 * Both derivatives implied by a two-break t(). The written token is not rewritten.
 * Returns null unless each der()t() can already be drawn.
 */
export function reciprocalDerivatives(token) {
  const parsed = parseAbnormality(String(token || "").trim());
  if (!parsed || parsed.type !== "reciprocal translocation") return null;
  const chromosomes = (parsed.chromosomes || []).map(String);
  const bands = (parsed.bands || []).filter((band) => /^[pq]\d/i.test(band));
  if (chromosomes.length !== 2 || bands.length !== 2) return null;
  if (!chromosomes.every((identity) => /^([1-9]|1\d|2[0-2]|X|Y)$/.test(identity))) return null;
  const stem = `t(${chromosomes[0]};${chromosomes[1]})(${bands[0]};${bands[1]})`;
  const pieces = chromosomes.map((identity) => ({ identity, variant: `der(${identity})${stem}` }));
  if (pieces.some((piece) => !segmentTransform(piece.variant))) return null;
  return pieces;
}

function namedBreakpoints(abnormality) {
  if (abnormality?.breakpointLabels?.length) return abnormality.breakpointLabels;
  const source = abnormality?.rearrangement?.bands?.length ? abnormality.rearrangement : abnormality;
  const bands = source?.bands || [];
  const chromosomes = source?.chromosomes?.length ? source.chromosomes : abnormality?.chromosomes || [];
  return bands.map((band, index) => {
    const text = String(band || "");
    if (/^(\d+|X|Y)/i.test(text)) return text;
    const chromosome = chromosomes[Math.min(index, Math.max(chromosomes.length - 1, 0))] || "";
    return `${chromosome}${text}`;
  }).filter(Boolean);
}

function variantOf(abnormality) {
  return abnormality?.variant || abnormality?.token || "";
}

function drawableIdentity(abnormality) {
  const variant = variantOf(abnormality);
  if (isModelled(variant)) return modelIdentity(variant);
  const identity = String(abnormality?.chromosomes?.[0] || "");
  if (IDENTITY_RE.test(identity) && segmentTransform(variant)) return identity;
  return "";
}

/** Every chromosome a single token implies: both derivatives of t() or ins(), or each derivative of a three-way t(). */
export function impliedDerivatives(token) {
  return reciprocalDerivatives(token) || modelDerivatives(token);
}

function undrawnNote(abnormality) {
  if (abnormality.kind === "numerical") return "Extra or missing chromosome. The karyogram shows it when the formula also writes the count and the sex complement.";
  if (abnormality.kind === "annotation") {
    return /^inc$/i.test(abnormality.token)
      ? "inc marks an incomplete karyotype. Some abnormalities may not be written."
      : "This refers to another clone in the formula. Clone composition is not expanded in this view.";
  }
  if (abnormality.type === "double minutes") return "Double minutes are small extrachromosomal fragments without a centromere. They are recorded, not drawn as a chromosome.";
  if (/^(\+|-)?\d*mar/i.test(abnormality.token)) return "mar is recorded here. A marker of unknown origin is not drawn in this view.";
  if (abnormality.type === "reciprocal translocation") return "Balanced translocation. Both derivatives are drawn in their own places when the formula writes two chromosomes and two breakpoints.";
  if (abnormality.kind === "unknown") return "Kept as written. No chromosome picture is assigned to this token.";
  if (/^add\(/i.test(abnormality.token)) return "add() is recorded here. Material of unknown origin is not drawn in this view.";
  if (/^mar/i.test(abnormality.token)) return "mar is recorded here. A marker of unknown origin is not drawn in this view.";
  if (/^(idic|ins)\(/i.test(abnormality.token)) return "This symbol is recorded here. A picture is not available for it in this view.";
  const label = abnormality.type || "structural change";
  return `${label.charAt(0).toUpperCase()}${label.slice(1)} is recorded here. A picture is not available for this symbol in this view.`;
}

function explorationItem(abnormality) {
  const variant = variantOf(abnormality);
  const shared = {
    token: abnormality.token,
    variant,
    type: abnormality.type,
    kind: abnormality.kind,
    chromosomes: abnormality.chromosomes || [],
    breakpoints: namedBreakpoints(abnormality),
    gain: Boolean(abnormality.gain),
    loss: Boolean(abnormality.loss),
    copies: abnormality.copies || 1,
  };
  const derivatives = impliedDerivatives(variant);
  if (derivatives?.length >= 2) {
    return { ...shared, drawn: true, identity: derivatives[0].identity, partner: "", derivatives, note: "" };
  }
  const identity = drawableIdentity(abnormality);
  const spec = identity && !isModelled(variant) ? segmentTransform(variant) : null;
  return {
    ...shared,
    drawn: Boolean(identity),
    identity,
    partner: spec?.partner || "",
    note: identity ? "" : undrawnNote(abnormality),
  };
}

/**
 * Read a supplied ISCN string into cell lines, breakpoints, and the
 * chromosomes this lab can already draw. The original text is not rewritten.
 */
export function exploreISCN(text) {
  const raw = String(text || "").trim();
  if (!raw) return { status: "empty", raw: "", lines: [] };
  if (!/^(?:mos\s+|chi\s+)?\d+(?:~\d+)?(?:<[^>]*>)?\s*,/i.test(raw)) {
    const single = parseAbnormality(raw);
    if (!single || single.kind === "unknown") return { status: "unsupported", raw, lines: [] };
    return { status: "token", raw, lines: [{ label: "Written change", count: null, sex: "", cloneSize: null, items: [explorationItem(single)] }] };
  }
  const parsed = parseISCN(raw);
  const usable = parsed.cellLines.filter((line) => Number.isFinite(line.count));
  if (!usable.length) return { status: "unsupported", raw, lines: [] };
  const prefix = raw.match(/^(mos|chi)\b/i)?.[1]?.toLowerCase() || "";
  return {
    status: usable.length > 1 ? "mosaic" : "formula",
    raw,
    prefix,
    lines: usable.map((line, index) => ({
      label: usable.length > 1 ? `Cell line ${index + 1}` : "",
      count: line.count,
      countRange: line.countRange,
      ploidy: line.ploidy,
      composite: line.composite,
      sex: line.sex || "",
      cloneSize: line.cloneSize,
      items: (line.abnormalities || []).map(explorationItem),
    })),
  };
}

function sexSentence(sex) {
  const value = String(sex || "").toUpperCase();
  if (value === "XY") return "XY is the male sex-chromosome complement: one X and one Y.";
  if (value === "XX") return "XX is the female sex-chromosome complement: two X chromosomes.";
  if (value === "X") return "A single X in the sex complement means no second normal sex chromosome is written there.";
  if (value === "XXY") return "XXY names two X chromosomes and one Y.";
  if (value === "XXX") return "XXX names three X chromosomes.";
  if (value === "XYY") return "XYY names one X chromosome and two Y chromosomes.";
  return `${value} is the sex-chromosome complement written after the count.`;
}

function tokenSentence(item) {
  const bands = item.breakpoints || [];
  const written = bands.length ? ` Written here: ${bands.join(", ")}.` : "";
  if (item.kind === "numerical") {
    const gain = String(item.token).startsWith("+");
    const name = String(item.token).slice(1);
    return gain
      ? `A plus sign before a chromosome name means an extra copy. ${item.token} is one extra chromosome ${name}.`
      : `A minus sign before a chromosome name means that chromosome is missing. ${item.token} is one missing chromosome ${name}.`;
  }
  if (item.type === "deletion") return `del names a deletion. The chromosome is in the first parentheses.${written}`;
  if (item.type === "duplication") return `dup names a duplication of the written segment.${written}`;
  if (item.type === "inversion") return `inv names an inversion. Bands written together, without a semicolon, are the two breaks on one chromosome.${written}`;
  if (item.type === "reciprocal translocation") return `t names a balanced translocation. A semicolon separates the chromosomes and their breakpoints. Each rearranged chromosome is written on its own as der().${written}`;
  if (item.type === "derivative chromosome" && /t\(/i.test(item.token)) return `der names the chromosome that keeps its centromere. The t() after it describes the exchange that built this derivative.${written}`;
  if (item.type === "derivative chromosome") return `der names a rearranged chromosome by the centromere it keeps.${written}`;
  if (item.type === "isochromosome") return `i names an isochromosome: two copies of one arm joined at the centromere.${written}`;
  if (item.type === "Robertsonian translocation") return `rob names a whole-arm fusion of two acrocentric chromosomes.${written}`;
  if (item.type === "ring chromosome") return `r names a ring formed when two broken ends of one chromosome join.${written}`;
  if (item.type === "marker chromosome") return "mar names a marker chromosome whose origin is not identified in the formula.";
  if (item.kind === "unknown") return "This token stays as written. This exercise does not assign it a separate meaning.";
  const label = item.type || "change";
  return `${label.charAt(0).toUpperCase()}${label.slice(1)} is the change named by this symbol.${written}`;
}

/**
 * One short sentence for each symbol this lab can name in a supplied string.
 * The original text is not rewritten.
 */
export function symbolSentences(text) {
  const report = exploreISCN(text);
  if (report.status === "empty" || report.status === "unsupported") return [];
  const sentences = [];
  if (report.prefix === "mos") sentences.push({ symbol: "mos", sentence: "mos means more than one cell line is present in the same person." });
  if (report.prefix === "chi") sentences.push({ symbol: "chi", sentence: "chi means the cell lines come from more than one zygote." });
  if (report.status === "mosaic") sentences.push({ symbol: "/", sentence: "A slash separates one cell line from the next. Each line keeps its own count and sex complement." });
  if (report.status !== "token") sentences.push({ symbol: ",", sentence: "Commas separate the chromosome count, the sex-chromosome complement, and each abnormality." });
  const breakpoints = [];
  for (const line of report.lines) {
    const where = line.label ? ` for ${line.label.toLowerCase()}` : "";
    if (Number.isFinite(line.count)) sentences.push({ symbol: String(line.count), sentence: `${line.count} is the chromosome count${where}, written before the first comma.` });
    if (line.sex) sentences.push({ symbol: line.sex, sentence: sexSentence(line.sex) });
    for (const item of line.items || []) {
      sentences.push({ symbol: item.token, sentence: tokenSentence(item) });
      breakpoints.push(...(item.breakpoints || []));
    }
    if (Number.isFinite(line.cloneSize)) sentences.push({ symbol: `[${line.cloneSize}]`, sentence: "The number in square brackets is how many cells showed that cell line." });
  }
  if (breakpoints.length) {
    const sample = breakpoints[0];
    sentences.push({ symbol: sample, sentence: `A band address such as ${sample} names the chromosome, the arm (p or q), and the band. Numbering starts at the centromere and increases toward the telomere.` });
  }
  return sentences;
}
