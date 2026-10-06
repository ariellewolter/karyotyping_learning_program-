import { state } from "./store.js?v=20261006j";
import { SLOT_IDS, escapeHtml } from "./util.js?v=20261006j";
import { renderChromosome } from "./chromosomes.js?v=20261006j";
import { ideogramSVG } from "./ideogram.js?v=20261006j";
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
  labDiseases,
  labReady,
  notationChoices,
  optionLabel,
  teachingKaryotype,
} from "./atlas.js?v=20261006j";

const LAB_STEPS = ["find", "inspect", "identify", "interpret"];

export function isAtlasLabStep(step) {
  return LAB_STEPS.includes(step);
}

export function atlasBrowse(route) {
  if (route.view === "chromosome") return chromosomePage(route.chromosome);
  if (route.view === "disease") return diseasePage(route.diseaseId);
  return atlasHome();
}

function atlasHome() {
  const library = state.diseases;
  const diseases = diseaseList(library);
  return `
    <main class="atlas">
      <p class="crumb"><a href="#/">Home</a> / Atlas</p>
      <header class="lab-head">
        <p class="eyebrow">Chromosome reference and disease library</p>
        <h2>Atlas</h2>
        <p class="lede">Atlas is the disease reference. Opening a case starts the same laboratory used from Cases and from the method pages.</p>
      </header>
      <div class="atlas-actions">
        <button type="button" class="btn primary" id="atlas-assign">Work an assigned disease</button>
        <p class="muted">An assigned case hides the disease name and the canonical finding until you connect them.</p>
      </div>
      <h3>Chromosomes</h3>
      <div class="chr-index" aria-label="Chromosomes">
        ${SLOT_IDS.map((id) => {
          const n = diseasesForChromosome(library, id).length;
          return `<a class="chr-key" href="#/atlas/chromosome/${id}"><strong>${id}</strong><span>${n ? `${n} disease${n === 1 ? "" : "s"}` : "—"}</span></a>`;
        }).join("")}
      </div>
      <h3>Teaching cases</h3>
      <ul class="case-list">
        ${diseaseRows(labDiseases(library))}
      </ul>
      <h3>Other atlas records</h3>
      <ul class="case-list">
        ${diseaseRows(diseases.filter((d) => !labReady(d)))}
      </ul>
    </main>`;
}

function chromosomePage(chromosome) {
  const id = String(chromosome || "1");
  const template = state.templates?.chromosomes?.[id];
  const map = state.maps?.chromosomes?.[id];
  const diseases = diseasesForChromosome(state.diseases, id);
  if (!template && !map) {
    return `<main class="atlas"><p class="crumb"><a href="#/atlas">Atlas</a></p><h2>Unknown chromosome</h2></main>`;
  }
  const bands = (map?.segments || []).filter((seg) => seg.role === "band");
  const pBands = bands.filter((seg) => seg.arm === "p").map((seg) => seg.label);
  const qBands = bands.filter((seg) => seg.arm === "q").map((seg) => seg.label);
  const picture = map
    ? ideogramSVG(map.segments, { width: 160, height: 460, showLabels: true })
    : renderChromosome({ id: `atlas-ref-${id}`, identity: id, variant: "normal", template }, { scale: 1.8 });
  return `
    <main class="atlas">
      <p class="crumb"><a href="#/">Home</a> / <a href="#/atlas">Atlas</a> / Chromosome ${escapeHtml(id)}</p>
      <div class="atlas-chrom">
        <div class="ideo-column">
          ${picture}
          <p class="ideo-caption">Demonstration ideogram, pter at the top.</p>
        </div>
        <div>
          <h2>Chromosome ${escapeHtml(id)}</h2>
          <ul class="comp-list">
            <li>Morphology: ${escapeHtml(template?.morphology || map?.morphology || "not recorded")}</li>
            <li>Short arm (p) is above the centromere. Long arm (q) is below it.</li>
            <li>Centromere: primary constriction. Band numbers increase from the centromere toward each telomere.</li>
          </ul>
          ${bands.length ? `
            <p><strong>p arm bands in this map.</strong> ${escapeHtml(pBands.join(", ") || "none")}</p>
            <p><strong>q arm bands in this map.</strong> ${escapeHtml(qBands.join(", ") || "none")}</p>
          ` : `<p class="muted">This chromosome has a schematic drawing. A band-by-band map is not in the teaching library yet.</p>`}
          <h3>Diseases on this chromosome</h3>
          <ul class="case-list">
            ${diseases.map((d) => `
              <li><a class="case-row" href="#/atlas/disease/${d.id}"><span class="case-title">${escapeHtml(d.disease_name)}</span><span class="muted">${escapeHtml(casesTouching(d, id).join("; "))}</span></a></li>
            `).join("") || "<li class='muted'>No teaching disease in the library is centered here.</li>"}
          </ul>
        </div>
      </div>
    </main>`;
}

