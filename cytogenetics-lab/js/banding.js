/**
 * Hierarchical band nomenclature and segment transformations.
 * Structured maps in data/chromosome-maps.json are the source of truth.
 */

import { shuffle } from "./util.js";

export function parseBandLabel(label) {
  const raw = String(label || "").trim();
  if (!raw) return null;
  if (/^(cen|centromere)$/i.test(raw)) {
    return { chromosome: null, arm: "cen", region: null, band: null, subband: null, role: "centromere", label: "cen" };
  }
  const m = raw.match(/^(\d+|X|Y)\s*([pq])\s*(\d)(?:(\d))?(?:\.(\d+))?$/i);
  if (!m) return null;
  return {
    chromosome: m[1].toUpperCase(),
    arm: m[2].toLowerCase(),
    region: Number(m[3]),
    band: m[4] != null ? Number(m[4]) : null,
    subband: m[5] != null ? Number(m[5]) : null,
    role: "band",
    label: raw.replace(/\s+/g, ""),
  };
}

export function locusString(parts) {
  if (!parts || parts.arm === "cen") return "cen";
  let s = `${parts.chromosome || ""}${parts.arm || ""}`;
  if (parts.region != null) s += String(parts.region);
  if (parts.band != null) s += String(parts.band);
  if (parts.subband != null) s += `.${parts.subband}`;
  return s;
}

export function resolutionKey(seg, level) {
  if (seg.role === "unknown") return seg.id || "unknown";
  if (seg.role === "centromere" || seg.arm === "cen") return `${seg.chromosome || ""}cen`;
  if (level === "region") return `${seg.chromosome}${seg.arm}${seg.region}`;
  if (level === "band") {
    if (seg.band == null) return `${seg.chromosome}${seg.arm}${seg.region}`;
    return `${seg.chromosome}${seg.arm}${seg.region}${seg.band}`;
  }
  if (level === "550") {
    if (seg.band == null) return `${seg.chromosome}${seg.arm}${seg.region}`;
    const first = seg.subband == null ? "" : String(seg.subband)[0];
    return `${seg.chromosome}${seg.arm}${seg.region}${seg.band}${first ? `.${first}` : ""}`;
  }
  return seg.label || seg.id;
}

/** Display resolutions. 400 and 550 are approximated by merging the 850-level map. */
export const RESOLUTIONS = [
  { id: "400", label: "400 bands", level: "band" },
  { id: "550", label: "550 bands", level: "550" },
  { id: "detailed", label: "Detailed", level: null },
];

/**
 * Merge drawn segments to a coarser band level. Each merged band takes the
 * stain that covers most of its length. Origin and orientation are kept.
 */
export function piecesAtResolution(segments, resolution) {
  const level = RESOLUTIONS.find((item) => item.id === String(resolution || ""))?.level;
  if (!level || !segments?.length) return segments;
  return flattenToLevel(segments, level).map((group) => ({ ...group, stain: dominantStain(group.members), collapsed: true }));
}

function dominantStain(members) {
  const totals = new Map();
  for (const member of members || []) {
    if (member.role === "centromere") continue;
    const stain = member.stain ?? 0;
    totals.set(stain, (totals.get(stain) || 0) + (member.weight || 1));
  }
  let best = members?.[0]?.stain ?? 0;
  let most = -1;
  for (const [stain, total] of totals) {
    if (total > most || (total === most && stain > best)) {
      best = stain;
      most = total;
    }
  }
  return best;
}

