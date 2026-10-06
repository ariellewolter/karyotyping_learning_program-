import { state, patch, patchSession, newSession } from "./store.js?v=20261006j";
import {
  $,
  $$,
  ABNORMALITY_TYPES,
  ARM_OPTIONS,
  CATEGORIES,
  CHROM_WITH_NONE,
  BAND_DESIGNATIONS,
  COUNT_OPTIONS,
  GROUPS,
  NUMERICAL_OPTIONS,
  SEX_OPTIONS,
  SLOT_IDS,
  STRUCTURAL_OPTIONS,
  escapeHtml,
  go,
  joinPair,
  parseHash,
  seedFrom,
  selectField,
  shuffle,
  splitPair,
} from "./util.js?v=20261006j";
import { casesForExercise, exerciseById, labById, labPath, LABS, mapLegacyModule, sessionModuleFor } from "./labs.js?v=20261006j";
import { hydrateCase, loadCase } from "./cases.js?v=20261006j";
import { metaphaseLayout, renderChromosome } from "./chromosomes.js?v=20261006j";
import { allAssigned, canAdvanceGroup, currentStep, gradeKaryotype, karyotypeFeedback, moveChromosome, poolForCurrentStep, resetCurrentGroup, resetKaryotype, unplacedForStep } from "./karyotype.js";
import { compareISCN, iscnComponentLabels } from "./iscn.js";
import { attemptSummary, summarizeSession } from "./scoring.js";
import { initAssembly } from "./banding.js?v=20261006j";
import { assemblyControls, assemblyView, dropPiece, handleAssemblyAction, isAssemblyStep, readAssemblyFields, selectPiece } from "./assembly-ui.js?v=20261006j";
import { clickFishBand, clickFishCanvas, fishControls, fishView, handleFishAction, isFishStep, readFishFields } from "./fish-ui.js?v=20261006j";
import { canonicalCase, diseaseById, diseaseCase, labDiseases, teachingKaryotype } from "./atlas.js?v=20261006j";
import { atlasBrowse, atlasControls, atlasFindSlots, atlasLabBody, atlasSlotPicked, atlasSummary, handleAtlasAction, isAtlasLabStep, markAtlasKaryotype, readAtlasFields } from "./atlas-ui.js?v=20261006j";
import { CASE_ALIASES, METHOD_FAMILIES, SKILL_PRACTICE, buildDiseaseCase, caseSubtitle, caseTeaching, diseaseMenuPath, diseasesForMethod, familyActivities, isStudentCatalogCase, planActivity } from "./activities.js?v=20261006j";
import { applyMode, applyStep, hintFor, instructionSteps, isTeachStep, lessonFor, modeLabel } from "./pedagogy.js?v=20261006j";

export function render() {
  try {
    paint();
  } catch (err) {
    const app = document.getElementById("app");
    if (app) {
      app.innerHTML = `<main class="panel error-panel"><h1>Display error</h1><p>${escapeHtml(err.message || String(err))}</p></main>`;
    }
    console.error(err);
  }
}

function paint() {
  const app = document.getElementById("app");
  if (!app) return;
  if (state.loadError) {
    app.innerHTML = shell(`<main class="panel error-panel"><h1>Unable to load laboratory data</h1><p>${escapeHtml(state.loadError)}</p><p>Serve this folder over HTTP so the case JSON files can be read. Example: <code>python3 -m http.server 8765</code></p></main>`);
    bindChrome();
    bindHomeEvents();
    return;
  }
  if (!state.catalog || !state.templates || !state.maps || !state.probes || !state.diseases || !state.activityLinks) {
    app.innerHTML = shell(`<main class="panel"><p class="muted">Loading case catalog…</p></main>`);
    bindChrome();
    bindHomeEvents();
    return;
  }
  const route = state.route || parseHash();
  if (route.name === "instructor") app.innerHTML = shell(instructorView());
  else if (route.name === "reference") app.innerHTML = shell(referenceView());
  else if (route.name === "help") app.innerHTML = shell(helpView());
  else if (route.name === "cases") app.innerHTML = shell(allCasesView());
  else if (route.name === "disease" && route.diseaseId) app.innerHTML = shell(diseaseBoard(route));
  else if (route.name === "disease-activity" && route.diseaseId && route.activity) {
    const ready = state.session?.module === "disease"
      && state.session.atlas?.disease?.id === route.diseaseId
      && state.session.exercise === route.activity
      && state.session.atlas?.mode === route.mode;
    ensureDisease(route).then(() => {
      const node = document.getElementById("app");
      if (!node) return;
      node.innerHTML = shell(workspaceView());
      bindChrome();
      bindWorkspace();
    }).catch((err) => {
      document.getElementById("app").innerHTML = shell(assignmentPanel("Unable to open this case", err.message || String(err), route));
      bindChrome();
    });
    app.innerHTML = shell(ready ? workspaceView() : assignmentPanel("", "Preparing the case…", route));
  }
  else if (route.name === "lab" && route.caseId && !route.instruction) app.innerHTML = shell(skillModePicker(route));
  else if ((route.name === "lab" || route.name === "module") && (route.caseId)) {
    const sessionModule = route.name === "module"
      ? route.module
      : sessionModuleFor(route.lab, route.exercise, state.catalog.cases.find((c) => c.case_id === route.caseId));
    ensureSession(sessionModule, route.caseId, { lab: route.lab, exercise: route.exercise, instruction: route.instruction || null }).then(() => {
      document.getElementById("app").innerHTML = shell(workspaceView());
      bindChrome();
      bindWorkspace();
    }).catch((err) => {
      document.getElementById("app").innerHTML = shell(assignmentPanel("Unable to open case", err.message || String(err), route));
      bindChrome();
    });
    if (!state.session || state.session.caseData?.case_id !== route.caseId || state.session.module !== sessionModule || (state.session.instructionMode || null) !== (route.instruction || null)) {
      app.innerHTML = shell(assignmentPanel("", "Loading case…", route));
    } else {
      app.innerHTML = shell(workspaceView());
    }
  } else if (route.name === "atlas") app.innerHTML = shell(atlasBrowse(route));
  else if (route.name === "atlas-lab" && route.diseaseId) {
    go(diseaseMenuPath(route.diseaseId, { mode: route.mode }));
    return;
  } else if (route.name === "lab" && !route.caseId && !route.exercise) app.innerHTML = shell(labLanding(route.lab));
  else if (route.name === "lab" && !route.caseId) app.innerHTML = shell(skillExerciseView(route.lab, route.exercise));
  else if (route.name === "module") {
    const mapped = mapLegacyModule(route.module);
    go(labPath(mapped.lab, mapped.exercise));
    return;
  } else if (route.name === "case" && route.caseId) {
    const alias = CASE_ALIASES[route.caseId];
    go(alias ? `#/disease/${alias}` : labPath("karyotype", "integrated", route.caseId));
    return;
  } else app.innerHTML = shell(homeView());
  bindChrome();
  bindHomeEvents();
  if (state.session && (route.caseId || route.name === "atlas-lab" || route.name === "disease-activity")) bindWorkspace();
}

function shell(inner) {
  return `
    <header class="topbar">
      <div class="brand" data-go="#/">
        <span class="brand-mark">CG</span>
        <div>
          <p class="brand-kicker">Evonyx</p>
          <h1>Cytogenetics Laboratory</h1>
        </div>
      </div>
      <nav class="topnav">
        <a href="#/">Home</a>
        <a href="#/atlas">Atlas</a>
        <a href="#/cases">Cases</a>
        <a href="#/reference">References</a>
        <a href="#/help">Help</a>
      </nav>
    </header>
    <p class="disclaimer">Educational use only. This program is not a clinical diagnostic device and does not interpret patient specimens.</p>
    ${inner}
    <footer class="site-foot">
      <span>Educational use only · not for clinical diagnosis.</span>
      <span>Evonyx · Cytogenetics Laboratory · Education · Exploration · Discovery</span>
    </footer>`;
}

function bindChrome() {
  $$(".brand, [data-go]").forEach((el) => {
    el.addEventListener("click", (ev) => {
      const target = el.getAttribute("data-go");
      if (target) {
        ev.preventDefault();
        go(target);
      } else if (el.classList.contains("brand")) {
        go("#/");
      }
    });
  });
}

function homeView() {
  return `
    <main class="home home-labs">
      <section class="lab-hero">
        <p class="eyebrow">Interactive cytogenetics laboratory</p>
        <h2>Explore chromosomes. Build karyotypes. Analyze FISH.</h2>
        <p>Connect cytogenetic morphology to nomenclature and molecular cytogenetics. Enter any laboratory independently — these are workspaces, not a required sequence.</p>
        <p class="lede"><a href="#/cases">Cases</a> opens each disease once, then the activities that disease can support. <a href="#/atlas">Atlas</a> remains the chromosome and disease reference. Skills practice stays in the three laboratories.</p>
        <div class="lab-tri">
          ${LABS.map((lab) => `
            <article class="lab-enter ${lab.tone}" data-go="${labPath(lab.id)}">
              <div class="lab-icon">${labIcon(lab.id)}</div>
              <h3>${escapeHtml(lab.title)}</h3>
              <p>${escapeHtml(lab.summary)}</p>
              <span class="enter-link">Enter →</span>
            </article>`).join("")}
        </div>
      </section>
    </main>`;
}

function studentExerciseCases(labId, exerciseId) {
  return casesForExercise(state.catalog, labId, exerciseId).filter(isStudentCatalogCase);
}

function labLanding(labId) {
  const lab = labById(labId);
  const diseases = diseasesForMethod(state.diseases, state.activityLinks, state.activityPacks, state.maps, lab.id, state.probes);
  const skills = SKILL_PRACTICE[lab.id] || [];
  return `
    <main class="picker">
      <p class="crumb"><a href="#/">Home</a> / ${escapeHtml(lab.title)}</p>
      <header class="lab-head">
        <p class="eyebrow">${escapeHtml(lab.kicker)}</p>
        <h2>${escapeHtml(lab.title)}</h2>
        <p class="lede">${escapeHtml(lab.summary)}</p>
      </header>
      <h3>Clinical cases</h3>
      <ul class="case-list">
        ${diseases.map((disease) => `
          <li>
            <button type="button" class="case-row" data-go="${diseaseMenuPath(disease.id, { focus: lab.id })}">
              <span class="case-title">${escapeHtml(disease.disease_name)}</span>
              <span class="muted">${escapeHtml([caseSubtitle(disease, lab.id, state.activityLinks, state.activityPacks, state.probes), caseTeaching(disease, lab.id, state.activityLinks, state.activityPacks)].filter(Boolean).join(" — "))}</span>
            </button>
          </li>`).join("") || "<li class='muted'>No disease case has this method yet.</li>"}
      </ul>
      <h3>Skills practice</h3>
      <ul class="case-list">
        ${skills.map((skill) => `
          <li>
            <button type="button" class="case-row" data-go="${skill.href}">
              <span class="case-title">${escapeHtml(skill.title)}</span>
            </button>
          </li>`).join("")}
      </ul>
    </main>`;
}

