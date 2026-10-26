/**
 * Whole-karyotype interpretation from a written ISCN formula.
 *
 * Every clone is built with the same karyogram and derivative engine that
 * draws chromosomes elsewhere in the lab. Copy number is counted band by band
 * from those drawn segments, so a picture and its imbalance table cannot
 * disagree. Material of unknown origin (add, mar, hsr, dmin) is listed as
 * unresolved and never assigned to a chromosome.
 *
 * Correction suggestions only check the formula against itself and against
 * ISCN writing order. They never use a stored answer.
 */

import { describeKaryogram, drawnSegments, inferPloidy } from "./chromosomes.js?v=20261026p5";
import { exploreISCN } from "./iscn.js";
import { bandInterval } from "./band-links.js";
import { labelCovers } from "./banding.js?v=20261024c";

export const ORDER = [...Array.from({ length: 22 }, (_, i) => String(i + 1)), "X", "Y"];
const AUTOSOME_RE = /^(?:[1-9]|1\d|2[0-2])$/;
const ACROCENTRIC = new Set(["13", "14", "15", "21", "22"]);
const CLONE_REF_RE = /^(IDEM|SL|SDL(\d*))$/i;
const UNRESOLVED_RE = /^[+-]?\d*(?:mar|dmin)\d*$|^[+-]?(?:add|hsr)\(/i;

function chromosomeRank(id) {
  const value = String(id || "").toUpperCase();
  if (value === "X") return -2;
  if (value === "Y") return -1;
  const n = Number(value);
  return Number.isFinite(n) ? n : 99;
}

function cloneReference(line, index) {
  const sex = String(line.sex || "");
  const own = (line.items || []).find((item) => item.kind === "annotation" && CLONE_REF_RE.test(item.token));
  const match = (CLONE_REF_RE.test(sex) ? sex : own?.token || "").match(CLONE_REF_RE);
  if (!match) return null;
  const word = match[1].toUpperCase();
  if (word === "IDEM" || word === "SL") return { word: word.toLowerCase(), base: 0 };
  const n = match[2] ? Number(match[2]) : null;
  return { word: `sdl${match[2] || ""}`, base: n ? n : Math.max(0, index - 1) };
}

/** Clones with idem, sl, and sdl expanded to the abnormalities they inherit. */
export function resolveClones(report) {
  const resolved = [];
  (report?.lines || []).forEach((line, index) => {
    const ref = index > 0 ? cloneReference(line, index) : null;
    const base = ref ? resolved[Math.min(ref.base, resolved.length - 1)] : null;
    const own = (line.items || []).filter((item) => !(item.kind === "annotation" && CLONE_REF_RE.test(item.token)));
    const inherited = base ? base.items.map((item) => ({ ...item, inherited: true })) : [];
    resolved.push({
      index,
      label: `Clone ${index + 1}`,
      count: line.count,
      countRange: line.countRange || null,
      ploidy: line.ploidy || null,
      composite: Boolean(line.composite),
      cloneSize: Number.isFinite(line.cloneSize) ? line.cloneSize : null,
      sex: base && (!line.sex || CLONE_REF_RE.test(line.sex)) ? base.sex : String(line.sex || ""),
      reference: ref ? { word: ref.word, clone: base ? base.index : null } : null,
      ownItems: own,
      items: [...inherited, ...own],
    });
  });
  return resolved;
}

function isMale(clone) {
  if (/Y/i.test(clone.sex)) return true;
  return clone.items.some((item) => item.kind === "numerical" && /^[+-]Y$/i.test(item.token));
}

function baselineFor(clone) {
  const male = isMale(clone);
  const ploidy = inferPloidy(clone.count, clone.ploidy, clone.countRange);
  const sex = String(clone.sex || "").toUpperCase();
  const base = {};
  for (const id of ORDER) base[id] = AUTOSOME_RE.test(id) ? ploidy : 0;
  if (ploidy === 2) {
    // Diploid: compare with a normal XX or XY. Sex aneuploidy written in the
    // sex field (45,X or 47,XXY) then shows as a net gain or loss.
    base.X = male ? 1 : 2;
    base.Y = male ? 1 : 0;
  } else {
    // Near-triploid or tetraploid: the written sex complement is the baseline.
    // Extra or missing sex chromosomes beyond that must be written with +X / -Y.
    base.X = (sex.match(/X/g) || []).length;
    base.Y = (sex.match(/Y/g) || []).length;
    if (base.X + base.Y === 0) {
      base.X = male ? Math.ceil(ploidy / 2) : ploidy;
      base.Y = male ? Math.floor(ploidy / 2) : 0;
    }
  }
  return {
    copies: base,
    sex: male ? "male" : "female",
    ploidy,
    label: ploidy === 1 ? "haploid" : ploidy === 3 ? "triploid" : ploidy === 4 ? "tetraploid" : "diploid",
  };
}

function referenceSegments(maps, id) {
  return (maps?.chromosomes?.[id]?.segments || []).filter((segment) => segment.role !== "centromere");
}

function bandKey(segment) {
  return `${segment.origin || segment.chromosome}|${segment.id}`;
}

function unresolvedReason(item) {
  const token = String(item.token || "");
  if (/mar/i.test(token)) return "Marker chromosome of unknown origin. Its content and copy number are not assigned.";
  if (/dmin/i.test(token)) return "Double minutes carry amplified material of unknown origin. They are not counted as chromosomes.";
  if (/^[+-]?hsr\(/i.test(token)) return "Homogeneously staining region: amplified material of unknown origin at this site.";
  if (/^[+-]?add\(/i.test(token)) return "Material of unknown origin replaces the segment distal to the breakpoint. The loss is counted; the added material is not.";
  return "Recorded but not resolved to chromosome content.";
}

function originOf(segment, fallback) {
  return String(segment.origin || segment.chromosome || fallback);
}

function referenceFor(maps, origin, segment) {
  const segments = maps?.chromosomes?.[origin]?.segments || [];
  return segments.find((item) => item.role !== "centromere" && item.label === segment.label)
    || segments.find((item) => item.id === segment.id)
    || null;
}

/**
 * Segments that sit at a join between two chromosomes inside a written
 * breakpoint band. The break falls somewhere inside that band, so each side
 * of the join holds only part of it and counts as half a copy.
 */
function junctionHalves(segments, breakpoints, identity) {
  const halves = new Set();
  const inBreakpoint = (segment) => segment && segment.role !== "centromere" && segment.role !== "unknown"
    && breakpoints.some((band) => labelCovers(band, segment.label));
  const labelCount = new Map();
  for (const segment of segments) labelCount.set(segment.label, (labelCount.get(segment.label) || 0) + 1);
  const extend = (start, step) => {
    for (let i = start; i >= 0 && i < segments.length; i += step) {
      const segment = segments[i];
      if (segment.role === "centromere" || !inBreakpoint(segment) || labelCount.get(segment.label) > 1) break;
      if (i !== start && originOf(segment, identity) !== originOf(segments[start], identity)) break;
      halves.add(segment);
    }
  };
  for (let i = 0; i < segments.length - 1; i += 1) {
    const left = segments[i];
    const right = segments[i + 1];
    const foreign = left.role === "unknown" || right.role === "unknown"
      || (left.role !== "centromere" && right.role !== "centromere" && originOf(left, identity) !== originOf(right, identity));
    if (!foreign) continue;
    if (left.role !== "unknown") extend(i, -1);
    if (right.role !== "unknown") extend(i + 1, 1);
  }
  return halves;
}

function tallyClone(maps, chromosomes, breakpoints) {
  const tally = new Map();
  const unknown = [];
  const undrawn = [];
  for (const chromosome of chromosomes) {
    const segments = drawnSegments(chromosome.identity, chromosome.variant);
    if (!segments) { undrawn.push(chromosome); continue; }
    const halves = chromosome.variant === "normal" ? new Set() : junctionHalves(segments, breakpoints, chromosome.identity);
    for (const segment of segments) {
      if (segment.role === "centromere") continue;
      if (segment.role === "unknown" || segment.unknown) {
        unknown.push({ chromosome, segment });
        continue;
      }
      const origin = originOf(segment, chromosome.identity);
      const reference = referenceFor(maps, origin, segment);
      if (!reference) continue;
      let share = reference.weight ? Math.min(1, (Number(segment.weight) || reference.weight) / reference.weight) : 1;
      if (halves.has(segment)) share *= 0.5;
      const key = bandKey({ origin, id: reference.id });
      tally.set(key, (tally.get(key) || 0) + share);
    }
  }
  return { tally, unknown, undrawn };
}

function roundHalf(value) {
  return Math.round(value * 2) / 2;
}

function imbalanceRuns(maps, tally, baseline, skipSex) {
  const runs = [];
  for (const id of ORDER) {
    if (skipSex && (id === "X" || id === "Y")) continue;
    const expected = baseline[id] || 0;
    const segments = referenceSegments(maps, id);
    if (!segments.length) continue;
    let run = null;
    const close = () => {
      if (run && run.delta !== 0) runs.push(run);
      run = null;
    };
    for (const segment of segments) {
      const copies = roundHalf(tally.get(`${id}|${segment.id}`) || 0);
      const delta = copies - expected;
      if (run && run.delta === delta && run.copies === copies) {
        run.to = segment;
        run.bands += 1;
        continue;
      }
      close();
      run = { chromosome: id, copies, expected, delta, from: segment, to: segment, bands: 1 };
    }
    close();
    for (const item of runs.filter((r) => r.chromosome === id)) {
      item.whole = item.from === segments[0] && item.to === segments[segments.length - 1];
      const arm = segments.filter((segment) => segment.arm === item.from.arm);
      item.arm = !item.whole && item.from.arm === item.to.arm && item.from === arm[0] && item.to === arm[arm.length - 1] ? item.from.arm : "";
      item.partial = !Number.isInteger(item.delta);
      item.startBp = item.from.start_bp;
      item.endBp = item.to.end_bp;
    }
  }
  return runs.map((run) => ({ ...run, description: describeRun(run) }));
}

function describeRun(run) {
  const kind = run.delta > 0 ? "Gain" : "Loss";
  const amount = Math.abs(run.delta);
  let region;
  if (run.whole) region = `whole chromosome ${run.chromosome}`;
  else if (run.arm) region = `${run.chromosome}${run.arm} (whole ${run.arm === "p" ? "short" : "long"} arm)`;
  else region = run.from.label === run.to.label ? run.from.label : `${run.from.label}→${run.to.label.replace(run.chromosome, "")}`;
  if (run.usual) {
    return `Usual loss of the short arm of acrocentric chromosome ${run.chromosome} in a Robertsonian or whole-arm fusion. The satellite short arms are typically lost and are not reported as an unbalanced finding.`;
  }
  if (run.partial) return `${kind} of part of ${region}. The break lies inside this band, so the exact extent is not known at band level.`;
  const copies = amount === 1 ? "one copy" : `${amount} copies`;
  return `${kind} of ${copies}: ${region}`;
}

/** Short net-imbalance notation, CyDAS style: +8, -7, +1q21.1q44, -5q13.1q33.3. */
export function imbalanceNotation(run) {
  const sign = run.delta > 0 ? "+" : "-";
  if (run.usual) return `${sign}${run.chromosome}${run.arm || "p"}(usual)`;
  if (run.partial) {
    const from = run.from.label.replace(run.chromosome, "");
    const to = run.to.label.replace(run.chromosome, "");
    return `${sign}${run.chromosome}${from}${from === to ? "" : to}(part)`;
  }
  const times = Math.abs(run.delta) > 1 ? `x${Math.abs(run.delta)}` : "";
  if (run.whole) return `${sign}${run.chromosome}${times}`;
  if (run.arm) return `${sign}${run.chromosome}${run.arm}${times}`;
  const from = run.from.label.replace(run.chromosome, "");
  const to = run.to.label.replace(run.chromosome, "");
  return `${sign}${run.chromosome}${from}${from === to ? "" : to}${times}`;
}

/** Mark short-arm losses of acrocentrics that sit with a rob() or whole-arm dic() as usual. */
function markUsualAcrocentricLosses(runs, clone) {
  const fused = new Set();
  for (const item of clone.items || []) {
    if (!/^(rob|dic)\(/i.test(item.token)) continue;
    for (const id of item.chromosomes || []) if (ACROCENTRIC.has(String(id))) fused.add(String(id));
  }
  if (!fused.size) return runs;
  return runs.map((run) => (
    run.delta < 0 && run.arm === "p" && fused.has(run.chromosome)
      ? { ...run, usual: true, description: describeRun({ ...run, usual: true }) }
      : run
  ));
}

function countable(item) {
  return item.kind !== "annotation";
}

function complexityOf(clone, breakpoints) {
  const items = clone.items.filter(countable);
  const structural = items.filter((item) => item.kind !== "numerical");
  const numerical = items.filter((item) => item.kind === "numerical");
  const weight = (item) => Math.max(1, Number(item.copies) || 1);
  const total = items.reduce((sum, item) => sum + weight(item), 0);
  const monosomies = numerical.filter((item) => /^-(?:[1-9]|1\d|2[0-2])$/.test(item.token)).length;
  const chromosomes = new Set();
  for (const item of items) {
    for (const id of item.chromosomes || []) if (/^(?:[1-9]|1\d|2[0-2]|X|Y)$/.test(String(id))) chromosomes.add(String(id));
  }
  return {
    abnormalities: total,
    structural: structural.reduce((sum, item) => sum + weight(item), 0),
    numerical: numerical.reduce((sum, item) => sum + weight(item), 0),
    breakpoints: breakpoints.length,
    chromosomesInvolved: [...chromosomes].sort((a, b) => chromosomeRank(a) - chromosomeRank(b)),
    complex: total >= 3,
    monosomal: monosomies >= 2 || (monosomies >= 1 && structural.length >= 1),
    monosomies,
  };
}

function breakpointsOf(maps, clone) {
  const seen = new Map();
  for (const item of clone.items) {
    for (const band of item.breakpoints || []) {
      const key = `${band}|${item.token}`;
      if (seen.has(key)) continue;
      const interval = bandInterval(maps, band);
      seen.set(key, {
        band,
        chromosome: interval?.chromosome || String(band).match(/^(\d+|X|Y)/)?.[1] || "",
        token: item.token,
        type: item.type || "",
        start: interval ? interval.start : null,
        end: interval ? interval.end : null,
        mapped: Boolean(interval),
        centromeric: /[pq]10$/i.test(band),
      });
    }
  }
  return [...seen.values()].sort((a, b) => chromosomeRank(a.chromosome) - chromosomeRank(b.chromosome) || (a.start ?? 0) - (b.start ?? 0));
}

function analyzeClone(maps, clone) {
  const breakpoints = breakpointsOf(maps, clone);
  const complexity = complexityOf(clone, breakpoints);
  const unresolved = clone.items
    .filter((item) => UNRESOLVED_RE.test(item.token) || UNRESOLVED_RE.test(item.variant || ""))
    .map((item) => ({ token: item.token, reason: unresolvedReason(item) }));
  const notCounted = clone.items
    .filter((item) => item.kind !== "numerical" && item.kind !== "annotation" && !item.drawn && !UNRESOLVED_RE.test(item.token))
    .map((item) => ({ token: item.token, reason: item.note || "This symbol is not built by the drawing engine, so its content is not counted." }));
  const annotations = clone.items.filter((item) => item.kind === "annotation").map((item) => item.token);
  const base = { ...clone, breakpoints, complexity, unresolved, notCounted, annotations };
  if (!clone.sex || CLONE_REF_RE.test(clone.sex)) {
    return { ...base, model: null, imbalances: [], status: "no-sex", note: "The sex complement is not written, so copy number cannot be counted for this clone." };
  }
  const baseline = baselineFor(clone);
  if (baseline.ploidy > 4) {
    return { ...base, model: null, imbalances: [], status: "ploidy", note: "This clone is beyond tetraploid. Copy number is not counted against a baseline higher than 4n in this lab." };
  }
  const model = describeKaryogram(clone.sex, clone.items, clone.count, { ploidy: baseline.ploidy });
  if (!model) return { ...base, model: null, imbalances: [], status: "no-model", note: "This clone could not be built." };
  const { tally, unknown, undrawn } = tallyClone(maps, model.chromosomes, breakpoints.filter((row) => row.mapped).map((row) => row.band));
  const imbalances = markUsualAcrocentricLosses(imbalanceRuns(maps, tally, baseline.copies, false), clone);
  const unknownChromosomes = new Set(unknown.map((entry) => entry.chromosome));
  return {
    ...base,
    model,
    baseline,
    drawnCount: model.drawnCount,
    imbalances,
    unknownMaterial: unknownChromosomes.size,
    undrawn,
    status: "ok",
    note: "",
  };
}

function relationOf(clones, clone) {
  if (clone.index === 0) return "stemline";
  if (clone.reference) return clone.reference.word === "sdl" || clone.reference.word.startsWith("sdl") ? "sideline of a sideline" : "sideline";
  const abnormal = clone.items.filter(countable);
  if (!abnormal.length) return "normal";
  const mine = new Set(abnormal.map((item) => item.token));
  const shared = clones.slice(0, clone.index).some((other) => other.items.some((item) => mine.has(item.token)));
  return shared ? "related" : "unrelated";
}

function compareClones(clones) {
  if (clones.length < 2) return null;
  const abnormal = clones.filter((clone) => clone.items.some(countable));
  const sets = abnormal.map((clone) => new Set(clone.items.filter(countable).map((item) => item.token)));
  const shared = sets.length ? [...sets[0]].filter((token) => sets.every((set) => set.has(token))) : [];
  const total = clones.reduce((sum, clone) => sum + (clone.cloneSize || 0), 0);
  return {
    totalCells: total || null,
    shared,
    rows: clones.map((clone) => ({
      index: clone.index,
      label: clone.label,
      relation: relationOf(clones, clone),
      cells: clone.cloneSize,
      percent: total && clone.cloneSize != null ? Math.round(clone.cloneSize / total * 100) : null,
      specific: clone.items.filter(countable).map((item) => item.token).filter((token) => !shared.includes(token)),
      inheritedFrom: clone.reference ? clone.reference.clone : null,
    })),
  };
}

/* ---------- correction suggestions ---------- */

function splitTopLevel(text, separator) {
  const parts = [];
  let depth = 0;
  let current = "";
  for (const char of text) {
    if (char === "(") depth += 1;
    if (char === ")") depth = Math.max(0, depth - 1);
    if (char === separator && depth === 0) { parts.push(current); current = ""; continue; }
    current += char;
  }
  parts.push(current);
  return parts;
}

function tokenChromosome(token) {
  const bare = String(token).replace(/^[+-]/, "");
  const inner = bare.match(/\(([^)]*)\)/)?.[1];
  if (inner) {
    const ids = inner.split(";").map((id) => id.trim().toUpperCase()).filter((id) => /^(?:[1-9]|1\d|2[0-2]|X|Y)$/.test(id));
    if (ids.length) return ids.reduce((low, id) => (chromosomeRank(id) < chromosomeRank(low) ? id : low));
  }
  const whole = bare.match(/^(\d+|X|Y)$/i);
  return whole ? whole[1].toUpperCase() : null;
}

function tokenOrderKey(token) {
  const bare = String(token).replace(/^[+-]/, "");
  if (/^(?:idem|sl|sdl\d*)$/i.test(bare)) return [-10, 0, 0];
  if (/mar|dmin/i.test(bare)) return [200, /dmin/i.test(bare) ? 1 : 0, 0];
  if (/^inc$/i.test(bare)) return [300, 0, 0];
  const chromosome = tokenChromosome(token);
  const numerical = /^[+-](\d+|X|Y)$/i.test(token);
  return [chromosome == null ? 150 : chromosomeRank(chromosome), numerical ? 0 : 1, 0];
}

function compareKeys(a, b) {
  for (let i = 0; i < a.length; i += 1) if (a[i] !== b[i]) return a[i] - b[i];
  return 0;
}

/** Abnormalities in ISCN writing order: sex chromosomes, autosomes by number, numerical before structural, markers last. */
export function orderTokens(tokens) {
  return (tokens || [])
    .map((token, index) => ({ token, index, key: tokenOrderKey(token) }))
    .sort((a, b) => compareKeys(a.key, b.key) || a.index - b.index)
    .map((entry) => entry.token);
}

function splitLine(text) {
  const match = text.match(/^(.*?)(\[[^\]]*\])?$/);
  const body = match[1];
  const size = match[2] || "";
  return { fields: splitTopLevel(body, ","), size };
}

function swappedTranslocation(token) {
  const match = token.match(/^([+-]?)t\(([^;()]+);([^;()]+)\)\(([^;()]+);([^;()]+)\)$/i);
  if (!match) return null;
  const [, sign, a, b, ba, bb] = match;
  if (chromosomeRank(a.toUpperCase()) <= chromosomeRank(b.toUpperCase())) return null;
  return `${sign}t(${b};${a})(${bb};${ba})`;
}

/**
 * Suggested edits to a written formula. Each suggestion carries the full
 * corrected formula; nothing is applied until the reader confirms it.
 */
export function formulaSuggestions(text, analysis = null) {
  const raw = String(text || "");
  const suggestions = [];
  const add = (id, message, next) => {
    if (next != null && next !== raw) suggestions.push({ id, kind: "fix", message, formula: next });
  };
  const note = (id, message) => suggestions.push({ id, kind: "note", message, formula: null });

  const dashes = raw.replace(/[\u2212\u2013\u2014]/g, "-");
  if (dashes !== raw) add("dash", "A minus sign is written with the ASCII hyphen (-) in ISCN.", dashes);

  const prefix = raw.match(/^\s*(mos|chi)\s+/i);
  const spaced = (prefix ? `${prefix[1].toLowerCase()} ` : "") + raw.slice(prefix ? prefix[0].length : 0).replace(/\s+/g, "");
  if (spaced !== raw.trim() || raw !== raw.trim()) add("spaces", "ISCN is written without spaces, apart from the space after mos or chi.", spaced);

  const clean = spaced.replace(/[\u2212\u2013\u2014]/g, "-");
  const head = (clean.match(/^(?:mos|chi)\s+/i) || [""])[0];
  const lines = splitTopLevel(clean.slice(head.length), "/");
  let reordered = false;
  let swapped = false;
  let sexFixed = false;
  const rebuilt = lines.map((line) => {
    const { fields, size } = splitLine(line);
    if (fields.length < 2) return line;
    const [count, sexField, ...tokens] = fields;
    let sex = sexField;
    if (/^[xy]+$/i.test(sex) && sex !== sex.toUpperCase()) { sex = sex.toUpperCase(); sexFixed = true; }
    const fixedTokens = tokens.map((token) => {
      const swap = swappedTranslocation(token);
      if (swap) { swapped = true; return swap; }
      return token;
    });
    const sorted = fixedTokens
      .map((token, index) => ({ token, index, key: tokenOrderKey(token) }))
      .sort((a, b) => compareKeys(a.key, b.key) || a.index - b.index)
      .map((entry) => entry.token);
    if (sorted.join(",") !== fixedTokens.join(",")) reordered = true;
    return [count, sex, ...sorted].join(",") + size;
  });
  const reorderedText = head + rebuilt.join("/");
  if (sexFixed || swapped || reordered) {
    const reasons = [];
    if (sexFixed) reasons.push("the sex chromosomes are written in capitals");
    if (swapped) reasons.push("a two-way t() lists the sex chromosome or lower-numbered chromosome first, with its breakpoint first");
    if (reordered) reasons.push("abnormalities follow sex chromosomes first, then autosomes in numerical order, with a numerical change before a structural change of the same chromosome, and markers last");
    add("order", `In ISCN ${reasons.join("; ")}.`, reorderedText);
  }

  const result = analysis;
  if (result?.clones?.length) {
    const countFixed = [...lines];
    let countChanged = false;
    result.clones.forEach((clone, index) => {
      if (clone.status !== "ok" || clone.countRange || clone.composite) return;
      if (clone.unresolved.some((item) => /dmin/i.test(item.token)) && clone.drawnCount === clone.count) return;
      if (clone.notCounted.length || clone.undrawn?.length) return;
      if (clone.drawnCount !== clone.count && lines[index]) {
        countFixed[index] = lines[index].replace(/^\d+/, String(clone.drawnCount));
        countChanged = true;
        note(`count-${index}`, `${clone.label}: the written count is ${clone.count}, but the listed abnormalities give ${clone.drawnCount} chromosomes.`);
      }
    });
    if (countChanged) add("count", "Change the chromosome count to match the abnormalities that are written. Check the abnormalities first: a missing token gives the same mismatch.", head + countFixed.join("/"));
    if (result.clones.length > 1 && result.clones.some((clone) => clone.cloneSize == null)) {
      note("clone-size", "Each clone in a mosaic or neoplastic karyotype normally ends with the number of cells in square brackets, for example [12].");
    }
    for (const clone of result.clones) {
      for (const row of clone.breakpoints.filter((item) => !item.mapped && !item.centromeric)) {
        note(`band-${clone.index}-${row.band}`, `${clone.label}: ${row.band} in ${row.token} is not a band on the GRCh38 band map used here.`);
      }
    }
  }
  return suggestions.filter((item, index, all) => all.findIndex((other) => other.id === item.id) === index);
}

/**
 * Analyze a complete formula. maps is the GRCh38 band map; it must already be
 * bound to the chromosome engine with bindChromosomeMaps.
 */
export function analyzeFormula(maps, text, options = {}) {
  const raw = String(text || "").trim();
  const report = exploreISCN(raw);
  if (!raw) return { status: "empty", raw, clones: [] };
  if (report.status === "unsupported" || report.status === "token" || !report.lines?.length) {
    return { status: "unsupported", raw, clones: [], suggestions: options.skipSuggestions ? [] : formulaSuggestions(raw, { clones: [] }) };
  }
  const clones = resolveClones(report).map((clone) => analyzeClone(maps, clone));
  const analysis = {
    status: "ok",
    raw,
    prefix: report.prefix || "",
    clones,
    comparison: compareClones(clones),
  };
  analysis.suggestions = options.skipSuggestions ? [] : formulaSuggestions(raw, analysis);
  return analysis;
}