export function flattenToLevel(segments, level = "band") {
  const groups = [];
  for (const seg of segments) {
    const key = resolutionKey(seg, level);
    const prev = groups[groups.length - 1];
    if (prev && prev.key === key && prev.orientation === (seg.orientation || "forward")) {
      prev.members.push(seg);
      prev.weight += seg.weight || 1;
      prev.translocated = prev.translocated || Boolean(seg.translocated);
      prev.inverted = prev.inverted || Boolean(seg.inverted);
      continue;
    }
    const parsed = parseBandLabel(seg.role === "centromere" ? "cen" : key) || {};
    const isCen = seg.role === "centromere" || seg.arm === "cen";
    groups.push({
      key,
      id: key,
      label: isCen ? "cen" : seg.role === "unknown" ? seg.label : key,
      chromosome: seg.chromosome,
      arm: seg.arm,
      region: parsed.region ?? seg.region,
      band: level === "region" ? null : (parsed.band ?? seg.band),
      subband: level === "subband" ? (parsed.subband ?? seg.subband) : level === "550" ? (parsed.subband ?? null) : null,
      role: isCen ? "centromere" : (seg.role || "band"),
      stain: seg.stain,
      weight: seg.weight || 1,
      orientation: seg.orientation || "forward",
      origin: seg.origin || seg.chromosome,
      inverted: Boolean(seg.inverted),
      translocated: Boolean(seg.translocated),
      parent_region: isCen ? "cen" : `${seg.chromosome}${seg.arm}${seg.region}`,
      members: [seg],
    });
  }
  return groups.map((g, i) => ({ ...g, proximal_order: i }));
}

export function cloneSegments(segments) {
  return (segments || []).map((s) => ({ ...s, members: undefined }));
}

/** A published band name covers itself and its finer subdivisions. 9q34 covers 9q34.11. 5p15.3 covers 5p15.33. */
export function labelCovers(query, label) {
  const q = String(query || "").replace(/\s+/g, "");
  const lab = String(label || "").replace(/\s+/g, "");
  if (!q || !lab) return false;
  if (q === lab) return true;
  if (!lab.startsWith(q)) return false;
  const extra = lab.slice(q.length);
  if (extra.startsWith(".")) return true;
  return q.includes(".") && /^\d+$/.test(extra);
}

export function segmentMatches(seg, query) {
  if (!seg || query == null || query === "") return false;
  const q = String(query).replace(/\s+/g, "");
  if ([seg.id, seg.label, seg.parent_band].some((value) => labelCovers(q, value))) return true;
  if (seg.parent_region && seg.parent_region === q) return true;
  return resolutionKey(seg, "band") === q || resolutionKey(seg, "region") === q;
}

function matchesLabels(seg, labels) {
  return (labels || []).some((label) => segmentMatches(seg, label));
}

function matchSpan(segments, query) {
  const hits = [];
  (segments || []).forEach((seg, index) => {
    if (segmentMatches(seg, query)) hits.push(index);
  });
  if (!hits.length) return null;
  return { start: hits[0], end: hits[hits.length - 1] };
}

function inRange(seg, fromLabel, toLabel, all) {
  if (!fromLabel && !toLabel) return false;
  const from = matchSpan(all, fromLabel);
  const to = matchSpan(all, toLabel);
  if (!from || !to) return matchesLabels(seg, [fromLabel, toLabel].filter(Boolean));
  const lo = Math.min(from.start, to.start);
  const hi = Math.max(from.end, to.end);
  const index = all.findIndex((item) => item.id === seg.id && item.start_bp === seg.start_bp);
  const at = index >= 0 ? index : all.indexOf(seg);
  return at >= lo && at <= hi;
}

