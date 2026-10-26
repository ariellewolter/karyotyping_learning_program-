/**
 * Student reference library. Reads the reference module through the lab server.
 * It does not create cases or call the grading engine.
 */
import { loadDiseases, loadMaps, loadTemplates } from "./cases.js?v=20261015a";
import { analyzeCohort, cohortGroups, parseCohortText } from "./cohort-analysis.js";
import { bindCohort, cohortHTML } from "./cohort-view.js";
import { bindChromosomeMaps, chromosomeSetFromFormula, expandChromosomeSet, renderChromosome } from "./chromosomes.js?v=20261026p5";
import { structureStatus, validateStructure } from "./structure-validation.js?v=20261025sv1";
import { analyzeFormula } from "./karyotype-analysis.js";
import { analysisHTML, bindAnalysis } from "./karyotype-analysis-view.js";

let drawingReady = null;

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[char]));
}

async function referenceGet(path) {
  const response = await fetch(path, { cache: "no-store" });
  if (!response.ok) return { available: false, reason: "The reference module did not respond." };
  return response.json();
}

const RECORD_CLASS_LABELS = {
  verified: "Verified source record",
  educational: "Educational example",
  "teaching-catalog": "Teaching-catalog record",
};

/** Same search the Reference library uses. Never throws; an unavailable module is reported. */
export async function referenceSearch(type, query) {
  try {
    return await referenceGet(`/api/reference/search?type=${encodeURIComponent(type)}&q=${encodeURIComponent(query)}`);
  } catch {
    return { available: false, reason: "The reference module is unavailable on this server." };
  }
}

/**
 * Compact reference results for Casework. Each row keeps its source and record class.
 * With hideFormulas, stored ISCN strings are omitted so a disease search does not show the answer.
 */
export function referenceMatchesHTML(payload, { hideFormulas = false, limit = 6 } = {}) {
  if (!payload?.available) return `<p class="muted">${escapeHtml(payload?.reason || "The reference module is unavailable. The teaching catalog above is unaffected.")}</p>`;
  const rows = (payload.results || []).slice(0, limit);
  if (!rows.length) return `<p class="muted">${escapeHtml(payload.note || "No reference record matched.")}</p>`;
  const items = rows.map((row) => {
    const disease = row.disease || (row.preferred_name ? row : null);
    const name = disease?.preferred_name || row.abnormality_type || row.symbol || "Record";
    const id = disease?.disease_id || "";
    const formula = !hideFormulas && row.original ? ` <code>${escapeHtml(row.original)}</code>` : "";
    const bands = row.bands ? ` · ${escapeHtml(row.bands)}` : "";
    const linked = (row.diseases || []).slice(0, 3).map((item) => `${escapeHtml(item.preferred_name)} (${escapeHtml(RECORD_CLASS_LABELS[item.association_class] || item.association_class || "unclassified")})`).join("; ");
    const recordClass = RECORD_CLASS_LABELS[row.record_class || disease?.record_class] || row.record_class || disease?.record_class || "Unclassified";
    const source = row.source || disease?.source || "Source not recorded";
    const link = id ? `<a href="${diseaseHref(id)}">${escapeHtml(name)}</a>` : escapeHtml(name);
    const provenance = source.toLowerCase() === recordClass.toLowerCase() ? recordClass : `${recordClass} · ${source}`;
    return `<li>${link}${formula}${bands}<br><span class="muted">${escapeHtml(provenance)} · ${escapeHtml(row.match_class || payload.match || "match")}</span>${linked ? `<br><span class="muted">Linked: ${linked}</span>` : ""}</li>`;
  }).join("");
  const more = (payload.results || []).length > limit ? `<p class="muted">${payload.results.length - limit} more in the Reference library.</p>` : "";
  return `<ul class="lookup-reference-list">${items}</ul>${more}<p class="muted">${escapeHtml(payload.disclaimer || "A reference record is not a diagnosis.")}</p>`;
}

