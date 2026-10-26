/**
 * Casework report regression: six case types, each with deliberate student mistakes.
 * Checks that the submitted report carries the student's own entries and never the curated answer.
 * Run: node scripts/check-casework-reports.mjs
 */
import { readFileSync } from "node:fs";
import { canonicalCase, diseaseById } from "../js/atlas.js";
import { markBands, markLocation, resolveBand } from "../js/case-ideogram.js";
import { buildSubmission, caseReportHTML, caseStages, submissionReadiness } from "../js/case-submission.js";
import { buildScene, countFields, describeCounts, initWorkstation, interpretationKey, workstationReport } from "../js/fish-workstation.js";

const read = (path) => JSON.parse(readFileSync(new URL(path, import.meta.url)));
const diseases = read("../data/diseases.json");
const maps = read("../data/chromosome-maps.json");
const catalog = read("../data/catalog.json");
const pack = (id) => {
  const entry = catalog.cases.find((item) => item.case_id === id);
  return { ...entry, ...read(`../${entry.path}`) };
};

let failures = 0;
function check(label, condition, detail = "") {
  console.log(`${condition ? "PASS" : "FAIL"}  ${label}${!condition && detail ? ` — ${detail}` : ""}`);
  if (!condition) failures += 1;
}

const text = (html) => html.replace(/<style[\s\S]*?<\/style>/g, "").replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, " ");

/** A record shaped like the one Casework saves for a blinded or independent teaching case. */
function teachingRecord(diseaseId, lab, mode) {
  const disease = diseaseById(diseases, diseaseId);
  const item = canonicalCase(disease);
  const iscn = item.representative_teaching_karyotype?.iscn || "";
  const answerNotes = [item.visual_change, item.mechanism, item.student_should_notice].filter(Boolean).join("\n\n");
  return {
    disease,
    item,
    record: {
      id: `case-test-${diseaseId}-${lab}`,
      lab,
      label: mode === "unknown" ? "Case 01 · Teaching case" : `Independent · ${disease.disease_name}`,
      specimen: lab === "fish" ? "Demonstration interphase field" : "Metaphase (generated teaching specimen)",
      history: "Referral context.\n\nInstructions.",
      finding: "",
      images: [],
      source: {
        kind: "curated-teaching-template",
        mode,
        diseaseId,
        diseaseName: disease.disease_name,
        iscn: "",
        revealed: false,
        answerFinding: [iscn, item.final_interpretation].filter(Boolean).join("\n"),
        answerTitle: disease.disease_name,
        answerNotes,
      },
    },
  };
}

/** Curated answer text that must never appear in a student report. */
function answerLeaks(report, record, { allowName = false } = {}) {
  const leaks = [];
  const source = record.source;
  for (const line of String(source.answerFinding).split("\n").map((value) => value.trim()).filter((value) => value.length > 6)) {
    if (report.includes(line)) leaks.push(`answer finding "${line}"`);
  }
  for (const note of String(source.answerNotes).split("\n\n").map((value) => value.trim()).filter((value) => value.length > 25)) {
    if (report.includes(note.slice(0, 60))) leaks.push(`teaching note "${note.slice(0, 40)}…"`);
  }
  if (!allowName && report.toLowerCase().includes(source.answerTitle.toLowerCase())) leaks.push(`disease name "${source.answerTitle}"`);
  return leaks;
}

function submit(record, extra = {}) {
  const meta = { studentName: "Test Student", studentId: "S-001", limitations: "Single demonstration metaphase; band resolution about 400.", ...extra };
  record.reportMeta = meta;
  const snapshot = buildSubmission(record, meta);
  const html = caseReportHTML(snapshot, { maps, crops: extra.crops || [] });
  return { snapshot, html, report: text(html) };
}

function stage(record, id) {
  return caseStages(record).find((item) => item.id === id)?.state;
}