export function applyTransform(segments, transform) {
  let out = cloneSegments(segments);
  if (!transform || transform.type === "none") return out;
  const type = transform.type;

  if (type === "deletion") {
    if (transform.terminal_through) {
      const span = matchSpan(out, transform.terminal_through);
      if (span) {
        out = transform.arm === "q" ? out.slice(0, span.start) : out.slice(span.end + 1);
      }
    } else if (transform.arm_only) {
      const arm = transform.arm_only;
      const indexes = out.map((segment, index) => (segment.arm === arm ? index : -1)).filter((index) => index >= 0);
      if (indexes.length) {
        out = arm === "p" ? out.slice(indexes[indexes.length - 1]) : out.slice(0, indexes[0] + 1);
      }
    } else {
      const source = cloneSegments(segments);
      out = out.filter((segment) => {
        if (transform.labels && matchesLabels(segment, transform.labels)) return false;
        if (transform.from && transform.to && inRange(segment, transform.from, transform.to, source)) return false;
        return true;
      });
    }
  } else if (type === "duplication") {
    const labels = transform.labels || [];
    const copied = out.map((s, index) => (matchesLabels(s, labels) || (transform.from && inRange(s, transform.from, transform.to, out)) ? index : -1)).filter((index) => index >= 0);
    if (copied.length) {
      const lo = copied[0];
      const hi = copied[copied.length - 1];
      const repeat = out.slice(lo, hi + 1).map((s) => ({ ...s, id: `${s.id}dup`, origin: s.chromosome, duplicated: true }));
      out = [...out.slice(0, hi + 1), ...repeat, ...out.slice(hi + 1)];
    }
  } else if (type === "inversion") {
    const a = matchSpan(out, transform.from);
    const b = matchSpan(out, transform.to);
    if (a && b) {
      const lo = Math.min(a.start, b.start);
      const hi = Math.max(a.end, b.end);
      const mid = out.slice(lo, hi + 1).reverse().map((s) => ({
        ...s,
        orientation: s.orientation === "reverse" ? "forward" : "reverse",
        inverted: true,
      }));
      out = [...out.slice(0, lo), ...mid, ...out.slice(hi + 1)];
    }
  } else if (type === "isochromosome") {
    const arm = transform.arm || "q";
    const cen = out.filter((s) => s.role === "centromere");
    const kept = out.filter((s) => s.arm === arm);
    const mirror = [...kept].reverse().map((s) => ({
      ...s,
      id: `${s.id}iso`,
      arm: arm,
      orientation: s.orientation === "reverse" ? "forward" : "reverse",
    }));
    out = arm === "q" ? [...mirror, ...cen, ...kept] : [...kept, ...cen, ...mirror];
  } else if (type === "ring") {
    if (transform.from && transform.to) {
      const a = matchSpan(out, transform.from);
      const b = matchSpan(out, transform.to);
      if (a && b) {
        const lo = Math.min(a.start, b.start);
        const hi = Math.max(a.end, b.end);
        out = out.slice(lo, hi + 1);
      }
    } else {
      out = out.filter((s) => !matchesLabels(s, transform.remove_labels || []));
    }
    out = out.map((s) => ({ ...s, ring: true }));
  } else if (type === "translocation_derivative") {
    const attach = (transform.attach_segments || []).map((s) => ({ ...s, origin: s.chromosome, translocated: true }));
    if (transform.keep_from) {
      const span = matchSpan(out, transform.keep_from);
      const tail = span ? out.slice(span.start) : [];
      out = [...attach, ...tail];
    } else {
      const span = matchSpan(out, transform.keep_through);
      const head = span ? out.slice(0, span.end + 1) : out;
      out = [...head, ...attach];
    }
  } else if (type === "robertsonian") {
    const ownQ = out.filter((s) => s.arm === "q").reverse().map((s) => ({
      ...s,
      robertsonian: true,
      orientation: s.orientation === "reverse" ? "forward" : "reverse",
    }));
    const cen = out.filter((s) => s.role === "centromere").map((s) => ({ ...s, robertsonian: true }));
    const partnerQ = (transform.attach_segments || []).filter((s) => s.arm === "q").map((s) => ({
      ...s,
      origin: s.chromosome,
      translocated: true,
      robertsonian: true,
    }));
    if (ownQ.length && partnerQ.length) out = [...ownQ, ...cen, ...partnerQ];
  }

  return out.map((s, i) => ({ ...s, proximal_order: i }));
}

