import { BAND_DESIGNATIONS, BAND_DIGIT_OPTIONS, COMPARE_ARM_OPTIONS, CHROM_WITH_NONE, REGION_OPTIONS, SLOT_IDS, STRUCTURAL_OPTIONS, SUBBAND_OPTIONS, escapeHtml, joinPair, selectField, splitPair } from "./util.js?v=20261006j";
import { state, patchSession } from "./store.js?v=20261006j";
import { divergence, gradeAssembly, gradeComparison, gradeLocus, movePiece, nomenclaturePieces, parseBandLabel, shiftSelected } from "./banding.js?v=20261006l";
import { ideogramSVG, pieceChipSVG, stainLegendHTML } from "./ideogram.js?v=20261015a";
import { compareISCN } from "./iscn.js";
import { applyMode, applyStep, isTeachStep } from "./pedagogy.js?v=20261006l";

function baseStep(step) {
  return String(step || "").replace(/_\d+$/, "");
}

export function isAssemblyStep(step) {
  return ["anatomy", "assemble", "nomenclature", "comparison"].includes(baseStep(applyStep(step)));
}

function labelsFor(step) {
  if (isTeachStep(step)) return true;
  const s = state.session;
  const mode = s?.instructionMode;
  const applied = baseStep(applyStep(step));
  if (mode === "assessment") return false;
  if (mode === "practice") return Boolean(s?.pedagogy?.revealLabels);
  if (applied === "nomenclature" || applied === "anatomy") return false;
  return true;
}

export function assemblyView(step) {
  const s = state.session;
  const a = s.assembly;
  if (!a) return `<p class="muted">This case has no chromosome-segment map.</p>`;
  const labels = labelsFor(step);
  const applied = baseStep(applyStep(step));
  const teaching = isTeachStep(step);
  return `
    <div class="assembly-wrap">
      ${a.spec?.schematic_note ? `<p class="muted">${escapeHtml(a.spec.schematic_note)}</p>` : ""}
      ${applied === "anatomy" ? anatomyView(a, labels, teaching) : ""}
      ${applied === "assemble" ? assembleView(a, labels, teaching) : ""}
      ${applied === "nomenclature" ? nomenclatureView(a, labels, teaching) : ""}
      ${applied === "comparison" ? comparisonView(a, labels, teaching) : ""}
    </div>`;
}

function pieceById(assembly, id) {
  return assembly.expected.find((p) => p.id === id);
}

function anatomyView(a, labels, teaching) {
  const show = labels === true;
  const t = a.spec?.transform || {};
  const abnormal = t.type && t.type !== "none";
  const c = state.session.caseData || {};
  const chr = String(a.spec?.chromosome || "");
  const primary = a.expected || a.normal || [];
  const pair = Boolean(abnormal && a.normal?.length);
  const marks = abnormal ? divergence(a.normal || [], primary) : {};
  return `
    <div class="assembly-stage${pair ? " anatomy-pair" : ""}">
      ${pair ? `<div class="ideo-column">
        ${ideogramSVG(a.normal, { width: 140, height: 560, showLabels: show, showRuler: show })}
        <p class="ideo-caption">Normal ${escapeHtml(chr)}</p>
      </div>` : ""}
      <div class="ideo-column">
        ${ideogramSVG(primary, { width: 140, height: 560, showLabels: show, showRuler: show, marks })}
        <p class="ideo-caption">${escapeHtml(teaching ? anatomyCaption(t, chr, abnormal) : (abnormal ? `Chromosome ${chr}` : "Identify each landmark"))}</p>
      </div>
      <div class="assembly-copy">
        <h3>Chromosome anatomy</h3>
        <p>The chromosome is drawn vertically with the short-arm telomere at the top.${teaching ? " Names are visible for this explanation." : " Names are hidden. Identify each landmark from its position."}</p>
        ${teaching ? "" : `<fieldset>
          <legend>Identify each structure</legend>
          ${anatomyItem("pter", "Top telomere")}
          ${anatomyItem("p", "Short arm")}
          ${anatomyItem("cen", "Primary constriction")}
          ${anatomyItem("q", "Long arm")}
          ${anatomyItem("qter", "Bottom telomere")}
        </fieldset>`}
        ${teaching || !abnormal ? "" : anatomyAbnormalityFields(c)}
      </div>
    </div>`;
}

function anatomyCaption(t, chr, abnormal) {
  if (!abnormal) return "pter → p arm → centromere → q arm → qter";
  return `Chromosome ${chr} — compare with the normal homolog and classify any rearrangement`;
}