function diseasePage(diseaseId) {
  const disease = diseaseById(state.diseases, diseaseId);
  if (!disease) {
    return `<main class="atlas"><p class="crumb"><a href="#/atlas">Atlas</a></p><h2>Unknown disease</h2><p><a href="#/atlas">Return to the atlas</a></p></main>`;
  }
  const ready = labReady(disease);
  const canonical = canonicalCase(disease);
  return `
    <main class="atlas atlas-disease">
      <p class="crumb"><a href="#/">Home</a> / <a href="#/atlas">Atlas</a> / ${escapeHtml(disease.disease_name)}</p>
      <h2>${escapeHtml(disease.disease_name)}</h2>
      <p class="lede">${escapeHtml(disease.teaching_notes || "This disease has more than one cytogenetic case. The simple lab uses the canonical case only.")}</p>
      ${ready ? `
        <div class="controls">
          <a class="btn primary" href="#/disease/${disease.id}">Open case laboratory</a>
          <a class="btn" href="#/disease/${disease.id}/assigned">Open as an assigned case</a>
        </div>
        <p class="muted">The laboratory uses ${escapeHtml(canonical?.case_title || "the canonical teaching case")}. Other mechanisms on this page stay reference material.</p>
      ` : `<p class="muted">The canonical case is not a simple karyotype exercise. The other mechanisms are listed so they are not mistaken for that exercise.</p>`}
      ${referenceList(disease)}
      <div class="atlas-chrom">
        <div class="disease-art">${diseaseArt(disease)}</div>
        <div class="case-stack">
          ${cytogeneticCases(disease).map((item) => caseCard(item)).join("")}
        </div>
      </div>
    </main>`;
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
      ${notations.length ? `<p class="iscn-display">${notations.map((n) => escapeHtml(n)).join(" / ")}</p>` : ""}
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

function diseaseRows(list) {
  return list.map((d) => `
    <li>
      <a class="case-row" href="#/atlas/disease/${d.id}">
        <span class="case-title">${escapeHtml(d.disease_name)}</span>
        <span class="muted">${escapeHtml(visibilityShort(d))}</span>
      </a>
    </li>`).join("");
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
  if (item?.lab_level === "default" && item?.karyotype_visibility === "size_dependent") return "Size-dependent lab";
  if (item?.lab_level === "default") return "Canonical lab";
  if (item?.karyotype_visibility === "potentially_visible") return "Sometimes visible";
  return "Not a simple karyotype";
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
  const assessment = s.instructionMode === "assessment";
  if (assessment && !submit) {
    s.feedback = { ...s.feedback, [step]: { tone: "review", title: "Submit to record this response.", body: "Assessment does not explain the answer during the activity." } };
    return true;
  }
  if (assessment && submit) {
    s.pedagogy = s.pedagogy || { hintLevel: {}, first: {} };
    if (!s.pedagogy.first[step]) s.pedagogy.first[step] = { ok: graded.ok, title: graded.title, body: graded.body };
    s.feedback = { ...s.feedback, [step]: { tone: "ok", title: "Response recorded.", body: "The explanation is withheld until the summary." } };
  } else {
    s.feedback = { ...s.feedback, [step]: { tone: graded.ok ? "ok" : "review", title: graded.title, body: graded.body } };
  }
  s.atlas.results = { ...(s.atlas.results || {}), [step]: assessment && s.pedagogy?.first?.[step] ? s.pedagogy.first[step].ok : graded.ok };
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
  if (step === "inspect") s.scores.change_identification = { ok: graded.ok };
  if (submit && (graded.ok || assessment)) {
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