/* 1. Numerical abnormality: trisomy 21, blinded. Mistake: wrong sex complement. */
{
  const { record } = teachingRecord("down-syndrome", "karyotype", "unknown");
  Object.assign(record, {
    observedCount: "47",
    observedSex: "XY",
    observation: "Three copies of a small acrocentric G-group chromosome.",
    iscnDraft: "47,XY,+21",
    interpretation: "Extra chromosome 21 in every cell examined.",
    possibleAssociation: "Down syndrome (student suggestion)",
    studentMarks: [{ id: "m1", chromosome: "21", effect: "Gain of a whole chromosome", whole: true, location: "whole chromosome 21", note: "Third copy" }],
  });
  const { report, snapshot, html } = submit(record);
  console.log("\n# Numerical abnormality (blinded)");
  check("report keeps the student's count", report.includes("Chromosome count 47"));
  check("report keeps the student's mistaken sex complement", report.includes("Sex chromosome complement XY"));
  check("report keeps the student's ISCN as written", report.includes("47,XY,+21"));
  check("no structural annotation is requested", !submissionReadiness(record).some((gap) => /ideogram/i.test(gap)));
  check("ideogram stage reads as optional, not unfinished, without marks", stage({ ...record, studentMarks: [] }, "ideogram") === "optional");
  check("ideogram stage reads as recorded once the whole chromosome is marked", stage(record, "ideogram") === "done");
  const whole21 = markBands(maps, record.studentMarks[0]).map((band) => band.id);
  const all21 = maps.chromosomes["21"].segments.filter((segment) => segment.role !== "centromere").map((segment) => segment.id);
  check("whole-chromosome mark covers every band of chromosome 21", all21.length > 0 && all21.every((id) => whole21.includes(id)));
  check("whole-chromosome mark is listed in the report", report.includes("whole chromosome 21") && report.includes("Third copy"));
  check("report draws the genome-wide ideogram", html.includes('class="genome-ideogram"'));
  check("ISCN-derived row is labeled as read from the student's ISCN", report.includes("Read from your ISCN"));
  const leaks = answerLeaks(report.replace("Down syndrome (student suggestion)", ""), record);
  check("no curated answer text in the report", !leaks.length, leaks.join("; "));
  check("submission has no answer fields", !/answerFinding|answerNotes|answerTitle/.test(JSON.stringify(snapshot)));
}

/* 2. Deletion: cri-du-chat, independent. Mistakes: breakpoint p14 instead of the curated band; one mark on 5p15.3. */
{
  const { record } = teachingRecord("cri-du-chat", "karyotype", "explore");
  Object.assign(record, {
    observedCount: "46",
    observedSex: "XX",
    observation: "One chromosome 5 has a shorter p arm than its homolog.",
    iscnDraft: "46,XX,del(5)(p14)",
    interpretation: "Terminal loss of 5p distal to p14.",
    chromosomeReads: [{ chromosome: "5", seen: "Shortened p arm on homolog B", note: "Compared at two condensation levels" }],
    sortedChromosomes: [
      { imageIndex: 0, x: 10, y: 10, width: 5, height: 8, chromosome: "5", homolog: "A" },
      { imageIndex: 0, x: 20, y: 10, width: 5, height: 6, chromosome: "5", homolog: "B" },
    ],
    studentMarks: [{ id: "m1", chromosome: "5", effect: "Deletion", from: "p14", to: "pter", location: "", note: "Pale distal band missing on B" }],
  });
  const crops = [{ url: "data:image/png;base64,AAAA", chromosome: "5", homolog: "A" }, { url: "data:image/png;base64,BBBB", chromosome: "5", homolog: "B" }];
  const { report, html } = submit(record, { crops });
  console.log("\n# Deletion (independent)");
  check("homolog comparison shows both chromosome 5 crops", html.includes('alt="Chromosome 5 A"') && html.includes('alt="Chromosome 5 B"'));
  check("chromosome log is in the report", report.includes("Shortened p arm on homolog B"));
  const range = markBands(maps, record.studentMarks[0]).map((band) => band.id);
  check("deletion range p14→pter covers 5p15.33 and 5p14 but not 5p13", range.includes("5p15.33") && range.some((id) => id.startsWith("5p14")) && !range.some((id) => id.startsWith("5p13")), range.join(","));
  check("band entry rejects a band that does not exist", Boolean(resolveBand(maps, "5", "p99").error));
  check("band entry accepts a prefixed band", !resolveBand(maps, "5", "5p15.2").error);
  check("student's deletion range and note are in the abnormality table", report.includes(markLocation(record.studentMarks[0])) && report.includes("Pale distal band missing on B"), markLocation(record.studentMarks[0]));
  check("student's mistaken breakpoint is kept as written", report.includes("46,XX,del(5)(p14)"));
  check("ideogram figure for chromosome 5 is drawn", html.includes("Chromosome 5</figcaption>"));
  check("ideogram stage reads as recorded", stage(record, "ideogram") === "done");
  const leaks = answerLeaks(report, record, { allowName: true });
  check("no curated ISCN or teaching notes in the report", !leaks.length, leaks.join("; "));
}

