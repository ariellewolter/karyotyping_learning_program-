import { state } from "./store.js?v=20261006j";
import { bandSpanNoteHTML } from "./band-span.js?v=20261025span3";
import { SLOT_IDS, escapeHtml } from "./util.js?v=20261006j";
import { renderChromosome } from "./chromosomes.js?v=20261026p5";
import { ideogramSVG } from "./ideogram.js?v=20261024j";
import { atlasReferenceSection } from "./reference-library.js?v=20261026p5";
import {
  activeCase,
  affectedChromosomes,
  asCase,
  canonicalCase,
  cytogeneticCases,
  diseaseById,
  diseaseList,
  diseasesForChromosome,
  gradeFind,
  gradeIdentify,
  gradeInspect,
  gradeInterpret,
  splitBreakpointArms,
  notationChoices,
  optionLabel,
  teachingKaryotype,
} from "./atlas.js?v=20261006j";
import { LAB_PERIODS, isCaseworkSpecimenReady, isSeenByMethod, methodFit } from "./activities.js?v=20261026seen3";

const LAB_STEPS = ["find", "inspect", "identify", "interpret"];

export function isAtlasLabStep(step) {
  return LAB_STEPS.includes(step);
}

export function atlasBrowse(route) {
  if (route.view === "chromosome") return chromosomePage(route.chromosome, route.method);
  if (route.view === "disease") return diseasePage(route.diseaseId, route.method);
  return atlasHome(route.method);
}

const SEEN_METHODS = ["karyotype", "fish", "both"];

function seenMethod(method) {
  return SEEN_METHODS.includes(method) ? method : null;
}

function seenLabel(seen) {
  if (seen === "fish") return "FISH";
  if (seen === "karyotype") return "Karyotyping";
  if (seen === "both") return "Karyotyping and FISH";
  return "";
}

function diseaseHref(diseaseId, method) {
  const id = encodeURIComponent(diseaseId || "");
  if (seenMethod(method)) return `#/atlas/disease/${id}/${method}`;
  return `#/atlas/disease/${id}`;
}

const ATLAS_QUESTIONS = [
  "What changed?",
  "What does it look like?",
  "Can microscopy detect it?",
  "What consequence can it have?",
];

const LEARNING_PATH = [
  ["Learn", "Compare normal and abnormal chromosomes with labeled regions", "Recognize morphological changes"],
  ["Practice", "Inspect an unlabeled abnormal chromosome pair", "Identify the type of abnormality"],
  ["Investigate", "Open the Disease Atlas for a relevant example", "Understand the associated condition"],
  ["Casework", "Analyze a blinded metaphase or FISH field", "Apply microscopy skills independently"],
  ["Report", "Describe observations, findings and limitations", "Communicate cytogenetic results"],
];

const VISIBILITY_VERDICT = {
  clearly_visible: ["visible", "Visible on a routine G-banded karyotype"],
  size_dependent: ["partial", "Visible when large; small changes need FISH or microarray"],
  potentially_visible: ["partial", "Sometimes visible; often needs higher resolution, FISH or microarray"],
  usually_not_visible: ["hidden", "Below routine karyotype resolution; confirmed by FISH or microarray"],
};