function anatomyAbnormalityFields(c) {
  const got = state.session.answers.anatomy || {};
  const types = (c.abnormality_options?.types || STRUCTURAL_OPTIONS.filter((t) => t !== "none"));
  const chr = splitPair(got.chromosomes);
  return `
    <fieldset>
      <legend>Abnormality</legend>
      <p>Compare the two maps. Name the rearrangement and the chromosome, arm, and band where it occurs.</p>
      ${selectField("ana-type", "Type of abnormality", got.type, types)}
      <div class="locus-grid">
        ${selectField("ana-chr", "Chromosome", chr.first, CHROM_WITH_NONE)}
        ${selectField("ana-chr-2", "Second chromosome (if any)", chr.second, SLOT_IDS)}
      </div>
      ${selectField("ana-arm", "Arm involved", got.arm, COMPARE_ARM_OPTIONS)}
      <div class="locus-grid">
        ${selectField("ana-band", "Band / region", got.band, BAND_DESIGNATIONS)}
        ${selectField("ana-band-2", "Second band (if any)", got.band2, BAND_DESIGNATIONS)}
      </div>
    </fieldset>`;
}

function anatomyItem(id, prompt) {
  const got = state.session.answers.anatomy?.[id] || "";
  const opts = [
    ["pter", "pter"],
    ["p", "p arm"],
    ["cen", "centromere"],
    ["q", "q arm"],
    ["qter", "qter"],
  ];
  return `<label class="stack">${escapeHtml(prompt)}
    <select data-anatomy="${id}">
      <option value="">Select…</option>
      ${opts.map(([v, lab]) => `<option value="${v}" ${got === v ? "selected" : ""}>${lab}</option>`).join("")}
    </select>
  </label>`;
}

function assembleView(a, labels, teaching) {
  const show = Boolean(labels);
  if (teaching) {
    return `
      <div class="assembly-stage">
        <div class="ideo-column">
          ${ideogramSVG(a.expected, { width: 180, height: 560, showLabels: true, showRuler: true })}
          <p class="ideo-caption">Ordered example. pter is at the top. The next screen hides the names.</p>
          ${stainLegendHTML(a.expected)}
        </div>
      </div>`;
  }
  return `
    <div class="assembly-stage three">
      <div>
        <p class="group-label">Chromosome segments (${a.tray.length})</p>
        <p class="muted">Drag a band into the chromosome, or click a segment and then click the build column.</p>
        <div class="piece-tray" data-drop="tray">
          ${a.tray.map((id) => pieceToken(a, id, null, show, false)).join("") || "<p class='muted'>All segments have been placed.</p>"}
        </div>
      </div>
      <div class="ideo-column assembled">
        <p class="group-label">Build the chromosome</p>
        <div class="stack-col drop-target" data-drop="stack">
          <div class="pole">pter · p arm</div>
          ${a.stack.map((id, i) => pieceToken(a, id, i, show, true)).join("") || "<p class='drop-hint'>Drop segments here<br/>pter at the top</p>"}
          <div class="pole">q arm · qter</div>
        </div>
        <div class="piece-nav">
          <button type="button" class="btn" data-action="asm-up">Move up</button>
          <button type="button" class="btn" data-action="asm-down">Move down</button>
          <button type="button" class="btn" data-action="asm-to-stack">Add</button>
          <button type="button" class="btn" data-action="asm-to-tray">Return</button>
        </div>
      </div>
      <aside class="asm-help">
        <h3>Instructions</h3>
        <ol>
          <li>Drag segments into the correct order from pter to qter.</li>
          <li>Use banding patterns and the centromere position.</li>
          <li>All segments must be used.</li>
          <li>Click Check to review your assembly.</li>
        </ol>
        <p class="muted">${teaching
          ? "Names are on the map for this explanation."
          : (show
            ? "Each segment is labeled with its G-band name. Order them pter → centromere → qter."
            : "Band names stay off this screen. Use the shade pattern inside each region, and the centromere.")}</p>
        ${show ? "" : stainLegendHTML(a.expected)}
      </aside>
    </div>`;
}

