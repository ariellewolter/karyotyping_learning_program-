/**
 * The integrated casework report: intake, karyotype, ideogram, FISH, and interpretation.
 * Built only from the learner's own entries. The curated teaching answer is never written into it.
 */
import { escapeHtml, GROUPS } from "./util.js";
import { ideogramSVG } from "./ideogram.js?v=20261024j";
import { genomeIssues, genomeSVG, issueBands, markBands, markLocation } from "./case-ideogram.js?v=20261025gen2";
import { sortedCrops } from "./case-report.js?v=20261026cs1";
import { exploreISCN } from "./iscn.js";
import { resolveClones } from "./karyotype-analysis.js";
import { describeKaryogram, inferPloidy, renderChromosome } from "./chromosomes.js?v=20261026p5";
import { enrichRemakeReasons } from "./guided-case-artifacts.js?v=20261026rep2";
import { piecesForExercise } from "./banding.js?v=20261024c";
import { exportPrintablePDF } from "./print-export.js";

export const SUBMISSION_FORMAT = "cytogenetics-lab-submission-v1";

const MODE_LABELS = {
  guided: "Guided walkthrough: instructor example",
  explore: "Independent case: diagnosis known, findings student-generated",
  unknown: "Blinded case: diagnosis hidden",
  own: "Learner-supplied case",
};

export function caseMode(current) {
  if (current?.source?.mode === "guided") return "guided";
  if (current?.source?.mode === "explore") return "explore";
  if (current?.source?.kind === "curated-teaching-template" && (current.source.mode === "unknown" || current.source.answerFinding)) return "unknown";
  return "own";
}

export function laboratoryLabel(lab) {
  return lab === "fish" ? "Laboratory 2 · FISH Analysis" : "Laboratory 1 · Karyotyping and Chromosome Analysis";
}

/** What this case asks the student to show. A named disease is not an identification item. */
export function assignmentExpectation(mode) {
  if (mode === "explore" || mode === "guided") {
    return "Grade the chromosome or FISH evidence, ISCN, and interpretation. Do not grade disease naming — the disease name is withheld from this report on purpose.";
  }
  if (mode === "unknown") {
    return "Grade the evidence and the written finding. The student's possible condition is their own suggestion from the specimen, not an answer key.";
  }
  return "This case was entered by the student. The report is their own record.";
}

/** Report title without a disease name so grading stays on the cytogenetic work. */
function reportCaseTitle(snapshot) {
  if (snapshot.mode === "guided") return "Guided walkthrough · case report";
  if (snapshot.mode === "explore") return "Independent case · case report";
  if (snapshot.mode === "unknown") return "Blinded case · case report";
  return snapshot.caseLabel || "Case report";
}

/** Missing report fields only. Nothing here says an answer is wrong. */
export function submissionReadiness(current, { fishOpen = null } = {}) {
  const gaps = [];
  const meta = current?.reportMeta || {};
  if (!String(meta.studentName || "").trim() && !String(meta.studentId || "").trim()) gaps.push("Student name or ID not entered");
  if (current?.lab === "fish") {
    if (Number(fishOpen) > 0) gaps.push(`${fishOpen} ${Number(fishOpen) === 1 ? "nucleus remains" : "nuclei remain"} unclassified`);
    const answers = current.fishWorkstation?.answers || {};
    if (!String(answers.conclusion || current.interpretation || "").trim()) gaps.push("FISH interpretation not entered");
  } else {
    if (!String(current?.observedCount || "").trim()) gaps.push("Chromosome count not entered");
    if (!String(current?.observedSex || "").trim()) gaps.push("Sex chromosome complement not entered");
    if (!String(current?.iscnDraft || "").trim()) gaps.push("ISCN not entered");
    if (!String(current?.interpretation || "").trim()) gaps.push("Interpretation not entered");
    if (namesStructuralChange(current?.iscnDraft) && !current?.studentMarks?.length) gaps.push("Your ISCN names a band-level change, but no ideogram band is marked");
  }
  if (!String(meta.limitations || "").trim()) gaps.push("Limitations not entered");
  if (caseMode(current) === "unknown" && !String(current?.possibleAssociation || "").trim()) gaps.push("Possible condition not entered");
  return gaps;
}