function atlasHome(method) {
  const library = state.diseases;
  const seen = seenMethod(method);
  const diseases = diseaseList(library).filter((d) => isSeenByMethod(d, seen));
  const types = library?.abnormality_types || [];
  const grouped = types.map((type) => ({
    type,
    list: diseases.filter((d) => guideType(d) === type.id || (type.id === "deletion" && guideType(d) === "duplication")),
  }));
  const other = diseases.filter((d) => !types.some((type) => type.id === guideType(d)));
  const filterNote = seen === "karyotype"
    ? "Showing conditions appropriate for a routine karyotype report."
    : seen === "fish"
      ? "Showing conditions appropriate for a FISH report."
      : seen === "both"
        ? `Showing ${diseases.length} condition${diseases.length === 1 ? "" : "s"} appropriate for both a karyotype report and a FISH report.`
        : "Filter by the laboratory method you are writing for.";
  return `
    <main class="atlas">
      <p class="crumb"><a href="#/">Home</a> / Atlas${seen ? ` / ${seenLabel(seen)}` : ""}</p>
      <header class="lab-head">
        <p class="eyebrow">Visual guide to chromosome abnormalities</p>
        <h2>Disease Atlas</h2>
        <p class="lede">Each condition is explained the same way, with the microscope comparison at the center.</p>
        ${questionFlow()}
      </header>

      ${seenByFilter(seen)}
      <p class="muted atlas-seen-note">${escapeHtml(filterNote)}</p>

      <section class="atlas-primer" aria-labelledby="atlas-types">
        <h3 id="atlas-types">Start here: four kinds of chromosome change</h3>
        <p class="muted">Learn what each kind looks like before connecting it to a disease.</p>
        <div class="type-grid">
          ${types.map((type) => `
            <article class="type-card">
              <div class="type-art">
                <figure>${drawList(type.example.normal, `type-${type.id}-n`, 1.05)}<figcaption>Normal</figcaption></figure>
                <figure>${drawList(type.example.abnormal, `type-${type.id}-a`, 1.05)}<figcaption>${escapeHtml(type.example.caption)}</figcaption></figure>
              </div>
              <h4>${escapeHtml(type.label)}</h4>
              <p>${escapeHtml(type.summary)}</p>
              <p class="muted">${escapeHtml(type.learn)}</p>
            </article>`).join("")}
        </div>
      </section>

      <section aria-labelledby="atlas-path">
        <h3 id="atlas-path">From the microscope to the clinic</h3>
        <table class="path-table">
          <thead><tr><th>Stage</th><th>Student activity</th><th>Learning objective</th></tr></thead>
          <tbody>${LEARNING_PATH.map(([stage, activity, goal]) => `<tr><th scope="row">${stage}</th><td>${activity}</td><td>${goal}</td></tr>`).join("")}</tbody>
        </table>
      </section>

      <div class="atlas-actions">
        <button type="button" class="btn primary" id="atlas-assign">Start an assigned exercise</button>
        <p class="muted">The disease name and the canonical finding stay hidden until you connect them.</p>
      </div>

      <h3>Conditions by kind of change</h3>
      ${diseases.length
        ? [...grouped, { type: { label: "Other rearrangements" }, list: other }].filter((g) => g.list.length).map((g) => `
        <h4 class="atlas-group">${escapeHtml(g.type.label)}</h4>
        <ul class="case-list">${diseaseRows(g.list, seen)}</ul>`).join("")
        : `<p class="muted">No teaching diseases match this laboratory method yet.</p>`}

      <h3>Chromosomes</h3>
      <div class="chr-index" aria-label="Chromosomes">
        ${SLOT_IDS.map((id) => {
          const n = diseasesForChromosome(library, id).filter((d) => isSeenByMethod(d, seen)).length;
          const href = seen ? `#/atlas/chromosome/${id}/${seen}` : `#/atlas/chromosome/${id}`;
          return `<a class="chr-key" href="${href}"><strong>${id}</strong><span>${n ? `${n} teaching` : "—"}</span><span class="chr-key-ref" data-atlas-reference-count="${id}"></span></a>`;
        }).join("")}
      </div>
    </main>`;
}

function seenByFilter(method, chromosome = null) {
  const chr = chromosome ? String(chromosome) : "";
  const hrefFor = (id) => {
    if (chr) return id ? `#/atlas/chromosome/${chr}/${id}` : `#/atlas/chromosome/${chr}`;
    return id ? `#/atlas/seen/${id}` : "#/atlas";
  };
  const options = [
    ["", "All diseases"],
    ["karyotype", "Seen by karyotyping"],
    ["fish", "Seen by FISH"],
    ["both", "Seen by Karyotyping and FISH"],
  ];
  return `<nav class="atlas-seen-filter" aria-label="Filter diseases by laboratory method">${options.map(([id, label]) => {
    const active = (method || "") === id;
    return `<a class="atlas-seen-link${active ? " is-active" : ""}" href="${hrefFor(id)}"${active ? ' aria-current="page"' : ""}>${escapeHtml(label)}</a>`;
  }).join("")}</nav>`;
}

function questionFlow() {
  return `<ol class="question-flow">${ATLAS_QUESTIONS.map((q) => `<li>${escapeHtml(q)}</li>`).join("")}</ol>`;
}

function guideType(disease) {
  return disease?.atlas_guide?.type || "other";
}

function drawList(items, prefix, scale = 1.35) {
  return `<div class="homolog-row">${(items || []).map((item, i) => draw(item.chr, item.variant || "normal", `${prefix}-${i}`, scale)).join("")}</div>`;
}

function chromosomePage(chromosome, method) {
  const id = String(chromosome || "1");
  const seen = seenMethod(method);
  const template = state.templates?.chromosomes?.[id];
  const map = state.maps?.chromosomes?.[id];
  const diseases = diseasesForChromosome(state.diseases, id).filter((d) => isSeenByMethod(d, seen));
  if (!template && !map) {
    return `<main class="atlas"><p class="crumb"><a href="#/atlas">Atlas</a></p><h2>Unknown chromosome</h2></main>`;
  }
  const bands = (map?.segments || []).filter((seg) => seg.role === "band");
  const pBands = bands.filter((seg) => seg.arm === "p").map((seg) => seg.label);
  const qBands = bands.filter((seg) => seg.arm === "q").map((seg) => seg.label);
  const picture = map
    ? ideogramSVG(map.segments, { width: 160, height: 460, showLabels: true })
    : renderChromosome({ id: `atlas-ref-${id}`, identity: id, variant: "normal", template }, { scale: 1.8 });
  const atlasHref = seen ? `#/atlas/seen/${seen}` : "#/atlas";
  return `
    <main class="atlas">
      <p class="crumb"><a href="#/">Home</a> / <a href="${atlasHref}">Atlas</a> / Chromosome ${escapeHtml(id)}</p>
      ${seenByFilter(seen, id)}
      <div class="atlas-chrom">
        <div class="ideo-column">
          ${picture}
          <p class="ideo-caption">Demonstration ideogram, pter at the top.</p>
        </div>
        <div>
          <h2>Chromosome ${escapeHtml(id)}</h2>
          <p><button type="button" class="btn" data-inspect-chromosome="${escapeHtml(id)}">Compare the two homologs</button></p>
          <ul class="comp-list">
            <li>Morphology: ${escapeHtml(template?.morphology || map?.morphology || "not recorded")}</li>
            <li>Short arm (p) is above the centromere. Long arm (q) is below it.</li>
            <li>Centromere: primary constriction. Band numbers increase from the centromere toward each telomere.</li>
          </ul>
          ${bands.length ? `
            <p><strong>p arm bands in this map.</strong> ${escapeHtml(pBands.join(", ") || "none")}</p>
            <p><strong>q arm bands in this map.</strong> ${escapeHtml(qBands.join(", ") || "none")}</p>
          ` : `<p class="muted">This chromosome has a schematic drawing. A band-by-band map is not in the teaching library yet.</p>`}
          <h3>Teaching diseases on this chromosome</h3>
          <ul class="case-list">
            ${diseases.map((d) => {
              const iscn = diseaseIscn(d);
              return `<li><a class="case-row" href="${diseaseHref(d.id, seen)}"><span class="case-title">${escapeHtml(d.disease_name)}</span>${iscn ? `<code class="atlas-row-iscn">${escapeHtml(iscn)}</code>` : ""}<span class="muted">${escapeHtml([casesTouching(d, id).join("; "), methodShort(d)].filter(Boolean).join(" · "))}</span></a></li>`;
            }).join("") || `<li class='muted'>No teaching disease${seen ? ` for ${seenLabel(seen).toLowerCase().replace("fish", "FISH")}` : ""} in the library is centered here.</li>`}
          </ul>
          ${atlasReferenceSection(id)}
        </div>
      </div>
    </main>`;
}

