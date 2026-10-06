/**
 * FISH analysis engine. Assay types are data-driven; cases and probes live in JSON.
 * Educational use only — not for clinical diagnostic interpretation.
 */

import { flattenToLevel, parseBandLabel, gradeLocus, attachFromMap, applyTransform, cloneSegments } from "./banding.js?v=20261006j";

export const ASSAY_FIELDS = {
  enumeration: ["green", "red"],
  "break-apart": ["red", "green", "fusion", "split"],
  "dual-fusion": ["red", "green", "fusion"],
  deletion: ["target", "control"],
  amplification: ["target", "control"],
  "locus-specific": ["target", "control"],
  painting: ["paint"],
  subtelomeric: ["red", "green"],
};

export const PROBE_STRATEGIES = [
  "chromosome enumeration",
  "loss of a specific locus",
  "rearrangement of a particular locus",
  "fusion between two defined loci",
  "chromosome origin",
  "chromosome-wide visualization",
];

export const PROBE_TYPES = [
  "centromeric",
  "locus-specific",
  "break-apart",
  "dual-fusion",
  "whole-chromosome painting",
  "subtelomeric",
];

export const PROBE_TARGETS = [
  "a defined chromosomal band",
  "flanks of one locus",
  "two loci on different chromosomes",
  "a centromere",
  "an entire chromosome",
  "a subtelomeric region",
];

export const PROBE_DETECTS = [
  "presence, copy number, or partner of a specific locus",
  "rearrangement of a particular locus",
  "fusion between two defined loci",
  "chromosome enumeration",
  "loss of a specific locus",
  "chromosome origin",
  "chromosome-wide visualization",
];

export const PROBE_NORMAL_PATTERNS = [
  "2 signals (one per homolog)",
  "2 red signals",
  "2 green signals",
  "two red signals on the two chromosomes 9",
  "2 fusion signals",
  "2 red and 2 green signals",
  "2 green and 0 red signals",
  "1 green and 1 red signals",
];

export const STRATEGY_NORMAL = [
  "2 signals (one per homolog)",
  "2 green signals",
  "2 red signals",
  "2 fusion signals",
  "2 red and 2 green signals",
];

export const STRATEGY_ABNORMAL = [
  "3 green signals",
  "1 green signal",
  "1 fusion + split red/green",
  "2 fusion + 1 red + 1 green",
  "extra fusion signals",
  "loss of a target signal",
];

function fishExerciseSteps(f, exerciseId) {
  if (exerciseId === "probe-localization") {
    return f.include_localization && f.localization?.expected ? ["probe_locus"] : ["unavailable"];
  }
  if (exerciseId === "probe-type") {
    return f.include_probe_type && f.probe_type_expected ? ["probe_type"] : ["unavailable"];
  }
  if (exerciseId === "metaphase" || exerciseId === "quality" || exerciseId === "interphase") {
    return (f.nuclei || []).length ? ["fish_scope"] : ["unavailable"];
  }
  if (["enumeration", "break-apart", "dual-fusion", "deletion", "amplification"].includes(exerciseId)) {
    const steps = [];
    if ((f.nuclei || []).length) steps.push("fish_scope");
    if (f.expected_interpretation) steps.push("fish_interpret");
    return steps.length ? steps : ["unavailable"];
  }
  return ["unavailable"];
}

export function fishFlow(caseData, exerciseId) {
  const f = caseData.fish;
  if (!f) return [];
  if (exerciseId && exerciseId !== "integrated" && exerciseId !== "integrated_fish") {
    return fishExerciseSteps(f, exerciseId);
  }
  const steps = [];
  if (f.include_localization && f.localization?.expected) steps.push("probe_locus");
  if (f.include_probe_type && f.probe_type_expected) steps.push("probe_type");
  if (f.include_strategy && f.strategy_expected) steps.push("probe_strategy");
  if ((f.nuclei || []).length) steps.push("fish_scope");
  if (f.expected_interpretation) steps.push("fish_interpret");
  return placeSyntheticDemo(steps);
}

const SCOPE_PREP = new Set(["probe_strategy", "probe_locus", "probe_type"]);

/** Show the labeled synthetic field immediately before the exercise that used to precede scoring. */
export function placeSyntheticDemo(steps) {
  const scope = steps.indexOf("fish_scope");
  if (scope < 1 || steps.includes("fish_demo")) return steps;
  if (!SCOPE_PREP.has(steps[scope - 1])) return steps;
  const next = steps.slice();
  next.splice(scope - 1, 0, "fish_demo");
  return next;
}

export function resolveProbes(probeCatalog, ids) {
  const list = probeCatalog?.probes || [];
  return (ids || []).map((id) => list.find((p) => p.probe_id === id)).filter(Boolean);
}

export function countFieldsFor(assay, specified) {
  if (specified && specified.length) return specified;
  return (ASSAY_FIELDS[assay] || ["red", "green"]).filter((k, i, arr) => arr.indexOf(k) === i);
}