function validationLabels(validation) {
  if (!validation) return "";
  const syntax = { validated: "Syntax validated", partial: "Syntax partial", none: "Syntax not checked" }[validation.syntax] || validation.syntax;
  const structure = { validated: "Structure validated", not_checked: "Structure not checked", unavailable: "Structure unavailable" }[validation.structure] || validation.structure;
  const association = {
    verified: "Association verified",
    "teaching-catalog": "Teaching-catalog association",
    educational: "Educational association",
    structural: "Structural overlap only",
    none: "No disease association",
  }[validation.association] || validation.association;
  return `<p class="validation-levels"><span class="library-cap">${escapeHtml(syntax)}</span><span class="library-cap">${escapeHtml(structure)}</span><span class="library-cap">${escapeHtml(association)}</span></p>
    <ul class="validation-notes">${Object.values(validation.notes || {}).map((note) => `<li>${escapeHtml(note)}</li>`).join("")}</ul>`;
}

function capabilityLabels(capabilities) {
  if (!capabilities) return "";
  const labels = [];
  if (capabilities.reference) labels.push("<span class=\"library-cap\">Reference only</span>");
  if (capabilities.iscn_interpretation) labels.push("<span class=\"library-cap\">ISCN interpretation available</span>");
  if (capabilities.chromosome_visualization) labels.push("<span class=\"library-cap\">Chromosome visualization available</span>");
  if (capabilities.fish) labels.push("<span class=\"library-cap\">FISH interpretation available</span>");
  if (capabilities.teaching_activity && capabilities.teaching_href) {
    labels.push(`<a class="library-cap teaching" href="${escapeHtml(capabilities.teaching_href)}">Complete teaching activity available</a>`);
  }
  return labels.join(" ");
}

function fishBlock(probes) {
  if (!probes?.length) return "<p>No FISH assay is stored for this record.</p>";
  return probes.map((probe) => `<article class="library-probe">
    <h4>${escapeHtml(probe.probe_name)}</h4>
    <p>${escapeHtml(probe.record_class)} · ${escapeHtml(probe.strategy)}</p>
    <p>Targets: ${(probe.targets || []).map((target) => `${escapeHtml(target.gene || target.locus)} ${escapeHtml(target.fluorophore || "")} ${escapeHtml(target.locus || "")}`).join("; ") || "Not available"}</p>
    <p>Normal pattern: ${escapeHtml(probe.normal_pattern || "Not available")}</p>
    <p>Abnormal pattern: ${escapeHtml((probe.abnormal_patterns || []).join(", ") || "Not available")}</p>
    <p>${escapeHtml(probe.limitation || "")}</p>
  </article>`).join("");
}

function associationBlock(report) {
  const exact = report.associations?.exact || [];
  const structural = report.associations?.structural || [];
  const exactHtml = exact.length
    ? `<ul>${exact.map((row) => `<li>Exact ${escapeHtml(row.record_class)} match: ${escapeHtml(row.disease?.preferred_name || "Unnamed record")} (${escapeHtml(row.original)})</li>`).join("")}</ul>`
    : "<p>No exact stored disease record.</p>";
  const structuralHtml = structural.length
    ? `<ul>${structural.map((row) => `<li>Structural ${escapeHtml(row.record_class)} overlap at ${escapeHtml(row.bands)}: ${(row.diseases || []).map((disease) => escapeHtml(disease.preferred_name)).join(", ") || "No disease name stored"}</li>`).join("")}</ul>`
    : "";
  const note = report.associations?.note ? `<p>${escapeHtml(report.associations.note)}</p>` : "";
  return `<h3>Stored associations</h3>${exactHtml}${structuralHtml}${note}<p>${escapeHtml(report.disclaimer || "")}</p>`;
}

function ensureDrawing() {
  if (!drawingReady) {
    drawingReady = Promise.all([loadTemplates(), loadMaps()]).then(([templates, maps]) => {
      bindChromosomeMaps(maps);
      return { templates, maps };
    });
  }
  return drawingReady;
}