export function attachFromMap(maps, chromosome, fromLabel, toLabel, orientation) {
  const segs = maps?.chromosomes?.[String(chromosome)]?.segments || [];
  const from = matchSpan(segs, fromLabel);
  if (!from) return [];
  if (!toLabel) {
    const tail = cloneSegments(segs.slice(from.start));
    return orientation === "reverse" ? tail.reverse().map(orientSegment) : tail;
  }
  const to = matchSpan(segs, toLabel);
  if (!to) return [];
  const lo = Math.min(from.start, to.start);
  const hi = Math.max(from.end, to.end);
  let slice = cloneSegments(segs.slice(lo, hi + 1));
  if (orientation === "reverse") slice = slice.reverse().map(orientSegment);
  return slice;
}

function orientSegment(segment) {
  return {
    ...segment,
    orientation: segment.orientation === "reverse" ? "forward" : "reverse",
  };
}

export function resolutionForLocus(label) {
  const parsed = parseBandLabel(label);
  if (!parsed || parsed.arm === "cen") return "band";
  if (parsed.subband != null) return "subband";
  if (parsed.band != null) return "band";
  return "region";
}

/** Ideogram used to name a locus. Follows the expected address, not the assembly piece size. */
export function nomenclaturePieces(maps, spec) {
  const nom = spec?.nomenclature || {};
  const highlight = nom.expected || nom.highlight;
  const level = nom.resolution || resolutionForLocus(highlight);
  const chrom = String(spec?.chromosome || "");
  const base = cloneSegments(maps?.chromosomes?.[chrom]?.segments || []);
  const segs = nom.source === "abnormal"
    ? applyTransform(base, spec.transform)
    : base;
  return flattenToLevel(segs, level);
}

export function piecesForExercise(maps, spec) {
  const chrom = String(spec.chromosome);
  const level = spec.resolution || "band";
  const base = cloneSegments(maps?.chromosomes?.[chrom]?.segments || []);
  const usesAttach = spec.transform?.attach_from && (
    spec.transform.type === "translocation_derivative" || spec.transform.type === "robertsonian"
  );
  const specAttach = spec.transform?.attach_from;
  const extra = usesAttach
    ? attachFromMap(maps, specAttach.chromosome, specAttach.from, specAttach.to, specAttach.orientation)
    : spec.transform?.attach_segments;
  const transformed = applyTransform(base, extra ? { ...spec.transform, attach_segments: extra } : spec.transform);
  return flattenToLevel(transformed, level);
}

export function gradeAssembly(studentIds, expectedPieces) {
  const expected = expectedPieces.map((p) => p.id);
  const student = studentIds.filter(Boolean);
  const byId = Object.fromEntries(expectedPieces.map((p) => [p.id, p]));
  const cenExp = expected.findIndex((id) => byId[id]?.role === "centromere");
  const cenStu = student.findIndex((id) => byId[id]?.role === "centromere");

  const perfect = student.length === expected.length && student.every((id, i) => id === expected[i]);

  const pExp = expected.filter((id) => byId[id]?.arm === "p");
  const qExp = expected.filter((id) => byId[id]?.arm === "q");
  const pStu = student.filter((id) => byId[id]?.arm === "p");
  const qStu = student.filter((id) => byId[id]?.arm === "q");

  const pBeforeCen = cenStu > 0 && pStu.every((id) => student.indexOf(id) < cenStu);
  const qAfterCen = cenStu >= 0 && qStu.every((id) => student.indexOf(id) > cenStu);
  const orientation = pBeforeCen && qAfterCen && cenStu >= 0;
  const armAssignment = pStu.length === pExp.length && qStu.length === qExp.length && orientation;

  const pOrder = sameSequence(pStu, pExp);
  const qOrder = sameSequence(qStu, qExp);
  const telomeric = pOrder && qOrder;
  const segmentOrder = perfect;

  return {
    perfect,
    placed: student.length,
    expected: expected.length,
    orientation: orientation ? "correct" : "incorrect",
    arm_assignment: armAssignment ? "correct" : "incorrect",
    segment_order: segmentOrder ? "correct" : "incorrect",
    centromere: cenStu === cenExp && cenStu >= 0 ? "correct" : "incorrect",
    telomeric_direction: telomeric ? "correct" : "incorrect",
  };
}

