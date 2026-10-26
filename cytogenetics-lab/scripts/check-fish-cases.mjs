/**
 * Consistency audit of every FISH teaching case:
 * probes, authored nuclei, answer key, expected interpretation, Casework link, and report.
 * Run: node scripts/check-fish-cases.mjs [--table]
 */
import { readFileSync, readdirSync } from "node:fs";
import { patternOf, fieldAvailable } from "../js/fish-field.js";
import { buildScene, initWorkstation, interpretationKey, compareToKey, workstationReport, workstationHTML, countFields } from "../js/fish-workstation.js";

const read = (path) => JSON.parse(readFileSync(new URL(path, import.meta.url)));
const probes = read("../data/probes.json");
const probeList = Array.isArray(probes) ? probes : probes.probes || Object.values(probes);
const probeById = new Map(probeList.map((probe) => [probe.probe_id || probe.id, probe]));
const links = read("../data/disease-activities.json");
const linked = {};
for (const [disease, row] of Object.entries(links)) if (row?.fish) (linked[row.fish] ||= []).push(disease);

const PROBE_TYPES = {
  enumeration: ["centromeric", "locus-specific"],
  "break-apart": ["break-apart"],
  "dual-fusion": ["dual-fusion", "locus-specific"],
  deletion: ["locus-specific"],
};
const DETECTS = {
  enumeration: "chromosome enumeration",
  "break-apart": "rearrangement of a particular locus",
  "dual-fusion": "fusion between two defined loci",
  deletion: "loss of a specific locus",
};

function signalCounts(nucleus) {
  const counts = { red: 0, green: 0, fusion: 0, aqua: 0, gold: 0 };
  for (const signal of nucleus.expected_signals || []) counts[signal.type] = (counts[signal.type] || 0) + 1;
  return counts;
}

function insideNucleus(nucleus, signal) {
  const dx = (signal.x - nucleus.cx) / (nucleus.rx || 1);
  const dy = (signal.y - nucleus.cy) / (nucleus.ry || 1);
  return dx * dx + dy * dy <= 1.05;
}

/** A learner who matches the key exactly must receive full credit and an empty report key. */
function perfectRun(spec, scene, seed) {
  const ws = initWorkstation(seed);
  for (const nucleus of scene.nuclei) {
    ws.records[nucleus.nucleus_id] = nucleus.key.scorable
      ? { decision: "score", counts: Object.fromEntries(countFields(spec).map((field) => [field, String(nucleus.key.counts?.[field] ?? 0)])), marks: [] }
      : { decision: "exclude", reason: nucleus.key.reason, note: "Excluded per scoring rules.", marks: [] };
  }
  const key = interpretationKey(spec, scene);
  ws.answers = { detects: key.detects, demonstrated: key.demonstrated, partner: key.partner, misses: key.misses, conclusive: key.conclusive, scope: key.scope, conclusion: "x", limitations: "x" };
  return { ws, comparison: compareToKey(spec, scene, ws) };
}