async function schematicFor(formula, scope) {
  const { templates } = await ensureDrawing();
  const set = chromosomeSetFromFormula(formula);
  if (!set) return "<p>Chromosome visualization is not available for this formula.</p>";
  const chromosomes = expandChromosomeSet({ chromosome_set: set }, templates);
  const pictures = chromosomes.map((chromosome) => `<figure>${renderChromosome(chromosome, { scale: 0.42 })}<figcaption>${escapeHtml(chromosome.identity)}</figcaption></figure>`).join("");
  const scopeNote = scope === "first cell line" ? " The picture uses the first cell line." : "";
  return `<div class="library-schematic"><p>Schematic karyogram from the laboratory band map.${scopeNote} This is not a microscope image.</p><div class="library-karyogram">${pictures}</div></div>`;
}

async function interpretationBlock(report) {
  if (!report || report.available === false) {
    return `<p>${escapeHtml(report?.reason || "Interpretation is unavailable.")}</p>`;
  }
  const events = (report.lines || []).flatMap((line) => line.events || []);
  const eventHtml = events.length
    ? `<ul>${events.map((item) => `<li><code>${escapeHtml(item.token)}</code> ${escapeHtml(item.kind)} ${item.supported ? "parsed" : "not interpreted"}. ${escapeHtml(item.geometry?.note || item.reason || "")}</li>`).join("")}</ul>`
    : "<p>No abnormality token was written.</p>";
  const structural = await structureChecks(events);
  const validation = report.validation && structural.status !== "not_checked" && report.validation.structure === "not_checked"
    ? { ...report.validation, structure: structural.status, notes: { ...report.validation.notes, structure: structural.note } }
    : report.validation;
  const picture = report.visualization
    ? `${await schematicFor(report.original, report.visualization_scope)}${validation?.structure === "validated" ? "" : "<p>This drawing is not a structure-validated reconstruction.</p>"}`
    : "<p>Chromosome visualization is not available for this string.</p>";
  const fusions = (report.fusions || []).map((item) => `<li>${escapeHtml(item.record_class)} ${escapeHtml(item.symbol)}</li>`).join("");
  return `<section class="library-interpretation">
    <h3>ISCN interpretation</h3>
    ${validationLabels(validation)}
    <p>Status: ${escapeHtml(report.status)}. ${escapeHtml(report.reason || "")}</p>
    ${eventHtml}
    ${associationBlock(report)}
    <h3>Gene fusions</h3>
    ${fusions ? `<ul>${fusions}</ul>` : "<p>No stored fusion matched this formula.</p>"}
    <h3>FISH</h3>
    ${fishBlock(report.fish_probes)}
    <h3>Chromosomes</h3>
    ${picture}
    ${structural.html}
  </section>`;
}

const STRUCTURE_LABELS = { validated: "Structure validated", failed: "Structure check failed", not_checked: "Structure not checked" };
const VISIBILITY_LABELS = { visible: "Usually visible on a karyotype", borderline: "Near karyotype resolution", below: "Often below karyotype resolution" };

/** Drawn-geometry checks for del, dup, inv, and t(). Mosaic or numerical events are left to the server. */
async function structureChecks(events) {
  const tokens = events.filter((item) => item.supported && item.kind !== "numerical").map((item) => item.token);
  if (!tokens.length) return { status: "not_checked", note: "", html: "" };
  const { maps } = await ensureDrawing();
  const results = tokens.flatMap((token) => validateStructure(maps, token));
  const status = structureStatus(results);
  const note = status === "validated"
    ? "Each drawn chromosome was compared with the GRCh38 band map: chromosome and arm, breakpoints, unaffected bands, segment order, relative length, and centromere."
    : status === "failed"
      ? "A drawn chromosome differs from the band map. Do not rely on the picture."
      : "One or more events are outside the validated set (del, dup, inv, two-break reciprocal t()).";
  const rows = results.map((item) => `<li>
      <p><code>${escapeHtml(item.token)}</code> ${escapeHtml(item.kind)} <span class="library-cap">${escapeHtml(STRUCTURE_LABELS[item.status] || item.status)}</span>${item.visibility?.level && VISIBILITY_LABELS[item.visibility.level] ? ` <span class="library-cap resolution-${item.visibility.level}">${escapeHtml(VISIBILITY_LABELS[item.visibility.level])}</span>` : ""}</p>
      ${item.checks.length ? `<ul class="structure-checks">${item.checks.map((check) => `<li class="check-${check.status}">${check.status === "pass" ? "✓" : "✗"} ${escapeHtml(check.label)}. ${escapeHtml(check.detail)}</li>`).join("")}</ul>` : `<p class="muted">${escapeHtml(item.note)}</p>`}
      ${item.visibility?.note ? `<p class="library-note">${escapeHtml(item.visibility.note)}</p>` : ""}
    </li>`).join("");
  return {
    status,
    note,
    html: `<h3>Structure checks</h3>
      <p class="muted">A structurally correct drawing is not always diagnostically informative. The resolution note says when a routine karyotype cannot resolve the change.</p>
      <ul class="structure-results">${rows}</ul>`,
  };
}