function diseasePage(diseaseId, method) {
  const disease = diseaseById(state.diseases, diseaseId);
  const seen = seenMethod(method);
  const atlasHref = seen ? `#/atlas/seen/${seen}` : "#/atlas";
  if (!disease) {
    return `<main class="atlas"><p class="crumb"><a href="${atlasHref}">Atlas</a></p><h2>Unknown disease</h2><p><a href="${atlasHref}">Return to the atlas</a></p></main>`;
  }
  const canonical = canonicalCase(disease);
  const guide = disease.atlas_guide || {};
  const fit = methodFit(disease);
  const iscn = diseaseIscn(disease);
  const id = encodeURIComponent(disease.id);
  const readyLab = (lab) => LAB_PERIODS[lab]?.guidedDiseaseId === disease.id
    || isCaseworkSpecimenReady(disease, lab, state.activityLinks, state.activityPacks, state.probes);
  const caseworkReason = (lab) => {
    if (fit[lab] !== "appropriate") return lab === "fish" ? "Not a FISH teaching case" : "Not visible on a routine karyotype";
    return lab === "fish" ? "No FISH assay is stored yet" : "No drawable teaching metaphase yet";
  };
  const [tone, verdict] = VISIBILITY_VERDICT[canonical?.karyotype_visibility] || ["partial", "Visibility not recorded"];
  const primary = String((canonical?.primary_chromosome || [])[0] || guide.compare?.chr || "");
  const background = disease.clinical_background || {};
  return `
    <main class="atlas atlas-disease">
      <p class="crumb"><a href="#/">Home</a> / <a href="${atlasHref}">Atlas</a> / ${escapeHtml(disease.disease_name)}</p>
      ${seenByFilter(seen)}
      <header class="disease-head">
        <h2>${escapeHtml(disease.disease_name)}</h2>
        ${guide.headline ? `<p class="disease-sub">${escapeHtml(guide.headline)}</p>` : ""}
        <p class="disease-tags">
          ${guide.category ? `<span class="tag">${escapeHtml(guide.category)}</span>` : ""}
          ${canonical?.kind === "acquired" ? `<span class="tag">Acquired in tumor cells</span>` : ""}
          ${fit.karyotype === "appropriate" ? `<span class="tag">Seen by karyotyping</span>` : ""}
          ${fit.fish === "appropriate" ? `<span class="tag">Seen by FISH</span>` : ""}
          <span class="tag vis-${tone}">${escapeHtml(verdict)}</span>
        </p>
        ${diseaseIscnBlock(disease)}
        ${diseaseJumpLinks(disease)}
        ${questionFlow()}
      </header>

      <section class="guide-step">
        <h3><span class="step-n">1</span> What is the chromosomal defect?</h3>
        <p>${escapeHtml(guide.defect || canonical?.visual_change || "")}</p>
      </section>

      <section class="guide-step guide-scope">
        <h3><span class="step-n">2</span> What should I look for under the microscope?</h3>
        ${compareFigure(disease, guide.compare, tone)}
        <p>${escapeHtml(guide.look_for || canonical?.student_should_notice || "")}</p>
        <p class="scope-note">Illustrative reference images. Actual detectability depends on deletion size, banding resolution and specimen quality.</p>
      </section>

      <section class="guide-step">
        <h3><span class="step-n">3</span> What changes biologically?</h3>
        ${guide.why ? `<aside class="why-box"><p class="eyebrow">Why does this abnormality matter?</p><p>${escapeHtml(guide.why)}</p></aside>` : ""}
        ${guide.biology ? `<p>${escapeHtml(guide.biology)}</p>` : ""}
      </section>

      <section class="guide-step">
        <h3><span class="step-n">4</span> How is it detected?</h3>
        <p class="detect-verdict vis-${tone}">${escapeHtml(verdict)}</p>
        <p>${escapeHtml(guide.detection || background.testing || "")}</p>
      </section>

      <section class="guide-step">
        <h3><span class="step-n">5</span> Open in Casework &amp; Draw</h3>
        <p>Open this condition directly in the casework laboratory to analyze specimen findings and build a report, or draw its karyogram from the written ISCN:</p>
        <div class="controls disease-actions">
          ${readyLab("karyotype")
            ? `<a class="btn primary" id="atlas-btn-karyotype" href="#/patients/karyotype/open/${id}">Open Casework Karyotype</a>`
            : `<button type="button" class="btn is-off" disabled title="${escapeHtml(caseworkReason("karyotype"))}">Open Casework Karyotype <small class="muted">(${escapeHtml(caseworkReason("karyotype"))})</small></button>`}
          ${readyLab("fish")
            ? `<a class="btn primary" id="atlas-btn-fish" href="#/patients/fish/open/${id}">Open Casework FISH</a>`
            : `<button type="button" class="btn is-off" disabled title="${escapeHtml(caseworkReason("fish"))}">Open Casework FISH <small class="muted">(${escapeHtml(caseworkReason("fish"))})</small></button>`}
          ${iscn
            ? `<a class="btn" id="atlas-btn-draw" href="#/lab/chromosome/draw/formula/${encodeURIComponent(iscn)}">Open Draw</a>`
            : `<button type="button" class="btn is-off" disabled title="No written ISCN to draw">Open Draw</button>`}
          <button type="button" class="btn" data-inspect-disease="${escapeHtml(disease.id)}">Inspect the chromosomes</button>
          ${primary ? `<a class="btn" href="#/atlas/chromosome/${escapeHtml(primary)}">Study chromosome ${escapeHtml(primary)}</a>` : ""}
        </div>
      </section>

      <details class="atlas-advanced">
        <summary>Advanced reference: clinical background, cytogenetic cases and notation</summary>
        ${disease.teaching_notes ? `<p>${escapeHtml(disease.teaching_notes)}</p>` : ""}
        ${background.summary ? `<p><strong>Overview.</strong> ${escapeHtml(background.summary)}</p>` : ""}
        ${background.presentation ? `<p><strong>Presentation.</strong> ${escapeHtml(background.presentation)}</p>` : ""}
        ${background.testing ? `<p><strong>Testing.</strong> ${escapeHtml(background.testing)}</p>` : ""}
        <div class="case-stack">
          ${cytogeneticCases(disease).map((item) => caseCard(item)).join("")}
        </div>
        ${referenceList(disease)}
      </details>
    </main>`;
}