function skillModePicker(route) {
  const lab = labById(route.lab);
  const exercise = exerciseById(lab, route.exercise);
  const entry = (state.catalog?.cases || []).find((c) => c.case_id === route.caseId);
  return `
    <main class="picker">
      <p class="crumb"><a href="#/">Home</a> / <a href="${labPath(lab.id)}">${escapeHtml(lab.title)}</a> / Skills practice</p>
      <h2>${escapeHtml(entry?.title || exercise?.title || "Skills practice")}</h2>
      <p class="lede">Choose a mode before the exercise starts. Learn teaches the idea, then asks. Practice starts at the question and offers hints. Assessment records the attempt and explains it at the end.</p>
      <p class="skill-links">${["learn", "practice", "assessment"].map((mode) => (
        `<a href="${labPath(lab.id, exercise?.id || route.exercise, route.caseId)}/${mode}">${modeLabel(mode)}</a>`
      )).join("")}</p>
    </main>`;
}

function skillExerciseView(labId, exerciseId) {
  const lab = labById(labId);
  const selected = exerciseById(lab, exerciseId);
  const cases = studentExerciseCases(lab.id, selected?.id);
  return `
    <main class="picker">
      <p class="crumb"><a href="#/">Home</a> / <a href="${labPath(lab.id)}">${escapeHtml(lab.title)}</a> / Skills practice</p>
      <h2>${escapeHtml(selected?.title || "Skills practice")}</h2>
      <p class="lede">${escapeHtml(selected?.summary || "")}</p>
      <ul class="case-list">
        ${cases.map((c) => `
          <li>
            <button type="button" class="case-row" data-go="${labPath(lab.id, selected.id, c.case_id)}">
              <span class="case-title">${escapeHtml(c.title)}</span>
            </button>
          </li>`).join("") || "<li class='muted'>No skills exercise is available here.</li>"}
      </ul>
    </main>`;
}

function labIcon(id) {
  if (id === "fish") {
    return `<svg viewBox="0 0 64 64" width="48" height="48" aria-hidden="true"><circle cx="32" cy="32" r="22" fill="#1a1240"/><circle cx="24" cy="28" r="4" fill="#e24b4b"/><circle cx="38" cy="24" r="4" fill="#3dcc6d"/><circle cx="34" cy="38" r="5" fill="#f2d45c"/></svg>`;
  }
  if (id === "karyotype") {
    return `<svg viewBox="0 0 64 64" width="48" height="48" aria-hidden="true">${[0,1,2,3,4].map((i) => `<rect x="${8 + i * 10}" y="${12 + (i % 2) * 6}" width="7" height="${32 - i}" rx="2" fill="#d8d3e6"/>`).join("")}</svg>`;
  }
  return `<svg viewBox="0 0 64 64" width="48" height="48" aria-hidden="true"><rect x="26" y="8" width="12" height="48" rx="4" fill="#d8d3e6"/><rect x="28" y="28" width="8" height="8" rx="3" fill="#9a90b0"/></svg>`;
}

function allCasesView() {
  const diseases = labDiseases(state.diseases);
  return `
    <main class="picker">
      <p class="crumb"><a href="#/">Home</a> / Cases</p>
      <h2>Disease cases</h2>
      <p class="lede">Each disease is listed once. Open it for every activity that case can run. Skills practice stays inside each laboratory.</p>
      <ul class="case-list">
        ${diseases.map((disease) => `
          <li>
            <button type="button" class="case-row" data-go="${diseaseMenuPath(disease.id)}">
              <span class="case-title">${escapeHtml(disease.disease_name)}</span>
              <span class="muted">${escapeHtml(caseSubtitle(disease, "", state.activityLinks, state.activityPacks))}</span>
            </button>
          </li>`).join("")}
      </ul>
    </main>`;
}

function activityHref(diseaseId, activityId, route, instruction) {
  const focus = route.focus ? `/focus/${route.focus}` : "";
  const assigned = route.mode === "assigned" ? "/assigned" : "";
  return `#/disease/${diseaseId}/${activityId}/${instruction}${focus}${assigned}`;
}

function modeLinks(diseaseId, activityId, route) {
  return ["learn", "practice", "assessment"].map((mode) => (
    `<a href="${activityHref(diseaseId, activityId, route, mode)}">${modeLabel(mode)}</a>`
  )).join("");
}

function diseaseBoard(route) {
  const disease = diseaseById(state.diseases, route.diseaseId);
  const ready = disease && labDiseases(state.diseases).some((item) => item.id === disease.id);
  if (!ready) {
    return `<main class="panel"><h2>Case not available</h2><p>That disease is not one of the canonical teaching cases.</p><p><a class="btn" href="#/cases">Back</a></p></main>`;
  }
  const item = canonicalCase(disease);
  const kt = teachingKaryotype(item);
  const assigned = route.mode === "assigned";
  const setting = item?.kind === "acquired" ? "Acquired cytogenetics" : "Constitutional cytogenetics";
  const args = [disease, state.diseases, state.activityLinks, state.activityPacks, state.maps];
  const focusedFamily = METHOD_FAMILIES.find((family) => family.id === route.focus);
  const families = focusedFamily
    ? [focusedFamily]
    : METHOD_FAMILIES.filter((family) => family.id !== "integrated");
  const back = route.focus ? labPath(route.focus) : "#/cases";
  const backLabel = route.focus ? (labById(route.focus).title) : "Cases";
  const sections = families.map((family) => {
    const rows = familyActivities(...args, family.id, state.probes);
    if (!rows.length) return "";
    return `
      ${focusedFamily ? "" : `<h3>${escapeHtml(family.title)}</h3>`}
      <ul class="case-list">
        ${rows.map((row) => `
          <li class="case-skill">
            <span class="case-title">${escapeHtml(family.id === "fish" && row.id === "fish" ? (caseSubtitle(disease, "fish", state.activityLinks, state.activityPacks) || row.label) : row.label)}</span>
            <span class="skill-links">${modeLinks(disease.id, row.id, route)}</span>
          </li>`).join("")}
      </ul>`;
  }).join("");
  return `
    <main class="picker">
      <p class="crumb"><a href="#/">Home</a> / <a href="${back}">${escapeHtml(backLabel)}</a> / ${escapeHtml(assigned ? "Assigned case" : disease.disease_name)}</p>
      <h2>${escapeHtml(assigned ? "Assigned case" : disease.disease_name)}</h2>
      <p class="lede">${escapeHtml(assigned ? `${setting}. The condition is not named until interpretation.` : (item?.patient_case_label || ""))}</p>
      ${assigned ? "" : `<p><span class="pill">${escapeHtml(kt?.iscn || "")}</span></p>`}
      <h3>Complete case</h3>
      <p>Integrated case. This sequence can move across karyotype, chromosome analysis, and FISH when this disease has those activities.</p>
      <p class="skill-links">${modeLinks(disease.id, "complete", route)}</p>
      <h3>${focusedFamily ? escapeHtml(focusedFamily.title) : "Practice individual skills"}</h3>
      ${sections || "<p class='muted'>No activity has the data this case needs.</p>"}
      ${assigned ? "" : `<p><a class="btn" href="${diseaseMenuPath(disease.id, { focus: route.focus, mode: "assigned" })}">Open as an assigned case</a></p>`}
    </main>`;
}

function helpView() {
  return `
    <main class="reference">
      <h2>Using this laboratory</h2>
      <p>Each laboratory opens with clinical cases first. Skills practice is listed under those cases.</p>
      <ul>
        <li><strong>Chromosome Analysis</strong> — drag G-band segments to build one chromosome; anatomy and banding stay on that map.</li>
        <li><strong>Karyotype &amp; ISCN</strong> — whole-cell arrangement, chromosome identification, abnormality class, nomenclature, and disease association.</li>
        <li><strong>FISH Analysis</strong> — probe location and fluorescent signal patterns.</li>
      </ul>
      <p>Learn teaches the decision, then asks for it. Practice starts at the question and offers one hint at a time. Assessment records the response and explains it on the summary.</p>
      <p><a href="#/cases">Cases</a> and the <a href="#/atlas">Atlas</a> open a disease with every method that disease can run. Opening that same disease from a laboratory shows only that laboratory's activities. Complete case stays the integrated sequence.</p>
      <p><a href="#/atlas">Atlas</a> lists chromosomes and teaching diseases, including mechanisms that are reference information rather than a playable lab.</p>
      <p>Educational use only. This program is not a clinical diagnostic device.</p>
      <p><a href="#/instructor">Development / instructor preview</a></p>
    </main>`;
}

async function ensureSession(moduleId, caseId, loc = {}) {
  const instruction = loc.instruction || null;
  if (
    state.session?.caseData?.case_id === caseId
    && state.session?.module === moduleId
    && (!loc.exercise || state.session.exercise === loc.exercise)
    && (state.session.instructionMode || null) === instruction
  ) return;
  const loaded = await loadCase(caseId, state.catalog);
  const hydrated = hydrateCase(loaded, state.templates);
  const integrated = moduleId === "integrated";
  const session = newSession({
    caseData: hydrated,
    chromosomes: hydrated.chromosomes,
    module: moduleId,
    integrated,
    maps: state.maps,
    probes: state.probes,
    exercise: loc.exercise,
  });
  session.lab = loc.lab || mapLegacyModule(moduleId).lab;
  session.exercise = loc.exercise || mapLegacyModule(moduleId).exercise;
  if (instruction) {
    const body = session.steps.filter((step) => step !== "summary");
    const taught = instructionSteps(body, null, instruction, session.exercise);
    session.steps = [...taught.steps, "summary"];
    session.stepTitles = { ...(session.stepTitles || {}), ...taught.titles };
    session.instructionMode = instruction;
    session.pedagogy = { hintLevel: {}, first: {} };
    session.strictAdvance = true;
    session.returnHref = labPath(session.lab, session.exercise, caseId);
  }
  applyKaryotypeScaffold(session);
  if (moduleId !== "karyotype" && !integrated && hydrated.chromosomes.length) {
    session.karyotype = autoPlace(hydrated.chromosomes);
  }
  if (integrated) session.karyotype.pool = shuffle(session.karyotype.pool, seedFrom(caseId + "-int"));
  patch({ session });
}