function resultRows(payload) {
  const rows = [...(payload.results || [])];
  for (const fusion of payload.fusions || []) rows.push({ ...fusion, preferred_name: fusion.symbol, match_class: "exact" });
  if (!rows.length) return `<p>${escapeHtml(payload.note || "No matching record.")}</p>`;
  return `<table class="case-table"><thead><tr><th>Record</th><th>Class</th><th>What this record can show</th></tr></thead><tbody>
    ${rows.map((row, index) => {
      const name = row.preferred_name || row.original || row.symbol || row.abnormality_type || "Record";
      const id = row.disease_id || row.disease?.disease_id || "";
      return `<tr><td><button type="button" data-library-id="${escapeHtml(id)}" data-library-index="${index}">${escapeHtml(name)}</button></td><td>${escapeHtml(row.match_class || payload.match || "")} ${escapeHtml(row.record_class || "")}</td><td>${capabilityLabels(row.capabilities) || "Reference record"}</td></tr>`;
    }).join("")}
  </tbody></table>`;
}

function libraryTabs(view) {
  const tab = (id, href, label) => `<a href="${href}" class="library-tab${view === id ? " on" : ""}"${view === id ? ` aria-current="page"` : ""}>${label}</a>`;
  return `<nav class="library-tabs" aria-label="Reference library views">${tab("search", "#/library", "Search")}${tab("analysis", "#/library/analysis", "ISCN Analysis")}${tab("cohort", "#/library/cohort", "Cohort Analysis")}</nav>`;
}

function cohortView() {
  return `<section class="library-cohort">
    <p>Compare many karyotypes at once: how often each band is gained or lost, which abnormalities and breakpoints recur, which chromosomes rearrange together, and how complex the cases are. Every case is read by the same engine as ISCN Analysis.</p>
    <form id="cohort-form" class="cohort-form">
      <fieldset><legend>Source</legend>
        <label class="check"><input type="radio" name="source" value="teaching" checked> Teaching catalog</label>
        <label class="check"><input type="radio" name="source" value="saved"> My saved cases</label>
        <label class="check"><input type="radio" name="source" value="file"> Paste or load a file</label>
      </fieldset>
      <div class="cohort-file" hidden>
        <p class="muted">One formula per line, or a TSV or CSV with a karyotype column (for example <code>KaryShort</code> or <code>CloneShort</code>) and optional case and diagnosis columns. A search exported from the <a href="https://mitelmandatabase.isb-cgc.org/" target="_blank" rel="noopener noreferrer">Mitelman Database</a> can be loaded here. The file is read in this browser only. It is not uploaded, stored, or bundled with the lab.</p>
        <input type="file" id="cohort-file" accept=".txt,.tsv,.csv,text/plain,text/csv,text/tab-separated-values">
        <textarea id="cohort-text" rows="6" spellcheck="false" placeholder="46,XY,t(8;21)(q22;q22)[20]&#10;47,XX,+8[15]/46,XX[5]"></textarea>
      </div>
      <div class="cohort-options">
        <label>Group<select id="cohort-group"><option value="">All cases</option></select></label>
        <label>Clones<select id="cohort-clones"><option value="any">Any clone</option><option value="stemline">Stemline only</option></select></label>
        <button type="submit">Analyze cohort</button>
      </div>
    </form>
    <p id="cohort-source-note" class="library-note"></p>
    <div id="cohort-result" aria-live="polite"></div>
  </section>`;
}