export function initFish(caseData, probeCatalog, maps) {
  const spec = caseData.fish;
  if (!spec) return null;
  const probes = resolveProbes(probeCatalog, spec.probe_ids);
  const fields = countFieldsFor(spec.assay_type, spec.count_fields);
  return {
    spec,
    probes,
    maps,
    activeChannel: (spec.channels || ["merge"]).includes("merge") ? "merge" : (spec.channels || ["dapi"])[0],
    channels: Object.fromEntries((spec.channels || ["dapi", "red", "green", "merge"]).map((c) => [c, true])),
    classifyMode: fields.includes("fusion") ? "fusion" : (fields[0] || "red"),
    nucleusIndex: 0,
    selectedMark: null,
    nuclei: (spec.nuclei || []).map((n) => ({
      id: n.nucleus_id,
      marks: [],
      counts: Object.fromEntries(fields.map((k) => [k, ""])),
      scorable: "",
      artifact: "",
      submitted: false,
    })),
    localization: { chromosome: "", arm: "", region: "", band: "", locus: "", placedId: "" },
    probeType: { type: "", target: "", detects: "", normal_pattern: "" },
    strategy: { choice: "", normalExpected: "", abnormalExpected: "" },
    interpretation: "",
    ratio: { target: "", reference: "" },
  };
}

export function currentNucleus(fish) {
  const specN = fish.spec.nuclei || [];
  const i = Math.max(0, Math.min(fish.nucleusIndex || 0, specN.length - 1));
  return { spec: specN[i], student: fish.nuclei[i], index: i };
}

export function matchSignal(x, y, expected, tolerance) {
  let best = null;
  let bestD = Infinity;
  for (const sig of expected || []) {
    const d = Math.hypot(x - sig.x, y - sig.y);
    if (d <= tolerance && d < bestD) {
      best = sig;
      bestD = d;
    }
  }
  return best;
}

export function addMark(fish, x, y) {
  const { spec, student, index } = currentNucleus(fish);
  if (!spec || !student) return fish;
  const near = (student.marks || []).find((m) => Math.hypot(x - m.x, y - m.y) <= 12);
  if (near) return { ...fish, selectedMark: near.id };
  const tol = fish.spec.signal_tolerance || 20;
  const hit = matchSignal(x, y, spec.expected_signals, tol);
  const mark = {
    id: `m${Date.now()}`,
    x: hit ? hit.x : x,
    y: hit ? hit.y : y,
    type: fish.classifyMode || "uncertain",
    matchedId: hit ? hit.id : null,
  };
  const nuclei = fish.nuclei.map((n, i) => (i === index ? { ...n, marks: [...n.marks, mark], selectedMark: mark.id } : n));
  return { ...fish, nuclei, selectedMark: mark.id };
}

export function updateMark(fish, markId, partial) {
  const index = fish.nucleusIndex || 0;
  const nuclei = fish.nuclei.map((n, i) => {
    if (i !== index) return n;
    return { ...n, marks: n.marks.map((m) => (m.id === markId ? { ...m, ...partial } : m)) };
  });
  return { ...fish, nuclei };
}

export function removeMark(fish, markId) {
  const index = fish.nucleusIndex || 0;
  const nuclei = fish.nuclei.map((n, i) => {
    if (i !== index) return n;
    return { ...n, marks: n.marks.filter((m) => m.id !== markId) };
  });
  return { ...fish, selectedMark: fish.selectedMark === markId ? null : fish.selectedMark, nuclei };
}

export function resetNucleus(fish) {
  const index = fish.nucleusIndex || 0;
  const fields = countFieldsFor(fish.spec.assay_type, fish.spec.count_fields);
  const nuclei = fish.nuclei.map((n, i) => (i === index
    ? { ...n, marks: [], counts: Object.fromEntries(fields.map((k) => [k, ""])), scorable: "", artifact: "", submitted: false }
    : n));
  return { ...fish, nuclei, selectedMark: null };
}

export function gradeSignalIdentification(studentMarks, expected, tolerance) {
  const used = new Set();
  let classified = 0;
  let identified = 0;
  for (const mark of studentMarks || []) {
    const hit = mark.matchedId
      ? expected.find((s) => s.id === mark.matchedId)
      : matchSignal(mark.x, mark.y, expected, tolerance);
    if (!hit) continue;
    if (used.has(hit.id)) continue;
    used.add(hit.id);
    identified += 1;
    if (mark.type === hit.type) classified += 1;
  }
  return {
    identified,
    classified,
    expected: (expected || []).length,
    extra: Math.max(0, (studentMarks || []).length - identified),
  };
}

export function gradeNucleus(student, spec, fields) {
  const scorableOk = String(student.scorable) === String(spec.scorable);
  const artifactRequired = !spec.scorable && Boolean(spec.artifact_type);
  const artifactOk = !artifactRequired || student.artifact === spec.artifact_type;
  const counts = {};
  let countsOk = true;
  if (spec.scorable) {
    for (const f of fields) {
      const exp = spec.expected_counts?.[f];
      if (exp == null) {
        counts[f] = "na";
        continue;
      }
      const got = Number(student.counts?.[f]);
      const ok = Number.isFinite(got) && got === Number(exp);
      counts[f] = ok ? "correct" : (student.counts?.[f] === "" || student.counts?.[f] == null ? "missing" : "incorrect");
      if (!ok) countsOk = false;
    }
  }
  return {
    scorable: scorableOk ? "correct" : (student.scorable === "" ? "missing" : "incorrect"),
    artifact: spec.scorable ? "na" : (artifactOk ? "correct" : "incorrect"),
    counts,
    countsOk: spec.scorable ? countsOk : true,
    qualityOk: scorableOk,
    complete: scorableOk && (spec.scorable ? countsOk : true) && artifactOk,
  };
}