async function ensureAtlas(route) {
  const disease = diseaseById(state.diseases, route.diseaseId);
  if (!disease) throw new Error("That disease is not in the atlas.");
  if (!labDiseases(state.diseases).some((d) => d.id === disease.id)) {
    throw new Error("This disease is in the atlas, but its record says a conventional karyotype does not reliably show the finding. The build-a-karyotype lab uses clearly visible teaching karyotypes only.");
  }
  await Promise.resolve();
  if (
    state.session?.module === "atlas"
    && state.session.atlas?.disease?.id === disease.id
    && state.session.atlas?.mode === route.mode
  ) return;
  const hydrated = hydrateCase(diseaseCase(disease), state.templates);
  const session = newSession({
    caseData: hydrated,
    chromosomes: hydrated.chromosomes,
    module: "atlas",
    maps: state.maps,
    probes: state.probes,
    exercise: route.mode,
    atlas: {
      disease,
      cytogeneticCase: canonicalCase(disease),
      mode: route.mode,
      found: [],
      change: "",
      place: "",
      identify: "",
      notation: "",
      results: {},
    },
  });
  session.lab = "atlas";
  session.exercise = route.mode;
  patch({ session });
}

async function ensureDisease(route) {
  const disease = diseaseById(state.diseases, route.diseaseId);
  if (!disease) throw new Error("That disease is not in the atlas.");
  if (!labDiseases(state.diseases).some((item) => item.id === disease.id)) {
    throw new Error("This record is reference material. It is not one of the canonical teaching cases.");
  }
  const instruction = route.instruction || "learn";
  const plan = planActivity(route.activity, disease, state.activityLinks, state.activityPacks);
  const taught = instructionSteps(plan.steps, disease, instruction);
  plan.steps = taught.steps.filter((step) => instruction === "learn" || step !== "fish_demo");
  plan.stepTitles = { ...(plan.stepTitles || {}), ...taught.titles };
  const menu = diseaseMenuPath(disease.id, { focus: route.focus, mode: route.mode });
  if (
    state.session?.module === "disease"
    && state.session.atlas?.disease?.id === disease.id
    && state.session.exercise === route.activity
    && state.session.atlas?.mode === route.mode
    && state.session.instructionMode === instruction
  ) {
    state.session.returnHref = menu;
    return;
  }
  const built = buildDiseaseCase(disease, state.diseases, plan, route.mode);
  const hydrated = hydrateCase(built, state.templates);
  const session = newSession({
    caseData: hydrated,
    chromosomes: hydrated.chromosomes,
    module: "disease",
    maps: state.maps,
    probes: state.probes,
    exercise: route.activity,
    atlas: {
      disease,
      cytogeneticCase: canonicalCase(disease),
      mode: route.mode,
      found: [],
      change: "",
      place: "",
      identify: "",
      notation: "",
      results: {},
    },
  });
  session.lab = "disease";
  session.exercise = route.activity;
  session.stepTitles = hydrated.stepTitles || {};
  session.stepAssembly = hydrated.stepAssembly || {};
  session.instructionMode = instruction;
  session.pedagogy = { hintLevel: {}, first: {} };
  session.returnHref = menu;
  if (plan.autoPlace && hydrated.chromosomes.length) session.karyotype = autoPlace(hydrated.chromosomes);
  else applyKaryotypeScaffold(session);
  patch({ session });
}

function applyKaryotypeScaffold(session) {
  if (!session?.instructionMode || !session.chromosomes?.length) return;
  if (!(session.steps || []).includes("karyotype")) return;
  if (session.instructionMode === "assessment") {
    session.karyotype = resetKaryotype(session.chromosomes, { sheet: true });
  } else if (session.instructionMode === "practice") {
    session.karyotype = resetKaryotype(session.chromosomes, { trayScope: "all" });
  }
}

function sessionHref(s, caseId) {
  return labPath(s.lab || mapLegacyModule(s.module).lab, s.exercise || mapLegacyModule(s.module).exercise, caseId);
}

function workspaceCrumb(s) {
  if (s.module === "disease") {
    const href = s.returnHref || "#/cases";
    const label = s.atlas?.mode === "assigned" ? "Assigned case" : escapeHtml(s.atlas?.disease?.disease_name || "Case");
    return `<p class="crumb"><a href="#/">Home</a> / <a href="#/cases">Cases</a> / <a href="${href}">${label}</a></p>`;
  }
  if (s.module === "atlas") {
    const label = s.atlas?.mode === "assigned" ? "Assigned lab" : escapeHtml(s.atlas?.disease?.disease_name || "Lab");
    return `<p class="crumb"><a href="#/">Home</a> / <a href="#/atlas">Atlas</a> / ${label}</p>`;
  }
  const mapped = { lab: s.lab || mapLegacyModule(s.module).lab, exercise: s.exercise || mapLegacyModule(s.module).exercise };
  const lab = labById(mapped.lab);
  const ex = exerciseById(lab, mapped.exercise);
  return `<p class="crumb"><a href="#/">Home</a> / <a href="${labPath(lab.id)}">${escapeHtml(lab.title)}</a> / <a href="${labPath(lab.id, ex.id)}">${escapeHtml(ex.title)}</a></p>`;
}

function flowBar(s) {
  if (s.module === "atlas") {
    const labels = {
      karyotype: "Build karyotype",
      find: "Find the problem",
      inspect: "Inspect the chromosome",
      identify: "Identify the change",
      interpret: "Interpret",
    };
    const steps = s.steps.filter((st) => st !== "summary");
    const current = s.steps[s.stepIndex];
    const idx = current === "summary" ? steps.length : steps.indexOf(current);
    return `<ol class="flow-bar">${steps.map((st, i) => `<li class="${i === idx ? "on" : ""} ${idx > i ? "done" : ""}"><span>${i + 1}</span>${labels[st] || st}</li>`).join("")}</ol>`;
  }
  const stages = [
    { id: "clinical", label: "Clinical information", match: () => true },
    { id: "microscopy", label: "Microscopy", match: (st) => st === "metaphase" },
    { id: "karyotype", label: "Karyotype", match: (st) => st === "karyotype" },
    { id: "fish", label: "FISH", match: isFishStep },
    { id: "iscn", label: "ISCN", match: (st) => st === "iscn_construction" || st === "iscn_interpretation" },
    { id: "interpretation", label: "Interpretation", match: (st) => st === "disease" || st === "narrative" || st === "summary" },
  ];
  const present = stages.filter((st) => st.id === "clinical" || s.steps.some(st.match));
  if (s.module === "assembly" && !s.integrated) return "";
  if (present.length < 3 && !s.integrated) return "";
  const current = s.steps[s.stepIndex];
  let active = 0;
  present.forEach((st, i) => { if (st.match(current)) active = i; });
  return `<ol class="flow-bar">${present.map((st, i) => `<li class="${i === active ? "on" : ""} ${i < active ? "done" : ""}"><span>${i + 1}</span>${escapeHtml(st.label)}</li>`).join("")}</ol>`;
}

function autoPlace(chromosomes) {
  const kt = resetKaryotype(chromosomes);
  kt.pool = [];
  for (const chr of chromosomes) {
    kt.slots[chr.identity] = [...(kt.slots[chr.identity] || []), chr.id];
  }
  return kt;
}

function workspaceView() {
  const s = state.session;
  if (!s) return `<main class="panel"><p>Session not ready.</p></main>`;
  const step = s.steps[s.stepIndex] || "summary";
  const skillTeach = isTeachStep(step) && s.module !== "disease";
  const c = s.caseData;
  const hideDx = s.integrated && step !== "summary";
  const anatomyEx = s.exercise === "anatomy" || step === "anatomy";
  const chr = s.assembly?.spec?.chromosome;
  const atlasLab = s.module === "atlas";
  const diseaseLab = s.module === "disease";
  const assigned = diseaseLab && s.atlas?.mode === "assigned";
  const revealDiseaseName = !assigned || ["interpret", "iscn_interpretation", "iscn_construction", "disease", "narrative", "summary"].includes(step);
  const workspaceTitle = atlasLab
    ? (s.atlas?.mode === "assigned" ? "Assigned case" : (s.atlas?.disease?.disease_name || "Case"))
    : (diseaseLab
      ? (revealDiseaseName ? (s.atlas?.disease?.disease_name || c.title) : "Assigned case")
      : (anatomyEx && chr
        ? `Chromosome ${chr}`
        : (hideDx ? (c.unknown_prompt ? "Unknown case" : c.title) : c.title)));
  const about = atlasLab
    ? (s.atlas?.mode === "assigned"
      ? "Build this karyotype, then find what is abnormal. The condition and which mechanism this patient has are named only after the interpretation."
      : (s.atlas?.cytogeneticCase?.patient_case_label || "Build the canonical teaching karyotype for the disease you chose."))
    : (anatomyEx
      ? "Identify pter, p arm, centromere, q arm, and qter. If this map differs from a normal homolog, classify the rearrangement and where it occurs. Numbering begins at the centromere and increases toward each telomere."
      : (s.integrated ? (c.unknown_prompt || c.clinical_history) : c.clinical_history || "No history provided."));
  const demo = c.placeholder_assets !== false || s.chromosomes.some((ch) => ch.placeholder) || c.fish?.synthetic_images;
  return `
    <main class="workspace${s.module === "assembly" || isAssemblyStep(step) ? " assembly-focus" : ""}">
      <aside class="case-rail">
        ${workspaceCrumb(s)}
        <h2>${escapeHtml(workspaceTitle)}</h2>
        ${c.case_type ? `<p><span class="pill">${escapeHtml(c.case_type)}</span></p>` : ""}
        ${demo ? `<p class="asset-banner">${c.fish?.synthetic_images ? "Synthetic demonstration fluorescence and schematic chromosomes — not authentic clinical specimens." : "Demonstration chromosome graphics — schematic G-band drawings, not authentic clinical specimens."}</p>` : ""}
        <section>
          <h3>${s.module === "assembly" ? "About this exercise" : s.module === "atlas" ? "This lab" : "Clinical history"}</h3>
          <p>${escapeHtml(about)}</p>
        </section>
        ${s.module === "assembly" && s.steps.filter((st) => st !== "summary").length <= 1 ? "" : `<ol class="stepper">
          ${s.steps.map((st, i) => `<li class="${i === s.stepIndex ? "active" : ""} ${i < s.stepIndex ? "done" : ""}">${escapeHtml(stepLabel(st))}</li>`).join("")}
        </ol>`}
      </aside>
      <section class="stage">
        ${flowBar(s)}
        ${step === "metaphase" ? metaphaseView() : ""}
        ${(isAssemblyStep(step) || (skillTeach && isAssemblyStep(applyStep(step)))) ? assemblyView(step) : ""}
        ${(isFishStep(step) || (skillTeach && isFishStep(applyStep(step)))) ? fishView(step) : ""}
        ${!isTeachStep(step) && showKaryotypeSheet(s, step) ? karyotypeBoard(step === "karyotype") : ""}
        ${step === "summary" ? "" : responsePanel(step)}
        ${step === "summary" ? (s.module === "atlas" ? atlasSummary() : summaryView()) : ""}
      </section>
    </main>`;
}