/** True when the student's own ISCN names a band-level change (parentheses), e.g. del(5)(p15.2). */
export function namesStructuralChange(formula) {
  return /\(/.test(String(formula || ""));
}

const STAGE_STATE_TEXT = { done: "Recorded", open: "Not yet recorded", optional: "Optional" };

/**
 * Informational stages. "optional" means the case may not need the stage; it is not shown as unfinished.
 * Nothing here checks whether an entry is scientifically correct.
 */
export function caseStages(current) {
  const karyotype = current.lab !== "fish";
  const state = (done) => (done ? "done" : "open");
  const stages = [
    { id: "intake", label: "Case intake", target: "case-intake", state: "done" },
  ];
  if (karyotype) {
    stages.push({ id: "karyotype", label: "Karyotype", target: "patient-specimen-workbench", state: state(current.observedCount || current.observedSex || current.sortedChromosomes?.length || current.chromosomeReads?.length) });
    const structural = namesStructuralChange(current.iscnDraft);
    stages.push({
      id: "affected",
      label: "Affected chromosomes",
      target: "case-affected",
      state: current.affectedRemakes?.length ? "done" : "open",
      note: "Choose changed chromosomes and remake them",
    });
    const marked = Boolean(current.studentMarks?.length);
    stages.push({
      id: "ideogram",
      label: "Ideogram",
      target: "case-ideogram",
      state: marked ? "done" : structural ? "open" : "optional",
      note: marked ? "" : structural ? "Your ISCN names a band-level change" : "Use when bands or segments change",
    });
  } else {
    stages.push({ id: "fish", label: "FISH scoring", target: "patient-specimen-workbench", state: state(current.fishNuclei?.length || current.scorableNuclei || Object.keys(current.fishWorkstation?.records || {}).length) });
  }
  const fishConclusion = String(current.fishWorkstation?.answers?.conclusion || "").trim();
  stages.push({ id: "interpretation", label: "Interpretation", target: "patient-observation-form", state: state(karyotype ? current.interpretation && current.iscnDraft : current.interpretation || fishConclusion) });
  stages.push({ id: "report", label: "Case report", target: "case-report", state: state(current.submission) });
  return stages;
}

export function caseStagesMarkup(current, { active = "" } = {}) {
  const tabs = Boolean(active);
  return `<nav class="case-stages" aria-label="Casework stages"><ol>${caseStages(current).map((stage, index) => `<li class="stage-${stage.state}${stage.id === active ? " is-current" : ""}"><button type="button" data-stage-target="${stage.target}" data-case-tab="${escapeHtml(stage.id)}" ${stage.id === active ? 'aria-current="page"' : ""}><span>${index + 1}</span> ${escapeHtml(stage.label)} <em>${STAGE_STATE_TEXT[stage.state]}</em></button>${stage.note ? `<small>${escapeHtml(stage.note)}</small>` : ""}</li>`).join("")}</ol><p class="muted">${tabs ? "Each stage is its own page. A mark shows that you recorded something. It does not check whether that record is correct." : "These stages show what you have recorded. They do not check whether it is correct. Use the stages the case needs: a trisomy may not need band annotation; a translocation may need several."}</p></nav>`;
}

function patternTally(nuclei) {
  const tally = new Map();
  nuclei.filter((item) => item.scorable && item.pattern).forEach((item) => tally.set(item.pattern, (tally.get(item.pattern) || 0) + 1));
  return [...tally.entries()].map(([pattern, count]) => ({ pattern, count }));
}

/** Remove a known disease name from report-facing text so grading stays on the specimen. */
function withoutDiseaseName(text, diseaseName) {
  const raw = String(text || "");
  const name = String(diseaseName || "").trim();
  if (!raw || !name) return raw;
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return raw.replace(new RegExp(escaped, "gi"), "this condition");
}

/** Snapshot of the learner's work. Holds no curated answer fields. */
export function buildSubmission(current, {
  studentName = "",
  studentId = "",
  limitations = "",
  metaphasesExamined = "",
  metaphasesKaryotyped = "",
  reportedFinding = "",
  fishWorkstation = null,
} = {}) {
  const mode = caseMode(current);
  const nuclei = Array.isArray(current.fishNuclei) ? current.fishNuclei : [];
  const diseaseName = mode === "explore" || mode === "guided" ? current.source?.diseaseName || "" : "";
  const historyLead = mode === "own" ? current.history || "" : String(current.history || "").split("\n\n")[0];
  const meta = current.reportMeta || {};
  const fishWs = current.lab === "fish"
    ? fishWorkstation
    : (fishWorkstation || current.fishWorkstation || null);
  return {
    format: SUBMISSION_FORMAT,
    caseId: current.id,
    caseLabel: mode === "explore" || mode === "guided" || mode === "unknown"
      ? reportCaseTitle({ mode, caseLabel: current.label || "" })
      : (current.label || ""),
    lab: current.lab,
    mode,
    laboratory: laboratoryLabel(current.lab),
    // Disease name is never stored on the submission snapshot used for the printable report.
    exploredDisease: "",
    student: { name: String(studentName).slice(0, 120), id: String(studentId).slice(0, 60) },
    submittedAt: new Date().toISOString(),
    fishWorkstation: fishWs,
    intake: {
      specimen: current.specimen || "",
      assay: current.assay || "",
      target: current.target || "",
      question: withoutDiseaseName(historyLead, diseaseName),
      reportedFinding: mode === "own" ? reportedFinding : "",
    },
    observations: {
      count: current.observedCount || "",
      sex: current.observedSex || "",
      visible: current.observation || "",
      metaphasesExamined: String(metaphasesExamined || meta.metaphasesExamined || "").slice(0, 8),
      metaphasesKaryotyped: String(metaphasesKaryotyped || meta.metaphasesKaryotyped || "").slice(0, 8),
      metaphaseImageCount: Array.isArray(current.images) ? current.images.length : 0,
      chromosomeLog: (current.chromosomeReads || []).map((row) => ({ ...row })),
      crops: (current.sortedChromosomes || []).filter((piece) => piece.chromosome).map((piece) => ({ ...piece })),
      affectedRemakes: enrichRemakeReasons(current.affectedRemakes || [], current.iscnDraft).map((item) => ({
        chromosome: item.chromosome,
        lostCount: item.lostCount || 0,
        effect: item.effect || "",
        token: item.token || "",
        reason: item.reason || "",
        pieces: (item.pieces || []).map((piece) => ({ ...piece })),
      })),
      ideogramMarks: (current.studentMarks || []).map((mark) => ({ ...mark })),
      imageMarkers: (current.imageAnnotations || []).map((marker) => ({ ...marker })),
      fish: (current.lab === "fish" || fishWs || (current.fishNuclei || []).length) ? {
        nuclei: nuclei.map((item) => ({ ...item })),
        scorable: nuclei.filter((item) => item.scorable).length,
        excluded: nuclei.filter((item) => !item.scorable).length,
        tally: patternTally(nuclei),
        summaryScorable: current.scorableNuclei || "",
        summaryPatterns: (current.fishPatterns || []).filter((item) => item.pattern || item.count).map((item) => ({ ...item })),
      } : null,
    },
    conclusions: {
      iscn: current.iscnDraft || "",
      classification: current.classification || "",
      interpretation: withoutDiseaseName(current.interpretation || "", diseaseName),
      possibleAssociation: caseMode(current) === "unknown" ? current.possibleAssociation || "" : "",
      limitations: String(limitations || meta.limitations || "").slice(0, 2000),
      confirmations: current.caseReview ? { ...current.caseReview } : null,
    },
  };
}

function clamp(value, depth = 0) {
  if (depth > 5) return null;
  if (typeof value === "string") return value.slice(0, 4000);
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "boolean" || value === null) return value;
  if (Array.isArray(value)) return value.slice(0, 500).map((item) => clamp(item, depth + 1));
  if (typeof value === "object") return Object.fromEntries(Object.entries(value).slice(0, 40).map(([key, item]) => [key.slice(0, 40), clamp(item, depth + 1)]));
  return null;
}