function pieceToken(a, id, stackIndex, showLabels, connected) {
  const piece = pieceById(a, id);
  if (!piece) return "";
  const sel = a.selectedId === id ? " selected" : "";
  const visible = showLabels ? (piece.role === "centromere" ? "cen" : piece.label) : "segment";
  return `<div class="piece-token${sel}${connected ? " connected" : ""}" draggable="true" data-piece="${escapeHtml(id)}" data-stack-index="${stackIndex ?? ""}" tabindex="0" role="button" aria-label="${escapeHtml(visible)}">
    ${pieceChipSVG(piece, { showLabels, connected })}
  </div>`;
}

function nomenclatureView(a, labels, teaching) {
  const spec = a.spec.nomenclature || {};
  const highlight = spec.expected || spec.highlight;
  const fields = a.locus;
  const show = Boolean(labels);
  const parsed = parseBandLabel(highlight);
  const needsSub = parsed?.subband != null;
  const source = nomenclaturePieces(state.maps, a.spec);
  const how = needsSub
    ? "Sub-bands of one band are drawn as separate slices. They are numbered from the centromere toward the telomere: .1 is closest to the centromere."
    : "The gold bracket marks one G-band. Stop at band; this map does not subdivide it.";
  return `
    <div class="assembly-stage">
      <div class="ideo-column">
        ${ideogramSVG(source, { width: 180, height: 560, showLabels: show, highlightId: highlight, showRuler: teaching })}
        <p class="ideo-caption">The gold bracket marks the locus to name.</p>
      </div>
      <div class="assembly-copy">
        ${teaching ? `<h3>The marked address, with names visible</h3>
        <p>Read chromosome, arm, region, and band.${needsSub ? " This band is split into sub-bands on the map; include the sub-band of the marked slice." : ""}</p>
        <p>${how}</p>
        <p>The next screen keeps the mark and hides the names.</p>` : `<h3>Name the highlighted locus</h3>
        <p>${needsSub
          ? "Write chromosome, arm, region, band, then the sub-band of the marked slice. Numbering increases from the centromere toward the telomere."
          : "Write chromosome, arm, region, and band. This map does not ask for a sub-band."}</p>
        <p class="muted">${how}</p>
        <label class="stack">Complete locus
          <input id="loc-complete" class="iscn-input" value="${escapeHtml(fields.locus)}" placeholder="${needsSub ? "format, e.g. 3p21.3" : "format, e.g. 5p14"}" />
        </label>
        <div class="locus-grid">
          ${selectField("loc-chr", "Chromosome", fields.chromosome, SLOT_IDS)}
          ${selectField("loc-arm", "Arm (p or q)", fields.arm, ["p", "q"])}
          ${selectField("loc-region", "Region", fields.region, REGION_OPTIONS)}
          ${selectField("loc-band", "Band", fields.band, BAND_DIGIT_OPTIONS)}
          ${needsSub ? selectField("loc-sub", "Sub-band", fields.subband, SUBBAND_OPTIONS) : ""}
        </div>`}
      </div>
    </div>`;
}

function field(id, label, value) {
  return `<label class="stack">${escapeHtml(label)}<input id="${id}" value="${escapeHtml(value || "")}" /></label>`;
}

function comparisonView(a, labels, teaching) {
  const show = labels === true;
  const assembled = stackPieces(a);
  const marks = divergence(a.normal || [], assembled);
  return `
    <div class="compare-grid">
      <div>
        <p class="group-label">Normal chromosome ${escapeHtml(a.spec.chromosome)}</p>
        ${ideogramSVG(a.normal || [], { width: 120, height: 520, showLabels: show, marks: { missing: marks.missing } })}
      </div>
      <div>
        <p class="group-label">Assembled / abnormal</p>
        ${ideogramSVG(assembled, { width: 120, height: 520, showLabels: show, marks: { extra: marks.extra, inverted: marks.inverted, translocated: marks.translocated } })}
      </div>
      <div class="assembly-copy">
        <h3>${teaching ? "What changed on the map" : "Structural interpretation"}</h3>
        <p>${teaching ? "Compare the normal chromosome with the rearranged one. The class is not named yet." : "Homologous regions are stacked pter→qter. Highlighted bands mark where the abnormal map diverges from the reference."}</p>
        ${stainLegendHTML(assembled)}
        ${teaching ? "" : `<p class="legend"><span class="swatch missing"></span> lost <span class="swatch extra"></span> extra / translocated <span class="swatch inverted"></span> inverted</p>
        <label class="stack">Abnormality type
          <select id="cmp-type">
            <option value="">Select…</option>
            ${["deletion","duplication","inversion","reciprocal translocation","Robertsonian translocation","derivative chromosome","ring chromosome","isochromosome"].map((v) => `<option value="${v}" ${a.comparison.type === v ? "selected" : ""}>${v}</option>`).join("")}
          </select>
        </label>
        <div class="locus-grid">
          ${selectField("cmp-chr", "Chromosome involved", splitPair(a.comparison.chromosomes).first, CHROM_WITH_NONE)}
          ${selectField("cmp-chr-2", "Second chromosome (if any)", splitPair(a.comparison.chromosomes).second, SLOT_IDS)}
        </div>
        ${selectField("cmp-arm", "Arm(s) involved", a.comparison.arms, COMPARE_ARM_OPTIONS)}
        <div class="locus-grid">
          ${selectField("cmp-bp", "Breakpoint / band", splitPair((a.comparison.breakpoints || "").replace(/,/g, ";")).first, BAND_DESIGNATIONS)}
          ${selectField("cmp-bp-2", "Second breakpoint (if any)", splitPair((a.comparison.breakpoints || "").replace(/,/g, ";")).second, BAND_DESIGNATIONS)}
        </div>
        ${field("cmp-iscn", "ISCN", a.comparison.iscn)}`}
      </div>
    </div>`;
}