const rows = [];
let failures = 0;
const files = readdirSync(new URL("../data/cases/", import.meta.url)).filter((file) => file.startsWith("fish-") && file.endsWith(".json")).sort();
for (const file of files) {
  const data = read(`../data/cases/${file}`);
  const spec = data.fish || {};
  if (spec.assay_type === "probe_localization") {
    rows.push({ id: data.case_id, assay: "localization", difficulty: data.difficulty, casework: "Learn only", patterns: {}, scene: "map placement only, no interphase scoring", cutoff: "n/a", issues: [], notes: [] });
    continue;
  }
  const id = data.case_id;
  const issues = [];
  const notes = [];
  const assay = spec.assay_type;
  if (!DETECTS[assay]) issues.push(`unknown assay_type "${assay}"`);

  for (const probeId of spec.probe_ids || []) {
    const probe = probeById.get(probeId);
    if (!probe) issues.push(`probe ${probeId} not in probes.json`);
    else if (PROBE_TYPES[assay] && !PROBE_TYPES[assay].includes(probe.probe_type || probe.type)) issues.push(`probe ${probeId} is ${probe.probe_type || probe.type}, unusual for ${assay}`);
  }

  const expectedDetects = spec.strategy_expected || spec.probe_type_expected?.detects || DETECTS[assay];
  if (expectedDetects !== DETECTS[assay]) issues.push(`detects key "${expectedDetects}" ≠ assay default "${DETECTS[assay]}"`);
  if (spec.probe_type_expected?.type && spec.probe_type_expected.type !== assay && !(assay === "enumeration" && spec.probe_type_expected.type === "centromeric") && !(assay === "deletion" && spec.probe_type_expected.type === "locus-specific")) {
    issues.push(`probe_type_expected.type "${spec.probe_type_expected.type}" vs assay "${assay}"`);
  }
  if (!(spec.interpretation_options || []).includes(spec.expected_interpretation)) issues.push(`expected_interpretation "${spec.expected_interpretation}" not among options`);

  const cutoff = spec.case_specific_cutoff || {};
  const fields = countFields(spec);
  const nuclei = spec.nuclei || [];
  const patterns = { normal: 0, abnormal: 0, other: 0, unscorable: 0 };
  for (const nucleus of nuclei) {
    const derived = signalCounts(nucleus);
    for (const field of fields) {
      if (field === "split") continue;
      if (nucleus.scorable && nucleus.expected_counts && Number(nucleus.expected_counts[field] ?? 0) !== derived[field]) {
        issues.push(`${nucleus.nucleus_id}: expected_counts.${field}=${nucleus.expected_counts[field]} but ${derived[field]} drawn`);
      }
    }
    if (nucleus.scorable && assay === "break-apart" && nucleus.expected_counts) {
      const split = Math.min(derived.red, derived.green);
      if (Number(nucleus.expected_counts.split ?? 0) !== split) issues.push(`${nucleus.nucleus_id}: split=${nucleus.expected_counts.split}, drawn separated pairs=${split}`);
    }
    const outside = (nucleus.expected_signals || []).filter((signal) => !insideNucleus(nucleus, signal));
    if (outside.length && !nucleus.overlap) issues.push(`${nucleus.nucleus_id}: ${outside.length} signal(s) outside the nucleus outline`);
    if (!nucleus.scorable) patterns.unscorable += 1;
    else patterns[patternOf(spec, nucleus.expected_counts)] += 1;
  }

  if (spec.specimen_type === "interphase") {
    if (!cutoff.normal_counts || !cutoff.abnormal_counts) issues.push("interphase case without normal_counts/abnormal_counts");
    else {
      for (const field of Object.keys({ ...cutoff.normal_counts, ...cutoff.abnormal_counts })) if (!fields.includes(field)) issues.push(`cutoff uses "${field}" but count_fields do not`);
      if (!patterns.abnormal) issues.push("no authored nucleus shows the abnormal pattern");
      if (!patterns.normal && assay !== "enumeration") notes.push("no authored normal nucleus");
    }
    if (assay === "dual-fusion" && cutoff.abnormal_counts && Number(cutoff.abnormal_counts.fusion) !== 2) notes.push(`dual-fusion abnormal pattern has ${cutoff.abnormal_counts.fusion} fusions (classic is 2)`);
    if (assay === "break-apart" && cutoff.normal_counts && Number(cutoff.normal_counts.fusion) !== 2) notes.push(`break-apart normal pattern has ${cutoff.normal_counts.fusion} fusions (classic is 2)`);
    if (cutoff.percent_cutoff != null && !cutoff.cutoff_source) issues.push("percent_cutoff without cutoff_source");
    if (cutoff.percent_cutoff != null && data.difficulty !== "advanced") issues.push("cutoffs are reserved for advanced cases");
    if (spec.field_composition && !spec.field_composition.basis) issues.push("field_composition without a stated basis");
    if (!spec.field_composition && data.difficulty !== "introductory") notes.push("no field_composition: authored nuclei are cycled");
  }

  let sceneText = "—";
  if (fieldAvailable(spec)) {
    for (const advanced of [false, true]) {
      const scene = buildScene(spec, 1234, { advanced });
      if (!scene) { issues.push("fieldAvailable but buildScene returned null"); continue; }
      if (JSON.stringify(scene.nuclei) !== JSON.stringify(buildScene(spec, 1234, { advanced }).nuclei)) issues.push("scene not deterministic");
      const key = interpretationKey(spec, scene);
      if (!advanced) sceneText = `${scene.nuclei.length} nuclei, ${key.keyScorable} scorable, ${key.keyAbnormalPercent}% abn`;
      if (cutoff.minimum_percent_scorable && (key.keyScorable / scene.nuclei.length) * 100 < cutoff.minimum_percent_scorable) notes.push(`${advanced ? "advanced" : "standard"} field below minimum scorable fraction`);
      const { ws, comparison } = perfectRun(spec, scene, 1234);
      if (comparison.agrees !== comparison.total) issues.push(`perfect run agrees ${comparison.agrees}/${comparison.total} (${advanced ? "advanced" : "standard"})`);
      const graded = comparison.questions;
      for (const [name, value] of Object.entries(graded)) {
        const ok = value && typeof value === "object" && "correct" in value ? value.correct === value.total : value !== false;
        if (!ok) issues.push(`perfect answers marked wrong on "${name}"`);
      }
      for (const [name, section] of Object.entries(comparison.sections)) if (section.earned !== section.possible) issues.push(`perfect run scores ${section.earned}/${section.possible} in ${name}`);
      if (!advanced) {
        const spots = (channel) => {
          const html = workstationHTML({ host: "audit", spec, probes: [], scene, ws: { ...ws, channel, field: 0, overlay: false } });
          return [...html.matchAll(/<circle cx="([\d.]+)" cy="([\d.]+)" r="[\d.]+" fill="(#ff4a3d|#39e36b)"/g)].map((m) => `${m[3]}@${m[1]},${m[2]}`);
        };
        const merged = new Set(spots("merge"));
        const single = [...spots("red"), ...spots("green")];
        if (!single.length || single.some((spot) => !merged.has(spot))) issues.push("a signal component moves when the channel changes");
      }
      const report = JSON.stringify(workstationReport(spec, scene, ws));
      if (/"key"|expected_counts|accept/.test(report)) issues.push("report contains answer-key fields");
    }
  } else if (spec.specimen_type === "interphase") issues.push("interphase case cannot run the microscope workstation");

  failures += issues.length;
  rows.push({ id, assay, difficulty: data.difficulty, casework: (linked[id] || []).join(", ") || "Learn only", patterns, scene: sceneText, cutoff: cutoff.percent_cutoff ?? "none", issues, notes });
}

for (const row of rows) {
  const status = row.issues.length ? "FAIL" : "ok  ";
  console.log(`${status} ${row.id.padEnd(26)} ${String(row.assay).padEnd(12)} ${String(row.difficulty).padEnd(13)} ${row.casework.padEnd(18)} ${row.scene}`);
  if (process.argv.includes("--table")) console.log(`       authored: ${JSON.stringify(row.patterns)} cutoff: ${row.cutoff}`);
  for (const issue of row.issues) console.log(`       ✗ ${issue}`);
  for (const note of row.notes) console.log(`       · ${note}`);
}
console.log(`\n${rows.length} FISH cases, ${failures} issue(s).`);
process.exit(failures ? 1 : 0);