function fishOnlySession(s) {
  const steps = (s.steps || []).filter((st) => st !== "summary");
  return steps.length > 0 && steps.every((st) => isFishStep(st));
}

function showKaryotypeSheet(s, step) {
  if (!s.chromosomes?.length || s.module === "assembly") return false;
  if (s.module === "fish" || s.exercise === "fish" || fishOnlySession(s)) return false;
  if (isFishStep(step) || isAssemblyStep(step) || step === "unavailable") return false;
  if (s.module === "atlas") return step === "karyotype" || step === "find";
  if (s.module === "disease") return ["karyotype", "find", "inspect", "abnormality", "iscn_construction", "iscn_interpretation", "disease", "narrative", "summary"].includes(step);
  return ["karyotype", "abnormality", "iscn_construction", "iscn_interpretation", "disease", "narrative"].includes(step) || step === "summary";
}

function groupFlagged(name, grade) {
  if (!grade) return false;
  if (name === "Sex") return grade.groupErrors.includes("C") || grade.groupErrors.includes("G") || grade.withinGroupErrors.includes("C") || grade.withinGroupErrors.includes("G");
  return grade.groupErrors.includes(name) || grade.withinGroupErrors.includes(name);
}

function stepLabel(step) {
  const custom = state.session?.stepTitles?.[step];
  if (custom) return custom;
  const base = String(step || "").replace(/_\d+$/, "");
  return {
    fish_demo: "Synthetic demonstration",
    probe_locus: "Probe localization",
    probe_type: "Probe type",
    probe_strategy: "Probe strategy",
    fish_scope: "FISH microscopy",
    fish_interpret: "FISH interpretation",
    metaphase: "Inspect metaphase",
    nomenclature: "Band nomenclature",
    assemble: "Assemble chromosome",
    anatomy: "Chromosome anatomy",
    comparison: "Structural comparison",
    karyotype: "Build karyotype",
    find: "Find the problem",
    inspect: "Inspect the chromosome",
    identify: "Identify the change",
    interpret: "Interpret",
    abnormality: "Identify abnormality",
    iscn_construction: "Construct ISCN",
    iscn_interpretation: "Interpret ISCN",
    disease: "Disease association",
    narrative: "Written interpretation",
    summary: "Case summary",
    unavailable: "Unavailable",
  }[base] || step;
}

function chrById(id) {
  return state.session.chromosomes.find((c) => c.id === id);
}

const ACTIVE_SCALE = 2.05;
const DONE_SCALE = 0.5;

function tokenHTML(id, interactive, scale = 1) {
  const chr = chrById(id);
  if (!chr) return "";
  const selected = state.session.karyotype.selectedId === id ? " selected" : "";
  return `<div class="chr-token${selected}${interactive ? " interactive" : ""}" draggable="${interactive ? "true" : "false"}" data-id="${id}" tabindex="${interactive ? 0 : -1}" role="img" aria-label="Demonstration chromosome">
    ${renderChromosome(chr, { scale, hideIdentity: true })}
  </div>`;
}

function metaphaseView() {
  const layout = metaphaseLayout(state.session.chromosomes);
  return `<div class="metaphase-wrap">
    <div class="metaphase-stage" aria-label="Demonstration metaphase spread">
      ${layout.map((chr) => `<div class="meta-chr" style="left:${chr.x}px;top:${chr.y}px;transform:rotate(${chr.rot}deg)">${renderChromosome(chr)}</div>`).join("")}
    </div>
    <p class="muted">Scattered demonstration chromosomes. Begin karyotype construction when you are ready to classify by morphology.</p>
  </div>`;
}

function presentSlots(ids) {
  const present = new Set(state.session.chromosomes.map((c) => String(c.identity)));
  return ids.filter((id) => present.has(id));
}

function openSheet(kt) {
  return kt?.steps?.length === 1 && kt.steps[0]?.id === "sheet";
}

function karyotypeBoard(interactive) {
  const kt = state.session.karyotype;
  const chromosomes = state.session.chromosomes;
  const grade = kt.lastGrade;
  const assessment = state.session.instructionMode === "assessment";
  const highlightSlots = !assessment && grade && !grade.perfect && kt.checkAttempt >= 3;
  const highlightGroups = !assessment && grade && !grade.perfect && kt.checkAttempt === 2;
  const groupBlock = (name, ids, scale, canPlace) => {
    const slots = presentSlots(ids);
    if (!slots.length) return "";
    return `
    <div class="chr-group${highlightGroups && groupFlagged(name, grade) ? " group-flag" : ""}" data-group="${name}">
      <p class="group-label">Group ${escapeHtml(name)}</p>
      <div class="group-slots">
        ${slots.map((slot) => {
          const flagged = highlightSlots && grade?.slotResults?.[slot] && !grade.slotResults[slot].ok;
          const idsIn = kt.slots[slot] || [];
          const finding = atlasFindSlots();
          const picked = finding && atlasSlotPicked(slot);
          return `<div class="slot${flagged ? " slot-flag" : ""}${picked ? " slot-pick" : ""}"${canPlace ? ` data-slot="${slot}"` : ""}${finding ? ` data-action="atlas-pick" data-slot="${slot}"` : ""}>
            <div class="slot-body">${idsIn.map((id) => tokenHTML(id, canPlace, scale)).join("")}</div>
            <p class="slot-num">${slot}</p>
          </div>`;
        }).join("")}
      </div>
    </div>`;
  };
  const fullSheet = sheetMarkup(groupBlock, false);
  if (!interactive) return fullSheet;
  if (kt.reviewing) {
    return `<div>${fullSheet}<p class="muted">Reviewing the current worksheet. Return to group-by-group placement to continue.</p>
      <button type="button" class="btn" data-action="review-kt">Back to groups</button></div>`;
  }

  const steps = kt.steps?.length ? kt.steps : [];
  const step = currentStep(kt, chromosomes);
  if (!step) return `<p class="muted">This case has no chromosome worksheet for group-by-group construction.</p>`;
  const poolIds = poolForCurrentStep(kt, chromosomes);
  const activeIndex = kt.activeStep || 0;
  const tray = `
    <div class="pool" data-slot="pool">
      <p class="group-label">${openSheet(kt) || kt.trayScope === "all" ? "Unassigned chromosomes" : `Unassigned chromosomes · ${escapeHtml(step.title)}`}</p>
      <div class="pool-body">${poolIds.map((id) => tokenHTML(id, true, ACTIVE_SCALE)).join("") || "<p class='muted empty-pool'>All chromosomes for this group have been placed. Continue to the next group.</p>"}</div>
    </div>`;
  if (openSheet(kt)) {
    return `<div class="kt-split">${tray}<div class="kt-work">${sheetMarkup(groupBlock, true)}</div></div>`;
  }
  const groupLeft = unplacedForStep(kt, chromosomes, step).length === 0;
  return `
    <div class="kt-split">
      <nav class="kt-groups" aria-label="Karyotype groups">
        ${steps.map((st, i) => {
          const assigned = unplacedForStep({ ...kt, activeStep: i }, chromosomes, st).length === 0
            && st.slots.some((slot) => (kt.slots[slot] || []).length);
          return `<button type="button" class="kt-group${i === activeIndex ? " on" : ""}${assigned ? " done" : ""}" data-action="group-goto" data-index="${i}">
            <strong>${escapeHtml(st.title)}</strong>
            <span>${escapeHtml(st.subtitle || "")}</span>
          </button>`;
        }).join("")}
        <button type="button" class="kt-group" data-action="review-kt">Review karyotype</button>
      </nav>
      <div class="kt-work">
        ${tray}
        ${kt.trayScope === "all" && groupLeft ? `<p class="muted">Chromosomes that belong in this group are placed. Open the next group when you are ready.</p>` : ""}
        <div class="karyotype-sheet focus-sheet">
          <p class="group-label">Place chromosomes in karyotype</p>
          ${groupBlock(step.id, step.slots, ACTIVE_SCALE, true)}
        </div>
      </div>
    </div>`;
}

function sheetMarkup(groupBlock, canPlace) {
  return `
    <div class="sheet-block">
      <div class="karyotype-sheet">
        <div class="sheet-row">
          ${groupBlock("A", GROUPS.A, 1, canPlace)}
          ${groupBlock("B", GROUPS.B, 1, canPlace)}
          ${groupBlock("C", ["X"], 1, canPlace)}
        </div>
        <div class="sheet-row">
          ${groupBlock("C", GROUPS.C.filter((x) => x !== "X"), 1, canPlace)}
        </div>
        <div class="sheet-row">
          ${groupBlock("D", GROUPS.D, 1, canPlace)}
          ${groupBlock("E", GROUPS.E, 1, canPlace)}
        </div>
        <div class="sheet-row">
          ${groupBlock("F", GROUPS.F, 1, canPlace)}
          ${groupBlock("G", GROUPS.G, 1, canPlace)}
        </div>
      </div>
    </div>`;
}

function responsePanel(step) {
  const fb = state.session.feedback[step];
  return `<div class="response">
    ${controls(step)}
    ${panelBody(step)}
    ${fb ? `<div class="feedback ${fb.tone || "review"}"><strong>${escapeHtml(fb.title || "Feedback")}</strong><p>${escapeHtml(fb.body || "")}</p>${fb.extra || ""}</div>` : ""}
  </div>`;
}

function assignmentExitHref(route) {
  if (route?.name === "disease" || route?.name === "disease-activity") {
    return route.diseaseId ? `#/disease/${route.diseaseId}${route.mode === "assigned" ? "/assigned" : ""}` : "#/cases";
  }
  if (state.session?.module === "disease" && state.session.returnHref) return state.session.returnHref;
  if (state.session?.instructionMode && state.session.returnHref) return state.session.returnHref;
  if (route?.name === "atlas-lab") return "#/atlas";
  if (route?.name === "lab") return labPath(route.lab, route.exercise);
  if (route?.name === "module") {
    const mapped = mapLegacyModule(route.module);
    return labPath(mapped.lab, mapped.exercise);
  }
  if (route?.name === "case") return labPath("karyotype", "integrated");
  const s = state.session;
  if (s?.module === "atlas") return "#/atlas";
  if (s) return labPath(s.lab || mapLegacyModule(s.module).lab, s.exercise || mapLegacyModule(s.module).exercise);
  return "#/";
}

function assignmentPanel(title, message, route) {
  const label = route?.name === "atlas-lab" ? "Back to Atlas" : "Back";
  return `<main class="panel">
    ${title ? `<h2>${escapeHtml(title)}</h2>` : ""}
    <p class="${title ? "" : "muted"}">${escapeHtml(message)}</p>
    <p><a class="btn" href="${assignmentExitHref(route)}">${label}</a></p>
  </main>`;
}