function stackPieces(a) {
  if (a.stack.length) return a.stack.map((id) => pieceById(a, id)).filter(Boolean);
  return a.expected;
}

export function assemblyControls(step) {
  const buttons = [];
  const kind = baseStep(step);
  if (kind === "assemble") {
    buttons.push(`<button type="button" class="btn" data-action="asm-reset">Reset segments</button>`);
    buttons.push(`<button type="button" class="btn" data-action="asm-check">Check assembly</button>`);
  }
  if (kind === "anatomy") buttons.push(`<button type="button" class="btn" data-action="anatomy-check">Check anatomy</button>`);
  if (kind === "nomenclature") buttons.push(`<button type="button" class="btn" data-action="loc-check">Check locus</button>`);
  if (kind === "comparison") buttons.push(`<button type="button" class="btn" data-action="cmp-check">Check interpretation</button>`);
  if (state.session?.instructionMode !== "assessment") buttons.push(`<button type="button" class="btn" data-action="hint">Hint</button>`);
  buttons.push(`<button type="button" class="btn primary" data-action="submit-step">Submit</button>`);
  return buttons.join("");
}

export function handleAssemblyAction(action, el) {
  const s = state.session;
  const a = s.assembly;
  if (!a) return false;
  if (action === "asm-reset") {
    const ids = a.expected.map((p) => p.id);
    patchSession({ assembly: { ...a, tray: ids.sort(() => 0.5 - Math.random()), stack: [], selectedId: null } });
    return true;
  }
  if (action === "asm-up") {
    patchSession({ assembly: shiftSelected(a, -1) });
    return true;
  }
  if (action === "asm-down") {
    patchSession({ assembly: shiftSelected(a, 1) });
    return true;
  }
  if (action === "asm-to-stack" && a.selectedId) {
    patchSession({ assembly: movePiece(a, a.selectedId, "stack") });
    return true;
  }
  if (action === "asm-to-tray" && a.selectedId) {
    patchSession({ assembly: movePiece(a, a.selectedId, "tray") });
    return true;
  }
  const current = baseStep(s.steps[s.stepIndex]);
  if (action === "asm-check" || (action === "submit-step" && current === "assemble")) {
    checkAssembly(action === "submit-step");
    return action !== "submit-step";
  }
  if (action === "anatomy-check" || (action === "submit-step" && current === "anatomy")) {
    checkAnatomy(action === "submit-step");
    return action !== "submit-step";
  }
  if (action === "loc-check" || (action === "submit-step" && current === "nomenclature")) {
    checkLocus(action === "submit-step");
    return action !== "submit-step";
  }
  if (action === "cmp-check" || (action === "submit-step" && current === "comparison")) {
    checkComparison(action === "submit-step");
    return action !== "submit-step";
  }
  return false;
}

export function selectPiece(id) {
  const a = state.session.assembly;
  patchSession({ assembly: { ...a, selectedId: a.selectedId === id ? null : id } });
}

export function dropPiece(id, dest, index) {
  const a = state.session.assembly;
  patchSession({ assembly: movePiece(a, id, dest, index) });
}

function writeFb(step, fb, lock = false) {
  const s = state.session;
  s.feedback = { ...s.feedback, [step]: applyMode(s, step, fb, { lock }) };
}