export function summarizeEnumeration(fish) {
  const fields = countFieldsFor(fish.spec.assay_type, fish.spec.count_fields);
  const rows = (fish.spec.nuclei || []).map((spec, i) => {
    const st = fish.nuclei[i] || {};
    return {
      id: spec.nucleus_id,
      scorable: st.scorable === "" ? null : st.scorable === "true" || st.scorable === true,
      counts: st.counts,
      expected: spec.expected_counts,
      classification: spec.expected_classification,
    };
  });
  const scorable = rows.filter((r) => r.scorable === true);
  const cutoff = fish.spec.case_specific_cutoff;
  let percent = null;
  const expected = cutoff?.abnormal_counts;
  if (expected && scorable.length) {
    const hits = scorable.filter((r) => Object.entries(expected).every(([key, value]) => Number(r.counts?.[key]) === Number(value))).length;
    percent = Math.round((hits / scorable.length) * 100);
  }
  return { rows, scorable: scorable.length, total: rows.length, percent, cutoff, fields };
}

export function gradeInterpretation(choice, expected) {
  if (!expected) return { ok: false, detail: "ungraded" };
  if (!choice) return { ok: false, detail: "missing" };
  return { ok: choice === expected, detail: choice === expected ? "correct" : "incorrect" };
}

export function gradeStrategy(choice, expected) {
  if (!expected) return { ok: false, detail: "ungraded" };
  return { ok: String(choice || "").toLowerCase() === String(expected).toLowerCase() };
}

export function gradeProbeType(answers, expected) {
  if (!expected) return { match: false, ungraded: true, components: {} };
  const components = {
    type: cmpLoose(answers.type, expected.type),
    target: expected.target ? (includesLoose(answers.target, expected.target) ? "correct" : (answers.target ? "incorrect" : "missing")) : "na",
    detects: expected.detects ? (includesLoose(answers.detects, expected.detects) ? "correct" : (answers.detects ? "incorrect" : "missing")) : "na",
    normal_pattern: expected.normal_pattern ? (includesLoose(answers.normal_pattern, expected.normal_pattern) ? "correct" : (answers.normal_pattern ? "incorrect" : "missing")) : "na",
  };
  const match = Object.values(components).every((v) => v === "correct" || v === "na");
  return { match, components };
}

function cmpLoose(a, b) {
  if (!b) return "na";
  if (!a) return "missing";
  return String(a).toLowerCase() === String(b).toLowerCase() ? "correct" : "incorrect";
}

function includesLoose(got, exp) {
  const a = String(got || "").toLowerCase();
  const b = String(exp || "").toLowerCase();
  if (!a) return false;
  return a === b || a.includes(b) || b.includes(a);
}

export function gradeLocalization(fields, expectedLabel) {
  return gradeLocus(fields, expectedLabel);
}

export function segmentForLocus(maps, locus) {
  const parsed = parseBandLabel(locus);
  if (!parsed) return null;
  const segs = maps?.chromosomes?.[String(parsed.chromosome)]?.segments || [];
  return segs.find((s) => s.id === locus || s.label === locus || s.id === parsed.label) || null;
}

export function probeHitsOnSegments(probe, segments) {
  const loc = probe.target_locus || probe.reference_segment || probe.band;
  return (segments || []).filter((s) => {
    if (probe.reference_segment && (s.id === probe.reference_segment || s.label === probe.reference_segment)) return true;
    if (probe.target_locus && (s.id === probe.target_locus || s.label === probe.target_locus)) return true;
    if (String(s.chromosome) === String(probe.chromosome) && s.arm === "cen" && /cen/i.test(String(loc))) return true;
    return false;
  });
}

/** Follow probes through a curated segment transform (architecture for derivative chromosomes). */
export function predictedProbeArrangement(maps, probes, transform, chromosome) {
  const base = cloneSegments(maps?.chromosomes?.[String(chromosome)]?.segments || []);
  let extra = transform?.attach_from
    ? attachFromMap(maps, transform.attach_from.chromosome, transform.attach_from.from)
    : transform?.attach_segments;
  const segs = applyTransform(base, extra ? { ...transform, attach_segments: extra } : transform);
  return (probes || []).map((probe) => ({
    probe,
    hits: probeHitsOnSegments(probe, segs).map((s) => ({ id: s.id, label: s.label, origin: s.origin || s.chromosome, translocated: Boolean(s.translocated) })),
  }));
}

export function localizationPieces(maps, chromosome, resolution = "band") {
  const segs = maps?.chromosomes?.[String(chromosome)]?.segments || [];
  return flattenToLevel(segs, resolution);
}