function assignmentBackButton() {
  const s = state.session;
  if (!s) return "";
  if ((s.stepIndex || 0) > 0) return btn("step-back", "Back");
  if (s.module === "atlas") return "";
  return `<button type="button" class="btn" data-go="${assignmentExitHref()}">Back</button>`;
}

function hintButton() {
  if (state.session?.instructionMode === "assessment") return "";
  return btn("hint", "Hint");
}

function controls(step) {
  const back = assignmentBackButton();
  if (isTeachStep(step)) return `<div class="controls">${back}${btn("continue-step", "Continue", "primary")}</div>`;
  if (step === "unavailable") return `<div class="controls">${back}</div>`;
  if (state.session?.module === "atlas" && isAtlasLabStep(step)) return atlasControls(step);
  if (state.session?.module === "disease" && isAtlasLabStep(step)) {
    return `<div class="controls">${back}${btn("atlas-check", "Check")}${hintButton()}${btn("atlas-submit", "Continue", "primary")}</div>`;
  }
  const leaveLabel = state.session?.module === "disease" ? "Back to case" : "Start new case";
  if (isAssemblyStep(step)) {
    return `<div class="controls">${back}${assemblyControls(step)}${btn("new-case", leaveLabel)}</div>`;
  }
  if (isFishStep(step)) {
    return `<div class="controls">${back}${fishControls(step)}${btn("new-case", leaveLabel)}</div>`;
  }
  const buttons = [];
  if (back) buttons.push(back);
  if (step === "metaphase") {
    buttons.push(btn("continue-step", "Begin karyotype construction", "primary"));
  }
  if (step === "karyotype") {
    const s = state.session;
    if (openSheet(s.karyotype)) {
      buttons.push(btn("reset-kt", "Reset karyotype"));
      buttons.push(btn("check-kt", "Check karyotype"));
      buttons.push(hintButton());
      buttons.push(btn("submit-step", "Submit karyotype", "primary"));
    } else {
      const gate = canAdvanceGroup(s.karyotype, s.chromosomes, s.caseData);
      const atStart = (s.karyotype.activeStep || 0) <= 0;
      const atEnd = (s.karyotype.activeStep || 0) >= (s.karyotype.steps?.length || 1) - 1;
      buttons.push(btn("reset-kt", "Reset this group"));
      buttons.push(btn("check-kt", "Check this group"));
      buttons.push(btn("group-prev", "Previous group", atStart ? "disabled" : ""));
      buttons.push(btn("group-next", "Next group", atEnd || !gate.ok ? "disabled" : ""));
      buttons.push(hintButton());
      buttons.push(btn("submit-step", "Submit karyotype", "primary"));
    }
  }
  if (["abnormality", "iscn_construction", "iscn_interpretation", "disease", "narrative"].includes(step)) {
    buttons.push(hintButton());
    buttons.push(btn("check-step", "Check"));
    buttons.push(btn("submit-step", "Submit", "primary"));
  }
  buttons.push(btn("new-case", state.session?.module === "atlas" ? "Back to Atlas" : (state.session?.module === "disease" ? "Back to case" : "Start new case")));
  return `<div class="controls">${buttons.join("")}</div>`;
}

function btn(action, label, kind = "") {
  const disabled = kind.includes("disabled") ? " disabled" : "";
  const cls = kind.replace("disabled", "").trim();
  return `<button type="button" class="btn ${cls}" data-action="${action}"${disabled}>${label}</button>`;
}

function panelBody(step) {
  const s = state.session;
  const c = s.caseData;
  if (isTeachStep(step)) {
    const lesson = lessonFor(s.atlas?.disease, applyStep(step)) || { title: "Before you answer", html: "<p>Read this distinction, then try the next screen.</p>" };
    return `<article class="teach-card"><h3>${escapeHtml(lesson.title)}</h3>${lesson.html}</article>`;
  }
  if (step === "metaphase") return `<p>Inspect morphology before cutting chromosomes into the worksheet. Demonstration graphics are schematic.</p>`;
  if (step === "karyotype") {
    if (openSheet(s.karyotype)) {
      return `<p>Place each chromosome in its numbered position. The A–G rows are the usual layout. The tray is the full set, and it is not sorted into groups. Drag into a numbered position, or click to select and then click a destination.</p>`;
    }
    if (s.instructionMode === "practice") {
      return `<p>The Denver groups stay on the worksheet, and only one group is open. The tray is the full chromosome set, not pre-sorted. Choose the chromosomes that belong in the open group. A hint can remind you what that group looks like.</p>`;
    }
    return `<div>
      <p>Work one Denver/ISCN group at a time. The tray contains only the chromosomes that belong to the active group, in random order and without identity labels. Drag into a numbered position, or click to select and then click a destination.</p>
      <p class="muted">${s.module === "atlas" || s.module === "disease"
        ? "The abnormal chromosome is already drawn into the set. Submit is accepted when every chromosome is in its numbered place."
        : "You may advance after every chromosome in the active tray has been placed; pair numbers do not have to be correct unless the case requires it. Submit the karyotype after all groups to grade the complete arrangement."}</p>
    </div>`;
  }
  if (step === "unavailable") return `<p>This activity is not available. The case does not include the data the step needs, so no empty worksheet is shown.</p>`;
  if ((s.module === "atlas" || s.module === "disease") && isAtlasLabStep(step)) return atlasLabBody(step);
  if (step === "abnormality") {
    const opts = c.abnormality_options || {};
    const cats = opts.categories || CATEGORIES;
    const types = opts.types || ABNORMALITY_TYPES;
    return `<form class="abn-form">
      <fieldset>
        <legend>Category</legend>
        ${cats.map((cat) => radio("category", cat, s.answers.category, labelCategory(cat))).join("")}
      </fieldset>
      <fieldset ${s.answers.category === "normal" ? "disabled" : ""}>
        <legend>Specific classification</legend>
        <p class="muted">Select all that apply. Available options are defined by the case record.</p>
        ${types.map((t) => `<label class="check"><input type="checkbox" name="abn-type" value="${escapeHtml(t)}" ${s.answers.types.includes(t) ? "checked" : ""}/> ${escapeHtml(t)}</label>`).join("")}
      </fieldset>
    </form>`;
  }
  if (step === "iscn_interpretation") {
    const a = s.answers.interpretation;
    const items = c.interpretation_items || {};
    return `<div class="iscn-card">
      <p class="iscn-display">${escapeHtml(c.iscn_prompt || c.expected_iscn)}</p>
      <p class="muted">Identify each component. The complete plain-language interpretation is withheld until you check or submit this step.</p>
      ${selectField("int-count", "Total chromosome number", a.chromosome_count, withChoice(COUNT_OPTIONS, items.chromosome_count))}
      ${selectField("int-sex", "Sex chromosome complement", a.sex_chromosomes, withChoice(SEX_OPTIONS, items.sex_chromosomes))}
      ${selectField("int-num", "Numerical abnormality (or none)", a.numerical, withChoice(NUMERICAL_OPTIONS, items.numerical))}
      ${selectField("int-str", "Structural abnormality (or none)", a.structural, withChoice(STRUCTURAL_OPTIONS, items.structural))}
      <div class="locus-grid">
        ${selectField("int-chr", "Chromosome involved", splitPair(a.chromosomes_involved).first, CHROM_WITH_NONE)}
        ${selectField("int-chr-2", "Second chromosome (if any)", splitPair(a.chromosomes_involved).second, SLOT_IDS)}
      </div>
      ${selectField("int-arm", "Chromosome arm(s)", a.arm, withChoice(ARM_OPTIONS, items.arm))}
      ${selectField("int-band", "Band / sub-band", a.band, withChoice(["none", ...BAND_DESIGNATIONS], items.band))}
    </div>`;
  }
  if (step === "iscn_construction") {
    return `<div>
      <p>Enter ISCN for this case. Harmless spacing and capitalization differences are ignored. The expected string is not shown until this step is submitted or you request it after submit.</p>
      <label class="stack">ISCN
        <input id="iscn-input" class="iscn-input" spellcheck="false" value="${escapeHtml(s.answers.iscn)}" placeholder="e.g. 46,XX" />
      </label>
    </div>`;
  }
  if (step === "disease") {
    const options = shuffle(c.diagnosis_options || [c.diagnosis], seedFrom(c.case_id + "-dx"));
    return `<div>
      ${c.origin_context ? `<p>${escapeHtml(c.origin_context)}</p>` : ""}
      <fieldset class="dx-set">
        <legend>Associated condition</legend>
        ${options.map((d) => radio("diagnosis", d, s.answers.diagnosis, d)).join("")}
      </fieldset>
    </div>`;
  }
  if (step === "narrative") {
    return `<label class="stack">Short interpretation
      <textarea id="narrative">${escapeHtml(s.answers.narrative)}</textarea>
    </label>
    <p class="muted">State the karyotype finding and its educational clinical correlation in two or three sentences.</p>`;
  }
  return "";
}

function withChoice(options, extra) {
  if (!extra || options.includes(extra)) return options;
  return [extra, ...options];
}

function labelCategory(cat) {
  return {
    normal: "Normal",
    numerical: "Numerical abnormality",
    structural: "Structural abnormality",
    numerical_and_structural: "Numerical and structural",
  }[cat] || cat;
}

function radio(name, value, current, label) {
  return `<label class="check"><input type="radio" name="${name}" value="${escapeHtml(value)}" ${current === value ? "checked" : ""}/> ${escapeHtml(label)}</label>`;
}

function textField(id, label, value) {
  return `<label class="stack">${escapeHtml(label)}<input id="${id}" value="${escapeHtml(value || "")}" /></label>`;
}

