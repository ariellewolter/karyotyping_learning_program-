import { BAND_DESIGNATIONS, RATIO_COUNT_OPTIONS, SIGNAL_COUNT_OPTIONS, SLOT_IDS, escapeHtml, selectField } from "./util.js?v=20261006j";
import { state, patchSession } from "./store.js?v=20261006j";
import {
  PROBE_DETECTS,
  PROBE_NORMAL_PATTERNS,
  PROBE_STRATEGIES,
  PROBE_TARGETS,
  PROBE_TYPES,
  addMark,
  countFieldsFor,
  currentNucleus,
  gradeInterpretation,
  gradeLocalization,
  gradeNucleus,
  gradeProbeType,
  gradeSignalIdentification,
  gradeStrategy,
  localizationPieces,
  predictedProbeArrangement,
  removeMark,
  resetNucleus,
  summarizeEnumeration,
  updateMark,
} from "./fish.js?v=20261006j";
import { nucleusSVG } from "./fish-microscopy.js?v=20261006e";
import { ideogramSVG } from "./ideogram.js?v=20261006j";
import { applyMode, applyStep, isTeachStep, strategyFeedback } from "./pedagogy.js?v=20261006j";

const SIGNAL_LABELS = {
  red: "Red only",
  green: "Green only",
  fusion: "Fusion",
  split: "Split",
  uncertain: "Uncertain",
};

function signalLabel(type) {
  return SIGNAL_LABELS[type] || type;
}

export function isFishStep(step) {
  return ["fish_demo", "probe_locus", "probe_type", "probe_strategy", "fish_scope", "fish_interpret"].includes(applyStep(step));
}

export function fishView(step) {
  const f = state.session.fish;
  if (!f) return `<p class="muted">This case has no FISH assay record.</p>`;
  const applied = applyStep(step);
  const teaching = isTeachStep(step) && state.session?.module !== "disease";
  return `
    <div class="fish-wrap">
      ${f.spec.synthetic_images ? `<p class="asset-banner">Synthetic demonstration fluorescence — not authentic clinical microscopy.</p>` : ""}
      ${teaching ? fishTeachGraphic(applied, f) : ""}
      ${!teaching && applied === "fish_demo" ? demoView(f) : ""}
      ${!teaching && applied === "probe_locus" ? locusView(f) : ""}
      ${!teaching && applied === "probe_type" ? typeView(f) : ""}
      ${!teaching && applied === "probe_strategy" ? strategyView(f) : ""}
      ${!teaching && applied === "fish_scope" ? scopeView(f) : ""}
      ${!teaching && applied === "fish_interpret" ? interpretView(f) : ""}
    </div>`;
}

function fishTeachGraphic(step, f) {
  const exercise = state.session?.exercise;
  if (step === "probe_locus") return locusView(f, true);
  if (exercise === "enumeration") {
    const normal = { cx: 200, cy: 170, rx: 88, ry: 96, expected_signals: [
      { id: "n1", type: "green", x: 168, y: 150 },
      { id: "n2", type: "green", x: 230, y: 176 },
    ] };
    return `<div class="fish-canvas">${nucleusSVG(normal, { activeChannel: "merge", showLabels: true, demo: true })}</div>
      <p class="ideo-caption">Normal example: two signals, one for each copy. The nuclei you score next are not labeled.</p>`;
  }
  if (exercise === "break-apart") {
    const intact = { cx: 120, cy: 150, rx: 70, ry: 74, expected_signals: [{ id: "f", type: "fusion", x: 120, y: 150 }] };
    const split = { cx: 300, cy: 150, rx: 70, ry: 74, expected_signals: [
      { id: "r", type: "red", x: 270, y: 130 },
      { id: "g", type: "green", x: 330, y: 175 },
    ] };
    return `<div class="pair-art">
      <div><p class="group-label">Intact</p>${nucleusSVG(intact, { width: 240, height: 280, showLabels: true, demo: true })}</div>
      <div><p class="group-label">Rearranged</p>${nucleusSVG(split, { width: 240, height: 280, showLabels: true, demo: true })}</div>
    </div>`;
  }
  if (exercise === "quality") {
    const clear = { cx: 120, cy: 150, rx: 70, ry: 74, expected_signals: [
      { id: "a", type: "green", x: 100, y: 140 },
      { id: "b", type: "green", x: 145, y: 170 },
    ] };
    const overlap = {
      cx: 280, cy: 140, rx: 64, ry: 68,
      overlap: { cx: 330, cy: 175, rx: 60, ry: 64 },
      expected_signals: [{ id: "o", type: "green", x: 305, y: 158 }],
    };
    return `<div class="pair-art">
      <div><p class="group-label">Scorable</p>${nucleusSVG(clear, { width: 240, height: 280, showLabels: false, demo: true })}</div>
      <div><p class="group-label">Overlap — unscorable</p>${nucleusSVG(overlap, { width: 240, height: 280, showLabels: false, demo: true })}</div>
    </div>`;
  }
  return "";
}