function sameSequence(a, b) {
  return a.length === b.length && a.every((id, i) => id === b[i]);
}

export function gradeLocus(fields, expectedLabel) {
  if (!expectedLabel) return { expected: null, got: {}, components: {}, match: false, ungraded: true };
  const expected = parseBandLabel(expectedLabel);
  const typed = parseBandLabel(fields.locus || "");
  const got = {
    chromosome: (fields.chromosome || typed?.chromosome || "").toString().toUpperCase(),
    arm: (fields.arm || typed?.arm || "").toLowerCase(),
    region: num(fields.region, typed?.region),
    band: num(fields.band, typed?.band),
    subband: num(fields.subband, typed?.subband),
  };
  const components = {
    chromosome: cmp(got.chromosome, expected?.chromosome),
    arm: cmp(got.arm, expected?.arm),
    region: expected?.region == null ? "na" : cmp(got.region, expected.region),
    band: expected?.band == null ? "na" : cmp(got.band, expected.band),
    subband: expected?.subband == null ? "na" : cmp(got.subband, expected.subband),
  };
  const complete = locusString({ ...expected, chromosome: expected?.chromosome });
  const studentComplete = fields.locus
    ? (parseBandLabel(fields.locus) ? locusString(parseBandLabel(fields.locus)) : fields.locus)
    : locusString(got);
  components.complete = normalizeLocus(studentComplete) === normalizeLocus(expectedLabel) ? "correct" : "incorrect";
  return { expected, got, components, match: components.complete === "correct" };
}

function num(a, b) {
  const v = a === "" || a == null ? b : a;
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isNaN(n) ? v : n;
}

function cmp(a, b) {
  if (b == null || b === "") return "na";
  if (a == null || a === "") return "missing";
  return String(a) === String(b) ? "correct" : "incorrect";
}

function normalizeLocus(s) {
  return String(s || "").replace(/\s+/g, "").toLowerCase();
}

export function gradeComparison(comparison, caseData, transform) {
  const type = (comparison.type || "").toLowerCase();
  const typeMap = {
    deletion: ["deletion"],
    duplication: ["duplication"],
    inversion: ["inversion"],
    translocation_derivative: ["reciprocal translocation", "translocation", "derivative chromosome"],
    ring: ["ring chromosome"],
    isochromosome: ["isochromosome"],
    robertsonian: ["robertsonian translocation"],
  };
  const typeOk = (typeMap[transform?.type] || []).includes(type);
  const chrGot = tokens(comparison.chromosomes);
  const chrExp = (caseData.chromosomes_involved || []).map(String);
  const armGot = armTokens(comparison.arms);
  const armExp = (caseData.arms_involved || []).map((a) => String(a).toLowerCase().replace(/[^pq]/g, "")).filter(Boolean);
  const bpGot = tokens(comparison.breakpoints).map((t) => t.replace(/^chr(omosome)?/, ""));
  const bpExp = (caseData.bands_involved || []).map((b) => String(b).toLowerCase().replace(/\s+/g, ""));
  return {
    type: typeOk ? "correct" : (type ? "incorrect" : "missing"),
    chromosomes: identityMatch(chrGot, chrExp),
    arms: identityMatch(armGot, armExp),
    breakpoints: bandMatch(bpGot, bpExp),
  };
}