/* 3. Reciprocal translocation: CML, blinded. Mistake: 22q12 mark instead of the q11.2 breakpoint. */
{
  const { record } = teachingRecord("cml", "karyotype", "unknown");
  Object.assign(record, {
    observedCount: "46",
    observedSex: "XY",
    observation: "Small chromosome 22 and a longer chromosome 9 long arm.",
    iscnDraft: "46,XY,t(9;22)(q34;q12)",
    interpretation: "Reciprocal exchange between 9q and 22q.",
    studentMarks: [
      { id: "m1", chromosome: "9", location: "9q34.1", effect: "Translocation", note: "Distal 9q exchanged" },
      { id: "m2", chromosome: "22", location: "22q12.1", effect: "Translocation", note: "Breakpoint placed in 22q12" },
    ],
  });
  const { report, html } = submit(record);
  console.log("\n# Reciprocal translocation (blinded)");
  check("both affected chromosomes are drawn", html.includes("Chromosome 9</figcaption>") && html.includes("Chromosome 22</figcaption>"));
  check("both student marks are listed", report.includes("9q34.1") && report.includes("22q12.1"));
  check("both breakpoints from the student's ISCN are listed", /Breakpoint/.test(report) && report.includes("q34") && report.includes("q12"));
  check("student's mistaken breakpoint is kept as written", report.includes("46,XY,t(9;22)(q34;q12)"));
  const leaks = answerLeaks(report, record);
  check("no curated answer text in the report", !leaks.length, leaks.join("; "));
}

/* FISH: drive the real workstation with student records, then report. */
function fishCase(diseaseId, packId, plan) {
  const { record } = teachingRecord(diseaseId, "fish", "unknown");
  const spec = pack(packId).fish;
  const seed = 4242;
  const scene = buildScene(spec, seed, { advanced: true });
  const ws = initWorkstation(seed);
  const fields = countFields(spec);
  const scorable = scene.nuclei.filter((nucleus) => nucleus.key?.scorable);
  const unscorable = scene.nuclei.filter((nucleus) => !nucleus.key?.scorable);
  const mistake = plan({ ws, spec, scene, fields, scorable, unscorable }) || null;
  record.fishWorkstation = ws;
  const fishWorkstation = { assay: spec.assay_type, assayRef: packId, ...workstationReport(spec, scene, ws) };
  const meta = { studentName: "Test Student", studentId: "S-001", limitations: ws.answers.limitations || "" };
  record.reportMeta = meta;
  const snapshot = buildSubmission(record, { ...meta, fishWorkstation });
  const html = caseReportHTML(snapshot, { maps });
  const keyed = mistake ? keyCounts(mistake.nucleus, fields) : null;
  return { record, spec, scene, ws, fishWorkstation, mistake, keyed, report: text(html), key: interpretationKey(spec, scene) };
}

function score(ws, nucleus, counts) {
  ws.records[nucleus.nucleus_id] = { decision: "score", reason: "", note: "", counts, marks: [] };
}

function exclude(ws, nucleus, reason, note) {
  ws.records[nucleus.nucleus_id] = { decision: "exclude", reason, note, counts: {}, marks: [] };
}

function keyCounts(nucleus, fields) {
  return Object.fromEntries(fields.map((field) => [field, Number(nucleus.expected_counts?.[field] ?? 0)]));
}

/* 4. FISH enumeration: CEP21. Mistake: one nucleus counted with one fewer green signal. One left open. */
{
  console.log("\n# FISH enumeration (blinded)");
  const run = fishCase("down-syndrome", "fish-down-cep21", ({ ws, fields, scorable, unscorable }) => {
    let mistake = null;
    scorable.slice(0, 5).forEach((nucleus, index) => {
      const counts = keyCounts(nucleus, fields);
      if (index === 0) { counts.green += 1; mistake = { nucleus, counts }; }
      score(ws, nucleus, counts);
    });
    if (unscorable[0]) exclude(ws, unscorable[0], "overlapping_nuclei", "Two nuclei overlap at the lower edge");
    ws.answers = { misses: ["balanced"], detects: "Copy number of chromosome 21 centromere", conclusion: "Most scored nuclei show three green signals.", limitations: "Only five nuclei scored." };
    return mistake;
  });
  const first = run.fishWorkstation.nuclei.find((row) => row.status === "Scored");
  check("per-nucleus rows use the student's counts", run.report.includes(first.signals));
  const wrong = run.fishWorkstation.nuclei.find((row) => row.nucleus === run.mistake.nucleus.number);
  check("mistaken count is kept, not replaced by the key", wrong?.signals === describeCounts(run.spec, run.mistake.counts) && wrong.signals !== describeCounts(run.spec, run.keyed), `${wrong?.signals} vs key ${describeCounts(run.spec, run.keyed)}`);
  check("summary counts match the student's records", run.fishWorkstation.summary.scored === 5 && run.report.includes("Scored (completed, scorable) 5"));
  check("unfinished nuclei are reported as still open", run.fishWorkstation.summary.open > 0 && run.report.includes(`Still open at export ${run.fishWorkstation.summary.open}`));
  check("student conclusion is in the report", run.report.includes("Most scored nuclei show three green signals."));
  check("legacy empty nucleus table is not duplicated", !run.report.includes("Nucleus records 0"));
  check("curated interpretation is not in the report", !run.key.demonstrated || !run.report.includes(String(run.key.demonstrated).replace(/_/g, " ")));
  const leaks = answerLeaks(run.report, run.record);
  check("no curated answer text in the report", !leaks.length, leaks.join("; "));
}