function locusView(f, teaching = false) {
  const loc = f.spec.localization || {};
  const chrom = loc.chromosome || f.probes[0]?.chromosome;
  const pieces = localizationPieces(f.maps, chrom, "band");
  const reveal = teaching || (state.session?.instructionMode === "practice" && state.session?.pedagogy?.revealLabels);
  const highlight = teaching ? loc.expected : null;
  return `
    <div class="assembly-stage">
      <div class="ideo-column">
        ${ideogramSVG(pieces, { width: 180, height: 560, showLabels: reveal, highlightId: highlight })}
        <p class="ideo-caption">Click a band, or name the locus. Map from chromosome-maps.json.</p>
      </div>
      <div class="assembly-copy">
        <h3>Where does this probe hybridize?</h3>
        <p>${escapeHtml(f.probes.find((p) => p.probe_id === loc.probe_id)?.description || "Identify the cytogenetic location of the probe.")}</p>
        <p class="muted">${teaching ? "The address is highlighted while the names are visible." : "Place the probe from the chromosome, arm, and band. The answer is not highlighted."}</p>
        ${teaching ? "" : `<label class="stack">Complete locus
          <input id="fish-loc" class="iscn-input" value="${escapeHtml(f.localization.locus)}" placeholder="chromosome, arm, band" />
        </label>
        <div class="locus-grid">
          ${selectField("fish-loc-chr", "Chromosome", f.localization.chromosome, SLOT_IDS)}
          ${selectField("fish-loc-arm", "Arm (p or q)", f.localization.arm, ["p", "q"])}
          ${selectField("fish-loc-band", "Band", f.localization.band, BAND_DESIGNATIONS)}
        </div>
        ${f.localization.placedId ? `<p>Selected segment: <code>${escapeHtml(f.localization.placedId)}</code></p>` : ""}`}
      </div>
    </div>`;
}

function typeView(f) {
  const a = f.probeType;
  const help = state.session?.instructionMode === "practice" && state.session?.pedagogy?.revealLabels;
  return `
    <div class="assembly-copy">
      <h3>Probe strategy</h3>
      <p>Identify what this assay can tell you from chromosome structure — not a memorized color combination.</p>
      <label class="stack">Probe type
        <select id="fish-ptype">
          <option value="">Select…</option>
          ${PROBE_TYPES.map((t) => `<option value="${t}" ${a.type === t ? "selected" : ""}>${t}</option>`).join("")}
        </select>
      </label>
      ${selectField("fish-ptarget", "What does the probe target?", a.target, PROBE_TARGETS)}
      ${selectField("fish-pdetect", "What abnormality class is it designed to detect?", a.detects, PROBE_DETECTS)}
      ${selectField("fish-pnorm", "Normal signal pattern", a.normal_pattern, PROBE_NORMAL_PATTERNS)}
      ${help ? `<p class="muted">${escapeHtml(f.probes.map((p) => `${p.probe_name} (${p.fluorophore}) at ${p.target_locus}`).join(" · "))}</p>` : ""}
    </div>`;
}

function strategyView(f) {
  const help = state.session?.instructionMode === "practice" && state.session?.pedagogy?.revealLabels;
  return `
    <div class="assembly-copy">
      <h3>Choose a FISH strategy</h3>
      <p>Given the cytogenetic question in this case, which probe class is appropriate?</p>
      ${state.session?.instructionMode === "learn" ? `<p class="muted">Use the distinction from the previous screen. The correct choice is not marked.</p>` : ""}
      <fieldset>
        <legend>Most appropriate strategy</legend>
        ${PROBE_STRATEGIES.map((s) => `<label class="check"><input type="radio" name="fish-strategy" value="${escapeHtml(s)}" ${f.strategy.choice === s ? "checked" : ""}/> ${escapeHtml(s)}</label>`).join("")}
      </fieldset>
      ${help ? `<p class="muted">Choose the assay that answers the question. Expected signal patterns are scored when you interpret the nuclei.</p>` : ""}
    </div>`;
}

function demoView(f) {
  if (state.session?.instructionMode !== "learn") return assaySetup(f);
  return learnDemo(f);
}

function assaySetup(f) {
  return `
    <div class="assembly-copy">
      <p class="group-label">Assay</p>
      ${probeLegend(f)}
      ${sexContext(f)}
      <p class="muted">Count the signals in the nuclei. The expected abnormal pattern is not shown.</p>
    </div>`;
}