async function teachingRecords() {
  const raw = await loadDiseases();
  const diseases = Array.isArray(raw) ? raw : raw?.diseases || Object.values(raw || {});
  const records = [];
  for (const disease of diseases) {
    for (const item of disease.cytogenetic_cases || []) {
      const formula = item.representative_teaching_karyotype?.iscn;
      if (formula) records.push({ id: `${disease.id}/${item.id}`, formula, group: disease.disease_name || disease.id });
    }
  }
  return records;
}

function savedRecords() {
  let cases = [];
  try { cases = JSON.parse(localStorage.getItem("cyto.patientCases") || "[]"); } catch { cases = []; }
  return cases.filter((item) => item.lab === "karyotype")
    .map((item) => ({ id: item.label || item.id, formula: String(item.iscnDraft || item.finding || "").split("\n")[0].trim(), group: item.specimen || "" }))
    .filter((item) => item.formula);
}

const ANALYSIS_KEY = "cyto.libraryAnalysis";
const ANALYSIS_EXAMPLES = [
  "46,XX,t(9;22)(q34;q11.2)[10]/47,idem,+8[5]/48,sl,+8,+21[3]",
  "45~48,XY,del(5)(q13q33),-7,+8,+mar[cp10]",
  "46,XY,der(22)t(9;22)(q34;q11.2)",
  "46,XX,i(17)(q10)",
  "47,XY,+21,add(1)(p36)",
];

function analysisView() {
  let saved = "";
  try { saved = sessionStorage.getItem(ANALYSIS_KEY) || ""; } catch { saved = ""; }
  return `<section class="library-analysis">
    <p>Parse a complete formula, then read its net gains and losses, breakpoints, complexity, and clone structure. Each clone is built with the same engine that draws chromosomes in Chromosome Analysis.</p>
    <form id="library-analysis-form" class="library-search">
      <textarea id="library-analysis-formula" rows="2" aria-label="ISCN formula" placeholder="46,XX,t(9;22)(q34;q11.2)[10]/47,idem,+8[5]">${escapeHtml(saved || ANALYSIS_EXAMPLES[0])}</textarea>
      <button type="submit">Analyze</button>
    </form>
    <p class="library-examples">Examples: ${ANALYSIS_EXAMPLES.map((formula) => `<button type="button" class="link-button" data-analysis-example="${escapeHtml(formula)}">${escapeHtml(formula)}</button>`).join(" ")}</p>
    <div id="library-analysis-result" aria-live="polite"></div>
  </section>`;
}

export function libraryView(extra = "", view = "search") {
  if (view === "analysis" || view === "cohort") {
    return `<main class="reference library-page">
    <h2>Reference library</h2>
    ${extra}
    ${libraryTabs(view)}
    ${view === "cohort" ? cohortView() : analysisView()}
  </main>`;
  }
  return `<main class="reference library-page">
    <h2>Reference library</h2>
    ${extra}
    ${libraryTabs(view)}
    <p>Search stored disease names, ISCN strings, chromosomes, genes, and fusions. A result is a database record, not a diagnosis, and it does not open a graded case.</p>
    <form id="library-form" class="library-search">
      <select id="library-type" aria-label="Search type">
        <option value="disease">Disease</option>
        <option value="iscn">ISCN</option>
        <option value="chromosome">Chromosome</option>
        <option value="gene">Gene</option>
        <option value="fusion">Fusion</option>
      </select>
      <input id="library-query" aria-label="Search query" placeholder="Down syndrome, 47,XY,+21, 5p15.2, BCR, BCR::ABL1">
      <button type="submit">Search</button>
    </form>
    <p id="library-availability" class="library-note"></p>
    <div id="library-results"></div>
    <div id="library-detail"></div>
  </main>`;
}