/* 5. FISH break-apart: KMT2A. Mistake: one split nucleus recorded as fused. Two exclusions with reasons. */
{
  console.log("\n# FISH break-apart (blinded)");
  const run = fishCase("kmt2a", "fish-kmt2a-ba", ({ ws, fields, scorable, unscorable }) => {
    let mistake = null;
    scorable.slice(0, 6).forEach((nucleus, index) => {
      const counts = keyCounts(nucleus, fields);
      if (!mistake) { counts.fusion += 1; mistake = { nucleus, counts }; }
      score(ws, nucleus, counts);
    });
    unscorable.slice(0, 2).forEach((nucleus, index) => exclude(ws, nucleus, index ? "damaged_nucleus" : "equivocal_spacing", index ? "Ragged outline, signal outside" : "Red and green neither touching nor split"));
    ws.answers = { misses: [], partner: "no_partner", detects: "Disruption of the KMT2A locus", conclusion: "Split signals in a subset of nuclei.", limitations: "The partner gene is not identified." };
    return mistake;
  });
  check("split counts appear per nucleus", run.fishWorkstation.nuclei.filter((row) => row.status === "Scored").every((row) => /split/i.test(row.signals)));
  const wrongBa = run.fishWorkstation.nuclei.find((row) => row.nucleus === run.mistake.nucleus.number);
  check("mistaken break-apart count is kept", wrongBa?.signals === describeCounts(run.spec, run.mistake.counts) && wrongBa.signals !== describeCounts(run.spec, run.keyed));
  check("exclusions and reasons are reported", run.report.includes("Equivocal signal spacing") && run.report.includes("Damaged or poorly defined nucleus"));
  check("student's partner answer is kept", run.report.includes("It shows whether the targeted locus is disrupted"));
  check("student interpretation and limitation are kept", run.report.includes("Split signals in a subset of nuclei.") && run.report.includes("The partner gene is not identified."));
  const leaks = answerLeaks(run.report, run.record);
  check("no curated answer text in the report", !leaks.length, leaks.join("; "));
}

/* 6. FISH dual-fusion: BCR::ABL1. Mistake: one fusion nucleus recorded with a single fusion. Assay limitations selected. */
{
  console.log("\n# FISH dual-fusion (blinded)");
  const run = fishCase("cml", "fish-dualfusion-bcrabl", ({ ws, fields, scorable }) => {
    let mistake = null;
    scorable.slice(0, 6).forEach((nucleus) => {
      const counts = keyCounts(nucleus, fields);
      if (!mistake && counts.fusion > 0) { counts.fusion -= 1; mistake = { nucleus, counts }; }
      score(ws, nucleus, counts);
    });
    ws.answers = { misses: ["elsewhere"], partner: "defined_pair", detects: "Fusion of the two targeted loci", conclusion: "Two fusion signals in most scored nuclei.", limitations: "Cannot detect rearrangements outside the targeted loci." };
    return mistake;
  });
  const wrongDf = run.mistake && run.fishWorkstation.nuclei.find((row) => row.nucleus === run.mistake.nucleus.number);
  check("mistaken fusion count is kept", Boolean(wrongDf) && wrongDf.signals === describeCounts(run.spec, run.mistake.counts) && wrongDf.signals !== describeCounts(run.spec, run.keyed));
  check("fusion counts appear per nucleus", run.fishWorkstation.nuclei.filter((row) => row.status === "Scored").every((row) => /fusion/i.test(row.signals)));
  check("selected assay limitation is listed", run.report.includes("Abnormalities of chromosomes or loci that these probes do not target"));
  check("student's written limitation is kept", run.report.includes("Cannot detect rearrangements outside the targeted loci."));
  check("percentages are the student's tallies", run.report.includes("Percentages are the student's tallies"));
  const leaks = answerLeaks(run.report, run.record);
  check("no curated answer text in the report", !leaks.length, leaks.join("; "));
}

/* Control: the leak detector must catch an answer that is present. */
{
  console.log("\n# Leak detector control");
  const { record } = teachingRecord("cri-du-chat", "karyotype", "unknown");
  record.iscnDraft = record.source.answerFinding.split("\n")[0];
  record.interpretation = record.source.answerNotes;
  const { report } = submit(record);
  check("detector flags a pasted curated answer", answerLeaks(report, record).length >= 2);
}

console.log(failures ? `\n${failures} check(s) failed.` : "\nAll casework report checks passed.");
process.exit(failures ? 1 : 0);
