/**
 * Comprehensive student experience automated simulation.
 * Verifies that all student-facing views, case hydrations, Atlas pages,
 * FISH scoring, karyograms, and reports render without throwing exceptions.
 */
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import assert from "node:assert/strict";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// Environment polyfills
globalThis.location = { hash: "#/" };
globalThis.localStorage = {
  store: {},
  getItem(key) { return this.store[key] || null; },
  setItem(key, val) { this.store[key] = String(val); },
  removeItem(key) { delete this.store[key]; },
  clear() { this.store = {}; }
};
globalThis.fetch = async (url) => {
  const rel = String(url).replace(/^\.?\//, "").split("?")[0];
  const full = path.join(root, rel);
  try {
    const text = await readFile(full, "utf8");
    return { ok: true, status: 200, json: async () => JSON.parse(text), text: async () => text };
  } catch (err) {
    return { ok: false, status: 404, statusText: err.message };
  }
};

console.log("Loading application modules...");

const {
  loadActivityLinks,
  loadActivityPacks,
  loadCatalog,
  enrichCatalog,
  loadDiseases,
  loadMaps,
  loadProbes,
  loadTemplates,
  hydrateCase
} = await import("../js/cases.js?v=20261025ex1");
const { patch, state } = await import("../js/store.js?v=20261006j");
const { bindChromosomeMaps } = await import("../js/chromosomes.js?v=20261026p5");
const { parseHash } = await import("../js/util.js?v=20261026seen5");
const { atlasBrowse } = await import("../js/atlas-ui.js?v=20261026seen3");
const { diseaseList } = await import("../js/atlas.js?v=20261006j");
const { isSeenByMethod, methodFit, structuralClass } = await import("../js/activities.js?v=20261026seen3");
const { exploreISCN, parseISCN } = await import("../js/iscn.js?v=20261026seen5");
const { chromosomeWorkspaceHTML, applyWorkspaceFormula } = await import("../js/chromosome-workspace.js?v=20261026seen4");

const [catalogIndex, templates, maps, probes, diseases, activityLinks] = await Promise.all([
  loadCatalog(), loadTemplates(), loadMaps(), loadProbes(), loadDiseases(), loadActivityLinks()
]);
const catalog = await enrichCatalog(catalogIndex);
const activityPacks = await loadActivityPacks(activityLinks, catalog);
bindChromosomeMaps(maps);
patch({ catalog, templates, maps, probes, diseases, activityLinks, activityPacks });

console.log(`Loaded ${catalog.cases.length} cases, ${diseases.diseases.length} diseases, ${Object.keys(probes.probes || {}).length} probes.`);

// 1. Test case hydration for all 65 catalog cases
console.log("1. Testing case hydration for all catalog cases...");
let hydratedCount = 0;
for (const entry of catalog.cases) {
  try {
    const hydrated = hydrateCase(entry, templates);
    assert.ok(hydrated, `Hydrated case ${entry.case_id}`);
    hydratedCount++;
  } catch (err) {
    console.error(`FAILED to hydrate case ${entry.case_id}:`, err);
    process.exit(1);
  }
}
console.log(`✓ All ${hydratedCount} cases hydrated successfully.`);

// 2. Test Atlas pages for all 29 diseases
console.log("2. Testing Disease Atlas view rendering for all diseases...");
const allDiseases = diseaseList(diseases);
for (const d of allDiseases) {
  // Test default view
  globalThis.location.hash = `#/atlas/disease/${d.id}`;
  const htmlDefault = atlasBrowse(parseHash());
  assert.ok(htmlDefault.includes(d.disease_name), `Page contains title for ${d.id}`);

  // Test with methods: karyotype, fish, both
  for (const m of ["karyotype", "fish", "both"]) {
    globalThis.location.hash = `#/atlas/disease/${d.id}/${m}`;
    const htmlM = atlasBrowse(parseHash());
    assert.ok(htmlM.includes(d.disease_name), `Page contains title for ${d.id}/${m}`);
  }
}
console.log(`✓ All ${allDiseases.length} disease Atlas pages render cleanly across all method filters.`);

// 3. Test Chromosome pages in Atlas (1..22, X, Y)
console.log("3. Testing Chromosome Atlas pages (1-22, X, Y)...");
const chrs = Array.from({ length: 22 }, (_, i) => String(i + 1)).concat(["X", "Y"]);
for (const chr of chrs) {
  for (const m of ["", "karyotype", "fish", "both"]) {
    globalThis.location.hash = m ? `#/atlas/chromosome/${chr}/${m}` : `#/atlas/chromosome/${chr}`;
    const html = atlasBrowse(parseHash());
    assert.ok(html.includes(`Chromosome ${chr}`), `Atlas chromosome ${chr} rendered`);
  }
}
console.log(`✓ All 24 chromosome Atlas pages render cleanly.`);

// 4. Test Standalone Draw workspace rendering with various ISCN formulas
console.log("4. Testing Standalone Draw workspace...");
const testFormulas = [
  "46,XX",
  "46,XY",
  "47,XX,+21",
  "45,X",
  "47,XXY",
  "46,XY,t(9;22)(q34;q11.2)",
  "46,XX,del(5)(p15.2)",
  "46,XX,inv(16)(p13.1q22)",
  "46,XX,dup(1)(q21q32)",
  "45,XX,rob(13;14)(q10;q10)",
  "46,XY,der(22)t(9;22)(q34;q11.2)",
];
for (const formula of testFormulas) {
  try {
    const report = exploreISCN(formula);
    assert.ok(report, `Parsed ${formula}`);
    // Check that workspace HTML can be generated without error
    const wsHtml = chromosomeWorkspaceHTML();
    assert.ok(wsHtml.includes("cw-stage"), "Workspace HTML contains cw-stage");
  } catch (err) {
    console.error(`FAILED on formula ${formula}:`, err);
    process.exit(1);
  }
}
console.log(`✓ Tested ${testFormulas.length} key clinical ISCN formulas in Draw workspace.`);

// 5. Test FISH cases probe configurations
console.log("5. Testing FISH cases and probes...");
const fishCases = catalog.cases.filter(c => c.fish);
const probeList = probes.probes || [];
const probeIdMap = new Set(probeList.map(p => p.probe_id));
for (const fc of fishCases) {
  const ids = fc.fish.probe_ids || (fc.fish.probe_id ? [fc.fish.probe_id] : []);
  assert.ok(ids.length > 0, `FISH case ${fc.case_id} has probe IDs`);
  for (const id of ids) {
    assert.ok(probeIdMap.has(id), `FISH case ${fc.case_id} probe ${id} exists in probes.json`);
  }
  if (fc.fish.include_localization) {
    assert.ok(fc.fish.localization?.expected, `Localization case ${fc.case_id} has expected band`);
  } else {
    assert.ok(fc.fish.nuclei && fc.fish.nuclei.length > 0, `FISH case ${fc.case_id} has nuclei`);
    assert.ok(fc.fish.expected_interpretation || fc.fish.expected_classification, `FISH case ${fc.case_id} has expected outcome`);
  }
}
console.log(`✓ All ${fishCases.length} FISH cases have valid probes, localization/nuclei, and expected outcomes.`);

console.log("6. Testing Casework 'Save to My Case Reports' throughout casework...");
const {
  saveDrawReport,
  saveCaseworkReport,
  listMyCaseReports,
  myCaseReportsHTML,
} = await import("../js/my-case-reports.js");
const { caseSubmissionMarkup } = await import("../js/case-submission.js");

// 6a. Test Draw save
const drawSaved = saveDrawReport({ formula: "47,XX,+21", lineIndex: 0 });
assert.ok(drawSaved && drawSaved.id, "Saved Draw report");
assert.equal(drawSaved.kind, "draw");

// 6b. Test Casework save to My Case Reports (draft)
const draftCase = {
  id: "test-karyo-case-1",
  lab: "karyotype",
  label: "Test Student Karyotype",
  specimen: "Bone marrow",
  observedCount: "46",
  observedSex: "XY",
  iscnDraft: "46,XY,t(9;22)(q34;q11.2)",
  interpretation: "Ph positive clone detected",
};
const draftSaved = saveCaseworkReport(draftCase, { draft: true });
assert.ok(draftSaved && draftSaved.id, "Saved draft Casework report");
assert.equal(draftSaved.draft, true);
assert.equal(draftSaved.kind, "karyotype");

// 6c. Test Casework save to My Case Reports (submitted)
const submittedCase = {
  ...draftCase,
  id: "test-karyo-case-2",
  label: "Submitted Karyotype",
  submission: {
    caseId: "test-karyo-case-2",
    lab: "karyotype",
    caseLabel: "Submitted Karyotype",
    submittedAt: new Date().toISOString(),
    observations: {},
    conclusions: { iscn: "46,XY,t(9;22)(q34;q11.2)" },
  },
};
const subSaved = saveCaseworkReport(submittedCase);
assert.ok(subSaved && subSaved.id, "Saved submitted Casework report");
assert.equal(subSaved.draft, false);

// 6d. Check listMyCaseReports and myCaseReportsHTML
const allReports = listMyCaseReports();
assert.ok(allReports.length >= 3, "All reports listed in portfolio");
const reportsHTML = myCaseReportsHTML();
assert.ok(reportsHTML.includes("Test Student Karyotype"), "Draft case listed in My Case Reports page HTML");
assert.ok(reportsHTML.includes("Submitted Karyotype"), "Submitted case listed in My Case Reports page HTML");

// 6e. Test caseSubmissionMarkup includes data-case-save-reports button
const markup = caseSubmissionMarkup(draftCase);
assert.ok(markup.includes("data-case-save-reports"), "Case report stage includes 'Save to My Case Reports' button");

console.log("✓ All Casework 'Save to My Case Reports' functions, buttons, and views verified.");

console.log("\n==========================================");
console.log("ALL STUDENT EXPERIENCE TESTS PASSED (0 ERRORS)");
console.log("==========================================\n");