/** Keeps an imported submission only when it is the expected format and size. */
export function sanitizeSubmission(value) {
  if (!value || typeof value !== "object" || value.format !== SUBMISSION_FORMAT) return null;
  try { if (JSON.stringify(value).length > 400000) return null; } catch { return null; }
  return clamp(value);
}

export function caseSubmissionMarkup(current, { fishOpen = null } = {}) {
  const meta = current.reportMeta || {};
  const submitted = current.submission;
  const mode = caseMode(current);
  const gaps = submitted ? [] : submissionReadiness(current, { fishOpen });
  const status = submitted
    ? `Submitted ${escapeHtml(new Date(submitted.submittedAt).toLocaleString())}. The download below is always the submitted version. Edits made after submission are not in it. The teaching answer is not shown.`
    : "Draft. Exporting now produces a report marked as not submitted.";
  const ready = gaps.length
    ? `<div class="notice" role="status"><p>Possibly missing. This list checks only whether fields are filled. It does not judge the answer, and you can still export or submit.</p><ul>${gaps.map((gap) => `<li>${escapeHtml(gap)}</li>`).join("")}</ul></div>`
    : `<p class="notice" role="status">The report fields are filled. Export the PDF when you are ready to send it.</p>`;
  const reference = mode === "explore" || mode === "unknown"
    ? `<p>This is an open-reference investigation. You may consult the reference library and other sources. The report still has to come from the specimen in front of you.</p>`
    : "";
  return `<section class="patient-section case-report-panel" id="case-report"><header><p class="eyebrow">Final stage</p><h3>Case report</h3><p>${escapeHtml(assignmentExpectation(mode))} Export a PDF of your own analysis and send that file to your instructor. The file does not include an answer key.</p></header>
    ${reference}
    ${submitted ? "" : ready}
    <form id="case-report-form" class="patient-form case-report-form">
      <div class="case-field-grid"><label>Student name<input name="studentName" maxlength="120" value="${escapeHtml(meta.studentName || "")}" ${submitted ? "readonly" : ""}></label><label>Student ID<input name="studentId" maxlength="60" value="${escapeHtml(meta.studentId || "")}" ${submitted ? "readonly" : ""}></label></div>
      ${current.lab !== "fish" ? `<div class="case-field-grid"><label>Metaphases examined<input name="metaphasesExamined" inputmode="numeric" maxlength="8" placeholder="e.g. 20" value="${escapeHtml(meta.metaphasesExamined || "")}" ${submitted ? "readonly" : ""}></label><label>Metaphases karyotyped<input name="metaphasesKaryotyped" inputmode="numeric" maxlength="8" placeholder="e.g. 5" value="${escapeHtml(meta.metaphasesKaryotyped || "")}" ${submitted ? "readonly" : ""}></label></div>` : ""}
      <label>Limitations of this analysis<textarea name="limitations" rows="3" maxlength="2000" placeholder="For example, band resolution, number of cells reviewed, or what a karyotype cannot detect." ${submitted ? "readonly" : ""}>${escapeHtml(meta.limitations || "")}</textarea></label>
      <p class="muted" role="status">${status}</p>
      <div class="patient-actions">${submitted ? "" : `<button class="button" type="submit">Save report details</button>`}<button class="button" type="button" data-case-save-reports>Save to My Case Reports</button><button class="button${submitted ? " primary" : ""}" type="button" id="case-report-pdf">${submitted ? "Download submitted report (PDF)" : "Export draft PDF"}</button>${submitted ? `<button class="button" type="button" id="case-report-json">Download submission (JSON)</button><button class="button" type="button" id="case-report-csv">Download submission (CSV)</button>` : `<button class="button primary" type="button" id="case-report-submit">Submit case report</button>`}</div>
    </form>
  </section>`;
}

function row(label, value) {
  return value ? `<tr><th>${escapeHtml(label)}</th><td>${escapeHtml(value)}</td></tr>` : "";
}