export function divergence(normal, assembled) {
  const assembledIds = new Set((assembled || []).map((p) => p.id));
  return {
    missing: (normal || []).filter((p) => !assembledIds.has(p.id)).map((p) => p.id),
    extra: (assembled || []).filter((p) => p.duplicated || p.translocated || p.id.endsWith("dup") || p.id.endsWith("iso")).map((p) => p.id),
    inverted: (assembled || []).filter((p) => p.inverted || p.orientation === "reverse").map((p) => p.id),
    translocated: (assembled || []).filter((p) => p.translocated).map((p) => p.id),
  };
}

function tokens(s) {
  return String(s || "")
    .toLowerCase()
    .split(/[,;+/&\s]+/)
    .map((t) => t.trim())
    .filter(Boolean);
}

function armTokens(s) {
  const raw = String(s || "").toLowerCase();
  const found = [];
  if (/\bp\b/.test(raw) || /short/.test(raw) || /p\d/.test(raw)) found.push("p");
  if (/\bq\b/.test(raw) || /long/.test(raw) || /q\d/.test(raw)) found.push("q");
  return found.length ? found : tokens(s).map((t) => t.replace(/[^pq]/g, "")).filter(Boolean);
}

function identityMatch(got, exp) {
  if (!exp.length) return "na";
  if (!got.length) return "missing";
  const norm = (value) => String(value).toLowerCase().replace(/^chr(omosome)?/, "");
  const a = got.map(norm).sort();
  const b = exp.map(norm).sort();
  return a.length === b.length && a.every((value, i) => value === b[i]) ? "correct" : "incorrect";
}

/** Band dropdowns omit the arm. 15.2 matches p15.2; 15 does not. */
function bandKey(value) {
  const text = String(value || "").toLowerCase().replace(/\s+/g, "");
  const addressed = text.match(/^(?:\d+|x|y)?([pq])(\d+(?:\.\d+)?)$/);
  if (addressed) return addressed[2];
  const bare = text.match(/^(\d+(?:\.\d+)?)$/);
  return bare ? bare[1] : text;
}

function bandMatch(got, exp) {
  if (!exp.length) return "na";
  if (!got.length) return "missing";
  const a = got.map(bandKey).sort();
  const b = exp.map(bandKey).sort();
  return a.length === b.length && a.every((value, i) => value === b[i]) ? "correct" : "incorrect";
}

export function anatomyHotspots() {
  return [
    { id: "pter", label: "pter (short-arm telomere)", y: 0.04 },
    { id: "p", label: "p arm", y: 0.22 },
    { id: "cen", label: "centromere", y: 0.5 },
    { id: "q", label: "q arm", y: 0.72 },
    { id: "qter", label: "qter (long-arm telomere)", y: 0.96 },
  ];
}

export function initAssembly(maps, spec, seed = 1) {
  if (!spec || !maps) return null;
  const expected = piecesForExercise(maps, spec);
  const ids = expected.map((p) => p.id);
  const normalSegs = maps.chromosomes?.[String(spec.chromosome)]?.segments || [];
  return {
    spec,
    expected,
    normal: spec.reference_normal ? flattenToLevel(normalSegs, spec.resolution || "band") : flattenToLevel(normalSegs, spec.resolution || "band"),
    tray: shuffle(ids, seed),
    stack: [],
    selectedId: null,
    anatomy: { answers: {} },
    locus: { chromosome: "", arm: "", region: "", band: "", subband: "", locus: "" },
    comparison: { type: "", chromosomes: "", arms: "", breakpoints: "", iscn: "" },
  };
}

export function movePiece(assembly, pieceId, dest, destIndex = null) {
  const next = {
    ...assembly,
    tray: assembly.tray.filter((id) => id !== pieceId),
    stack: assembly.stack.filter((id) => id !== pieceId),
    selectedId: null,
  };
  if (dest === "tray") next.tray = [...next.tray, pieceId];
  else {
    const stack = [...next.stack];
    const i = destIndex == null || destIndex > stack.length ? stack.length : destIndex;
    stack.splice(i, 0, pieceId);
    next.stack = stack;
  }
  return next;
}