function summaryView() {
  const s = state.session;
  const c = s.caseData;
  const rows = summarizeSession(s);
  const att = attemptSummary(s);
  const reveal = c.expected_iscn;
  return `<section class="summary">
    <h3>Performance summary</h3>
    <ul class="score-list">
      ${rows.map((r) => `<li><span>${escapeHtml(r.skill)}</span><strong>${escapeHtml(r.result)}</strong>${r.detail ? `<em>${escapeHtml(r.detail)}</em>` : ""}</li>`).join("") || "<li>No scored steps were completed.</li>"}
    </ul>
    <p class="muted">Attempts — karyotype checks: ${att.karyotypeChecks}; abnormality: ${att.abnormalityAttempts}; ISCN: ${att.iscnAttempts}; disease: ${att.diseaseAttempts}. Hints used: ${att.hintsUsed}.</p>
    ${s.instructionMode === "assessment" ? competencyReport(s) : ""}
    <h3>Case explanation</h3>
    <p class="iscn-display">${escapeHtml(reveal || "")}</p>
    <p>${escapeHtml(c.plain_language_interpretation || "")}</p>
    <p>${escapeHtml(c.explanation || "")}</p>
    ${(s.module === "disease" || !s.instructionMode) && (s.atlas?.mode !== "assigned" || (s.steps || []).includes("disease")) && c.diagnosis ? `<p><strong>Associated condition (teaching case):</strong> ${escapeHtml(c.diagnosis)}</p>` : ""}
    ${c.references?.length ? `<h3>References</h3><ul class="refs">${c.references.map((r) => `<li><strong>${escapeHtml(r.label)}.</strong> ${escapeHtml(r.citation)}</li>`).join("")}</ul>` : ""}
    <div class="controls">
      ${assignmentBackButton()}
      ${btn("new-case", s.module === "disease" ? "Back to case" : "Start new case", "primary")}
      <button type="button" class="btn" data-go="#/">Return to laboratories</button>
    </div>
  </section>`;
}

function instructorView() {
  const rows = (state.catalog.cases || []).map((c) => `
    <tr>
      <td><code>${escapeHtml(c.case_id)}</code></td>
      <td>${escapeHtml(c.title)}</td>
      <td>${escapeHtml(c.case_type || "")}</td>
      <td>${(c.modules || []).map((m) => {
        const mapped = mapLegacyModule(m);
        return `<a href="${labPath(mapped.lab, mapped.exercise, c.case_id)}">${m}</a>`;
      }).join(" · ")}</td>
    </tr>`).join("");
  return `<main class="instructor">
    <h2>Instructor / development preview</h2>
    <p>Load any case into a module for testing. A future instructor console can add editing, assignment, image import, and score export without changing the student workspace — cases are already external JSON.</p>
    <div class="controls">
      <button type="button" class="btn" id="toggle-instructor">${state.instructor ? "Disable instructor flag" : "Enable instructor flag"}</button>
    </div>
    <table class="case-table">
      <thead><tr><th>case_id</th><th>Title</th><th>Type</th><th>Open in module</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <section class="panel">
      <h3>Adding a case</h3>
      <ol>
        <li>Create <code>data/cases/your-case.json</code> using the fields in <code>data/schema.json</code>.</li>
        <li>Register it in <code>data/catalog.json</code>.</li>
        <li>Optional: add microscopy images under <code>assets/chromosomes/</code> and list them in <code>chromosome_images</code>.</li>
      </ol>
      <p class="muted">Not yet implemented: in-app case editor, roster assignment, result database, score CSV export. The catalog and session scoring objects are the intended extension points.</p>
    </section>
  </main>`;
}

function referenceView() {
  return `<main class="reference">
    <h2>ISCN reference for this laboratory</h2>
    <p>Nomenclature examples below are curated teaching strings, not generated puzzles. Consult ISCN 2020 for official rules.</p>
    <table class="case-table">
      <thead><tr><th>Pattern</th><th>Meaning</th></tr></thead>
      <tbody>
        <tr><td><code>46,XX</code></td><td>Normal female diploid karyotype</td></tr>
        <tr><td><code>46,XY</code></td><td>Normal male diploid karyotype</td></tr>
        <tr><td><code>47,XX,+21</code></td><td>Female with an extra chromosome 21</td></tr>
        <tr><td><code>45,X</code></td><td>Monosomy X (do not write XO)</td></tr>
        <tr><td><code>47,XXY</code></td><td>Male with an extra X chromosome</td></tr>
        <tr><td><code>46,XX,del(5)(p15.2)</code></td><td>Terminal deletion of 5p at band p15.2</td></tr>
        <tr><td><code>46,XY,t(9;22)(q34;q11.2)</code></td><td>Reciprocal translocation; Philadelphia chromosome is der(22)</td></tr>
        <tr><td><code>45,X[12]/46,XX[18]</code></td><td>Mosaicism; numbers in brackets are cell counts</td></tr>
      </tbody>
    </table>
    <h3>Band hierarchy</h3>
    <p>Addresses are nested, not arbitrary strings. Numbering begins at the centromere and increases toward each telomere.</p>
    <table class="case-table">
      <thead><tr><th>Label</th><th>Hierarchy</th></tr></thead>
      <tbody>
        <tr><td><code>7q</code></td><td>Chromosome 7, long arm</td></tr>
        <tr><td><code>7q2</code></td><td>Region 2 of 7q</td></tr>
        <tr><td><code>7q22</code></td><td>Band 2 within region 7q2</td></tr>
        <tr><td><code>7q22.1</code></td><td>Sub-band 1 within 7q22</td></tr>
      </tbody>
    </table>
    <p>FISH probes in this laboratory are attached to the same chromosome-map segments used for banding. Dual-fusion and break-apart patterns are curated in case JSON; the engine does not invent clinical cutoffs.</p>
    <h3>Worksheet groups</h3>
    <p>A 1–3 large metacentric · B 4–5 large submetacentric · C 6–12 and X medium submetacentric · D 13–15 medium acrocentric · E 16–18 short · F 19–20 short metacentric · G 21–22 and Y short acrocentric.</p>
  </main>`;
}

export function bindWorkspace() {
  const root = $(".workspace");
  if (!root) return;
  root.addEventListener("click", onWorkspaceClick);
  root.addEventListener("change", onWorkspaceChange);
  root.addEventListener("input", onWorkspaceInput);
  root.addEventListener("dragstart", onDragStart);
  root.addEventListener("dragover", onDragOver);
  root.addEventListener("dragleave", onDragLeave);
  root.addEventListener("dragend", onDragEnd);
  root.addEventListener("drop", onDrop);
  root.addEventListener("keydown", onKey);
}

function bindHomeEvents() {
  $("#atlas-assign")?.addEventListener("click", () => {
    const list = labDiseases(state.diseases);
    if (!list.length) return;
    const pick = list[Math.floor(Math.random() * list.length)];
    go(diseaseMenuPath(pick.id, { mode: "assigned" }));
  });
  $("#toggle-instructor")?.addEventListener("click", () => {
    const next = !state.instructor;
    localStorage.setItem("cyto.instructor", next ? "1" : "0");
    patch({ instructor: next });
    render();
  });
}

function onWorkspaceClick(ev) {
  const actionEl = ev.target.closest("[data-action]");
  const action = actionEl?.getAttribute("data-action");
  if (action) {
    handleAction(action, actionEl);
    return;
  }
  if (clickFishCanvas(ev)) {
    rerenderWorkspace();
    return;
  }
  const seg = ev.target.closest("[data-seg]");
  if (seg && state.session?.fish && state.session.steps[state.session.stepIndex] === "probe_locus") {
    clickFishBand(seg.getAttribute("data-seg"));
    rerenderWorkspace();
    return;
  }
  const piece = ev.target.closest("[data-piece]");
  if (piece) {
    ev.stopPropagation();
    selectPiece(piece.getAttribute("data-piece"));
    rerenderWorkspace();
    return;
  }
  const dropZone = ev.target.closest("[data-drop]");
  if (dropZone && state.session.assembly?.selectedId) {
    const dest = dropZone.getAttribute("data-drop") === "tray" ? "tray" : "stack";
    dropPiece(state.session.assembly.selectedId, dest);
    rerenderWorkspace();
    return;
  }
  const token = ev.target.closest(".chr-token.interactive");
  const slot = ev.target.closest("[data-slot]");
  if (token) {
    ev.stopPropagation();
    const id = token.getAttribute("data-id");
    const kt = state.session.karyotype;
    if (kt.selectedId === id) patchSession({ karyotype: { ...kt, selectedId: null } });
    else patchSession({ karyotype: { ...kt, selectedId: id } });
    rerenderWorkspace();
    return;
  }
  if (slot && state.session.karyotype.selectedId) {
    const dest = slot.getAttribute("data-slot");
    placeSelected(dest);
  }
}

function onWorkspaceChange(ev) {
  readSessionFields(ev);
  const t = ev.target;
  const s = state.session;
  if (t.name === "category") {
    s.answers.category = t.value;
    if (t.value === "normal") s.answers.types = [];
    rerenderWorkspace();
  }
  if (t.name === "abn-type") {
    const types = $$("input[name='abn-type']:checked").map((el) => el.value);
    s.answers.types = types;
  }
  if (t.name === "diagnosis") s.answers.diagnosis = t.value;
  if (t.name === "fish-scorable" || t.name === "fish-interp" || t.name === "fish-strategy") {
    rerenderWorkspace();
  }
}

function onWorkspaceInput(ev) {
  readSessionFields(ev);
}

function readSessionFields(ev) {
  readAtlasFields(ev);
  readAssemblyFields(ev);
  readFishFields(ev);
  const s = state.session;
  if (!s) return;
  const id = ev.target.id;
  if (id === "iscn-input") s.answers.iscn = ev.target.value;
  if (id === "narrative") s.answers.narrative = ev.target.value;
  if (id === "int-count") s.answers.interpretation.chromosome_count = ev.target.value;
  if (id === "int-sex") s.answers.interpretation.sex_chromosomes = ev.target.value;
  if (id === "int-num") s.answers.interpretation.numerical = ev.target.value;
  if (id === "int-str") s.answers.interpretation.structural = ev.target.value;
  if (id === "int-chr" || id === "int-chr-2") {
    s.answers.interpretation.chromosomes_involved = joinPair($("#int-chr")?.value, $("#int-chr-2")?.value);
  }
  if (id === "int-arm") s.answers.interpretation.arm = ev.target.value;
  if (id === "int-band") s.answers.interpretation.band = ev.target.value;
}

let dragId = null;
function onDragStart(ev) {
  const piece = ev.target.closest("[data-piece]");
  if (piece) {
    dragId = piece.getAttribute("data-piece");
    piece.classList.add("dragging");
    ev.dataTransfer.setData("text/plain", dragId);
    ev.dataTransfer.setData("text/piece", dragId);
    ev.dataTransfer.effectAllowed = "move";
    return;
  }
  const token = ev.target.closest(".chr-token.interactive");
  if (!token) return;
  dragId = token.getAttribute("data-id");
  ev.dataTransfer.setData("text/plain", dragId);
  ev.dataTransfer.effectAllowed = "move";
}
function onDragOver(ev) {
  const zone = ev.target.closest("[data-slot], [data-drop]");
  if (zone) {
    ev.preventDefault();
    ev.dataTransfer.dropEffect = "move";
    zone.classList.add("drag-over");
  }
}
function onDragLeave(ev) {
  const zone = ev.target.closest("[data-slot], [data-drop]");
  if (zone && !zone.contains(ev.relatedTarget)) zone.classList.remove("drag-over");
}
function onDragEnd() {
  $$(".drag-over, .dragging").forEach((el) => el.classList.remove("drag-over", "dragging"));
  dragId = null;
}
function allowedDest(dest) {
  if (dest === "pool") return true;
  const s = state.session;
  const step = currentStep(s.karyotype, s.chromosomes);
  return Boolean(step?.slots?.includes(dest));
}

