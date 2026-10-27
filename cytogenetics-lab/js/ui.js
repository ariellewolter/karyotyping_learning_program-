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
} from "./util.js?v=20261026seen5";
import { bindAtlasReference, bindLibrary, libraryView, referenceMatchesHTML, referenceSearch } from "./reference-library.js?v=20261026p5";
import { analyzeFormula as analyzeKaryotype, resolveClones } from "./karyotype-analysis.js";
import { analysisHTML, bindAnalysis } from "./karyotype-analysis-view.js";
import { bindInspect, inspectDialogHTML, openInspection } from "./inspect-ui.js?v=20261025ex1";
import { DRAW_GUIDED_DISEASE, DRAW_GUIDED_FORMULA, applyWorkspaceFormula, bindChromosomeWorkspace, chromosomeWorkspaceHTML } from "./chromosome-workspace.js?v=20261026seen4";
import { bindMyCaseReports, myCaseReportsHTML, saveCaseworkReport } from "./my-case-reports.js?v=20261026rep2";
import { affectedChromosomesTabMarkup, bindAffectedRemakes } from "./case-affected-remake.js?v=20261026guide1";
import { proposedAudit } from "./audit.js?v=20261025ex1";
import { casesForExercise, exerciseById, labById, labPath, LABS, mapLegacyModule, sessionModuleFor } from "./labs.js?v=20261025ux1";
import { hydrateCase, loadCase } from "./cases.js?v=20261025ex1";
import { chromosomeTraits, describeKaryogram, inferPloidy, renderChromosome } from "./chromosomes.js?v=20261026p5";
import { allAssigned, canAdvanceGroup, currentStep, diseaseComparisonRounds, focusRoundsFromCase, gradeKaryotype, karyotypeFeedback, moveChromosome, placementHint, poolForCurrentStep, resetCurrentGroup, resetKaryotype, reshuffleCurrentTray, seatSingleCopies, startFocusRound, unplacedForStep } from "./karyotype.js?v=20261025ex1";
import { compareISCN, exploreISCN, iscnComponentLabels, normalizeISCN, parseAbnormality, parseISCN, reciprocalDerivatives, segmentTransform, symbolSentences } from "./iscn.js";
import { bandSpanNoteHTML, demonstrationSpans, formatBase } from "./band-span.js?v=20261025span3";
import { attemptSummary, summarizeSession } from "./scoring.js?v=20261025grade1";
import { chromosomeSequenceCase, initAssembly } from "./banding.js?v=20261024c";
import { assemblyControls, assemblyView, dropPiece, handleAssemblyAction, isAssemblyStep, readAssemblyFields, selectPiece } from "./assembly-ui.js?v=20261025span4";
import { clickFishBand, clickFishCanvas, fishControls, fishView, handleFishAction, isFishStep, readFishFields } from "./fish-ui.js?v=20261025fish1";
import { buildScene, completedWorkstation, initWorkstation, registerWorkstationHost, workstationHTML, workstationReport } from "./fish-workstation.js?v=20261026seen4";
import { canonicalCase, diseaseById, diseaseCase, labDiseases } from "./atlas.js?v=20261006j";
import { atlasBrowse, atlasControls, atlasFindSlots, atlasLabBody, atlasSlotPicked, atlasSummary, handleAtlasAction, isAtlasLabStep, markAtlasKaryotype, readAtlasFields } from "./atlas-ui.js?v=20261026seen3";
import { CASE_ALIASES, LAB_PERIODS, METHOD_FAMILIES, SKILL_PRACTICE, buildDiseaseCase, caseSubtitle, caseTeaching, diseaseMenuPath, diseasesForMethod, familyActivities, findingChoices, findingLabel, independentCaseworkDiseases, isStudentCatalogCase, planActivity } from "./activities.js?v=20261026seen3";
import { applyStep, centromereKeyHtml, hintFor, instructionSteps, isTeachStep, lessonForContext } from "./pedagogy.js?v=20261025open1";
import { bindClassLab, classLabView } from "./class-lab.js?v=20261025fish1";
import { bindPatientKaryogram, patientKaryogramMarkup } from "./patient-karyogram.js?v=20261026cs15";
import { guidedKaryotypePacket, guidedVisualsIncomplete } from "./guided-case-artifacts.js?v=20261026rep2";
import { generatedFishImages, generatedMetaphaseFromFormula, generatedMetaphaseImage, metaphaseSvg, spreadChromosomeSvg, spreadRotations } from "./specimen-image.js?v=20261026cs4";
import { benchMarkup, benchPlace, benchRecord, benchRedo, benchSlotAllowed, benchTurn, benchUndo, identityColour, sidewaysPlaced } from "./karyogram-bench.js?v=20261026cs1";
import { analyzeCaseSet, analyzeFormula } from "./case-analysis.js?v=20261025case1";
import { buildProposal } from "./lookup-engine.js?v=20261025lookup1";
import { readOmimApiKey, referenceLinks, saveOmimApiKey, searchAtlas, searchOmim } from "./lookup-sources.js?v=20261026seen3";
import { bindCaseReport, caseReportMarkup } from "./case-report.js?v=20261026cs1";
import { assignmentExpectation, buildSubmission, caseMode, caseStagesMarkup, caseSubmissionMarkup, downloadSubmission, downloadSubmissionCsv, exportCaseReport, sanitizeSubmission, submissionReadiness } from "./case-submission.js?v=20261026rep2";

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
  const hash = location.hash || "#/";
  const cleaned = hash.replace(/\/practice(?=\/|$)/g, "/learn");
  if (cleaned !== hash) {
    go(cleaned);
    return;
  }
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
  if (route.name === "lab" && route.caseId && route.instruction !== "learn" && route.instruction !== "assessment") {
    go(`${labPath(route.lab, route.exercise, route.caseId)}/learn`);
    return;
  }
  if (route.name === "learning") {
    app.innerHTML = shell(labLanding(route.lab));
    bindChrome();
    bindHomeEvents();
    return;
  }
  if (route.name === "patient") {
    app.innerHTML = shell(patientView(route));
    bindChrome();
    bindPatientEvents(app, route);
    return;
  }
  if (route.name === "instructor") app.innerHTML = shell(instructorView());
  else if (route.name === "reference") app.innerHTML = shell(referenceView());
  else if (route.name === "library") {
    const access = referenceAccess();
    const notice = access === "optional" ? `<p class="library-note">This search is optional during practice. It is not filled with this case. A stored record is not the answer to the exercise.</p>` : "";
    app.innerHTML = shell(access === "closed" ? libraryClosedHTML() : libraryView(notice, route.view));
    bindChrome();
    if (referenceAccess() !== "closed") bindLibrary(app, route);
    return;
  }
  else if (route.name === "credits") app.innerHTML = shell(creditsView());
  else if (route.name === "help") app.innerHTML = shell(helpView());
  else if (route.name === "reports") {
    app.innerHTML = shell(myCaseReportsHTML());
    bindChrome();
    bindMyCaseReports(app);
    return;
  }
  else if (route.name === "cases") app.innerHTML = shell(allCasesView());
  else if (route.name === "class") {
    app.innerHTML = shell(classLabView(route.classId, route.step));
    bindClassLab(app);
  }
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
  } else if (route.name === "atlas") {
    app.innerHTML = shell(atlasBrowse(route));
    bindAtlasReference(app, referenceAccess());
  }
  else if (route.name === "atlas-lab" && route.diseaseId) {
    go(diseaseMenuPath(route.diseaseId, { mode: "assigned" }));
    return;
  } else if (route.name === "lab" && route.lab === "chromosome" && route.exercise === "draw" && !route.caseId) {
    app.innerHTML = shell(chromosomeDrawView());
    bindChrome();
    bindChromosomeWorkspace(app);
    app.querySelector("#draw-open-guided")?.addEventListener("click", () => {
      applyWorkspaceFormula(app, DRAW_GUIDED_FORMULA);
      app.querySelector("#chromosome-workspace")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    if (route.formula) {
      history.replaceState(null, "", labPath("chromosome", "draw"));
      state.route = parseHash();
      applyWorkspaceFormula(app, route.formula);
      app.querySelector("#chromosome-workspace")?.scrollIntoView({ block: "start" });
    }
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

function navKey(route) {
  if (!route || route.name === "home") return "home";
  if (route.name === "help") return "help";
  if (route.name === "credits") return "credits";
  if (route.name === "reports") return "reports";
  if (route.name === "library") return "library";
  if (route.name === "atlas" || route.name === "atlas-lab") return "atlas";
  if (route.name === "lab" && route.lab === "chromosome" && route.exercise === "draw") return "draw";
  return "";
}

function navLink(href, label, id, current) {
  return `<a href="${href}"${current === id ? ' aria-current="page"' : ""}>${label}</a>`;
}

function shell(inner) {
  const current = navKey(parseHash());
  return `
    <header class="topbar">
      <a class="brand" href="#/">
        <span class="brand-mark">CG</span>
        <div>
          <p class="brand-kicker">Evonyx</p>
          <h1>Cytogenetics Laboratory</h1>
        </div>
      </a>
      <nav class="topnav">
        ${navLink("#/", "Home", "home", current)}
        ${navLink(labPath("chromosome", "draw"), "Draw", "draw", current)}
        ${navLink("#/atlas", "Atlas", "atlas", current)}
        ${referenceAccess() === "closed" ? "" : navLink("#/library", "Library", "library", current)}
        ${navLink("#/reports", "My Case Reports", "reports", current)}
        ${navLink("#/help", "Help", "help", current)}
        ${navLink("#/credits", "Credits", "credits", current)}
      </nav>
    </header>
    ${inner}
    ${inspectDialogHTML()}
    <footer class="site-foot">
      <span>Educational use only · not for clinical diagnosis. <a href="#/credits">Credits</a></span>
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
  bindInspect(document.getElementById("app"));
  $$("[data-class-return]").forEach((el) => {
    el.addEventListener("click", () => {
      sessionStorage.setItem("cyto.classReturn", el.getAttribute("data-class-return") || "");
      sessionStorage.setItem("cyto.classNext", el.getAttribute("data-class-next") || "");
    });
  });
}

function homeView() {
  return `
    <main class="home home-labs design-home">
      <header class="lab-home-heading"><h2>Two laboratory periods</h2><p>Each period starts with a short Learn section, then Casework: one guided example, then a different case of your own. Draw is a separate workspace for any ISCN formula. The <a href="#/library">Reference library</a> searches stored records and does not start a graded case.</p></header>
      <section class="lab-hubs">
        ${labHomeColumn("karyotype", "Lab 1 · Karyotyping and Chromosome Analysis", "Anatomy · Bands · Karyotypes · ISCN", "Learn chromosome analysis, then investigate a karyotype. No FISH is required.")}
        ${labHomeColumn("fish", "Lab 2 · FISH Analysis", "Probes · Signal patterns · Scoring · Interpretation", "Learn FISH scoring, then investigate a different assay. Karyotype assembly is not required.")}
      </section>
      ${homeDrawPanel()}
      ${homeRecentCases()}
      <p class="home-note">Cases you add stay in this browser. Use de-identified material. Finished Draw and Casework reports collect under <a href="#/reports">My Case Reports</a> for single or combined PDF export.</p>
    </main>`;
}

function homeDrawPanel() {
  const art = `<svg viewBox="0 0 184 92" role="img" aria-label="Illustrative karyogram drawing"><rect width="184" height="92" rx="10" fill="#eef5f4"/><g fill="#c9d4d3" stroke="#7e8887" stroke-width="1.5">${[0, 1, 2, 3, 4, 5].map((i) => `<rect x="${28 + i * 22}" y="${18 + (i % 2) * 8}" width="8" height="${48 - (i % 3) * 6}" rx="3"/>`).join("")}</g><text x="92" y="82" text-anchor="middle" fill="#18334b" font-family="ui-monospace,Menlo,monospace" font-size="10">46,XY,t(9;22)</text></svg>`;
  return `<section class="home-draw" aria-label="Draw workspace">
    <article class="hub-panel draw-hub-panel">
      <div class="hub-panel-body">
        <div class="hub-art">${art}</div>
        <div>
          <p class="eyebrow">Standalone workspace</p>
          <h3>Draw</h3>
          <p>Write an ISCN formula for a finding or disease, draw the karyogram, read affected chromosomes and placements, and save or export a formula report.</p>
          <div class="hub-actions"><a class="button hub-primary" href="${labPath("chromosome", "draw")}">Open Draw <span aria-hidden="true">›</span></a></div>
        </div>
      </div>
    </article>
  </section>`;
}

function labHomeColumn(id, title, tags, description) {
  const shortcuts = id === "fish"
    ? [["Probe localization", SKILL_PRACTICE.fish[2]], ["Score signals", SKILL_PRACTICE.fish[0]], ["Read a break-apart pattern", SKILL_PRACTICE.fish[1]]]
    : [["Chromosome anatomy", SKILL_PRACTICE.chromosome[1]], ["Build a karyotype", SKILL_PRACTICE.karyotype[0]], ["Read ISCN", SKILL_PRACTICE.karyotype[2]]];
  return `<section class="lab-hub ${id === "fish" ? "fish-hub" : "karyotype-hub"}">
    <header class="lab-hub-head"><span class="hub-symbol">${labIcon(id)}</span><div><h2>${title}</h2><p class="hub-tags">${escapeHtml(tags)}</p></div></header>
    <section class="hub-panel"><h3>Learn</h3><div class="hub-panel-body"><div class="hub-art">${labPreviewArt(id, "learning")}</div><div><p>${description}</p><nav class="hub-quicklinks" aria-label="Sample ${escapeHtml(title)} skills">${shortcuts.map(([label, skill]) => `<a href="${skill.href}/learn">${escapeHtml(label)}</a>`).join("")}</nav><a class="button hub-primary" href="${labPath(id)}">Open Learn <span aria-hidden="true">›</span></a></div></div></section>
    <section class="hub-panel"><h3>Casework</h3><div class="hub-panel-body"><div class="hub-art">${labPreviewArt(id, "cases")}</div><div><p>${id === "fish" ? "A guided enumeration example, then a different FISH case." : "A guided trisomy 21 example, then a different karyotype."}</p><div class="hub-actions"><a class="button hub-secondary" href="#/patients/${id}">Open Casework</a></div></div></div></section>
  </section>`;
}

function homeRecentCases() {
  const recent = patientCases().filter((item) => item.lab === "fish" || item.lab === "karyotype").sort((a, b) => Date.parse(b.savedAt || "") - Date.parse(a.savedAt || "")).slice(0, 2);
  if (!recent.length) return "";
  return `<section class="home-recent"><header><div><p class="eyebrow">Saved on this device</p><h3>Continue working</h3></div><a href="#/patients/${recent[0].lab}">View Casework</a></header><div>${recent.map((item) => `<a class="home-recent-case" href="#/patients/${item.lab}/${encodeURIComponent(item.id)}"><span class="recent-mark ${item.lab === "fish" ? "fish-mark" : "karyotype-mark"}" aria-hidden="true">${item.lab === "fish" ? "F" : "K"}</span><span><strong>${escapeHtml(item.label || "Untitled case")}</strong><small>${item.lab === "fish" ? "FISH Lab" : "Karyotyping Lab"} · ${escapeHtml(item.specimen || "My case")}</small></span><span aria-hidden="true">›</span></a>`).join("")}</div></section>`;
}

function labPreviewArt(lab, kind) {
  if (lab === "fish") {
    const count = kind === "cases" ? 4 : 1;
    return `<svg viewBox="0 0 240 150" role="img" aria-label="Illustrative FISH signal pattern"><rect width="240" height="150" rx="10" fill="#080d1c"/>${Array.from({ length: count }, (_, index) => {
      const x = count === 1 ? 120 : 58 + (index % 2) * 124;
      const y = count === 1 ? 75 : 42 + Math.floor(index / 2) * 66;
      return `<circle cx="${x}" cy="${y}" r="28" fill="#102a76" opacity=".9"/><circle cx="${x - 10}" cy="${y - 4}" r="4" fill="#ff526c"/><circle cx="${x + 10}" cy="${y + 6}" r="4" fill="#54f28c"/>`;
    }).join("")}</svg>`;
  }
  const rod = (x, y, h, tilt) => `<g transform="translate(${x} ${y}) rotate(${tilt} 6 ${h / 2})"><rect width="12" height="${h}" rx="6" fill="#d7dbd8"/><path d="M0 ${Math.round(h * 0.22)}h12M0 ${Math.round(h * 0.4)}h12M0 ${Math.round(h * 0.62)}h12M0 ${Math.round(h * 0.78)}h12" stroke="#5c6568" stroke-width="3"/></g>`;
  const rods = kind === "cases"
    ? [rod(24, 36, 78, -18), rod(52, 22, 96, 8), rod(86, 48, 62, -6), rod(118, 18, 104, 12), rod(154, 40, 70, -10), rod(188, 28, 88, 6)]
    : [rod(28, 24, 102, -8), rod(64, 36, 84, 7), rod(104, 18, 112, -4), rod(148, 32, 90, 9), rod(188, 22, 100, -6)];
  return `<svg viewBox="0 0 240 150" role="img" aria-label="Illustrative G-banded chromosomes"><rect width="240" height="150" rx="10" fill="#eef3f1"/>${rods.join("")}</svg>`;
}

function studentExerciseCases(labId, exerciseId) {
  return casesForExercise(state.catalog, labId, exerciseId).filter(isStudentCatalogCase);
}

function labLanding(labId) {
  const lab = labById(labId);
  const chromosome = SKILL_PRACTICE.chromosome;
  const stages = lab.id === "fish" ? [
    { title: "Enumeration probes", summary: "Count signals to assess chromosome or locus copy number. The easiest starting point.", skills: [SKILL_PRACTICE.fish[0], SKILL_PRACTICE.fish[2]] },
    { title: "Break-apart probes", summary: "Decide whether paired signals stay together or separate beyond the assay's threshold. A split does not identify the partner.", skills: [SKILL_PRACTICE.fish[1]] },
    { title: "Dual-fusion probes", summary: "Distinguish separate signals from co-localized fusions, and read the pattern by the specific assay design.", skills: [{ title: "BCR::ABL1 dual-fusion", summary: "Separate red and green signals versus fusion signals for one defined probe pair.", href: "#/lab/fish/dual-fusion/fish-dualfusion-bcrabl" }] },
    { title: "Signal quality", summary: "Clear, overlapping, weak, and closely spaced signals: decide what can be scored, then work a full slide at the microscope.", skills: [SKILL_PRACTICE.fish[3], { title: "Microscope workstation", summary: "Several fields, channel controls, zoom, and a scoring worksheet.", href: "#/lab/fish/field/fish-enum-cep21" }] },
  ] : lab.id === "chromosome" ? [
    { title: "Landmarks", summary: "Name pter, the arms, the centromere, and qter on a normal chromosome.", skills: [chromosome[1]] },
    { title: "Band assembly", summary: "Rebuild a chromosome and read one band address.", skills: [chromosome[2], chromosome[3], chromosome[0]] },
    { title: "Structural changes", summary: "Reverse one arm segment, then remove a single band that is not a disease case.", skills: [chromosome[4], chromosome[5]] },
  ] : [
    { title: "Chromosome foundations", summary: "Learn the landmarks, morphology, and band patterns that make a karyotype readable.", skills: [chromosome[1], chromosome[0], ...chromosome.slice(2)] },
    { title: "Build a karyotype", summary: "Pair a normal chromosome set before working through abnormal findings.", skills: SKILL_PRACTICE.karyotype.slice(0, 2) },
    { title: "ISCN essentials", summary: "Read chromosome count, sex complement, and cell-line notation.", skills: SKILL_PRACTICE.karyotype.slice(2) },
  ];
  const heading = lab.id === "fish" ? "FISH Lab" : lab.id === "chromosome" ? "Chromosome Analysis" : "Karyotyping Lab";
  const pathTitle = lab.id === "fish" ? "From probe strategy to interpretation" : lab.id === "chromosome" ? "From landmarks to a structural change" : "From chromosomes to karyotypes to ISCN";
  return `
    <main class="picker lab-page ${lab.id === "fish" ? "fish-page" : "karyotype-page"}">
      <p class="crumb"><a href="#/">Home</a> / ${escapeHtml(lab.title)}</p>
      <header class="lab-head">
        <p class="eyebrow">${escapeHtml(lab.kicker)}</p>
        <h2>${heading}</h2>
        <p class="lede">${escapeHtml(lab.summary)}</p>
      </header>
      ${labSectionTabs(lab.id, "learn")}
      <section class="learning-intro"><div><p class="eyebrow">A clear path through the skills</p><h3>${pathTitle}</h3><p>Choose a stage to begin. Each activity keeps its technical detail close to the task.</p></div><a class="learning-walkthrough" href="#/class/${lab.id}">Prefer a walkthrough? Start the guided introduction <span aria-hidden="true">›</span></a></section>
      <ol class="learning-path" aria-label="${escapeHtml(heading)} learning path">${stages.map((stage, index) => learningStageCard(stage, index, lab.id)).join("")}</ol>
      <p class="local-note">${lab.id === "fish" ? "Laboratory 2 teaches FISH only. Karyotype assembly is not part of this period." : "Laboratory 1 teaches chromosome analysis only. FISH scoring is Laboratory 2."} Disease investigations are in <a href="#/patients/${lab.id === "fish" ? "fish" : "karyotype"}">Casework</a>.</p>
    </main>`;
}

function labSectionTabs(labId, active) {
  const name = labId === "fish" ? "FISH Lab" : labId === "chromosome" ? "Chromosome Analysis" : "Karyotyping Lab";
  return `<nav class="lab-section-tabs" aria-label="${name} sections"><a href="${labPath(labId)}"${active === "learn" ? ' aria-current="page"' : ""}>Learn</a><a href="#/patients/${labId}"${active === "casework" ? ' aria-current="page"' : ""}>Casework</a></nav>`;
}

const DRAW_WALKTHROUGH = [
  "Open Draw with the Down syndrome teaching formula already loaded.",
  "Read the written ISCN: 47,XX,+21.",
  "Inspect the drawn karyogram: three chromosomes 21 and a female sex complement.",
  "Open the formula report for count, sex, gains, and placements.",
  "Export or save the formula report if you want a copy for class.",
  "Try another formula from the examples when you are ready to explore on your own.",
];

function chromosomeDrawView() {
  return `
    <main class="picker lab-page karyotype-page chromosome-draw-page">
      <p class="crumb"><a href="#/">Home</a> / Draw</p>
      <header class="lab-head">
        <p class="eyebrow">Standalone workspace</p>
        <h2>Draw</h2>
        <p class="lede">Enter an ISCN formula for your disease or finding. The karyogram is drawn, and a formula report lists the affected chromosomes, band placements, and net gains or losses. Export a PDF or save the report under My Case Reports.</p>
      </header>
      <article class="casework-entry-option draw-guided">
        <p class="eyebrow">With the instructor</p>
        <h3>Guided walkthrough · ${escapeHtml(DRAW_GUIDED_DISEASE)}</h3>
        <p><strong>${escapeHtml(DRAW_GUIDED_FORMULA)}</strong>. Free trisomy 21, the same teaching formula used in Karyotyping Casework. Draw starts with this example completed so you can read the karyogram and the formula report together.</p>
        <ol class="walkthrough-steps">${DRAW_WALKTHROUGH.map((step) => `<li>${escapeHtml(step)}</li>`).join("")}</ol>
        <button class="button primary" type="button" id="draw-open-guided">Open the Down syndrome drawing</button>
      </article>
      <div id="chromosome-workspace">${chromosomeWorkspaceHTML()}</div>
    </main>`;
}

function learningStageArt(labId, index) {
  if (labId === "fish") {
    const illustrations = [
      `<rect x="74" y="8" width="12" height="74" rx="6" fill="#d8dde3"/><path d="M74 25h12M74 43h12M74 62h12" stroke="#8c98a5" stroke-width="4"/><rect x="98" y="25" width="22" height="8" rx="4" fill="#d94b61"/><rect x="98" y="57" width="22" height="8" rx="4" fill="#45a66f"/>`,
      `<circle cx="92" cy="45" r="34" fill="#dce6f8" stroke="#9aabd1"/><circle cx="81" cy="39" r="4" fill="#d94b61"/><circle cx="101" cy="51" r="4" fill="#45a66f"/>`,
      `<circle cx="58" cy="31" r="19" fill="#dce6f8"/><circle cx="126" cy="31" r="19" fill="#dce6f8"/><circle cx="58" cy="74" r="19" fill="#dce6f8"/><circle cx="126" cy="74" r="19" fill="#dce6f8"/><circle cx="53" cy="29" r="3" fill="#d94b61"/><circle cx="64" cy="35" r="3" fill="#45a66f"/><circle cx="121" cy="29" r="3" fill="#d94b61"/><circle cx="132" cy="35" r="3" fill="#45a66f"/><circle cx="53" cy="72" r="3" fill="#d94b61"/><circle cx="64" cy="78" r="3" fill="#45a66f"/><circle cx="121" cy="72" r="3" fill="#d94b61"/><circle cx="132" cy="78" r="3" fill="#45a66f"/>`,
      `<rect x="27" y="18" width="130" height="18" rx="5" fill="#fff" stroke="#dedbea"/><circle cx="43" cy="27" r="4" fill="#d94b61"/><circle cx="56" cy="27" r="4" fill="#45a66f"/><text x="70" y="31" fill="#29354b" font-size="11">Signal pattern</text><rect x="27" y="49" width="130" height="18" rx="5" fill="#fff" stroke="#dedbea"/><circle cx="43" cy="58" r="4" fill="#d94b61"/><circle cx="56" cy="58" r="4" fill="#45a66f"/><text x="70" y="62" fill="#29354b" font-size="11">Interpretation</text>`,
    ];
    return `<svg viewBox="0 0 184 92" role="img" aria-label="Illustrative FISH learning diagram"><rect width="184" height="92" rx="10" fill="#f5f2fb"/>${illustrations[index] || illustrations[0]}</svg>`;
  }
  const illustrations = [
    `<g transform="translate(62 9) rotate(-8 14 35)"><rect width="14" height="72" rx="7" fill="#d6d9d8"/><path d="M0 17h14M0 28h14M0 46h14M0 58h14" stroke="#7e8585" stroke-width="4"/></g><g transform="translate(104 13) rotate(8 14 35)"><rect width="14" height="68" rx="7" fill="#c9cecf"/><path d="M0 14h14M0 25h14M0 43h14M0 54h14" stroke="#737b7d" stroke-width="4"/></g>`,
    `<g fill="#d7dbd8" stroke="#929997" stroke-width="2">${Array.from({ length: 12 }, (_, i) => `<rect x="${30 + (i % 6) * 22}" y="${18 + Math.floor(i / 6) * 30}" width="7" height="24" rx="3.5"/>`).join("")}</g><path d="M24 47h136" stroke="#bfc9c9" stroke-width="1"/>`,
    `<rect x="34" y="19" width="116" height="54" rx="9" fill="#e4f1ef"/><text x="92" y="53" text-anchor="middle" fill="#18334b" font-family="Georgia,serif" font-size="26">46, XX</text>`,
  ];
  return `<svg viewBox="0 0 184 92" role="img" aria-label="Illustrative chromosome learning diagram"><rect width="184" height="92" rx="10" fill="#eef6f4"/>${illustrations[index] || illustrations[0]}</svg>`;
}

function learningPracticeHref(diseaseId, labId) {
  const activity = labId === "fish" ? "fish" : "karyotype";
  return `#/disease/${encodeURIComponent(diseaseId)}/${activity}/learn/focus/${labId}`;
}

function learningAssessmentHref(diseaseId, labId) {
  return learningPracticeHref(diseaseId, labId).replace("/learn/", "/assessment/");
}

function diseasePracticeSection(labId) {
  const diseases = diseasesForMethod(state.diseases, state.activityLinks, state.activityPacks, state.maps, labId, state.probes);
  if (!diseases.length) return "";
  const heading = labId === "fish" ? "Practice a FISH pattern" : labId === "chromosome" ? "Practice a chromosome change" : "Practice a karyotype";
  const note = labId === "fish"
    ? "Practice keeps the reference library optional. Assessment closes it. Neither one is a case you file."
    : labId === "chromosome"
      ? "Practice keeps the reference library optional. Assessment closes it. The disease finding stays in this section."
      : "Practice compares chromosomes before interpretation and keeps the reference library optional. Assessment closes the library. Neither one is a case you file.";
  return `<section class="learning-diseases"><header><p class="eyebrow">Linked to a disease</p><h3>${heading}</h3><p>${note}</p></header><ul class="case-list">${diseases.map((disease) => `<li><a class="case-row" href="${learningPracticeHref(disease.id, labId)}"><span class="case-title">${escapeHtml(disease.disease_name)}</span><span class="muted">${escapeHtml(caseSubtitle(disease, labId, state.activityLinks, state.activityPacks, state.probes) || "Teaching exercise")}</span></a><a class="case-row" href="${learningAssessmentHref(disease.id, labId)}"><span class="case-title">Assessment</span><span class="muted">Same exercise. The reference library stays closed.</span></a></li>`).join("")}</ul></section>`;
}

function learningStageCard(stage, index, labId) {
  const [primary, ...more] = stage.skills;
  const moreList = more.length
    ? `<details class="learning-more"><summary>More skills in this stage (${more.length})</summary><ul>${more.map((skill) => `<li><a href="${skill.href}/learn"><strong>${escapeHtml(skill.title)}</strong><small>${escapeHtml(skill.summary || "")}</small></a></li>`).join("")}</ul></details>`
    : "";
  return `<li class="learning-stage"><article class="learning-stage-card"><div class="learning-stage-art">${learningStageArt(labId, index)}</div><p class="eyebrow">Stage ${index + 1}</p><h3>${escapeHtml(stage.title)}</h3><p>${escapeHtml(stage.summary)}</p><a class="button learning-stage-start ${labId === "fish" ? "fish-start" : ""}" href="${primary.href}/learn">Start ${escapeHtml(primary.title)} <span aria-hidden="true">›</span></a>${moreList}</article></li>`;
}

function patientCases() {
  try {
    const value = JSON.parse(localStorage.getItem("cyto.patientCases") || "[]");
    return Array.isArray(value) ? value.filter((item) => item && typeof item.id === "string") : [];
  } catch { return []; }
}

async function diseaseCaseImport(diseaseId, lab) {
  const disease = diseaseById(state.diseases, diseaseId);
  const item = canonicalCase(disease);
  if (!disease || !item) return null;
  const karyotype = item.representative_teaching_karyotype || {};
  const fishCaseId = state.activityLinks?.[disease.id]?.fish;
  const fish = fishCaseId ? state.activityPacks?.[fishCaseId]?.fish : null;
  const iscn = karyotype.iscn || item.example_notation?.find((notation) => /^\d/.test(String(notation || "").trim())) || "";
  if (lab === "fish" && !fish) return { blocked: "no-assay" };
  const pattern = fish?.case_specific_cutoff?.pattern || "";
  const references = (disease.references || []).map((reference) => ({
    label: String(reference.label || "Reference"),
    citation: String(reference.citation || ""),
    url: typeof reference.url === "string" && reference.url.startsWith("https://") ? reference.url : "",
  }));
  const probeTarget = (fish?.probe_ids || []).map((id) => {
    const probe = state.probes?.probes?.find((entry) => entry.probe_id === id);
    return probe ? `${probe.probe_name} (${probe.target_locus})` : id;
  }).join(", ");
  const images = await generatedTeachingImages(lab, disease, karyotype, fish, iscn);
  if (lab === "fish" && !images.length) return { blocked: "no-assay" };
  if (lab !== "fish" && !images.length) return { blocked: "undrawable" };
  const imageNote = lab === "fish"
    ? "Demonstration fluorescence fields were drawn from this disease’s teaching nuclei. They are not microscope captures."
    : "The karyogram and metaphase were drawn from the Disease Atlas teaching ISCN and the GRCh38 band map. They are not a microscope capture.";
  const finding = lab === "fish"
    ? [iscn && `Teaching ISCN: ${iscn}`, pattern && `Expected teaching FISH pattern: ${pattern}`, fish?.expected_interpretation && `Teaching interpretation: ${String(fish.expected_interpretation).replace(/_/g, " ")}`, item.final_interpretation].filter(Boolean).join("\n")
    : [iscn, item.final_interpretation && item.final_interpretation !== iscn ? item.final_interpretation : ""].filter(Boolean).join("\n");
  const specimen = lab === "fish"
    ? `Demonstration ${fish?.specimen_type || "interphase"} field`
    : "Demonstration metaphase";
  const assayNames = { enumeration: "Enumeration", "break-apart": "Break-apart", "dual-fusion": "Dual-fusion", "locus-specific": "Locus-specific" };
  const history = [
    "Curated teaching template. Generated graphics are demonstration material, not a patient specimen.",
    item.patient_case_label,
    item.visual_change && `What the preparation shows: ${item.visual_change}`,
    item.mechanism && `Mechanism: ${item.mechanism}`,
    item.student_should_notice && `Look for: ${item.student_should_notice}`,
    typeof item.genes === "string" && item.genes && `Genes named in this record: ${item.genes}`,
    disease.teaching_notes,
    imageNote,
  ].filter(Boolean).join("\n\n").slice(0, 4000);
  return {
    label: `${disease.disease_name} — ${item.case_title || item.final_interpretation || "teaching case"} (teaching template)`,
    specimen: specimen.slice(0, 100),
    assay: lab === "fish" ? (assayNames[fish?.assay_type] || "Other / not recorded") : "",
    target: lab === "fish" ? probeTarget : "",
    finding,
    history,
    images,
    source: {
      kind: "curated-teaching-template",
      catalog: "Disease Atlas",
      diseaseId: disease.id,
      diseaseName: disease.disease_name,
      caseName: item.case_title || "Canonical teaching case",
      importedAt: new Date().toISOString(),
      imageNote,
      iscn,
      iscnSource: iscn ? "Disease Atlas teaching karyotype" : "",
      references,
    },
  };
}

async function generatedTeachingImages(lab, disease, karyotype, fish, formula) {
  try {
    if (lab === "fish") return await generatedFishImages(fish);
    if (formula) {
      const drawn = await generatedMetaphaseFromFormula(formula, state.templates);
      if (drawn) return [drawn];
    }
    if (!karyotype?.sex) return [];
    const image = await generatedMetaphaseImage({
      case_id: `${disease.id}-import`,
      chromosome_set: {
        sex: karyotype.sex,
        copy_number: karyotype.copy_number || {},
        variants: karyotype.variants || {},
      },
    }, state.templates);
    return image ? [image] : [];
  } catch {
    return [];
  }
}

function karyogramPreview(text) {
  const report = exploreISCN(formulaText(text) || text);
  const line = resolveClones(report).find((item) => item.sex && !/^(IDEM|SL|SDL\d*)$/i.test(item.sex));
  return line ? karyogramHTML(line) : "";
}

function generatedImagePreview(images = []) {
  if (!images.length) return `<p class="muted">No demonstration image could be drawn from this record.</p>`;
  return `<div class="patient-images import-generated-images">${images.map((image) => `<figure><img src="${escapeHtml(image.data)}" alt="${escapeHtml(specimenImageAlt(image))}"><figcaption>${escapeHtml(image.name)}</figcaption></figure>`).join("")}</div>`;
}

function specimenImageAlt(image) {
  return image?.generated ? "Generated demonstration image, not a clinical specimen" : "User-provided specimen image";
}

function validSpecimenImages(images = []) {
  return images.filter((image) => /^data:image\/(png|jpeg|webp);base64,/i.test(image.data || ""));
}

function specimenImageSummary(images = []) {
  const valid = validSpecimenImages(images);
  if (!valid.length) return "";
  const generated = valid.filter((image) => image.generated).length;
  const uploaded = valid.length - generated;
  const parts = [];
  if (generated) parts.push(`${generated} generated demonstration image${generated === 1 ? "" : "s"}`);
  if (uploaded) parts.push(`${uploaded} user-provided image${uploaded === 1 ? "" : "s"}`);
  return `<p>${parts.join(" and ")}</p>`;
}

function diseaseBrief(current) {
  const disease = diseaseById(state.diseases, current.source?.diseaseId);
  const item = canonicalCase(disease);
  if (!disease || !item) return null;
  return {
    name: disease.disease_name,
    caseTitle: item.case_title || "",
    interpretation: item.final_interpretation || "",
    notice: item.student_should_notice || "",
    mechanism: item.mechanism || "",
    visual: item.visual_change || "",
    missing: item.material_missing || "",
    added: item.material_added || "",
    locus: item.primary_locus || "",
    region: item.specific_region || "",
    abnormality: item.abnormality_type || "",
    chromosomes: item.primary_chromosome || [],
  };
}

function intakeFact(label, value) {
  if (!value) return "";
  return `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`;
}

/** Facts and clinical context for the karyotype Case page. The expected finding stays off this page. */
function karyotypeIntakeMarkup(current, specimenImageCount) {
  const mode = caseMode(current);
  const disease = diseaseById(state.diseases, current.source?.diseaseId);
  const item = canonicalCase(disease);
  const kind = item?.kind === "acquired" ? "Acquired" : item ? "Constitutional" : "";
  const generated = (current.images || []).some((image) => image.generated);
  const imageNote = !specimenImageCount
    ? "No metaphase image is attached."
    : generated
      ? "Generated demonstration metaphase, drawn from the teaching band map. Not a microscope photograph."
      : "Image supplied with this case.";
  const steps = [
    "Open the Karyotype page and examine the metaphase.",
    "Count the chromosomes and record the sex-chromosome complement.",
    "Compare the homologs and describe what looks different.",
    "Use the Ideogram page when a band or a segment changes. A whole-chromosome change may not need one.",
    "Write your own ISCN and interpretation.",
    mode === "unknown" ? "Say what condition the findings may support." : "",
    "Export the report and send the PDF to your instructor.",
  ].filter(Boolean);
  const guidedSteps = mode === "guided"
    ? String(current.history || "").split("\n").map((line) => line.replace(/^\d+\.\s*/, "").trim()).filter(Boolean)
    : [];
  const references = mode === "unknown" ? [] : (disease?.references || []).filter((reference) => reference?.citation);
  return `<div class="intake-layout" id="case-intake">
    <div class="intake-facts">
      <section class="patient-section"><h3>This study</h3>
        <dl class="case-brief-list">
          ${intakeFact("Method", "G-banded metaphase karyotype")}
          ${intakeFact("Specimen", current.specimen)}
          ${intakeFact("Origin", kind)}
          ${intakeFact("Image", imageNote)}
        </dl>
      </section>
      <section class="patient-section"><h3>Your assignment</h3><p>${escapeHtml(assignmentExpectation(mode))}</p>
        <ol class="walkthrough-steps">${steps.map((step) => `<li>${escapeHtml(step)}</li>`).join("")}</ol>
        <p class="muted">The expected ISCN is not on this page. You write it from the metaphase.</p>
      </section>
      ${guidedSteps.length > 1 ? `<section class="patient-section"><h3>Walkthrough</h3><ol class="walkthrough-steps">${guidedSteps.map((step) => `<li>${escapeHtml(step)}</li>`).join("")}</ol></section>` : ""}
      ${mode === "own" && current.history ? `<section class="patient-section"><h3>Case history</h3><p>${escapeHtml(current.history)}</p></section>` : ""}
    </div>
    <div class="intake-context">
      ${diseaseBackgroundMarkup(current)}
      ${references.length ? `<section class="patient-section"><h3>Further reading</h3><ul class="refs">${references.map((reference) => `<li>${reference.url ? `<a href="${escapeHtml(reference.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(reference.label)}: ${escapeHtml(reference.citation)}</a>` : `<span>${escapeHtml(reference.label)}: ${escapeHtml(reference.citation)}</span>`}</li>`).join("")}</ul><p class="muted">These are sources you may consult. They do not fill the report.</p></section>` : ""}
      ${mode === "guided" ? `<section class="patient-section"><h3>Guided example</h3><p>This walkthrough is already filled with the teaching observations, ISCN, interpretation, and report fields. Move through each stage with the instructor, then open <strong>Report</strong> to see a completed casework packet.</p></section>` : ""}
    </div>
  </div>`;
}

/** Clinical background for the linked disease. Blinded cases get the presentation only, without the name or mechanism. */
function diseaseBackgroundMarkup(current) {
  const disease = diseaseById(state.diseases, current.source?.diseaseId);
  const background = disease?.clinical_background;
  if (!background) return "";
  if (caseMode(current) === "unknown" && !current.source?.revealed) {
    return background.presentation ? `<section class="patient-section disease-background"><h3>Referral presentation</h3><p>${escapeHtml(background.presentation)}</p><small>Typical features for this referral. The condition itself is withheld in this case.</small></section>` : "";
  }
  return `<section class="patient-section disease-background"><h3>About ${escapeHtml(disease.disease_name)}</h3>${background.summary ? `<p>${escapeHtml(background.summary)}</p>` : ""}<dl class="case-brief-list">${background.presentation ? `<dt>Typical features</dt><dd>${escapeHtml(background.presentation)}</dd>` : ""}${background.testing ? `<dt>Why test</dt><dd>${escapeHtml(background.testing)}</dd>` : ""}</dl><small>General teaching background, not specific to this patient.</small></section>`;
}

function caseSourceMarkup(source) {
  if (!source) return "";
  const formula = source.iscn ? `<p><strong>ISCN</strong> <code>${escapeHtml(source.iscn)}</code></p><p>ISCN source: ${escapeHtml(source.iscnSource || "Disease Atlas teaching karyotype")}</p>` : "";
  if (!source.references?.length) return `<section class="case-import-source"><h4>${escapeHtml(source.catalog || "Case formula")}</h4>${formula}${source.imageNote ? `<p>${escapeHtml(source.imageNote)}</p>` : ""}<p class="muted">This is a study drawing from a written formula, not an individual patient result.</p></section>`;
  return `<section class="case-import-source"><h4>Imported from ${escapeHtml(source.catalog || "Disease Atlas")}</h4><p>${escapeHtml(source.diseaseName || "")} · ${escapeHtml(source.caseName || "")}</p>${formula}${source.imageNote ? `<p>${escapeHtml(source.imageNote)}</p>` : ""}<ul>${source.references.map((reference) => `<li>${reference.url ? `<a href="${escapeHtml(reference.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(reference.label)}: ${escapeHtml(reference.citation)}</a>` : `<span>${escapeHtml(reference.label)}: ${escapeHtml(reference.citation)}</span>`}</li>`).join("")}</ul><small>References stay citations. The karyogram and metaphase are drawn from the stored teaching ISCN.</small></section>`;
}

const KARYOTYPE_TABS = ["intake", "karyotype", "affected", "ideogram", "interpretation", "report"];
const FISH_TABS = ["intake", "fish", "interpretation", "report"];
const TAB_LABELS = { intake: "Case", karyotype: "Karyotype", affected: "Affected", ideogram: "Ideogram", fish: "FISH", interpretation: "Interpretation", report: "Report" };

function workspaceTabNav(tabs, id) {
  const index = tabs.indexOf(id);
  const prev = tabs[index - 1];
  const next = tabs[index + 1];
  return `<p class="case-tab-nav">${prev ? `<button type="button" class="button" data-case-tab="${prev}">Back to ${TAB_LABELS[prev]}</button>` : "<span></span>"}${next ? `<button type="button" class="button primary" data-case-tab="${next}">Continue to ${TAB_LABELS[next]}</button>` : ""}</p>`;
}

function readCaseIscnDraft(root, formNode, fallback = "") {
  const field = root?.querySelector?.("#case-iscn-draft") || formNode?.elements?.iscnDraft;
  const value = field?.value?.trim?.() || "";
  return value || formulaText(fallback) || "";
}

function karyotypeWorkspaceTabs(current, route, back, labName, specimenImageCount, imageWorkbench) {
  const active = KARYOTYPE_TABS.includes(route.tab) ? route.tab : "intake";
  const panel = (id, body) => `<section class="case-tab-panel" data-case-panel="${id}" ${id === active ? "" : "hidden"}>${body}${workspaceTabNav(KARYOTYPE_TABS, id)}</section>`;
  const field = (name, value, extra = "") => `name="${name}" form="patient-observation-form" ${extra} value="${escapeHtml(value || "")}"`;
  return `<main class="picker patient-page patient-workspace-page karyotype-page karyotype-tabbed">
    <header class="patient-workspace-header"><div><p class="crumb"><a href="${back}">Casework</a> / ${escapeHtml(current.label || "Case")}</p><p class="eyebrow">${labName} · Case workspace</p><h2>${escapeHtml(current.label || "My case")}</h2><p>${escapeHtml(current.specimen || "De-identified case")}</p></div><a class="button" href="#/patients/${route.lab}/${encodeURIComponent(current.id)}/edit">Edit case details</a></header>
    ${caseStagesMarkup(current, { active })}
    <div class="case-tab-panels">
      ${panel("intake", karyotypeIntakeMarkup(current, specimenImageCount))}
      ${panel("karyotype", `<div class="patient-image-column" id="patient-specimen-workbench">
        ${imageWorkbench}
        <section class="patient-section"><h3>What you counted</h3><p class="muted">These notes stay with the case. They are not checked against an answer.</p>
          <div class="karyotype-observation-grid">
            <label>Chromosome count<input ${field("observedCount", current.observedCount, 'inputmode="numeric" maxlength="12" placeholder="e.g., 46"')}></label>
            <label>Sex chromosome complement<input ${field("observedSex", current.observedSex, 'maxlength="30" placeholder="e.g., XX or XY"')}></label>
          </div>
          <label class="stack">Visible chromosome finding<textarea name="observation" form="patient-observation-form" rows="4" maxlength="2000" placeholder="Describe the chromosomes, bands, and evidence you can see.">${escapeHtml(current.observation || "")}</textarea></label>
          ${chromosomeReadMarkup(current)}
          <button class="button primary" type="submit" form="patient-observation-form">Save observations</button>
        </section>
      </div>`)}
      ${panel("affected", affectedChromosomesTabMarkup(current))}
      ${panel("ideogram", `<div class="patient-image-column">${caseReportMarkup()}${casePictureHTML(current)}<p class="muted iscn-draft-note">Mark bands after you remake changed chromosomes. The drawn karyogram follows the ISCN draft on Interpretation.</p></div>`)}
      ${panel("interpretation", `<section class="patient-section analysis-panel"><h3>Interpretation</h3><p class="muted">Write the finding in your own words. Nothing on this page tells you whether it is correct.</p>
        <form id="patient-observation-form" class="patient-form observation-form">
          <label>Your working classification<select name="classification"><option value="">Not classified</option>${["No visible change", "Numerical finding", "Structural finding", "Uncertain / needs review"].map((item) => `<option ${current.classification === item ? "selected" : ""}>${item}</option>`).join("")}</select></label>
          <label>ISCN draft<textarea id="case-iscn-draft" name="iscnDraft" rows="2" maxlength="500" placeholder="Write your working ISCN here.">${escapeHtml(current.iscnDraft || "")}</textarea></label>
          <button class="button" id="draw-draft-metaphase" type="button">Draw metaphase from this ISCN</button>
          <details class="analyze-karyotype" id="analyze-karyotype"><summary>Analyze karyotype (optional)</summary><p class="muted">Reads only your ISCN draft: net gains and losses, breakpoints, complexity, clones, and writing checks. It does not compare your draft with the case answer.</p><button class="button" id="analyze-draft" type="button">Analyze my draft</button><div id="analyze-karyotype-body" aria-live="polite"></div></details>
          <fieldset class="case-confirm"><legend>Your confirmation</legend><label><input name="confirmImage" type="checkbox" ${current.caseReview?.image ? "checked" : ""}> I compared the drawing with the metaphase image.</label><label><input name="confirmFormula" type="checkbox" ${current.caseReview?.formula ? "checked" : ""}> I accept the written count, sex complement, and rearrangements.</label><label><input name="confirmEvents" type="checkbox" ${current.caseReview?.events ? "checked" : ""}> I accept the listed gains, losses, and breakpoints.</label></fieldset>
          <label>Interpretation notes<textarea name="interpretation" rows="4" maxlength="2000" placeholder="Your reasoning or questions for follow-up.">${escapeHtml(current.interpretation || "")}</textarea></label>
          ${caseMode(current) === "unknown" ? `<label>What condition might these findings support?<textarea name="possibleAssociation" rows="2" maxlength="500" placeholder="Your own suggestion from the evidence. This is not scored against an answer key.">${escapeHtml(current.possibleAssociation || "")}</textarea></label>` : ""}
          <button class="button primary" type="submit">Save observations</button>
        </form>
        <p class="notice patient-safety-note">Your notes and draft remain separate from any reported finding. The app does not diagnose or automatically interpret the specimen.</p>
      </section>`)}
      ${panel("report", caseSubmissionMarkup(current))}
    </div>
    ${caseMode(current) === "guided" && current.source?.answerNotes ? `<section class="patient-section teaching-answer"><h3>Teaching notes</h3><p class="case-finding">${escapeHtml(current.source.answerNotes)}</p><small>Background for this guided example. The case stages and report are already filled.</small></section>` : ""}
    <footer class="patient-workspace-actions">${teachingPracticeLink(current)}<a class="button" href="${back}">Back to Casework</a></footer>
  </main>`;
}

function fishIntakeMarkup(current) {
  const mode = caseMode(current);
  const disease = diseaseById(state.diseases, current.source?.diseaseId);
  const copy = disease ? blindedTeachingCopy(disease, "fish") : null;
  const bench = caseworkFish(current);
  const named = mode === "explore" || mode === "guided";
  const probes = named && bench?.probes?.length
    ? bench.probes.map((probe) => `${probe.probe_name} at ${probe.target_locus}`).join("; ")
    : mode === "own" ? current.target || "" : "";
  const imageNote = bench
    ? "Generated demonstration fluorescence, drawn from the teaching nuclei. Not a microscope photograph."
    : (current.images || []).some((image) => image.generated)
      ? "Generated demonstration image. Not a microscope photograph."
      : (current.images || []).length
        ? "Image supplied with this case."
        : "No fluorescence image is attached.";
  const steps = [
    "Open the FISH page and examine each nucleus.",
    "Decide which nuclei are scorable, and record why the others are not.",
    "Record the signal pattern you see.",
    "Write the interpretation from your own tallies.",
    mode === "unknown" ? "Say what condition the findings may support." : "",
    "Export the report and send the PDF to your instructor.",
  ].filter(Boolean);
  const guidedSteps = mode === "guided"
    ? String(current.history || "").split("\n").map((line) => line.replace(/^\d+\.\s*/, "").trim()).filter(Boolean)
    : [];
  const references = mode === "unknown" ? [] : (disease?.references || []).filter((reference) => reference?.citation);
  return `<div class="intake-layout" id="case-intake">
    <div class="intake-facts">
      <section class="patient-section"><h3>This study</h3>
        <dl class="case-brief-list">
          ${intakeFact("Method", copy?.assay || current.assay || "FISH")}
          ${intakeFact("Specimen", current.specimen)}
          ${intakeFact("Origin", copy?.kind || "")}
          ${intakeFact("Probes", probes)}
          ${intakeFact("Image", imageNote)}
        </dl>
      </section>
      <section class="patient-section"><h3>Your assignment</h3><p>${escapeHtml(assignmentExpectation(mode))}</p>
        <ol class="walkthrough-steps">${steps.map((step) => `<li>${escapeHtml(step)}</li>`).join("")}</ol>
        <p class="muted">The expected signal pattern is not on this page. You record it from the nuclei.</p>
      </section>
      ${guidedSteps.length > 1 ? `<section class="patient-section"><h3>Walkthrough</h3><ol class="walkthrough-steps">${guidedSteps.map((step) => `<li>${escapeHtml(step)}</li>`).join("")}</ol></section>` : ""}
      ${mode === "own" && current.history ? `<section class="patient-section"><h3>Case history</h3><p>${escapeHtml(current.history)}</p></section>` : ""}
    </div>
    <div class="intake-context">
      ${diseaseBackgroundMarkup(current)}
      ${references.length ? `<section class="patient-section"><h3>Further reading</h3><ul class="refs">${references.map((reference) => `<li>${reference.url ? `<a href="${escapeHtml(reference.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(reference.label)}: ${escapeHtml(reference.citation)}</a>` : `<span>${escapeHtml(reference.label)}: ${escapeHtml(reference.citation)}</span>`}</li>`).join("")}</ul><p class="muted">These are sources you may consult. They do not fill the report.</p></section>` : ""}
      ${mode === "guided" ? `<section class="patient-section"><h3>Guided example</h3><p>This walkthrough is already filled with scored nuclei, interpretation, and report fields. Move through each stage with the instructor, then open <strong>Report</strong> to see a completed FISH casework packet.</p></section>` : ""}
    </div>
  </div>`;
}

function fishWorkspaceTabs(current, route, back, labName) {
  const active = FISH_TABS.includes(route.tab) ? route.tab : "intake";
  const panel = (id, body) => `<section class="case-tab-panel" data-case-panel="${id}" ${id === active ? "" : "hidden"}>${body}${workspaceTabNav(FISH_TABS, id)}</section>`;
  const bench = caseworkWorkstationContext(current);
  const specimenImageCount = (current.images || []).filter((image) => /^data:image\/(png|jpeg|webp);base64,/i.test(image.data || "")).length;
  const scope = bench
    ? `<section id="patient-specimen-workbench" class="patient-section fish-workstation-section"><header><p class="eyebrow">Fluorescence microscope</p><h3>Examine and score</h3></header>${workstationHTML({ ...bench, part: "scope" })}</section>`
    : `${specimenImageCount ? patientFishImageWorkbench(current.images, route.lab, current.id) : `<section id="patient-specimen-workbench" class="patient-section specimen-empty"><h3>Fluorescence field</h3><div class="specimen-empty-state"><span aria-hidden="true">▧</span><strong>No specimen image attached</strong><p>Add a de-identified fluorescence image to record your own signal observations.</p><a class="button" href="#/patients/${route.lab}/${encodeURIComponent(current.id)}/edit">Add an image</a></div></section>`}${patientFishNucleusScoring(current)}`;
  const notes = `<form id="patient-observation-form" class="patient-form observation-form">
    ${bench ? "" : `<details class="fish-summary-entry"><summary>Enter summarized counts instead</summary><p class="muted">Use this when the source already provides totals and individual nuclei are unavailable.</p><label>Scorable nuclei across all fields<input name="scorableNuclei" type="number" min="0" max="9999" value="${escapeHtml(current.scorableNuclei ?? "")}"></label><fieldset class="fish-pattern-fieldset"><legend>Signal patterns and counts</legend><div id="fish-pattern-rows">${fishPatternRows(current.fishPatterns)}</div><button id="add-fish-pattern" class="button" type="button">＋ Add signal pattern</button></fieldset></details>`}
    <label>Observation notes<textarea name="observation" rows="3" maxlength="2000">${escapeHtml(current.observation || "")}</textarea></label>
    <label>Interpretation notes<textarea name="interpretation" rows="4" maxlength="2000" placeholder="Your reasoning, in addition to the assay conclusion.">${escapeHtml(current.interpretation || "")}</textarea></label>
    ${caseMode(current) === "unknown" ? `<label>What condition might these findings support?<textarea name="possibleAssociation" rows="2" maxlength="500" placeholder="Your own suggestion from the evidence. This is not scored against an answer key.">${escapeHtml(current.possibleAssociation || "")}</textarea></label>` : ""}
    <button class="button primary" type="submit">Save observations</button>
  </form>`;
  return `<main class="picker patient-page patient-workspace-page fish-page fish-tabbed">
    <header class="patient-workspace-header"><div><p class="crumb"><a href="${back}">Casework</a> / ${escapeHtml(current.label || "Case")}</p><p class="eyebrow">${labName} · Case workspace</p><h2>${escapeHtml(current.label || "My case")}</h2><p>${[current.specimen, current.assay].filter(Boolean).map(escapeHtml).join(" · ") || "De-identified case"}</p></div><a class="button" href="#/patients/${route.lab}/${encodeURIComponent(current.id)}/edit">Edit case details</a></header>
    ${caseStagesMarkup(current, { active })}
    <div class="case-tab-panels">
      ${panel("intake", fishIntakeMarkup(current))}
      ${panel("fish", scope)}
      ${panel("interpretation", `<section class="patient-section analysis-panel fish-analysis-panel"><h3>Interpretation</h3><p class="muted">Write what the signals show. Nothing on this page tells you whether it is correct.</p>${bench ? workstationHTML({ ...bench, part: "interpret" }) : ""}${notes}<p class="notice patient-safety-note">Your notes stay separate from any reported finding. The app does not diagnose or automatically interpret the specimen.</p></section>`)}
      ${panel("report", caseSubmissionMarkup(current, { fishOpen: bench ? caseworkFishReport(current)?.summary?.open : null }))}
    </div>
    ${caseMode(current) === "guided" && current.source?.answerNotes ? `<section class="patient-section teaching-answer"><h3>Teaching notes</h3><p class="case-finding">${escapeHtml(current.source.answerNotes)}</p><small>Background for this guided example. The case stages and report are already filled.</small></section>` : ""}
    <footer class="patient-workspace-actions">${teachingPracticeLink(current)}<a class="button" href="${back}">Back to Casework</a></footer>
  </main>`;
}

function patientWorkspaceView(current, route, back, labName) {
  if (route.lab === "fish") return fishWorkspaceTabs(current, route, back, labName);
  const specimenImageCount = (current.images || []).filter((image) => /^data:image\/(png|jpeg|webp);base64,/i.test(image.data || "")).length;
  const imageWorkbench = specimenImageCount
    ? `<div id="patient-specimen-workbench">${patientKaryogramMarkup(current)}</div>`
    : `<section id="patient-specimen-workbench" class="patient-section specimen-empty"><h3>Metaphase image</h3><div class="specimen-empty-state"><span aria-hidden="true">▧</span><strong>No specimen image attached</strong><p>Add a de-identified image to make manual chromosome selection and comparison available.</p><a class="button" href="#/patients/${route.lab}/${encodeURIComponent(current.id)}/edit">Add an image</a></div></section>`;
  return karyotypeWorkspaceTabs(current, route, back, labName, specimenImageCount, imageWorkbench);
}

/** Blinded chooser copy. The disease name, chromosomes, and probe targets stay off this card. */
/** Compare the student's own recorded count and sex with their own draft. Never uses the case answer. */
function observationComparisonHTML(current, analysis) {
  const clone = analysis?.clones?.[0];
  if (!clone) return "";
  const notes = [];
  const counted = Number(String(current?.observedCount || "").trim());
  if (Number.isFinite(counted) && counted > 0) {
    if (clone.countRange) {
      if (counted < clone.countRange[0] || counted > clone.countRange[1]) notes.push(`You recorded ${counted} chromosomes. Your draft writes the range ${clone.countRange.join("~")}.`);
    } else if (counted !== clone.count) notes.push(`You recorded ${counted} chromosomes. Your draft writes ${clone.count}.`);
  }
  const sex = String(current?.observedSex || "").trim().toUpperCase();
  if (sex && clone.sex && sex !== String(clone.sex).toUpperCase()) notes.push(`You recorded the sex complement ${sex}. Your draft writes ${clone.sex}.`);
  if (!notes.length) return "";
  return `<section class="ka-section"><h4>Your observations and your draft</h4><ul>${notes.map((note) => `<li>${escapeHtml(note)}</li>`).join("")}</ul><p class="muted">Check which one matches the metaphase. Neither is compared with an answer.</p></section>`;
}

function blindedTeachingCopy(disease, labId = "karyotype") {
  const item = canonicalCase(disease) || {};
  const kind = item.kind === "acquired" ? "Acquired" : "Constitutional";
  const fishId = state.activityLinks?.[disease.id]?.fish;
  const fish = labId === "fish" && fishId ? state.activityPacks?.[fishId]?.fish : null;
  const assayNames = {
    enumeration: "Enumeration",
    "break-apart": "Break-apart",
    "dual-fusion": "Dual-fusion",
    deletion: "Target / reference deletion",
    sex: "Sex-chromosome enumeration",
    amplification: "Amplification",
  };
  const specimen = fish?.specimen_type === "interphase" ? "Interphase" : fish?.specimen_type === "metaphase" ? "Metaphase" : "";
  const assay = fish ? `${specimen ? `${specimen} FISH` : "FISH"} · ${assayNames[fish.assay_type] || "Assay"}` : "Metaphase karyotype";
  const referralContext = String(item.assigned_context || "").trim();
  const search = [kind, assay].filter(Boolean).join(" ");
  return { where: "Cytogenetic teaching case", kind, assay, search, referralContext };
}

function teachingAnswerHidden(source) {
  return source?.kind === "curated-teaching-template" && source.revealed === false && Boolean(source.answerFinding);
}

function visibleFinding(record) {
  if (!record?.finding) return "";
  if (teachingAnswerHidden(record.source) && record.finding === record.source.answerFinding) return "";
  return record.finding;
}

/** Formulas written on their own, or after a label such as "Teaching ISCN:". */
function formulaCandidates(text) {
  const lines = String(text || "").split(/\n+/).map((line) => line.trim()).filter(Boolean);
  const found = [];
  for (const line of lines) {
    const embedded = line.match(/(?:^|:\s*)((?:mos\s+|chi\s+)?\d+\s*,\s*\S(?:[^\n]*\S)?)/i);
    if (embedded) found.push(embedded[1].trim());
  }
  const plain = formulaText(text);
  if (plain && !found.includes(plain)) found.push(plain);
  return [...new Set(found)];
}

/** The written formula, without a following plain-language line. */
function formulaText(text) {
  const lines = String(text || "").split(/\n+/).map((line) => line.trim()).filter(Boolean);
  return lines.find((line) => /^(?:mos\s+|chi\s+)?\d+\s*,/i.test(line)) || lines[0] || "";
}

async function sameDrawing(first, second) {
  const pixels = async (data) => {
    const image = new Image();
    image.src = data;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = 240;
    canvas.height = Math.max(1, Math.round(240 * image.naturalHeight / image.naturalWidth));
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    return ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  };
  try {
    const [a, b] = await Promise.all([pixels(first), pixels(second)]);
    if (a.length !== b.length) return false;
    let differing = 0;
    for (let i = 0; i < a.length; i += 4) if (Math.abs(a[i] - b[i]) > 40) differing += 1;
    return differing < 5;
  } catch {
    return false;
  }
}

/** Older generated spreads were saved without cut boxes. Redraw from the case formula and keep the boxes only if the redraw is identical. */
async function recoverSpreadCuts(current) {
  const texts = [current.source?.answerFinding, current.source?.iscn, current.finding].flatMap(formulaCandidates);
  let changed = false;
  for (const image of current.images) {
    const identified = image.cuts?.some((box) => /^(?:[1-9]|1\d|2[0-2]|X|Y)$/.test(String(box.truth || "")));
    if (!image.generated || identified) continue;
    for (const text of new Set(texts)) {
      const drawn = await generatedMetaphaseFromFormula(text, state.templates).catch(() => null);
      if (drawn?.cuts?.length && await sameDrawing(drawn.data, image.data)) {
        image.cuts = drawn.cuts;
        changed = true;
        break;
      }
    }
  }
  if (!changed) return;
  const allCases = JSON.parse(localStorage.getItem("cyto.patientCases") || "[]");
  localStorage.setItem("cyto.patientCases", JSON.stringify(allCases.map((item) => item.id === current.id ? { ...item, images: current.images } : item)));
}

function boxOverlap(a, b) {
  const w = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  if (w <= 0 || h <= 0) return 0;
  return (w * h) / Math.min(a.width * a.height, b.width * b.height);
}

/** Generated images become the specimen. The formula they were drawn from is not kept on the image. */
function specimenEvidence(images = []) {
  return images.map(({ formula, mosaic, note, ...image }) => (image.generated ? { ...image, specimen: true } : image));
}

function blindedTeachingRecord(imported, disease, index, labId) {
  const copy = blindedTeachingCopy(disease, labId);
  const number = String(Math.max(0, index) + 1).padStart(2, "0");
  return {
    ...imported,
    images: specimenEvidence(imported.images),
    label: `Case ${number} · ${copy.kind} teaching case`,
    specimen: labId === "fish" ? imported.specimen : "Metaphase (generated teaching specimen)",
    finding: "",
    history: [
      copy.referralContext || "Referral context was not supplied for this teaching template.",
      "Unknown specimen. The condition is not named. Record what the specimen shows, write the finding, and say what those findings may support. You may use references. They do not fill the report.",
    ].join("\n\n"),
    source: {
      ...imported.source,
      mode: "unknown",
      iscn: "",
      revealed: false,
      answerFinding: imported.finding,
      answerTitle: imported.source?.diseaseName || "",
      answerNotes: imported.history || "",
      answerImages: [],
    },
  };
}

/** Diagnosis known; student fields are pre-filled so the walkthrough ends on a completed report. */
function guidedTeachingRecord(imported, disease, labId) {
  const steps = labId === "fish" ? FISH_WALKTHROUGH : KARYOTYPE_WALKTHROUGH;
  const item = canonicalCase(disease);
  const iscn = imported.source?.iscn
    || item?.representative_teaching_karyotype?.iscn
    || item?.example_notation?.find((notation) => /^\d/.test(String(notation || "").trim()))
    || "";
  const sex = item?.representative_teaching_karyotype?.sex || (iscn.match(/,(X{1,3}Y?|XYY?)/)?.[1] || "");
  const count = iscn.match(/^(\d+)/)?.[1] || "";
  const base = {
    ...imported,
    images: specimenEvidence(imported.images),
    label: "Guided walkthrough".slice(0, 100),
    finding: imported.finding || iscn,
    history: steps.join("\n"),
    reportMeta: {
      studentName: "Guided example",
      studentId: "demo",
      ...(labId === "fish" ? {} : { metaphasesExamined: "1", metaphasesKaryotyped: "1" }),
      limitations: labId === "fish"
        ? "Demonstration fluorescence from teaching nuclei. Not a patient specimen. Enumeration does not replace a karyotype when mechanism or other chromosomes matter."
        : "Demonstration metaphase drawn from the teaching ISCN. Not a patient specimen. FISH was not part of this karyotype example.",
    },
    source: {
      ...imported.source,
      mode: "guided",
      iscn,
      revealed: true,
      answerFinding: imported.finding || iscn,
      answerTitle: disease.disease_name,
      answerNotes: imported.history || "",
      answerImages: [],
    },
  };
  if (labId === "fish") {
    const packId = state.activityLinks?.[disease.id]?.fish;
    const pack = packId ? state.activityPacks?.[packId] : null;
    const seed = seedFrom(`guided-${disease.id}-fish`);
    const scene = pack?.fish ? buildScene(pack.fish, seed, { advanced: false }) : null;
    const fishWorkstation = scene ? completedWorkstation(pack.fish, scene, seed) : null;
    const conclusion = fishWorkstation?.answers?.conclusion || "";
    return {
      ...base,
      interpretation: conclusion,
      fishWorkstation,
      fishNuclei: [],
      scorableNuclei: fishWorkstation
        ? String(Object.values(fishWorkstation.records || {}).filter((row) => row.decision === "score").length)
        : "",
      fishPatterns: pack?.fish?.case_specific_cutoff?.pattern
        ? [{ pattern: pack.fish.case_specific_cutoff.pattern, count: String(Object.values(fishWorkstation?.records || {}).filter((row) => row.decision === "score").length) }]
        : [],
    };
  }
  return {
    ...base,
    observedCount: count,
    observedSex: sex,
    observation: item?.student_should_notice || item?.visual_change || "Teaching metaphase for this guided example.",
    classification: "Numerical finding",
    iscnDraft: iscn,
    // Keep disease names out of the report packet; grade the cytogenetic finding.
    interpretation: imported.finding || iscn || item?.student_should_notice || item?.visual_change || "",
    caseReview: { image: true, formula: true, events: true },
    chromosomeReads: (item?.correct_chromosome || item?.primary_chromosome || []).slice(0, 4).map((chromosome) => ({
      chromosome: String(chromosome),
      seen: item?.student_should_notice || item?.visual_change || "Changed relative to the expected pair",
      note: "Guided example",
    })),
    ...guidedKaryotypePacket({
      images: base.images,
      iscn,
      maps: state.maps,
      disease: item || disease,
    }),
  };
}

function exploreTeachingRecord(imported, disease, labId) {
  const copy = disease ? blindedTeachingCopy(disease, labId) : null;
  const name = imported.source?.diseaseName || disease?.disease_name || "Selected disease";
  return {
    ...imported,
    images: specimenEvidence(imported.images),
    label: "Independent case".slice(0, 100),
    finding: "",
    // History prints on the case report — keep disease names out of it.
    history: [
      copy?.referralContext || `Explore the chromosome${labId === "fish" ? " and FISH" : ""} findings on this teaching specimen.`,
      "The condition was provided with this case. Show the evidence and write the finding yourself. Naming the disease is not part of this assignment and must not appear on the case report. You may consult references; they do not fill the report.",
    ].join("\n\n"),
    source: {
      ...imported.source,
      mode: "explore",
      iscn: "",
      revealed: false,
      answerFinding: imported.finding || imported.source?.iscn || "",
      answerTitle: name,
      answerNotes: imported.history || "",
      answerImages: [],
    },
  };
}

function teachingCasePreviewMarkup(disease, index, labId) {
  if (!disease) return `<p class="muted" role="status">No teaching cases match these filters.</p>`;
  const copy = blindedTeachingCopy(disease, labId);
  const workflow = labId === "fish"
    ? "The condition is not named. Score the nuclei, record the interpretation, and say what the findings may support. References stay available. They do not fill the report."
    : "The condition is not named. Sort the chromosomes, annotate the ideogram, write the ISCN, and say what the findings may support. References stay available. They do not fill the report.";
  return `<div class="selected-teaching-case" data-selected-teaching-case="${escapeHtml(disease.id)}">
    <div class="selected-case-meta"><span class="case-chip">${escapeHtml(copy.kind)}</span><span>Case ${String(index + 1).padStart(2, "0")}</span></div>
    <p class="eyebrow">Selected teaching case</p><h3>Case ${String(index + 1).padStart(2, "0")}</h3>
    <p class="selected-case-finding">${escapeHtml(copy.kind)} · ${escapeHtml(copy.assay)}</p>
    <dl class="selected-case-details"><div><dt>Your task</dt><dd>${escapeHtml(workflow)}</dd></div></dl>
    <p class="selected-case-note">${labId === "fish" ? "Opening this case draws a demonstration fluorescence field from the teaching nuclei. The image is labeled as generated. It is not a microscope capture." : "Opening this case draws an unlabeled demonstration metaphase to analyze. It is a generated graphic, not a microscope capture."}</p>
    <button class="button case-open" type="button" data-open-teaching-case="${escapeHtml(disease.id)}">Open in casework <span aria-hidden="true">›</span></button>
  </div>`;
}

function caseworkTeachingCases(lab) {
  return independentCaseworkDiseases(state.diseases, state.activityLinks, state.activityPacks, state.maps, lab, state.probes);
}

const KARYOTYPE_WALKTHROUGH = [
  "1. Open the case and read the specimen information.",
  "2. Examine the supplied metaphase.",
  "3. Assemble or inspect the karyotype.",
  "4. Identify the extra chromosome 21.",
  "5. Read the completed count and sex-chromosome complement.",
  "6. Compare homologs in the chromosome workstation.",
  "7. Open the ideogram. A trisomy does not need a deleted-segment annotation.",
  "8. Read the numerical classification and the written ISCN.",
  "9. Read the short interpretation and limitations.",
  "10. Open Report: this guided example is already filled so you can see a completed casework packet.",
  "11. Export the PDF if you want a copy for class.",
];

const FISH_WALKTHROUGH = [
  "1. Open the FISH case and read the specimen and assay.",
  "2. Examine the fluorescence field.",
  "3. Identify each nucleus.",
  "4. See which nuclei are scored and which are excluded.",
  "5. Read the chromosome 21 signal counts in scorable nuclei.",
  "6. Read why an unsuitable nucleus was excluded.",
  "7. Review the completed scoring worksheet and percentages.",
  "8. Read the FISH interpretation and what enumeration cannot show.",
  "9. Open Report: this guided example is already filled so you can see a completed casework packet.",
  "10. Export the FISH report if you want a copy. Karyotype assembly is not part of this lab.",
];

/** Two ways into Casework: a known disease, or a blinded unknown. */
function guidedWalkthroughMarkup(lab) {
  const period = LAB_PERIODS[lab];
  const disease = diseaseById(state.diseases, period?.guidedDiseaseId);
  if (!period || !disease) return "";
  const steps = lab === "fish" ? FISH_WALKTHROUGH : KARYOTYPE_WALKTHROUGH;
  const summary = lab === "fish"
    ? "Chromosome 21 enumeration. The scoring worksheet and report are already filled so you can see a completed FISH casework packet. You do not assemble a karyotype."
    : "Down syndrome, 47,XX,+21. The observations, ISCN, interpretation, and report are already filled so you can see a completed casework packet. FISH is not part of this example.";
  return `<article class="casework-entry-option"><p class="eyebrow">With the instructor</p><h3>Guided walkthrough</h3><p><strong>${escapeHtml(disease.disease_name)}</strong>. ${escapeHtml(summary)} This example is not offered again as an independent case.</p><ol class="walkthrough-steps">${steps.map((step) => `<li>${escapeHtml(step.replace(/^\d+\.\s*/, ""))}</li>`).join("")}</ol><button class="button primary" type="button" data-open-guided="${escapeHtml(disease.id)}">Open the guided example</button></article>`;
}

function caseworkEntryHTML(lab) {
  const cases = caseworkTeachingCases(lab);
  const cards = cases.map((disease, index) => {
    const copy = blindedTeachingCopy(disease, lab);
    return `<li><button type="button" class="teaching-case-row" data-case-card data-select-teaching-case="${escapeHtml(disease.id)}" data-kind="${escapeHtml(copy.kind)}" data-search="${escapeHtml(copy.search.toLowerCase())}" aria-pressed="false"><span class="case-index">Case ${String(index + 1).padStart(2, "0")}</span><span class="teaching-case-row-copy"><strong>${escapeHtml(copy.kind)}</strong><small class="muted">${escapeHtml(copy.assay)}</small></span></button></li>`;
  }).join("");
  return `<section class="casework-entry" aria-label="Start a case">
    ${guidedWalkthroughMarkup(lab)}
    <article class="casework-entry-option" id="independent-cases"><p class="eyebrow">On your own</p><h3>Independent case</h3><p>This is an open-reference investigation. The disease name is the topic, so naming it is not part of the assignment. Every case on this list is the same laboratory assignment. Examine the specimen, write the finding, and document your own work. You may research the condition. The report is still yours.</p>${diseaseCaseSections(cases)}</article>
    <article class="casework-entry-option" id="unknown-cases"><p class="eyebrow">Diagnosis hidden</p><h3>Instructor-assigned unknown</h3><p>The disease name is withheld, so this assignment also asks what condition the findings may support. You may use the reference library. It will not write the report. Each unknown is the same kind of assignment.</p>
      ${cases.length ? `<div class="casework-tools"><label>Search<input id="patient-case-search" type="search" placeholder="Constitutional, acquired, or assay"></label><label>Origin<select id="patient-case-kind"><option value="all">All</option><option>Constitutional</option><option>Acquired</option></select></label><button class="button" type="button" id="patient-random-case">Random unknown</button></div>
      <div class="unknown-picker"><ul class="case-list teaching-case-list">${cards}</ul><div id="selected-teaching-preview">${teachingCasePreviewMarkup(cases[0], 0, lab)}</div></div>` : `<p class="muted">No blinded case is available for this lab yet.</p>`}
    </article>
  </section>`;
}

function lookupSetupHTML(lab) {
  const saved = readOmimApiKey();
  const method = lab === "fish" ? "FISH" : "karyotyping";
  return `<section class="case-form-section disease-import-section" id="lookup-section"><h3>Explore a disease or enter your own ISCN</h3><p class="muted">Optional. Search a disease or band to start an Explore case. Disease results are limited to conditions seen by ${method}. The condition is known, so naming it is not part of the assignment. A formula you type is drawn as written. The stored teaching formula is not placed in your report.</p><label>Disease, band, or ISCN<textarea id="lookup-query" rows="2" maxlength="500" placeholder="For example, Down syndrome or 47,XX,+21"></textarea></label><button class="button" id="lookup-search" type="button">Look up</button><details class="lookup-key"><summary>OMIM API key</summary><label>Key stored in this browser<input id="omim-api-key" type="password" autocomplete="off" placeholder="${saved ? "A key is already saved in this browser" : "Optional"}"></label><p class="muted">Without a key, the lookup still links to OMIM. The key is not written into the case.</p></details><div id="lookup-preview" aria-live="polite"></div></section>`;
}

function lookupRole(formula) {
  if (formula.role === "canonical") return "Teaching formula";
  if (formula.role === "alternate") return "Other published formula";
  return "Formula you entered";
}

function lookupPreviewHTML(proposal, lab) {
  if (!proposal || proposal.status === "empty") return `<p class="muted">Enter a disease name, a band, or an ISCN formula.</p>`;
  const queryLabel = { formula: "ISCN formula", band: "Chromosome band", disease: "Disease name" }[proposal.query.kind] || "Lookup";
  const explore = proposal.query.kind !== "formula";
  const seenDiseases = new Set();
  const formulas = explore ? proposal.formulas.map((formula, index) => {
    if (!formula.ready || !formula.diseaseId || seenDiseases.has(formula.diseaseId)) return "";
    seenDiseases.add(formula.diseaseId);
    return `<article class="lookup-formula"><p class="eyebrow">Explore a disease</p><h4>${escapeHtml(formula.diseaseName || "Teaching disease")}</h4>${formula.caseName ? `<p>${escapeHtml(formula.caseName)}</p>` : ""}<p class="muted">A teaching specimen can be drawn. You write the finding. The stored formula is not placed in your report.</p><button class="button" type="button" data-lookup-formula="${index}">Explore this disease</button></article>`;
  }).join("") : proposal.formulas.map((formula, index) => {
    const where = [formula.diseaseName, formula.caseName].filter(Boolean).join(" · ");
    const stateLabel = formula.ready ? "Can be drawn" : "Kept as written. This symbol is not drawn.";
    const selected = proposal.selected && proposal.selected.normalized === formula.normalized && proposal.selected.role === formula.role;
    const picture = formula.ready && lab === "karyotype" ? karyogramPreview(formula.text) : "";
    return `<article class="lookup-formula${selected ? " is-selected" : ""}"><p class="eyebrow">${escapeHtml(lookupRole(formula))}</p><p class="iscn-written"><code>${escapeHtml(formula.text)}</code></p>${where ? `<p>${escapeHtml(where)}</p>` : ""}<p class="muted">${escapeHtml(stateLabel)}${formula.undrawn.length ? ` ${formula.undrawn.map((token) => escapeHtml(token)).join(", ")}` : ""}</p>${picture}${formula.ready ? `<button class="button" type="button" data-lookup-formula="${index}">Use this formula</button>` : ""}</article>`;
  }).join("");
  const assays = lab === "fish" ? proposal.fish.map((assay) => {
    const probes = assay.probes.map((probe) => `${probe.name} (${probe.locus})`).join(", ");
    return `<article class="lookup-assay"><p class="eyebrow">${assay.preferred ? "Stored teaching assay" : "Matching stored assay"}</p><p>${escapeHtml(assay.assayType)}${assay.specimenType ? ` · ${escapeHtml(assay.specimenType)}` : ""}</p>${probes ? `<p>Probes: ${escapeHtml(probes)}</p>` : ""}${assay.normalPattern ? `<p>Normal pattern: ${escapeHtml(assay.normalPattern)}</p>` : ""}${assay.pattern && !explore ? `<p>Abnormal pattern: ${escapeHtml(assay.pattern)}</p>` : ""}<p class="muted">This pattern is stored with the teaching assay. A manufacturer can assign different colors to the same loci.</p></article>`;
  }).join("") : "";
  const omim = (proposal.omim?.entries || []).map((entry) => `<li>${entry.url ? `<a href="${escapeHtml(entry.url)}" target="_blank" rel="noopener noreferrer">MIM ${escapeHtml(entry.mimNumber)}${entry.title ? `: ${escapeHtml(entry.title)}` : ""}</a>` : escapeHtml(entry.title)}${entry.cytoLocation ? ` <span class="muted">${escapeHtml(entry.cytoLocation)}</span>` : ""}</li>`).join("");
  const links = (proposal.links || []).map((link) => `<li><a href="${escapeHtml(link.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(link.label)}</a></li>`).join("");
  const none = !formulas ? `<p class="muted">No written formula is available to draw. The references below stay outside the case.</p>` : "";
  const omimNote = proposal.omim?.status === "unavailable" ? `<p class="muted">OMIM did not respond. The search link below is still available.</p>` : "";
  const prompt = proposal.status !== "ready" ? "Nothing here can be drawn until a written formula is available." : explore ? "Choose a disease to explore." : "Choose a written formula to draw.";
  const assayBlock = lab === "fish"
    ? (assays ? `<h4>FISH assays</h4>${assays}` : `<p class="muted">No stored FISH assay matches these loci.</p>`)
    : "";
  return `<div class="lookup-results"><p class="import-status">${escapeHtml(queryLabel)}. ${prompt}</p>${none}${formulas}${assayBlock}${omim ? `<h4>OMIM</h4><ul>${omim}</ul>` : ""}${omimNote}<section class="lookup-reference"><h4>Reference database</h4><p class="muted">The same records as the Reference library, labeled by source and record class.</p><div id="lookup-reference-results"><p class="muted" role="status">Searching the reference database…</p></div></section>${links ? `<h4>Check outside this lab</h4><ul class="lookup-links">${links}</ul><p class="muted">These sites are for checking a published association or a probe design. The lab does not copy their pages or invent an ISCN or a signal pattern from them.</p>` : ""}</div>`;
}

async function caseFromLookup(formula, proposal, lab) {
  if (formula.role === "canonical" && formula.diseaseId) {
    const imported = await diseaseCaseImport(formula.diseaseId, lab);
    if (imported?.blocked) return imported;
    if (imported) return imported;
  }
  const assay = proposal.fish.find((item) => item.diseaseId && item.diseaseId === formula.diseaseId)
    || proposal.fish.find((item) => item.preferred)
    || proposal.fish[0]
    || null;
  if (lab === "fish" && !assay) return { blocked: "no-assay" };
  let images = [];
  if (lab === "fish") {
    const pack = state.activityPacks?.[assay.caseId];
    images = pack?.fish ? await generatedFishImages(pack.fish) : [];
  } else {
    const image = await generatedMetaphaseFromFormula(formula.text, state.templates);
    if (!image) return { blocked: "undrawable" };
    images = [image];
  }
  const disease = formula.diseaseId ? diseaseById(state.diseases, formula.diseaseId) : null;
  const atlasReferences = (disease?.references || []).map((reference) => ({
    label: String(reference.label || "Reference"),
    citation: String(reference.citation || ""),
    url: typeof reference.url === "string" && reference.url.startsWith("https://") ? reference.url : "",
  }));
  const omimReferences = (proposal.omim?.entries || []).filter((entry) => entry.url).map((entry) => ({
    label: "OMIM",
    citation: [entry.mimNumber ? `MIM ${entry.mimNumber}` : "", entry.title, entry.cytoLocation ? `Cytogenetic location ${entry.cytoLocation}` : ""].filter(Boolean).join(". "),
    url: entry.url,
  }));
  const assayNames = { enumeration: "Enumeration", "break-apart": "Break-apart", "dual-fusion": "Dual-fusion", "locus-specific": "Locus-specific", deletion: "Deletion", amplification: "Amplification", sex: "Sex-chromosome enumeration" };
  const probeTarget = (assay?.probes || []).map((probe) => `${probe.name} (${probe.locus})`).join(", ");
  const imageNote = lab === "fish"
    ? "Demonstration fluorescence fields were drawn from the stored teaching assay. They are not a manufacturer diagram or a microscope capture."
    : "The karyogram and metaphase were drawn from the written formula and the GRCh38 band map. They are not a microscope capture.";
  const fishLine = assay?.pattern ? `Stored teaching FISH pattern: ${assay.pattern}` : "";
  return {
    label: [formula.diseaseName, formula.caseName || formula.text].filter(Boolean).join(" — ").slice(0, 100),
    specimen: lab === "fish" ? `Demonstration ${assay?.specimenType || "interphase"} field` : "Demonstration metaphase",
    assay: lab === "fish" ? (assayNames[assay?.assayType] || assay?.assayType || "") : "",
    target: lab === "fish" ? probeTarget : "",
    finding: [formula.text, fishLine].filter(Boolean).join("\n"),
    history: [imageNote, fishLine && "The signal pattern comes from the teaching assay stored in this lab."].filter(Boolean).join("\n\n").slice(0, 4000),
    images,
    source: {
      kind: formula.diseaseId ? "curated-teaching-template" : "typed-iscn",
      catalog: formula.diseaseId ? "Disease Atlas" : "Typed ISCN",
      diseaseId: formula.diseaseId || "",
      diseaseName: formula.diseaseName || "",
      caseName: formula.caseName || "",
      importedAt: new Date().toISOString(),
      imageNote,
      iscn: formula.text,
      iscnSource: formula.source === "atlas" ? "Disease Atlas teaching karyotype" : "Formula entered in casework",
      references: [...atlasReferences, ...omimReferences].slice(0, 12),
    },
  };
}

function patientView(route) {
  const cases = patientCases().filter((item) => item.lab === route.lab);
  let current = route.caseId ? cases.find((item) => item.id === route.caseId) : null;
  if (current && (route.action === "workspace" || route.action === "review")) {
    current = ensureGuidedComplete(current);
  }
  const editing = route.action === "edit" && current;
  const labName = route.lab === "fish" ? "Lab 2 · FISH Casework" : "Lab 1 · Karyotyping Casework";
  const back = `#/patients/${route.lab}`;
  if (route.action === "add" || editing) return `
    <main class="picker patient-page case-setup-page ${route.lab === "fish" ? "fish-page" : "karyotype-page"}"><p class="crumb"><a href="${back}">${labName}</a> / Casework / ${editing ? "Edit case" : "Add a case"}</p>
      <header class="case-setup-heading"><p class="eyebrow">${route.lab === "fish" ? "FISH casework" : "Karyotype casework"}</p><h2>${editing ? "Edit case information" : route.lab === "fish" ? "Add a FISH case" : "Add a case"}</h2><p class="lede">Start with the information you have. You can add more later.</p></header>
      <ol class="case-steps" aria-label="Case setup progress"><li class="active" aria-current="step"><span>1</span> Add information</li><li><span>2</span> Review</li><li><span>3</span> Open workspace</li></ol>
      <div class="case-setup-layout"><form id="patient-case-form" class="patient-form case-setup-form" data-source="${escapeHtml(JSON.stringify(editing?.source || null))}">
        <section class="case-form-section"><h3>Case details</h3><div class="case-field-grid"><label>Case label (optional)<input name="label" maxlength="100" placeholder="For example, Case 01" value="${escapeHtml(editing?.label || "")}"></label>
        <label>Specimen type<input name="specimen" maxlength="100" placeholder="For example, bone marrow or peripheral blood" value="${escapeHtml(editing?.specimen || "")}"></label>
        ${route.lab === "fish" ? `<label>Assay type<select name="assay"><option value="">Select if known</option>${["Enumeration", "Break-apart", "Dual-fusion", "Locus-specific", "Metaphase FISH", "Other / not recorded"].map((option) => `<option ${editing?.assay === option ? "selected" : ""}>${option}</option>`).join("")}</select></label><label>Probe / target information<input name="target" maxlength="200" placeholder="Probe name, target, or genomic region as provided" value="${escapeHtml(editing?.target || "")}"></label>` : ""}</div></section>
        <section class="case-form-section"><h3>Source information</h3><label>${route.lab === "fish" ? "Recorded FISH finding" : "Karyotype / ISCN finding"}<textarea name="finding" rows="3" maxlength="2000" placeholder="Enter the finding as provided; keep the original wording.">${escapeHtml(editing?.finding || "")}</textarea></label>
        <label>Case history or question<textarea name="history" rows="4" maxlength="4000" placeholder="Add relevant context or what you want to investigate.">${escapeHtml(editing?.history || "")}</textarea></label></section>
        ${!editing ? lookupSetupHTML(route.lab) : (teachingAnswerHidden(editing?.source) ? "" : caseSourceMarkup(editing?.source))}
        <section class="case-form-section"><h3>Specimen images</h3><label>Add images<input name="images" type="file" accept="image/png,image/jpeg,image/webp" multiple><span class="muted">PNG, JPEG, or WebP; up to 1 MB each, 2 MB total, and 5 images. Existing images are retained when editing.</span></label></section>
        <p class="notice">Use de-identified material. A reported finding is separate from specimen images and your observations; this tool will not interpret patient material or determine a diagnosis.</p>
        <div class="patient-actions"><button class="button primary" type="submit">Review case <span aria-hidden="true">›</span></button><a class="button" href="${back}">Cancel</a></div>
      </form><aside class="case-next-panel"><p class="eyebrow">A simple three-step flow</p><h3>What happens next</h3><ol><li>Review the original information you entered</li><li>Check the available notes and supported summaries</li><li>Open your workspace to record observations</li></ol><div class="case-next-art">${labPreviewArt(route.lab, "cases")}</div><p class="muted">Illustrative preview only. No specimen result or diagnosis is generated.</p></aside></div></main>`;
  if (route.action === "workspace" && current) return patientWorkspaceView(current, route, back, labName);
  if (route.action === "review" && current) return `
    <main class="picker patient-page"><p class="crumb"><a href="${back}">Casework</a> / ${escapeHtml(current.label || "Case")}</p>
      <h2>Review case</h2><ol class="case-steps" aria-label="Case setup progress"><li class="complete"><span>1</span> Add information</li><li class="active" aria-current="step"><span>2</span> Review</li><li><span>3</span> Open workspace</li></ol>
      <div class="patient-review"><section class="patient-section"><h3>Original information</h3><p><strong>Case ID</strong><br>${escapeHtml(current.label || "Untitled case")}</p>${current.specimen ? `<p><strong>Specimen</strong><br>${escapeHtml(current.specimen)}</p>` : ""}${current.assay ? `<p><strong>Assay</strong><br>${escapeHtml(current.assay)}</p>` : ""}${current.target ? `<p><strong>Probe / target</strong><br>${escapeHtml(current.target)}</p>` : ""}${teachingAnswerHidden(current.source) ? `<p class="muted">The stored teaching finding is not shown here and is not added to your report.</p>` : (visibleFinding(current) ? `<h4>Entered finding</h4><p class="case-finding">${escapeHtml(visibleFinding(current))}</p>` : "")}${current.history ? `<h4>Case history / question</h4><p>${escapeHtml(current.history)}</p>` : ""}${teachingAnswerHidden(current.source) ? "" : caseSourceMarkup(current.source)}${current.images?.length ? `<h4>Attached specimen images</h4><div class="patient-images review-images">${patientImageGallery(current.images)}</div>` : `<p class="muted">No specimen images attached.</p>`}</section>
      <section class="patient-section explanation-panel"><span class="eyebrow">Source-aware review</span><h3>What’s included</h3><p>${route.lab === "fish" ? (teachingAnswerHidden(current.source) ? "Review the assay, the probe target, and the specimen images. You record the scoring and the interpretation." : "Review the assay and probe details with the recorded finding and specimen images.") : (teachingAnswerHidden(current.source) ? "Review the chromosome evidence and the case brief. You write the ISCN and the interpretation." : "Review the reported karyotype or ISCN finding alongside the case history and specimen images.")}</p><div class="source-key"><span>Entered finding</span><span>Case context</span><span>Specimen image${current.images?.length === 1 ? "" : "s"}: ${current.images?.length || 0}</span>${route.lab === "karyotype" ? (teachingAnswerHidden(current.source) ? `<span>ISCN: written by you in the workspace</span>` : `<span>ISCN component summary: ${iscnSummary(formulaText(visibleFinding(current)), true)}</span>`) + `<span>Manual chromosome sorting: ${escapeHtml(karyogramSummary(current))}</span>` : `<span>FISH observations: ${escapeHtml(fishObservationSummary(current))}</span>`}<span>Image markers: ${current.imageAnnotations?.length || 0}</span></div><p class="notice">Chromosome crops, image markers, and counts are manual study annotations. The app does not automatically recognize chromosomes, detect FISH signals, or interpret specimens.</p></section></div>
      <div class="patient-actions"><a class="button" href="#/patients/${route.lab}/${encodeURIComponent(current.id)}/edit">Edit information</a><a class="button" href="${back}">Back to cases</a><a class="button primary" href="#/patients/${route.lab}/${encodeURIComponent(current.id)}">Open workspace</a></div></main>`;
  return `
    <main class="picker patient-page casework-page ${route.lab === "fish" ? "fish-page" : "karyotype-page"}"><p class="crumb"><a href="#/">Home</a> / <a href="${labPath(route.lab)}">${labName}</a> / Casework</p>
      <header class="lab-head casework-head"><div><p class="eyebrow">${route.lab === "fish" ? "Laboratory 2" : "Laboratory 1"}</p><h2>${route.lab === "fish" ? "FISH Casework" : "Karyotyping Casework"}</h2><p class="lede">${route.lab === "karyotype" ? "Start with the Down syndrome walkthrough, then choose a different karyotype. The guided case is not an independent selection." : "Start with chromosome 21 enumeration, then choose a different FISH assay. Karyotype assembly is not required."}</p></div><nav class="casework-header-actions" aria-label="Casework shortcuts"><a class="button" href="#/patients/${route.lab}/new">＋ Add your own case</a><a class="button" href="${labPath(route.lab)}">Back to Learn</a></nav></header>
      ${labSectionTabs(route.lab, "casework")}
      ${caseworkEntryHTML(route.lab)}
      <div class="casework-columns">
        <section class="casework-panel my-cases-panel" id="my-cases"><header><div><p class="eyebrow">Saved on this device</p><h3>My cases</h3><p>These are your notes and images. They are separate from the disease-linked exercises in Learn.</p></div></header>
          <div class="casework-tools"><button id="export-patient-cases" class="button" type="button" ${cases.length ? "" : "disabled"}>Export backup</button><label class="button import-label">Import backup<input id="import-patient-cases" type="file" accept="application/json,.json" hidden></label></div>
          <ul class="patient-case-list">${cases.map((item) => `<li><a class="case-row patient-row" href="#/patients/${route.lab}/${encodeURIComponent(item.id)}"><span class="case-title">${escapeHtml(item.label || "Untitled case")}</span><span class="muted">${escapeHtml(item.specimen || item.finding || item.history || "Case details")}</span><span class="muted">${item.images?.length || 0} image(s) · ${item.observation || item.observedCount || item.observedSex || item.sortedChromosomes?.length || item.fishNuclei?.length || item.fishPatterns?.some((pattern) => pattern.pattern || pattern.count) || item.interpretation || item.iscnDraft || item.classification || item.scorableNuclei ? "Observations saved" : "No observations yet"}${item.submission ? " · Submitted" : ""}</span></a><button class="case-delete" type="button" data-delete-patient="${escapeHtml(item.id)}" aria-label="Remove ${escapeHtml(item.label || "case")}">Remove</button></li>`).join("") || `<li class="case-empty">No cases added yet. Start with findings, an image, or a question.</li>`}</ul>
          <p class="local-note">Backups may contain notes and images. Keep them secure; clearing browser data removes cases saved only on this device.</p>
        </section>
        ${route.lab === "karyotype" ? caseSetAnalysisHTML(cases) : ""}
      </div>
    </main>`;
}

function bindPatientEvents(app, route) {
  let current = route.caseId ? patientCases().find((item) => item.id === route.caseId && item.lab === route.lab) : null;
  if (current && (route.action === "workspace" || route.action === "review")) {
    current = ensureGuidedComplete(current);
  }
  if (current && route.lab === "fish") {
    registerWorkstationHost("casework", {
      context: () => caseworkWorkstationContext(current),
      save(ws) {
        current.fishWorkstation = ws;
        localStorage.setItem("cyto.patientCases", JSON.stringify(patientCases().map((item) => item.id === current.id ? { ...item, fishWorkstation: ws } : item)));
      },
    });
  }
  let pendingGeneratedImages = [];
  const teachingCases = caseworkTeachingCases(route.lab);
  const preview = app.querySelector("#selected-teaching-preview");
  function selectTeachingCase(id) {
    const disease = teachingCases.find((item) => item.id === id);
    if (!disease || !preview) return;
    const index = teachingCases.indexOf(disease);
    preview.innerHTML = teachingCasePreviewMarkup(disease, index, route.lab);
    app.querySelectorAll("[data-select-teaching-case]").forEach((button) => {
      const selected = button.dataset.selectTeachingCase === id;
      button.classList.toggle("selected", selected);
      button.setAttribute("aria-pressed", String(selected));
    });
  }
  function filterTeachingCases() {
    const query = String(app.querySelector("#patient-case-search")?.value || "").trim().toLowerCase();
    const kind = app.querySelector("#patient-case-kind")?.value || "all";
    const rows = [...app.querySelectorAll("[data-case-card]")];
    rows.forEach((row) => {
      row.hidden = Boolean((query && !row.dataset.search.includes(query)) || (kind !== "all" && row.dataset.kind !== kind));
      if (row.parentElement?.tagName === "LI") row.parentElement.hidden = row.hidden;
    });
    const selected = preview?.querySelector("[data-selected-teaching-case]")?.dataset.selectedTeachingCase;
    if (rows.some((row) => !row.hidden && row.dataset.selectTeachingCase === selected)) return;
    const firstVisible = rows.find((row) => !row.hidden);
    if (firstVisible) selectTeachingCase(firstVisible.dataset.selectTeachingCase);
    else if (preview) preview.innerHTML = teachingCasePreviewMarkup(null, 0, route.lab);
  }
  if (route.action === "workspace" && current && route.lab === "karyotype") {
    const needsIdentity = current.images?.some((image) => image.generated && !image.cuts?.some((box) => /^(?:[1-9]|1\d|2[0-2]|X|Y)$/.test(String(box.truth || ""))));
    const refreshGuidedAssembly = () => {
      if (caseMode(current) !== "guided" || current.submission) return;
      const packet = guidedKaryotypePacket({
        images: current.images || [],
        iscn: current.iscnDraft || current.source?.iscn || "",
        maps: state.maps,
        disease: canonicalCase(diseaseById(state.diseases, current.source?.diseaseId)) || diseaseById(state.diseases, current.source?.diseaseId),
        existing: {
          sortedChromosomes: current.sortedChromosomes,
          affectedRemakes: current.affectedRemakes,
          studentMarks: current.studentMarks,
        },
      });
      if (JSON.stringify(packet.sortedChromosomes) === JSON.stringify(current.sortedChromosomes || [])
        && JSON.stringify(packet.affectedRemakes) === JSON.stringify(current.affectedRemakes || [])
        && JSON.stringify(packet.studentMarks) === JSON.stringify(current.studentMarks || [])) return;
      Object.assign(current, packet);
      try {
        localStorage.setItem("cyto.patientCases", JSON.stringify(patientCases().map((item) => item.id === current.id ? { ...item, ...packet } : item)));
      } catch { /* storage full */ }
    };
    if (needsIdentity) recoverSpreadCuts(current).then(() => {
      refreshGuidedAssembly();
      const panel = app.querySelector("#patient-karyogram");
      if (panel?.dataset.caseId === current.id) {
        delete panel.dataset.kgBound;
        bindPatientKaryogram(app, current);
      }
    });
    else {
      refreshGuidedAssembly();
      bindPatientKaryogram(app, current);
    }
    const formula = formulaText(current.iscnDraft) || (teachingAnswerHidden(current.source) ? "" : (formulaText(visibleFinding(current)) || current.source?.iscn || ""));
    bindCaseReport(app, current, {
      maps: state.maps,
      formula,
      disease: teachingAnswerHidden(current.source) ? null : diseaseBrief(current),
      karyogram: karyogramPreview(formula),
    }, (changes) => {
      const next = patientCases().map((item) => item.id === current.id ? { ...item, ...changes } : item);
      localStorage.setItem("cyto.patientCases", JSON.stringify(next));
      Object.assign(current, changes);
    });
  }
  app.querySelector("[data-scroll-to='my-cases']")?.addEventListener("click", () => {
    app.querySelector("#my-cases")?.scrollIntoView({ behavior: "smooth", block: "start" });
  });
  /** Submission and instructor release both end here. The submission snapshot is never rewritten. */
  function revealTeachingAnswer(changes = {}) {
    if (!current?.source?.answerFinding) return false;
    const title = current.source.answerTitle || "";
    const label = title && !String(current.label || "").includes(title) ? `${current.label} · ${title}` : current.label;
    const next = patientCases().map((item) => {
      if (item.id !== current.id) return item;
      const have = new Set((item.images || []).map((image) => image.data));
      const extras = (item.source.answerImages || []).filter((image) => image?.data && !have.has(image.data));
      return {
        ...item,
        ...changes,
        label,
        finding: item.source.answerFinding,
        images: [...(item.images || []), ...extras].slice(0, 5),
        source: { ...item.source, revealed: true },
      };
    });
    localStorage.setItem("cyto.patientCases", JSON.stringify(next));
    return true;
  }
  function saveCase(changes) {
    localStorage.setItem("cyto.patientCases", JSON.stringify(patientCases().map((item) => item.id === current.id ? { ...item, ...changes } : item)));
    Object.assign(current, changes);
  }
  function reportMeta() {
    const formNode = app.querySelector("#case-report-form");
    const prior = current?.reportMeta || {};
    if (!formNode) return prior;
    return {
      studentName: formNode.elements.studentName.value.trim().slice(0, 120) || prior.studentName || "",
      studentId: formNode.elements.studentId.value.trim().slice(0, 60) || prior.studentId || "",
      metaphasesExamined: formNode.elements.metaphasesExamined?.value.trim().slice(0, 8) || prior.metaphasesExamined || "",
      metaphasesKaryotyped: formNode.elements.metaphasesKaryotyped?.value.trim().slice(0, 8) || prior.metaphasesKaryotyped || "",
      limitations: formNode.elements.limitations.value.trim().slice(0, 2000) || prior.limitations || "",
    };
  }
  /** Unsaved observation edits are captured so the report matches what is on screen. */
  function pendingObservations() {
    const formNode = app.querySelector("#patient-observation-form");
    if (!formNode) return {};
    return {
      ...observationFields(formNode, current),
      scorableNuclei: formNode.elements.scorableNuclei?.value ?? current.scorableNuclei ?? "",
      caseReview: route.lab === "karyotype" ? { image: Boolean(formNode.elements.confirmImage?.checked), formula: Boolean(formNode.elements.confirmFormula?.checked), events: Boolean(formNode.elements.confirmEvents?.checked) } : current.caseReview || null,
      fishPatterns: route.lab === "fish" ? [...formNode.querySelectorAll(".fish-pattern-row")].slice(0, 20).map((row) => ({ pattern: row.querySelector("[name='fishPattern']").value.trim().slice(0, 80), count: row.querySelector("[name='fishCount']").value })) : current.fishPatterns || [],
    };
  }
  app.querySelectorAll("[data-case-tab], [data-stage-target]").forEach((button) => button.addEventListener("click", () => {
    const tab = button.dataset.caseTab;
    if ((route.lab === "karyotype" || route.lab === "fish") && route.action === "workspace" && current && tab) {
      if (!current.submission) {
        const meta = { ...(current.reportMeta || {}), ...reportMeta() };
        if (!meta.studentName && current.reportMeta?.studentName) meta.studentName = current.reportMeta.studentName;
        if (!meta.studentId && current.reportMeta?.studentId) meta.studentId = current.reportMeta.studentId;
        if (!meta.metaphasesExamined && current.reportMeta?.metaphasesExamined) meta.metaphasesExamined = current.reportMeta.metaphasesExamined;
        if (!meta.metaphasesKaryotyped && current.reportMeta?.metaphasesKaryotyped) meta.metaphasesKaryotyped = current.reportMeta.metaphasesKaryotyped;
        if (!meta.limitations && current.reportMeta?.limitations) meta.limitations = current.reportMeta.limitations;
        saveCase({ ...pendingObservations(), reportMeta: meta });
      }
      const next = `#/patients/${route.lab}/${encodeURIComponent(current.id)}/${tab}`;
      if (location.hash !== next) location.hash = next;
      return;
    }
    const target = button.dataset.stageTarget;
    if (target) app.querySelector(`#${target}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }));
  app.querySelector("#case-report-form")?.addEventListener("submit", (event) => {
    event.preventDefault();
    if (current.submission) return;
    saveCase({ reportMeta: reportMeta() });
    event.currentTarget.querySelector("[role='status']").textContent = "Report details saved in this browser. The case is still a draft.";
  });
  /** Lists empty fields only. The student can always continue. */
  function missingFieldsNote(working) {
    const gaps = submissionReadiness(working, { fishOpen: caseworkFishReport(working)?.summary?.open });
    return gaps.length ? `\n\nThese fields look empty (this does not judge your answer):\n• ${gaps.join("\n• ")}` : "";
  }
  app.querySelector("#case-report-pdf")?.addEventListener("click", () => {
    if (!current.submission) {
      saveCase({ ...pendingObservations(), reportMeta: reportMeta() });
      const note = missingFieldsNote(current);
      if (note && !window.confirm(`Export a draft PDF?${note}`)) return;
    }
    exportCaseReport(current, { maps: state.maps, meta: { ...current.reportMeta, fishWorkstation: caseworkFishReport(current) }, reportedFinding: visibleFinding(current) });
  });
  app.querySelector("#case-report-json")?.addEventListener("click", () => downloadSubmission(current));
  app.querySelector("#case-report-csv")?.addEventListener("click", () => downloadSubmissionCsv(current));
  app.querySelector("#show-walkthrough-answer")?.addEventListener("click", () => {
    if (caseMode(current) !== "guided" || !state.instructor) return;
    if (!window.confirm("Show the teaching answer for this guided example? Your saved observations stay as you entered them.")) return;
    if (revealTeachingAnswer()) patch({ route: parseHash() });
  });
  app.querySelector("#case-report-submit")?.addEventListener("click", () => {
    const meta = reportMeta();
    if (!meta.studentName && !meta.studentId) {
      window.alert("Enter your name or student ID before submitting.");
      return;
    }
    const working = { ...current, ...pendingObservations(), reportMeta: meta };
    if (!window.confirm(`Submit this case report? Your work is frozen and the PDF is generated for you to upload. The teaching answer stays hidden.${missingFieldsNote(working)}`)) return;
    const submission = buildSubmission(working, { ...meta, reportedFinding: visibleFinding(current), fishWorkstation: caseworkFishReport(current) });
    const changes = { ...pendingObservations(), reportMeta: meta, submission };
    try {
      saveCase(changes);
      saveCaseworkReport({ ...current, ...changes });
    } catch {
      window.alert("The submission could not be saved. Browser storage may be full.");
      return;
    }
    exportCaseReport(current, { maps: state.maps });
    patch({ route: parseHash() });
  });
  app.querySelectorAll("[data-select-teaching-case]").forEach((button) => {
    button.addEventListener("click", () => selectTeachingCase(button.dataset.selectTeachingCase));
  });
  if (route.action === "list" && teachingCases[0]) selectTeachingCase(teachingCases[0].id);
  async function openRecordedCase(trigger, disease, mode) {
    if (!disease) return;
    const label = trigger.textContent;
    trigger.disabled = true;
    trigger.textContent = "Drawing demonstration image…";
    const importedRaw = await diseaseCaseImport(disease.id, route.lab);
    if (importedRaw?.blocked) {
      trigger.disabled = false;
      trigger.textContent = label;
      window.alert(importedRaw.blocked === "no-assay"
        ? "No stored FISH assay is ready for this disease. The lab will not invent a signal pattern."
        : "This disease does not have a teaching metaphase that can be drawn yet.");
      return;
    }
    const imported = importedRaw
      ? (mode === "guided"
        ? guidedTeachingRecord(importedRaw, disease, route.lab)
        : mode === "explore"
          ? exploreTeachingRecord(importedRaw, disease, route.lab)
          : blindedTeachingRecord(importedRaw, disease, teachingCases.indexOf(disease), route.lab))
      : null;
    if (!imported) {
      trigger.disabled = false;
      trigger.textContent = label;
      return;
    }
    const existing = patientCases().find((item) => item.lab === route.lab && caseMode(item) === mode && item.source?.diseaseId === disease.id);
    try {
      if (existing && mode === "guided") {
        const refreshed = {
          ...existing,
          ...imported,
          id: existing.id,
          lab: route.lab,
          savedAt: existing.savedAt || new Date().toISOString(),
          submission: existing.submission || null,
        };
        localStorage.setItem("cyto.patientCases", JSON.stringify(patientCases().map((item) => item.id === existing.id ? refreshed : item)));
        go(`#/patients/${route.lab}/${encodeURIComponent(existing.id)}/intake`);
        return;
      }
      if (existing) {
        if (!validSpecimenImages(existing.images).length && imported.images.length) {
          const next = patientCases().map((item) => item.id === existing.id ? {
            ...item,
            images: imported.images,
            specimen: /no patient specimen/i.test(item.specimen || "") ? imported.specimen : item.specimen,
            history: String(item.history || "").includes("No specimen images")
              ? String(item.history).replace("No specimen images or patient-specific result are included.", imported.source.imageNote)
              : item.history,
            source: { ...(item.source || {}), imageNote: imported.source.imageNote },
          } : item);
          localStorage.setItem("cyto.patientCases", JSON.stringify(next));
        }
        go(`#/patients/${route.lab}/${encodeURIComponent(existing.id)}/review`);
        return;
      }
      const record = {
        ...imported,
        id: `case-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        lab: route.lab,
        savedAt: new Date().toISOString(),
      };
      localStorage.setItem("cyto.patientCases", JSON.stringify([record, ...patientCases()]));
      go(`#/patients/${route.lab}/${encodeURIComponent(record.id)}/${mode === "guided" ? "intake" : "review"}`);
    } catch {
      trigger.disabled = false;
      trigger.textContent = label;
      window.alert("This case could not be saved. The demonstration image may be too large for browser storage.");
    }
  }
  preview?.addEventListener("click", (event) => {
    const trigger = event.target.closest("[data-open-teaching-case]");
    if (!trigger || trigger.disabled) return;
    const disease = teachingCases.find((item) => item.id === trigger.dataset.openTeachingCase);
    openRecordedCase(trigger, disease, "unknown");
  });
  app.querySelectorAll("[data-open-guided], [data-open-independent]").forEach((button) => {
    button.addEventListener("click", () => {
      const id = button.dataset.openGuided || button.dataset.openIndependent;
      const disease = diseaseById(state.diseases, id);
      openRecordedCase(button, disease, button.dataset.openGuided ? "guided" : "explore");
    });
  });
  /** Opened from a Disease Atlas page: start (or resume) this disease as a named casework case. */
  if (route.openDisease) {
    history.replaceState(null, "", `#/patients/${route.lab}`);
    state.route = parseHash();
    const disease = diseaseById(state.diseases, route.openDisease);
    const status = document.createElement("p");
    status.className = "import-status atlas-open-status";
    status.setAttribute("role", "status");
    status.textContent = disease ? `Opening ${disease.disease_name}…` : "That disease is not in the library.";
    app.querySelector(".casework-head")?.after(status);
    if (disease) {
      const mode = LAB_PERIODS[route.lab]?.guidedDiseaseId === disease.id ? "guided" : "explore";
      openRecordedCase(status, disease, mode).then(() => {
        if (status.isConnected && !status.textContent.startsWith("Drawing")) status.remove();
      });
    }
  }
  app.querySelector("#patient-case-search")?.addEventListener("input", filterTeachingCases);
  app.querySelector("#patient-case-kind")?.addEventListener("change", filterTeachingCases);
  const lookupForm = app.querySelector("#patient-case-form");
  const lookupPreview = app.querySelector("#lookup-preview");
  const lookupButton = app.querySelector("#lookup-search");
  let lookupRequest = 0;
  let pendingProposal = null;
  let lookupEdited = false;
  const lookupFields = ["label", "specimen", "assay", "target", "finding", "history"];
  lookupForm?.addEventListener("input", (event) => {
    if (pendingProposal && lookupFields.includes(event.target?.name)) lookupEdited = true;
  });
  app.querySelector("#omim-api-key")?.addEventListener("change", (event) => {
    saveOmimApiKey(event.target.value);
    event.target.value = "";
  });
  function applyLookupRecord(imported) {
    if (!lookupForm) return;
    for (const [field, value] of Object.entries(imported)) {
      if (field === "source" || field === "images" || field === "blocked") continue;
      if (lookupForm.elements[field]) lookupForm.elements[field].value = value;
    }
    lookupForm.dataset.source = JSON.stringify(imported.source || null);
    pendingGeneratedImages = imported.images || [];
    lookupEdited = false;
    lookupPreview?.querySelector(".lookup-applied")?.remove();
    const hidden = teachingAnswerHidden(imported.source);
    const status = hidden
      ? `Exploring ${imported.source.answerTitle}. The specimen is drawn. You write the finding. The stored formula is not placed in your report.`
      : pendingGeneratedImages.length ? "The written formula is loaded. The picture below is drawn from it." : "The written formula is loaded. This record had no stored image to draw.";
    lookupPreview?.insertAdjacentHTML("afterbegin", `<div class="lookup-applied"><p class="import-status" role="status">${escapeHtml(status)}</p>${generatedImagePreview(pendingGeneratedImages)}${hidden ? "" : caseSourceMarkup(imported.source)}</div>`);
  }
  lookupButton?.addEventListener("click", async () => {
    const query = app.querySelector("#lookup-query")?.value.trim() || "";
    if (!query || !lookupPreview) return;
    if (lookupEdited && !window.confirm("Replace the case details with this lookup? Your edits to those fields will be lost.")) return;
    const request = ++lookupRequest;
    lookupButton.disabled = true;
    lookupPreview.innerHTML = `<p class="import-status" role="status">Looking up ${route.lab === "fish" ? "FISH-appropriate" : "karyotype-appropriate"} diseases and published formulas…</p>`;
    const atlasHits = searchAtlas(state.diseases, query, {
      method: route.lab === "fish" ? "fish" : "karyotype",
      caseworkOnly: true,
      links: state.activityLinks,
      packs: state.activityPacks,
      probes: state.probes,
    });
    const omim = await searchOmim(query, { apiKey: readOmimApiKey() });
    if (request !== lookupRequest) return;
    const draft = buildProposal({
      query,
      atlasHits,
      omim,
      links: state.activityLinks,
      packs: state.activityPacks,
      probes: state.probes,
    });
    pendingProposal = {
      ...draft,
      links: referenceLinks({ query, chromosomes: draft.chromosomes, abnormality: draft.abnormality }),
    };
    lookupButton.disabled = false;
    lookupPreview.innerHTML = lookupPreviewHTML(pendingProposal, route.lab);
    const kind = pendingProposal.query.kind;
    const reference = await referenceSearch(kind === "formula" ? "iscn" : kind === "band" ? "chromosome" : "disease", query);
    if (request !== lookupRequest) return;
    const target = lookupPreview.querySelector("#lookup-reference-results");
    if (target) target.innerHTML = referenceMatchesHTML(reference, { hideFormulas: kind !== "formula" });
  });
  lookupPreview?.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-lookup-formula]");
    if (!button || !pendingProposal) return;
    const formula = pendingProposal.formulas[Number(button.dataset.lookupFormula)];
    if (!formula?.ready) return;
    button.disabled = true;
    let built = await caseFromLookup(formula, pendingProposal, route.lab);
    button.disabled = false;
    if (built && !built.blocked && formula.diseaseId && pendingProposal.query.kind !== "formula") {
      built = exploreTeachingRecord(built, diseaseById(state.diseases, formula.diseaseId), route.lab);
    }
    if (!built || built.blocked) {
      window.alert(built?.blocked === "no-assay"
        ? "No stored FISH assay matches this formula. The lab will not invent a signal pattern."
        : "This formula could not be drawn. Use a count, a sex complement, and a supported symbol.");
      return;
    }
    applyLookupRecord(built);
  });
  const analyzeDraft = () => {
    const formNode = app.querySelector("#patient-observation-form");
    const body = app.querySelector("#analyze-karyotype-body");
    const field = app.querySelector("#case-iscn-draft") || formNode?.elements?.iscnDraft;
    if (!body) return;
    const draft = readCaseIscnDraft(app, formNode, current.iscnDraft);
    if (!draft) { body.innerHTML = `<p class="muted">Write an ISCN draft first.</p>`; return; }
    if (!state.maps?.chromosomes) { body.innerHTML = `<p class="muted">The band map is still loading. Try again in a moment.</p>`; return; }
    const analysis = analyzeKaryotype(state.maps, draft);
    body.innerHTML = observationComparisonHTML(current, analysis) + analysisHTML(state.maps, analysis, { mode: "casework" });
    bindAnalysis(body, {
      maps: state.maps,
      analysis,
      onApply: (next) => {
        if (field) field.value = next;
        analyzeDraft();
        body.insertAdjacentHTML("afterbegin", `<p class="status-note">The draft was changed. Choose Save observations to keep it.</p>`);
      },
    });
  };
  app.querySelector("#analyze-draft")?.addEventListener("click", analyzeDraft);
  if (route.lab === "karyotype" && current) {
    const saveCasePatch = (changes) => {
      const formNode = app.querySelector("#patient-observation-form");
      const fields = observationFields(formNode, current);
      const next = patientCases().map((item) => item.id === current.id ? { ...item, ...fields, ...changes } : item);
      localStorage.setItem("cyto.patientCases", JSON.stringify(next));
      Object.assign(current, fields, changes);
    };
    bindAffectedRemakes(app, current, {
      saveCase: saveCasePatch,
      refresh: () => patch({ route: parseHash() }),
    });
  }
  app.querySelector("#draw-draft-metaphase")?.addEventListener("click", async () => {
    if (!current) return;
    const button = app.querySelector("#draw-draft-metaphase");
    const formNode = app.querySelector("#patient-observation-form");
    const formula = readCaseIscnDraft(app, formNode, current.iscnDraft) || formulaText(visibleFinding(current));
    if (!formula) {
      window.alert("Enter an ISCN draft first.");
      return;
    }
    button.disabled = true;
    const image = await generatedMetaphaseFromFormula(formula, state.templates);
    button.disabled = false;
    if (!image) {
      window.alert("This formula could not be drawn. Use a count, a sex complement, and a supported symbol.");
      return;
    }
    const fields = observationFields(formNode, current);
    const kept = (current.images || []).filter((item) => !item.generated || item.specimen);
    const drawn = { ...image, name: "Drawn from your ISCN draft", draft: true };
    const next = patientCases().map((item) => item.id === current.id ? {
      ...item,
      ...fields,
      images: [...kept.slice(0, 4), drawn],
      specimen: item.specimen || "Demonstration metaphase",
    } : item);
    localStorage.setItem("cyto.patientCases", JSON.stringify(next));
    patch({ route: parseHash() });
  });
  app.querySelector("#patient-random-case")?.addEventListener("click", () => {
    const visible = [...app.querySelectorAll("[data-case-card]")].filter((row) => !row.hidden);
    if (!visible.length) return;
    const pick = visible[Math.floor(Math.random() * visible.length)];
    selectTeachingCase(pick.dataset.selectTeachingCase);
    pick.scrollIntoView({ behavior: "smooth", block: "nearest" });
  });
  app.querySelector("#export-patient-cases")?.addEventListener("click", () => {
    const records = patientCases().filter((item) => item.lab === route.lab);
    if (!records.length) return;
    const blob = new Blob([JSON.stringify({ format: "cytogenetics-lab-cases-v1", exportedAt: new Date().toISOString(), cases: records }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `cytogenetics-${route.lab}-cases.json`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  app.querySelector("#import-patient-cases")?.addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      if (file.size > 5 * 1024 * 1024) throw new Error("Backup file is larger than 5 MB.");
      const parsed = JSON.parse(await file.text());
      const incoming = Array.isArray(parsed) ? parsed : parsed?.cases;
      if (!Array.isArray(incoming)) throw new Error("This file is not a supported case backup.");
      if (incoming.length > 100) throw new Error("This backup contains more than 100 cases. No cases were imported; split the backup into smaller files first.");
      for (const item of incoming.filter((record) => record?.lab === route.lab)) {
        const images = item.images || [];
        if (!Array.isArray(images) || images.length > 5 || images.some((image) => !image || !/^data:image\/(png|jpeg|webp);base64,/i.test(image.data || "") || image.data.length >= 1400000)
          || images.reduce((size, image) => size + image.data.length, 0) > 2800000) {
          throw new Error("A case contains unsupported or oversized images. No cases were imported; images cannot be silently removed because saved chromosome crops depend on them.");
        }
      }
      const imported = incoming.slice(0, 100).filter((item) => item && item.lab === route.lab && typeof item === "object").map((item, index) => ({
        id: `case-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 6)}`,
        lab: route.lab,
        label: String(item.label || "").slice(0, 100),
        specimen: String(item.specimen || "").slice(0, 100),
        assay: String(item.assay || "").slice(0, 100),
        target: String(item.target || "").slice(0, 200),
        finding: String(item.finding || "").slice(0, 2000),
        history: String(item.history || "").slice(0, 4000),
        source: item.source?.kind === "curated-teaching-template" ? {
          kind: "curated-teaching-template",
          catalog: String(item.source.catalog || "Disease Atlas").slice(0, 80),
          diseaseId: String(item.source.diseaseId || "").slice(0, 100),
          diseaseName: String(item.source.diseaseName || "").slice(0, 160),
          caseName: String(item.source.caseName || "").slice(0, 160),
          importedAt: String(item.source.importedAt || "").slice(0, 40),
          mode: ["explore", "unknown", "guided"].includes(item.source.mode) ? item.source.mode : undefined,
          revealed: item.source.revealed === true,
          answerFinding: String(item.source.answerFinding || "").slice(0, 2000),
          answerTitle: String(item.source.answerTitle || "").slice(0, 160),
          answerNotes: String(item.source.answerNotes || "").slice(0, 4000),
          references: Array.isArray(item.source.references) ? item.source.references.slice(0, 20).map((reference) => ({
            label: String(reference.label || "Reference").slice(0, 100),
            citation: String(reference.citation || "").slice(0, 800),
            url: typeof reference.url === "string" && /^https:\/\//.test(reference.url) ? reference.url.slice(0, 500) : "",
          })) : [],
          imageNote: String(item.source.imageNote || "").slice(0, 400),
          answerImages: Array.isArray(item.source.answerImages) ? item.source.answerImages.filter((image) => image && /^data:image\/(png|jpeg|webp);base64,/i.test(image.data || "") && image.data.length < 1400000).slice(0, 2).map((image) => ({ name: String(image.name || "image").slice(0, 200), data: image.data, generated: true })) : [],
        } : null,
        observation: String(item.observation || "").slice(0, 2000),
        interpretation: String(item.interpretation || "").slice(0, 2000),
        iscnDraft: String(item.iscnDraft || "").slice(0, 2000),
        classification: String(item.classification || "").slice(0, 100),
        scorableNuclei: String(item.scorableNuclei || "").slice(0, 8),
        fishPatterns: Array.isArray(item.fishPatterns) ? item.fishPatterns.slice(0, 20).map((pattern) => ({ pattern: String(pattern.pattern || "").slice(0, 80), count: String(pattern.count || "").slice(0, 8) })) : [],
        fishNuclei: Array.isArray(item.fishNuclei) ? item.fishNuclei.slice(0, 500).filter((nucleus) => nucleus && typeof nucleus === "object").map((nucleus, index) => ({ number: Math.max(1, Math.min(500, Number(nucleus.number) || index + 1)), fieldIndex: Number.isInteger(nucleus.fieldIndex) ? Math.max(0, Math.min(4, nucleus.fieldIndex)) : null, fieldName: String(nucleus.fieldName || "").slice(0, 100), scorable: nucleus.scorable !== false, pattern: String(nucleus.pattern || "").slice(0, 80), note: String(nucleus.note || "").slice(0, 160) })) : [],
        fishWorkstation: importedWorkstation(item.fishWorkstation),
        observedCount: String(item.observedCount || "").slice(0, 12),
        observedSex: String(item.observedSex || "").slice(0, 30),
        chromosomeReads: Array.isArray(item.chromosomeReads) ? item.chromosomeReads.filter((row) => row && /^(?:[1-9]|1\d|2[0-2]|X|Y)$/.test(String(row.chromosome || ""))).slice(0, 80).map((row) => ({ chromosome: String(row.chromosome), seen: String(row.seen || "").slice(0, 160), note: String(row.note || "").slice(0, 160) })) : [],
        imageAnnotations: Array.isArray(item.imageAnnotations) ? item.imageAnnotations.filter((marker) => Number.isInteger(marker.imageIndex) && Number.isFinite(marker.x) && Number.isFinite(marker.y)).slice(0, 100).map((marker) => ({ imageIndex: Math.max(0, Math.min(4, marker.imageIndex)), x: Math.max(0, Math.min(100, marker.x)), y: Math.max(0, Math.min(100, marker.y)), label: String(marker.label || "Observation").slice(0, 40) })) : [],
        sortedChromosomes: Array.isArray(item.sortedChromosomes) ? item.sortedChromosomes.filter((piece) => piece && Number.isInteger(piece.imageIndex) && Number.isFinite(piece.x) && Number.isFinite(piece.y) && Number.isFinite(piece.width) && Number.isFinite(piece.height)).slice(0, 96).map((piece) => ({ imageIndex: Math.max(0, Math.min(4, piece.imageIndex)), x: Math.max(0, Math.min(100, piece.x)), y: Math.max(0, Math.min(100, piece.y)), width: Math.max(0, Math.min(100, piece.width)), height: Math.max(0, Math.min(100, piece.height)), chromosome: String(piece.chromosome || "").slice(0, 2), homolog: ["A", "B", "C", "D"].includes(piece.homolog) ? piece.homolog : "", ...(/^(?:[1-9]|1\d|2[0-2]|X|Y)$/.test(String(piece.truth || "")) ? { truth: String(piece.truth) } : {}), ...([90, 180, 270].includes(piece.rot) ? { rot: piece.rot } : {}), ...(piece.flip ? { flip: true } : {}) })) : [],
        images: Array.isArray(item.images) ? item.images.filter((image) => image && /^data:image\/(png|jpeg|webp);base64,/i.test(image.data || "") && image.data.length < 1400000).slice(0, 5).reduce((kept, image) => kept.reduce((size, saved) => size + saved.data.length, 0) + image.data.length <= 2800000 ? [...kept, { name: String(image.name || "image").slice(0, 200), data: image.data, generated: Boolean(image.generated), ...(image.specimen ? { specimen: true } : {}), ...(image.draft ? { draft: true } : {}), ...(Array.isArray(image.cuts) ? { cuts: image.cuts.filter((box) => box && [box.x, box.y, box.width, box.height].every(Number.isFinite) && box.width > 0 && box.height > 0).slice(0, 80).map((box) => ({ x: Math.max(0, Math.min(100, box.x)), y: Math.max(0, Math.min(100, box.y)), width: Math.min(100, box.width), height: Math.min(100, box.height), ...(/^(?:[1-9]|1\d|2[0-2]|X|Y)$/.test(String(box.truth || "")) ? { truth: String(box.truth) } : {}) })) } : {}) }] : kept, []) : [],
        caseReview: item.caseReview && typeof item.caseReview === "object" ? { image: item.caseReview.image === true, formula: item.caseReview.formula === true, events: item.caseReview.events === true } : null,
        studentMarks: Array.isArray(item.studentMarks) ? item.studentMarks.filter((mark) => mark && typeof mark === "object").slice(0, 40).map((mark) => ({ id: String(mark.id || "").slice(0, 40), chromosome: String(mark.chromosome || "").slice(0, 2), location: String(mark.location || "").slice(0, 40), effect: String(mark.effect || "").slice(0, 60), note: String(mark.note || "").slice(0, 160), ...(mark.whole ? { whole: true } : {}), ...(mark.from ? { from: String(mark.from).slice(0, 12) } : {}), ...(mark.to ? { to: String(mark.to).slice(0, 12) } : {}) })) : [],
        affectedRemakes: Array.isArray(item.affectedRemakes) ? item.affectedRemakes.filter((entry) => entry && /^(?:[1-9]|1\d|2[0-2]|X|Y)$/.test(String(entry.chromosome || ""))).slice(0, 24).map((entry) => ({
          chromosome: String(entry.chromosome),
          stack: Array.isArray(entry.stack) ? entry.stack.map(String).slice(0, 80) : [],
          lost: Array.isArray(entry.lost) ? entry.lost.map(String).slice(0, 80) : [],
          lostCount: Math.max(0, Math.min(80, Number(entry.lostCount) || 0)),
          effect: String(entry.effect || "").slice(0, 60),
          token: String(entry.token || "").slice(0, 40),
          reason: String(entry.reason || "").slice(0, 400),
          pieces: Array.isArray(entry.pieces) ? entry.pieces.filter((piece) => piece && piece.id).slice(0, 80).map((piece) => ({
            id: String(piece.id).slice(0, 40),
            label: String(piece.label || "").slice(0, 40),
            chromosome: String(piece.chromosome || "").slice(0, 2),
            arm: String(piece.arm || "").slice(0, 8),
            role: String(piece.role || "").slice(0, 20),
            stain: Number.isFinite(piece.stain) ? piece.stain : 0,
            weight: Number.isFinite(piece.weight) ? piece.weight : 1,
            orientation: piece.orientation === "reverse" ? "reverse" : "forward",
          })) : [],
          savedAt: String(entry.savedAt || "").slice(0, 40),
        })) : [],
        reportMeta: item.reportMeta && typeof item.reportMeta === "object" ? {
          studentName: String(item.reportMeta.studentName || "").slice(0, 120),
          studentId: String(item.reportMeta.studentId || "").slice(0, 60),
          metaphasesExamined: String(item.reportMeta.metaphasesExamined || "").slice(0, 8),
          metaphasesKaryotyped: String(item.reportMeta.metaphasesKaryotyped || "").slice(0, 8),
          limitations: String(item.reportMeta.limitations || "").slice(0, 2000),
        } : undefined,
        submission: sanitizeSubmission(item.submission) || undefined,
        savedAt: new Date().toISOString(),
      }));
      if (!imported.length) throw new Error(`No ${route.lab} cases were found in this backup.`);
      localStorage.setItem("cyto.patientCases", JSON.stringify([...imported, ...patientCases()]));
      render();
    } catch (error) {
      window.alert(error.message || "Could not import this backup. Browser storage may be full.");
    } finally {
      event.target.value = "";
    }
  });
  app.querySelectorAll("[data-delete-patient]").forEach((button) => button.addEventListener("click", () => {
    const caseId = button.getAttribute("data-delete-patient");
    if (!window.confirm("Remove this saved case from this browser? Export a backup first if you may want it later.")) return;
    localStorage.setItem("cyto.patientCases", JSON.stringify(patientCases().filter((item) => item.id !== caseId)));
    render();
  }));
  const form = app.querySelector("#patient-case-form");
  form?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const files = [...(form.elements.images.files || [])];
    if (files.length > 5 || files.reduce((sum, file) => sum + file.size, 0) > 2 * 1024 * 1024 || files.some((file) => file.size > 1024 * 1024 || !["image/png", "image/jpeg", "image/webp"].includes(file.type))) {
      window.alert("Choose up to 5 PNG, JPEG, or WebP images (2 MB total; 1 MB per image).");
      return;
    }
    try {
      const uploaded = await Promise.all(files.map((file) => new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve({ name: file.name, data: reader.result });
        reader.onerror = reject;
        reader.readAsDataURL(file);
      })));
      const cases = patientCases();
      let source = current?.source || null;
      try { source = JSON.parse(form.dataset.source || "null"); } catch { source = current?.source || null; }
      const seeded = current ? [] : pendingGeneratedImages;
      const images = [...(current?.images || []), ...seeded, ...uploaded].slice(0, 5);
      if (images.reduce((size, image) => size + String(image.data || "").length, 0) > 2800000) {
        window.alert("Choose fewer or smaller images. Saved images are limited to 2 MB total.");
        return;
      }
      const record = { ...(current || {}), id: current?.id || `case-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, lab: route.lab, label: form.elements.label.value.trim(), specimen: form.elements.specimen.value.trim(), assay: form.elements.assay?.value || "", target: form.elements.target?.value.trim() || "", finding: form.elements.finding.value.trim(), history: form.elements.history.value.trim(), source, images, savedAt: new Date().toISOString() };
      const updated = current ? cases.map((item) => item.id === current.id ? record : item) : [record, ...cases];
      localStorage.setItem("cyto.patientCases", JSON.stringify(updated));
      go(`#/patients/${route.lab}/${encodeURIComponent(record.id)}/review`);
    } catch {
      window.alert("This case could not be saved. Try fewer or smaller images; browser storage is limited.");
    }
  });
  app.querySelector("#patient-observation-form")?.addEventListener("submit", (event) => {
    event.preventDefault();
    const formNode = event.currentTarget;
    const cases = patientCases();
    const updated = cases.map((item) => item.id === current.id ? {
      ...item,
      observation: formNode.elements.observation.value.trim(),
      interpretation: formNode.elements.interpretation.value.trim(),
      iscnDraft: readCaseIscnDraft(app, formNode, item.iscnDraft),
      classification: formNode.elements.classification?.value || "",
      scorableNuclei: formNode.elements.scorableNuclei?.value || "",
      observedCount: formNode.elements.observedCount?.value.trim() || "",
      observedSex: formNode.elements.observedSex?.value.trim() || "",
      caseReview: route.lab === "karyotype" ? { image: Boolean(formNode.elements.confirmImage?.checked), formula: Boolean(formNode.elements.confirmFormula?.checked), events: Boolean(formNode.elements.confirmEvents?.checked) } : item.caseReview || null,
      fishPatterns: route.lab === "fish" ? [...formNode.querySelectorAll(".fish-pattern-row")].slice(0, 20).map((row) => ({ pattern: row.querySelector("[name='fishPattern']").value.trim().slice(0, 80), count: row.querySelector("[name='fishCount']").value })) : item.fishPatterns || [],
    } : item);
    localStorage.setItem("cyto.patientCases", JSON.stringify(updated));
    if (route.lab === "karyotype") {
      patch({ route: parseHash() });
      return;
    }
    let status = formNode.querySelector(".saved-note");
    if (!status) {
      status = document.createElement("p");
      status.className = "saved-note";
      status.setAttribute("role", "status");
      formNode.append(status);
    }
    status.textContent = "Observations saved in this browser.";
  });
  app.querySelector("#chromosome-read-form")?.addEventListener("submit", (event) => {
    event.preventDefault();
    const formNode = event.currentTarget;
    const seen = formNode.elements.seen.value.trim().slice(0, 160);
    if (!seen || (current.chromosomeReads || []).length >= 80) return;
    const row = { chromosome: formNode.elements.chromosome.value, seen, note: formNode.elements.note.value.trim().slice(0, 160) };
    const reads = [...(current.chromosomeReads || []), row];
    const fields = observationFields(app.querySelector("#patient-observation-form"), current);
    const next = patientCases().map((item) => item.id === current.id ? { ...item, ...fields, chromosomeReads: reads } : item);
    localStorage.setItem("cyto.patientCases", JSON.stringify(next));
    patch({ route: parseHash() });
  });
  app.querySelectorAll("[data-remove-chromosome-read]").forEach((button) => button.addEventListener("click", () => {
    const reads = (current.chromosomeReads || []).filter((_, index) => index !== Number(button.dataset.removeChromosomeRead));
    const fields = observationFields(app.querySelector("#patient-observation-form"), current);
    const next = patientCases().map((item) => item.id === current.id ? { ...item, ...fields, chromosomeReads: reads } : item);
    localStorage.setItem("cyto.patientCases", JSON.stringify(next));
    patch({ route: parseHash() });
  }));
  app.querySelector("#fish-nucleus-form")?.addEventListener("submit", (event) => {
    event.preventDefault();
    const formNode = event.currentTarget;
    const records = [...(current.fishNuclei || [])];
    if (records.length >= 500) return;
    const featuredImage = app.querySelector(".patient-fish-featured .patient-image-open");
    const fieldIndex = featuredImage ? Number(featuredImage.dataset.imageIndex) : null;
    const nucleus = {
      number: Math.max(1, Math.min(500, Number(formNode.elements.number.value) || records.length + 1)),
      fieldIndex: Number.isInteger(fieldIndex) ? fieldIndex : null,
      fieldName: formNode.elements.fieldName?.value.trim().slice(0, 100) || "",
      scorable: formNode.elements.scorable.value === "yes",
      pattern: formNode.elements.pattern.value.trim().slice(0, 80),
      note: formNode.elements.note.value.trim().slice(0, 160),
    };
    records.push(nucleus);
    current.fishNuclei = records;
    localStorage.setItem("cyto.patientCases", JSON.stringify(patientCases().map((item) => item.id === current.id ? { ...item, fishNuclei: records } : item)));
    updatePatientFishNuclei(app, records, current.images || []);
    formNode.elements.number.value = Math.min(nucleus.number + 1, 500);
    formNode.elements.pattern.value = "";
    formNode.elements.note.value = "";
    if (records.length >= 500) formNode.querySelector("[type='submit']").disabled = true;
  });
  app.querySelector("#fish-nucleus-rows")?.addEventListener("click", (event) => {
    const remove = event.target.closest("[data-remove-fish-nucleus]");
    if (!remove) return;
    const records = [...(current.fishNuclei || [])].filter((_, index) => index !== Number(remove.dataset.removeFishNucleus));
    current.fishNuclei = records;
    localStorage.setItem("cyto.patientCases", JSON.stringify(patientCases().map((item) => item.id === current.id ? { ...item, fishNuclei: records } : item)));
    updatePatientFishNuclei(app, records, current.images || []);
    app.querySelector("#fish-nucleus-form").querySelector("[type='submit']").disabled = false;
  });
  app.querySelector("#add-fish-pattern")?.addEventListener("click", () => {
    const rows = app.querySelector("#fish-pattern-rows");
    if (rows.children.length >= 20) return;
    rows.insertAdjacentHTML("beforeend", fishPatternRows([{ pattern: "", count: "" }]));
  });
  app.querySelector("#fish-pattern-rows")?.addEventListener("click", (event) => {
    const remove = event.target.closest("[data-remove-fish-pattern]");
    if (remove) remove.closest(".fish-pattern-row").remove();
  });
  app.querySelectorAll(".patient-image-open").forEach((button) => button.addEventListener("click", () => {
    const dialog = app.querySelector("#patient-image-dialog");
    const image = dialog?.querySelector("img");
    if (!dialog || !image) return;
    image.src = button.dataset.imageSrc;
    image.alt = button.dataset.imageName || "Specimen image";
    dialog.querySelector("figcaption").textContent = button.dataset.imageName || "Specimen image";
    dialog.dataset.imageIndex = button.dataset.imageIndex;
    dialog.dataset.markerArmed = "false";
    renderImageMarkers(dialog, current?.imageAnnotations || [], Number(button.dataset.imageIndex));
    dialog.querySelector("#image-marker-status").textContent = "Select Place marker, then click the image.";
    dialog.querySelector("#image-marker-arm").disabled = (current?.imageAnnotations?.length || 0) >= 100;
    dialog.showModal();
  }));
  app.querySelector(".patient-fish-gallery")?.addEventListener("click", (event) => {
    const thumbnail = event.target.closest("[data-patient-fish-image]");
    if (!thumbnail) return;
    const images = (current?.images || []).filter((image) => /^data:image\/(png|jpeg|webp);base64,/i.test(image.data || ""));
    const imageIndex = Number(thumbnail.dataset.patientFishImage);
    const selected = images[imageIndex];
    if (!selected) return;
    const openButton = app.querySelector(".patient-fish-featured .patient-image-open");
    const image = openButton?.querySelector("img");
    const caption = app.querySelector(".patient-fish-featured figcaption");
    if (!openButton || !image || !caption) return;
    const imageName = selected.name || `Image ${imageIndex + 1}`;
    openButton.dataset.imageIndex = String(imageIndex);
    openButton.dataset.imageSrc = selected.data;
    openButton.dataset.imageName = imageName;
    openButton.setAttribute("aria-label", `Enlarge ${imageName}`);
    image.src = selected.data;
    image.alt = specimenImageAlt(selected);
    caption.textContent = `Field ${imageIndex + 1} of ${images.length} · ${imageName}`;
    const currentField = app.querySelector("#fish-current-field");
    if (currentField) currentField.textContent = `Scoring field ${imageIndex + 1}: ${imageName}`;
    app.querySelectorAll("[data-patient-fish-image]").forEach((button) => {
      const active = button === thumbnail;
      button.classList.toggle("on", active);
      button.setAttribute("aria-pressed", String(active));
    });
  });
  app.querySelector("#patient-image-dialog-close")?.addEventListener("click", () => app.querySelector("#patient-image-dialog")?.close());
  app.querySelector("#image-marker-arm")?.addEventListener("click", () => {
    const dialog = app.querySelector("#patient-image-dialog");
    if ((current?.imageAnnotations?.length || 0) >= 100) return;
    dialog.dataset.markerArmed = "true";
    dialog.querySelector("#image-marker-status").textContent = "Marker ready—click the image to place it.";
  });
  app.querySelector(".patient-image-stage")?.addEventListener("click", (event) => {
    const dialog = app.querySelector("#patient-image-dialog");
    const image = dialog.querySelector(".patient-image-stage img");
    if (dialog.dataset.markerArmed !== "true" || event.target !== image) return;
    const bounds = image.getBoundingClientRect();
    const x = Math.max(0, Math.min(100, ((event.clientX - bounds.left) / bounds.width) * 100));
    const y = Math.max(0, Math.min(100, ((event.clientY - bounds.top) / bounds.height) * 100));
    const imageIndex = Number(dialog.dataset.imageIndex);
    const annotation = { imageIndex, x, y, label: dialog.querySelector("#image-marker-label").value.trim().slice(0, 40) || "Observation" };
    const updated = patientCases().map((item) => item.id === current.id ? { ...item, imageAnnotations: [...(item.imageAnnotations || []), annotation].slice(-100) } : item);
    localStorage.setItem("cyto.patientCases", JSON.stringify(updated));
    current.imageAnnotations = [...(current.imageAnnotations || []), annotation].slice(-100);
    renderImageMarkers(dialog, current.imageAnnotations, imageIndex);
    dialog.dataset.markerArmed = "false";
    dialog.querySelector("#image-marker-status").textContent = "Marker saved with this case.";
    dialog.querySelector("#image-marker-arm").disabled = current.imageAnnotations.length >= 100;
  });
  app.querySelector("#image-marker-list")?.addEventListener("click", (event) => {
    const remove = event.target.closest("[data-remove-image-marker]");
    if (!remove || !current) return;
    current.imageAnnotations = (current.imageAnnotations || []).filter((_, index) => index !== Number(remove.dataset.removeImageMarker));
    localStorage.setItem("cyto.patientCases", JSON.stringify(patientCases().map((item) => item.id === current.id ? { ...item, imageAnnotations: current.imageAnnotations } : item)));
    const dialog = app.querySelector("#patient-image-dialog");
    renderImageMarkers(dialog, current.imageAnnotations, Number(dialog.dataset.imageIndex));
    dialog.querySelector("#image-marker-arm").disabled = current.imageAnnotations.length >= 100;
    dialog.querySelector("#image-marker-status").textContent = "Marker removed from this case.";
  });
}

function renderImageMarkers(dialog, annotations, imageIndex) {
  const layer = dialog.querySelector(".patient-image-markers");
  if (!layer) return;
  const visible = annotations.map((marker, index) => ({ marker, index })).filter(({ marker }) => marker.imageIndex === imageIndex);
  layer.innerHTML = visible.map(({ marker }, index) => `<span class="patient-image-marker" style="left:${Number(marker.x)}%;top:${Number(marker.y)}%" title="${escapeHtml(marker.label)}">${index + 1}</span>`).join("");
  const list = dialog.querySelector("#image-marker-list");
  if (list) list.innerHTML = visible.map(({ marker, index }, number) => `<li><span>${number + 1}. ${escapeHtml(marker.label || "Observation")}</span><button class="button" type="button" data-remove-image-marker="${index}">Remove</button></li>`).join("");
}

function fishPatternRows(patterns = []) {
  const rows = Array.isArray(patterns) && patterns.length ? patterns.slice(0, 20) : [{ pattern: "", count: "" }];
  return rows.map((item) => `<div class="fish-pattern-row"><label>Signal pattern<input name="fishPattern" maxlength="80" placeholder="e.g., 2R1G" value="${escapeHtml(item.pattern || "")}"></label><label>Nuclei<input name="fishCount" type="number" min="0" max="9999" value="${escapeHtml(item.count || "")}"></label><button class="button" type="button" data-remove-fish-pattern aria-label="Remove signal pattern">Remove</button></div>`).join("");
}

function chromosomeReadMarkup(current) {
  const rows = Array.isArray(current.chromosomeReads) ? current.chromosomeReads : [];
  const options = [...Array.from({ length: 22 }, (_, index) => String(index + 1)), "X", "Y"]
    .map((identity) => `<option>${identity}</option>`).join("");
  const list = rows.map((row, index) => `<li><strong>${escapeHtml(row.chromosome)}</strong> ${escapeHtml(row.seen || "")}${row.note ? ` <span class="muted">${escapeHtml(row.note)}</span>` : ""} <button class="button" type="button" data-remove-chromosome-read="${index}">Remove</button></li>`).join("");
  return `<div class="chromosome-log"><h4>Chromosome log</h4><p class="muted">Record what you see for one chromosome. This log does not write the ISCN.</p>
    <form id="chromosome-read-form" class="chromosome-read-form"><label>Chromosome<select name="chromosome">${options}</select></label><label>What was seen<input name="seen" maxlength="160" required placeholder="For example, one shortened p arm"></label><label>Note (optional)<input name="note" maxlength="160"></label><button class="button" type="submit" ${rows.length >= 80 ? "disabled" : ""}>Add to log</button></form>
    <ul class="chromosome-read-list">${list || `<li class="muted">No chromosome decisions recorded yet.</li>`}</ul></div>`;
}

function guidedCaseIncomplete(current) {
  if (caseMode(current) !== "guided" || current.submission) return false;
  if (current.lab === "fish") {
    const records = current.fishWorkstation?.records || {};
    return !String(current.fishWorkstation?.answers?.conclusion || current.interpretation || "").trim()
      || !Object.keys(records).length
      || !String(current.reportMeta?.studentName || current.reportMeta?.limitations || "").trim();
  }
  return !String(current.iscnDraft || "").trim()
    || !String(current.observedCount || "").trim()
    || !String(current.interpretation || "").trim()
    || !String(current.reportMeta?.limitations || "").trim();
}

/** True when a guided/explore packet still names the disease on fields that print in the report. */
function reportNamesDisease(current) {
  const name = String(current?.source?.diseaseName || "").trim();
  if (!name) return false;
  const hay = `${current.label || ""}\n${current.interpretation || ""}`;
  return hay.toLowerCase().includes(name.toLowerCase());
}

/** Older guided cases opened before pre-fill still get a completed packet when the workspace loads. */
function ensureGuidedComplete(current) {
  if (!current || caseMode(current) !== "guided" || current.submission) return current;
  const needsText = guidedCaseIncomplete(current);
  const needsVisuals = guidedVisualsIncomplete(current);
  const needsAnonymous = reportNamesDisease(current);
  if (!needsText && !needsVisuals && !needsAnonymous) return current;
  const disease = diseaseById(state.diseases, current.source?.diseaseId);
  if (!disease) return current;
  const labId = current.lab === "fish" ? "fish" : "karyotype";
  const filled = guidedTeachingRecord({
    finding: current.source?.answerFinding || current.finding || "",
    specimen: current.specimen,
    assay: current.assay,
    target: current.target,
    images: current.images || [],
    history: current.source?.answerNotes || current.history || "",
    source: current.source,
  }, disease, labId);
  const visuals = labId === "karyotype"
    ? guidedKaryotypePacket({
      images: validSpecimenImages(current.images).length ? current.images : filled.images,
      iscn: filled.iscnDraft || current.iscnDraft || current.source?.iscn || "",
      maps: state.maps,
      disease: canonicalCase(disease) || disease,
      existing: {
        sortedChromosomes: current.sortedChromosomes,
        affectedRemakes: current.affectedRemakes,
        studentMarks: current.studentMarks,
      },
    })
    : {};
  const next = {
    ...current,
    ...(needsText ? filled : {}),
    ...visuals,
    ...(needsAnonymous || needsText ? {
      label: filled.label,
      interpretation: needsAnonymous && !needsText
        ? (filled.interpretation || current.interpretation)
        : (needsText ? filled.interpretation : current.interpretation),
    } : {}),
    id: current.id,
    lab: current.lab,
    savedAt: current.savedAt,
    submission: current.submission || null,
    images: validSpecimenImages(current.images).length ? current.images : filled.images,
    reportMeta: needsText ? filled.reportMeta : (current.reportMeta || filled.reportMeta),
  };
  try {
    localStorage.setItem("cyto.patientCases", JSON.stringify(patientCases().map((item) => item.id === current.id ? next : item)));
  } catch {
    return current;
  }
  return next;
}

function observationFields(formNode, item) {
  if (!formNode) return {};
  const root = formNode.closest?.("#app") || formNode.ownerDocument?.getElementById?.("app") || formNode;
  return {
    observation: formNode.elements.observation?.value.trim() || item.observation || "",
    interpretation: formNode.elements.interpretation?.value.trim() || item.interpretation || "",
    iscnDraft: readCaseIscnDraft(root, formNode, item.iscnDraft) || item.iscnDraft || "",
    classification: formNode.elements.classification?.value || item.classification || "",
    observedCount: formNode.elements.observedCount?.value.trim() || item.observedCount || "",
    observedSex: formNode.elements.observedSex?.value.trim() || item.observedSex || "",
    possibleAssociation: formNode.elements.possibleAssociation?.value.trim() || item.possibleAssociation || "",
  };
}

const caseworkScenes = new Map();

/** The validated teaching assay behind a casework case, when its nuclei can build a microscope field. */
function caseworkFish(current) {
  if (current?.lab !== "fish") return null;
  const packId = state.activityLinks?.[current.source?.diseaseId]?.fish;
  const pack = packId ? state.activityPacks?.[packId] : null;
  const spec = pack?.fish;
  if (!spec) return null;
  const seed = Number(current.fishWorkstation?.seed) || seedFrom(current.id);
  const saved = current.fishWorkstation;
  const scored = Boolean(saved && Object.keys(saved.records || {}).length);
  const advanced = scored && saved.sceneAdvanced !== false && (saved.sceneAdvanced === true || pack.difficulty === "advanced" || caseMode(current) === "unknown");
  const key = `${packId}|${seed}|${advanced}`;
  if (!caseworkScenes.has(key)) caseworkScenes.set(key, buildScene(spec, seed, { advanced }));
  const scene = caseworkScenes.get(key);
  if (!scene) return null;
  const probes = (spec.probe_ids || []).map((id) => state.probes?.probes?.find((probe) => probe.probe_id === id)).filter(Boolean);
  return { packId, spec, seed, scene, probes, advanced };
}

function caseworkWorkstationContext(current) {
  const bench = caseworkFish(current);
  if (!bench) return null;
  if (current.fishWorkstation?.seed !== bench.seed) current.fishWorkstation = { ...initWorkstation(bench.seed), sceneAdvanced: bench.advanced };
  else if (current.fishWorkstation.sceneAdvanced == null) current.fishWorkstation = { ...current.fishWorkstation, sceneAdvanced: bench.advanced };
  return {
    host: "casework",
    spec: bench.spec,
    probes: bench.probes,
    scene: bench.scene,
    ws: current.fishWorkstation,
    indication: String(current.history || "").split("\n\n")[0],
    locked: Boolean(current.submission),
    reveal: false,
  };
}

function importedWorkstation(value) {
  if (!value || typeof value !== "object" || !Number.isFinite(Number(value.seed))) return null;
  try {
    const text = JSON.stringify(value);
    return text.length > 200000 ? null : JSON.parse(text);
  } catch {
    return null;
  }
}

function caseworkFishReport(current) {
  const bench = caseworkFish(current);
  if (!bench || !current.fishWorkstation) return null;
  return { assay: bench.spec.assay_type, assayRef: bench.packId, ...workstationReport(bench.spec, bench.scene, current.fishWorkstation) };
}

function patientFishNucleusScoring(current) {
  const records = Array.isArray(current.fishNuclei) ? current.fishNuclei : [];
  const nextNumber = Math.min(records.reduce((highest, item) => Math.max(highest, Number(item.number) || 0), 0) + 1, 500);
  const images = (current.images || []).filter((image) => /^data:image\/(png|jpeg|webp);base64,/i.test(image.data || ""));
  const currentField = images[0] ? `Scoring field 1: ${images[0].name || "Image 1"}` : "No image attached; add a field label if scoring from another source.";
  const scorableCount = records.filter((item) => item.scorable).length;
  return `<div class="fish-nucleus-scoring"><header class="fish-nucleus-heading"><div><h4>Score nuclei</h4><p>Record each nucleus as you review the selected field.</p></div><span class="fish-nucleus-total">${records.length} recorded · ${scorableCount} scorable</span></header>
    <p id="fish-current-field" class="fish-current-field">${escapeHtml(currentField)}</p>
    <form id="fish-nucleus-form" class="fish-nucleus-form">${images.length ? "" : `<label>Image / field<input name="fieldName" maxlength="100" placeholder="e.g., Field 1"></label>`}<label>Nucleus<input name="number" type="number" min="1" max="500" value="${nextNumber}" required></label><label>Scorable?<select name="scorable"><option value="yes">Yes</option><option value="no">No</option></select></label><label>Signal pattern<input name="pattern" maxlength="80" placeholder="Describe this assay’s pattern"></label><label>Note (optional)<input name="note" maxlength="160" placeholder="e.g., overlapping signals"></label><button class="button primary" type="submit" ${records.length >= 500 ? "disabled" : ""}>Record &amp; next</button></form>
    <div class="fish-nucleus-table-wrap"><table class="fish-nucleus-table"><thead><tr><th>Nucleus</th><th>Field</th><th>Scorable</th><th>Signal pattern</th><th>Note</th><th></th></tr></thead><tbody id="fish-nucleus-rows">${patientFishNucleusRows(records, images)}</tbody></table></div>
    <p class="fish-manual-note">Manual observations only—no signal detection or interpretation is performed.</p></div>`;
}

function patientFishNucleusRows(records, images) {
  if (!records.length) return `<tr><td class="muted" colspan="6">Your nucleus-by-nucleus observations will appear here.</td></tr>`;
  return records.map((record, index) => {
    const fieldName = Number.isInteger(record.fieldIndex) ? images[record.fieldIndex]?.name || `Field ${record.fieldIndex + 1}` : record.fieldName || "—";
    return `<tr><td>${Number(record.number) || index + 1}</td><td>${escapeHtml(fieldName)}</td><td>${record.scorable ? "Yes" : "No"}</td><td>${escapeHtml(record.pattern || "—")}</td><td>${escapeHtml(record.note || "—")}</td><td><button class="button" type="button" data-remove-fish-nucleus="${index}" aria-label="Remove nucleus ${Number(record.number) || index + 1}">Remove</button></td></tr>`;
  }).join("");
}

function updatePatientFishNuclei(app, records, images) {
  app.querySelector("#fish-nucleus-rows").innerHTML = patientFishNucleusRows(records, images);
  app.querySelector(".fish-nucleus-total").textContent = `${records.length} recorded · ${records.filter((item) => item.scorable).length} scorable`;
}

function patientImageGallery(images = []) {
  const valid = images.filter((image) => /^data:image\/(png|jpeg|webp);base64,/i.test(image.data || ""));
  if (!valid.length) return "";
  return `${valid.map((image, index) => `<figure><button class="patient-image-open" type="button" data-image-index="${index}" data-image-src="${escapeHtml(image.data)}" data-image-name="${escapeHtml(image.name || `Image ${index + 1}`)}" aria-label="Enlarge ${escapeHtml(image.name || `Image ${index + 1}`)}"><img src="${escapeHtml(image.data)}" alt="${escapeHtml(specimenImageAlt(image))}"></button><figcaption>${escapeHtml(image.name || `Image ${index + 1}`)}</figcaption></figure>`).join("")}${patientImageDialogMarkup()}`;
}

function patientFishImageWorkbench(images = [], lab, caseId) {
  const valid = images.filter((image) => /^data:image\/(png|jpeg|webp);base64,/i.test(image.data || ""));
  const empty = `<section id="patient-specimen-workbench" class="patient-section patient-specimen-workbench"><header><h3>Fluorescence field</h3><span>No images</span></header><div class="specimen-empty-state"><span aria-hidden="true">▧</span><strong>No specimen image attached</strong><p>Add a de-identified fluorescence image to record your own signal observations.</p><a class="button" href="#/patients/${lab}/${encodeURIComponent(caseId)}/edit">Add an image</a></div></section>`;
  if (!valid.length) return empty;
  const first = valid[0];
  const firstName = first.name || "Image 1";
  return `<section id="patient-specimen-workbench" class="patient-section patient-specimen-workbench"><header><h3>Fluorescence field</h3><span>${valid.length} field${valid.length === 1 ? "" : "s"}</span></header><figure class="patient-fish-featured"><button class="patient-image-open" type="button" data-image-index="0" data-image-src="${escapeHtml(first.data)}" data-image-name="${escapeHtml(firstName)}" aria-label="Enlarge ${escapeHtml(firstName)}"><img src="${escapeHtml(first.data)}" alt="${escapeHtml(specimenImageAlt(first))}"></button><figcaption aria-live="polite">Field 1 of ${valid.length} · ${escapeHtml(firstName)}</figcaption></figure><nav class="patient-fish-gallery" aria-label="Fluorescence image fields">${valid.map((image, index) => `<button type="button" class="patient-fish-thumbnail${index === 0 ? " on" : ""}" data-patient-fish-image="${index}" aria-pressed="${index === 0}" aria-label="View field ${index + 1}${image.name ? `: ${escapeHtml(image.name)}` : ""}"><img src="${escapeHtml(image.data)}" alt=""><span>${escapeHtml(image.name || `Field ${index + 1}`)}</span></button>`).join("")}</nav>${patientImageDialogMarkup()}</section>`;
}

function patientImageDialogMarkup() {
  return `<dialog id="patient-image-dialog" class="patient-image-dialog"><button id="patient-image-dialog-close" class="button" type="button">Close image</button><p class="muted">Optional: add a manual marker to refer to a location. Markers are your notes only.</p><div class="image-mark-tools"><label>Marker label<input id="image-marker-label" maxlength="40" value="Observation"></label><button id="image-marker-arm" class="button" type="button">＋ Place marker</button><span id="image-marker-status" role="status" class="muted">Select Place marker, then click the image.</span></div><figure class="patient-image-stage"><img alt="Enlarged specimen image"><div class="patient-image-markers" aria-hidden="true"></div><figcaption></figcaption></figure><ul id="image-marker-list" class="image-marker-list"></ul></dialog>`;
}

function teachingPracticeLink(current) {
  if (teachingAnswerHidden(current.source)) return "";
  let exercise = "", caseId = "", title = "";
  const finding = visibleFinding(current);
  if (current.lab === "karyotype" && finding) {
    const normalized = normalizeISCN(formulaText(finding));
    const match = state.catalog.cases.find((item) => [item.expected_iscn, ...(item.accepted_iscn_variants || [])].filter(Boolean).some((notation) => normalizeISCN(notation) === normalized));
    if (match) {
      exercise = "integrated";
      caseId = match.case_id;
      title = match.title || "matching karyotype example";
    }
  } else if (current.lab === "fish") {
    const routeByAssay = {
      "Enumeration": ["enumeration", "fish-enum-cep8"],
      "Break-apart": ["break-apart", "fish-breakapart-7q22"],
      "Dual-fusion": ["dual-fusion", "fish-dualfusion-bcrabl"],
      "Metaphase FISH": ["probe-localization", "fish-locus-7q22"],
    };
    [exercise, caseId] = routeByAssay[current.assay] || ["interphase", "fish-enum-cep8"];
    title = `${current.assay || "FISH"} teaching exercise`;
  }
  if (!caseId) return "";
  return `<a class="button" href="#/lab/${current.lab}/${exercise}/${caseId}/learn">Open related teaching exercise: ${escapeHtml(title)}</a>`;
}

function iscnSummary(raw, asText = false) {
  const value = String(raw || "").trim();
  const prefix = value.match(/^(mos|chi)\s+/i)?.[1]?.toLowerCase() || "";
  const compact = value.replace(/^(?:mos|chi)\s+/i, "").replace(/\s+/g, "");
  const structural = "(?:del|dup|inv|r|i|rob|add|dic|idic|ins|trp|tri|rec|psudic)\\([^)]+\\)(?:\\([^)]+\\))?|der\\([^)]+\\)(?:t\\([^)]+\\)(?:\\([^)]+\\))?)?";
  const supportedCellLine = new RegExp(`^\\d+,(?:XX|XY|X|XXY|XYY|XXX|U)(?:,(?:[+-](?:\\d+|X|Y)|${structural}|t\\([^)]+\\)(?:\\([^)]+\\))?))*(?:\\[\\d+\\])?$`, "i");
  if (!compact.split("/").every((line) => supportedCellLine.test(line))) return asText ? "No supported syntax summary; review the original finding manually." : `<section class="iscn-note"><h4>ISCN component summary</h4><p>No summary is shown for this syntax. Review the original finding manually; no interpretation was inferred.</p></section>`;
  const parsed = parseISCN(compact);
  if (!parsed.cellLines.length || parsed.cellLines.some((line) => !Number.isFinite(line.count) || line.abnormalities.some((item) => item.kind === "unknown"))) {
    return asText ? "No supported syntax summary; review the original finding manually." : `<section class="iscn-note"><h4>ISCN component summary</h4><p>No summary is shown for this syntax. Review the original finding manually; no interpretation was inferred.</p></section>`;
  }
  const summary = `${prefix ? `${prefix === "mos" ? "Mosaic" : "Chimeric"}; ` : ""}${parsed.cellLines.map((line, index) => {
    const parts = [`${line.count} chromosomes`, `${line.sex} sex chromosome complement`, ...line.abnormalities.map((item) => `${item.token} — ${item.type}`)];
    if (line.cloneSize != null) parts.push(`${line.cloneSize} cells recorded`);
    return `${parsed.cellLines.length > 1 ? `Cell line ${index + 1}: ` : ""}${parts.join(" · ")}`;
  }).join("; ")}`;
  return asText ? escapeHtml(summary) : `<section class="iscn-note"><h4>ISCN component summary · supported form</h4><p>${escapeHtml(summary)}</p><small>This is a basic component breakdown of the entered text, not a validated report, diagnosis, or specimen-based interpretation.</small></section>`;
}

function karyogramSummary(current) {
  const pieces = Array.isArray(current.sortedChromosomes) ? current.sortedChromosomes : [];
  const assigned = pieces.filter((piece) => piece.chromosome);
  const groups = new Map();
  assigned.forEach((piece) => {
    if (!piece.homolog) return;
    groups.set(piece.chromosome, new Set([...(groups.get(piece.chromosome) || []), piece.homolog]));
  });
  const pairs = [...groups.values()].filter((homologs) => homologs.has("A") && homologs.has("B")).length;
  return `${pieces.length} crop(s); ${assigned.length} assigned; ${pairs} chromosome pair(s) labeled A/B`;
}

function fishObservationSummary(current) {
  const patterns = (Array.isArray(current.fishPatterns) ? current.fishPatterns : []).filter((item) => item.pattern || item.count).map((item) => `${item.pattern || "Unlabeled pattern"}: ${item.count || "count not entered"}`).join("; ");
  const nuclei = Array.isArray(current.fishNuclei) ? current.fishNuclei : [];
  const recorded = nuclei.length ? `${nuclei.length} nucleus-level record${nuclei.length === 1 ? "" : "s"} (${nuclei.filter((item) => item.scorable).length} marked scorable)` : "no nucleus-level records";
  return `${recorded}; ${current.scorableNuclei || "No"} summary scorable nuclei entered${patterns ? `; ${patterns}` : "; no summary signal-pattern counts entered"}`;
}

function diseaseCaseSections(diseases) {
  const row = (disease) => {
    const item = canonicalCase(disease);
    const kind = item?.kind === "acquired" ? "Acquired" : "Constitutional";
    return `
    <li>
      <button type="button" class="case-row" data-open-independent="${escapeHtml(disease.id)}">
        <span class="case-title">${escapeHtml(disease.disease_name)}</span>
        <span class="muted">${escapeHtml(kind)}</span>
      </button>
    </li>`;
  };
  if (!diseases?.length) return `<p class="muted">No independent case is available for this lab yet.</p>`;
  return `<ul class="case-list">${diseases.map(row).join("")}</ul>`;
}

function skillExerciseView(labId, exerciseId) {
  const lab = labById(labId);
  const selected = exerciseById(lab, exerciseId);
  const cases = studentExerciseCases(lab.id, selected?.id);
  return `
    <main class="picker">
      <p class="crumb"><a href="#/">Home</a> / <a href="${labPath(lab.id)}">${escapeHtml(lab.title)}</a> / Learn</p>
      <h2>${escapeHtml(selected?.title || "Learn")}</h2>
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
      <p class="lede">Each disease is listed once. Opening it hides the finding until you interpret the case. Skill exercises stay inside each laboratory.</p>
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
  const named = route.mode === "explore" ? "/explore" : "";
  return `#/disease/${diseaseId}/${activityId}/${instruction}${focus}${named}`;
}

function caseworkHref(diseaseId, activityId, route) {
  const focus = route.focus ? `/focus/${route.focus}` : "";
  return `#/disease/${diseaseId}/${activityId}/casework${focus}`;
}

function diseaseBoard(route) {
  const disease = diseaseById(state.diseases, route.diseaseId);
  const ready = disease && labDiseases(state.diseases).some((item) => item.id === disease.id);
  if (!ready) {
    return `<main class="panel"><h2>Case not available</h2><p>That disease is not one of the canonical teaching cases.</p><p><a class="btn" href="#/cases">Back</a></p></main>`;
  }
  const item = canonicalCase(disease);
  const assigned = route.mode === "assigned";
  const setting = item?.kind === "acquired"
    ? "Acquired cytogenetics: the finding arose in a tumor or a blood disease"
    : "Constitutional cytogenetics: the finding is part of the person's chromosome complement";
  const args = [disease, state.diseases, state.activityLinks, state.activityPacks, state.maps];
  const focusedFamily = METHOD_FAMILIES.find((family) => family.id === route.focus);
  const families = focusedFamily
    ? [focusedFamily]
    : METHOD_FAMILIES.filter((family) => family.id !== "integrated");
  const back = route.focus ? labPath(route.focus) : "#/cases";
  const backLabel = route.focus ? (labById(route.focus).title) : "Cases";
  if (assigned) {
    const fishCase = route.focus === "fish";
    const flow = fishCase
      ? ["Review the assay and probe", "Check image and nucleus quality", "Record signal patterns", "Interpret the result"]
      : ["Identify the abnormal chromosome", "Characterize the abnormality", "Interpret the result", "Check a proposed result"];
    return `
      <main class="picker casework-entry">
        <p class="crumb"><a href="#/">Home</a> / <a href="${back}">${escapeHtml(backLabel)}</a> / Learn</p>
        <p class="eyebrow">${escapeHtml(fishCase ? "FISH practice" : "Karyotype practice")}</p>
        <h2>Teaching exercise</h2>
        <p class="lede">${escapeHtml(setting)}. This is practice linked to a disease. The diagnosis and ISCN stay hidden until interpretation.</p>
        <section class="casework-start">
          <div>
            <h3>What you will practice</h3>
            <ol>${flow.map((stage) => `<li>${escapeHtml(stage)}</li>`).join("")}</ol>
            <p class="muted">${fishCase ? "You score the teaching nuclei yourself. Practice leaves the reference library optional. Assessment closes it." : "You compare the involved chromosomes before interpreting. Practice leaves the reference library optional. Assessment closes it."}</p>
          </div>
          <div class="hub-actions"><a class="btn primary" href="${learningPracticeHref(disease.id, fishCase ? "fish" : "karyotype")}">Start practice</a><a class="btn" href="${learningAssessmentHref(disease.id, fishCase ? "fish" : "karyotype")}">Start assessment</a></div>
        </section>
      </main>`;
  }
  const sections = families.map((family) => {
    const rows = familyActivities(...args, family.id, state.probes);
    if (!rows.length) return "";
    return `
      ${focusedFamily ? "" : `<h3>${escapeHtml(family.title)}</h3>`}
      <ul class="case-list">
        ${rows.map((row) => `
          <li>
            <button type="button" class="case-row" data-go="${activityHref(disease.id, row.id, route, "learn")}">
              <span class="case-title">${escapeHtml(family.id === "fish" && row.id === "fish" ? (caseSubtitle(disease, "fish", state.activityLinks, state.activityPacks) || row.label) : row.label)}</span>
            </button>
          </li>`).join("")}
      </ul>`;
  }).join("");
  return `
    <main class="picker">
      <p class="crumb"><a href="#/">Home</a> / <a href="${back}">${escapeHtml(backLabel)}</a> / ${escapeHtml(assigned ? "Assigned case" : disease.disease_name)}</p>
      <h2>${escapeHtml(assigned ? "Assigned case" : disease.disease_name)}</h2>
      <p class="lede">${escapeHtml(assigned ? `${setting}. The condition and the ISCN string stay hidden until you interpret the case.` : `${setting}. The finding and the ISCN string stay off this page.`)}</p>
      <p>${focusedFamily
        ? (route.focus === "fish"
          ? "Score the signals and interpret the pattern."
          : "Arrange the chromosomes and decide what changed.")
        : "Each activity is one exercise. The finding stays hidden until you work through it."}</p>
      ${focusedFamily ? "" : `<h3>Complete case</h3>
      <p>This uses every method available for the disease, including karyotyping and FISH.</p>
      <p><a class="btn primary" href="${activityHref(disease.id, "complete", route, "learn")}">Start the complete case</a></p>`}
      <h3>${focusedFamily ? escapeHtml(focusedFamily.title) : "Individual skills"}</h3>
      ${sections || "<p class='muted'>No activity has the data this case needs.</p>"}
      ${assigned ? "" : `<p><a class="btn" href="${diseaseMenuPath(disease.id, { focus: route.focus, mode: "assigned" })}">Open as an assigned case</a></p>`}
    </main>`;
}

function helpView() {
  return `
    <main class="reference">
      <h2>Using this laboratory</h2>
      <p>Start from <a href="#/">Home</a>. Laboratory 1 is <a href="${labPath("karyotype")}">karyotyping and chromosome analysis</a>. Laboratory 2 is <a href="${labPath("fish")}">FISH analysis</a>. Each has Learn, then Casework. <a href="${labPath("chromosome", "draw")}">Draw</a> is its own workspace for any ISCN formula.</p>
      <p>Learn is the short method sequence. Casework starts with one guided example, then an independent case. A blinded unknown withholds the disease name.</p>
      <ul>
        <li><strong>Karyotyping Lab</strong> — chromosome anatomy and banding, whole-cell arrangement, abnormality classification, and ISCN.</li>
        <li><strong>FISH Lab</strong> — probe strategy and localization, signal quality, nucleus scoring, and interpretation.</li>
        <li><strong>Draw</strong> — write a formula, draw the karyogram, and save or export a formula report.</li>
      </ul>
      <p>Teaching cases hide their finding until you work through the evidence. Your own cases are separate, ungraded study notes stored in this browser. Use de-identified material and keep exported backups secure.</p>
      <p><a href="#/atlas">Atlas</a> is the chromosome and disease reference. The <a href="#/reference">Reference library</a> contains ISCN examples and method notes. <a href="#/reports">My Case Reports</a> keeps Draw and Casework you finished on this device so you can export them one at a time or together as a single PDF. <a href="#/credits">Credits</a> names the band map, ISCN 2020, and the copy-number writing rule. A case can offer more than one method; choose the lab that matches the question.</p>
      <p><a href="#/instructor">Instructor preview</a></p>
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
  const sequence = caseId === "chromosome-sequence" ? chromosomeSequenceCase(state.maps, state.templates) : null;
  const loaded = sequence ? null : await loadCase(caseId, state.catalog);
  const hydrated = sequence ? sequence.caseData : hydrateCase(loaded, state.templates);
  const integrated = moduleId === "integrated";
  const session = newSession({
    caseData: hydrated,
    chromosomes: hydrated.chromosomes,
    module: moduleId,
    integrated,
    maps: sequence ? sequence.maps : state.maps,
    probes: state.probes,
    exercise: loc.exercise,
  });
  if (sequence) {
    session.steps = [...hydrated.activitySteps, "summary"];
    session.maps = sequence.maps;
  }
  session.lab = loc.lab || mapLegacyModule(moduleId).lab;
  session.exercise = loc.exercise || mapLegacyModule(moduleId).exercise;
  if (instruction) {
    const body = session.steps.filter((step) => step !== "summary");
    const taught = instructionSteps(body, null, instruction, session.exercise, session.caseData);
    session.steps = [...taught.steps, "summary"];
    session.stepTitles = { ...(session.stepTitles || {}), ...taught.titles };
    session.instructionMode = instruction;
    session.pedagogy = { hintLevel: {}, first: {} };
    session.strictAdvance = true;
    session.returnHref = labPath(session.lab, session.exercise, caseId);
  }
  const classReturn = sessionStorage.getItem("cyto.classReturn");
  if (classReturn) {
    session.returnHref = classReturn;
    session.classNext = sessionStorage.getItem("cyto.classNext") || "";
    sessionStorage.removeItem("cyto.classReturn");
    sessionStorage.removeItem("cyto.classNext");
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
  if (route.focus === "karyotype") plan.steps = plan.steps.filter((step) => !isFishStep(step));
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

function referenceAccess() {
  const session = state.session;
  if (session?.instructionMode === "assessment") return "closed";
  if (session?.module === "disease" && session.atlas?.mode === "assigned") return "optional";
  return "open";
}

function libraryClosedHTML() {
  const session = state.session;
  const diseaseId = session?.atlas?.disease?.id;
  const back = diseaseId
    ? `#/disease/${encodeURIComponent(diseaseId)}/${session.exercise}/${session.instructionMode || "assessment"}${session.atlas?.mode === "explore" ? "/explore" : ""}`
    : (session?.returnHref || "#/");
  return `<main class="reference"><h2>Reference library closed</h2><p>This assessment withholds the condition. The reference library stays closed so a search cannot name the finding. It opens again when you leave the exercise.</p><p><a class="btn" href="${escapeHtml(back)}">Back to the exercise</a></p></main>`;
}

function referenceConsultHTML() {
  const access = referenceAccess();
  if (access === "closed") return `<p class="library-note">The reference library is closed for this assessment.</p>`;
  if (access === "optional") {
    return `<details class="library-note"><summary>Consult the reference library</summary><p>Optional during practice. The search is not filled with this case, and a stored record is not the answer.</p><p><a href="#/library">Open the reference library</a></p></details>`;
  }
  return `<p class="library-note"><a href="#/library">Consult the reference library</a>. It does not fill in this exercise.</p>`;
}

function applyKaryotypeScaffold(session) {
  if (!session?.chromosomes?.length) return;
  if (!(session.steps || []).includes("karyotype")) return;
  if (session.module === "disease") {
    const rounds = diseaseComparisonRounds(session.chromosomes, session.caseData?.chromosomes_involved || []);
    if (rounds.length) {
      const karyotype = resetKaryotype(session.chromosomes, { trayScope: "group" });
      session.karyotype = startFocusRound(karyotype, session.chromosomes, rounds, 0);
      return;
    }
  }
  if (session.module === "disease" || session.instructionMode === "practice" || session.instructionMode === "assessment") {
    session.karyotype = benchStart(session);
    return;
  }
  if (session.instructionMode !== "learn") return;
  const karyotype = resetKaryotype(session.chromosomes, { trayScope: "group" });
  const present = (identity) => session.chromosomes.some((chromosome) => String(chromosome.identity) === String(identity));
  const rounds = focusRoundsFromCase(session.caseData).map((round) => ({ ...round, slots: round.slots.filter(present) })).filter((round) => round.slots.length);
  if (rounds.length) {
    session.karyotype = startFocusRound(karyotype, session.chromosomes, rounds, 0);
    return;
  }
  const configuredSlots = Array.isArray(session.caseData.learning_focus_slots)
    ? session.caseData.learning_focus_slots
    : session.caseData.chromosomes_involved || [];
  const focusSlots = [...new Set(configuredSlots.map(String))].filter(present);
  session.karyotype = focusSlots.length
    ? seatSingleCopies({
        ...karyotype,
        selectedId: karyotype.pool.find((id) => {
          const chromosome = session.chromosomes.find((item) => item.id === id);
          return String(chromosome?.identity) === focusSlots[0];
        }) || null,
        focusSlots,
        steps: [{ id: "case-focus", title: `Chromosomes ${focusSlots.join(" and ")}`, subtitle: "Case focus", slots: focusSlots }],
      }, session.chromosomes)
    : karyotype;
}

function karyotypeFocusAssigned(karyotype, chromosomes) {
  const focus = karyotype.focusSlots;
  if (!focus?.length) return allAssigned(karyotype);
  return focus.every((identity) => {
    const copies = chromosomes.filter((chromosome) => String(chromosome.identity) === String(identity));
    return copies.every((chromosome) => !karyotype.pool.includes(chromosome.id));
  });
}

function settleUnpairedFocus(karyotype, chromosomes) {
  if (!karyotype.focusSlots?.length) return karyotype;
  return seatSingleCopies(karyotype, chromosomes);
}

const CHROMOSOME_TALLY_KEY = "cyto.chromosomeTally";

function readChromosomeTally() {
  try {
    const parsed = JSON.parse(localStorage.getItem(CHROMOSOME_TALLY_KEY) || "{}");
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function recordPairAttempt(selectedIdentity, candidateIdentity, correct) {
  const tally = readChromosomeTally();
  const identity = String(selectedIdentity || "");
  if (!identity) return tally;
  const row = tally[identity] || { attempts: 0, correct: 0, confusedWith: {} };
  row.attempts += 1;
  if (correct) row.correct += 1;
  else if (candidateIdentity && String(candidateIdentity) !== identity) {
    const other = String(candidateIdentity);
    row.confusedWith = { ...(row.confusedWith || {}), [other]: ((row.confusedWith || {})[other] || 0) + 1 };
  }
  tally[identity] = row;
  try { localStorage.setItem(CHROMOSOME_TALLY_KEY, JSON.stringify(tally)); } catch { /* keep the check if storage is unavailable */ }
  return tally;
}

function chromosomeTallyHTML(slots) {
  const tally = readChromosomeTally();
  const rows = Object.entries(tally)
    .map(([identity, row]) => ({ identity, attempts: row.attempts || 0, correct: row.correct || 0, confusedWith: row.confusedWith || {} }))
    .filter((row) => row.attempts > 0)
    .sort((a, b) => (b.attempts - b.correct) - (a.attempts - a.correct) || b.attempts - a.attempts);
  const current = new Set((slots || []).map(String));
  const shown = rows.filter((row, index) => current.has(row.identity) || index < 6).slice(0, 8);
  const items = shown.map((row) => {
    const confused = Object.entries(row.confusedWith).sort((a, b) => b[1] - a[1])[0];
    const note = confused && row.correct < row.attempts ? `, often compared with ${confused[0]}` : "";
    return `<li><strong>${escapeHtml(row.identity)}</strong> ${row.correct} matched of ${row.attempts}${escapeHtml(note)}</li>`;
  }).join("");
  return `<details class="kt-tally"><summary>Previous comparison attempts</summary>${items ? `<ul>${items}</ul>` : "<p>No previous attempts yet.</p>"}</details>`;
}

function symbolSentenceHTML(text) {
  const rows = symbolSentences(text);
  if (!rows.length) return "";
  return `<section class="iscn-symbols"><h4>What each symbol does</h4><ul>${rows.map((row) => `<li><code>${escapeHtml(row.symbol)}</code> ${escapeHtml(row.sentence)}</li>`).join("")}</ul></section>`;
}

function gradedFocusSlots(karyotype) {
  if (karyotype.focusRounds?.length) return [...new Set(karyotype.focusRounds.flatMap((round) => round.slots.map(String)))];
  return karyotype.focusSlots;
}

function sessionHref(s, caseId) {
  return labPath(s.lab || mapLegacyModule(s.module).lab, s.exercise || mapLegacyModule(s.module).exercise, caseId);
}

function skillName(s) {
  return {
    karyotype: "Compare and interpret",
    chromosome_identification: "Identify chromosomes",
    abnormality: "Classify the change",
    change: "Name the change",
    iscn_interpretation: "Read ISCN",
    iscn_construction: "Write ISCN",
    disease_association: "Match the finding",
    integrated: "Integrated case",
    fish: "Score signals",
    anatomy: "Chromosome anatomy",
    chromosome_assembly: "Assemble a chromosome",
    band_identification: "Read a band",
    structural: "Structural change",
  }[s?.exercise] || "";
}

function workspaceCrumb(s) {
  if (s.module === "disease") {
    const fish = fishOnlySession(s) || s.exercise === "fish";
    const labId = fish ? "fish" : "karyotype";
    const labTitle = fish ? "FISH Lab" : "Karyotyping Lab";
    const skill = skillName(s) || "Exercise";
    return `<p class="crumb"><a href="#/">Home</a> / <a href="${labPath(labId)}">${labTitle}</a> / <a href="${labPath(labId)}">Learn</a> / ${escapeHtml(skill)}</p>`;
  }
  if (s.module === "atlas") {
    const label = s.atlas?.mode === "assigned" ? (skillName(s) || "Assigned exercise") : (s.atlas?.disease?.disease_name || "Lab");
    return `<p class="crumb"><a href="#/">Home</a> / <a href="#/atlas">Atlas</a> / ${escapeHtml(label)}</p>`;
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
  const overviewLabel = s.caseData?.case_type === "technical" ? "Exercise" : "Clinical information";
  const stages = [
    { id: "clinical", label: overviewLabel, match: () => true },
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
  const anatomyAbnormal = Boolean(s.assembly?.spec?.transform?.type && s.assembly.spec.transform.type !== "none");
  const chr = s.assembly?.spec?.chromosome;
  const atlasLab = s.module === "atlas";
  const diseaseLab = s.module === "disease";
  const assigned = diseaseLab && s.atlas?.mode === "assigned";
  const findingQuestion = diseaseLab && s.exercise === "disease_association";
  const sequence = c.case_id === "chromosome-sequence";
  const revealDiseaseName = findingQuestion || (!assigned || ["interpret", "iscn_interpretation", "iscn_construction", "narrative", "summary"].includes(step));
  const workspaceTitle = atlasLab
    ? (s.atlas?.mode === "assigned" ? (skillName(s) || "Assigned exercise") : (s.atlas?.disease?.disease_name || "Case"))
    : (diseaseLab
      ? (revealDiseaseName ? (s.atlas?.disease?.disease_name || c.title) : (skillName(s) || "Teaching exercise"))
      : (sequence && chr
        ? `Chromosome ${chr}`
        : (anatomyEx && chr
        ? `Chromosome ${chr}`
        : (hideDx ? (c.unknown_prompt ? "Unknown case" : c.title) : c.title))));
  const about = sequence
    ? "Order the pieces from pter at the top to qter at the bottom. A correct check lets you continue to the next chromosome."
    : findingQuestion
    ? "The condition is the case you opened. Match it to the chromosome finding that defines its canonical case."
    : (atlasLab
    ? (s.atlas?.mode === "assigned"
      ? "Build this karyotype, then find what is abnormal. The condition and which mechanism this patient has are named only after the interpretation."
      : (s.atlas?.cytogeneticCase?.patient_case_label || "Build the canonical teaching karyotype for the disease you chose."))
      : (anatomyEx
      ? `Identify pter, p arm, centromere, q arm, and qter. Numbering begins at the centromere and increases toward each telomere.${anatomyAbnormal ? " This map differs from a normal homolog. Classify the rearrangement and where it occurs." : ""}`
      : (s.integrated ? (c.unknown_prompt || c.clinical_history) : c.clinical_history || "No history provided.")));
  const fishDemo = c.fish?.synthetic_images && s.steps.some(isFishStep);
  const demo = c.placeholder_assets !== false || s.chromosomes.some((ch) => ch.placeholder) || fishDemo;
  const focusedPairExercise = step === "karyotype" && Boolean(s.karyotype.focusSlots?.length);
  const activityStepList = `<ol class="stepper">${s.steps.map((st, i) => `<li class="${i === s.stepIndex ? "active" : ""} ${i < s.stepIndex ? "done" : ""}">${escapeHtml(stepLabel(st))}</li>`).join("")}</ol>`;
  const compactActivityProgress = (s.module === "disease" && fishOnlySession(s) && s.steps.length > 5)
    || (s.instructionMode && s.steps.length > 3);
  const activityProgress = compactActivityProgress
    ? `<details class="case-activity-progress"><summary>${s.module === "disease" && fishOnlySession(s) ? "FISH activities" : "Exercise steps"} · ${s.stepIndex + 1} of ${s.steps.length}</summary>${activityStepList}</details>`
    : activityStepList;
  return `
    <main class="workspace${s.module === "assembly" || isAssemblyStep(step) ? " assembly-focus" : ""}${focusedPairExercise ? " focused-pair-exercise" : ""}">
      ${focusedPairExercise ? "" : `<aside class="case-rail">
        ${workspaceCrumb(s)}
        <h2>${escapeHtml(workspaceTitle)}</h2>
        ${c.case_type ? `<p class="case-type-note">${assigned ? `<span class="pill">Assigned</span>` : ""}<span class="pill">${escapeHtml(c.case_type === "acquired" ? "Acquired" : c.case_type === "constitutional" ? "Constitutional" : c.case_type)}</span><span>${escapeHtml(caseKindNote(c.case_type))}</span></p>` : ""}
        ${demo && !fishDemo ? `<p class="asset-banner">Demonstration chromosome graphics — schematic G-band drawings, not authentic clinical specimens.</p>` : ""}
        <details class="case-activity-progress">
          <summary>About this exercise${compactActivityProgress ? ` · ${s.stepIndex + 1} of ${s.steps.length}` : ""}</summary>
          <p>${escapeHtml(about)}</p>
          ${compactActivityProgress ? activityStepList : ""}
        </details>
        ${compactActivityProgress || (s.module === "assembly" && s.steps.filter((st) => st !== "summary").length <= 1) ? "" : activityProgress}
      </aside>`}
      <section class="stage">
        ${flowBar(s)}
        ${step === "metaphase" ? metaphaseView() : ""}
        ${(isAssemblyStep(step) || (skillTeach && isAssemblyStep(applyStep(step)))) ? assemblyView(step) : ""}
        ${(isFishStep(step) || (skillTeach && isFishStep(applyStep(step)))) ? fishView(step) : ""}
        ${!isTeachStep(step) && showKaryotypeSheet(s, step) ? karyotypeBoard(step === "karyotype") : ""}
        ${step === "summary" ? "" : referenceConsultHTML()}
        ${step === "summary" ? "" : responsePanel(step)}
        ${step === "summary" ? (s.module === "atlas" ? atlasSummary() : summaryView()) : ""}
      </section>
    </main>`;
}

function fishOnlySession(s) {
  const steps = (s.steps || []).filter((st) => st !== "summary");
  return steps.length > 0 && steps.every((st) => isFishStep(st));
}

function includedKaryotypeMatching(s) {
  return (s.steps || []).some((step) => applyStep(step) === "karyotype");
}

function showKaryotypeSheet(s, step) {
  if (!s.chromosomes?.length || s.module === "assembly") return false;
  if (s.module === "fish" || s.exercise === "fish" || fishOnlySession(s)) return false;
  if (isFishStep(step) || isAssemblyStep(step) || step === "unavailable") return false;
  if (step === "summary" && !includedKaryotypeMatching(s)) return false;
  if (s.module === "atlas") return step === "karyotype" || step === "find";
  if (s.module === "disease" && s.exercise === "disease_association") return false;
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
    fish_field: "FISH field scoring",
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
    audit: "Check a proposed result",
    unavailable: "Unavailable",
  }[base] || step;
}

function chrById(id) {
  return state.session.chromosomes.find((c) => c.id === id);
}

const ACTIVE_SCALE = 2.05;
const DONE_SCALE = 0.5;

function tokenHTML(id, interactive, scale = 1, visualOptions = {}) {
  const chr = chrById(id);
  if (!chr) return "";
  const selected = state.session.karyotype.selectedId === id ? " selected" : "";
  const comparisonCandidate = state.session.karyotype.comparisonId === id ? " comparison-candidate" : "";
  const assigned = Object.entries(state.session.karyotype.slots || {}).find(([, ids]) => ids.includes(id))?.[0];
  const label = `Chromosome ${chr.identity}${assigned ? `, placed in box ${assigned}` : ", unassigned"}${selected ? ", selected" : ""}${comparisonCandidate ? ", comparison candidate" : ""}. Schematic teaching drawing.`;
  const tag = interactive ? "button" : "div";
  const pressed = Boolean(selected || comparisonCandidate);
  const focusedCandidate = Boolean(interactive && state.session.karyotype.focusSlots?.length && state.session.karyotype.selectedId && state.session.karyotype.selectedId !== id && state.session.karyotype.pool.includes(id));
  const canDrag = interactive && !state.session.karyotype.focusSlots?.length;
  const variation = drawingVariation(id);
  return `<${tag}${interactive ? ' type="button"' : ""} class="chr-token${selected}${comparisonCandidate}${interactive ? " interactive" : ""}" draggable="${canDrag ? "true" : "false"}" data-id="${id}"${interactive ? ` aria-label="${escapeHtml(label)}${focusedCandidate ? " Select or drag to compare against the active chromosome." : ""}" aria-pressed="${pressed}"` : ` role="img" aria-label="${escapeHtml(label)}"`}>
    ${renderChromosome(chr, { scale, hideIdentity: true, widthScale: (visualOptions.widthScale || 1) * variation.widthScale, texture: true, realistic: true, bendSeed: variation.bendSeed, mirror: variation.mirror })}
  </${tag}>`;
}

function pairComparisonCues(reference, candidate) {
  const referenceTraits = chromosomeTraits(reference);
  const candidateTraits = chromosomeTraits(candidate);
  const lengthRatio = referenceTraits.relativeLength > 0
    ? Math.round((candidateTraits.relativeLength / referenceTraits.relativeLength) * 100)
    : null;
  const centromerePosition = (value) => Number.isFinite(value) ? `${Math.round(value * 100)}% from the short-arm end` : "not available";
  return `<section class="kt-comparison-cues" aria-label="Schematic chromosome comparison cues">
    <p class="eyebrow">Comparison cues · schematic</p>
    <dl><div><dt>Relative length</dt><dd>${lengthRatio == null ? "not available" : `Candidate is about ${lengthRatio}% as long as the selected chromosome`}</dd></div>
      <div><dt>Centromere</dt><dd>Selected: ${centromerePosition(referenceTraits.cen)} · Candidate: ${centromerePosition(candidateTraits.cen)}</dd></div></dl>
    <p>Use these as guides, then compare the band order visually. Drawing proportions are based on reference band-map data; real chromosome condensation varies.</p>
  </section>`;
}

function metaphaseView() {
  const presentation = Number.isFinite(state.session.presentation) ? state.session.presentation : 0;
  const markup = metaphaseSvg(state.session.chromosomes || [], { presentation });
  if (!markup) return `<p class="muted">This case has no chromosome set to draw as a metaphase.</p>`;
  return `<div class="metaphase-wrap">
    <div class="metaphase-stage">${markup}</div>
    <p class="muted">Generated from this case’s chromosome set and the band map. It is a demonstration graphic, not a microscope capture. Position, orientation, bend, and condensation change between presentations. The band pattern of each chromosome does not. Begin karyotype construction when you are ready to classify by morphology.</p>
    <p><button type="button" class="btn" data-action="new-metaphase">Show another metaphase</button></p>
  </div>`;
}

function benchOn(s) {
  return Boolean(s?.karyotype && openSheet(s.karyotype) && s.module !== "atlas");
}

function benchAids(s) {
  return s?.instructionMode !== "assessment";
}

function benchStart(s) {
  return { ...resetKaryotype(s.chromosomes, { sheet: true }), preview: benchAids(s), previewFrom: "start", orient: {}, history: [], future: [], arrangedViews: 0 };
}

function benchPresentation(s) {
  return Number.isFinite(s.presentation) ? s.presentation : 0;
}

function benchView() {
  const s = state.session;
  const kt = s.karyotype;
  const aids = benchAids(s);
  const presentation = benchPresentation(s);
  const showBadges = aids && (kt.showNumbers || kt.showColour);
  const spreadSvg = metaphaseSvg(s.chromosomes, {
    presentation,
    interactive: !(aids && kt.preview),
    selected: new Set(kt.selectedId ? [kt.selectedId] : []),
    placed: new Set(aids && kt.preview ? [] : Object.values(kt.slots || {}).flat()),
    badge: showBadges ? (id) => {
      const identity = chrById(id)?.identity;
      return { text: kt.showNumbers ? identity : "", fill: kt.showColour ? identityColour(identity) : "#3f4a59" };
    } : null,
  });
  const markup = benchMarkup({
    kt,
    chromosomes: s.chromosomes,
    trayIds: poolForCurrentStep(kt, s.chromosomes),
    chromosomeSvg: (id, scale) => spreadChromosomeSvg(chrById(id), presentation, scale),
    spreadSvg,
    spreadRot: spreadRotations(s.chromosomes, presentation),
    aids,
  });
  if (kt.bounceId) s.karyotype = { ...kt, bounceId: null };
  return markup;
}

function benchMove(id, dest, { advance = false } = {}) {
  const s = state.session;
  const kt = s.karyotype;
  const tray = poolForCurrentStep(kt, s.chromosomes);
  const fromTray = kt.pool.includes(id);
  const result = benchPlace(kt, s.chromosomes, id, dest, { bounce: benchAids(s) });
  let next = result.karyotype;
  if (result.bounced) next = { ...next, selectedId: id };
  else if (advance && fromTray && dest !== "pool") {
    const rest = tray.filter((item) => item !== id);
    next = { ...next, selectedId: rest[tray.indexOf(id)] || rest[0] || null };
  }
  patchSession({ karyotype: next });
  rerenderWorkspace();
}

function handleBenchAction(action, el) {
  const s = state.session;
  const kt = s.karyotype;
  if (!benchOn(s)) return false;
  const spreadRot = spreadRotations(s.chromosomes, benchPresentation(s));
  let next = null;
  if (action === "bench-undo") next = benchUndo(kt);
  else if (action === "bench-redo") next = benchRedo(kt);
  else if (action === "bench-rotate") next = benchTurn(kt, kt.selectedId, spreadRot, "right");
  else if (action === "bench-flip") next = benchTurn(kt, kt.selectedId, spreadRot, "flip");
  else if (action === "bench-bump") {
    if (!kt.selectedId || kt.pool.includes(kt.selectedId)) return true;
    benchMove(kt.selectedId, "pool");
    return true;
  } else if (action === "bench-arranged" && benchAids(s)) next = { ...kt, preview: true, previewFrom: "work", selectedId: null, arrangedViews: (kt.arrangedViews || 0) + 1 };
  else if (action === "bench-unsort") next = { ...kt, preview: false };
  else if (action === "bench-numbers") next = { ...kt, showNumbers: !kt.showNumbers };
  else if (action === "bench-colour") next = { ...kt, showColour: !kt.showColour };
  else if (action === "bench-spread") {
    const id = el?.getAttribute("data-id");
    if (!id) return true;
    next = { ...kt, selectedId: kt.selectedId === id ? null : id };
  } else return false;
  patchSession({ karyotype: next });
  rerenderWorkspace();
  return true;
}

function benchCheckNotes(s, isSubmit) {
  const sideways = sidewaysPlaced(s.karyotype, s.chromosomes, spreadRotations(s.chromosomes, benchPresentation(s)));
  const notes = [];
  if (sideways.length) notes.push(`Some chromosomes are not short arm up (position${sideways.length === 1 ? "" : "s"} ${sideways.join(", ")}). Select each one and rotate it.`);
  if (isSubmit && s.karyotype.arrangedViews) notes.push(`You opened the arranged karyotype ${s.karyotype.arrangedViews} time${s.karyotype.arrangedViews === 1 ? "" : "s"} while building.`);
  return notes.join(" ");
}

let benchKeysBound = false;
let benchTyped = "";
let benchTimer = null;

function onBenchKey(ev) {
  const s = state.session;
  if (!benchOn(s) || s.karyotype.preview || !document.querySelector("[data-bench]")) return;
  if (ev.target.closest?.("input, textarea, select, [contenteditable='true']")) return;
  const key = ev.key;
  const take = () => { ev.preventDefault(); ev.stopPropagation(); };
  if ((ev.metaKey || ev.ctrlKey) && key.toLowerCase() === "z") {
    take();
    handleBenchAction(ev.shiftKey ? "bench-redo" : "bench-undo");
    return;
  }
  if (ev.metaKey || ev.ctrlKey || ev.altKey) return;
  if (key === "Enter" && benchTyped) { take(); commitBenchTyped(); return; }
  if (/^[0-9]$/.test(key)) { take(); typeBench(key); return; }
  if (/^[xy]$/i.test(key)) { take(); benchTyped = ""; assignBench(key.toUpperCase()); return; }
  if (/^r$/i.test(key)) { take(); handleBenchAction("bench-rotate"); return; }
  if (/^f$/i.test(key)) { take(); handleBenchAction("bench-flip"); return; }
  if ((key === "Backspace" || key === "Delete") && s.karyotype.selectedId) { take(); handleBenchAction("bench-bump"); return; }
  if (key === "ArrowRight" || key === "ArrowLeft") { take(); cycleBench(key === "ArrowRight" ? 1 : -1); }
}

function typeBench(digit) {
  clearTimeout(benchTimer);
  benchTyped += digit;
  const value = Number(benchTyped);
  const shown = $(".kb-typed");
  if (shown) shown.textContent = `Position ${benchTyped}…`;
  if (value === 0) { benchTyped = ""; return; }
  if (benchTyped.length >= 2 || value >= 3) { commitBenchTyped(); return; }
  benchTimer = setTimeout(commitBenchTyped, 700);
}

function commitBenchTyped() {
  clearTimeout(benchTimer);
  const value = Number(benchTyped);
  benchTyped = "";
  if (value >= 1 && value <= 22) assignBench(String(value));
  else {
    const shown = $(".kb-typed");
    if (shown) shown.textContent = "No such position";
  }
}

function assignBench(slot) {
  const s = state.session;
  const id = s.karyotype.selectedId || poolForCurrentStep(s.karyotype, s.chromosomes)[0];
  if (id) benchMove(id, slot, { advance: true });
}

function cycleBench(step) {
  const s = state.session;
  const tray = poolForCurrentStep(s.karyotype, s.chromosomes);
  if (!tray.length) return;
  const index = tray.indexOf(s.karyotype.selectedId);
  const next = tray[(index + step + tray.length) % tray.length] || tray[0];
  patchSession({ karyotype: { ...s.karyotype, selectedId: next } });
  rerenderWorkspace();
}

function presentSlots(ids) {
  const present = new Set(state.session.chromosomes.map((c) => String(c.identity)));
  return ids.filter((id) => present.has(id));
}

function drawingVariation(id) {
  const nonce = state.session?.variation || 0;
  let code = 2166136261;
  for (const char of `${id}:${nonce}`) {
    code ^= char.charCodeAt(0);
    code = Math.imul(code, 16777619);
  }
  const mixed = code >>> 0;
  return {
    widthScale: 0.94 + (mixed % 5) * 0.03,
    mirror: mixed % 4 === 0,
    bendSeed: `${id}:${nonce}`,
  };
}

function openSheet(kt) {
  return kt?.steps?.length === 1 && kt.steps[0]?.id === "sheet";
}

function karyotypeBoard(interactive) {
  const kt = state.session.karyotype;
  const chromosomes = state.session.chromosomes;
  const grade = kt.lastGrade;
  const revealMarks = kt.placementMarks;
  const liveGrade = revealMarks ? gradeKaryotype(kt, chromosomes, null) : null;
  const highlightSlots = revealMarks && kt.checkAttempt >= 3;
  const highlightGroups = grade && !grade.perfect && kt.checkAttempt === 2;
  const groupBlock = (name, ids, scale, canPlace, focus = false, numbered = false) => {
    const slots = presentSlots(ids);
    if (!slots.length) return "";
    const slotsMarkup = `
      <div class="group-slots">
        ${slots.map((slot) => {
          const marked = liveGrade?.slotResults?.[slot];
          const correct = Boolean(marked?.ok && marked.placed > 0);
          const flagged = highlightSlots && marked && !marked.ok && marked.placed > 0;
          const idsIn = kt.slots[slot] || [];
          const finding = atlasFindSlots();
          const picked = finding && atlasSlotPicked(slot);
          const placementLabel = `${idsIn.length ? `${idsIn.length} chromosome${idsIn.length === 1 ? "" : "s"} in` : "Empty"} chromosome ${slot} box${canPlace ? ". Press Enter or Space to place the selected chromosome here." : ""}`;
          return `<div class="slot${correct ? " slot-ok" : ""}${flagged ? " slot-flag" : ""}${picked ? " slot-pick" : ""}"${canPlace ? ` data-slot="${slot}" tabindex="0" role="button" aria-label="${escapeHtml(placementLabel)}"` : ""}${finding ? ` data-action="atlas-pick" data-slot="${slot}"` : ""}>
            <div class="slot-body">${idsIn.map((id) => tokenHTML(id, canPlace, scale, { texture: focus })).join("")}</div>
            <p class="slot-num">${slot}</p>
          </div>`;
        }).join("")}
      </div>`;
    if (numbered) return slotsMarkup;
    return `
    <div class="chr-group${focus ? " case-focus-group" : ""}${highlightGroups && groupFlagged(name, grade) ? " group-flag" : ""}" data-group="${name}">
      <p class="group-label">${focus ? `Chromosome ${escapeHtml(slots[0])}` : `Group ${escapeHtml(name)}`}</p>
      ${slotsMarkup}
    </div>`;
  };
  const fullSheet = sheetMarkup(groupBlock, false);
  if (!interactive) return `${fullSheet}${comparisonWorkstation()}`;
  if (kt.reviewing) {
    return `<div>${fullSheet}<p class="muted">Reviewing the current worksheet. Return to group-by-group placement to continue.</p>
      <button type="button" class="btn" data-action="review-kt">Back to groups</button></div>`;
  }

  const steps = kt.steps?.length ? kt.steps : [];
  const step = currentStep(kt, chromosomes);
  if (!step) return `<p class="muted">This case has no chromosome worksheet for group-by-group construction.</p>`;
  const focusedCase = Boolean(kt.focusSlots?.length);
  const showFullTray = kt.trayScope === "all";
  const poolIds = showFullTray ? poolForCurrentStep(kt, chromosomes) : unplacedForStep(kt, chromosomes, step);
  const pairReferences = focusedCase ? Object.fromEntries(step.slots.map((slot) => {
    const placed = kt.slots[slot] || [];
    const expected = chromosomes.filter((item) => String(item.identity) === String(slot)).length;
    if (placed.length >= expected) return [slot, null];
    const reference = comparisonReferenceId(kt, slot);
    return [slot, reference || null];
  })) : {};
  const referenceIds = new Set(Object.values(pairReferences).filter(Boolean));
  const visiblePoolIds = focusedCase ? poolIds.filter((id) => !referenceIds.has(id)) : poolIds;
  const activeIndex = kt.activeStep || 0;
  const tray = `
    <div class="pool" data-slot="pool">
      <div class="pool-heading"><p class="group-label">${focusedCase ? (visiblePoolIds.length ? "Choose a homolog" : "Nothing left to match") : openSheet(kt) || showFullTray ? "Unassigned chromosomes · whole cell" : `Unassigned chromosomes · ${escapeHtml(step.title)}`}</p>${!openSheet(kt) ? `<button type="button" class="kt-tray-toggle" data-action="toggle-karyotype-tray">${showFullTray ? "Show this group only" : "Show all chromosomes"}</button>` : ""}</div>
      <div class="pool-body">${visiblePoolIds.map((id) => tokenHTML(id, true, focusedCase ? .82 : ACTIVE_SCALE, { texture: focusedCase })).join("") || `<p class='muted empty-pool'>${focusedCase ? "Every chromosome for this comparison is in its row." : "All chromosomes for this group have been placed. Continue to the next group."}</p>`}</div>
    </div>`;
  if (openSheet(kt)) {
    if (benchOn(state.session)) return benchView();
    return `<div class="kt-split open-sheet">${tray}<div class="kt-work">${sheetMarkup(groupBlock, true)}</div></div>`;
  }
  const groupLeft = unplacedForStep(kt, chromosomes, step).length === 0;
  const groupCount = steps.length;
  const groupPosition = Math.min(activeIndex + 1, groupCount);
  const pairTargets = (kt.focusSlots || []).filter((identity) => chromosomes.filter((item) => String(item.identity) === identity).length > 0);
  const completedPairs = pairTargets.filter((identity) => {
    const pairSize = chromosomes.filter((item) => String(item.identity) === identity).length;
    return (kt.slots[identity] || []).length >= pairSize;
  }).length;
  return `
    <div class="kt-pairing-bench">
      <header class="kt-bench-heading${focusedCase ? " case-focus-heading" : ""}">
        <div>${focusedCase ? workspaceCrumb(state.session) : ""}<p class="eyebrow">${focusedCase ? `Karyotyping Lab · Learning exercise${kt.focusRounds?.length > 1 ? ` · Set ${(kt.focusRoundIndex || 0) + 1} of ${kt.focusRounds.length}` : ""}` : "Karyotyping Lab · Pairing exercise"}</p><h3>${escapeHtml(focusedCase ? (kt.focusRounds?.[kt.focusRoundIndex || 0]?.title || focusExerciseTitle(kt, chromosomes)) : "Match chromosomes by evidence")}</h3>
          <p>${escapeHtml(focusedCase ? (kt.focusRounds?.[kt.focusRoundIndex || 0]?.note || focusExerciseNote(kt, chromosomes)) : "Compare overall length, centromere position, and the banding pattern. Place matching homologs together.")}</p></div>
        <span class="kt-progress-count">${kt.focusSlots?.length ? focusProgressLabel(kt, chromosomes, pairTargets, completedPairs) : `Group ${groupPosition} of ${groupCount}`}</span>
      </header>
      ${focusedCase ? "" : `<nav class="kt-progress" aria-label="Karyotype groups">
        ${steps.map((st, i) => {
          const assigned = unplacedForStep({ ...kt, activeStep: i }, chromosomes, st).length === 0
            && st.slots.some((slot) => (kt.slots[slot] || []).length);
          return `<button type="button" class="kt-progress-step${i === activeIndex ? " on" : ""}${assigned ? " done" : ""}" data-action="group-goto" data-index="${i}" aria-current="${i === activeIndex ? "step" : "false"}">
            <span>${assigned ? "✓" : i + 1}</span><strong>${escapeHtml(st.title)}</strong>
          </button>`;
        }).join("")}
        <button type="button" class="kt-review-link" data-action="review-kt">Review full karyogram</button>
      </nav>`}
      ${focusedCase ? (() => {
        const selected = kt.selectedId ? chrById(kt.selectedId) : null;
        const assignedInFocus = step.slots.flatMap((slot) => (kt.slots[slot] || []).map((id) => ({ slot, id })));
        const comparisonId = selected && poolIds.includes(kt.comparisonId) && kt.comparisonId !== selected.id ? kt.comparisonId : null;
        const caseBrief = String(state.session.caseData.clinical_history || "");
        const caseContext = caseBrief.startsWith("Assigned case.")
          ? "Use chromosome evidence to identify the finding. The diagnosis stays hidden until interpretation."
          : caseBrief;
        const compareItems = selected
          ? [{ id: selected.id, label: "Selected chromosome" }, ...(comparisonId ? [{ id: comparisonId, label: "Your comparison candidate" }] : [])]
          : assignedInFocus.slice(-2).map((item, index) => ({ id: item.id, label: index === 0 ? "Placed chromosome" : `Chromosome ${item.slot}` }));
        const comparisonCues = selected && comparisonId
          ? pairComparisonCues(selected, chrById(comparisonId))
          : "";
        const caseData = state.session.caseData;
        const comparisonNote = caseData.abnormality_category === "structural"
          ? "A rearrangement can alter one homolog's bands. Keep it with its chromosome identity and compare the centromere and remaining band pattern."
          : caseData.abnormality_category === "numerical"
            ? "A chromosome gain or loss changes copy number, not identity. Copies of that chromosome still belong in the same numbered position."
            : "A normal homolog pair has corresponding band order and centromere position. Stain intensity can vary between chromosomes.";
        return `${caseContext ? `<section class="kt-case-brief"><div><p class="eyebrow">Simulated teaching case · Case brief</p><p>${escapeHtml(caseContext)}</p></div>${caseData.case_type ? `<span class="pill">${escapeHtml(caseData.case_type === "acquired" ? "Acquired" : "Constitutional")}</span>` : ""}</section>` : ""}<div class="kt-learning-layout">
          <div class="kt-learning-main">
            <section class="karyotype-sheet focus-sheet case-focus-sheet"><div class="kt-learning-section-title"><strong>Karyogram (partial)</strong><span>${escapeHtml(focusRowCaption(kt, chromosomes))}</span></div><div class="kt-target-grid">${step.slots.map((slot) => focusPairRowHTML(kt, chromosomes, slot, {
              referenceId: pairReferences[slot],
              candidateId: comparisonId && String(chrById(selected?.id)?.identity) === String(slot) ? comparisonId : null,
              groupBlock,
            })).join("")}</div></section>
            ${tray}
          </div>
          <aside class="kt-evidence-panel"><h4>Compare banding and centromere position</h4>
            ${compareItems.length ? `<div class="kt-evidence-pair">${compareItems.map((item) => `<figure>${tokenHTML(item.id, false, 1, { widthScale: 1.65, texture: true })}<figcaption>${escapeHtml(item.label)}</figcaption></figure>`).join("")}${selected && !comparisonId ? `<div class="kt-evidence-candidate"><span aria-hidden="true">↔</span><p>Choose a candidate from the chromosome tray.</p><small>Compare relative length, centromere position, and band order.</small></div>` : ""}</div>` : `<div class="kt-evidence-empty"><span aria-hidden="true">↔</span><p>Select a chromosome from the tray to begin comparing.</p></div>`}
            ${comparisonCues}
            ${comparisonId ? `<fieldset class="kt-evidence-answers"><legend>What evidence supports this match?</legend>${[
              ["band-centromere", "Similar banding pattern and same centromere position"],
              ["rearranged-homolog", "Same chromosome identity; banding differs at a rearrangement"],
              ["size-only", "Same overall size, but different banding pattern"],
              ["centromere-differs", "Centromeres are in different positions"],
              ["extra-band", "One chromosome has an extra band"],
            ].map(([value, label]) => `<button type="button" class="kt-evidence-answer${kt.evidenceChoice === value ? " on" : ""}" data-action="select-match-evidence" data-evidence="${value}" aria-pressed="${kt.evidenceChoice === value}">${escapeHtml(label)}</button>`).join("")}
              <button type="button" class="btn primary" data-action="check-match-evidence" ${kt.evidenceChoice ? "" : "disabled"}>Check evidence</button>
              ${kt.evidenceFeedback ? `<p class="feedback ${kt.evidenceFeedback.correct ? "ok" : "review"}" role="status">${escapeHtml(kt.evidenceFeedback.message)}</p>` : ""}
            </fieldset>` : ""}
            ${comparisonId ? `<button type="button" class="btn primary kt-pair-action" data-action="pair-compared-chromosomes" ${kt.evidenceFeedback?.correct ? "" : "disabled"}>${selected && (kt.slots[String(selected.identity)] || []).includes(selected.id) ? "Place this chromosome" : "Place selected pair"}</button>` : ""}
            <p class="muted">${escapeHtml(comparisonNote)}</p>
            ${chromosomeTallyHTML(kt.focusSlots)}
            ${controls("karyotype")}
          </aside>
        </div>`;
      })() : `<div class="kt-split kt-pairing-layout">
        ${tray}
        <div class="kt-work">
          <section class="kt-comparison-prompt"><strong>What to compare</strong><span>1. Relative length</span><span>2. Centromere position</span><span>3. Matching light and dark bands</span></section>
          <div class="karyotype-sheet focus-sheet">
            <p class="group-label">Place the matching homologs</p><p class="muted">Each numbered space is one chromosome identity. A pair belongs in the same space; an extra copy stays visible in that position.</p>
            ${groupBlock(step.id, step.slots, ACTIVE_SCALE, true)}
          </div>
          ${kt.trayScope === "all" && groupLeft ? `<p class="muted">This group is placed. Continue when you are ready.</p>` : ""}
        </div>
      </div>`}
    </div>`;
}

function sheetMarkup(groupBlock, canPlace) {
  const rows = [
    ["A", ["1", "2", "3"]],
    ["B", ["4", "5"]],
    ["C", ["6", "7", "8", "9", "10", "11", "12", "X"]],
    ["D", ["13", "14", "15"]],
    ["E", ["16", "17", "18"]],
    ["F", ["19", "20"]],
    ["G", ["21", "22", "Y"]],
  ];
  return `
    <div class="sheet-block">
      <div class="karyotype-sheet karyotype-numbered">
        ${rows.map(([name, slots]) => `<div class="numbered-band"><p class="group-label">Group ${name}</p><div class="sheet-row numbered-row">${slots.map((slot) => groupBlock("", [slot], 0.72, canPlace, false, true)).join("")}</div></div>`).join("")}
      </div>
    </div>`;
}

function comparisonWorkstation() {
  const chromosomes = state.session?.chromosomes || [];
  const placed = Object.values(state.session?.karyotype?.slots || {}).flat()
    .map((id) => chromosomes.find((chromosome) => chromosome.id === id))
    .filter(Boolean);
  if (placed.length < 2) return "";
  const kt = state.session.karyotype;
  const options = (current) => placed.map((chromosome) => `<option value="${escapeHtml(chromosome.id)}"${chromosome.id === current ? " selected" : ""}>Chromosome ${escapeHtml(chromosome.identity)}${chromosome.abnormal ? " · changed" : ""}</option>`).join("");
  const left = chrById(kt.workstationA);
  const right = chrById(kt.workstationB);
  const cues = left && right && left.id !== right.id ? pairComparisonCues(left, right) : "<p>Choose two chromosomes from this karyotype. The comparison stays on this step.</p>";
  const pictures = [left, right].filter(Boolean).map((chromosome) => `<figure>${renderChromosome(chromosome, { scale: 1.15, hideIdentity: true, widthScale: 1.4, texture: true, bendSeed: chromosome.id })}<figcaption>Chromosome ${escapeHtml(chromosome.identity)}</figcaption></figure>`).join("");
  return `<section class="comparison-workstation">
    <h3>Compare two chromosomes</h3>
    <p>Select any two chromosomes already on this karyotype. Compare band order by eye, then use the centromere and relative-length cues. This does not score the case.</p>
    <div class="comparison-picks">
      <label>First <select id="workstation-a"><option value="">Choose</option>${options(kt.workstationA || "")}</select></label>
      <label>Second <select id="workstation-b"><option value="">Choose</option>${options(kt.workstationB || "")}</select></label>
    </div>
    <div class="kt-evidence-pair">${pictures}</div>
    ${cues}
  </section>`;
}

function responsePanel(step) {
  const fb = state.session.feedback[step];
  const focusedPairExercise = step === "karyotype" && state.session.karyotype.focusSlots?.length;
  if (focusedPairExercise && !fb) return "";
  const guideFirst = step === "karyotype";
  return `<div class="response">
    ${guideFirst ? panelBody(step) : ""}
    ${focusedPairExercise ? "" : controls(step)}
    ${guideFirst ? "" : panelBody(step)}
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
  if (isAssemblyStep(step)) {
    return `<div class="controls">${back}${btn("open-inspect", "Inspect")}${assemblyControls(step)}${leaveControl()}</div>`;
  }
  if (isFishStep(step)) {
    return `<div class="controls">${back}${btn("open-inspect", "Inspect")}${fishControls(step)}${leaveControl()}</div>`;
  }
  const buttons = [];
  if (back) buttons.push(back);
  if (step === "metaphase") {
    buttons.push(btn("continue-step", "Begin karyotype construction", "primary"));
  }
  if (step === "karyotype") {
    const s = state.session;
    if (s.karyotype.focusSlots?.length && !openSheet(s.karyotype)) {
      const pairsPlaced = karyotypeFocusAssigned(s.karyotype, s.chromosomes);
      const moreRounds = (s.karyotype.focusRounds?.length || 0) > (s.karyotype.focusRoundIndex || 0) + 1;
      const finishLabel = moreRounds ? "Next set" : (s.karyotype.focusSlots.length > 1 ? "Finish pair exercise" : "Finish comparison");
      const wholeCell = s.module === "disease" && s.instructionMode !== "assessment" ? btn("open-full-sheet", "Arrange the whole cell") : "";
      return `<div class="controls case-focus-controls">${back}${btn("open-inspect", "Inspect")}${btn("new-arrangement", "New arrangement")}${wholeCell}${btn("reset-kt", "Reset")}${hintButton()}${btn("submit-step", finishLabel, pairsPlaced ? "primary" : "disabled")}${leaveControl()}</div>`;
    }
    if (openSheet(s.karyotype)) {
      buttons.push(btn("reset-kt", "Reset karyotype"));
      buttons.push(btn("check-kt", "Check karyotype"));
      buttons.push(hintButton());
      buttons.push(btn("submit-step", "Submit karyotype", "primary"));
    } else {
      const gate = canAdvanceGroup(s.karyotype, s.chromosomes, karyotypeAdvanceCase(s));
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
  if (["abnormality", "iscn_construction", "iscn_interpretation", "disease", "narrative", "audit"].includes(step)) {
    buttons.push(hintButton());
    buttons.push(btn("check-step", "Check"));
    buttons.push(btn("submit-step", "Submit", "primary"));
  }
  buttons.push(leaveControl());
  return `<div class="controls">${buttons.join("")}</div>`;
}

function leaveControl() {
  const s = state.session;
  const label = s?.module === "disease"
    ? "Leave exercise"
    : (s?.module === "atlas" ? "Back to Atlas" : (fromClass(s) ? "Back to the lab" : "Start new case"));
  return btn("new-case", label, "leave");
}

function fromClass(session) {
  return String(session?.returnHref || "").startsWith("#/class");
}

function caseKindNote(type) {
  const key = String(type || "").toLowerCase();
  if (key === "constitutional") return "The finding is part of the person's chromosome complement.";
  if (key === "acquired") return "The finding arose in a tumor or a blood disease.";
  if (key === "technical") return "A method lesson, not a patient case.";
  return "";
}

function karyotypeAdvanceCase(session) {
  if (session?.instructionMode === "learn") {
    return { ...(session.caseData || {}), require_correct_groups: true };
  }
  return session?.caseData || {};
}

function btn(action, label, kind = "") {
  const disabled = kind.includes("disabled") ? " disabled" : "";
  const cls = kind.replace("disabled", "").trim();
  return `<button type="button" class="btn ${cls}" data-action="${action}"${disabled}>${label}</button>`;
}

function iscnPreviewPlan(text, caseData) {
  const raw = String(text || "").trim();
  if (!raw) return { kind: "empty" };
  const known = [caseData?.expected_iscn, ...(caseData?.accepted_iscn_variants || [])]
    .map((item) => normalizeISCN(item))
    .filter(Boolean);
  if (known.includes(normalizeISCN(raw))) {
    const items = Object.entries(caseData?.chromosome_set?.variants || [])
      .map(([key, variant]) => ({ identity: String(key).replace(/[ab]$/, ""), variant }))
      .filter((item) => segmentTransform(item.variant));
    return items.length ? { kind: "draw", items } : { kind: "count" };
  }
  const balanced = reciprocalDerivatives(raw);
  if (balanced?.length === 2) return { kind: "draw", items: balanced };
  const single = parseAbnormality(raw);
  if (single && segmentTransform(raw)) {
    return { kind: "draw", items: [{ identity: String(single.chromosomes[0]), variant: raw }] };
  }
  const parsed = parseISCN(raw);
  const abnormalities = !parsed.error && !parsed.mosaic && parsed.cellLines?.length === 1
    ? parsed.cellLines[0].abnormalities
    : null;
  if (!abnormalities?.length) return { kind: "refuse" };
  const structural = abnormalities.filter((item) => item.kind !== "numerical");
  const drawable = (token) => Boolean(segmentTransform(token) || reciprocalDerivatives(token)?.length === 2);
  if (structural.some((item) => !drawable(item.token))) return { kind: "refuse" };
  if (!structural.length) return { kind: "count" };
  if (abnormalities.some((item) => item.kind === "numerical")) return { kind: "count" };
  return {
    kind: "draw",
    items: abnormalities.flatMap((item) => reciprocalDerivatives(item.token) || [{ identity: String(item.chromosomes[0]), variant: item.token }]),
  };
}

function karyogramHTML(line) {
  if (!line?.sex || /^(IDEM|SL|SDL\d*)$/i.test(line.sex)) return "";
  const ploidy = inferPloidy(line.count, line.ploidy, line.countRange);
  const model = describeKaryogram(line.sex, line.items, line.count, { ploidy });
  if (!model?.chromosomes?.length) return "";
  const byIdentity = {};
  for (const chromosome of model.chromosomes) {
    (byIdentity[chromosome.identity] = byIdentity[chromosome.identity] || []).push(chromosome);
  }
  const block = (name, ids) => {
    const slots = ids.filter((id) => byIdentity[id]?.length);
    if (!slots.length) return "";
    return `<div class="iscn-k-group"><p class="group-label">Group ${escapeHtml(name)}</p><div class="iscn-k-slots">${slots.map((slot) => {
      const changed = byIdentity[slot].some((chromosome) => chromosome.variant && chromosome.variant !== "normal");
      return `<div class="iscn-k-slot${changed ? " iscn-k-changed" : ""}"><div class="iscn-k-body">${byIdentity[slot].map((chromosome) => renderChromosome(chromosome, { scale: 0.4, hideIdentity: true })).join("")}</div><p>${escapeHtml(slot)}${changed ? " · changed" : ""}</p></div>`;
    }).join("")}</div></div>`;
  };
  const mismatch = Number.isFinite(line.count) && line.count !== model.drawnCount
    ? `<p class="muted">The written count is ${line.count}. These symbols describe ${model.drawnCount} chromosomes.</p>`
    : "";
  const markers = byIdentity.mar?.length
    ? `<div class="iscn-k-group"><p class="group-label">Markers</p><div class="iscn-k-slots"><div class="iscn-k-slot iscn-k-changed"><div class="iscn-k-body">${byIdentity.mar.map((chromosome) => renderChromosome(chromosome, { scale: 0.4, hideIdentity: true })).join("")}</div><p>mar</p></div></div></div>`
    : "";
  return `<div class="iscn-karyogram"><p class="group-label">Karyogram</p><div class="iscn-k-row">${block("A", GROUPS.A)}${block("B", GROUPS.B)}${block("C", ["X"])}</div><div class="iscn-k-row">${block("C", GROUPS.C.filter((id) => id !== "X"))}</div><div class="iscn-k-row">${block("D", GROUPS.D)}${block("E", GROUPS.E)}</div><div class="iscn-k-row">${block("F", GROUPS.F)}${block("G", GROUPS.G)}${markers}</div>${mismatch}</div>`;
}

function structuralPictureHTML(item) {
  if (item.identity === "mar" || /^[+-]?\d*mar\d*$/i.test(item.token || item.variant || "")) {
    return `<div class="iscn-explore-pair">
      <figure>${renderChromosome({ identity: "mar", variant: item.variant || "mar" }, { scale: 1 })}<figcaption><code>${escapeHtml(item.token)}</code></figcaption></figure>
      <p>Marker chromosome of unknown origin.</p>
    </div>`;
  }
  if (item.derivatives?.length === 2) {
    return `<div class="iscn-explore-pair">
      ${item.derivatives.map((piece) => `<figure>${renderChromosome({ identity: piece.identity, variant: "normal" }, { scale: 1 })}<figcaption>Normal ${escapeHtml(piece.identity)}</figcaption></figure>
      <figure>${renderChromosome({ identity: piece.identity, variant: piece.variant }, { scale: 1 })}<figcaption><code>${escapeHtml(piece.variant)}</code></figcaption></figure>`).join("")}
      <p>${escapeHtml(breakpointPhrase(item.breakpoints) || "Both derivatives stay in their own chromosome places.")}</p>
    </div>`;
  }
  if (item.partner) {
    const partners = item.chromosomes?.length >= 2 ? item.chromosomes : [item.identity, item.partner];
    return `<div class="iscn-explore-pair">
      ${partners.map((identity) => `<figure>${renderChromosome({ identity, variant: "normal" }, { scale: 1 })}<figcaption>Normal ${escapeHtml(identity)}</figcaption></figure>`).join("")}
      <figure>${renderChromosome({ identity: item.identity, variant: item.token }, { scale: 1 })}<figcaption><code>${escapeHtml(item.token)}</code></figcaption></figure>
      <p>${escapeHtml(breakpointPhrase(item.breakpoints) || "Whole-arm fusion of the long arms")}</p>
    </div>`;
  }
  return `<div class="iscn-explore-pair">
    <figure>${renderChromosome({ identity: item.identity, variant: "normal" }, { scale: 1 })}<figcaption>Normal ${escapeHtml(item.identity)}</figcaption></figure>
    <figure>${renderChromosome({ identity: item.identity, variant: item.token }, { scale: 1 })}<figcaption><code>${escapeHtml(item.token)}</code></figcaption></figure>
    <p>${escapeHtml(breakpointPhrase(item.breakpoints) || item.type)}</p>
  </div>`;
}

function breakpointPhrase(bands) {
  if (!bands?.length) return "";
  if (bands.length === 1) return `Breakpoint ${bands[0]}`;
  return `Breakpoints ${bands.join(", ")}`;
}

function iscnExplorerHTML(raw, title = "Explore the finding") {
  const report = exploreISCN(raw);
  if (report.status === "empty") return "";
  if (report.status === "unsupported") {
    return `<section class="patient-section iscn-explorer"><h3>${escapeHtml(title)}</h3><p class="muted">The wording stays unchanged. This view draws a deletion, duplication, inversion, two-break der()t(), a two-break balanced t() as both derivatives, a whole-arm isochromosome, a whole-arm Robertsonian fusion, or a ring between two written bands. An extra or missing chromosome appears in the karyogram.</p></section>`;
  }
  const clones = resolveClones(report);
  const lines = clones.map((line) => {
    const parts = [
      clones.length > 1 ? line.label : "",
      line.count != null ? `${line.count} chromosomes` : "",
      line.sex ? `${line.sex} sex complement` : "",
      line.cloneSize != null ? `${line.cloneSize} cells recorded` : "",
      line.reference ? `${line.reference.word} expands clone ${(line.reference.clone ?? 0) + 1}` : "",
    ].filter(Boolean);
    const drawn = line.items.filter((item) => item.drawn && !item.inherited);
    const held = line.items.filter((item) => !item.drawn && !(item.kind === "numerical" && line.sex) && !item.inherited);
    const pictures = drawn.map((item) => structuralPictureHTML(item)).join("");
    const sheet = karyogramHTML(line);
    const heldList = held.map((item) => `<li><code>${escapeHtml(item.token)}</code> <span>${escapeHtml(item.note)}</span>${item.breakpoints?.length ? `<small>${escapeHtml(breakpointPhrase(item.breakpoints))}</small>` : ""}</li>`).join("");
    const empty = !sheet && !drawn.length && !held.length ? `<p class="muted">This formula names the count and sex complement. It does not name a structural change to draw.</p>` : "";
    return `<div class="iscn-explore-line">${parts.length ? `<p class="iscn-explore-components">${escapeHtml(parts.join(" · "))}</p>` : ""}${sheet}${pictures ? `<div class="iscn-explore-pairs">${pictures}</div>` : ""}${heldList ? `<ul class="iscn-undrawn">${heldList}</ul>` : ""}${empty}</div>`;
  }).join("");
  const mosaic = report.status === "mosaic"
    ? `<p class="muted">${report.prefix === "chi" ? "Chimeric" : "Mosaic"} formula. Each cell line stays separate. idem, sl, and sdl inherit the abnormalities they stand for.</p>`
    : "";
  const reading = symbolSentences(raw).map((item) => `<li><code>${escapeHtml(item.symbol)}</code> ${escapeHtml(item.sentence)}</li>`).join("");
  return `<section class="patient-section iscn-explorer"><h3>${escapeHtml(title)}</h3><p class="iscn-written"><code>${escapeHtml(report.raw)}</code></p>${mosaic}${lines}${reading ? `<ul class="iscn-symbols">${reading}</ul>` : ""}<p class="muted">Schematic G-band ideograms illustrate the written formula. They are not a specimen result.</p></section>`;
}

function formulaDifferenceHTML(learner, curated) {
  if (normalizeISCN(learner) === normalizeISCN(curated)) return `<p>The written formulas match.</p>`;
  const bag = (text) => {
    const report = exploreISCN(text);
    return (report.lines || []).flatMap((line, index) => {
      const where = (report.lines || []).length > 1 ? ` in cell line ${index + 1}` : "";
      return [
        line.count != null ? `count ${line.count}${where}` : "",
        line.sex ? `sex complement ${line.sex}${where}` : "",
        ...(line.items || []).map((item) => item.token),
      ].filter(Boolean);
    });
  };
  const learnerBag = bag(learner);
  const curatedBag = bag(curated);
  const only = (left, right) => left.filter((item) => !right.includes(item));
  const learnerOnly = only(learnerBag, curatedBag);
  const curatedOnly = only(curatedBag, learnerBag);
  const lines = [];
  if (learnerOnly.length) lines.push(`<p>In the learner’s formula only: ${learnerOnly.map((item) => `<code>${escapeHtml(item)}</code>`).join(", ")}</p>`);
  if (curatedOnly.length) lines.push(`<p>In the curated formula only: ${curatedOnly.map((item) => `<code>${escapeHtml(item)}</code>`).join(", ")}</p>`);
  if (!lines.length) lines.push(`<p>The written formulas differ. <code>${escapeHtml(learner)}</code> <code>${escapeHtml(curated)}</code></p>`);
  return lines.join("");
}

function casePictureHTML(current) {
  const draft = formulaText(current.iscnDraft);
  const reported = formulaText(visibleFinding(current));
  const note = `<p class="case-analysis-note">The metaphase image stays as attached. The karyogram, rearranged chromosomes, and the gain, loss, and breakpoint table are calculated from the written formula. Confirm them yourself. This workspace does not read the photograph or assign a diagnosis.</p>`;
  if (draft && reported) {
    return `${note}<div class="iscn-compare">${formulaBench(draft, "Your karyotype")}${formulaBench(reported, "Reported finding")}<section class="patient-section"><h3>Symbol comparison</h3>${formulaDifferenceHTML(draft, reported)}<p class="muted">This comparison names symbols. It does not assign a condition.</p></section></div>`;
  }
  if (draft) return `${note}${formulaBench(draft, "Your karyotype")}`;
  if (reported) return `${note}${formulaBench(reported, "Reported finding")}`;
  return `<section class="patient-section iscn-explorer"><h3>Your karyotype</h3><p class="muted">Write an ISCN draft and save observations. The karyogram, rearranged chromosomes, and the gain, loss, and breakpoint table are drawn from that formula.</p></section>`;
}

function formulaBench(raw, title) {
  const analysis = analyzeFormula(raw);
  if (analysis.status === "empty" || analysis.status === "unsupported") return iscnExplorerHTML(raw, title);
  const clones = resolveClones(analysis);
  const sheets = clones.map((line) => karyogramHTML(line)).filter(Boolean).join("");
  const rearranged = clones.flatMap((line) => (line.items || []).filter((item) => item.drawn && item.kind !== "numerical" && !item.inherited));
  const pictures = rearranged.length
    ? rearranged.map((item) => structuralPictureHTML(item)).join("")
    : `<p class="muted">This formula does not name a rearrangement this view can draw. A deletion, duplication, inversion, two-break der()t(), balanced t(), isochromosome, Robertsonian fusion, ring, add(), or marker is drawn when that symbol is written.</p>`;
  const mosaic = analysis.status === "mosaic"
    ? `<p class="muted">${analysis.prefix === "chi" ? "Chimeric" : "Mosaic"} formula. Each cell line is drawn and counted on its own. idem, sl, and sdl inherit the abnormalities they stand for.</p>`
    : "";
  return `<section class="patient-section formula-bench"><h3>${escapeHtml(title)}</h3><p class="iscn-written"><code>${escapeHtml(analysis.raw)}</code></p>${mosaic}${bandSpanNoteHTML(state.maps, analysis.raw)}<h4>Karyogram</h4>${sheets || `<p class="muted">A karyogram needs a written chromosome count and sex complement.</p>`}<h4>Rearranged chromosomes</h4><div class="iscn-explore-pairs">${pictures}</div><h4>Gains, losses, and breakpoints</h4>${eventTable(analysis)}<p class="muted">Calculated from the written formula. A balanced exchange is listed as breakpoints. A gain or loss is listed only when the symbol names extra material, missing material, or an isochromosome arm.</p></section>`;
}

function eventTable(analysis) {
  const rows = [
    ...analysis.gains.map((event) => ["Gain", event.chromosome, event.where, event]),
    ...analysis.losses.map((event) => ["Loss", event.chromosome, event.where, event]),
    ...analysis.breakpoints.map((event) => ["Breakpoint", event.chromosome, event.band, event]),
  ];
  if (!rows.length) return `<p class="muted">No gain, loss, or breakpoint is named in this formula.</p>`;
  return `<table class="event-table"><thead><tr><th>Event</th><th>Chromosome</th><th>Where</th><th>Symbol</th><th>Cell line</th></tr></thead><tbody>${rows.map(([kind, chromosome, where, event]) => `<tr><td>${kind}</td><td>${escapeHtml(chromosome || "—")}</td><td>${escapeHtml(where || "—")}</td><td><code>${escapeHtml(event.token)}</code></td><td>${escapeHtml(event.line)}</td></tr>`).join("")}</tbody></table>`;
}

function caseSetAnalysisHTML(cases) {
  const set = analyzeCaseSet(cases.map((item) => ({ formula: formulaText(item.iscnDraft) || formulaText(visibleFinding(item)) })));
  const empty = !set.used
    ? `<p class="muted">Save an ISCN finding or a working draft on a case. This chart reads those formulas together.</p>`
    : "";
  const width = (count) => `${Math.max(0, Math.round((count / set.max) * 100))}%`;
  const chart = set.rows.map((row) => `<li class="gain-loss-row"><span class="gl-name">${escapeHtml(row.id)}</span><span class="gl-track loss" title="${row.losses} loss${row.losses === 1 ? "" : "es"}"><span class="gl-bar loss" style="width:${row.losses ? width(row.losses) : "0"}"></span></span><span class="gl-count">${row.losses || ""}</span><span class="gl-track gain" title="${row.gains} gain${row.gains === 1 ? "" : "s"}"><span class="gl-bar gain" style="width:${row.gains ? width(row.gains) : "0"}"></span></span><span class="gl-count">${row.gains || ""}</span><span class="gl-break" title="${row.breakpoints} breakpoint${row.breakpoints === 1 ? "" : "s"}">${row.breakpoints ? row.breakpoints : "—"}</span></li>`).join("");
  const bands = set.bandRows.length
    ? `<table class="event-table"><thead><tr><th>Breakpoint</th><th>Formulas</th></tr></thead><tbody>${set.bandRows.map((row) => `<tr><td><code>${escapeHtml(row.band)}</code></td><td>${row.count}</td></tr>`).join("")}</tbody></table>`
    : "";
  return `<section class="casework-panel case-set-panel"><header><div><p class="eyebrow">Across the saved formulas</p><h3>Gains, losses, and breakpoints</h3><p>${set.used ? `${set.used} formula${set.used === 1 ? "" : "s"} read. Each written cell line counts once.` : "No readable karyotype formula is saved yet."} Losses sit on the left in red. Gains sit on the right in green. The blue number is the breakpoint count. Bar width follows the highest count in this set.</p></div></header>${empty}${chart ? `<p class="gl-legend"><span>Loss</span><span>Gain</span><span>Breakpoints</span></p><ol class="gain-loss-chart">${chart}</ol>` : ""}${bands}<p class="local-note">This is a study tally of formulas saved on this device. It is not a cohort analysis and it does not assign a diagnosis.</p></section>`;
}

function iscnPreviewHTML(text, caseData) {
  const plan = iscnPreviewPlan(text, caseData);
  if (plan.kind === "empty") return "";
  if (plan.kind === "count") {
    const report = exploreISCN(text);
    const sheet = (report.lines || []).map((line) => karyogramHTML(line)).join("");
    return `${sheet}<p class="muted">The karyogram shows the written count and sex complement. A deletion, duplication, inversion, derivative, isochromosome, Robertsonian fusion, or ring is drawn when that symbol is in the formula.</p>`;
  }
  if (plan.kind === "refuse") {
    return `<p class="muted">The drawing preview shows a deletion, duplication, inversion, two-break der()t(), whole-arm isochromosome, whole-arm Robertsonian fusion, ring between two bands, or a known string for this case.</p>`;
  }
  return plan.items.map((item) => `
    <figure>
      ${renderChromosome({ identity: item.identity, variant: item.variant }, { scale: 0.7 })}
      <figcaption>Chromosome ${escapeHtml(item.identity)}</figcaption>
    </figure>`).join("");
}

function openSessionInspection() {
  const session = state.session;
  const chromosomes = session?.chromosomes || [];
  if (!chromosomes.length) return;
  const involved = new Set((session.caseData?.chromosomes_involved || []).map(String));
  const preferred = chromosomes.filter((chromosome) => involved.has(String(chromosome.identity)));
  const pair = preferred.length ? preferred : chromosomes;
  openInspection({
    title: "Chromosome inspection",
    chromosomes,
    leftId: pair[0]?.id,
    rightId: pair[1]?.id || pair[0]?.id,
  });
}

function auditPanel() {
  const audit = proposedAudit(state.session.caseData);
  const choice = state.session.answers.audit || "";
  return `<form class="audit-form">
    <p>${escapeHtml(audit.prompt)}</p>
    <p><code>${escapeHtml(audit.proposal)}</code></p>
    <fieldset><legend>Does this proposed result agree with the evidence?</legend>
      ${audit.choices.map((item) => `<label class="check"><input type="radio" name="audit-choice" value="${escapeHtml(item.id)}" ${choice === item.id ? "checked" : ""}/> ${escapeHtml(item.label)}</label>`).join("")}
    </fieldset>
  </form>`;
}

function checkAudit() {
  const audit = proposedAudit(state.session.caseData);
  const choice = state.session.answers.audit || "";
  const ok = choice === audit.answer;
  writeFeedback("audit", {
    tone: ok ? "ok" : "review",
    scored: true,
    title: ok ? "That identifies the inconsistency." : (choice ? "That does not match the inconsistency." : "Choose what is wrong with the proposed result."),
    body: ok ? audit.why : "Compare the proposal with the chromosomes or with what the assay can establish.",
  });
}

function panelBody(step) {
  const s = state.session;
  const c = s.caseData;
  if (isTeachStep(step)) {
    const lesson = lessonForContext(s.atlas?.disease, applyStep(step), s.exercise, s.caseData) || { title: "Before you answer", html: "<p>Read this distinction, then try the next screen.</p>" };
    return `<article class="teach-card"><h3>${escapeHtml(lesson.title)}</h3>${lesson.html}</article>`;
  }
  if (step === "metaphase") return `<p>Inspect morphology before cutting chromosomes into the worksheet. Demonstration graphics are schematic.</p>`;
  if (step === "karyotype") {
    if (s.karyotype.focusSlots?.length && !openSheet(s.karyotype)) return "";
    if (openSheet(s.karyotype)) {
      return `<p>Drag a chromosome into its number, or select it and then click the box. Each row is a Denver group. The tray above is the full set.</p>`;
    }
    return `<div>
      ${s.instructionMode === "learn" ? `<details class="kt-reference"><summary>Reference: centromere positions</summary>${centromereKeyHtml()}</details>` : ""}
      <p>${s.karyotype.focusSlots?.length ? `This focused case exercise compares chromosomes ${escapeHtml(s.karyotype.focusSlots.join(" and "))}; unrelated chromosomes do not need to be sorted.` : "Work one group at a time."} Compare length, centromere position, and band pattern. Both homologs go in the same numbered position. Drag a chromosome into a position, or select it and then choose its destination.</p>
      <p class="muted">${s.module === "atlas" || s.module === "disease"
        ? "An abnormal homolog still belongs in its own number's box. Next group stays closed until the open boxes are correct."
        : "Next group stays closed until each box holds the right chromosomes. Submit after the last group to grade the whole karyotype."}</p>
    </div>`;
  }
  if (step === "unavailable") return `<p>This activity is not available. The case does not include the data the step needs, so no empty worksheet is shown.</p>`;
  if ((s.module === "atlas" || s.module === "disease") && isAtlasLabStep(step)) return atlasLabBody(step);
  if (step === "audit") return auditPanel();
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
    const prompt = c.iscn_prompt || c.expected_iscn;
    return `<div class="iscn-card">
      <p class="iscn-display">${escapeHtml(prompt)}</p>
      ${s.instructionMode === "learn" ? symbolSentenceHTML(prompt) : ""}
      ${s.instructionMode === "learn" ? bandSpanNoteHTML(state.maps, prompt) : ""}
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
      <div id="iscn-preview" class="iscn-preview">${iscnPreviewHTML(s.answers.iscn, c)}</div>
      ${s.instructionMode === "learn" ? symbolSentenceHTML(s.answers.iscn) : ""}
      <div id="band-span-note">${s.instructionMode === "learn" ? bandSpanNoteHTML(state.maps, s.answers.iscn) : ""}</div>
    </div>`;
  }
  if (step === "disease") {
    if (s.exercise === "disease_association") {
      const choices = findingChoices(s.atlas?.disease, state.diseases);
      return `<div>
        <p>The condition is already named. Choose the chromosome finding that belongs to it. The other choices are the canonical findings of different conditions.</p>
        <fieldset class="dx-set">
          <legend>Chromosome finding</legend>
          ${choices.map((choice) => radio("diagnosis", choice.id, s.answers.diagnosis, choice.label)).join("")}
        </fieldset>
      </div>`;
    }
    const options = shuffle(c.diagnosis_options || [c.diagnosis], seedFrom(c.case_id + "-dx"));
    return `<div>
      ${c.origin_context ? `<p>${escapeHtml(c.origin_context)}</p>` : ""}
      <p>Name one condition this teaching case associates with the finding. Another condition can share the same chromosome change. The reference library keeps syntax, chromosome structure, and disease association as separate checks.</p>
      <fieldset class="dx-set">
        <legend>Possible association</legend>
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
    ${s.karyotype?.focusSlots?.length ? `<p class="asset-banner">Focused pair exercise: only the selected chromosome groups were matched. Empty positions in this partial worksheet are not chromosome losses. The case explanation describes the full teaching case, not a complete karyotype constructed in this exercise.</p>` : ""}
    <ul class="score-list">
      ${rows.map((r) => `<li><span>${escapeHtml(r.skill)}</span><strong>${escapeHtml(r.result)}</strong>${r.detail ? `<em>${escapeHtml(r.detail)}</em>` : ""}</li>`).join("") || "<li>No scored steps were completed.</li>"}
    </ul>
    <p class="muted">Attempts — karyotype checks: ${att.karyotypeChecks}; abnormality: ${att.abnormalityAttempts}; ISCN: ${att.iscnAttempts}; disease: ${att.diseaseAttempts}. Hints used: ${att.hintsUsed}.</p>
    ${Number.isFinite(s.presentation) ? `<p class="muted">Specimen seed ${s.presentation}. The same metaphase and FISH field open again from <code>?seed=${s.presentation}</code> before the <code>#</code> in this case’s address.</p>` : ""}
    <h3>Case explanation</h3>
    <p class="iscn-display">${escapeHtml(reveal || "")}</p>
    ${bandSpanNoteHTML(state.maps, reveal)}
    <p>${escapeHtml(c.plain_language_interpretation || "")}</p>
    <p>${escapeHtml(c.explanation || "")}</p>
    ${(s.module === "disease" || !s.instructionMode) && (s.atlas?.mode !== "assigned" || (s.steps || []).includes("disease")) && c.diagnosis ? `<p><strong>Associated condition (teaching case):</strong> ${escapeHtml(c.diagnosis)}</p>` : ""}
    ${c.references?.length ? `<h3>References</h3><ul class="refs">${c.references.map((r) => `<li><strong>${escapeHtml(r.label)}.</strong> ${escapeHtml(r.citation)}</li>`).join("")}</ul>` : ""}
    <div class="controls">
      ${assignmentBackButton()}
      ${btn("new-case", s.classNext ? "Continue the lab" : (s.module === "disease" ? "Back to case" : "Start new case"), "primary")}
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
    <p class="notice">The instructor flag is a display setting for classroom demonstrations, not access control. Answer keys ship with the case data and are stored in the browser, so a student who inspects the files or storage can read them. Do not rely on this application to keep graded answers confidential.</p>
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

function bandSpanReason(pattern) {
  if (pattern === "start") return "Includes the first base, so only the inner band is written";
  if (pattern === "end") return "Includes the last base, so only the inner band is written";
  if (pattern === "repeat") return "Both ends fall in the same band, so the band is written twice";
  return "Both ends are interior, so both bands are written";
}

function bandSpanReferenceHTML() {
  const rows = demonstrationSpans(state.maps);
  const body = rows.map((row) => `<tr><td>chr${escapeHtml(row.chromosome)}:${formatBase(row.start)}–${formatBase(row.end)}</td><td>${row.symbol === "dup" ? "Duplication" : "Deletion"}</td><td><code>${escapeHtml(row.notation)}</code></td><td>${escapeHtml(bandSpanReason(row.pattern))}</td></tr>`).join("");
  const table = body
    ? `<table class="case-table"><thead><tr><th>Interval on GRCh38</th><th>Change</th><th>Written form</th><th>Why</th></tr></thead><tbody>${body}</tbody></table>`
    : `<p class="muted">The worked intervals appear after the chromosome map loads.</p>`;
  return `<h3>Copy-number intervals</h3>
    <p>A deletion or duplication that is known by its base-pair interval can be written from the bands that contain its ends. A loss is <code>del</code>. A gain is <code>dup</code>. Positions are 1-based and include both ends. These rows are calculated from the GRCh38 map stored with this laboratory.</p>
    ${table}
    <p>The chromosome 8 rows in Illumina’s published table that fall inside GRCh38 produce the same strings. The row that ends at base 146,364,022 uses the GRCh37 length of chromosome 8. Chromosome 8 on this map is 145,138,636 bases, so that row is not applied. Their chromosome X example, bases 86,200,001–103,700,000, falls in Xq21.2 and Xq22.2 here, which writes <code>del(X)(q21.2q22.2)</code>.</p>
    <h3>Whole-chromosome plus and minus signs</h3>
    <p>The same Illumina note counts whole-chromosome copy number from a reference sex karyotype. Each extra copy is its own plus sign, and each missing copy is its own minus sign. Two missing copies of chromosome 10 are <code>-10,-10</code>. The chromosome total is the reference count plus the net of those signs. On an XY baseline, one extra X is <code>+X</code>. Cases in this laboratory still write the full complement, such as <code>47,XXY</code> and <code>45,X</code>.</p>
    <p class="muted">Sources are listed on the <a href="#/credits">credits</a> page. These rules explain <code>del</code> and <code>dup</code> strings. They do not grade a karyotype, and they do not write microarray sample strings.</p>`;
}

function creditsView() {
  return `<main class="reference">
    <h2>Credits</h2>
    <p>This laboratory is a teaching program. The sources below are the band map, the nomenclature the exercises use, the copy-number writing rule, and the files downloaded for the separate reference database. Disease and case pages keep the citations stored on those records.</p>
    <h3>Cytogenetic nomenclature</h3>
    <p>McGowan-Jordan J, Hastings RJ, Moore S, eds. <cite>ISCN 2020: An International System for Human Cytogenomic Nomenclature</cite>. Basel: Karger; 2020.</p>
    <p><a href="https://karger.com/books/book/358/ISCN-2020An-International-System-for-Human" target="_blank" rel="noopener noreferrer">ISCN 2020 at Karger</a></p>
    <p>Karyotype strings in the exercises follow that system. The examples in the reference library are teaching strings.</p>
    <h3>Chromosome band map</h3>
    <p>Band coordinates and G-stain calls are the NCBI ideogram distributed by the UCSC Genome Browser as cytoBandIdeo for GRCh38/hg38. Alternate contigs in that file are not included. The two acen intervals on each chromosome are stored as one centromere. Retrieved 2026-10-24.</p>
    <p><a href="https://hgdownload.soe.ucsc.edu/goldenPath/hg38/database/cytoBandIdeo.txt.gz" target="_blank" rel="noopener noreferrer">UCSC cytoBandIdeo.txt.gz for hg38</a></p>
    <h3>Copy-number band spans</h3>
    <p>The rule that turns a base-pair interval into a <code>del</code> or <code>dup</code> band string is the variant-level method in Illumina Connected Annotations, “ISCN-like Simple Nomenclature.” A loss is written <code>del</code>. A gain is written <code>dup</code>. An interval that includes the first or last base of the chromosome keeps only the inner band. Any other interval writes the start band and the end band, repeating the band when both ends fall in it.</p>
    <p><a href="https://help.connected.illumina.com/annotation/v4.0/core-functionality/simple-nomenclature-notation" target="_blank" rel="noopener noreferrer">Illumina Connected Annotations: ISCN-like Simple Nomenclature</a></p>
    <p>That page’s chromosome 8 examples were checked against this GRCh38 map. Rows whose bases fall on the map produce the published string. The row ending at 146,364,022 is the GRCh37 length of chromosome 8 and is outside this map. The chromosome X interval 86,200,001–103,700,000 is published there as <code>del(X)(q21.31q22.2)</code>. On this cytoBandIdeo map those bases fall in Xq21.2 and Xq22.2, so the laboratory writes <code>del(X)(q21.2q22.2)</code>.</p>
    <p>The same page describes sample-level microarray strings, including copy number and <code>hmz</code>, and whole-chromosome ploidy tokens counted from a reference sex karyotype. The microarray sample strings are not used as answers. The plus and minus counting note on the reference page is the ploidy description this laboratory uses. Cases still expect the full complement, such as <code>47,XXY</code>.</p>
    <p>No Illumina pipeline, VCF field, or clinical caller is included. Nothing on this page is a diagnostic report.</p>
    <h3>Reference database downloads</h3>
    <p>These files were retrieved on 2026-10-25 for the local reference database in <code>reference-database/</code>. That database is separate from the teaching cases. A search result there is a stored record, not a diagnosis.</p>
    <p>NCBI MedGen, weekly files from <a href="https://ftp.ncbi.nlm.nih.gov/pub/medgen/" target="_blank" rel="noopener noreferrer">ftp.ncbi.nlm.nih.gov/pub/medgen/</a>. The MedGen README in that directory was last updated November 6, 2024. Files saved: <code>MGCONSO.RRF.gz</code>, <code>NAMES.RRF.gz</code>, <code>MGSTY.RRF.gz</code>, <code>MGDEF.RRF.gz</code>, <code>MedGenIDMappings.txt.gz</code>, <code>MedGen_Sources.txt</code>, and <code>README.txt</code>. NLM-authored MedGen material is public-domain information from the National Library of Medicine. Names and definitions kept in the database come from the Genetic Testing Registry, NCI, MeSH, Orphanet, Mondo, HPO, GeneReviews, and MedlinePlus Genetics. SNOMED CT strings and OMIM narrative text were not copied. OMIM numbers and other external identifiers are stored as identifiers. MedGen record: <a href="https://www.ncbi.nlm.nih.gov/medgen/" target="_blank" rel="noopener noreferrer">ncbi.nlm.nih.gov/medgen</a>.</p>
    <p>ClinGen Dosage Sensitivity curation lists, GRCh38 assembly <code>GCF_000001405.36</code>, from <a href="https://ftp.clinicalgenome.org/" target="_blank" rel="noopener noreferrer">ftp.clinicalgenome.org</a>. <a href="https://ftp.clinicalgenome.org/ClinGen_region_curation_list_GRCh38.tsv" target="_blank" rel="noopener noreferrer"><code>ClinGen_region_curation_list_GRCh38.tsv</code></a> is dated 28 Apr 2026 in the file. <a href="https://ftp.clinicalgenome.org/ClinGen_gene_curation_list_GRCh38.tsv" target="_blank" rel="noopener noreferrer"><code>ClinGen_gene_curation_list_GRCh38.tsv</code></a> is dated 25 Oct 2026 in the file. The directory README was dated 18 March 2026. Scores, cytobands, and coordinates are stored as published. Description of the work: <a href="https://dosage.clinicalgenome.org/" target="_blank" rel="noopener noreferrer">ClinGen Dosage Sensitivity Map</a> and the <a href="https://www.clinicalgenome.org/working-groups/dosage-sensitivity-curation/" target="_blank" rel="noopener noreferrer">Dosage Sensitivity Curation Working Group</a>.</p>
    <p>Mondo display names, <a href="https://ftp.clinicalgenome.org/mondo_titles.tsv" target="_blank" rel="noopener noreferrer"><code>mondo_titles.tsv</code></a>, from the same ClinGen FTP directory. The titles are used when a ClinGen row cites a Mondo identifier. Mondo is the Mondo Disease Ontology, <a href="https://mondo.monarchinitiative.org/" target="_blank" rel="noopener noreferrer">mondo.monarchinitiative.org</a>.</p>
    <p>The Mitelman Database was not downloaded. Its public site is a search page, and no redistributable bulk file was identified for this application.</p>
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
        <tr><td><code>47,XX,+8</code></td><td>Female with an extra chromosome 8</td></tr>
        <tr><td><code>45,X</code></td><td>Monosomy X (do not write XO)</td></tr>
        <tr><td><code>47,XXY</code></td><td>Male with an extra X chromosome</td></tr>
        <tr><td><code>46,XX,del(5)(p15.2)</code></td><td>Terminal deletion of 5p at band p15.2</td></tr>
        <tr><td><code>46,XY,t(9;22)(q34;q11.2)</code></td><td>Reciprocal translocation; Philadelphia chromosome is der(22)</td></tr>
        <tr><td><code>47,XX,+8[6]/46,XX[14]</code></td><td>Two cell lines; numbers in brackets are cell counts</td></tr>
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
    ${bandSpanReferenceHTML()}
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
  root.addEventListener("pointerdown", onPointerDown);
  root.addEventListener("pointermove", onPointerMove);
  root.addEventListener("pointerup", onPointerUp);
  root.addEventListener("pointercancel", onPointerCancel);
  root.addEventListener("keydown", onKey);
  if (!benchKeysBound) {
    document.addEventListener("keydown", onBenchKey, true);
    benchKeysBound = true;
  }
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
  if (Date.now() < suppressClickUntil) {
    suppressClickUntil = 0;
    ev.preventDefault();
    ev.stopPropagation();
    return;
  }
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
  const compareSlot = ev.target.closest("[data-compare-slot]");
  if (compareSlot && state.session.karyotype.focusSlots?.length) {
    selectComparisonTarget(compareSlot.getAttribute("data-compare-slot"));
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
    if (kt.focusSlots?.length && kt.selectedId && kt.selectedId !== id && kt.pool.includes(id) && activeFocusReference(kt)) {
      patchSession({ karyotype: { ...kt, comparisonId: kt.comparisonId === id ? null : id, evidenceChoice: null, evidenceFeedback: null } });
      rerenderWorkspace();
      return;
    }
    if (kt.focusSlots?.length && kt.selectedId === id) return;
    if (kt.selectedId === id) patchSession({ karyotype: { ...kt, selectedId: null, comparisonId: null, evidenceChoice: null, evidenceFeedback: null } });
    else patchSession({ karyotype: { ...kt, selectedId: id, comparisonId: null, evidenceChoice: null, evidenceFeedback: null } });
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
  if (t.id === "workstation-a" || t.id === "workstation-b") {
    const key = t.id === "workstation-a" ? "workstationA" : "workstationB";
    s.karyotype = { ...s.karyotype, [key]: t.value };
    rerenderWorkspace();
    return;
  }
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
  if (t.name === "audit-choice") s.answers.audit = t.value;
  if (t.name === "fish-scorable" || t.name === "fish-relationship" || t.name === "fish-interp" || t.name === "fish-strategy") {
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
  if (id === "iscn-input") {
    s.answers.iscn = ev.target.value;
    const preview = $("#iscn-preview");
    if (preview) preview.innerHTML = iscnPreviewHTML(s.answers.iscn, s.caseData);
    const spanNote = $("#band-span-note");
    if (spanNote) spanNote.innerHTML = bandSpanNoteHTML(state.maps, s.answers.iscn);
  }
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
let pointerDrag = null;
let suppressClickUntil = 0;
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
  const zone = ev.target.closest("[data-slot], [data-drop], [data-compare-slot]");
  if (zone) {
    ev.preventDefault();
    ev.dataTransfer.dropEffect = "move";
    zone.classList.add("drag-over");
  }
}
function onDragLeave(ev) {
  const zone = ev.target.closest("[data-slot], [data-drop], [data-compare-slot]");
  if (zone && !zone.contains(ev.relatedTarget)) zone.classList.remove("drag-over");
}
function onDragEnd() {
  $$(".drag-over, .dragging").forEach((el) => el.classList.remove("drag-over", "dragging"));
  dragId = null;
}
function onPointerDown(ev) {
  const token = ev.target.closest(".chr-token.interactive");
  const current = state.session.karyotype;
  if (!token || !current.focusSlots?.length || token.getAttribute("draggable") !== "false") return;
  const id = token.getAttribute("data-id");
  if (!current.pool.includes(id) || id === current.selectedId) return;
  pointerDrag = { id, token, startX: ev.clientX, startY: ev.clientY, active: false };
}
function onPointerMove(ev) {
  if (!pointerDrag) return;
  if (!pointerDrag.active && Math.hypot(ev.clientX - pointerDrag.startX, ev.clientY - pointerDrag.startY) < 6) return;
  pointerDrag.active = true;
  pointerDrag.token.classList.add("dragging");
  ev.preventDefault();
  const target = document.elementFromPoint(ev.clientX, ev.clientY)?.closest("[data-compare-slot]");
  $$("[data-compare-slot].drag-over").forEach((el) => { if (el !== target) el.classList.remove("drag-over"); });
  if (target && state.session.karyotype.focusSlots?.includes(target.getAttribute("data-compare-slot"))) target.classList.add("drag-over");
}
function onPointerUp(ev) {
  if (!pointerDrag) return;
  const drag = pointerDrag;
  pointerDrag = null;
  $$("[data-compare-slot].drag-over, .chr-token.dragging").forEach((el) => el.classList.remove("drag-over", "dragging"));
  if (!drag.active) return;
  ev.preventDefault();
  suppressClickUntil = Date.now() + 400;
  setTimeout(() => { suppressClickUntil = 0; }, 0);
  const target = document.elementFromPoint(ev.clientX, ev.clientY)?.closest("[data-compare-slot]");
  if (target) placeComparisonCandidate(drag.id, target.getAttribute("data-compare-slot"));
}
function onPointerCancel() {
  pointerDrag = null;
  $$("[data-compare-slot].drag-over, .chr-token.dragging").forEach((el) => el.classList.remove("drag-over", "dragging"));
}
function allowedDest(dest) {
  if (dest === "pool") return true;
  const s = state.session;
  if (benchOn(s)) return benchSlotAllowed(dest);
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
  const compareSlot = ev.target.closest("[data-compare-slot]");
  if (compareSlot) {
    const id = ev.dataTransfer.getData("text/plain") || dragId;
    ev.preventDefault();
    placeComparisonCandidate(id, compareSlot.getAttribute("data-compare-slot"));
    return;
  }
  const slot = ev.target.closest("[data-slot]");
  if (!slot) return;
  ev.preventDefault();
  if (state.session.karyotype.focusSlots?.length) return;
  const dest = slot.getAttribute("data-slot");
  if (!allowedDest(dest)) return;
  const id = ev.dataTransfer.getData("text/plain") || dragId;
  if (!id) return;
  if (benchOn(state.session)) {
    benchMove(id, dest);
    return;
  }
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
    return;
  }
  const compareSlot = ev.target.closest("[data-compare-slot]");
  if (compareSlot && state.session.karyotype.focusSlots?.length && (ev.key === "Enter" || ev.key === " ")) {
    ev.preventDefault();
    selectComparisonTarget(compareSlot.getAttribute("data-compare-slot"));
    return;
  }
  const token = ev.target.closest(".chr-token.interactive");
  if (token && (ev.key === "Enter" || ev.key === " ")) {
    ev.preventDefault();
    const id = token.getAttribute("data-id");
    const current = state.session.karyotype;
    if (current.focusSlots?.length && current.selectedId && current.selectedId !== id && current.pool.includes(id) && activeFocusReference(current)) {
      patchSession({ karyotype: { ...current, comparisonId: current.comparisonId === id ? null : id, evidenceChoice: null, evidenceFeedback: null } });
      rerenderWorkspace();
      return;
    }
    if (current.focusSlots?.length && current.selectedId === id) return;
    patchSession({ karyotype: { ...current, selectedId: current.selectedId === id ? null : id, comparisonId: null, evidenceChoice: null, evidenceFeedback: null } });
    rerenderWorkspace();
    return;
  }
  const slot = ev.target.closest("[data-slot]");
  if (slot && state.session.karyotype.selectedId && (ev.key === "Enter" || ev.key === " ")) {
    ev.preventDefault();
    placeSelected(slot.getAttribute("data-slot"));
  }
}

function placeSelected(dest) {
  const kt = state.session.karyotype;
  if (kt.focusSlots?.length) return;
  if (!kt.selectedId || !allowedDest(dest)) return;
  if (benchOn(state.session)) {
    benchMove(kt.selectedId, dest);
    return;
  }
  patchSession({ karyotype: moveChromosome(kt, kt.selectedId, dest) });
  rerenderWorkspace();
}

function comparisonReferenceId(current, identity) {
  const selected = current.pool.includes(current.selectedId)
    && String(chrById(current.selectedId)?.identity) === String(identity)
    ? current.selectedId : null;
  return (current.slots[identity] || [])[0] || selected
    || current.pool.find((id) => String(chrById(id)?.identity) === String(identity));
}

function focusCopyCount(chromosomes, identity) {
  return chromosomes.filter((item) => String(item.identity) === String(identity)).length;
}

function focusCopyProfile(kt, chromosomes) {
  return (kt.focusSlots || []).map((identity) => focusCopyCount(chromosomes, identity));
}

function focusExerciseTitle(kt, chromosomes) {
  const counts = focusCopyProfile(kt, chromosomes);
  if (counts.length === 1 && counts[0] === 1) return "No homolog to match";
  if (counts.some((count) => count === 1) && counts.some((count) => count !== 1)) return "Match the pairs";
  if (counts.length > 1) return "Match representative pairs";
  return counts[0] > 2 ? "Place every copy" : "Build a matched pair";
}

function focusExerciseNote(kt, chromosomes) {
  const counts = focusCopyProfile(kt, chromosomes);
  const single = counts.some((count) => count === 1);
  const extra = counts.some((count) => count > 2);
  if (counts.length === 1 && counts[0] === 1) {
    return "This cell has one copy of this chromosome. It stays in the row. There is no second chromosome to compare.";
  }
  if (single && extra) {
    return "Place every copy of a chromosome that has more than two. A chromosome with only one copy is already in its row. Compare banding pattern, centromere position, and relative length.";
  }
  if (single) {
    return "Match each pair by banding pattern, centromere position, and relative length. A chromosome with only one copy is already in its row.";
  }
  if (extra) {
    return "Start with the highlighted chromosome. Compare each remaining copy with it, choose the evidence that supports the match, and place every copy in this row. An extra chromosome has its own position. Use banding pattern, centromere position, and relative length.";
  }
  return "Start with the highlighted chromosome. Compare it with a candidate, choose the evidence that supports your match, then place the pair. Use banding pattern, centromere position, and relative length.";
}

function focusRowCaption(kt, chromosomes) {
  const counts = focusCopyProfile(kt, chromosomes);
  const single = counts.some((count) => count === 1);
  const extra = counts.some((count) => count > 2);
  if (counts.length === 1 && single) return "This chromosome has no second copy in the cell";
  if (single && extra) return "Place every copy. A single copy is already in its row";
  if (single) return "Match each pair. A chromosome with no homolog is already in its row";
  if (extra) return "Each row begins with a reference chromosome; place every copy beside it";
  return "Each row begins with a reference chromosome; match its homolog";
}

function focusProgressLabel(kt, chromosomes, pairTargets, completedPairs) {
  const uneven = pairTargets.some((identity) => focusCopyCount(chromosomes, identity) !== 2);
  if (!uneven) return `${completedPairs} of ${pairTargets.length} pairs matched`;
  const goal = pairTargets.reduce((sum, identity) => sum + focusCopyCount(chromosomes, identity), 0);
  const placed = pairTargets.reduce((sum, identity) => sum + (kt.slots[identity] || []).length, 0);
  return `${placed} of ${goal} copies placed`;
}

function focusAnchorIds(kt, slot) {
  const placed = [...(kt.slots[slot] || [])];
  const referenceId = comparisonReferenceId(kt, slot);
  if (!referenceId) return placed;
  if (!placed.includes(referenceId)) return [referenceId, ...placed];
  return [referenceId, ...placed.filter((id) => id !== referenceId)];
}

function focusPairRowHTML(kt, chromosomes, slot, { referenceId, candidateId, groupBlock }) {
  const expected = focusCopyCount(chromosomes, slot);
  if (!referenceId) {
    const row = groupBlock(slot, [slot], .82, false, true);
    if (expected !== 1) return row;
    return row.replace(`<p class="slot-num">${slot}</p>`, `<p class="slot-num">${escapeHtml(slot)}</p><p class="slot-single">No second copy</p>`);
  }
  const anchors = focusAnchorIds(kt, slot);
  const openCount = Math.max(0, expected - anchors.length);
  const placeholders = Array.from({ length: openCount }, (_, index) => {
    const filled = index === 0 && candidateId;
    const position = anchors.length + index + 1;
    const label = filled
      ? `Comparison candidate in position ${position} of ${expected} for chromosome ${slot}`
      : `Empty position ${position} of ${expected} for chromosome ${slot}. Choose a candidate from the tray or drag one here.`;
    const prompt = openCount > 1 ? "Drop here" : "Click a candidate";
    return `<div class="kt-pair-placeholder${filled ? " has-candidate" : ""}" data-compare-slot="${escapeHtml(slot)}" tabindex="0" role="button" aria-label="${escapeHtml(label)}">${filled ? `${tokenHTML(candidateId, false, .62, { texture: true })}<small>Candidate</small>` : `<span aria-hidden="true">＋</span><small>${prompt}</small>`}</div>`;
  }).join("");
  const singleNote = expected === 1 ? `<p class="slot-single">No second copy</p>` : "";
  return `<div class="chr-group case-focus-group"><p class="group-label">Chromosome ${escapeHtml(slot)}</p><div class="group-slots"><div class="slot case-focus-slot"><div class="slot-body">${anchors.map((id) => tokenHTML(id, false, .82, { texture: true })).join("")}${placeholders}</div><p class="slot-num">${escapeHtml(slot)}</p>${singleNote}</div></div></div>`;
}

function activeFocusReference(kt) {
  if (!kt?.selectedId) return false;
  if (kt.pool.includes(kt.selectedId)) return true;
  return (kt.focusSlots || []).some((identity) => (kt.slots[identity] || []).includes(kt.selectedId));
}

function selectComparisonTarget(identity) {
  const current = state.session.karyotype;
  if (!current.focusSlots?.includes(identity)) return;
  if (String(chrById(current.selectedId)?.identity) === String(identity)
    && current.comparisonId
    && current.pool.includes(current.comparisonId)) return;
  const referenceId = comparisonReferenceId(current, identity);
  if (!referenceId) return;
  patchSession({ karyotype: { ...current, selectedId: referenceId, comparisonId: null, evidenceChoice: null, evidenceFeedback: null } });
  rerenderWorkspace();
}
function placeComparisonCandidate(id, identity) {
  const current = state.session.karyotype;
  if (!current.focusSlots?.includes(identity) || !current.pool.includes(id)) return;
  const referenceId = comparisonReferenceId(current, identity);
  const referenceReady = current.pool.includes(referenceId) || (current.slots[identity] || []).includes(referenceId);
  if (!referenceId || id === referenceId || !referenceReady) return;
  patchSession({ karyotype: { ...current, selectedId: referenceId, comparisonId: id, evidenceChoice: null, evidenceFeedback: null } });
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
  if (action === "open-inspect") {
    openSessionInspection();
    return;
  }
  if (action === "new-metaphase") {
    patchSession({ presentation: Math.floor(Math.random() * 1e9) });
    rerenderWorkspace();
    return;
  }
  if (action === "new-arrangement") {
    patchSession({
      karyotype: reshuffleCurrentTray(s.karyotype, s.chromosomes),
      variation: (s.variation || 0) + 1,
    });
    rerenderWorkspace();
    return;
  }
  if (action === "open-full-sheet") {
    patchSession({ karyotype: benchStart(s) });
    rerenderWorkspace();
    return;
  }
  if (action.startsWith("bench-") && handleBenchAction(action, el)) return;
  if (action === "select-match-evidence") {
    const evidenceChoice = el?.dataset.evidence;
    if (!s.karyotype.comparisonId || !["band-centromere", "rearranged-homolog", "size-only", "centromere-differs", "extra-band"].includes(evidenceChoice)) return;
    patchSession({ karyotype: { ...s.karyotype, evidenceChoice, evidenceFeedback: null } });
    rerenderWorkspace();
    return;
  }
  if (action === "check-match-evidence") {
    const selected = chrById(s.karyotype.selectedId);
    const candidate = chrById(s.karyotype.comparisonId);
    if (!selected || !candidate || !s.karyotype.evidenceChoice) return;
    const homolog = String(selected.identity) === String(candidate.identity);
    const rearrangedHomolog = homolog && Boolean(selected.abnormal) !== Boolean(candidate.abnormal);
    const correct = homolog && (rearrangedHomolog
      ? s.karyotype.evidenceChoice === "rearranged-homolog"
      : s.karyotype.evidenceChoice === "band-centromere");
    recordPairAttempt(selected.identity, candidate.identity, correct);
    const message = correct
      ? rearrangedHomolog
        ? "Yes. These are homologs, and the changed band pattern is evidence of a rearranged chromosome—not a reason to separate the pair."
        : "Yes. The corresponding band pattern and centromere position support a homologous match."
      : homolog
        ? rearrangedHomolog
          ? "One homolog is structurally rearranged. Keep the chromosome identity together, and use the changed band pattern as evidence of that rearrangement."
          : "Recheck the chromosome features. Homologs have corresponding band sequences and centromere positions; size alone is not enough."
        : "This candidate is not the homolog. Compare its banding pattern and centromere position with the selected chromosome, then try another candidate.";
    patchSession({ karyotype: { ...s.karyotype, evidenceFeedback: { correct, message } } });
    rerenderWorkspace();
    return;
  }
  if (action === "pair-compared-chromosomes") {
    const { selectedId, comparisonId } = s.karyotype;
    const selected = chrById(selectedId);
    const identity = selected ? String(selected.identity) : "";
    const referenceInPool = s.karyotype.pool.includes(selectedId);
    const referencePlaced = (s.karyotype.slots[identity] || []).includes(selectedId);
    if (!selected || !comparisonId || !s.karyotype.evidenceFeedback?.correct || selectedId === comparisonId || !s.karyotype.pool.includes(comparisonId) || !(referenceInPool || referencePlaced)) return;
    let nextKaryotype = referenceInPool ? moveChromosome(s.karyotype, selectedId, identity) : s.karyotype;
    nextKaryotype = moveChromosome(nextKaryotype, comparisonId, identity);
    const nextTarget = s.karyotype.focusSlots?.find((slot) => (nextKaryotype.slots[slot] || []).length < s.chromosomes.filter((chromosome) => String(chromosome.identity) === String(slot)).length);
    const nextSelectedId = nextTarget
      ? ((nextKaryotype.slots[nextTarget] || [])[0]
        || nextKaryotype.pool.find((id) => String(chrById(id)?.identity) === String(nextTarget))
        || null)
      : null;
    nextKaryotype = { ...nextKaryotype, selectedId: nextSelectedId };
    patchSession({ karyotype: nextKaryotype });
    rerenderWorkspace();
    return;
  }
  if (action === "toggle-karyotype-tray") {
    patchSession({ karyotype: { ...s.karyotype, trayScope: s.karyotype.trayScope === "all" ? "group" : "all", selectedId: null } });
    rerenderWorkspace();
    return;
  }
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
    if (step === "summary" && s.classNext) {
      const href = s.classNext;
      patch({ session: null });
      go(href);
      return;
    }
    if (fromClass(s)) {
      const href = s.returnHref;
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
    let kt = resetCurrentGroup(s.karyotype, s.chromosomes);
    if (benchOn(s)) kt = benchRecord(s.karyotype, { ...kt, orient: {}, bounceId: null, benchNote: "" });
    if (s.karyotype.focusSlots?.length) kt = seatSingleCopies(kt, s.chromosomes);
    const focusReset = Boolean(s.karyotype.focusSlots?.length);
    const keptSingle = focusReset && s.karyotype.focusSlots.some((identity) => s.chromosomes.filter((chromosome) => String(chromosome.identity) === String(identity)).length === 1);
    patchSession({
      karyotype: kt,
      feedback: { ...s.feedback, karyotype: openSheet(s.karyotype)
        ? { tone: "review", title: "Karyotype cleared", body: "Every chromosome was returned to the unassigned tray." }
        : focusReset
          ? { tone: "review", title: "Comparison cleared", body: keptSingle ? "Matched chromosomes were returned to the tray. A chromosome with only one copy stays in its row." : "Chromosomes in this comparison were returned to the tray." }
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
      const roundCount = s.karyotype.focusRounds?.length || 0;
      const roundIndex = s.karyotype.focusRoundIndex || 0;
      if (roundCount && roundIndex < roundCount - 1) {
        if (!karyotypeFocusAssigned(s.karyotype, s.chromosomes)) {
          writeFeedback("karyotype", {
            tone: "review",
            title: "Finish this comparison first",
            body: "Match each pair in this comparison before the next set of lookalike chromosomes.",
          });
          rerenderWorkspace();
          return;
        }
        const settled = settleUnpairedFocus(s.karyotype, s.chromosomes);
        const feedback = { ...s.feedback };
        delete feedback.karyotype;
        patchSession({
          karyotype: startFocusRound(settled, s.chromosomes, s.karyotype.focusRounds, roundIndex + 1),
          feedback,
        });
        rerenderWorkspace();
        return;
      }
      if (!karyotypeFocusAssigned(s.karyotype, s.chromosomes)) {
        writeFeedback("karyotype", {
          tone: "review",
          title: openSheet(s.karyotype) ? "Place the remaining chromosomes" : "Finish this chromosome comparison first",
          body: openSheet(s.karyotype)
            ? "Every chromosome must be in a numbered position before the karyotype is submitted."
            : "Place each chromosome involved in this case in its numbered position. Other chromosomes can remain in the tray.",
        });
        rerenderWorkspace();
        return;
      }
      s.karyotype = settleUnpairedFocus(s.karyotype, s.chromosomes);
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
    if (step === "audit") checkAudit();
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
    if (step === "audit") checkAudit();
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
    const gate = canAdvanceGroup(s.karyotype, s.chromosomes, karyotypeAdvanceCase(s));
    if (!gate.ok) {
      writeFeedback("karyotype", {
        tone: "review",
        title: gate.reason === "incorrect" ? "This group must be arranged correctly before continuing" : "Place every chromosome in this group first",
        body: gate.reason === "incorrect"
          ? "Each box has to hold the right chromosomes. Both copies of a chromosome belong in that chromosome's box."
          : "Put every chromosome from this group into a numbered box. Both copies belong in the same box.",
      });
      rerenderWorkspace();
      return;
    }
  }
  const feedback = { ...s.feedback };
  delete feedback.karyotype;
  patchSession({
    karyotype: { ...s.karyotype, activeStep: target, selectedId: null, checkAttempt: 0, lastGrade: null, placementMarks: false },
    feedback,
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
      body: karyotypeFocusAssigned(s.karyotype, s.chromosomes)
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
  const focus = isSubmit ? gradedFocusSlots(s.karyotype) : s.karyotype.focusSlots;
  const grade = gradeKaryotype(s.karyotype, s.chromosomes, openSheet(s.karyotype) ? null : (focus?.length ? focus : (isSubmit ? null : step.slots)));
  const attempt = s.karyotype.checkAttempt + 1;
  const fb = karyotypeFeedback(grade, isSubmit ? 99 : attempt);
  if (!isSubmit && !grade.perfect) {
    const feature = placementHint(s.karyotype, s.chromosomes, step?.slots);
    if (feature) fb.body = feature;
  }
  fb.scored = true;
  const benchNotes = benchOn(s) ? benchCheckNotes(s, isSubmit) : "";
  if (isSubmit) {
    fb.title = focus?.length
      ? grade.perfect ? "Guided pairs complete" : "Guided comparison complete"
      : grade.perfect ? "Karyotype submitted — arrangement correct" : "Karyotype submitted";
    fb.body = focus?.length
      ? grade.perfect
        ? `All ${grade.slotDenom} compared chromosome positions are correct.`
        : `${grade.correctSlots}/${grade.slotDenom} compared positions match. Review the differences, then continue.`
      : grade.perfect
        ? "The complete arrangement matches the case assignments."
        : `${grade.correctSlots}/${grade.slotDenom} positions match the expected identities. Downstream answers are not shown yet.`;
    fb.highlightSlots = !grade.perfect;
  }
  if (benchNotes) fb.body = `${fb.body} ${benchNotes}`;
  s.karyotype = { ...s.karyotype, checkAttempt: attempt, lastGrade: grade, placementMarks: isSubmit || Boolean(s.karyotype.placementMarks) };
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
  return initAssembly(session.maps || state.maps, spec, seedFrom(`${session.caseData.case_id}-${step}`));
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
  if (step === "karyotype") {
    const group = currentStep(s.karyotype, s.chromosomes);
    const text = placementHint(s.karyotype, s.chromosomes, group?.slots);
    if (text) {
      s.karyotype = { ...s.karyotype, placementMarks: true };
      writeFeedback(step, { tone: "review", title: "Hint", body: text });
      patchSession({ hintsUsed: s.hintsUsed + 1 });
      rerenderWorkspace();
      return;
    }
  }
  if (s.instructionMode) {
    const level = s.pedagogy?.hintLevel?.[step] || 0;
    const hint = hintFor(s.atlas?.disease, step, level, s.exercise, s.caseData);
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

function writeFeedback(step, fb) {
  const s = state.session;
  s.feedback = { ...s.feedback, [step]: fb };
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
  const finding = s.exercise === "disease_association";
  if (!isSubmit || !s.scores.disease_association) s.attempts.disease += 1;
  const disease = s.atlas?.disease;
  const expected = finding ? disease?.id : s.caseData.diagnosis;
  const ok = s.answers.diagnosis === expected;
  s.scores.disease_association = { ok, detail: finding ? "finding" : "" };
  const matched = finding ? findingLabel(disease) : s.caseData.diagnosis;
  const notation = finding ? matched.split(" — ")[0] : "";
  const detail = finding ? matched.split(" — ").slice(1).join(" — ") : "";
  writeFeedback("disease", {
    tone: ok ? "ok" : "review",
    scored: true,
    title: ok
      ? (finding ? "That finding belongs to this condition." : "Disease association matches the case record.")
      : (finding ? "That finding belongs to a different condition." : "Disease association needs review."),
    body: ok || isSubmit
      ? (finding
        ? `${notation} is the chromosome finding associated with ${disease?.disease_name || "this condition"}.${detail ? ` ${detail}.` : ""}`
        : (isSubmit ? `Teaching diagnosis: ${s.caseData.diagnosis}.` : "This cytogenetic finding is paired with that condition in the case data."))
      : (finding
        ? "Compare the named condition with the chromosome finding, not with a finding from another condition."
        : "The associated condition is stored with the case and is not revealed on an incorrect check."),
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