export function shiftSelected(assembly, dir) {
  const id = assembly.selectedId;
  if (!id) return assembly;
  const inTray = assembly.tray.includes(id);
  if (inTray && dir < 0) return assembly;
  if (inTray && dir > 0) return movePiece({ ...assembly, selectedId: id }, id, "stack", 0);
  const stack = [...assembly.stack];
  const i = stack.indexOf(id);
  if (i < 0) return assembly;
  const j = i + dir;
  if (j < 0) return movePiece(assembly, id, "tray");
  if (j >= stack.length) return assembly;
  [stack[i], stack[j]] = [stack[j], stack[i]];
  return { ...assembly, stack, selectedId: id };
}

export const CHROMOSOME_ORDER = [
  "1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12",
  "13", "14", "15", "16", "17", "18", "19", "20", "21", "22", "X", "Y",
];

const SHADE = ["pale", "light", "medium", "dark", "black", "variable", "stalk"];

function schematicSegments(chromosomeId, template) {
  const segments = [];
  let order = 0;
  const pushArm = (arm, blocks) => {
    (blocks || []).forEach((block, index) => {
      const weight = Array.isArray(block) ? block[0] : 4;
      const stain = Array.isArray(block) ? block[1] : 0;
      const shade = SHADE[stain] || "band";
      const n = index + 1;
      segments.push({
        id: `${chromosomeId}${arm}-${shade}-${n}`,
        chromosome: String(chromosomeId),
        arm,
        region: n,
        band: null,
        label: `${arm} ${shade} ${n}`,
        role: "band",
        stain,
        weight: Math.max(1, Math.round(Number(weight) || 1)),
        orientation: "forward",
        proximal_order: order++,
      });
    });
  };
  pushArm("p", template?.p);
  segments.push({
    id: `${chromosomeId}cen`,
    chromosome: String(chromosomeId),
    arm: "cen",
    region: null,
    band: null,
    label: "cen",
    role: "centromere",
    stain: 5,
    weight: 5,
    orientation: "forward",
    proximal_order: order++,
  });
  pushArm("q", template?.q);
  return segments;
}

/** One normal chromosome after another. Real band maps are used where they exist. */
export function chromosomeSequenceCase(maps, templates) {
  const chromosomes = { ...(maps?.chromosomes || {}) };
  for (const id of CHROMOSOME_ORDER) {
    if (chromosomes[id]?.segments?.length) continue;
    const template = templates?.chromosomes?.[id];
    if (!template) continue;
    chromosomes[id] = { id, schematic: true, segments: schematicSegments(id, template) };
  }
  const augmented = { ...(maps || {}), chromosomes };
  const steps = [];
  const stepAssembly = {};
  const stepTitles = {};
  CHROMOSOME_ORDER.forEach((id) => {
    if (!augmented.chromosomes?.[id]?.segments?.length) return;
    const step = steps.length === 0 ? "assemble" : `assemble_${steps.length + 1}`;
    const schematic = Boolean(augmented.chromosomes[id].schematic);
    steps.push(step);
    stepTitles[step] = `Chromosome ${id}`;
    stepAssembly[step] = {
      chromosome: id,
      resolution: schematic ? "piece" : "band",
      transform: { type: "none" },
      schematic_note: schematic
        ? "These pieces are a G-band sketch. The labels count from pter and are not official band addresses."
        : "",
    };
  });
  const first = steps[0];
  return {
    maps: augmented,
    caseData: {
      case_id: "chromosome-sequence",
      title: "Assemble each chromosome",
      clinical_history: "Order the pieces from pter at the top to qter at the bottom. A correct check lets you continue to the next chromosome.",
      chromosomes: [],
      abnormality_category: "normal",
      assembly: stepAssembly[first] || null,
      activitySteps: steps,
      stepAssembly,
      stepTitles,
    },
  };
}