function probeLegend(f) {
  const rows = (f.probes || []).map((p) => `<li><strong>${escapeHtml(p.fluorophore || "probe")}</strong> = ${escapeHtml(p.probe_name)} at ${escapeHtml(p.target_locus)}</li>`);
  return rows.length ? `<ul class="comp-list">${rows.join("")}</ul>` : "";
}

function sexContext(f) {
  const loci = new Set((f.probes || []).map((p) => p.target_locus));
  if (!loci.has("Xcen") || !loci.has("Ycen")) return "";
  return `<p>Green is the X centromere and red is the Y centromere. A normal female cell also has no Y signal, so absence of Y alone is not the abnormal finding.</p>`;
}

function learnDemo(f) {
  const assay = f.spec.assay_type;
  const cutoff = f.spec.case_specific_cutoff || {};
  const normal = cutoff.normal_counts;
  const abnormal = cutoff.abnormal_counts;
  if (assay === "break-apart") {
    return `
      <div class="assembly-copy">
        ${probeLegend(f)}
        <div class="pair-art">
          <div><p class="group-label">Intact</p>${drawCounts({ fusion: 1 }, 120)}<p>Flanking probes stay together.</p></div>
          <div><p class="group-label">Rearranged</p>${drawCounts({ red: 1, green: 1 }, 120)}<p>The same probes separate. This does not name a partner chromosome.</p></div>
        </div>
        <p>The nuclei you score next are not labeled.</p>
      </div>`;
  }
  if (assay === "dual-fusion" && normal && abnormal) {
    return `
      <div class="assembly-copy">
        ${probeLegend(f)}
        <p>These probes start on different chromosomes. A normal nucleus keeps the colors apart.</p>
        <div class="pair-art">
          <div><p class="group-label">Normal for this probe pair</p>${drawCounts(normal, 120)}<p>${escapeHtml(describeCounts(normal))}</p></div>
          <div><p class="group-label">Rearranged for this probe pair</p>${drawCounts(abnormal, 120)}<p>${escapeHtml(describeCounts(abnormal))}. A fusion is the two loci sitting together. This count belongs to this assay, not to every dual-fusion test.</p></div>
        </div>
        <p>The nuclei you score next are not labeled.</p>
      </div>`;
  }
  if (assay === "deletion" && normal && abnormal) {
    return `
      <div class="assembly-copy">
        ${probeLegend(f)}
        <div class="pair-art">
          <div><p class="group-label">Normal</p>${drawCounts(normal, 120)}<p>${escapeHtml(describeCounts(normal))}</p></div>
          <div><p class="group-label">Deletion</p>${drawCounts(abnormal, 120)}<p>${escapeHtml(describeCounts(abnormal))}. The control stays. The target is lost.</p></div>
        </div>
        <p>The nuclei you score next are not labeled.</p>
      </div>`;
  }
  if (sexContext(f) && normal && abnormal) {
    return `
      <div class="assembly-copy">
        ${probeLegend(f)}
        ${sexContext(f)}
        <div class="pair-art">
          <div><p class="group-label">Normal for this assay</p>${drawCounts(normal, 120)}<p>${escapeHtml(describeCounts(normal, true))}</p></div>
          <div><p class="group-label">Abnormal for this assay</p>${drawCounts(abnormal, 120)}<p>${escapeHtml(describeCounts(abnormal, true))}. Decide from the X count as well as the Y count.</p></div>
        </div>
        <p>The nuclei you score next are not labeled.</p>
      </div>`;
  }
  const copies = Number(abnormal?.green || abnormal?.red || 0);
  return `
    <div class="assembly-copy">
      ${probeLegend(f)}
      <p>Enumeration asks how many copies of this target are in the nucleus.</p>
      <div class="pair-art">
        <div><p class="group-label">Disomy</p>${drawCounts(normal || { green: 2 }, 120)}<p>Two signals, one for each copy.</p></div>
        <div><p class="group-label">Abnormal count</p>${drawCounts(abnormal || { green: 3 }, 120)}<p>${copies ? `${copies} signals means ${copies} copies of this chromosome.` : "Count the signals you see."}</p></div>
      </div>
      <p>The nuclei you score next are not labeled.</p>
    </div>`;
}

function describeCounts(counts, keepZero = false) {
  return Object.entries(counts || {})
    .filter(([, n]) => keepZero || Number(n) > 0)
    .map(([type, n]) => `${Number(n)} ${type}`)
    .join(", ");
}

function drawCounts(counts, cx) {
  return nucleusSVG(demoNucleus(counts, cx), { width: 240, height: 280, showLabels: true, demo: true });
}