function table(headers, rows, empty) {
  if (!rows.length) return `<p class="note">${escapeHtml(empty)}</p>`;
  return `<table><thead><tr>${headers.map((item) => `<th>${escapeHtml(item)}</th>`).join("")}</tr></thead><tbody>${rows.map((cells) => `<tr>${cells.map((cell) => `<td>${escapeHtml(cell ?? "")}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
}

function ideogramFigures(maps, snapshot) {
  const iscn = genomeIssues(snapshot.conclusions.iscn, null);
  const marks = snapshot.observations.ideogramMarks || [];
  const chromosomes = [...new Set([...marks.map((mark) => String(mark.chromosome)), ...iscn.issues.map((issue) => String(issue.chromosome))])].filter(Boolean);
  const figures = chromosomes.map((chromosome) => {
    const segments = maps?.chromosomes?.[chromosome]?.segments || [];
    if (!segments.length) return "";
    const ownMarks = marks.filter((mark) => String(mark.chromosome) === chromosome);
    const ownIssues = iscn.issues.filter((issue) => String(issue.chromosome) === chromosome);
    const highlightIds = [
      ...ownMarks.flatMap((mark) => markBands(maps, mark).map((band) => band.id)),
      ...ownIssues.flatMap((issue) => issueBands(maps, issue).map((band) => band.id)),
    ];
    const labels = [
      ...ownMarks.map((mark) => `${mark.effect}: ${markLocation(mark)}`),
      ...ownIssues.map((issue) => `${issue.effect}: ${issue.location}`),
    ];
    return `<figure class="ideo-id"><figcaption><strong>Chromosome ${escapeHtml(chromosome)}</strong>${labels.length ? `<span>${escapeHtml(labels.join(" · "))}</span>` : ""}</figcaption>${ideogramSVG(segments, { width: 90, height: 380, barWidth: 30, highlightIds, highlightTag: false })}</figure>`;
  }).join("");
  const genome = genomeSVG(maps, {
    marked: new Set(marks.flatMap((mark) => markBands(maps, mark).map((band) => band.id))),
    read: new Set(iscn.issues.flatMap((issue) => issueBands(maps, issue).map((band) => band.id))),
    involved: new Set(chromosomes),
    width: 700,
  });
  const rows = [
    ...marks.map((mark) => [markLocation(mark), mark.chromosome, mark.effect, mark.note || "Marked on the ideogram", "Your mark"]),
    ...iscn.issues.map((issue) => [issue.location, issue.chromosome, issue.effect, issue.details.join(" "), "Read from your ISCN"]),
  ];
  return { figures, rows, genome };
}

/** Schematic karyogram from the student's written ISCN (same layout as the Draw explorer). */
function assembledKaryogramHTML(iscn) {
  const report = exploreISCN(iscn);
  if (report.status === "empty" || report.status === "unsupported") return "";
  const sheets = resolveClones(report).map((line) => karyogramSheetHTML(line)).filter(Boolean).join("");
  if (!sheets) return "";
  return `<div class="assembled-karyogram"><p class="note">Assembled karyogram from the written ISCN <code>${escapeHtml(report.raw)}</code>.</p>${sheets}</div>`;
}

function karyogramSheetHTML(line) {
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
      return `<div class="iscn-k-slot${changed ? " iscn-k-changed" : ""}"><div class="iscn-k-body">${byIdentity[slot].map((chromosome) => renderChromosome(chromosome, { scale: 0.35, hideIdentity: true })).join("")}</div><p>${escapeHtml(slot)}${changed ? " · changed" : ""}</p></div>`;
    }).join("")}</div></div>`;
  };
  return `<div class="iscn-karyogram"><div class="iscn-k-row">${block("A", GROUPS.A)}${block("B", GROUPS.B)}${block("C", ["X"])}</div><div class="iscn-k-row">${block("C", GROUPS.C.filter((id) => id !== "X"))}</div><div class="iscn-k-row">${block("D", GROUPS.D)}${block("E", GROUPS.E)}</div><div class="iscn-k-row">${block("F", GROUPS.F)}${block("G", GROUPS.G)}</div></div>`;
}

function isWholeChromosomeRemake(item) {
  return /whole chromosome/i.test(item.effect || "") || /whole chromosome/i.test(item.reason || "");
}

function isStructuralRemake(item) {
  if (Number(item.lostCount) > 0) return true;
  if (isWholeChromosomeRemake(item)) return false;
  const effect = String(item.effect || "");
  return Boolean(effect) && !/^Gain of a whole|^Loss of a whole/i.test(effect);
}

function normalReferencePieces(maps, chromosome) {
  if (!maps || !chromosome) return [];
  try {
    return piecesForExercise(maps, {
      chromosome: String(chromosome),
      resolution: "region",
      transform: { type: "none" },
      reference_normal: true,
    });
  } catch {
    return [];
  }
}

function affectedRemakesHTML(remakes, iscn = "", maps = null) {
  const rows = enrichRemakeReasons(remakes || [], iscn);
  if (!rows.length) return `<p class="note">No affected chromosomes were remade.</p>`;
  return `<div class="row remake-row">${rows.map((item) => {
    const pieces = item.pieces || [];
    const remade = pieces.length
      ? ideogramSVG(pieces, { width: 88, height: 280, showLabels: false, showRuler: false })
      : `<p class="note">Empty</p>`;
    const badge = item.token || item.effect || (item.lostCount ? `${item.lostCount} unused` : "intact remake");
    const why = item.reason ? `<p class="remake-why">${escapeHtml(item.reason)}</p>` : "";
    const structural = isStructuralRemake(item);
    const normalPieces = structural ? normalReferencePieces(maps, item.chromosome) : [];
    const normal = normalPieces.length
      ? `<figure class="remake remake-ref"><figcaption><strong>Normal ${escapeHtml(item.chromosome)}</strong><span>reference</span></figcaption>${ideogramSVG(normalPieces, { width: 88, height: 280, showLabels: false, showRuler: false })}</figure>`
      : "";
    const remadeFig = `<figure class="remake"><figcaption><strong>Chromosome ${escapeHtml(item.chromosome)}</strong><span>${escapeHtml(badge)}${structural ? " · remade" : ""}</span></figcaption>${remade}${why}</figure>`;
    return structural && normal
      ? `<div class="remake-pair">${normal}${remadeFig}</div>`
      : remadeFig;
  }).join("")}</div>`;
}

function countCheckHTML(observations) {
  const written = String(observations.count || "").trim();
  const placed = (observations.crops || []).filter((piece) => piece.chromosome).length;
  const sex = String(observations.sex || "").trim() || "—";
  const writtenLabel = written || "—";
  const writtenNum = Number(written);
  const mismatch = Number.isFinite(writtenNum) && writtenNum !== placed;
  const note = mismatch
    ? `<span class="count-mismatch"> · Written count and placed chromosomes differ</span>`
    : "";
  return `<p class="count-check">Written count ${escapeHtml(writtenLabel)} · Placed chromosomes ${placed} · Sex ${escapeHtml(sex)}${note}</p>`;
}

function cellsReviewedHTML(observations, karyotype) {
  if (!karyotype) return "";
  const examined = String(observations.metaphasesExamined || "").trim();
  const karyotyped = String(observations.metaphasesKaryotyped || "").trim();
  const images = Number(observations.metaphaseImageCount) || 0;
  if (!examined && !karyotyped && !images) return "";
  return `<table>${row("Metaphases examined", examined || "Not entered")}${row("Metaphases karyotyped", karyotyped || "Not entered")}${row("Metaphase images attached", images ? String(images) : "")}</table>`;
}

function metaphaseOverviewHTML(thumbs, karyogram) {
  const thumbBlock = thumbs?.length
    ? `<div class="metaphase-thumbs">${thumbs.map((thumb, index) => `<figure class="metaphase-thumb"><img src="${thumb.url}" alt="Metaphase spread ${index + 1}"><figcaption>${escapeHtml(thumb.name || `Metaphase ${index + 1}`)}</figcaption></figure>`).join("")}</div>`
    : `<p class="note">No metaphase image was attached.</p>`;
  const sheet = karyogram || `<p class="note">No karyogram could be drawn from the written ISCN.</p>`;
  return `<div class="karyogram-overview"><div class="overview-specimen"><h4>Metaphase overview</h4>${thumbBlock}</div><div class="overview-sheet"><h4>Assembled karyogram</h4>${sheet}</div></div>`;
}

/** One sentence when both a karyotype ISCN and FISH work are present on the same report. */
function assayLinkHTML(snapshot) {
  const iscn = String(snapshot.conclusions?.iscn || "").trim();
  const hasFish = Boolean(snapshot.fishWorkstation)
    || Boolean(snapshot.observations?.fish?.nuclei?.length)
    || Boolean(snapshot.observations?.fish?.summaryPatterns?.length)
    || Boolean(snapshot.observations?.fish?.summaryScorable);
  if (!iscn || !hasFish) return "";
  const tokens = [...iscn.matchAll(/[+-](?:\d+|X|Y)\b/gi)].map((match) => match[0]);
  const karyBit = tokens.length
    ? `Karyotype suggests ${tokens.join(", ")}`
    : `Karyotype is written as ${iscn}`;
  const fishBit = /\(/.test(iscn)
    ? "FISH enumeration can support copy number for covered targets; it does not address structural mechanism"
    : "FISH enumeration supports the copy-number finding when the probe set covers those chromosomes; it does not replace a full karyotype";
  return `<h3>Karyotype and FISH</h3><p class="assay-link">${escapeHtml(`${karyBit}; ${fishBit}.`)}</p>`;
}

function metaphaseThumbUrl(data, maxWidth = 280) {
  if (!data || typeof document === "undefined") return Promise.resolve("");
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => {
      const scale = Math.min(1, maxWidth / Math.max(1, image.width));
      const width = Math.max(1, Math.round(image.width * scale));
      const height = Math.max(1, Math.round(image.height * scale));
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) { resolve(""); return; }
      ctx.fillStyle = "#f4f4f2";
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(image, 0, 0, width, height);
      resolve(canvas.toDataURL("image/jpeg", 0.82));
    };
    image.onerror = () => resolve("");
    image.src = data;
  });
}

