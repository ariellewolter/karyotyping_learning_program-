/**
 * FISH microscope workstation: several fields of nuclei, channel/zoom/display controls,
 * per-nucleus scoring worksheet, summary, and assay interpretation.
 *
 * Every nucleus is derived from nuclei authored for the case's assay (via buildField), so the
 * answer key is fixed by the case and the seed. The only added appearances are controlled
 * variants whose correct call is stated in the scoring rules: dim-but-distinct signals,
 * closely spaced signals, and signals too weak to assess.
 * Synthetic demonstration only — not clinical microscopy.
 */
import { escapeHtml } from "./util.js?v=20261006j";
import { buildField, equivocalCopy, patternOf } from "./fish-field.js?v=20261025grade1";

const FIELD_W = 960;
const FIELD_H = 600;
const SCALE = 0.8;
const PER_FIELD = 6;
/** One signal diameter in field units; spacing rules are stated in signal diameters. */
const DIAMETER = 9.2 * SCALE;
const CORE_R = DIAMETER * 0.45;
const MAX_ZOOM = 8;

const ASSAY_FIELDS = {
  enumeration: ["green", "red"],
  "break-apart": ["red", "green", "fusion", "split"],
  "dual-fusion": ["red", "green", "fusion"],
  deletion: ["target", "control"],
};

export const EXCLUSION_REASONS = [
  ["overlapping_nuclei", "Overlapping nuclei", "Signals in the shared area cannot be assigned to one nucleus."],
  ["damaged_nucleus", "Damaged or poorly defined nucleus", "The outline is broken or ragged, or a signal lies outside the nuclear boundary."],
  ["weak_signals", "Signals too weak to assess", "Even with display brightness raised, the signals are diffuse halos without a distinct spot."],
  ["equivocal_spacing", "Equivocal signal spacing", "Red and green are neither touching (fusion) nor clearly separated by the assay's split distance."],
  ["diffuse_signals", "Diffuse or smeared signals", "The signal is smeared, so it cannot be resolved into countable spots."],
  ["other", "Other (explain)", "Describe the problem in your note."],
];

const REASON_LABEL = Object.fromEntries(EXCLUSION_REASONS.map(([id, label]) => [id, label]));

const SIGNAL_SHORT = { red: "red", green: "green", fusion: "fusion", split: "split", target: "target", control: "control" };
const SIGNAL_COLOR = { red: "#ff4a3d", green: "#39e36b", fusion: "#f4d75a" };

const ASSAY_DETECTS = {
  enumeration: "chromosome enumeration",
  "break-apart": "rearrangement of a particular locus",
  "dual-fusion": "fusion between two defined loci",
  deletion: "loss of a specific locus",
};

const DETECT_OPTIONS = [
  "chromosome enumeration",
  "loss of a specific locus",
  "rearrangement of a particular locus",
  "fusion between two defined loci",
  "chromosome-wide visualization",
];

const PARTNER_OPTIONS = [
  ["names_any", "Yes. It names the partner of any rearrangement involving the target."],
  ["defined_pair", "Only for the two loci it targets. A rearrangement with any other partner would not form the expected fusion."],
  ["no_partner", "No. It shows whether the targeted locus is disrupted, not what it joined."],
  ["not_applicable", "Not applicable. This assay measures copy number of a target; it does not test for a partner."],
];

const PARTNER_KEY = { enumeration: "not_applicable", deletion: "not_applicable", "break-apart": "no_partner", "dual-fusion": "defined_pair" };

const COMMON_MISS = ["elsewhere", "Abnormalities of chromosomes or loci that these probes do not target", true];
const MISS_OPTIONS = {
  enumeration: [
    COMMON_MISS,
    ["balanced", "Balanced structural rearrangements of the target chromosome", true],
    ["gain", "An extra copy of the target in the scored nuclei", false],
    ["lowclone", "An abnormal clone smaller than the proportion the scored nuclei can show", true],
  ],
  "break-apart": [
    COMMON_MISS,
    ["partner", "The identity of the partner gene or chromosome", true],
    ["separation", "Separation of the two flanking probe signals", false],
    ["outside", "Rearrangements whose breakpoints fall outside the region the probes flank", true],
  ],
  "dual-fusion": [
    COMMON_MISS,
    ["otherpartner", "Rearrangement of either gene with a partner the probes do not target", true],
    ["colocal", "Co-localized red and green signals from the two targeted loci", false],
    ["sequence", "Sequence-level changes, such as point mutations, in either gene", true],
  ],
  deletion: [
    COMMON_MISS,
    ["outsideprobe", "Deletions that do not include the probe's target region", true],
    ["loss", "Loss of the target signal relative to the control signal", false],
    ["copyneutral", "Copy-neutral changes, such as uniparental disomy", true],
  ],
};

const CUTOFF_OPTIONS = [
  ["meets_cutoff", "Enough scorable nuclei, and the abnormal proportion meets or exceeds the supplied cutoff."],
  ["below_cutoff", "Enough scorable nuclei, and the abnormal proportion is below the supplied cutoff."],
  ["insufficient", "Too few scorable nuclei under the supplied criteria to apply the cutoff."],
];

const ADEQUACY_OPTIONS = [
  ["adequate", "Adequate: enough scorable nuclei. Report the pattern and the proportion of scored nuclei; no positivity cutoff is supplied, so do not call the result positive or negative by a threshold."],
  ["insufficient", "Not adequate: too few scorable nuclei under the supplied criteria."],
  ["any_abnormal", "Positive, because at least one scored nucleus shows the abnormal pattern."],
];

/** What the result establishes, and what it leaves open. The first option is the key. */
const SCOPE_OPTIONS = {
  enumeration: [
    ["copy_number", "The copy number of the targeted chromosome in the scored nuclei. It does not show whether an extra copy is free or part of a rearrangement, or the state of other chromosomes."],
    ["full_karyotype", "The complete chromosome complement of the patient."],
    ["mechanism", "Whether an extra copy is a free chromosome or part of a translocation."],
  ],
  "break-apart": [
    ["locus_rearranged", "That the targeted locus is rearranged in the scored nuclei. The partner, and therefore the specific fusion, remains unidentified."],
    ["specific_fusion", "The specific fusion, and therefore the tumor type."],
    ["nothing", "Nothing, because the partner is unknown."],
  ],
  "dual-fusion": [
    ["defined_fusion", "That the two targeted loci are joined in the scored nuclei. Rearrangements of either gene with other partners would not be shown."],
    ["no_other", "That neither gene has any other rearrangement."],
    ["full_karyotype", "The full karyotype, including any additional abnormalities."],
  ],
  deletion: [
    ["target_loss", "Loss of the target region in the scored nuclei. Not the parent of origin, the exact extent of the deletion, or its mechanism."],
    ["parent_origin", "The parent of origin of the deleted chromosome."],
    ["no_other_cnv", "That the patient has no other copy-number change."],
  ],
};

function cutoffOf(spec) {
  const cutoff = spec.case_specific_cutoff || {};
  const percent = Number(cutoff.percent_cutoff);
  return {
    minimumScorable: Number.isFinite(Number(cutoff.minimum_percent_scorable)) ? Number(cutoff.minimum_percent_scorable) : null,
    percentCutoff: cutoff.percent_cutoff != null && Number.isFinite(percent) ? percent : null,
    kind: cutoff.cutoff_kind === "published" && String(cutoff.cutoff_source || "").trim() ? "published" : "educational",
    source: cutoff.cutoff_source || "",
  };
}

function resultOptions(spec) {
  return cutoffOf(spec).percentCutoff != null ? CUTOFF_OPTIONS : ADEQUACY_OPTIONS;
}

/* ---------- scene construction ---------- */