function onDrop(ev) {
  const pieceDest = ev.target.closest("[data-drop]");
  const pieceId = ev.dataTransfer.getData("text/piece") || ev.dataTransfer.getData("text/plain");
  if (pieceDest && pieceId && state.session.assembly) {
    ev.preventDefault();
    const dest = pieceDest.getAttribute("data-drop");
    const overPiece = ev.target.closest("[data-piece]");
    let index = null;
    if (dest === "stack" && overPiece) {
      const si = overPiece.getAttribute("data-stack-index");
      if (si !== "" && si != null) index = Number(si);
    }
    dropPiece(pieceId, dest === "tray" ? "tray" : "stack", Number.isFinite(index) ? index : null);
    rerenderWorkspace();
    return;
  }
  const slot = ev.target.closest("[data-slot]");
  if (!slot) return;
  ev.preventDefault();
  const dest = slot.getAttribute("data-slot");
  if (!allowedDest(dest)) return;
  const id = ev.dataTransfer.getData("text/plain") || dragId;
  if (!id) return;
  patchSession({ karyotype: moveChromosome(state.session.karyotype, id, dest) });
  rerenderWorkspace();
}
function onKey(ev) {
  if (ev.key === "Escape") {
    const next = {};
    if (state.session.assembly) next.assembly = { ...state.session.assembly, selectedId: null };
    if (state.session.karyotype) next.karyotype = { ...state.session.karyotype, selectedId: null };
    patchSession(next);
    rerenderWorkspace();
    return;
  }
  if (state.session.assembly?.selectedId && (ev.key === "ArrowUp" || ev.key === "ArrowDown")) {
    ev.preventDefault();
    handleAction(ev.key === "ArrowUp" ? "asm-up" : "asm-down");
  }
}

function placeSelected(dest) {
  const kt = state.session.karyotype;
  if (!kt.selectedId || !allowedDest(dest)) return;
  patchSession({ karyotype: moveChromosome(kt, kt.selectedId, dest) });
  rerenderWorkspace();
}

function rerenderWorkspace() {
  const app = document.getElementById("app");
  app.innerHTML = shell(workspaceView());
  bindChrome();
  bindWorkspace();
}

function handleAction(action, el) {
  if (action === "step-back") {
    const current = state.session;
    if (!current || current.stepIndex <= 0) return;
    const stepIndex = current.stepIndex - 1;
    const nextAssembly = assemblyForStep(current, current.steps[stepIndex]);
    patchSession(nextAssembly ? { stepIndex, assembly: nextAssembly } : { stepIndex });
    rerenderWorkspace();
    return;
  }
  if (handleAtlasAction(action, el)) {
    rerenderWorkspace();
    return;
  }
  if (handleFishAction(action, el)) {
    if (state.session) rerenderWorkspace();
    return;
  }
  if (handleAssemblyAction(action, el)) {
    rerenderWorkspace();
    return;
  }
  const s = state.session;
  const step = s.steps[s.stepIndex];
  if (action === "new-case") {
    if (s.module === "atlas") {
      patch({ session: null });
      go("#/atlas");
      return;
    }
    if (s.module === "disease") {
      const href = s.returnHref || "#/cases";
      patch({ session: null });
      go(href);
      return;
    }
    const list = studentExerciseCases(s.lab || mapLegacyModule(s.module).lab, s.exercise || mapLegacyModule(s.module).exercise);
    const idx = list.findIndex((c) => c.case_id === s.caseData.case_id);
    const next = list[(idx + 1) % Math.max(list.length, 1)] || list[0];
    patch({ session: null });
    go(next ? sessionHref({ ...s }, next.case_id) : labPath(s.lab || "karyotype", s.exercise));
    return;
  }
  if (action === "review-kt") {
    patchSession({ karyotype: { ...s.karyotype, reviewing: !s.karyotype.reviewing } });
    rerenderWorkspace();
    return;
  }
  if (action === "reset-kt") {
    const kt = resetCurrentGroup(s.karyotype, s.chromosomes);
    patchSession({
      karyotype: kt,
      feedback: { ...s.feedback, karyotype: openSheet(s.karyotype)
        ? { tone: "review", title: "Karyotype cleared", body: "Every chromosome was returned to the unassigned tray." }
        : { tone: "review", title: "Group cleared", body: "Chromosomes from this group were returned to the unassigned tray. Completed groups were left in place." } },
    });
    rerenderWorkspace();
    return;
  }
  if (action === "group-prev") {
    gotoGroup((s.karyotype.activeStep || 0) - 1);
    return;
  }
  if (action === "group-next") {
    tryAdvanceGroup();
    return;
  }
  if (action === "group-goto") {
    gotoGroup(Number(el?.getAttribute("data-index")));
    return;
  }
  if (action === "hint") {
    useHint();
    return;
  }
  if (action === "check-kt") {
    checkKaryotype(false);
    return;
  }
  if (action === "continue-step" || action === "submit-step") {
    if (step === "karyotype") {
      if (!allAssigned(s.karyotype)) {
        writeFeedback("karyotype", {
          tone: "review",
          title: openSheet(s.karyotype) ? "Place the remaining chromosomes" : "Finish remaining groups before submitting",
          body: openSheet(s.karyotype)
            ? "Every chromosome must be in a numbered position before the karyotype is submitted."
            : "Every chromosome from the case must be placed. Use Next group after the active tray is empty.",
        });
        rerenderWorkspace();
        return;
      }
      checkKaryotype(true);
      if (s.module === "atlas") {
        const ok = Boolean(s.karyotype.lastGrade?.perfect);
        markAtlasKaryotype(ok);
        if (!ok) {
          rerenderWorkspace();
          return;
        }
      }
    }
    if (step === "abnormality") checkAbnormality(true);
    if (step === "iscn_construction") checkISCN(true);
    if (step === "iscn_interpretation") checkInterpretation(true);
    if (step === "disease") checkDisease(true);
    if (step === "narrative") checkNarrative(true);
    if (blocksAdvance(step)) {
      rerenderWorkspace();
      return;
    }
    advance();
    return;
  }
  if (action === "check-step") {
    if (step === "abnormality") checkAbnormality(false);
    if (step === "iscn_construction") checkISCN(false);
    if (step === "iscn_interpretation") checkInterpretation(false);
    if (step === "disease") checkDisease(false);
    if (step === "narrative") checkNarrative(false);
    rerenderWorkspace();
  }
}

function gotoGroup(index) {
  const s = state.session;
  const steps = s.karyotype.steps || [];
  if (!steps.length) return;
  const target = Math.max(0, Math.min(steps.length - 1, index));
  const current = s.karyotype.activeStep || 0;
  if (target === current) return;
  if (target > current) {
    const gate = canAdvanceGroup(s.karyotype, s.chromosomes, s.caseData);
    if (!gate.ok) {
      writeFeedback("karyotype", {
        tone: "review",
        title: gate.reason === "incorrect" ? "This group must be arranged correctly before continuing" : "Place every chromosome in this group first",
        body: gate.reason === "incorrect"
          ? "This case requires a correct arrangement before the next group is available."
          : "Assign all chromosomes from the active tray to numbered positions. They do not have to be in the correct pairs yet.",
      });
      rerenderWorkspace();
      return;
    }
  }
  patchSession({
    karyotype: { ...s.karyotype, activeStep: target, selectedId: null, checkAttempt: 0, lastGrade: null },
  });
  rerenderWorkspace();
}

function tryAdvanceGroup() {
  const s = state.session;
  const last = (s.karyotype.steps?.length || 1) - 1;
  const current = s.karyotype.activeStep || 0;
  if (current >= last) {
    writeFeedback("karyotype", {
      tone: "review",
      title: "Last group",
      body: allAssigned(s.karyotype)
        ? "All chromosomes have been placed. Submit the karyotype to grade the complete arrangement."
        : "This is the last group. Place any remaining chromosomes, then submit the karyotype.",
    });
    rerenderWorkspace();
    return;
  }
  gotoGroup(current + 1);
}

function checkKaryotype(isSubmit) {
  const s = state.session;
  const step = currentStep(s.karyotype, s.chromosomes);
  const grade = gradeKaryotype(s.karyotype, s.chromosomes, isSubmit ? null : step.slots);
  const attempt = s.karyotype.checkAttempt + 1;
  const fb = karyotypeFeedback(grade, isSubmit ? 99 : attempt);
  fb.scored = true;
  if (isSubmit) {
    fb.title = grade.perfect ? "Karyotype submitted — arrangement correct" : "Karyotype submitted";
    fb.body = grade.perfect
      ? "The complete arrangement matches the case assignments."
      : `${grade.correctSlots}/${grade.slotDenom} positions match the expected identities. Downstream answers are not shown yet.`;
    fb.highlightSlots = !grade.perfect;
  }
  s.karyotype = { ...s.karyotype, checkAttempt: attempt, lastGrade: grade };
  s.attempts.karyotype += 1;
  if (isSubmit) {
    const identificationOnly = s.exercise === "chromosome_identification" || s.scoreFocus === "chromosome_identification";
    if (identificationOnly) s.scores.chromosome_identification = grade;
    else s.scores.karyotype_construction = grade;
  }
  writeFeedback("karyotype", fb, isSubmit);
  if (!isSubmit) rerenderWorkspace();
}

function assemblyForStep(session, step) {
  const spec = session.stepAssembly?.[step];
  if (!spec) return null;
  const current = session.assembly?.spec;
  const same = current
    && String(current.chromosome) === String(spec.chromosome)
    && (current.transform?.type || "") === (spec.transform?.type || "");
  if (same) return null;
  return initAssembly(state.maps, spec, seedFrom(`${session.caseData.case_id}-${step}`));
}

function blocksAdvance(step) {
  const s = state.session;
  if (!s?.strictAdvance) return false;
  if (step === "metaphase" || step === "summary" || step === "fish_demo" || isTeachStep(step)) return false;
  return state.session.feedback[step]?.tone !== "ok";
}

function advance() {
  const s = state.session;
  const next = Math.min(s.stepIndex + 1, s.steps.length - 1);
  const step = s.steps[next];
  const assembly = assemblyForStep(s, step);
  patchSession(assembly ? { stepIndex: next, assembly } : { stepIndex: next });
  rerenderWorkspace();
}