function checkAssembly(isSubmit) {
  const s = state.session;
  s.attempts.assembly += 1;
  const grade = gradeAssembly(s.assembly.stack, s.assembly.expected);
  s.scores.chromosome_assembly = grade;
  const extra = `<ul class="comp-list">
    <li>p/q orientation: <strong>${grade.orientation}</strong></li>
    <li>Arm assignment: <strong>${grade.arm_assignment}</strong></li>
    <li>Relationship to centromere: <strong>${grade.centromere}</strong></li>
    <li>Telomeric direction / order: <strong>${grade.telomeric_direction}</strong></li>
    <li>Complete segment order: <strong>${grade.segment_order}</strong></li>
  </ul>`;
  writeFb(s.steps[s.stepIndex] || "assemble", {
    tone: grade.perfect ? "ok" : "review",
    scored: true,
    title: grade.perfect ? "Assembly matches the case map." : "Assembly is not yet correct.",
    body: grade.perfect
      ? "Numbering increases from the centromere toward each telomere."
      : `${grade.placed}/${grade.expected} segments placed. Identities of misplaced bands are not listed.`,
    extra,
  }, isSubmit);
}

function anatomyBreakpoints(got) {
  return [got.band, got.band2].filter(Boolean).map((b) => String(b).replace(/\s+/g, "")).join(",");
}

function checkAnatomy(isSubmit) {
  const s = state.session;
  s.attempts.anatomy = (s.attempts.anatomy || 0) + 1;
  const expected = { pter: "pter", p: "p", cen: "cen", q: "q", qter: "qter" };
  const got = s.answers.anatomy || {};
  const parts = Object.entries(expected).map(([k, v]) => `${k}: ${got[k] === v ? "correct" : "incorrect"}`);
  let ok = Object.entries(expected).every(([k, v]) => got[k] === v);
  const t = s.assembly.spec?.transform || {};
  const abnormal = t.type && t.type !== "none";
  if (abnormal) {
    const components = gradeComparison({
      type: got.type || "",
      chromosomes: got.chromosomes || "",
      arms: got.arm || "",
      breakpoints: anatomyBreakpoints(got),
    }, s.caseData, t);
    parts.push(`type: ${components.type}`);
    if (components.chromosomes !== "na") parts.push(`chromosome: ${components.chromosomes}`);
    if (components.arms !== "na") parts.push(`arm: ${components.arms}`);
    if (components.breakpoints !== "na") parts.push(`placement: ${components.breakpoints}`);
    const placementOk = ["type", "chromosomes", "arms", "breakpoints"].every((k) => components[k] === "correct" || components[k] === "na");
    ok = ok && placementOk;
    s.scores.abnormality_recognition = { ok: placementOk, detail: "from anatomy" };
  }
  writeFb(s.steps[s.stepIndex] || "anatomy", {
    tone: ok ? "ok" : "review",
    scored: true,
    title: ok
      ? (abnormal ? "Anatomy and rearrangement are correct." : "Anatomy labels are correct.")
      : (abnormal ? "Review landmarks, abnormality type, or placement." : "Review p/q orientation."),
    body: abnormal
      ? "pter remains at the top even when an arm is shortened, inverted, or fused. Name the rearrangement class and the arm and band where the map diverges."
      : "pter is the short-arm telomere at the top; qter is at the bottom. The centromere separates p from q.",
    extra: `<ul class="comp-list">${parts.map((p) => `<li>${escapeHtml(p)}</li>`).join("")}</ul>`,
  }, isSubmit);
}

function checkLocus(isSubmit) {
  const s = state.session;
  s.attempts.nomenclature += 1;
  const expected = s.assembly.spec.nomenclature?.expected;
  const grade = gradeLocus(s.assembly.locus, expected);
  s.scores.banding_nomenclature = grade;
  const extra = `<ul class="comp-list">${Object.entries(grade.components).filter(([, v]) => v !== "na").map(([k, v]) => `<li>${k}: <strong>${v}</strong></li>`).join("")}</ul>`;
  writeFb(s.steps[s.stepIndex] || "nomenclature", {
    tone: grade.match ? "ok" : "review",
    scored: true,
    title: grade.match ? "Locus is correct." : "One or more hierarchical components need review.",
    body: s.instructionMode
      ? (grade.match ? "The chromosome address matches this map." : "One part of the address is off. The expected band is not filled in for you.")
      : (isSubmit || grade.match ? `Expected locus: ${expected}.` : "The complete address is withheld until this step is submitted or answered correctly."),
    extra,
  }, isSubmit);
}