function bindAnalysisView(root) {
  const form = root.querySelector("#library-analysis-form");
  const input = root.querySelector("#library-analysis-formula");
  const result = root.querySelector("#library-analysis-result");
  if (!form || !input || !result) return;
  const run = async () => {
    const formula = input.value.trim();
    try { sessionStorage.setItem(ANALYSIS_KEY, formula); } catch { /* storage unavailable */ }
    result.innerHTML = `<p class="muted">Reading the formula…</p>`;
    const { maps } = await ensureDrawing();
    const analysis = analyzeFormula(maps, formula);
    result.innerHTML = analysisHTML(maps, analysis, { mode: "library" });
    bindAnalysis(result, {
      maps,
      analysis,
      onApply: (next) => { input.value = next; run(); },
    });
  };
  form.addEventListener("submit", (event) => { event.preventDefault(); run(); });
  root.querySelectorAll("[data-analysis-example]").forEach((button) => button.addEventListener("click", () => {
    input.value = button.dataset.analysisExample;
    run();
  }));
  run();
}

function bindCohortView(root) {
  const form = root.querySelector("#cohort-form");
  const result = root.querySelector("#cohort-result");
  const note = root.querySelector("#cohort-source-note");
  const groupSelect = root.querySelector("#cohort-group");
  const filePanel = root.querySelector(".cohort-file");
  const text = root.querySelector("#cohort-text");
  if (!form || !result) return;
  let records = [];
  const source = () => form.querySelector("[name=source]:checked")?.value || "teaching";
  const fillGroups = () => {
    const groups = cohortGroups(records);
    groupSelect.innerHTML = `<option value="">All cases (${records.length})</option>${groups.map((group) => `<option value="${escapeHtml(group.name)}">${escapeHtml(group.name)} (${group.count})</option>`).join("")}`;
  };
  const load = async () => {
    const kind = source();
    filePanel.hidden = kind !== "file";
    if (kind === "teaching") {
      records = await teachingRecords();
      note.textContent = `${records.length} teaching karyotypes from this lab's disease catalog, grouped by disease. These are representative teaching formulas, not a patient cohort, so the frequencies describe the catalog.`;
    } else if (kind === "saved") {
      records = savedRecords();
      note.textContent = records.length ? `${records.length} karyotype case${records.length === 1 ? "" : "s"} saved on this device, using your ISCN draft or the entered finding.` : "No saved karyotype case on this device has a formula yet.";
    } else {
      const parsed = parseCohortText(text.value);
      records = parsed.records;
      note.textContent = records.length
        ? `${records.length} case${records.length === 1 ? "" : "s"} read${parsed.column ? ` from column ${parsed.column}` : ", one formula per line"}${parsed.groupColumn ? `, grouped by ${parsed.groupColumn}` : ""}.`
        : "Paste karyotypes or choose a file.";
    }
    fillGroups();
  };
  const run = async () => {
    const { maps } = await ensureDrawing();
    const group = groupSelect.value;
    const chosen = group ? records.filter((record) => record.group === group) : records;
    result.innerHTML = `<p class="muted">Reading ${chosen.length} karyotypes…</p>`;
    await new Promise((resolve) => setTimeout(resolve, 0));
    const cohort = analyzeCohort(maps, chosen, { clones: root.querySelector("#cohort-clones").value });
    const name = group || { teaching: "Teaching catalog", saved: "Saved cases", file: "Loaded cohort" }[source()];
    result.innerHTML = cohortHTML(maps, cohort, { title: name });
    bindCohort(result, { maps, cohort, name });
  };
  form.addEventListener("change", async (event) => {
    if (event.target.name === "source") { await load(); if (source() !== "file") run(); }
  });
  text.addEventListener("input", () => { if (source() === "file") load(); });
  root.querySelector("#cohort-file").addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    text.value = await file.text();
    await load();
    run();
  });
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (source() === "file") await load();
    run();
  });
  load().then(run);
}