function demoNucleus(counts, cx) {
  const signals = [];
  let i = 0;
  for (const [type, raw] of Object.entries(counts || {})) {
    const n = Number(raw) || 0;
    for (let k = 0; k < n; k++) {
      const col = i % 3;
      const row = Math.floor(i / 3);
      signals.push({ id: `${type}-${i}`, type, x: cx - 28 + col * 28, y: 124 + row * 28 });
      i += 1;
    }
  }
  return { cx, cy: 150, rx: 72, ry: 78, expected_signals: signals };
}

function scopeView(f) {
  const { spec, student, index } = currentNucleus(f);
  if (!spec) return `<p class="muted">No nuclei in this case.</p>`;
  const fields = countFieldsFor(f.spec.assay_type, f.spec.count_fields);
  const help = state.session?.instructionMode === "practice" && state.session?.pedagogy?.revealLabels;
  const demonstrate = false;
  const channels = f.spec.channels || ["dapi", "red", "green", "merge"];
  return `
    <div class="fish-scope-layout">
      <div>
        <div class="channel-bar" role="group" aria-label="Fluorescence channels">
          ${channels.map((ch) => `<button type="button" class="btn ${f.activeChannel === ch ? "primary" : ""}" data-action="fish-channel" data-ch="${ch}">${ch.toUpperCase()}</button>`).join("")}
        </div>
        <div class="fish-canvas" data-fish-canvas="1">${nucleusSVG(spec, {
          activeChannel: f.activeChannel,
          marks: student.marks,
          selectedId: f.selectedMark,
          showLabels: demonstrate || help === true,
          demo: true,
        })}</div>
        <div class="nucleus-strip">
          ${f.spec.nuclei.map((n, i) => `<button type="button" class="nuc-thumb ${i === index ? "on" : ""}" data-action="fish-goto-n" data-index="${i}">
            ${nucleusSVG(n, { activeChannel: "merge", marks: f.nuclei[i]?.marks || [], showLabels: false, demo: true })}
            <span>Nucleus ${i + 1} of ${f.spec.nuclei.length}</span>
          </button>`).join("")}
        </div>
        <div class="piece-nav sig-palette" role="group" aria-label="Identify and count signals">
          ${["red", "green", "fusion", "split", "uncertain"].filter((t) => fields.includes(t) || t === "uncertain").map((t) => `
            <button type="button" class="sig-btn ${t} ${f.classifyMode === t ? "on" : ""}" data-action="fish-classify" data-type="${t}">${signalLabel(t)}</button>`).join("")}
        </div>
        <div class="piece-nav">
          <button type="button" class="btn" data-action="fish-reclass">Reclassify selected</button>
          <button type="button" class="btn" data-action="fish-remove">Remove selected</button>
          <button type="button" class="btn" data-action="fish-reset-n">Reset nucleus</button>
        </div>
      </div>
        <div class="assembly-copy">
        ${assaySetup(f)}
        <p class="group-label">Nucleus ${index + 1} of ${f.spec.nuclei.length}${demonstrate ? " · demonstration" : ""}</p>
        ${demonstrate ? `<p>This nucleus is labeled so you can see a signal, a fusion, and what a scorable nucleus looks like. Score the later nuclei without those labels. A clipped edge, overlap, or faint paint is an artifact.</p>` : ""}
        <div class="piece-nav">
          <button type="button" class="btn" data-action="fish-prev-n" ${index === 0 ? "disabled" : ""}>Previous nucleus</button>
          <button type="button" class="btn" data-action="fish-next-n" ${index >= f.spec.nuclei.length - 1 ? "disabled" : ""}>Next nucleus</button>
        </div>
        <fieldset>
          <legend>Scorable or unscorable?</legend>
          <label class="check"><input type="radio" name="fish-scorable" value="true" ${student.scorable === "true" || student.scorable === true ? "checked" : ""}/> Scorable</label>
          <label class="check"><input type="radio" name="fish-scorable" value="false" ${student.scorable === "false" || student.scorable === false ? "checked" : ""}/> Unscorable</label>
        </fieldset>
        ${student.scorable === "false" || student.scorable === false ? `
          <label class="stack">Why unscorable?
            <select id="fish-artifact">
              <option value="">Select…</option>
              ${["overlapping_nuclei", "truncated_nucleus", "weak_signals", "excessive_background", "ambiguous_signals", "poor_nuclear_morphology"].map((a) => `<option value="${a}" ${student.artifact === a ? "selected" : ""}>${a.replace(/_/g, " ")}</option>`).join("")}
            </select>
          </label>` : ""}
        <div class="locus-grid">
          ${fields.map((fld) => selectField(`fish-count-${fld}`, signalLabel(fld), student.counts[fld], SIGNAL_COUNT_OPTIONS)).join("")}
        </div>
        <p class="muted">Click fluorescent signals, then enter counts. Red only and green only are single-color spots. A fusion counts once. Do not force a count on an unscorable nucleus.</p>
        ${student.marks.length ? `<p class="group-label">Identified signals</p>
          <ul class="fish-mark-list">${student.marks.map((m) => `<li>
            <button type="button" class="btn ${f.selectedMark === m.id ? "primary" : ""}" data-action="fish-select-mark" data-id="${escapeHtml(m.id)}">${escapeHtml(signalLabel(m.type))}</button>
          </li>`).join("")}</ul>` : "<p class='muted'>No signals marked yet. Click a fluorescent spot or enter counts below.</p>"}
        ${countTable(f)}
      </div>
    </div>`;
}