function seededRandom(seed) {
  let value = (seed >>> 0) || 1;
  return () => {
    value = (value + 0x6d2b79f5) >>> 0;
    let t = value;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function countFields(spec) {
  if (spec?.count_fields?.length) return spec.count_fields;
  return ASSAY_FIELDS[spec?.assay_type] || ["red", "green"];
}

function pairedAssay(assay) {
  return assay === "break-apart" || assay === "dual-fusion";
}

function keyFor(nucleus, assay) {
  const quality = nucleus.key?.quality;
  if (quality === "score") return { scorable: true, reason: "", accept: [], counts: nucleus.expected_counts || {}, pattern: nucleus.key.pattern };
  if (quality === "overlap") return { scorable: false, reason: "overlapping_nuclei", accept: ["overlapping_nuclei"] };
  if (quality === "damaged") return { scorable: false, reason: "damaged_nucleus", accept: ["damaged_nucleus"] };
  const reason = pairedAssay(assay) ? "equivocal_spacing" : "diffuse_signals";
  return { scorable: false, reason, accept: ["equivocal_spacing", "diffuse_signals"] };
}

function placeNucleus(nucleus, tx, ty, size) {
  const ax = nucleus.overlap ? (nucleus.cx + nucleus.overlap.cx) / 2 : nucleus.cx;
  const ay = nucleus.overlap ? (nucleus.cy + nucleus.overlap.cy) / 2 : nucleus.cy;
  const scale = SCALE * size;
  const px = (x) => (x - ax) * scale + tx;
  const py = (y) => (y - ay) * scale + ty;
  const body = (b) => (b ? { cx: px(b.cx), cy: py(b.cy), rx: b.rx * scale, ry: b.ry * scale } : null);
  return {
    ...nucleus,
    cx: px(nucleus.cx),
    cy: py(nucleus.cy),
    rx: nucleus.rx * scale,
    ry: nucleus.ry * scale,
    overlap: body(nucleus.overlap),
    fragment: body(nucleus.fragment),
    expected_signals: (nucleus.expected_signals || []).map((signal) => ({ ...signal, x: px(signal.x), y: py(signal.y) })),
  };
}

/**
 * Build the fields for one case. Same spec + seed always yields the same nuclei and key.
 * Returns { fields: [{ index, nuclei }], nuclei, byId, rules } or null when the case cannot run a field.
 */
export function buildScene(spec, seed, { advanced = false } = {}) {
  const base = buildField(spec, seed, 17);
  if (!base) return null;
  const assay = spec.assay_type;
  const random = seededRandom(seed * 31 + 7);
  const nuclei = base.nuclei.map((nucleus) => ({ ...nucleus, key: keyFor(nucleus, assay), variant: "" }));
  const scorable = nuclei.map((nucleus, index) => (nucleus.key.scorable ? index : -1)).filter((index) => index >= 0);
  const order = scorable.slice();
  for (let index = order.length - 1; index > 0; index -= 1) {
    const pick = Math.floor(random() * (index + 1));
    [order[index], order[pick]] = [order[pick], order[index]];
  }
  const take = () => order.shift();

  const weak = take();
  if (weak != null) {
    nuclei[weak] = { ...nuclei[weak], presentation: "weak", variant: "weak", key: { scorable: false, reason: "weak_signals", accept: ["weak_signals"] } };
  }
  for (let count = 0; count < 2; count += 1) {
    const dim = take();
    if (dim != null) nuclei[dim] = { ...nuclei[dim], presentation: "dim", variant: "dim" };
  }
  const close = order.find((index) => (pairedAssay(assay)
    ? nuclei[index].expected_signals.some((signal) => signal.type === "fusion")
    : nuclei[index].expected_signals.length > 0));
  if (close != null) {
    order.splice(order.indexOf(close), 1);
    let done = false;
    const signals = nuclei[close].expected_signals.map((signal) => {
      if (done) return signal;
      if (pairedAssay(assay) ? signal.type === "fusion" : true) {
        done = true;
        return { ...signal, spacing: pairedAssay(assay) ? "loose" : "doublet" };
      }
      return signal;
    });
    nuclei[close] = { ...nuclei[close], expected_signals: signals, variant: "close" };
  }
  if (advanced) {
    const extra = order.find((index) => nuclei[index].key.pattern === "normal") ?? take();
    const copy = extra != null ? equivocalCopy(nuclei[extra], assay) : null;
    if (copy) {
      const reason = pairedAssay(assay) ? "equivocal_spacing" : "diffuse_signals";
      nuclei[extra] = { ...copy, variant: "equivocal", key: { scorable: false, reason, accept: ["equivocal_spacing", "diffuse_signals"] } };
    }
  }

  const fields = [];
  nuclei.forEach((nucleus, index) => {
    const fieldIndex = Math.floor(index / PER_FIELD);
    const slot = index % PER_FIELD;
    if (!fields[fieldIndex]) fields[fieldIndex] = { index: fieldIndex, nuclei: [] };
    const col = slot % 3;
    const row = Math.floor(slot / 3);
    const tx = 160 + col * 320 + (random() * 36 - 18);
    const ty = 150 + row * 300 + (random() * 30 - 15);
    const placed = placeNucleus(nucleus, tx, ty, 0.94 + random() * 0.12);
    fields[fieldIndex].nuclei.push({ ...placed, field: fieldIndex, number: index + 1, nucleus_id: `N${String(index + 1).padStart(2, "0")}` });
  });
  const flat = fields.flatMap((field) => field.nuclei);
  return {
    fields,
    nuclei: flat,
    byId: Object.fromEntries(flat.map((nucleus) => [nucleus.nucleus_id, nucleus])),
    rules: [
      ...base.rules,
      "Dim signals that are distinct spots after raising the display brightness can be scored. Diffuse halos without a distinct spot cannot: exclude as too weak.",
      pairedAssay(assay)
        ? "Red and green within one signal diameter count as one fusion, even when the two colors are slightly offset. Check the single channels to confirm both colors are present."
        : "Two spots closer than one signal diameter are one split signal: count it once.",
    ],
  };
}

/* ---------- workstation state ---------- */

export function initWorkstation(seed) {
  return { seed, field: 0, channel: "merge", zoom: 1, cx: FIELD_W / 2, cy: FIELD_H / 2, brightness: 100, contrast: 100, overlay: true, selected: "", markMode: "", records: {}, answers: { misses: [] } };
}

/** Fully scored workstation matching the teaching key. Used for the guided walkthrough example. */
export function completedWorkstation(spec, scene, seed) {
  const ws = initWorkstation(seed);
  if (!spec || !scene?.nuclei?.length) return ws;
  const records = {};
  for (const nucleus of scene.nuclei) {
    const key = nucleus.key || {};
    if (key.scorable) {
      const counts = Object.fromEntries(countFields(spec).map((field) => [
        field,
        Number(key.counts?.[field] ?? nucleus.expected_counts?.[field] ?? 0),
      ]));
      records[nucleus.nucleus_id] = {
        decision: "score",
        reason: "",
        note: "Teaching example: scored as authored for this assay.",
        counts,
        marks: [],
      };
    } else {
      records[nucleus.nucleus_id] = {
        decision: "exclude",
        reason: key.reason || "overlapping_nuclei",
        note: "Teaching example: excluded as unsuitable for scoring.",
        counts: {},
        marks: [],
      };
    }
  }
  const key = interpretationKey(spec, scene);
  const pattern = spec.case_specific_cutoff?.pattern || "abnormal pattern";
  ws.records = records;
  ws.sceneAdvanced = false;
  ws.answers = {
    misses: key.misses || [],
    detects: key.detects || "",
    demonstrated: key.demonstrated || "",
    partner: key.partner || "",
    conclusive: key.conclusive || "",
    scope: key.scope || "",
    conclusion: `Scorable nuclei show ${pattern} in ${key.keyAbnormalPercent}% of scored nuclei (${key.keyAbnormal}/${key.keyScorable}). This supports ${String(key.demonstrated || "").replace(/_/g, " ")}.`,
    limitations: key.composition
      || "Enumeration shows copy number of the targeted chromosome in the scored nuclei. It does not show whether an extra copy is free or part of a rearrangement, or the state of other chromosomes.",
  };
  return ws;
}

function record(ws, id) {
  return ws.records?.[id] || { decision: "", reason: "", note: "", counts: {}, marks: [] };
}

function validCount(value) {
  const number = Number(value);
  return value != null && String(value).trim() !== "" && Number.isInteger(number) && number >= 0 && number <= 99;
}

export function recordStatus(spec, rec) {
  if (!rec?.decision) return "pending";
  if (rec.decision === "defer") return "deferred";
  if (rec.decision === "exclude") return rec.reason && String(rec.note || "").trim().length >= 8 ? "excluded" : "incomplete";
  return countFields(spec).every((field) => validCount(rec.counts?.[field])) ? "completed" : "incomplete";
}

const STATUS_LABEL = { pending: "Pending", deferred: "Flagged: undecided", incomplete: "Incomplete", completed: "Scored", excluded: "Excluded" };

function numericCounts(spec, counts) {
  return Object.fromEntries(countFields(spec).map((field) => [field, Number(counts?.[field] || 0)]));
}

export function describeCounts(spec, counts) {
  return countFields(spec).map((field) => `${Number(counts?.[field] || 0)} ${SIGNAL_SHORT[field] || field}`).join(", ");
}

function patternLabel(spec, pattern) {
  if (pattern === "normal") return "Normal pattern for this assay";
  if (pattern === "abnormal") return `Abnormal pattern${spec.case_specific_cutoff?.pattern ? ` (${spec.case_specific_cutoff.pattern})` : ""}`;
  return "Other pattern: not defined by this assay";
}

export function summarize(spec, scene, ws) {
  const rows = scene.nuclei.map((nucleus) => {
    const rec = record(ws, nucleus.nucleus_id);
    const status = recordStatus(spec, rec);
    const pattern = status === "completed" ? patternOf(spec, numericCounts(spec, rec.counts)) : "";
    return { nucleus, rec, status, pattern };
  });
  const scored = rows.filter((row) => row.status === "completed");
  const excluded = rows.filter((row) => row.status === "excluded");
  const abnormal = scored.filter((row) => row.pattern === "abnormal").length;
  const normal = scored.filter((row) => row.pattern === "normal").length;
  const reasons = {};
  excluded.forEach((row) => { reasons[row.rec.reason] = (reasons[row.rec.reason] || 0) + 1; });
  const criteria = cutoffOf(spec);
  return {
    rows,
    total: rows.length,
    scored: scored.length,
    excluded: excluded.length,
    open: rows.length - scored.length - excluded.length,
    normal,
    abnormal,
    other: scored.length - normal - abnormal,
    abnormalPercent: scored.length ? Math.round((abnormal / scored.length) * 1000) / 10 : null,
    scorablePercent: rows.length ? Math.round((scored.length / rows.length) * 1000) / 10 : null,
    reasons,
    minimumScorable: criteria.minimumScorable,
    percentCutoff: criteria.percentCutoff,
    cutoffKind: criteria.kind,
    cutoffSource: criteria.source,
  };
}

/* ---------- answer key ---------- */

function countsMatch(spec, keyCounts, counts) {
  return countFields(spec).every((field) => keyCounts?.[field] == null || Number(counts?.[field]) === Number(keyCounts[field]));
}

export function interpretationKey(spec, scene) {
  const keyScorable = scene.nuclei.filter((nucleus) => nucleus.key.scorable);
  const keyAbnormal = keyScorable.filter((nucleus) => nucleus.key.pattern === "abnormal").length;
  const abnormalPercent = keyScorable.length ? (keyAbnormal / keyScorable.length) * 100 : 0;
  const scorablePercent = (keyScorable.length / scene.nuclei.length) * 100;
  const criteria = cutoffOf(spec);
  let conclusive = criteria.percentCutoff != null ? "" : "adequate";
  if (criteria.minimumScorable != null && scorablePercent < criteria.minimumScorable) conclusive = "insufficient";
  else if (criteria.percentCutoff != null) conclusive = abnormalPercent >= criteria.percentCutoff ? "meets_cutoff" : "below_cutoff";
  return {
    detects: spec.strategy_expected || spec.probe_type_expected?.detects || ASSAY_DETECTS[spec.assay_type] || "",
    demonstrated: spec.expected_interpretation || "",
    partner: PARTNER_KEY[spec.assay_type] || "",
    misses: (MISS_OPTIONS[spec.assay_type] || [COMMON_MISS]).filter(([, , truth]) => truth).map(([id]) => id),
    conclusive,
    scope: SCOPE_OPTIONS[spec.assay_type]?.[0][0] || "",
    composition: spec.field_composition?.basis || "",
    keyScorable: keyScorable.length,
    keyAbnormal,
    keyAbnormalPercent: Math.round(abnormalPercent * 10) / 10,
  };
}

/** Compare the learner's records with the case key, naming the kind of each disagreement. */
export function compareToKey(spec, scene, ws) {
  const summary = summarize(spec, scene, ws);
  const rows = summary.rows.map(({ nucleus, rec, status }) => {
    const key = nucleus.key;
    let verdict = "agrees";
    if (status !== "completed" && status !== "excluded") verdict = "not_recorded";
    else if (key.scorable && status === "excluded") verdict = "inappropriate_exclusion";
    else if (!key.scorable && status === "completed") verdict = "missed_exclusion";
    else if (!key.scorable && !key.accept.includes(rec.reason)) verdict = "reason_mismatch";
    else if (key.scorable && !countsMatch(spec, key.counts, rec.counts)) verdict = "signal_recognition";
    return { nucleus, rec, status, verdict };
  });
  const tally = (name) => rows.filter((row) => row.verdict === name).length;
  const key = interpretationKey(spec, scene);
  const answers = ws.answers || {};
  const missTruth = MISS_OPTIONS[spec.assay_type] || [COMMON_MISS];
  const chosen = new Set(answers.misses || []);
  const missCorrect = chosen.size ? missTruth.filter(([id, , truth]) => chosen.has(id) === truth).length : 0;
  const questions = {
    detects: key.detects ? answers.detects === key.detects : null,
    demonstrated: key.demonstrated ? answers.demonstrated === key.demonstrated : null,
    partner: key.partner ? answers.partner === key.partner : null,
    misses: { correct: missCorrect, total: missTruth.length },
    conclusive: answers.conclusive === key.conclusive,
    scope: key.scope ? answers.scope === key.scope : null,
  };
  return {
    rows,
    key,
    questions,
    sections: gradeSections(rows, questions),
    agrees: tally("agrees"),
    total: rows.length,
    signalRecognition: tally("signal_recognition"),
    inappropriateExclusion: tally("inappropriate_exclusion"),
    missedExclusion: tally("missed_exclusion"),
    reasonMismatch: tally("reason_mismatch"),
    notRecorded: tally("not_recorded"),
    qualityCorrect: rows.filter((row) => (row.status === "completed" && row.nucleus.key.scorable) || (row.status === "excluded" && !row.nucleus.key.scorable)).length,
    patternCorrect: rows.filter((row) => row.nucleus.key.scorable && row.verdict === "agrees").length,
    keyScorable: key.keyScorable,
  };
}

const VERDICT_LABEL = {
  agrees: "Agrees with key",
  not_recorded: "Not recorded",
  inappropriate_exclusion: "Excluded a scorable nucleus",
  missed_exclusion: "Scored an unscorable nucleus",
  reason_mismatch: "Correctly excluded; reason differs",
  signal_recognition: "Correctly scored; signal counts differ",
};

/** Points per nucleus: one for the scorable decision, one for the counts or the exclusion reason. */
const VERDICT_POINTS = { agrees: 2, reason_mismatch: 1, signal_recognition: 1, inappropriate_exclusion: 0, missed_exclusion: 0, not_recorded: 0 };

/**
 * Technical scoring (what was seen), assay interpretation (what the assay means),
 * and scientific reasoning (scope and limits) are graded separately.
 */
function gradeSections(rows, questions) {
  const count = (verdict) => rows.filter((row) => row.verdict === verdict).length;
  const graded = (items) => {
    const scored = items.filter((item) => item.ok != null);
    return { earned: scored.filter((item) => item.ok).length, possible: scored.length, items };
  };
  const misses = questions.misses;
  return {
    technical: {
      earned: rows.reduce((sum, row) => sum + VERDICT_POINTS[row.verdict], 0),
      possible: rows.length * 2,
      items: [
        { label: "Scorable/unscorable decisions correct", value: `${rows.filter((row) => !["inappropriate_exclusion", "missed_exclusion", "not_recorded"].includes(row.verdict)).length}/${rows.length}` },
        { label: "Signal counts differ on correctly scored nuclei", value: count("signal_recognition") },
        { label: "Correct exclusions with a different reason", value: count("reason_mismatch") },
        { label: "Scorable nuclei excluded", value: count("inappropriate_exclusion") },
        { label: "Unscorable nuclei scored", value: count("missed_exclusion") },
        ...(count("not_recorded") ? [{ label: "Nuclei not recorded", value: count("not_recorded") }] : []),
      ],
    },
    interpretation: graded([
      { label: "What the probe set detects", ok: questions.detects },
      { label: "What the signals demonstrated", ok: questions.demonstrated },
      { label: "Whether the assay identifies a partner", ok: questions.partner },
      { label: "Adequacy and supplied criteria", ok: questions.conclusive },
    ]),
    reasoning: {
      earned: misses.correct + (questions.scope ? 1 : 0),
      possible: misses.total + (questions.scope == null ? 0 : 1),
      items: [
        { label: "What the assay could miss", value: `${misses.correct}/${misses.total} options judged correctly` },
        ...(questions.scope == null ? [] : [{ label: "What the result establishes", ok: questions.scope }]),
        { label: "Conclusion and limitations", value: "for instructor review" },
      ],
    },
  };
}

/** Graded record for a submitted case. Reveals the key, so it is attached only at submission. Kept shallow for the submission sanitizer. */
export function workstationGrading(spec, scene, ws) {
  const comparison = compareToKey(spec, scene, ws);
  const flat = (section) => ({
    earned: section.earned,
    possible: section.possible,
    items: section.items.map((item) => `${item.label}: ${item.ok == null ? item.value : item.ok ? "correct" : "incorrect"}`),
  });
  return {
    technical: flat(comparison.sections.technical),
    interpretation: flat(comparison.sections.interpretation),
    reasoning: flat(comparison.sections.reasoning),
    nuclei: comparison.rows.filter((row) => row.verdict !== "agrees").map(({ nucleus, verdict }) => ({
      nucleus: nucleus.number,
      verdict: VERDICT_LABEL[verdict],
      expected: nucleus.key.scorable ? describeCounts(spec, nucleus.key.counts) : `exclude (${REASON_LABEL[nucleus.key.reason]})`,
    })),
    key: {
      scorable: comparison.key.keyScorable,
      abnormal: comparison.key.keyAbnormal,
      abnormalPercent: comparison.key.keyAbnormalPercent,
      interpretation: String(comparison.key.demonstrated || "").replace(/_/g, " "),
    },
  };
}

/* ---------- rendering ---------- */

function viewBox(ws) {
  const zoom = Math.max(1, Math.min(MAX_ZOOM, Number(ws.zoom) || 1));
  const w = FIELD_W / zoom;
  const h = FIELD_H / zoom;
  const x = Math.max(0, Math.min(FIELD_W - w, (ws.cx ?? FIELD_W / 2) - w / 2));
  const y = Math.max(0, Math.min(FIELD_H - h, (ws.cy ?? FIELD_H / 2) - h / 2));
  return { x, y, w, h };
}

function irregularPath(n) {
  const wobble = [1, 0.94, 0.82, 1.04, 0.76, 0.9, 1.08, 0.86, 0.72, 1.02, 0.9, 0.78, 1.06, 0.88, 0.96, 1];
  const pts = wobble.map((scale, i) => {
    const angle = (Math.PI * 2 * i) / wobble.length - Math.PI / 2;
    return { x: n.cx + Math.cos(angle) * n.rx * scale, y: n.cy + Math.sin(angle) * n.ry * scale };
  });
  let d = "";
  pts.forEach((curr, i) => {
    const next = pts[(i + 1) % pts.length];
    const mid = `${((curr.x + next.x) / 2).toFixed(1)} ${((curr.y + next.y) / 2).toFixed(1)}`;
    d += i === 0 ? `M ${mid}` : ` Q ${curr.x.toFixed(1)} ${curr.y.toFixed(1)} ${mid}`;
  });
  const [first, second] = pts;
  return `${d} Q ${first.x.toFixed(1)} ${first.y.toFixed(1)} ${((first.x + second.x) / 2).toFixed(1)} ${((first.y + second.y) / 2).toFixed(1)} Z`;
}

function dapiBody(body, irregular, opacity, uid) {
  const paint = `fill="url(#${uid}-dapi)" fill-opacity="${opacity}" filter="url(#${uid}-texture)"`;
  return irregular ? `<path d="${irregularPath(body)}" ${paint}/>` : `<ellipse cx="${body.cx.toFixed(1)}" cy="${body.cy.toFixed(1)}" rx="${body.rx.toFixed(1)}" ry="${body.ry.toFixed(1)}" ${paint}/>`;
}

/** Each probe signal split into its fluorophore components; a fusion is a red and a green spot overlapping. */
function components(signal) {
  if (signal.type !== "fusion") return [{ color: signal.type, x: signal.x, y: signal.y }];
  const offset = DIAMETER * (signal.spacing === "loose" ? 0.38 : 0.1);
  return [{ color: "red", x: signal.x - offset, y: signal.y - offset * 0.4 }, { color: "green", x: signal.x + offset, y: signal.y + offset * 0.4 }];
}

function spotMarkup(component, presentation, spacing, uid) {
  const color = SIGNAL_COLOR[component.color] || "#d8d8e0";
  const blend = `style="mix-blend-mode:screen"`;
  const { x, y } = component;
  if (presentation === "ambiguous") {
    return `<g ${blend}><ellipse cx="${x}" cy="${y}" rx="${DIAMETER * 2}" ry="${DIAMETER}" fill="${color}" fill-opacity=".3" transform="rotate(-24 ${x} ${y})" filter="url(#${uid}-soft)"/><ellipse cx="${x + DIAMETER}" cy="${y + DIAMETER * 0.55}" rx="${DIAMETER * 1.3}" ry="${DIAMETER * 0.8}" fill="${color}" fill-opacity=".35" filter="url(#${uid}-soft)"/></g>`;
  }
  if (presentation === "weak") {
    return `<circle cx="${x}" cy="${y}" r="${DIAMETER * 0.8}" fill="${color}" fill-opacity=".16" filter="url(#${uid}-soft)" ${blend}/>`;
  }
  const core = presentation === "dim" ? 0.3 : 0.95;
  const halo = presentation === "dim" ? 0.08 : 0.3;
  const dot = (cx, cy, r) => `<circle cx="${cx.toFixed(2)}" cy="${cy.toFixed(2)}" r="${(r * 2.3).toFixed(2)}" fill="${color}" fill-opacity="${halo}" filter="url(#${uid}-glow)" ${blend}/><circle cx="${cx.toFixed(2)}" cy="${cy.toFixed(2)}" r="${r}" fill="${color}" fill-opacity="${core}" ${blend}/>`;
  if (spacing === "doublet") return dot(x - DIAMETER * 0.3, y - DIAMETER * 0.1, CORE_R * 0.75) + dot(x + DIAMETER * 0.3, y + DIAMETER * 0.1, CORE_R * 0.75);
  return dot(x, y, CORE_R);
}

function signalVisible(channel, color) {
  if (channel === "merge") return true;
  return channel === color;
}

function markMarkup(mark) {
  const color = SIGNAL_COLOR[mark.type] || "#ffffff";
  return `<g class="ws-mark" pointer-events="none"><circle cx="${mark.x}" cy="${mark.y}" r="5.5" fill="none" stroke="${color}" stroke-width=".9" stroke-dasharray="2 1.4"/><path d="M ${mark.x - 8} ${mark.y} h 3 M ${mark.x + 5} ${mark.y} h 3 M ${mark.x} ${mark.y - 8} v 3 M ${mark.x} ${mark.y + 5} v 3" stroke="${color}" stroke-width=".8"/></g>`;
}

const STATUS_COLOR = { completed: "#8fe3a8", excluded: "#f3b18f", incomplete: "#f1dd8a", deferred: "#c9b8ff", pending: "#c8d0dc" };

function nucleusMarkup(spec, nucleus, ws, uid, reveal) {
  const rec = record(ws, nucleus.nucleus_id);
  const status = recordStatus(spec, rec);
  const showDapi = ws.channel === "dapi" || ws.channel === "merge";
  const body = showDapi ? 0.62 : 0.07;
  const irregular = nucleus.presentation === "irregular";
  const parts = [dapiBody(nucleus, irregular, body, uid)];
  if (nucleus.overlap) parts.push(dapiBody(nucleus.overlap, false, body * 0.85, uid));
  if (nucleus.fragment) parts.push(dapiBody(nucleus.fragment, false, body * 0.8, uid));
  if (ws.channel !== "dapi") {
    for (const signal of nucleus.expected_signals || []) {
      for (const component of components(signal)) {
        if (signalVisible(ws.channel, component.color)) parts.push(spotMarkup(component, nucleus.presentation, signal.spacing, uid));
      }
    }
  }
  const selected = ws.selected === nucleus.nucleus_id;
  const reachX = nucleus.overlap ? Math.abs(nucleus.overlap.cx - nucleus.cx) / 2 + Math.max(nucleus.rx, nucleus.overlap.rx) : nucleus.rx;
  const reachY = nucleus.overlap ? Math.abs(nucleus.overlap.cy - nucleus.cy) / 2 + Math.max(nucleus.ry, nucleus.overlap.ry) : nucleus.ry;
  const ax = nucleus.overlap ? (nucleus.cx + nucleus.overlap.cx) / 2 : nucleus.cx;
  const ay = nucleus.overlap ? (nucleus.cy + nucleus.overlap.cy) / 2 : nucleus.cy;
  const overlay = ws.overlay || selected;
  const label = overlay ? `<text x="${(ax - reachX).toFixed(1)}" y="${(ay - reachY - 5).toFixed(1)}" fill="${STATUS_COLOR[status]}" font-size="12" font-family="Helvetica, sans-serif" pointer-events="none">${nucleus.number}${status === "completed" ? " ✓" : status === "excluded" ? " ✕" : status === "deferred" ? " ?" : ""}${reveal ? (nucleus.key.scorable ? " · key: score" : " · key: exclude") : ""}</text>` : "";
  const ring = selected ? `<ellipse cx="${ax.toFixed(1)}" cy="${ay.toFixed(1)}" rx="${(reachX + 9).toFixed(1)}" ry="${(reachY + 9).toFixed(1)}" fill="none" stroke="#ffffff" stroke-width="1.2" stroke-dasharray="5 4" pointer-events="none"/>` : "";
  const marks = overlay ? (rec.marks || []).map(markMarkup).join("") : "";
  return `<g class="ws-nucleus${selected ? " on" : ""}" data-ws-nucleus="${nucleus.nucleus_id}" role="button" tabindex="-1" aria-label="Nucleus ${nucleus.number}, ${STATUS_LABEL[status]}">
    <ellipse cx="${ax.toFixed(1)}" cy="${ay.toFixed(1)}" rx="${(reachX + 6).toFixed(1)}" ry="${(reachY + 6).toFixed(1)}" fill="transparent"/>
    ${parts.join("")}${ring}${label}${marks}</g>`;
}

function stageSVG(spec, scene, ws, reveal) {
  const field = scene.fields[ws.field] || scene.fields[0];
  const uid = `ws${field.index}`;
  const vb = viewBox(ws);
  return `<svg class="ws-svg" viewBox="${vb.x.toFixed(1)} ${vb.y.toFixed(1)} ${vb.w.toFixed(1)} ${vb.h.toFixed(1)}" preserveAspectRatio="xMidYMid meet" style="filter: brightness(${ws.brightness}%) contrast(${ws.contrast}%)" role="group" aria-label="Fluorescence field ${field.index + 1}, ${channelName(ws.channel)} channel">
    <defs>
      <radialGradient id="${uid}-dapi" cx="48%" cy="44%" r="68%"><stop offset="0" stop-color="#5a7fe6" stop-opacity=".8"/><stop offset=".6" stop-color="#2a50b0" stop-opacity=".85"/><stop offset="1" stop-color="#132559" stop-opacity=".7"/></radialGradient>
      <filter id="${uid}-texture" x="-8%" y="-8%" width="116%" height="116%"><feTurbulence type="fractalNoise" baseFrequency=".18" numOctaves="2" seed="${(ws.seed + field.index) % 97}" result="grain"/><feColorMatrix in="grain" type="saturate" values="0" result="gray"/><feComponentTransfer in="gray" result="soft"><feFuncA type="table" tableValues="0 .2"/></feComponentTransfer><feComposite in="soft" in2="SourceAlpha" operator="in" result="clip"/><feBlend in="SourceGraphic" in2="clip" mode="screen"/></filter>
      <filter id="${uid}-glow" x="-200%" y="-200%" width="500%" height="500%"><feGaussianBlur stdDeviation="1.6"/></filter>
      <filter id="${uid}-soft" x="-200%" y="-200%" width="500%" height="500%"><feGaussianBlur stdDeviation="2.6"/></filter>
    </defs>
    <rect x="0" y="0" width="${FIELD_W}" height="${FIELD_H}" fill="#04050a"/>
    ${field.nuclei.map((nucleus) => nucleusMarkup(spec, nucleus, ws, uid, reveal)).join("")}
  </svg>`;
}

function channelName(channel) {
  return { dapi: "DAPI", red: "Red", green: "Green", merge: "Merged" }[channel] || channel;
}

function probeLegend(probes) {
  return (probes || []).length
    ? `<ul class="ws-probes">${probes.map((probe) => `<li><span class="ws-dot ${escapeHtml(probe.fluorophore || "")}"></span>${escapeHtml(probe.fluorophore || "probe")}: ${escapeHtml(probe.probe_name)} at ${escapeHtml(probe.target_locus)}</li>`).join("")}</ul>`
    : "";
}

function nucleusPanel(spec, scene, ws, ctx) {
  const nucleus = scene.byId[ws.selected];
  if (!nucleus) {
    return `<section class="ws-panel"><h4>Nucleus worksheet</h4><p class="muted">Click a nucleus in the field to open its worksheet. You can also choose one from the scoring table below.</p></section>`;
  }
  const rec = record(ws, nucleus.nucleus_id);
  const status = recordStatus(spec, rec);
  const lock = ctx.locked ? "disabled" : "";
  const fields = countFields(spec);
  const markTypes = ["red", "green", "fusion"].filter((type) => fields.includes(type));
  const reasonInfo = EXCLUSION_REASONS.find(([id]) => id === rec.reason);
  return `<section class="ws-panel" aria-live="polite">
    <header class="ws-panel-head"><h4>Nucleus ${nucleus.number} <small>Field ${nucleus.field + 1}</small></h4><span class="ws-status ${status}">${STATUS_LABEL[status]}</span></header>
    <div class="ws-inline"><button type="button" class="btn" data-ws="zoom-nucleus">Zoom to nucleus</button><button type="button" class="btn" data-ws="step" data-delta="-1">Previous</button><button type="button" class="btn" data-ws="step" data-delta="1">Next</button></div>
    <fieldset class="ws-decision" ${lock}><legend>Is this nucleus scorable?</legend>
      ${[["score", "Scorable: record signals"], ["exclude", "Not scorable: exclude with a reason"], ["defer", "Undecided: flag and return later"]].map(([value, label]) => `<label class="check"><input type="radio" name="ws-decision" data-ws-field="decision" value="${value}" ${rec.decision === value ? "checked" : ""}/> ${label}</label>`).join("")}
    </fieldset>
    ${rec.decision === "exclude" ? `<label class="stack">Reason for exclusion
        <select data-ws-field="reason" ${lock}><option value="">Select…</option>${EXCLUSION_REASONS.map(([id, label]) => `<option value="${id}" ${rec.reason === id ? "selected" : ""}>${escapeHtml(label)}</option>`).join("")}</select></label>
      ${reasonInfo ? `<p class="muted ws-reason-help">${escapeHtml(reasonInfo[2])}</p>` : ""}
      <label class="stack">What do you see that supports this? <small class="muted">Required; recorded in the report.</small>
        <textarea data-ws-field="note" rows="2" maxlength="240" placeholder="e.g., two outlines overlap; the green signal sits in the shared area" ${lock}>${escapeHtml(rec.note || "")}</textarea></label>` : ""}
    ${rec.decision === "score" ? `<fieldset class="fish-count-fields" ${lock}><legend>Signal counts</legend>${fields.map((field) => `<label class="fish-count-row">${escapeHtml(field === "split" ? "Split (separated pairs)" : field)}<span class="fish-count-control"><button type="button" class="fish-count-step" data-ws="count" data-field="${field}" data-delta="-1" aria-label="Decrease ${field}">−</button><input type="number" min="0" max="99" inputmode="numeric" data-ws-field="count" data-field="${field}" value="${escapeHtml(rec.counts?.[field] ?? "")}" aria-label="${field} count"/><button type="button" class="fish-count-step" data-ws="count" data-field="${field}" data-delta="1" aria-label="Increase ${field}">+</button></span></label>`).join("")}</fieldset>
      <details class="ws-annotate" ${ws.markMode ? "open" : ""}><summary>Mark signal locations (optional)</summary>
        <p class="muted">Choose a signal type, then click each signal inside this nucleus. Marks are your annotations; they do not change the image.</p>
        <div class="ws-inline">${markTypes.map((type) => `<button type="button" class="sig-btn ${type} ${ws.markMode === type ? "on" : ""}" data-ws="mark-mode" data-type="${type}" ${lock}>${type}</button>`).join("")}<button type="button" class="btn" data-ws="mark-mode" data-type="" ${ws.markMode ? "" : "disabled"}>Stop marking</button></div>
        <p class="muted">${(rec.marks || []).length} mark(s). <button type="button" class="link-btn" data-ws="mark-undo" ${lock}>Undo last</button> · <button type="button" class="link-btn" data-ws="marks-to-counts" ${lock}>Use marks as counts</button></p>
      </details>
      <label class="stack">Observation note (optional)<textarea data-ws-field="note" rows="2" maxlength="240" placeholder="e.g., signals dim; distinct after raising brightness" ${lock}>${escapeHtml(rec.note || "")}</textarea></label>` : ""}
    ${rec.decision === "defer" ? `<label class="stack">What makes it uncertain?<textarea data-ws-field="note" rows="2" maxlength="240" ${lock}>${escapeHtml(rec.note || "")}</textarea></label>` : ""}
    <div class="ws-panel-status">
    ${status === "completed" ? `<p class="ws-derived">Pattern: <strong>${escapeHtml(describeCounts(spec, rec.counts))}</strong> · ${escapeHtml(patternLabel(spec, patternOf(spec, numericCounts(spec, rec.counts))))}</p>` : ""}
    ${status === "pending" && rec.touched ? `<p class="feedback">Decide whether this nucleus is scorable before moving on.</p>` : ""}
    ${status === "incomplete" ? `<p class="feedback">${rec.decision === "exclude" ? "Choose a reason and describe what you see (at least a short phrase)." : "Enter a whole-number count for every signal type, using 0 when none is present."}</p>` : ""}
    </div>
    ${ctx.locked ? "" : `<button type="button" class="btn primary" data-ws="save-next">Save &amp; next undecided nucleus</button>`}
  </section>`;
}

function worksheetTable(spec, scene, ws, summary, comparison) {
  return `<div class="ws-table-wrap"><table class="case-table ws-table"><thead><tr><th>Nucleus</th><th>Field</th><th>Scorable?</th><th>Signal pattern</th><th>Interpretation</th><th>Reason / note</th>${comparison ? "<th>Answer key</th>" : ""}</tr></thead><tbody>
    ${summary.rows.map(({ nucleus, rec, status, pattern }, index) => {
      const scorable = status === "completed" ? "Yes" : status === "excluded" ? "No" : status === "deferred" ? "Undecided" : status === "incomplete" ? "Incomplete" : "Pending";
      const signals = status === "completed" ? describeCounts(spec, rec.counts) : status === "excluded" ? REASON_LABEL[rec.reason] || "" : "Not yet assessed";
      const meaning = status === "completed" ? patternLabel(spec, pattern) : status === "excluded" ? "Excluded" : "—";
      const verdict = comparison?.rows[index];
      const keyText = verdict ? `${VERDICT_LABEL[verdict.verdict]}${verdict.verdict === "agrees" ? "" : `: ${nucleus.key.scorable ? describeCounts(spec, nucleus.key.counts) : `exclude (${REASON_LABEL[nucleus.key.reason]})`}`}` : "";
      return `<tr class="${ws.selected === nucleus.nucleus_id ? "on" : ""} ${verdict && verdict.verdict !== "agrees" ? "ws-miss" : ""}"><td><button type="button" class="btn" data-ws="select" data-id="${nucleus.nucleus_id}">${String(nucleus.number).padStart(2, "0")}</button></td><td>${nucleus.field + 1}</td><td>${scorable}</td><td>${escapeHtml(signals)}</td><td>${escapeHtml(meaning)}</td><td>${escapeHtml(rec.note || "")}</td>${comparison ? `<td>${escapeHtml(keyText)}</td>` : ""}</tr>`;
    }).join("")}
  </tbody></table></div>`;
}

function summaryBlock(spec, summary) {
  const reasons = Object.entries(summary.reasons).map(([id, n]) => `${REASON_LABEL[id] || id}: ${n}`).join("; ");
  return `<div class="ws-summary">
    <dl>
      <div><dt>Nuclei in fields</dt><dd>${summary.total}</dd></div>
      <div><dt>Scored (completed, scorable)</dt><dd>${summary.scored}</dd></div>
      <div><dt>Excluded with a reason</dt><dd>${summary.excluded}</dd></div>
      <div><dt>Still open</dt><dd>${summary.open}</dd></div>
      <div><dt>Normal / abnormal / other</dt><dd>${summary.normal} / ${summary.abnormal} / ${summary.other}</dd></div>
      <div><dt>Abnormal, % of scored nuclei</dt><dd>${summary.abnormalPercent == null ? "—" : `${summary.abnormalPercent}%`}</dd></div>
    </dl>
    ${reasons ? `<p class="muted">Exclusions: ${escapeHtml(reasons)}.</p>` : ""}
    <p class="muted">Percentages use completed, scorable nuclei only. Excluded nuclei and their reasons are kept in the worksheet and the report.${summary.open ? ` ${summary.open} nucleus record(s) are still open, so the proportion may change.` : ""}</p>
    <p class="ws-criteria"><strong>Educational scoring assumption:</strong> ${summary.minimumScorable != null ? `at least ${summary.minimumScorable}% of examined nuclei scorable` : "no minimum scorable fraction stated"}; ${summary.percentCutoff != null ? `a teaching figure of ${summary.percentCutoff}% abnormal nuclei` : "no abnormal-percentage figure supplied"}. A stored cutoff here is an assumption for the exercise unless a source is cited with it. It does not score this worksheet.</p>
  </div>`;
}

function criteriaCard(spec) {
  const criteria = cutoffOf(spec);
  const cutoff = criteria.percentCutoff != null
    ? `<li><strong>Abnormal figure: ${criteria.percentCutoff}%</strong> of scored nuclei with the abnormal pattern. <span class="ws-cutoff-kind">${criteria.kind === "published" ? "Cited with a source. This laboratory has not independently validated it." : "Educational assumption for this exercise. Not a validated laboratory threshold."}</span>${criteria.source ? ` ${escapeHtml(criteria.source)}` : ""}</li>`
    : `<li><strong>No abnormal-percentage cutoff is supplied.</strong> Report the pattern and the proportion of scored nuclei without calling the result positive or negative by a threshold.</li>`;
  return `<div class="ws-criteria-card"><p class="eyebrow">Interpretation criteria supplied</p><ul>
    <li>${criteria.minimumScorable != null ? `At least ${criteria.minimumScorable}% of examined nuclei must be scorable.` : "No minimum scorable fraction is stated."}</li>
    ${cutoff}
  </ul><p class="muted">Clinical laboratories validate their own cutoffs for each assay, specimen type, and scoring method.</p></div>`;
}

function radioGroup(name, options, value, lock) {
  return options.map(([id, label]) => `<label class="check"><input type="radio" name="ws-${name}" data-ws-field="answer" data-key="${name}" value="${escapeHtml(id)}" ${value === id ? "checked" : ""} ${lock}/> ${escapeHtml(label)}</label>`).join("");
}

function interpretationBlock(spec, ws, ctx, comparison) {
  const answers = ws.answers || {};
  const lock = ctx.locked ? "disabled" : "";
  const misses = MISS_OPTIONS[spec.assay_type] || [COMMON_MISS];
  const mark = (ok) => (comparison && ok != null ? `<span class="ws-grade ${ok ? "ok" : "no"}">${ok ? "matches key" : "differs from key"}</span>` : "");
  const q = comparison?.questions;
  const key = comparison?.key;
  return `<section class="ws-interpret"><h4>Assay interpretation</h4>
    <fieldset><legend>1. What abnormality can this probe set detect? ${mark(q?.detects)}</legend>${radioGroup("detects", DETECT_OPTIONS.map((item) => [item, item]), answers.detects, lock)}</fieldset>
    <fieldset><legend>2. What did the observed signals demonstrate? ${mark(q?.demonstrated)}</legend>${radioGroup("demonstrated", (spec.interpretation_options || []).map((item) => [item, item.replace(/_/g, " ")]), answers.demonstrated, lock)}</fieldset>
    <fieldset><legend>3. Does this assay identify a specific fusion partner? ${mark(q?.partner)}</legend>${radioGroup("partner", PARTNER_OPTIONS, answers.partner, lock)}</fieldset>
    <fieldset><legend>4. Which of these could this assay miss? Select all that apply. ${comparison ? `<span class="ws-grade ${q.misses.correct === q.misses.total ? "ok" : "no"}">${q.misses.correct}/${q.misses.total} correct</span>` : ""}</legend>${misses.map(([id, label]) => `<label class="check"><input type="checkbox" data-ws-field="miss" value="${id}" ${(answers.misses || []).includes(id) ? "checked" : ""} ${lock}/> ${escapeHtml(label)}</label>`).join("")}</fieldset>
    <fieldset><legend>5. ${cutoffOf(spec).percentCutoff != null ? "Applying the supplied interpretation criteria, what is the result?" : "Is the study adequate, and how should the proportion be reported?"} ${mark(q?.conclusive)}</legend>${radioGroup("conclusive", resultOptions(spec), answers.conclusive, lock)}</fieldset>
    ${SCOPE_OPTIONS[spec.assay_type] ? `<fieldset><legend>6. What does this result establish, and what does it leave open? ${mark(q?.scope)}</legend>${radioGroup("scope", scopeOrder(spec, ws.seed), answers.scope, lock)}</fieldset>` : ""}
    <label class="stack">Conclusion<textarea data-ws-field="text" data-key="conclusion" rows="3" maxlength="1500" placeholder="State the pattern, the proportion of scored nuclei, and what it supports, within the limits of this assay." ${lock}>${escapeHtml(answers.conclusion || "")}</textarea></label>
    <label class="stack">Limitations<textarea data-ws-field="text" data-key="limitations" rows="2" maxlength="1500" placeholder="What this assay cannot establish, and any limits of the nuclei you could score." ${lock}>${escapeHtml(answers.limitations || "")}</textarea></label>
    ${key ? `<p class="muted">Answer key: ${key.keyScorable} scorable nuclei, ${key.keyAbnormal} with the abnormal pattern (${key.keyAbnormalPercent}%). Expected interpretation: ${escapeHtml(String(key.demonstrated || "not stated").replace(/_/g, " "))}.${key.composition ? ` Field composition: ${escapeHtml(key.composition)}` : ""}</p>` : ""}
  </section>`;
}

function scopeOrder(spec, seed) {
  const options = SCOPE_OPTIONS[spec.assay_type] || [];
  const shift = Math.abs(Number(seed) || 0) % options.length;
  return [...options.slice(shift), ...options.slice(0, shift)];
}

function comparisonBlock(comparison) {
  const { technical, interpretation, reasoning } = comparison.sections;
  const item = (entry) => `<li>${escapeHtml(entry.label)}: <strong>${entry.ok == null ? escapeHtml(String(entry.value)) : entry.ok ? "correct" : "incorrect"}</strong></li>`;
  const part = (title, note, section) => `<div class="ws-grade-part"><h5>${title} <span class="ws-grade-score">${section.earned}/${section.possible}</span></h5><p class="muted">${note}</p><ul class="comp-list">${section.items.map(item).join("")}</ul></div>`;
  return `<section class="ws-compare"><h4>Your work compared with the case key</h4>
    <div class="ws-grade-parts">
      ${part("Technical scoring", "What you saw: one point per nucleus for the scorable decision, one for the counts or the exclusion reason.", technical)}
      ${part("Assay interpretation", "What the assay and the signals mean, independent of your counting.", interpretation)}
      ${part("Scientific reasoning", "What the result can and cannot establish.", reasoning)}
    </div></section>`;
}

function stepsBar(spec, summary, ws) {
  const answers = ws.answers || {};
  const steps = [
    ["Indication & assay", true],
    ["Examine channels", Boolean(ws.channelsSeen && ws.channelsSeen.length >= 3)],
    ["Score or exclude each nucleus", summary.open === 0],
    ["Summarize", summary.scored > 0 && summary.open === 0],
    ["Interpret", Boolean(answers.detects && answers.demonstrated && answers.partner && answers.conclusive && (answers.scope || !SCOPE_OPTIONS[spec.assay_type]))],
    ["Conclusion & limitations", Boolean(String(answers.conclusion || "").trim() && String(answers.limitations || "").trim())],
  ];
  return `<ol class="ws-steps">${steps.map(([label, done], index) => `<li class="${done ? "done" : ""}"><span>${index + 1}</span>${escapeHtml(label)}</li>`).join("")}</ol>`;
}

/**
 * ctx: { host, spec, probes, scene, ws, indication, locked, reveal }
 */
export function workstationHTML(ctx) {
  const { spec, scene, ws } = ctx;
  if (!scene) return `<p class="muted">This case does not define both a normal and an abnormal pattern with authored nuclei, so the microscope workstation is not available.</p>`;
  const summary = summarize(spec, scene, ws);
  const comparison = ctx.reveal ? compareToKey(spec, scene, ws) : null;
  const channels = spec.channels?.length ? spec.channels : ["dapi", "red", "green", "merge"];
  const field = scene.fields[ws.field] || scene.fields[0];
  const fieldDone = (f) => f.nuclei.every((nucleus) => ["completed", "excluded"].includes(recordStatus(spec, record(ws, nucleus.nucleus_id))));
  const part = ctx.part || "all";
  const assay = `<section class="ws-assay">
      <div><p class="eyebrow">Clinical indication</p><p>${escapeHtml(ctx.indication || "Not supplied.")}</p></div>
      <div><p class="eyebrow">Assay and intended target</p>${probeLegend(ctx.probes)}</div>
      ${criteriaCard(spec)}
      <details><summary>Scoring rules for this assay</summary><ul>${scene.rules.map((rule) => `<li>${escapeHtml(rule)}</li>`).join("")}</ul><p class="muted">Teaching rules for this exercise. Each laboratory validates its own scoring criteria and cutoffs.</p></details>
    </section>`;
  const bench = `<div class="ws-bench">
      <section class="ws-scope">
        <div class="ws-toolbar" role="toolbar" aria-label="Microscope controls">
          <div class="ws-group" role="group" aria-label="Channel">${channels.map((channel) => `<button type="button" class="btn ws-ch ${channel} ${ws.channel === channel ? "primary" : ""}" data-ws="channel" data-ch="${channel}" aria-pressed="${ws.channel === channel}">${channelName(channel)}</button>`).join("")}</div>
          <div class="ws-group" role="group" aria-label="Zoom"><button type="button" class="btn" data-ws="zoom" data-factor="0.5" aria-label="Zoom out">−</button><span class="ws-zoom-label">${(Number(ws.zoom) || 1).toFixed(1)}×</span><button type="button" class="btn" data-ws="zoom" data-factor="2" aria-label="Zoom in">+</button><button type="button" class="btn" data-ws="fit">Fit field</button></div>
          <label class="ws-slider">Brightness <input type="range" min="50" max="300" step="10" value="${ws.brightness}" data-ws-field="brightness"/></label>
          <label class="ws-slider">Contrast <input type="range" min="50" max="250" step="10" value="${ws.contrast}" data-ws-field="contrast"/></label>
          <label class="check ws-overlay"><input type="checkbox" data-ws-field="overlay" ${ws.overlay ? "checked" : ""}/> Labels</label>
        </div>
        <div class="ws-stage" data-ws-stage="1">${stageSVG(spec, scene, ws, Boolean(comparison))}</div>
        <p class="ws-caption">Synthetic demonstration fluorescence drawn from nuclei authored for this assay. Not clinical microscopy. Brightness and contrast change only the display, not the signals. Drag to pan, scroll to zoom, click a nucleus to score it.</p>
        <nav class="ws-fields" aria-label="Microscope fields">${scene.fields.map((f) => `<button type="button" class="btn ${f.index === field.index ? "primary" : ""}" data-ws="field" data-index="${f.index}">Field ${f.index + 1}${fieldDone(f) ? " ✓" : ""} <small>${f.nuclei.length} nuclei</small></button>`).join("")}</nav>
      </section>
      ${nucleusPanel(spec, scene, ws, ctx)}
    </div>
    <section class="ws-worksheet"><h4>Scoring worksheet</h4>${summaryBlock(spec, summary)}${worksheetTable(spec, scene, ws, summary, comparison)}</section>`;
  const interpret = `${comparison ? comparisonBlock(comparison) : ""}${interpretationBlock(spec, ws, ctx, comparison)}`;
  const body = part === "scope"
    ? `${assay}${bench}`
    : part === "interpret"
      ? `<section class="ws-worksheet"><h4>Your tallies</h4>${summaryBlock(spec, summary)}</section>${interpret}`
      : `${assay}${bench}${interpret}`;
  return `<div class="ws-root" data-ws-host="${escapeHtml(ctx.host)}" data-ws-part="${escapeHtml(part)}">
    ${stepsBar(spec, summary, ws)}
    ${body}
  </div>`;
}

/** Plain record of the learner's work for reports and submissions. Contains no answer key. */
export function workstationReport(spec, scene, ws) {
  const summary = summarize(spec, scene, ws);
  const answers = ws.answers || {};
  const misses = MISS_OPTIONS[spec.assay_type] || [COMMON_MISS];
  return {
    seed: ws.seed,
    summary: {
      total: summary.total,
      scored: summary.scored,
      excluded: summary.excluded,
      open: summary.open,
      normal: summary.normal,
      abnormal: summary.abnormal,
      other: summary.other,
      abnormalPercent: summary.abnormalPercent,
      scorablePercent: summary.scorablePercent,
      exclusionReasons: Object.entries(summary.reasons).map(([id, count]) => ({ reason: REASON_LABEL[id] || id, count })),
      criteria: { minimumScorable: summary.minimumScorable, percentCutoff: summary.percentCutoff, cutoffKind: summary.percentCutoff != null ? summary.cutoffKind : "", cutoffSource: summary.cutoffSource },
    },
    nuclei: summary.rows.map(({ nucleus, rec, status, pattern }) => ({
      nucleus: nucleus.number,
      field: nucleus.field + 1,
      status: STATUS_LABEL[status],
      scorable: status === "completed" ? "Yes" : status === "excluded" ? "No" : "—",
      signals: status === "completed" ? describeCounts(spec, rec.counts) : "",
      interpretation: status === "completed" ? patternLabel(spec, pattern) : "",
      reason: status === "excluded" ? REASON_LABEL[rec.reason] || "" : "",
      note: rec.note || "",
      marks: (rec.marks || []).length,
    })),
    answers: {
      detects: answers.detects || "",
      demonstrated: String(answers.demonstrated || "").replace(/_/g, " "),
      partner: PARTNER_OPTIONS.find(([id]) => id === answers.partner)?.[1] || "",
      misses: misses.filter(([id]) => (answers.misses || []).includes(id)).map(([, label]) => label),
      conclusive: resultOptions(spec).find(([id]) => id === answers.conclusive)?.[1] || "",
      scope: (SCOPE_OPTIONS[spec.assay_type] || []).find(([id]) => id === answers.scope)?.[1] || "",
      conclusion: answers.conclusion || "",
      limitations: answers.limitations || "",
    },
  };
}

/* ---------- interaction ---------- */

const hosts = new Map();
let installed = false;
let drag = null;

/** host: { context(): ctx, save(ws) } */
export function registerWorkstationHost(name, host) {
  hosts.set(name, host);
  if (!installed && typeof document !== "undefined") {
    installed = true;
    document.addEventListener("click", onClick);
    document.addEventListener("input", onInput);
    document.addEventListener("change", onChange);
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("pointermove", onPointerMove);
    document.addEventListener("pointerup", onPointerUp);
    document.addEventListener("pointercancel", () => { drag = null; });
    document.addEventListener("wheel", onWheel, { passive: false });
  }
}

function hostFor(el) {
  const root = el?.closest?.(".ws-root");
  const name = root?.getAttribute("data-ws-host");
  const host = name ? hosts.get(name) : null;
  if (!host) return null;
  const ctx = host.context();
  if (!ctx?.scene) return null;
  return { root, host, ctx, ws: { ...ctx.ws, records: { ...(ctx.ws.records || {}) }, answers: { misses: [], ...(ctx.ws.answers || {}) } } };
}

function commit(found, ws, rerender = true) {
  found.host.save(ws);
  if (!rerender) return;
  const ctx = found.host.context();
  const part = found.root.getAttribute("data-ws-part") || ctx.part || "all";
  const next = document.createElement("div");
  next.innerHTML = workstationHTML({ ...ctx, part });
  found.root.replaceWith(next.firstElementChild);
}

function updateRecord(ws, id, partial) {
  const current = record(ws, id);
  ws.records[id] = { ...current, ...partial, counts: { ...(current.counts || {}), ...(partial.counts || {}) } };
}

function centerOn(ws, nucleus) {
  ws.cx = nucleus.overlap ? (nucleus.cx + nucleus.overlap.cx) / 2 : nucleus.cx;
  ws.cy = nucleus.overlap ? (nucleus.cy + nucleus.overlap.cy) / 2 : nucleus.cy;
}

function selectNucleus(ws, scene, id, { zoom = false } = {}) {
  const nucleus = scene.byId[id];
  if (!nucleus) return;
  ws.selected = id;
  ws.field = nucleus.field;
  ws.markMode = "";
  if (zoom) {
    ws.zoom = Math.max(Number(ws.zoom) || 1, 3);
    centerOn(ws, nucleus);
  } else if ((Number(ws.zoom) || 1) > 1) centerOn(ws, nucleus);
}

function onClick(ev) {
  const el = ev.target.closest?.("[data-ws]");
  if (!el) return;
  const found = hostFor(el);
  if (!found) return;
  const { ctx, ws } = found;
  const { spec, scene } = ctx;
  const action = el.getAttribute("data-ws");
  const id = ws.selected;
  if (action === "channel") {
    ws.channel = el.getAttribute("data-ch") || "merge";
    ws.channelsSeen = [...new Set([...(ws.channelsSeen || []), ws.channel])];
  } else if (action === "zoom") {
    ws.zoom = Math.max(1, Math.min(MAX_ZOOM, (Number(ws.zoom) || 1) * Number(el.getAttribute("data-factor"))));
  } else if (action === "fit") {
    Object.assign(ws, { zoom: 1, cx: FIELD_W / 2, cy: FIELD_H / 2 });
  } else if (action === "field") {
    Object.assign(ws, { field: Number(el.getAttribute("data-index")) || 0, zoom: 1, cx: FIELD_W / 2, cy: FIELD_H / 2, selected: "", markMode: "" });
  } else if (action === "select") {
    selectNucleus(ws, scene, el.getAttribute("data-id"), { zoom: true });
    found.root.querySelector(".ws-bench")?.scrollIntoView({ behavior: "smooth", block: "start" });
  } else if (action === "zoom-nucleus" && id) {
    selectNucleus(ws, scene, id, { zoom: true });
  } else if (action === "step" && id) {
    const at = scene.nuclei.findIndex((nucleus) => nucleus.nucleus_id === id);
    const next = scene.nuclei[Math.max(0, Math.min(scene.nuclei.length - 1, at + Number(el.getAttribute("data-delta"))))];
    selectNucleus(ws, scene, next.nucleus_id);
  } else if (ctx.locked) {
    return;
  } else if (action === "count" && id) {
    const field = el.getAttribute("data-field");
    const now = Number(record(ws, id).counts?.[field]);
    updateRecord(ws, id, { counts: { [field]: String(Math.max(0, Math.min(99, (Number.isFinite(now) ? now : 0) + Number(el.getAttribute("data-delta"))))) } });
  } else if (action === "mark-mode") {
    ws.markMode = el.getAttribute("data-type") || "";
  } else if (action === "mark-undo" && id) {
    updateRecord(ws, id, { marks: (record(ws, id).marks || []).slice(0, -1) });
  } else if (action === "marks-to-counts" && id) {
    const marks = record(ws, id).marks || [];
    const counts = {};
    countFields(spec).forEach((field) => {
      if (["red", "green", "fusion"].includes(field)) counts[field] = String(marks.filter((mark) => mark.type === field).length);
    });
    updateRecord(ws, id, { counts });
  } else if (action === "save-next" && id) {
    const status = recordStatus(spec, record(ws, id));
    if (status === "pending" || status === "incomplete") {
      updateRecord(ws, id, { touched: true });
    } else {
      const order = scene.nuclei.map((nucleus) => nucleus.nucleus_id);
      const start = order.indexOf(id);
      const rotated = [...order.slice(start + 1), ...order.slice(0, start)];
      const next = rotated.find((other) => ["pending", "incomplete"].includes(recordStatus(spec, record(ws, other))));
      if (next) selectNucleus(ws, scene, next);
    }
  } else return;
  ev.preventDefault();
  commit(found, ws);
}

function onInput(ev) {
  const el = ev.target;
  const kind = el.getAttribute?.("data-ws-field");
  if (!kind) return;
  const found = hostFor(el);
  if (!found) return;
  const { ws } = found;
  if (kind === "brightness" || kind === "contrast") {
    ws[kind] = Number(el.value);
    const svg = found.root.querySelector(".ws-svg");
    if (svg) svg.style.filter = `brightness(${ws.brightness}%) contrast(${ws.contrast}%)`;
    found.host.save(ws);
    return;
  }
  if (found.ctx.locked) return;
  if (kind === "note" && ws.selected) updateRecord(ws, ws.selected, { note: el.value.slice(0, 240) });
  else if (kind === "count" && ws.selected) updateRecord(ws, ws.selected, { counts: { [el.getAttribute("data-field")]: el.value } });
  else if (kind === "text") ws.answers[el.getAttribute("data-key")] = el.value.slice(0, 1500);
  else return;
  found.host.save(ws);
  refreshAround(found);
}

/** Refresh derived views without replacing the field being typed in. */
function refreshAround(found) {
  const fresh = document.createElement("div");
  fresh.innerHTML = workstationHTML(found.host.context());
  for (const selector of [".ws-steps", ".ws-stage", ".ws-fields", ".ws-worksheet", ".ws-panel-head", ".ws-panel-status"]) {
    const now = found.root.querySelector(selector);
    const next = fresh.querySelector(selector);
    if (now && next) now.replaceWith(next);
  }
}

function onChange(ev) {
  const el = ev.target;
  const kind = el.getAttribute?.("data-ws-field");
  if (!kind || ["brightness", "contrast", "note", "count", "text"].includes(kind)) return;
  const found = hostFor(el);
  if (!found) return;
  const { ws } = found;
  if (kind === "overlay") ws.overlay = el.checked;
  else if (found.ctx.locked) return;
  else if (kind === "decision" && ws.selected) updateRecord(ws, ws.selected, { decision: el.value });
  else if (kind === "reason" && ws.selected) updateRecord(ws, ws.selected, { reason: el.value });
  else if (kind === "answer") ws.answers[el.getAttribute("data-key")] = el.value;
  else if (kind === "miss") {
    const set = new Set(ws.answers.misses || []);
    if (el.checked) set.add(el.value);
    else set.delete(el.value);
    ws.answers.misses = [...set];
  } else return;
  commit(found, ws, kind !== "answer" && kind !== "miss");
}

function scenePoint(svg, clientX, clientY) {
  const pt = svg.createSVGPoint();
  pt.x = clientX;
  pt.y = clientY;
  const ctm = svg.getScreenCTM();
  return ctm ? pt.matrixTransform(ctm.inverse()) : null;
}

function onPointerDown(ev) {
  const svg = ev.target.closest?.(".ws-stage .ws-svg");
  if (!svg || ev.button > 0) return;
  const vb = svg.viewBox.baseVal;
  drag = { svg, x: ev.clientX, y: ev.clientY, cx: vb.x + vb.width / 2, cy: vb.y + vb.height / 2, moved: false, target: ev.target };
}

function onPointerMove(ev) {
  if (!drag) return;
  const dx = ev.clientX - drag.x;
  const dy = ev.clientY - drag.y;
  if (!drag.moved && Math.hypot(dx, dy) < 5) return;
  drag.moved = true;
  const vb = drag.svg.viewBox.baseVal;
  const rect = drag.svg.getBoundingClientRect();
  const scale = Math.max(vb.width / rect.width, vb.height / rect.height);
  const w = vb.width;
  const h = vb.height;
  const cx = Math.max(w / 2, Math.min(FIELD_W - w / 2, drag.cx - dx * scale));
  const cy = Math.max(h / 2, Math.min(FIELD_H - h / 2, drag.cy - dy * scale));
  drag.svg.setAttribute("viewBox", `${(cx - w / 2).toFixed(1)} ${(cy - h / 2).toFixed(1)} ${w.toFixed(1)} ${h.toFixed(1)}`);
  drag.next = { cx, cy };
}

function onPointerUp(ev) {
  if (!drag) return;
  const current = drag;
  drag = null;
  const found = hostFor(current.svg);
  if (!found) return;
  const { ws, ctx } = found;
  if (current.moved) {
    if (current.next) Object.assign(ws, current.next);
    found.host.save(ws);
    return;
  }
  const group = current.target.closest?.("[data-ws-nucleus]");
  const id = group?.getAttribute("data-ws-nucleus");
  if (ws.markMode && id && id === ws.selected && !ctx.locked) {
    const point = scenePoint(current.svg, ev.clientX, ev.clientY);
    if (!point) return;
    const marks = [...(record(ws, id).marks || []), { type: ws.markMode, x: Math.round(point.x * 10) / 10, y: Math.round(point.y * 10) / 10 }].slice(0, 30);
    updateRecord(ws, id, { marks });
  } else if (id) {
    ws.selected = id;
    ws.markMode = "";
  } else return;
  commit(found, ws);
}

function onWheel(ev) {
  const svg = ev.target.closest?.(".ws-stage .ws-svg");
  if (!svg) return;
  const found = hostFor(svg);
  if (!found) return;
  ev.preventDefault();
  const { ws } = found;
  const point = scenePoint(svg, ev.clientX, ev.clientY);
  const before = Number(ws.zoom) || 1;
  const after = Math.max(1, Math.min(MAX_ZOOM, before * (ev.deltaY < 0 ? 1.2 : 1 / 1.2)));
  if (after === before) return;
  const vb = viewBox(ws);
  const anchorX = point ? point.x : vb.x + vb.w / 2;
  const anchorY = point ? point.y : vb.y + vb.h / 2;
  const ratio = before / after;
  ws.cx = anchorX + (vb.x + vb.w / 2 - anchorX) * ratio;
  ws.cy = anchorY + (vb.y + vb.h / 2 - anchorY) * ratio;
  ws.zoom = after;
  const next = viewBox(ws);
  Object.assign(ws, { cx: next.x + next.w / 2, cy: next.y + next.h / 2 });
  svg.setAttribute("viewBox", `${next.x.toFixed(1)} ${next.y.toFixed(1)} ${next.w.toFixed(1)} ${next.h.toFixed(1)}`);
  const label = found.root.querySelector(".ws-zoom-label");
  if (label) label.textContent = `${after.toFixed(1)}×`;
  found.host.save(ws);
}