export function bindLibrary(root, route = {}) {
  if (route.view === "analysis") { bindAnalysisView(root); return; }
  if (route.view === "cohort") { bindCohortView(root); return; }
  const form = root.querySelector("#library-form");
  const availability = root.querySelector("#library-availability");
  const results = root.querySelector("#library-results");
  const detail = root.querySelector("#library-detail");
  if (!form || !results || !detail) return;
  if (route.diseaseId) {
    referenceGet(`/api/reference/disease?id=${encodeURIComponent(route.diseaseId)}`)
      .then((record) => diseaseDetail(record))
      .then((markup) => { detail.innerHTML = markup; })
      .catch(() => { detail.innerHTML = "<p>The reference module is unavailable.</p>"; });
  }

  referenceGet("/api/reference/status").then((status) => {
    if (!status.available) {
      availability.textContent = status.reason || "The reference module is unavailable. Laboratory activities are unchanged.";
      return;
    }
    availability.textContent = "The reference module is available on this server.";
  }).catch(() => {
    availability.textContent = "The reference module is unavailable. Laboratory activities are unchanged.";
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const type = root.querySelector("#library-type").value;
    const query = root.querySelector("#library-query").value.trim();
    detail.innerHTML = "";
    const payload = await referenceGet(`/api/reference/search?type=${encodeURIComponent(type)}&q=${encodeURIComponent(query)}`);
    if (!payload.available) {
      results.innerHTML = `<p>${escapeHtml(payload.reason || "The reference module is unavailable.")}</p>`;
      return;
    }
    results.innerHTML = `<p>${escapeHtml(payload.disclaimer || "")}</p>${resultRows(payload)}`;
    if (type === "iscn") {
      const report = await referenceGet(`/api/reference/interpret?q=${encodeURIComponent(query)}`);
      detail.innerHTML = await interpretationBlock(report);
    }
    results.querySelectorAll("[data-library-index]").forEach((button) => {
      button.addEventListener("click", async () => {
        const diseaseId = button.getAttribute("data-library-id");
        if (!diseaseId) {
          const row = payload.results[Number(button.getAttribute("data-library-index"))];
          detail.innerHTML = `<h3>${escapeHtml(row.symbol || row.abnormality_type || "Record")}</h3><p>${escapeHtml(row.evidence_label || row.bands || row.rearrangement || "No further detail is stored.")}</p>`;
          return;
        }
        const record = await referenceGet(`/api/reference/disease?id=${encodeURIComponent(diseaseId)}`);
        detail.innerHTML = await diseaseDetail(record);
      });
    });
  });
}

const EVIDENCE_GROUPS = [
  ["educational", "Curated educational examples", "Teaching examples written for this database. They are not a verified diagnosis."],
  ["sufficient", "ClinGen dosage: sufficient evidence", "ClinGen scored a deletion or duplication here 3, sufficient evidence for dosage pathogenicity."],
  ["limited", "ClinGen dosage: limited or some evidence", "ClinGen scored the dosage evidence 1 or 2. The association is weaker."],
  ["recessive", "ClinGen: autosomal recessive phenotype", "One copy loss is not the mechanism ClinGen describes for these genes."],
  ["other", "Other stored associations", ""],
];

function diseaseHref(id) {
  return `#/library/disease/${encodeURIComponent(id)}`;
}

/** Placeholder for the Atlas chromosome page. Filled by bindAtlasReference. */
export function atlasReferenceSection(chromosome) {
  return `<section class="atlas-reference" data-atlas-reference="${escapeHtml(chromosome)}">
    <h3>Reference database associations</h3>
    <p class="muted">Loading stored disease records for chromosome ${escapeHtml(chromosome)}…</p>
  </section>`;
}

