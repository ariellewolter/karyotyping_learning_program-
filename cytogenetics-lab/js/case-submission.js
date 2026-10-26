/**
 * The integrated casework report: intake, karyotype, ideogram, FISH, and interpretation.
 * Built only from the learner's own entries. The curated teaching answer is never written into it.
 */
import { escapeHtml } from "./util.js";
import { ideogramSVG } from "./ideogram.js?v=20261024j";
import { genomeIssues, genomeSVG, issueBands, markBands, markLocation } from "./case-ideogram.js?v=20261025gen2";
import { sortedCrops } from "./case-report.js?v=20261026cs1";

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
    return "The condition was provided with this case. Show the chromosome or FISH evidence and report it. Identifying the disease name is not part of this assignment.";
  }
  if (mode === "unknown") {
    return "The condition was not provided. Show the evidence, report the finding, and say what condition the findings may support.";
  }
  return "This case was entered by the student. The report is their own record.";
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

/** Snapshot of the learner's work. Holds no curated answer fields. */
export function buildSubmission(current, { studentName = "", studentId = "", limitations = "", reportedFinding = "", fishWorkstation = null } = {}) {
  const mode = caseMode(current);
  const nuclei = Array.isArray(current.fishNuclei) ? current.fishNuclei : [];
  return {
    format: SUBMISSION_FORMAT,
    caseId: current.id,
    caseLabel: current.label || "",
    lab: current.lab,
    mode,
    laboratory: laboratoryLabel(current.lab),
    exploredDisease: mode === "explore" || mode === "guided" ? current.source?.diseaseName || "" : "",
    student: { name: String(studentName).slice(0, 120), id: String(studentId).slice(0, 60) },
    submittedAt: new Date().toISOString(),
    fishWorkstation: current.lab === "fish" ? fishWorkstation : null,
    intake: {
      specimen: current.specimen || "",
      assay: current.assay || "",
      target: current.target || "",
      question: mode === "own" ? current.history || "" : String(current.history || "").split("\n\n")[0],
      reportedFinding: mode === "own" ? reportedFinding : "",
    },
    observations: {
      count: current.observedCount || "",
      sex: current.observedSex || "",
      visible: current.observation || "",
      chromosomeLog: (current.chromosomeReads || []).map((row) => ({ ...row })),
      crops: (current.sortedChromosomes || []).filter((piece) => piece.chromosome).map((piece) => ({ ...piece })),
      ideogramMarks: (current.studentMarks || []).map((mark) => ({ ...mark })),
      imageMarkers: (current.imageAnnotations || []).map((marker) => ({ ...marker })),
      fish: current.lab === "fish" ? {
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
      interpretation: current.interpretation || "",
      possibleAssociation: caseMode(current) === "unknown" ? current.possibleAssociation || "" : "",
      limitations: String(limitations).slice(0, 2000),
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
      <label>Limitations of this analysis<textarea name="limitations" rows="3" maxlength="2000" placeholder="For example, band resolution, number of cells reviewed, or what a karyotype cannot detect." ${submitted ? "readonly" : ""}>${escapeHtml(meta.limitations || "")}</textarea></label>
      <p class="muted" role="status">${status}</p>
      <div class="patient-actions">${submitted ? "" : `<button class="button" type="submit">Save report details</button>`}<button class="button${submitted ? " primary" : ""}" type="button" id="case-report-pdf">${submitted ? "Download submitted report (PDF)" : "Export draft PDF"}</button>${submitted ? `<button class="button" type="button" id="case-report-json">Download submission (JSON)</button><button class="button" type="button" id="case-report-csv">Download submission (CSV)</button>` : `<button class="button primary" type="button" id="case-report-submit">Submit case report</button>`}</div>
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
  const marks = snapshot.observations.ideogramMarks;
  const chromosomes = [...new Set([...marks.map((mark) => String(mark.chromosome)), ...iscn.issues.map((issue) => String(issue.chromosome))])].filter(Boolean);
  const figures = chromosomes.map((chromosome) => {
    const segments = maps?.chromosomes?.[chromosome]?.segments || [];
    if (!segments.length) return "";
    const highlightIds = [
      ...marks.filter((mark) => String(mark.chromosome) === chromosome).flatMap((mark) => markBands(maps, mark).map((band) => band.id)),
      ...iscn.issues.filter((issue) => String(issue.chromosome) === chromosome).flatMap((issue) => issueBands(maps, issue).map((band) => band.id)),
    ];
    return `<figure><figcaption>Chromosome ${escapeHtml(chromosome)}</figcaption>${ideogramSVG(segments, { width: 90, height: 380, barWidth: 30, highlightIds, highlightTag: false })}</figure>`;
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
export function caseReportHTML(snapshot, { maps, crops = [], draft = false } = {}) {
  return reportHTML(snapshot, { maps, crops, draft });
}

function reportHTML(snapshot, { maps, crops, draft }) {
  const o = snapshot.observations;
  const c = snapshot.conclusions;
  const karyotype = snapshot.lab !== "fish";
  const ideogram = karyotype ? ideogramFigures(maps, snapshot) : { figures: "", rows: [] };
  const byChromosome = new Map();
  crops.forEach((crop) => byChromosome.set(crop.chromosome, [...(byChromosome.get(crop.chromosome) || []), crop]));
  const comparisons = [...byChromosome.entries()].map(([chromosome, items]) => `<figure class="pair"><figcaption>${escapeHtml(chromosome)}</figcaption>${items.map((crop) => `<img class="crop" src="${crop.url}" alt="Chromosome ${escapeHtml(chromosome)} ${escapeHtml(crop.homolog)}"><span>${escapeHtml(crop.homolog)}</span>`).join("")}</figure>`).join("");
  const fish = o.fish;
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${escapeHtml(snapshot.caseLabel || "Case report")}</title><style>
    body { font-family: Helvetica, Arial, sans-serif; color: #1c2430; margin: 24px; }
    h1 { font-size: 22px; margin: 4px 0; } h2 { font-size: 16px; margin-top: 22px; border-bottom: 2px solid #1c2430; padding-bottom: 2px; } h3 { font-size: 13px; margin: 14px 0 4px; }
    p, li { font-size: 12px; line-height: 1.4; } .note { color: #526576; font-size: 11px; } .draft { color: #9a3412; font-weight: bold; }
    table { width: 100%; border-collapse: collapse; font-size: 11px; margin-bottom: 6px; } th, td { border-bottom: 1px solid #d7d2c8; text-align: left; padding: 4px; vertical-align: top; } th { width: 28%; }
    .row { display: flex; flex-wrap: wrap; gap: 12px; align-items: end; } figure { margin: 0; text-align: center; } figcaption { font-size: 11px; }
    .pair span { display: block; font-size: 10px; } img.crop { width: 48px; height: auto; background: #f4f4f2; }
    .block { white-space: pre-wrap; font-size: 12px; } code { font-size: 12px; }
    img, svg { max-width: 100%; } .genome svg { width: 100%; height: auto; }
    * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    @page { margin: 14mm; }
    @media print { body { margin: 0; } h2, h3 { break-after: avoid; } tr, figure, .row, .block { break-inside: avoid; } }
  </style></head><body>
    <p class="note">Educational casework report. Not a clinical report and not a diagnosis.</p>
    ${draft ? `<p class="draft">Draft: this case has not been submitted.</p>` : ""}
    <h1>${escapeHtml(snapshot.caseLabel || "Case report")}</h1>
    <table>${row("Laboratory", snapshot.laboratory || laboratoryLabel(snapshot.lab))}${row("Case identifier", snapshot.caseId)}${row("Student", snapshot.student.name || "Not entered")}${row("Student ID", snapshot.student.id || "Not entered")}${row(draft ? "Generated" : "Submitted", new Date(snapshot.submittedAt).toLocaleString())}${row("Case type", MODE_LABELS[snapshot.mode] || "")}${row("Investigation topic", snapshot.exploredDisease)}${row("How to grade", assignmentExpectation(snapshot.mode))}${row("Possible condition", snapshot.mode === "unknown" ? (c.possibleAssociation || "Not entered") : "")}</table>
    <h2>1. Case information</h2>
    <table>${row("Specimen", snapshot.intake.specimen)}${row("Assay", snapshot.intake.assay)}${row("Probe / target", snapshot.intake.target)}${row("Clinical question", snapshot.intake.question || "Not provided")}${row("Source-reported finding", snapshot.intake.reportedFinding)}</table>
    <h2>2. Observations</h2>
    ${karyotype ? `
      <h3>Karyotype</h3>
      <table>${row("Chromosome count", o.count || "Not recorded")}${row("Sex chromosome complement", o.sex || "Not recorded")}${row("Visible finding", o.visible || "Not recorded")}</table>
      <h3>Chromosome log</h3>${table(["Chromosome", "What was seen", "Note"], o.chromosomeLog.map((item) => [item.chromosome, item.seen, item.note]), "No chromosome decisions recorded.")}
      <h3>Homolog comparisons</h3>${comparisons ? `<div class="row">${comparisons}</div>` : `<p class="note">No labeled chromosome crops were saved.</p>`}
      <h3>Ideogram and abnormality table</h3>${ideogram.genome ? `<div class="genome">${ideogram.genome}</div><p class="note">Red bars: the student's marks. Amber bars: read from the student's ISCN. Chromosomes named in either are in red type.</p>` : ""}${ideogram.figures ? `<div class="row">${ideogram.figures}</div>` : ""}${table(["Location", "Chromosome", "Effect", "What was identified", "Source"], ideogram.rows, "No band or segment was marked, and none was read from the ISCN.")}
    ` : snapshot.fishWorkstation ? "" : `
      <h3>FISH scoring</h3>
      <table>${row("Nucleus records", String(fish?.nuclei.length || 0))}${row("Scorable", String(fish?.scorable || 0))}${row("Excluded", String(fish?.excluded || 0))}${row("Summary scorable nuclei entered", fish?.summaryScorable)}</table>
      ${table(["Signal pattern", "Scorable nuclei", "Percent of scorable"], (fish?.tally || []).map((item) => [item.pattern, String(item.count), fish.scorable ? `${Math.round((item.count / fish.scorable) * 1000) / 10}%` : "—"]), "No scorable nucleus with a recorded pattern.")}
      ${fish?.summaryPatterns.length ? `<h3>Summary counts entered</h3>${table(["Signal pattern", "Nuclei"], fish.summaryPatterns.map((item) => [item.pattern, item.count]), "")}` : ""}
      <h3>Nucleus records</h3>${table(["Nucleus", "Field", "Scorable", "Pattern", "Note"], (fish?.nuclei || []).map((item) => [String(item.number), item.fieldName || (Number.isInteger(item.fieldIndex) ? `Field ${item.fieldIndex + 1}` : "—"), item.scorable ? "Yes" : "No", item.pattern || "—", item.note || ""]), "No nucleus was recorded.")}
    `}
    ${snapshot.fishWorkstation ? workstationSection(snapshot.fishWorkstation) : ""}
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
  const crops = snapshot.lab === "fish" ? [] : await sortedCrops(cropSource);
  const html = reportHTML(snapshot, { maps, crops, draft: !current.submission });
  const frame = document.createElement("iframe");
  frame.setAttribute("title", "Case report");
  frame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0";
  frame.srcdoc = html;
  frame.onload = () => {
    frame.contentWindow?.focus();
    frame.contentWindow?.print();
    window.setTimeout(() => frame.remove(), 1000);
  };
  document.body.append(frame);
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
    ["case_label", snapshot.caseLabel || ""],
    ["case_type", snapshot.mode || ""],
    ["topic", snapshot.exploredDisease || ""],
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