function countTable(f) {
  const fields = countFieldsFor(f.spec.assay_type, f.spec.count_fields);
  const head = ["Nucleus", ...fields.map((x) => signalLabel(x)), "Scorable"];
  return `<table class="case-table fish-table"><thead><tr>${head.map((h) => `<th>${h}</th>`).join("")}</tr></thead>
    <tbody>${f.nuclei.map((n, i) => `<tr class="${i === f.nucleusIndex ? "on" : ""}">
      <td><button type="button" class="btn" data-action="fish-goto-n" data-index="${i}">${i + 1}</button></td>
      ${fields.map((fld) => `<td>${escapeHtml(n.counts[fld] ?? "")}</td>`).join("")}
      <td>${n.scorable === "" ? "—" : (n.scorable === "true" || n.scorable === true ? "yes" : "no")}</td>
    </tr>`).join("")}</tbody></table>`;
}

function interpretView(f) {
  const summary = summarizeEnumeration(f);
  const opts = f.spec.interpretation_options || [];
  const help = state.session?.instructionMode === "practice" && state.session?.pedagogy?.revealLabels;
  const assembly = state.session.caseData.assembly;
  const arrangement = f.spec.include_schematic && f.maps && assembly?.chromosome
    ? predictedProbeArrangement(f.maps, f.probes, assembly.transform, assembly.chromosome)
    : null;
  return `
    <div class="assembly-copy">
      <h3>Pattern and interpretation</h3>
      <p>Summary is calculated from <em>your</em> nucleus records. This case does not apply a universal FISH positivity cutoff.</p>
      <ul class="comp-list">
        <li>Nuclei reviewed: ${summary.total}</li>
        <li>Marked scorable: ${summary.scorable}</li>
        ${summary.percent != null && state.session?.instructionMode !== "assessment" ? `<li>Your percent of scorable nuclei matching this assay's recorded pattern: <strong>${summary.percent}%</strong></li>` : ""}
      </ul>
      ${f.spec.assay_type === "amplification" ? `
        <div class="locus-grid">
          ${selectField("fish-ratio-t", "Target count", f.ratio.target, RATIO_COUNT_OPTIONS)}
          ${selectField("fish-ratio-r", "Reference count", f.ratio.reference, RATIO_COUNT_OPTIONS)}
        </div>
        <p>Ratio (your calculation): ${ratioText(f)}</p>` : ""}
      <fieldset>
        <legend>Cytogenetic interpretation</legend>
        ${opts.map((o) => `<label class="check"><input type="radio" name="fish-interp" value="${escapeHtml(o)}" ${f.interpretation === o ? "checked" : ""}/> ${escapeHtml(labelInterp(o))}</label>`).join("")}
      </fieldset>
      ${help && arrangement ? `<p class="muted">Probe hits after the case transform: ${escapeHtml(arrangement.map((a) => `${a.probe.probe_name}: ${a.hits.map((h) => h.label).join(",") || "none"}`).join(" · "))}</p>` : ""}
    </div>`;
}

function ratioText(f) {
  const t = Number(f.ratio.target);
  const r = Number(f.ratio.reference);
  if (!t || !r) return "not calculated";
  return (t / r).toFixed(2);
}

function labelInterp(o) {
  return o.replace(/_/g, " ");
}

export function fishControls(step) {
  const buttons = [];
  if (step === "fish_demo") return `<button type="button" class="btn primary" data-action="continue-step">Continue</button>`;
  if (step === "fish_scope") buttons.push(`<button type="button" class="btn" data-action="fish-check">Check nucleus</button>`);
  if (step === "probe_locus") buttons.push(`<button type="button" class="btn" data-action="fish-loc-check">Check locus</button>`);
  if (step === "probe_type") buttons.push(`<button type="button" class="btn" data-action="fish-type-check">Check probe type</button>`);
  if (step === "probe_strategy") buttons.push(`<button type="button" class="btn" data-action="fish-strat-check">Check strategy</button>`);
  if (step === "fish_interpret") buttons.push(`<button type="button" class="btn" data-action="fish-int-check">Check interpretation</button>`);
  if (state.session?.instructionMode !== "assessment") buttons.push(`<button type="button" class="btn" data-action="hint">Hint</button>`);
  buttons.push(`<button type="button" class="btn primary" data-action="submit-step">Submit</button>`);
  return buttons.join("");
}

export function handleFishAction(action, el) {
  const s = state.session;
  if (!s?.fish) return false;
  const f = s.fish;
  if (action === "fish-classify") {
    patchSession({ fish: { ...f, classifyMode: el.getAttribute("data-type") || "red" } });
    return true;
  }
  if (action === "fish-channel") {
    patchSession({ fish: { ...f, activeChannel: el.getAttribute("data-ch") || "merge" } });
    return true;
  }
  if (action === "fish-prev-n") {
    patchSession({ fish: { ...f, nucleusIndex: Math.max(0, f.nucleusIndex - 1), selectedMark: null } });
    return true;
  }
  if (action === "fish-next-n") {
    patchSession({ fish: { ...f, nucleusIndex: Math.min(f.spec.nuclei.length - 1, f.nucleusIndex + 1), selectedMark: null } });
    return true;
  }
  if (action === "fish-goto-n") {
    patchSession({ fish: { ...f, nucleusIndex: Number(el.getAttribute("data-index")) || 0, selectedMark: null } });
    return true;
  }
  if (action === "fish-reset-n") {
    patchSession({ fish: resetNucleus(f) });
    return true;
  }
  if (action === "fish-remove" && f.selectedMark) {
    patchSession({ fish: removeMark(f, f.selectedMark) });
    return true;
  }
  if (action === "fish-reclass" && f.selectedMark) {
    patchSession({ fish: updateMark(f, f.selectedMark, { type: f.classifyMode }) });
    return true;
  }
  if (action === "fish-select-mark") {
    patchSession({ fish: { ...f, selectedMark: el.getAttribute("data-id") } });
    return true;
  }
  if (action === "fish-check" || (action === "submit-step" && s.steps[s.stepIndex] === "fish_scope")) {
    checkScope(action === "submit-step");
    return action !== "submit-step";
  }
  if (action === "fish-loc-check" || (action === "submit-step" && s.steps[s.stepIndex] === "probe_locus")) {
    checkLocus(action === "submit-step");
    return action !== "submit-step";
  }
  if (action === "fish-type-check" || (action === "submit-step" && s.steps[s.stepIndex] === "probe_type")) {
    checkType(action === "submit-step");
    return action !== "submit-step";
  }
  if (action === "fish-strat-check" || (action === "submit-step" && s.steps[s.stepIndex] === "probe_strategy")) {
    checkStrategy(action === "submit-step");
    return action !== "submit-step";
  }
  if (action === "fish-int-check" || (action === "submit-step" && s.steps[s.stepIndex] === "fish_interpret")) {
    checkInterp(action === "submit-step");
    return action !== "submit-step";
  }
  return false;
}

export function clickFishCanvas(ev) {
  const canvas = ev.target.closest("[data-fish-canvas]");
  if (!canvas) return false;
  const svg = canvas.querySelector("svg");
  if (!svg) return false;
  const pt = svg.createSVGPoint();
  pt.x = ev.clientX;
  pt.y = ev.clientY;
  const ctm = svg.getScreenCTM();
  if (!ctm) return false;
  const loc = pt.matrixTransform(ctm.inverse());
  patchSession({ fish: addMark(state.session.fish, loc.x, loc.y) });
  return true;
}

export function clickFishBand(id) {
  const f = state.session.fish;
  if (!f) return false;
  patchSession({ fish: { ...f, localization: { ...f.localization, placedId: id, locus: f.localization.locus || id } } });
  return true;
}

function writeFb(step, fb, lock = false) {
  const shown = applyMode(state.session, step, fb, { lock });
  state.session.feedback = { ...state.session.feedback, [step]: shown };
}

function checkScope(isSubmit) {
  const s = state.session;
  const f = s.fish;
  s.attempts.fish_scope = (s.attempts.fish_scope || 0) + 1;
  const fields = countFieldsFor(f.spec.assay_type, f.spec.count_fields);
  const idStats = { identified: 0, classified: 0, expected: 0 };
  const quality = { ok: 0, n: 0 };
  const countsOk = { ok: 0, n: 0 };
  f.spec.nuclei.forEach((spec, i) => {
    const st = f.nuclei[i];
    const g = gradeNucleus(st, spec, fields);
    const sig = gradeSignalIdentification(st.marks, spec.expected_signals, f.spec.signal_tolerance || 20);
    idStats.identified += sig.identified;
    idStats.classified += sig.classified;
    idStats.expected += sig.expected;
    quality.n += 1;
    if (g.qualityOk) quality.ok += 1;
    if (spec.scorable) {
      countsOk.n += 1;
      if (g.countsOk) countsOk.ok += 1;
    }
  });
  const nucleusReady = (spec, student) => {
    const g = gradeNucleus(student, spec, fields);
    const sig = gradeSignalIdentification(student.marks, spec.expected_signals, f.spec.signal_tolerance || 20);
    const signalsRequired = Boolean(spec.scorable) && (spec.expected_signals || []).length > 0;
    const signalsOk = !signalsRequired || (sig.identified === sig.expected && sig.classified === sig.expected && sig.extra === 0);
    return g.complete && signalsOk;
  };
  let allComplete = true;
  f.spec.nuclei.forEach((spec, i) => {
    if (!nucleusReady(spec, f.nuclei[i])) allComplete = false;
  });
  if (isSubmit) {
    s.scores.fish_quality = quality;
    s.scores.fish_signals = idStats;
    s.scores.fish_counts = countsOk;
    writeFb("fish_scope", {
      tone: allComplete ? "ok" : "review",
      scored: true,
      title: allComplete ? "Nucleus records are complete." : "One or more nuclei are incomplete or incorrect.",
      body: `Signal identification ${idStats.identified}/${idStats.expected}; classification ${idStats.classified}/${idStats.expected}; scorable nuclei ${quality.ok}/${quality.n}; counts ${countsOk.ok}/${countsOk.n}.`,
    }, true);
    return;
  }
  const { spec, student } = currentNucleus(f);
  const g = gradeNucleus(student, spec, fields);
  const sig = gradeSignalIdentification(student.marks, spec.expected_signals, f.spec.signal_tolerance || 20);
  const extra = `<ul class="comp-list">
    <li>Scorable: <strong>${g.scorable}</strong></li>
    ${g.artifact !== "na" ? `<li>Artifact: <strong>${g.artifact}</strong></li>` : ""}
    ${Object.entries(g.counts).filter(([, v]) => v !== "na").map(([k, v]) => `<li>${signalLabel(k)}: <strong>${v}</strong></li>`).join("")}
    <li>Signals identified: ${sig.identified}/${sig.expected}</li>
    <li>Signals classified: ${sig.classified}/${sig.expected}</li>
  </ul>`;
  const nucleusOk = nucleusReady(spec, student);
  writeFb("fish_scope", {
    tone: nucleusOk ? "ok" : "review",
    scored: true,
    title: nucleusOk ? "This nucleus is complete." : "Review scorability, artifact, or signal counts.",
    body: spec.scorable ? "Compare your counts with the visible signals. Put a fused spot under Fusion. Red only and green only are the single-color spots." : "If the nucleus is unscorable, do not force a count.",
    extra,
  }, false);
}

function checkLocus(isSubmit = false) {
  const s = state.session;
  s.attempts.fish_locus = (s.attempts.fish_locus || 0) + 1;
  const expected = s.fish.spec.localization?.expected;
  const grade = gradeLocalization(s.fish.localization, expected);
  if (grade.ungraded) {
    s.scores.fish_localization = { match: false, ungraded: true, components: {} };
    writeFb("probe_locus", {
      tone: "review",
      title: "No localization key is stored for this probe.",
      body: "This step stays ungraded until the assay names an expected locus.",
    });
    return;
  }
  const placed = s.fish.localization.placedId;
  if (placed && expected && (placed === expected || placed.startsWith(expected))) grade.components.placement = "correct";
  else if (placed) grade.components.placement = "incorrect";
  s.scores.fish_localization = grade;
  const guided = state.session.instructionMode;
  writeFb("probe_locus", {
    tone: grade.match ? "ok" : "review",
    scored: true,
    title: grade.match ? "Locus matches the probe record." : "Band location needs review.",
    body: guided
      ? (grade.match ? "The chromosome, arm, and band match the probe." : "Check the chromosome, then the arm, then the band. The answer is not marked on the map.")
      : "The probe is attached to a chromosome-map segment, not an arbitrary pixel.",
    extra: guided === "assessment" ? "" : `<ul class="comp-list">${Object.entries(grade.components).filter(([, v]) => v !== "na").map(([k, v]) => `<li>${k}: <strong>${v}</strong></li>`).join("")}</ul>`,
  }, isSubmit);
}

function checkType(isSubmit = false) {
  const s = state.session;
  s.attempts.fish_type = (s.attempts.fish_type || 0) + 1;
  const grade = gradeProbeType(s.fish.probeType, s.fish.spec.probe_type_expected);
  s.scores.fish_probe_type = grade;
  if (grade.ungraded) {
    writeFb("probe_type", {
      tone: "review",
      title: "No probe-type key is stored for this assay.",
      body: "This step stays ungraded until the case names the expected probe class.",
    });
    return;
  }
  writeFb("probe_type", {
    tone: grade.match ? "ok" : "review",
    scored: true,
    title: grade.match ? "Probe class is correct." : "Probe class needs review.",
    body: "Type, target, and the question the assay can answer are scored separately.",
    extra: `<ul class="comp-list">${Object.entries(grade.components).filter(([, v]) => v !== "na").map(([k, v]) => `<li>${k}: <strong>${v}</strong></li>`).join("")}</ul>`,
  }, isSubmit);
}

function checkStrategy(isSubmit = false) {
  const s = state.session;
  s.attempts.fish_strategy = (s.attempts.fish_strategy || 0) + 1;
  const ok = gradeStrategy(s.fish.strategy.choice, s.fish.spec.strategy_expected);
  if (!(s.instructionMode === "assessment" && s.pedagogy?.first?.probe_strategy)) s.scores.fish_strategy = ok;
  const copy = strategyFeedback(s.caseData.disease_id, s.fish.strategy.choice, ok.ok);
  const mode = s.instructionMode || "practice";
  const body = mode === "practice" ? copy.practice : copy.learn;
  const title = ok.ok ? "Recorded." : (mode === "learn" ? "Use the distinction you just saw" : "Try again");
  writeFb("probe_strategy", {
    tone: ok.detail === "ungraded" || !ok.ok ? "review" : "ok",
    scored: true,
    title: ok.detail === "ungraded" ? "No strategy key is stored for this assay." : title,
    body: ok.detail === "ungraded" ? "This step stays ungraded until the assay names a strategy." : body,
  }, isSubmit);
}

function checkInterp(isSubmit) {
  const s = state.session;
  s.attempts.fish_interpret = (s.attempts.fish_interpret || 0) + 1;
  const g = gradeInterpretation(s.fish.interpretation, s.fish.spec.expected_interpretation);
  s.scores.fish_interpretation = g;
  const summary = summarizeEnumeration(s.fish);
  const guided = s.instructionMode;
  writeFb("fish_interpret", {
    tone: g.ok ? "ok" : "review",
    scored: true,
    title: g.detail === "ungraded" ? "No interpretation key is stored for this assay." : (g.ok ? "Interpretation matches the curated case." : "Interpretation needs review."),
    body: guided === "learn"
      ? (g.ok ? "The pattern follows from the signal relationship you scored." : "Tie the pattern back to whether the two loci are together or apart. The diagnosis is not the first step.")
      : (guided === "practice"
        ? (g.ok ? "That matches the signals you recorded." : "Compare the pattern you counted with fusion versus signals that stayed apart.")
        : (isSubmit ? (s.caseData.plain_language_interpretation || "See the case explanation on the summary page.") : "The expected interpretation is withheld until you submit this step.")),
    extra: guided === "assessment" ? "" : (summary.percent != null ? `<p>Your pattern percentage: ${summary.percent}%</p>` : ""),
  }, isSubmit);
}

export function readFishFields(ev) {
  const f = state.session?.fish;
  if (!f) return;
  const t = ev.target;
  const id = t.id;
  if (id === "fish-class") f.classifyMode = t.value;
  if (id === "fish-loc") f.localization.locus = t.value;
  if (id === "fish-loc-chr") f.localization.chromosome = t.value;
  if (id === "fish-loc-arm") f.localization.arm = t.value;
  if (id === "fish-loc-band") f.localization.band = t.value;
  if (id === "fish-ptype") f.probeType.type = t.value;
  if (id === "fish-ptarget") f.probeType.target = t.value;
  if (id === "fish-pdetect") f.probeType.detects = t.value;
  if (id === "fish-pnorm") f.probeType.normal_pattern = t.value;
  if (t.name === "fish-strategy") f.strategy.choice = t.value;
  if (t.name === "fish-scorable") {
    const { index } = currentNucleus(f);
    f.nuclei[index].scorable = t.value;
  }
  if (id === "fish-artifact") {
    const { index } = currentNucleus(f);
    f.nuclei[index].artifact = t.value;
  }
  if (id && id.startsWith("fish-count-")) {
    const fld = id.replace("fish-count-", "");
    const { index } = currentNucleus(f);
    f.nuclei[index].counts[fld] = t.value;
  }
  if (t.name === "fish-interp") f.interpretation = t.value;
  if (id === "fish-ratio-t") f.ratio.target = t.value;
  if (id === "fish-ratio-r") f.ratio.reference = t.value;
}