export function bindAtlasReference(root, access = "open") {
  const section = root.querySelector("[data-atlas-reference]");
  const counts = root.querySelectorAll("[data-atlas-reference-count]");
  if (access === "closed") {
    if (section) section.innerHTML = "<h3>Reference database associations</h3><p class=\"muted\">The reference library is closed during this assessment.</p>";
    return;
  }
  if (counts.length) {
    referenceGet("/api/reference/chromosome-counts").then((payload) => {
      if (!payload.available) return;
      counts.forEach((node) => {
        const n = payload.counts?.[node.getAttribute("data-atlas-reference-count")] || 0;
        node.textContent = n ? `${n} in reference` : "";
      });
    }).catch(() => {});
  }
  if (!section) return;
  const chromosome = section.getAttribute("data-atlas-reference");
  referenceGet(`/api/reference/chromosome?q=${encodeURIComponent(chromosome)}`).then((payload) => {
    if (!payload.available) {
      section.innerHTML = `<h3>Reference database associations</h3><p class="muted">${escapeHtml(payload.reason || "The reference module is unavailable. The teaching list above is unchanged.")}</p>`;
      return;
    }
    const rows = payload.results || [];
    const groups = EVIDENCE_GROUPS.map(([id, title, note]) => {
      const items = rows.filter((row) => row.evidence_group === id);
      if (!items.length) return "";
      return `<details class="atlas-reference-group"${id === "educational" || id === "sufficient" ? " open" : ""}>
        <summary>${escapeHtml(title)} · ${items.length}</summary>
        ${note ? `<p class="muted">${escapeHtml(note)}</p>` : ""}
        <ul class="case-list">${items.map((row) => `<li><a class="case-row" href="${diseaseHref(row.disease_id)}"><span class="case-title">${escapeHtml(row.preferred_name)}</span><span class="muted">${escapeHtml([row.changes.join(", "), row.bands.slice(0, 3).join(", "), row.genes.slice(0, 4).join(", ")].filter(Boolean).join(" · "))}</span></a></li>`).join("")}</ul>
      </details>`;
    }).join("");
    section.innerHTML = `<h3>Reference database associations</h3>
      <p class="muted">${rows.length} stored disease record${rows.length === 1 ? "" : "s"} link to an abnormality on chromosome ${escapeHtml(payload.chromosome)}. These come from the reference database, not from a teaching case. A link is not a diagnosis.</p>
      ${groups || `<p class="muted">${escapeHtml(payload.note || "No stored association.")}</p>`}`;
  }).catch(() => {
    section.innerHTML = "<h3>Reference database associations</h3><p class=\"muted\">The reference module is unavailable. The teaching list above is unchanged.</p>";
  });
}

async function diseaseDetail(payload) {
  if (!payload?.result) return `<p>${escapeHtml(payload?.reason || "No disease record.")}</p>`;
  const item = payload.result;
  const examples = item.iscn_examples || [];
  const pictures = [];
  for (const example of item.interpretations || []) {
    if (example.visualization) pictures.push(await schematicFor(example.original, example.visualization_scope));
  }
  return `<article>
    <h3>${escapeHtml(item.preferred_name)}</h3>
    <p>${capabilityLabels(item.capabilities)}</p>
    <p>${escapeHtml(item.description || "No description is stored for this record.")}</p>
    <p>Source: ${escapeHtml(item.source)} ${escapeHtml(item.source_record || "")}</p>
    <p>Identifiers: ${item.identifiers?.length ? item.identifiers.slice(0, 8).map((entry) => `${escapeHtml(entry.system)} ${escapeHtml(entry.code)}`).join(", ") : "Not available"}</p>
    <h3>Documented abnormalities</h3>
    ${(item.abnormalities || []).length ? `<ul>${item.abnormalities.slice(0, 12).map((entry) => `<li>${escapeHtml(entry.match_class)} ${escapeHtml(entry.abnormality_type)} ${escapeHtml(entry.bands || entry.chromosomes || "")} — ${escapeHtml(entry.evidence_strength || "")}</li>`).join("")}</ul>` : "<p>No abnormality is stored for this disease.</p>"}
    <h3>ISCN examples</h3>
    ${examples.length ? `<ul>${examples.map((entry) => `<li>${escapeHtml(entry.record_class)} <code>${escapeHtml(entry.original)}</code></li>`).join("")}</ul>` : "<p>No ISCN string is stored. None was created from the disease name.</p>"}
    <h3>FISH assays</h3>
    ${fishBlock(item.fish_probes)}
    ${pictures.join("") || "<p>Chromosome visualization is not available for this record.</p>"}
  </article>`;
}
