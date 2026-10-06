/**
 * ISCN parsing and component comparison.
 * Only interprets strings supplied by cases or students — it does not invent abnormalities.
 */

const SEX_RE = /^(X{1,5}|Y{1,4}|X{1,4}Y{1,2}|X{0,4}Y{1,3})$/i;

export function stripSpace(str) {
  return String(str || "").replace(/\s+/g, "").trim();
}

export function normalizeISCN(str) {
  const parts = stripSpace(str).split("/").map(normalizeCellLine).filter(Boolean);
  return parts.join("/");
}

function normalizeCellLine(line) {
  if (!line) return "";
  const clone = line.match(/^(.+?)\[(\d+)\]$/);
  const body = clone ? clone[1] : line;
  const size = clone ? `[${clone[2]}]` : "";
  const bits = body.split(",").filter(Boolean);
  if (!bits.length) return "";
  bits[0] = bits[0].replace(/[^\d]/g, "");
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
  const clone = line.match(/^(.+?)\[(\d+)\]$/);
  const body = clone ? clone[1] : line;
  const cloneSize = clone ? Number(clone[2]) : null;
  const bits = body.split(",").filter(Boolean);
  const count = Number(bits[0]);
  const sex = (bits[1] || "").toUpperCase();
  const abnormalities = bits.slice(2).map(parseAbnormality);
  return { count, sex, abnormalities, cloneSize, raw: line };
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
  if ((m = t.match(/^(del|dup|inv|r|i|rob|add)\(([^)]+)\)(?:\(([^)]+)\))?$/i))) {
    const abbr = m[1].toLowerCase();
    const map = {
      del: "deletion",
      dup: "duplication",
      inv: "inversion",
      r: "ring chromosome",
      i: "isochromosome",
      rob: "Robertsonian translocation",
      add: "derivative chromosome",
    };
    return {
      token: t,
      kind: "structural",
      type: map[abbr],
      chromosomes: splitChromList(m[2]),
      ...parseBreakpoints(m[3]),
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
    return {
      token: t,
      kind: "structural",
      type: "derivative chromosome",
      chromosomes: splitChromList(m[1]),
      arms: [],
      bands: [],
      remainder: m[2] || "",
    };
  }
  if (/^mar/i.test(t)) {
    return { token: t, kind: "structural", type: "marker chromosome", chromosomes: [], arms: [], bands: [] };
  }
  return { token: t, kind: "unknown", type: "unknown", chromosomes: [], arms: [], bands: [] };
}

function splitChromList(s) {
  return String(s || "")
    .split(";")
    .map((x) => x.trim())
    .filter(Boolean);
}

function parseBreakpoints(bp) {
  if (!bp) return { arms: [], bands: [] };
  const parts = bp.split(";").map((p) => p.trim());
  const arms = parts.map((p) => (p.match(/[pq]/) || [""])[0]).filter(Boolean);
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