export async function metaphaseThumbs(images = []) {
  const list = (images || []).filter((image) => /^data:image\//i.test(image?.data || "")).slice(0, 3);
  const urls = await Promise.all(list.map((image) => metaphaseThumbUrl(image.data)));
  return list.map((image, index) => (urls[index] ? { url: urls[index], name: image.name || `Metaphase ${index + 1}` } : null)).filter(Boolean);
}

function workstationSection(w) {
  const s = w.summary || {};
  const a = w.answers || {};
  const criteria = s.criteria || {};
  return `<h3>Microscope worksheet summary</h3>
    <table>${row("Assay design", w.assay)}${row("Field set", w.assayRef ? `${w.assayRef} · seed ${w.seed}` : String(w.seed ?? ""))}${row("Nuclei in fields", String(s.total ?? ""))}${row("Scored (completed, scorable)", String(s.scored ?? 0))}${row("Excluded with a reason", String(s.excluded ?? 0))}${row("Still open at export", String(s.open ?? 0))}${row("Normal / abnormal / other", `${s.normal ?? 0} / ${s.abnormal ?? 0} / ${s.other ?? 0}`)}${row("Abnormal, % of scored nuclei", s.abnormalPercent == null ? "Not calculated" : `${s.abnormalPercent}%`)}${row("Scorable, % of nuclei", s.scorablePercent == null ? "" : `${s.scorablePercent}%`)}${row("Educational scoring assumption", `${criteria.minimumScorable != null ? `teaching minimum ${criteria.minimumScorable}% scorable` : "no minimum scorable fraction"}; ${criteria.percentCutoff != null ? `teaching abnormal figure ${criteria.percentCutoff}%` : "no abnormal-percentage figure"}`)}</table>
    <p class="note">Percentages are the student's tallies. A stored cutoff in this laboratory is an educational assumption, not a validated clinical cutoff.</p>
    <h3>Exclusions</h3>${table(["Reason", "Nuclei"], (s.exclusionReasons || []).map((item) => [item.reason, String(item.count)]), "No nucleus was excluded.")}
    <h3>Individual scoring decisions</h3>${table(["Nucleus", "Field", "Scorable?", "Signal counts entered", "Pattern class (from these counts, by the assay definition)", "Exclusion reason", "Note"], (w.nuclei || []).map((item) => [String(item.nucleus).padStart(2, "0"), String(item.field), item.scorable === "—" ? item.status : item.scorable, item.signals || "—", item.interpretation || "—", item.reason || "", item.note || ""]), "No nucleus was recorded.")}
    <h3>Assay interpretation</h3>
    <table>${row("What this probe set can detect", a.detects || "Not answered")}${row("What the signals demonstrated", a.demonstrated || "Not answered")}${row("Fusion partner", a.partner || "Not answered")}${row("What the assay could miss", (a.misses || []).join("; ") || "None selected")}${row("Adequacy and supplied criteria", a.conclusive || "Not answered")}${row("What the result establishes", a.scope || "Not answered")}</table>
    <h3>FISH conclusion</h3><p class="block">${escapeHtml(a.conclusion || "Not written.")}</p>
    <h3>FISH limitations</h3><p class="block">${escapeHtml(a.limitations || "Not written.")}</p>`;
}

/** Pure: the printable report for one snapshot. Exported for the report regression check. */
export function caseReportHTML(snapshot, { maps, crops = [], thumbs = [], draft = false } = {}) {
  return reportHTML(snapshot, { maps, crops, thumbs, draft });
}

function reportHTML(snapshot, { maps, crops, thumbs = [], draft }) {
  const o = {
    count: "",
    sex: "",
    visible: "",
    metaphasesExamined: "",
    metaphasesKaryotyped: "",
    metaphaseImageCount: 0,
    chromosomeLog: [],
    crops: [],
    affectedRemakes: [],
    ideogramMarks: [],
    imageMarkers: [],
    fish: null,
    ...(snapshot.observations || {}),
  };
  o.chromosomeLog = Array.isArray(o.chromosomeLog) ? o.chromosomeLog : [];
  o.crops = Array.isArray(o.crops) ? o.crops : [];
  o.affectedRemakes = Array.isArray(o.affectedRemakes) ? o.affectedRemakes : [];
  o.ideogramMarks = Array.isArray(o.ideogramMarks) ? o.ideogramMarks : [];
  o.imageMarkers = Array.isArray(o.imageMarkers) ? o.imageMarkers : [];
  const c = {
    iscn: "",
    classification: "",
    interpretation: "",
    possibleAssociation: "",
    limitations: "",
    confirmations: null,
    ...(snapshot.conclusions || {}),
  };
  const karyotype = snapshot.lab !== "fish";
  const ideogram = karyotype ? ideogramFigures(maps, { ...snapshot, observations: o, conclusions: c }) : { figures: "", rows: [] };
  const karyogram = karyotype ? assembledKaryogramHTML(c.iscn) : "";
  const remakes = karyotype ? affectedRemakesHTML(o.affectedRemakes, c.iscn, maps) : "";
  const byChromosome = new Map();
  (crops || []).forEach((crop) => byChromosome.set(crop.chromosome, [...(byChromosome.get(crop.chromosome) || []), crop]));
  const comparisons = [...byChromosome.entries()].map(([chromosome, items]) => `<figure class="pair"><figcaption>${escapeHtml(chromosome)}</figcaption>${items.map((crop) => `<img class="crop" src="${crop.url}" alt="Chromosome ${escapeHtml(chromosome)} ${escapeHtml(crop.homolog)}"><span>${escapeHtml(crop.homolog)}</span>`).join("")}</figure>`).join("");
  const fish = o.fish || { nuclei: [], scorable: 0, excluded: 0, tally: [], summaryScorable: "", summaryPatterns: [] };
  const showFishScoring = !karyotype && !snapshot.fishWorkstation;
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${escapeHtml(reportCaseTitle(snapshot))}</title><style>
    body { font-family: Helvetica, Arial, sans-serif; color: #1c2430; margin: 24px; }
    h1 { font-size: 22px; margin: 4px 0; } h2 { font-size: 16px; margin-top: 22px; border-bottom: 2px solid #1c2430; padding-bottom: 2px; } h3 { font-size: 13px; margin: 14px 0 4px; } h4 { font-size: 11px; margin: 0 0 4px; color: #526576; text-transform: uppercase; letter-spacing: .04em; }
    p, li { font-size: 12px; line-height: 1.4; } .note { color: #526576; font-size: 11px; } .draft { color: #9a3412; font-weight: bold; }
    table { width: 100%; border-collapse: collapse; font-size: 11px; margin-bottom: 6px; } th, td { border-bottom: 1px solid #d7d2c8; text-align: left; padding: 4px; vertical-align: top; } th { width: 28%; }
    .row { display: flex; flex-wrap: wrap; gap: 12px; align-items: end; } figure { margin: 0; text-align: center; } figcaption { font-size: 11px; }
    .pair span, .ideo-id figcaption span, .remake figcaption span { display: block; font-size: 10px; color: #526576; } img.crop { width: 48px; height: auto; background: #f4f4f2; }
    .remake { max-width: 200px; } .remake-why { font-size: 10px; line-height: 1.35; color: #1c2430; text-align: left; margin: 6px 0 0; }
    .remake-pair { display: flex; gap: 10px; align-items: end; border: 1px solid #d7d2c8; border-radius: 6px; padding: 6px; background: #fffefa; }
    .count-check { font-size: 12px; font-weight: 600; margin: 6px 0 10px; } .count-mismatch { color: #9a3412; font-weight: 700; }
    .karyogram-overview { display: grid; grid-template-columns: minmax(140px, 220px) 1fr; gap: 14px; align-items: start; margin: 8px 0 12px; }
    .metaphase-thumbs { display: flex; flex-direction: column; gap: 8px; } .metaphase-thumb img { width: 100%; height: auto; background: #f4f4f2; border: 1px solid #d7d2c8; }
    .assay-link { font-size: 12px; line-height: 1.4; }
    .block { white-space: pre-wrap; font-size: 12px; } code { font-size: 12px; }
    img, svg { max-width: 100%; } .genome svg { width: 100%; height: auto; }
    .iscn-karyogram { display: grid; gap: 6px; margin: 6px 0 10px; } .iscn-k-row { display: flex; flex-wrap: wrap; gap: 6px; align-items: flex-end; }
    .iscn-k-group { padding: 4px 6px; border: 1px solid #d7d2c8; border-radius: 6px; background: #fffefa; } .iscn-k-group .group-label { margin: 0 0 2px; font-size: 9px; letter-spacing: .06em; text-transform: uppercase; color: #526576; }
    .iscn-k-slots { display: flex; flex-wrap: wrap; gap: 4px; align-items: flex-end; } .iscn-k-slot p { margin: 2px 0 0; text-align: center; font-size: 10px; }
    .iscn-k-body { display: flex; align-items: flex-end; justify-content: center; gap: 2px; } .iscn-k-changed { outline: 2px solid #6d5b94; outline-offset: 2px; border-radius: 4px; }
    .chr-svg, .chr-img { display: block; } .remake figcaption { margin-bottom: 4px; }
    * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    @page { margin: 14mm; }
    @media print { body { margin: 0; } h2, h3 { break-after: avoid; } tr, figure, .row, .block, .iscn-karyogram, .karyogram-overview, .remake-pair { break-inside: avoid; } }
    @media (max-width: 700px) { .karyogram-overview { grid-template-columns: 1fr; } }
  </style></head><body>
    <p class="note">Educational casework report. Not a clinical report and not a diagnosis.</p>
    ${draft ? `<p class="draft">Draft: this case has not been submitted.</p>` : ""}
    <h1>${escapeHtml(reportCaseTitle(snapshot))}</h1>
    <table>${row("Laboratory", snapshot.laboratory || laboratoryLabel(snapshot.lab))}${row("Case identifier", snapshot.caseId)}${row("Student", snapshot.student.name || "Not entered")}${row("Student ID", snapshot.student.id || "Not entered")}${row(draft ? "Generated" : "Submitted", new Date(snapshot.submittedAt).toLocaleString())}${row("Case type", MODE_LABELS[snapshot.mode] || "")}${row("How to grade", assignmentExpectation(snapshot.mode))}${row("Possible condition", snapshot.mode === "unknown" ? (c.possibleAssociation || "Not entered") : "")}</table>
    <h2>1. Case information</h2>
    <table>${row("Specimen", snapshot.intake.specimen)}${row("Assay", snapshot.intake.assay)}${row("Probe / target", snapshot.intake.target)}${row("Clinical question", snapshot.intake.question || "Not provided")}${row("Source-reported finding", snapshot.intake.reportedFinding)}</table>
    <h2>2. Observations</h2>
    ${karyotype ? `
      <h3>Karyotype</h3>
      <table>${row("Chromosome count", o.count || "Not recorded")}${row("Sex chromosome complement", o.sex || "Not recorded")}${row("Visible finding", o.visible || "Not recorded")}</table>
      ${countCheckHTML(o)}
      <h3>Cells reviewed</h3>${cellsReviewedHTML(o, true) || `<p class="note">Metaphases examined / karyotyped were not entered.</p>`}
      <h3>Specimen and assembled karyogram</h3>${metaphaseOverviewHTML(thumbs, karyogram)}
      <h3>Chromosome log</h3>${table(["Chromosome", "What was seen", "Note"], o.chromosomeLog.map((item) => [item.chromosome, item.seen, item.note]), "No chromosome decisions recorded.")}
      <h3>Homolog comparisons</h3>${comparisons ? `<div class="row">${comparisons}</div>` : `<p class="note">No labeled chromosome crops were saved.</p>`}
      <h3>Affected chromosomes remade</h3>${remakes}
      <h3>Ideogram and abnormality table</h3>${ideogram.genome ? `<div class="genome">${ideogram.genome}</div><p class="note">Red bars: the student's marks. Amber bars: read from the student's ISCN. Chromosomes named in either are in red type.</p>` : ""}${ideogram.figures ? `<div class="row">${ideogram.figures}</div>` : ""}${table(["Location", "Chromosome", "Effect", "What was identified", "Source"], ideogram.rows, "No band or segment was marked, and none was read from the ISCN.")}
    ` : showFishScoring ? `
      <h3>FISH scoring</h3>
      <table>${row("Nucleus records", String(fish?.nuclei.length || 0))}${row("Scorable", String(fish?.scorable || 0))}${row("Excluded", String(fish?.excluded || 0))}${row("Summary scorable nuclei entered", fish?.summaryScorable)}</table>
      ${table(["Signal pattern", "Scorable nuclei", "Percent of scorable"], (fish?.tally || []).map((item) => [item.pattern, String(item.count), fish.scorable ? `${Math.round((item.count / fish.scorable) * 1000) / 10}%` : "—"]), "No scorable nucleus with a recorded pattern.")}
      ${fish?.summaryPatterns.length ? `<h3>Summary counts entered</h3>${table(["Signal pattern", "Nuclei"], fish.summaryPatterns.map((item) => [item.pattern, item.count]), "")}` : ""}
      <h3>Nucleus records</h3>${table(["Nucleus", "Field", "Scorable", "Pattern", "Note"], (fish?.nuclei || []).map((item) => [String(item.number), item.fieldName || (Number.isInteger(item.fieldIndex) ? `Field ${item.fieldIndex + 1}` : "—"), item.scorable ? "Yes" : "No", item.pattern || "—", item.note || ""]), "No nucleus was recorded.")}
    ` : ""}
    ${snapshot.fishWorkstation ? workstationSection(snapshot.fishWorkstation) : ""}
    ${assayLinkHTML(snapshot)}
    ${o.imageMarkers.length ? `<h3>Image markers</h3>${table(["Image", "Label"], o.imageMarkers.map((item) => [`Image ${Number(item.imageIndex) + 1}`, item.label]), "")}` : ""}
    <h2>3. Conclusions</h2>
    <table>${karyotype ? row("ISCN", c.iscn || "Not written") : ""}${row("Working classification", c.classification)}</table>
    <h3>Interpretation</h3><p class="block">${escapeHtml(c.interpretation || "Not written.")}</p>
    <h3>Limitations</h3><p class="block">${escapeHtml(c.limitations || "Not written.")}</p>
    ${c.confirmations ? `<p class="note">Confirmed: ${[c.confirmations.image && "compared drawing with image", c.confirmations.formula && "count, sex complement, rearrangements", c.confirmations.events && "gains, losses, breakpoints"].filter(Boolean).join("; ") || "none"}.</p>` : ""}
    <p class="note">The curated teaching answer is not included in this report.</p>
  </body></html>`;
}

export async function exportCaseReport(current, { maps, meta, reportedFinding } = {}) {
  const snapshot = current.submission || buildSubmission(current, { ...meta, reportedFinding });
  const cropSource = { images: current.images, sortedChromosomes: snapshot.observations.crops };
  const [crops, thumbs] = snapshot.lab === "fish"
    ? [[], []]
    : await Promise.all([sortedCrops(cropSource), metaphaseThumbs(current.images)]);
  const html = reportHTML(snapshot, { maps, crops, thumbs, draft: !current.submission });
  const caseId = String(snapshot.caseId || current.id || "case").replace(/[^\w.+-]+/g, "_").slice(0, 60) || "case";
  await exportPrintablePDF(html, {
    title: "Case report",
    defaultName: `case-report-${caseId}.pdf`,
  });
}

export function downloadSubmission(current) {
  if (!current.submission) return;
  const blob = new Blob([JSON.stringify(current.submission, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `submission-${String(current.submission.caseId || "case").replace(/[^a-z0-9-]/gi, "")}.json`;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function csvCell(value) {
  const text = value == null ? "" : String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** Flat report sheet. Canonical answers are not columns. */
export function submissionCsv(snapshot) {
  const o = snapshot.observations || {};
  const c = snapshot.conclusions || {};
  const fish = o.fish;
  const rows = [
    ["laboratory", snapshot.laboratory || ""],
    ["case_id", snapshot.caseId || ""],
    ["case_label", reportCaseTitle(snapshot)],
    ["case_type", snapshot.mode || ""],
    ["topic", ""],
    ["student_name", snapshot.student?.name || ""],
    ["student_id", snapshot.student?.id || ""],
    ["submitted_at", snapshot.submittedAt || ""],
    ["specimen", snapshot.intake?.specimen || ""],
    ["assay", snapshot.intake?.assay || ""],
    ["target", snapshot.intake?.target || ""],
    ["question", snapshot.intake?.question || ""],
    ["chromosome_count", o.count || ""],
    ["sex_complement", o.sex || ""],
    ["visible_finding", o.visible || ""],
    ["placed_chromosomes", String((o.crops || []).filter((piece) => piece.chromosome).length)],
    ["metaphases_examined", o.metaphasesExamined || ""],
    ["metaphases_karyotyped", o.metaphasesKaryotyped || ""],
    ["iscn", c.iscn || ""],
    ["classification", c.classification || ""],
    ["interpretation", c.interpretation || ""],
    ["possible_condition", snapshot.mode === "unknown" ? (c.possibleAssociation || "") : ""],
    ["limitations", c.limitations || ""],
    ["ideogram_marks", (o.ideogramMarks || []).map((mark) => `${mark.chromosome} ${mark.location} ${mark.effect}`).join("; ")],
    ["fish_scorable", fish ? String(fish.scorable) : ""],
    ["fish_excluded", fish ? String(fish.excluded) : ""],
    ["fish_patterns", fish ? (fish.tally || []).map((item) => `${item.pattern}:${item.count}`).join("; ") : ""],
    ...workstationCsvRows(snapshot.fishWorkstation),
  ];
  return rows.map((row) => row.map(csvCell).join(",")).join("\n");
}

function workstationCsvRows(w) {
  if (!w) return [];
  const s = w.summary || {};
  const a = w.answers || {};
  return [
    ["ws_assay_ref", `${w.assayRef || ""}#${w.seed ?? ""}`],
    ["ws_scored", String(s.scored ?? "")],
    ["ws_excluded", String(s.excluded ?? "")],
    ["ws_open", String(s.open ?? "")],
    ["ws_abnormal_percent", s.abnormalPercent == null ? "" : String(s.abnormalPercent)],
    ["ws_exclusion_reasons", (s.exclusionReasons || []).map((item) => `${item.reason}:${item.count}`).join("; ")],
    ["ws_nuclei", (w.nuclei || []).map((item) => `${item.nucleus}=${item.scorable === "Yes" ? item.signals : item.scorable === "No" ? `excluded(${item.reason})` : item.status}`).join("; ")],
    ["ws_detects", a.detects || ""],
    ["ws_demonstrated", a.demonstrated || ""],
    ["ws_partner", a.partner || ""],
    ["ws_misses", (a.misses || []).join("; ")],
    ["ws_conclusive", a.conclusive || ""],
    ["ws_scope", a.scope || ""],
    ["ws_conclusion", a.conclusion || ""],
    ["ws_limitations", a.limitations || ""],
  ];
}

export function downloadSubmissionCsv(current) {
  if (!current.submission) return;
  const blob = new Blob([submissionCsv(current.submission)], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `submission-${String(current.submission.caseId || "case").replace(/[^a-z0-9-]/gi, "")}.csv`;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
