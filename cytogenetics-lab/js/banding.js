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
  if (seg.role === "centromere" || seg.arm === "cen") return `${seg.chromosome || ""}cen`;
  if (level === "region") return `${seg.chromosome}${seg.arm}${seg.region}`;
  if (level === "band") {
    if (seg.band == null) return `${seg.chromosome}${seg.arm}${seg.region}`;
    return `${seg.chromosome}${seg.arm}${seg.region}${seg.band}`;
  }
  return seg.label || seg.id;
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
    groups.push({
      key,
      id: key,
      label: seg.role === "centromere" ? "cen" : key,
      chromosome: seg.chromosome,
      arm: seg.arm,
      region: parsed.region ?? seg.region,
      band: level === "region" ? null : (parsed.band ?? seg.band),
      subband: level === "subband" ? (parsed.subband ?? seg.subband) : null,
      role: seg.role || "band",
      stain: seg.stain,
      weight: seg.weight || 1,
      orientation: seg.orientation || "forward",
      origin: seg.origin || seg.chromosome,
      inverted: Boolean(seg.inverted),
      translocated: Boolean(seg.translocated),
      parent_region: seg.parent_region,
      members: [seg],
    });
  }
  return groups.map((g, i) => ({ ...g, proximal_order: i }));
}

export function cloneSegments(segments) {
  return (segments || []).map((s) => ({ ...s, members: undefined }));
}

function matchesLabels(seg, labels) {
  const set = new Set((labels || []).map(String));
  return set.has(seg.id) || set.has(seg.label) || set.has(seg.parent_region) || set.has(resolutionKey(seg, "band")) || set.has(resolutionKey(seg, "region"));
}

function inRange(seg, fromLabel, toLabel, all) {
  if (!fromLabel && !toLabel) return false;
  const ids = all.map((s) => s.id);
  const a = ids.indexOf(fromLabel);
  const b = ids.indexOf(toLabel);
  const i = ids.indexOf(seg.id);
  if (a < 0 || b < 0 || i < 0) {
    return matchesLabels(seg, [fromLabel, toLabel].filter(Boolean));
  }
  return i >= Math.min(a, b) && i <= Math.max(a, b);
}

export function applyTransform(segments, transform) {
  let out = cloneSegments(segments);
  if (!transform || transform.type === "none") return out;
  const type = transform.type;

  if (type === "deletion") {
    out = out.filter((s) => {
      if (transform.labels && matchesLabels(s, transform.labels)) return false;
      if (transform.from && transform.to && inRange(s, transform.from, transform.to, cloneSegments(segments))) return false;
      return true;
    });
  } else if (type === "duplication") {
    const labels = transform.labels || [];
    const next = [];
    for (const s of out) {
      next.push(s);
      if (matchesLabels(s, labels) || (transform.from && inRange(s, transform.from, transform.to, out))) {
        next.push({ ...s, id: `${s.id}dup`, origin: s.chromosome, duplicated: true });
      }
    }
    out = next;
  } else if (type === "inversion") {
    const ids = out.map((s) => s.id);
    const a = ids.indexOf(transform.from);
    const b = ids.indexOf(transform.to);
    if (a >= 0 && b >= 0) {
      const lo = Math.min(a, b);
      const hi = Math.max(a, b);
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
    out = out.filter((s) => !matchesLabels(s, transform.remove_labels || []));
    out = out.map((s, i) => ({ ...s, ring: true, proximal_order: i }));
  } else if (type === "translocation_derivative") {
    const attach = (transform.attach_segments || []).map((s) => ({ ...s, origin: s.chromosome, translocated: true }));
    if (transform.keep_from) {
      const idx = out.findIndex((s) => s.id === transform.keep_from || s.label === transform.keep_from);
      const tail = idx >= 0 ? out.slice(idx) : [];
      out = [...attach, ...tail];
    } else {
      const keepThrough = transform.keep_through;
      const idx = out.findIndex((s) => s.id === keepThrough || s.label === keepThrough);
      const head = idx >= 0 ? out.slice(0, idx + 1) : out;
      out = [...head, ...attach];
    }
  } else if (type === "robertsonian") {
    const attach = (transform.attach_segments || []).filter((s) => s.arm === "q" || s.role === "centromere");
    const kept = out.filter((s) => s.arm === "q" || s.role === "centromere");
    out = [
      ...kept.map((s) => ({ ...s, robertsonian: true })),
      ...attach.map((s) => ({ ...s, origin: s.chromosome, translocated: true, robertsonian: true })),
    ];
  }

  return out.map((s, i) => ({ ...s, proximal_order: i }));
}

export function attachFromMap(maps, chromosome, fromLabel, toLabel, orientation) {
  const segs = maps?.chromosomes?.[String(chromosome)]?.segments || [];
  const i = segs.findIndex((s) => s.id === fromLabel || s.label === fromLabel);
  if (i < 0) return [];
  if (!toLabel) return cloneSegments(segs.slice(i));
  const j = segs.findIndex((s) => s.id === toLabel || s.label === toLabel);
  if (j < 0) return [];
  const lo = Math.min(i, j);
  const hi = Math.max(i, j);
  let slice = cloneSegments(segs.slice(lo, hi + 1));
  if (orientation === "reverse") {
    slice = slice.reverse().map((s) => ({
      ...s,
      orientation: s.orientation === "reverse" ? "forward" : "reverse",
    }));
  }
  return slice;
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
    chromosomes: setMatch(chrGot, chrExp),
    arms: setMatch(armGot, armExp),
    breakpoints: setMatch(bpGot, bpExp),
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

function setMatch(got, exp) {
  if (!exp.length) return "na";
  if (!got.length) return "missing";
  const ok = exp.every((e) => got.some((g) => g.includes(e) || e.includes(g)));
  return ok ? "correct" : "incorrect";
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