function useHint() {
  const s = state.session;
  const step = s.steps[s.stepIndex];
  if (s.instructionMode === "assessment") {
    writeFeedback(step, { tone: "review", title: "Hints are not part of assessment", body: "Submit the response you can defend." });
    rerenderWorkspace();
    return;
  }
  if (s.instructionMode) {
    const level = s.pedagogy?.hintLevel?.[step] || 0;
    const hint = hintFor(s.atlas?.disease, step, level, s.exercise, s.instructionMode);
    const applied = applyStep(step);
    if (s.instructionMode === "practice" && s.module !== "disease" && applied !== "fish_scope" && applied !== "fish_interpret" && applied !== "fish_demo") {
      s.pedagogy = s.pedagogy || { hintLevel: {}, first: {} };
      s.pedagogy.revealLabels = true;
    }
    s.pedagogy = s.pedagogy || { hintLevel: {}, first: {} };
    s.pedagogy.hintLevel[step] = hint.last ? level : level + 1;
    writeFeedback(step, { tone: "review", title: `Hint ${hint.index + 1}`, body: hint.text });
    patchSession({ hintsUsed: s.hintsUsed + 1 });
    rerenderWorkspace();
    return;
  }
  const hints = (s.exercise === "anatomy" && s.caseData.anatomy_hints) ? s.caseData.anatomy_hints : (s.caseData.hints || []);
  if (!hints.length) {
    writeFeedback(s.steps[s.stepIndex], { tone: "review", title: "No additional hints", body: "This case does not include further hints." });
    rerenderWorkspace();
    return;
  }
  const i = Math.min(s.hintIndex, hints.length - 1);
  writeFeedback(s.steps[s.stepIndex], { tone: "review", title: `Hint ${i + 1} of ${hints.length}`, body: hints[i] });
  patchSession({ hintIndex: Math.min(i + 1, hints.length - 1), hintsUsed: s.hintsUsed + 1 });
  rerenderWorkspace();
}

function writeFeedback(step, fb, lock = false) {
  const s = state.session;
  s.feedback = { ...s.feedback, [step]: applyMode(s, step, fb, { lock }) };
}

const COMPETENCY = [
  ["karyotype", "Karyotype construction"],
  ["find", "Affected chromosome identification"],
  ["inspect", "Change identification"],
  ["abnormality", "Abnormality recognition"],
  ["comparison", "Chromosome / band reasoning"],
  ["probe_strategy", "FISH strategy"],
  ["probe_locus", "Probe localization"],
  ["fish_scope", "FISH scoring"],
  ["fish_interpret", "FISH interpretation"],
  ["iscn_interpretation", "ISCN"],
  ["iscn_construction", "ISCN"],
  ["disease", "Disease interpretation"],
];

function competencyName(step, s) {
  const base = applyStep(String(step || "").replace(/_\d+$/, ""));
  const skill = s.module !== "disease" && s.instructionMode;
  const exercise = s.exercise;
  if (skill && base === "anatomy") return "Chromosome anatomy";
  if (skill && base === "assemble") return "Chromosome assembly";
  if (skill && base === "nomenclature") return "Band/locus identification";
  if (skill && base === "comparison") return "Structural rearrangement recognition";
  if (skill && base === "karyotype") return "Karyotype construction";
  if (skill && (base === "iscn_interpretation" || base === "iscn_construction")) return "ISCN/mosaic notation";
  if (skill && base === "probe_locus") return "Probe localization";
  if (skill && (base === "fish_scope" || base === "fish_interpret")) {
    if (exercise === "enumeration") return "FISH enumeration";
    if (exercise === "break-apart") return "FISH break-apart interpretation";
    if (exercise === "quality") return "FISH signal quality";
  }
  if (skill && base === "disease") return "";
  return COMPETENCY.find(([id]) => id === base)?.[1] || "";
}

function competencyReport(s) {
  const first = s.pedagogy?.first || {};
  const used = new Map();
  for (const step of s.steps || []) {
    if (isTeachStep(step) || step === "summary" || step === "fish_demo") continue;
    const label = competencyName(step, s);
    if (!label) continue;
    const record = first[step];
    const prev = used.get(label) || { attempted: false, ok: true, notes: [] };
    if (record) {
      prev.attempted = true;
      prev.ok = prev.ok && record.ok;
      if (record.body) prev.notes.push(record.body);
    } else prev.ok = false;
    used.set(label, prev);
  }
  const items = [...used.entries()].map(([label, row]) => {
    const result = !row.attempted ? "Not recorded" : (row.ok ? "Recorded correctly" : "Needs review");
    return `<li><span>${escapeHtml(label)}</span><strong>${result}</strong>${row.notes[0] ? `<em>${escapeHtml(row.notes[0])}</em>` : ""}</li>`;
  });
  return `<h3>By competency</h3><ul class="score-list">${items.join("") || "<li>No competency was recorded.</li>"}</ul>`;
}

function checkAbnormality(isSubmit) {
  const s = state.session;
  const c = s.caseData;
  s.attempts.abnormality += 1;
  const catOk = Boolean(c.abnormality_category) && s.answers.category === c.abnormality_category;
  const expectedTypes = [...(c.abnormality_type || [])].sort();
  const got = [...(s.answers.category === "normal" ? [] : s.answers.types)].sort();
  let typeOk = false;
  if (!c.abnormality_category) typeOk = false;
  else if (c.abnormality_category === "normal") typeOk = got.length === 0;
  else if (!expectedTypes.length) typeOk = false;
  else typeOk = expectedTypes.length === got.length && expectedTypes.every((type, index) => type === got[index]);
  const ok = catOk && typeOk;
  s.scores.abnormality_recognition = {
    ok,
    detail: !catOk ? "category needs review" : typeOk ? "" : "specific classification needs review",
  };
  writeFeedback("abnormality", {
    tone: ok ? "ok" : "review",
    scored: true,
    title: ok ? "Classification matches the case record." : "Classification is not yet correct.",
    body: ok
      ? "Category is consistent with the curated key."
      : !catOk
        ? "Reconsider whether the finding is normal, numerical, or structural. Specific ISCN and diagnosis are not shown."
        : "The broad category is consistent, but the more specific classification is not. Options are limited to those listed for this case.",
  }, isSubmit);
  if (!isSubmit) rerenderWorkspace();
}

function checkISCN(isSubmit) {
  const s = state.session;
  const c = s.caseData;
  s.attempts.iscn_construction += 1;
  const result = compareISCN(s.answers.iscn, c.expected_iscn, c.accepted_iscn_variants || []);
  s.scores.iscn_construction = result;
  const labels = iscnComponentLabels();
  const extra = `<ul class="comp-list">${Object.entries(result.components)
    .filter(([, v]) => v && v !== "na")
    .map(([k, v]) => `<li>${escapeHtml(labels[k])}: <strong>${escapeHtml(v)}</strong></li>`)
    .join("")}</ul>`;
  let body = result.match
    ? "The normalized ISCN matches an accepted string for this case."
    : "Compare each component with the karyotype. The complete expected ISCN is not displayed until this step is submitted.";
  if (isSubmit && !result.match) {
    body = `Accepted ISCN for this teaching case: ${c.expected_iscn}.`;
  }
  if (isSubmit && result.match) body = `Accepted ISCN: ${c.expected_iscn}.`;
  writeFeedback("iscn_construction", {
    tone: result.match ? "ok" : "review",
    scored: true,
    title: result.match ? "ISCN accepted" : "ISCN does not yet match the case key",
    body,
    extra,
  }, isSubmit);
  if (!isSubmit) rerenderWorkspace();
}

function norm(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/none|n\/a|na|—|-/g, "none")
    .replace(/and/g, ";")
    .replace(/[,/ ]+/g, ";")
    .replace(/;+/g, ";")
    .replace(/^;|;$/g, "");
}

function checkInterpretation(isSubmit) {
  const s = state.session;
  const items = s.caseData.interpretation_items || {};
  s.attempts.iscn_interpretation += 1;
  if (!Object.keys(items).length) {
    s.scores.iscn_interpretation = { ok: false, ungraded: true, components: {} };
    writeFeedback("iscn_interpretation", {
      tone: "review",
      title: "No interpretation key is stored for this case.",
      body: "This step stays ungraded until each ISCN component has an expected value.",
    });
    if (!isSubmit) rerenderWorkspace();
    return;
  }
  const map = {
    chromosome_count: "int-count",
    sex_chromosomes: "int-sex",
    numerical: "int-num",
    structural: "int-str",
    chromosomes_involved: "int-chr",
    arm: "int-arm",
    band: "int-band",
  };
  const components = {};
  let all = true;
  for (const [key, expected] of Object.entries(items)) {
    const got = s.answers.interpretation[{
      chromosome_count: "chromosome_count",
      sex_chromosomes: "sex_chromosomes",
      numerical: "numerical",
      structural: "structural",
      chromosomes_involved: "chromosomes_involved",
      arm: "arm",
      band: "band",
    }[key]];
    const ok = norm(expected) !== "" && norm(got) === norm(expected);
    components[key] = ok ? "correct" : "incorrect";
    if (!ok) all = false;
  }
  s.scores.iscn_interpretation = { ok: all, components };
  const extra = `<ul class="comp-list">${Object.entries(components).map(([k, v]) => `<li>${escapeHtml(k.replace(/_/g, " "))}: <strong>${v}</strong></li>`).join("")}</ul>`;
  writeFeedback("iscn_interpretation", {
    tone: all ? "ok" : "review",
    scored: true,
    title: all ? "Component interpretation is consistent with the case." : "One or more components need review.",
    body: isSubmit || all ? (s.caseData.plain_language_interpretation || "") : "Plain-language interpretation is shown after a correct check or after submit.",
    extra,
  }, isSubmit);
  if (!isSubmit) rerenderWorkspace();
}

function checkDisease(isSubmit) {
  const s = state.session;
  s.attempts.disease += 1;
  const ok = s.answers.diagnosis === s.caseData.diagnosis;
  s.scores.disease_association = { ok };
  writeFeedback("disease", {
    tone: ok ? "ok" : "review",
    scored: true,
    title: ok ? "Disease association matches the case record." : "Disease association needs review.",
    body: ok || isSubmit
      ? (isSubmit ? `Teaching diagnosis: ${s.caseData.diagnosis}.` : "This cytogenetic finding is paired with that condition in the case data.")
      : "The associated condition is stored with the case and is not revealed on an incorrect check.",
  }, isSubmit);
  if (!isSubmit) rerenderWorkspace();
}

function checkNarrative() {
  const s = state.session;
  const ok = (s.answers.narrative || "").trim().length >= 20;
  writeFeedback("narrative", {
    tone: ok ? "ok" : "review",
    title: ok ? "Interpretation recorded" : "Add a short interpretation",
    body: ok ? "Your narrative is stored with this session. Compare it with the model explanation on the summary page." : "Write at least a sentence connecting the cytogenetic finding with the clinical context.",
  });
}