function checkComparison(isSubmit) {
  const s = state.session;
  s.attempts.comparison = (s.attempts.comparison || 0) + 1;
  const t = s.assembly.spec.transform || {};
  const components = gradeComparison(s.assembly.comparison, s.caseData, t);
  const iscn = compareISCN(s.assembly.comparison.iscn, s.caseData.expected_iscn, s.caseData.accepted_iscn_variants || []);
  components.iscn = s.caseData.expected_iscn
    ? (iscn.match ? "correct" : (s.assembly.comparison.iscn ? "incorrect" : "missing"))
    : "na";
  const typeOk = components.type === "correct";
  const placementOk = ["chromosomes", "arms", "breakpoints"].every((k) => components[k] === "correct" || components[k] === "na");
  const ok = typeOk && placementOk;
  const extra = `<ul class="comp-list">${Object.entries(components).filter(([, v]) => v !== "na").map(([k, v]) => `<li>${k}: <strong>${v}</strong></li>`).join("")}</ul>`;
  s.scores.abnormality_recognition = { ok, detail: "from assembly comparison" };
  const guided = s.instructionMode;
  writeFb(s.steps[s.stepIndex] || "comparison", {
    tone: ok ? "ok" : "review",
    scored: true,
    title: ok
      ? "Structural interpretation matches this map."
      : (typeOk ? "The class is right. The chromosome, arm, or breakpoint needs review." : "Structural class needs review."),
    body: guided
      ? (ok
        ? "The class, chromosome, arm, and breakpoint match the change on this map."
        : "Name the structural change, then the chromosome, arm, and exact breakpoint where the maps diverge.")
      : (isSubmit
        ? `This case applies a ${t.type} to the reference map${s.caseData.expected_iscn ? ` (${s.caseData.expected_iscn})` : ""}.`
        : "The expected ISCN is not shown until you submit this step."),
    extra: guided === "assessment" ? "" : extra,
  }, isSubmit);
}

export function readAssemblyFields(ev) {
  const a = state.session.assembly;
  if (!a) return;
  const id = ev.target.id;
  const anatomy = ev.target.getAttribute("data-anatomy");
  if (anatomy) {
    state.session.answers.anatomy = { ...state.session.answers.anatomy, [anatomy]: ev.target.value };
    return;
  }
  if (id === "ana-type") {
    state.session.answers.anatomy = { ...state.session.answers.anatomy, type: ev.target.value };
    return;
  }
  if (id === "ana-chr" || id === "ana-chr-2") {
    state.session.answers.anatomy = {
      ...state.session.answers.anatomy,
      chromosomes: joinPair(document.getElementById("ana-chr")?.value, document.getElementById("ana-chr-2")?.value),
    };
    return;
  }
  if (id === "ana-arm") {
    state.session.answers.anatomy = { ...state.session.answers.anatomy, arm: ev.target.value };
    return;
  }
  if (id === "ana-band") {
    state.session.answers.anatomy = { ...state.session.answers.anatomy, band: ev.target.value };
    return;
  }
  if (id === "ana-band-2") {
    state.session.answers.anatomy = { ...state.session.answers.anatomy, band2: ev.target.value };
    return;
  }
  if (id === "loc-complete") a.locus.locus = ev.target.value;
  if (id === "loc-chr") a.locus.chromosome = ev.target.value;
  if (id === "loc-arm") a.locus.arm = ev.target.value;
  if (id === "loc-region") a.locus.region = ev.target.value;
  if (id === "loc-band") a.locus.band = ev.target.value;
  if (id === "loc-sub") a.locus.subband = ev.target.value;
  if (id === "cmp-type") a.comparison.type = ev.target.value;
  if (id === "cmp-chr" || id === "cmp-chr-2") {
    a.comparison.chromosomes = joinPair(
      document.getElementById("cmp-chr")?.value,
      document.getElementById("cmp-chr-2")?.value
    );
  }
  if (id === "cmp-arm") a.comparison.arms = ev.target.value;
  if (id === "cmp-bp" || id === "cmp-bp-2") {
    a.comparison.breakpoints = joinPair(
      document.getElementById("cmp-bp")?.value,
      document.getElementById("cmp-bp-2")?.value
    ).replace(";", ",");
  }
  if (id === "cmp-iscn") a.comparison.iscn = ev.target.value;
}