/** Shortcuts from a disease page into Draw and each casework laboratory. */
function diseaseJumpLinks(disease) {
  const iscn = diseaseIscn(disease);
  const id = encodeURIComponent(disease.id);
  const ready = (lab) => LAB_PERIODS[lab]?.guidedDiseaseId === disease.id
    || isCaseworkSpecimenReady(disease, lab, state.activityLinks, state.activityPacks, state.probes);
  const fit = methodFit(disease);
  const caseworkReason = (lab) => {
    if (fit[lab] !== "appropriate") return lab === "fish" ? "Not a FISH teaching case" : "Not visible on a routine karyotype";
    return lab === "fish" ? "No FISH assay is stored yet" : "No drawable teaching metaphase yet";
  };
  const link = (key, label, href, note, off) => off
    ? `<span class="atlas-jump-link is-off" id="atlas-jump-${key}" aria-disabled="true" title="${escapeHtml(off)}"><strong>${escapeHtml(label)}</strong><small>${escapeHtml(off)}</small></span>`
    : `<a class="atlas-jump-link" id="atlas-jump-${key}" href="${href}"><strong>${escapeHtml(label)}</strong><small>${escapeHtml(note)}</small></a>`;
  return `
    <nav class="atlas-jump" aria-label="Open this disease in another workspace">
      <span class="eyebrow">Open this disease in</span>
      <div class="atlas-jump-links">
        ${link("karyotype", "Open Casework Karyotype", `#/patients/karyotype/open/${id}`, "Metaphase to analyze and report", ready("karyotype") ? "" : caseworkReason("karyotype"))}
        ${link("fish", "Open Casework FISH", `#/patients/fish/open/${id}`, "Fluorescence field to score and report", ready("fish") ? "" : caseworkReason("fish"))}
        ${link("draw", "Open Draw", `#/lab/chromosome/draw/formula/${encodeURIComponent(iscn)}`, "Karyogram from the teaching ISCN", iscn ? "" : "No written ISCN to draw")}
      </div>
    </nav>`;
}

function compareFigure(disease, compare, tone) {
  if (!compare) return `<div class="scope-compare">${diseaseArt(disease)}</div>`;
  if (compare.mode === "ideogram") return ideogramCompare(compare, tone);
  return `
    <div class="scope-compare">
      <figure>${drawList(compare.normal, `guide-${disease.id}-n`, 1.9)}<figcaption>${escapeHtml(compare.normal_label || "Normal")}</figcaption></figure>
      <figure class="abnormal">${drawList(compare.abnormal, `guide-${disease.id}-a`, 1.9)}<figcaption>${escapeHtml(compare.abnormal_label || "Abnormal")}</figcaption></figure>
    </div>`;
}

function ideogramCompare(compare, tone) {
  const map = state.maps?.chromosomes?.[String(compare.chr)];
  if (!map?.segments?.length) return "";
  const ids = map.segments.filter((seg) => compare.bands.some((band) => bandCovers(band, seg.id))).map((seg) => seg.id);
  const hidden = tone === "hidden";
  const opts = { width: 190, height: 380, showLabels: true };
  const abnormal = ideogramSVG(map.segments, {
    ...opts,
    highlightIds: ids,
    highlightTag: false,
    marks: hidden ? {} : { missing: ids },
  });
  return `
    <div class="scope-compare">
      <figure>${ideogramSVG(map.segments, opts)}<figcaption>Normal chromosome ${escapeHtml(compare.chr)}</figcaption></figure>
      <figure class="abnormal">${abnormal}<figcaption>${escapeHtml(compare.abnormal_label || "Region involved")}</figcaption></figure>
    </div>
    ${hidden ? `<p class="resolution-warn">The highlighted region is too small to see on a routine karyotype. Both homologs usually look the same; the deletion is found with FISH or microarray.</p>` : ""}`;
}

function bandCovers(band, id) {
  if (id === band) return true;
  if (!String(id).startsWith(band)) return false;
  const rest = String(id).slice(band.length);
  return rest.startsWith(".") || (band.includes(".") && /^\d+$/.test(rest));
}

function caseCard(item) {
  const kt = item.representative_teaching_karyotype || {};
  const notations = (item.example_notation || [kt.iscn]).filter(Boolean);
  const partners = item.partner_note
    || (Array.isArray(item.partner_chromosome) ? item.partner_chromosome.join(", ") : "");
  const role = item.role === "canonical"
    ? "Canonical teaching case"
    : item.lab_level === "advanced" ? "Advanced case — not the simple lab" : "Other mechanism — not the simple lab";
  return `
    <article class="disease-case">
      <p class="eyebrow">${escapeHtml(role)}</p>
      <h3>${escapeHtml(item.case_title || "")}</h3>
      <p>${escapeHtml(item.patient_case_label || "")}</p>
      <ul class="comp-list">
        ${fact("Primary chromosome", (item.primary_chromosome || []).join(", "))}
        ${fact("Homolog affected", item.homolog_affected)}
        ${fact("Primary locus", item.primary_locus)}
        ${fact("More specific region", item.specific_region)}
        ${fact("Abnormality type", item.abnormality_type)}
        ${fact("Structural class", item.structural_class)}
        ${fact("Typical configuration", item.typical_configuration)}
        ${fact("Whole chromosome count", item.whole_chromosome_count)}
        ${fact("What changes visually", item.visual_change)}
        ${fact("Material missing", item.material_missing)}
        ${fact("Material added", item.material_added)}
        ${fact("Partner chromosome", partners)}
        ${fact("Copy state", item.generation?.copy_state)}
        ${fact("Structural alteration", item.generation?.structural_alteration)}
        ${fact("Breakpoints", breakpointText(item))}
        ${fact("Derivatives", (item.generation?.derivatives || []).join(", "))}
        ${fact("Derivative", item.derivative)}
        ${fact("Genes", item.genes)}
        ${fact("Mechanism", item.mechanism)}
        ${fact("Student should notice", item.student_should_notice)}
        ${fact("Correct chromosome", (item.correct_chromosome || []).join(", "))}
        ${fact("Correct arm", item.correct_arm)}
        ${fact("Correct classification", item.correct_classification)}
        ${fact("Final interpretation", item.final_interpretation)}
        ${fact("Do not treat this case as", item.do_not_alter)}
      </ul>
      ${notations.length ? `<p class="iscn-display">${notations.map((n) => escapeHtml(n)).join(" / ")}</p>${bandSpanNoteHTML(state.maps, notations)}` : ""}
      <p class="muted">${escapeHtml(optionLabel(state.diseases, "visibility", item.karyotype_visibility))}</p>
    </article>`;
}

function fact(label, value) {
  if (!value) return "";
  return `<li>${escapeHtml(label)}: ${escapeHtml(value)}</li>`;
}

function referenceList(disease) {
  const refs = disease?.references || [];
  if (!refs.length) return "";
  return `<h3>References</h3><ul class="refs">${refs.map((ref) => {
    const text = `<strong>${escapeHtml(ref.label)}.</strong> ${escapeHtml(ref.citation)}`;
    const href = typeof ref.url === "string" && ref.url.startsWith("https://") ? ref.url : "";
    return `<li>${href ? `<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${text}</a>` : text}</li>`;
  }).join("")}</ul>`;
}

function isWrittenIscn(value) {
  return /^\d/.test(String(value || "").trim());
}

function diseaseIscn(disease) {
  const item = canonicalCase(disease);
  const teaching = teachingKaryotype(item)?.iscn || "";
  if (isWrittenIscn(teaching)) return teaching;
  return (item?.example_notation || []).find((notation) => isWrittenIscn(notation)) || "";
}

function diseaseIscnBlock(disease) {
  const iscn = diseaseIscn(disease);
  const fit = methodFit(disease);
  const item = canonicalCase(disease);
  const fishPrimary = fit.fish === "appropriate" && fit.karyotype !== "appropriate";
  const hidden = item?.karyotype_visibility === "usually_not_visible" || item?.karyotype_visibility === "potentially_visible";
  if (!iscn) {
    return `<p class="muted">${fishPrimary
      ? "No routine teaching karyotype formula is stored. Detection is taught through FISH or another molecular method."
      : "No teaching ISCN is stored for this disease."}</p>`;
  }
  const note = fishPrimary || hidden
    ? `<p class="muted atlas-iscn-note">Written for reference. A routine G-banded karyotype may not show this change; FISH or microarray is often required.</p>`
    : "";
  return `<p class="atlas-disease-iscn"><span class="eyebrow">Teaching ISCN</span><code class="iscn-display">${escapeHtml(iscn)}</code></p>${note}`;
}

function diseaseRows(list, method = null) {
  return list.map((d) => {
    const iscn = diseaseIscn(d);
    return `
    <li>
      <a class="case-row" href="${diseaseHref(d.id, method)}">
        <span class="case-title">${escapeHtml(d.disease_name)}</span>
        ${iscn ? `<code class="atlas-row-iscn">${escapeHtml(iscn)}</code>` : `<span class="atlas-row-iscn muted">No written ISCN</span>`}
        <span class="muted">${escapeHtml(atlasRowNote(d))}</span>
      </a>
    </li>`;
  }).join("");
}

function methodShort(disease) {
  const fit = methodFit(disease);
  const item = canonicalCase(disease);
  const reference = item?.lab_level && item.lab_level !== "default";
  const karyotype = fit.karyotype === "appropriate";
  const fish = fit.fish === "appropriate";
  const fishLinked = Boolean(state.activityLinks?.[disease.id]?.fish);
  let method = "";
  if (karyotype && fish) method = "Karyotype · FISH";
  else if (karyotype) method = "Karyotype only";
  else if (fish) method = "FISH only";
  if (!method) return reference ? "Reference" : "";
  if (fish && !fishLinked) method = `${method} · no FISH assay yet`;
  if (reference) method = `${method} · reference`;
  return method;
}

function atlasRowNote(disease) {
  const item = canonicalCase(disease);
  const ids = [...new Set([...(item?.primary_chromosome || []), ...[].concat(item?.partner_chromosome || [])].map(String))];
  const where = ids.length ? `Chromosome ${ids.join(" · ")}` : "";
  const method = methodShort(disease);
  const note = visibilityShort(disease);
  const visibility = note.startsWith("Size-dependent") ? "size-dependent"
    : note.startsWith("Sometimes") ? "sometimes visible"
    : note.startsWith("Microdeletion") ? "microdeletion"
    : note.startsWith("Reference only") ? "reference"
    : "";
  return [where, method, visibility].filter(Boolean).join(" · ") || note;
}

function breakpointText(item) {
  const points = item.generation?.breakpoints || [];
  if (!points.length) return "";
  return points.map((point) => `${point.chromosome}${point.arm}${point.band}`).join(" and ");
}

function casesTouching(disease, chromosome) {
  const key = String(chromosome);
  return cytogeneticCases(disease).filter((item) => {
    const ids = [...(item.primary_chromosome || []), ...[].concat(item.partner_chromosome || [])].map(String);
    return ids.includes(key);
  }).map((item) => item.case_title).filter(Boolean);
}

function visibilityShort(disease) {
  const item = canonicalCase(disease);
  if (item?.lab_level !== "default") return "Reference only — not the laboratory case";
  if (item?.default_karyotype_activity === false || item?.karyotype_visibility === "usually_not_visible") {
    return "Microdeletion — usually not visible on a routine karyotype";
  }
  if (item?.karyotype_visibility === "size_dependent") {
    return "Size-dependent — a large change can show on a karyotype; a small one may not";
  }
  if (item?.karyotype_visibility === "potentially_visible") return "Sometimes visible on a karyotype";
  return "Visible on the teaching karyotype";
}

function diseaseArt(disease) {
  const spec = asCase(disease);
  const kt = spec?.representative_teaching_karyotype || {};
  const ids = (kt.chromosomes_to_find || []).length ? kt.chromosomes_to_find : (spec?.primary_chromosome || []).slice(0, 1);
  return ids.map((id) => {
    const variant = (kt.variants || {})[`${id}a`] || "normal";
    return `
      <div class="pair-art">
        <div>
          <p class="group-label">Usual ${escapeHtml(id)}</p>
          ${draw(id, "normal", `card-${disease.id}-${id}-n`)}
        </div>
        <div>
          <p class="group-label">${spec?.lab_level === "default" ? "Canonical case" : "Not built as the simple lab"}</p>
          ${affectedDrawings(spec, id, variant, kt)}
        </div>
      </div>`;
  }).join("");
}

function affectedDrawings(spec, id, variant, kt) {
  if (!spec || spec.lab_level !== "default") {
    return `<p class="ideo-caption">This mechanism is stored on the disease. The simple lab does not build its chromosome set.</p>`;
  }
  if (spec.answers?.change === "absent") {
    return `${draw(id, "normal", `card-${spec.id}-${id}-keep`)}<p class="empty-homolog">Partner absent</p>`;
  }
  if (spec.answers?.change === "extra") {
    const copies = Number(kt.copy_number?.[id]) || (String(kt.sex || "").match(new RegExp(id === "X" || id === "Y" ? id : `$^`, "g")) || []).length;
    const n = Math.max(copies, 2);
    return Array.from({ length: n }, (_, i) => draw(id, "normal", `card-${spec.id}-${id}-${i}`, 1.05)).join("");
  }
  return draw(id, variant, `card-${spec.id}-${id}-alt`);
}

function draw(identity, variant, id, scale = 1.35) {
  const template = state.templates?.chromosomes?.[String(identity)];
  if (!template) return "";
  return renderChromosome({ id, identity: String(identity), variant: variant || "normal", template }, { scale });
}

export function atlasLabBody(step) {
  const atlas = state.session?.atlas;
  if (!atlas?.disease) return "";
  if (step === "find") {
    return `<p>The karyotype above is the one you built. Click each pair that appears abnormal. A wrong pair is not named.</p>`;
  }
  if (step === "inspect") return inspectBody(atlas);
  if (step === "identify") return identifyBody(atlas);
  if (step === "interpret") return interpretBody(atlas);
  return "";
}

function inspectBody(atlas) {
  const library = state.diseases;
  const item = activeCase(atlas);
  const split = splitBreakpointArms(item);
  return `
    <div class="inspect-block">
      ${(teachingKaryotype(item)?.chromosomes_to_find || []).map((id) => `
        <section>
          <h3>Chromosome ${escapeHtml(id)}</h3>
          <div class="pair-art">
            <div>
              <p class="group-label">Usual structure</p>
              ${referencePicture(id)}
            </div>
            <div>
              <p class="group-label">From this karyotype</p>
              <div class="homolog-row">
                ${patientHomologs(id)}
                ${item?.answers?.change === "absent" ? `<p class="empty-homolog">No partner in this cell</p>` : ""}
              </div>
            </div>
          </div>
          ${split?.some((row) => row.chromosome === String(id)) ? `
            <fieldset>
              <legend>Breakpoint arm on chromosome ${escapeHtml(id)}</legend>
              ${radio(`atlas-arm-${id}`, "p", atlas.arms?.[id], "p arm")}
              ${radio(`atlas-arm-${id}`, "q", atlas.arms?.[id], "q arm")}
            </fieldset>` : ""}
        </section>`).join("")}
      <fieldset>
        <legend>What changed?</legend>
        ${(library.changes || []).map((item) => radio("atlas-change", item.id, atlas.change, item.label)).join("")}
      </fieldset>
      ${split ? "" : `<fieldset>
        <legend>Where?</legend>
        ${(library.places || []).map((item) => radio("atlas-place", item.id, atlas.place, item.label)).join("")}
      </fieldset>`}
    </div>`;
}

function referencePicture(identity) {
  const map = state.maps?.chromosomes?.[String(identity)];
  if (map?.segments?.length) {
    return ideogramSVG(map.segments, { width: 140, height: 380, showLabels: true });
  }
  return draw(identity, "normal", `ref-${identity}`, 1.5);
}

function patientHomologs(identity) {
  const list = (state.session.chromosomes || []).filter((c) => String(c.identity) === String(identity));
  if (!list.length) return `<p class="muted">This karyotype has no chromosome ${escapeHtml(identity)}.</p>`;
  return list.map((chr) => renderChromosome(chr, { scale: 1.5, hideIdentity: true })).join("");
}

function identifyBody(atlas) {
  const library = state.diseases;
  return `
    <p>Name the class of abnormality. Use what you saw on the chromosome, not the disease name.</p>
    <fieldset>
      <legend>Abnormality</legend>
      ${(library.identifies || []).map((item) => radio("atlas-identify", item.id, atlas.identify, item.label)).join("")}
    </fieldset>`;
}

function interpretBody(atlas) {
  const d = atlas.disease;
  const item = activeCase(atlas);
  const kt = teachingKaryotype(item);
  const choices = notationChoices(state.diseases, d);
  const revealed = atlas.notation === kt?.iscn && state.session.feedback?.interpret?.tone === "ok";
  return `
    <p>Choose the notation stored for this patient's case.</p>
    <fieldset>
      <legend>Cytogenetic notation</legend>
      ${choices.map((iscn) => radio("atlas-notation", iscn, atlas.notation, iscn)).join("")}
    </fieldset>
    ${revealed ? `
      <div class="disease-reveal">
        <h3>${escapeHtml(d.disease_name)}</h3>
        <p>${escapeHtml(item?.patient_case_label || "")}</p>
        <p class="iscn-display">${escapeHtml(kt?.iscn || "")}</p>
        ${bandSpanNoteHTML(state.maps, kt?.iscn || "")}
        <p><strong>This case.</strong> ${escapeHtml(item?.final_interpretation || "")}</p>
        <p><strong>Mechanism.</strong> ${escapeHtml(item?.mechanism || "")}</p>
        <p>${escapeHtml(d.teaching_notes || "")}</p>
        ${referenceList(d)}
      </div>` : ""}`;
}

function radio(name, value, current, label) {
  return `<label class="check"><input type="radio" name="${name}" value="${escapeHtml(value)}" ${current === value ? "checked" : ""}/> ${escapeHtml(label)}</label>`;
}

export function atlasControls(step) {
  if (step === "summary") {
    return `<div class="controls">
      <button type="button" class="btn" data-action="step-back">Back</button>
      <a class="btn primary" href="#/atlas">Return to the atlas</a>
    </div>`;
  }
  return `<div class="controls">
    <button type="button" class="btn" data-action="step-back">Back</button>
    <button type="button" class="btn" data-action="atlas-check">Check</button>
    <button type="button" class="btn primary" data-action="atlas-submit">Continue</button>
    <a class="btn" href="#/atlas">Back to Atlas</a>
  </div>`;
}

export function atlasSummary() {
  const atlas = state.session.atlas;
  const d = atlas.disease;
  const item = activeCase(atlas);
  const rows = [
    ["Karyotype", atlas.results?.karyotype],
    ["Affected chromosome", atlas.results?.find],
    ["Morphology", atlas.results?.inspect],
    ["Abnormality class", atlas.results?.identify],
    ["Notation", atlas.results?.interpret],
  ];
  return `
    <section class="summary">
      <h2>${escapeHtml(d.disease_name)}</h2>
      <p>${escapeHtml(item?.patient_case_label || "")}</p>
      <p class="iscn-display">${escapeHtml(teachingKaryotype(item)?.iscn || "")}</p>
      ${bandSpanNoteHTML(state.maps, teachingKaryotype(item)?.iscn || "")}
      <p><strong>This case.</strong> ${escapeHtml(item?.final_interpretation || "")}</p>
      <p><strong>Mechanism.</strong> ${escapeHtml(item?.mechanism || "")}</p>
      <p>${escapeHtml(d.teaching_notes || "")}</p>
      ${referenceList(d)}
      <ul class="score-list">
        ${rows.map(([label, ok]) => `<li><span>${label}</span><strong>${ok ? "correct" : "needs review"}</strong></li>`).join("")}
      </ul>
      <div class="controls">
        <button type="button" class="btn" data-action="step-back">Back</button>
        <a class="btn primary" href="#/atlas">Return to the atlas</a>
      </div>
    </section>`;
}

export function readAtlasFields(ev) {
  const atlas = state.session?.atlas;
  if (!atlas) return;
  const t = ev.target;
  if (t.name === "atlas-change") atlas.change = t.value;
  if (t.name === "atlas-place") atlas.place = t.value;
  if (String(t.name || "").startsWith("atlas-arm-")) {
    const chromosome = String(t.name).slice("atlas-arm-".length);
    atlas.arms = { ...(atlas.arms || {}), [chromosome]: t.value };
  }
  if (t.name === "atlas-identify") atlas.identify = t.value;
  if (t.name === "atlas-notation") atlas.notation = t.value;
}

export function handleAtlasAction(action, el) {
  const s = state.session;
  if (s?.module !== "atlas" && s?.module !== "disease") return false;
  if (action === "atlas-pick") {
    toggleFound(el?.getAttribute("data-slot"));
    return true;
  }
  if (action !== "atlas-check" && action !== "atlas-submit") return false;
  const step = s.steps[s.stepIndex];
  const submit = action === "atlas-submit";
  const graded = gradeStep(step);
  if (!graded) return false;
  const upcoming = (s.steps || []).slice((s.stepIndex || 0) + 1).filter((id) => id !== "summary");
  if (graded.ok && step === "inspect" && upcoming.length === 0) {
    graded.title = "Identify the change is complete.";
    graded.body = "The performance summary records this result.";
  }
  s.feedback = { ...s.feedback, [step]: { tone: graded.ok ? "ok" : "review", title: graded.title, body: graded.body } };
  s.atlas.results = { ...(s.atlas.results || {}), [step]: graded.ok };
  if (step === "find") {
    const targets = teachingKaryotype(activeCase(s.atlas))?.chromosomes_to_find || [];
    s.scores.chromosome_identification = {
      mode: "affected",
      ok: graded.ok,
      detail: targets.join(", "),
      identityCorrect: graded.ok ? targets.length : 0,
      totalChromosomes: targets.length,
      wrongGroup: 0,
      wrongNumber: graded.ok ? 0 : 1,
    };
  }
  if (step === "inspect") {
    if (action === "atlas-check" || !s.scores.change_identification) {
      s.attempts.abnormality = (s.attempts.abnormality || 0) + 1;
    }
    s.scores.change_identification = { ok: graded.ok };
  }
  if (submit && graded.ok) {
    s.stepIndex = Math.min(s.stepIndex + 1, s.steps.length - 1);
  }
  return true;
}

function gradeStep(step) {
  const atlas = state.session.atlas;
  if (step === "find") return gradeFind(atlas);
  if (step === "inspect") return gradeInspect(atlas);
  if (step === "identify") return gradeIdentify(atlas, state.diseases);
  if (step === "interpret") return gradeInterpret(atlas);
  return null;
}

function toggleFound(slot) {
  if (!slot) return;
  const atlas = state.session.atlas;
  const found = new Set(atlas.found || []);
  if (found.has(slot)) found.delete(slot);
  else found.add(slot);
  atlas.found = [...found];
}

export function atlasFindSlots() {
  const s = state.session;
  return (s?.module === "atlas" || s?.module === "disease") && s.steps[s.stepIndex] === "find";
}

export function atlasSlotPicked(slot) {
  return (state.session?.atlas?.found || []).includes(slot);
}

export function markAtlasKaryotype(ok) {
  const atlas = state.session?.atlas;
  if (!atlas) return;
  atlas.results = { ...(atlas.results || {}), karyotype: ok };
}
