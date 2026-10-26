import { BAND_DESIGNATIONS, RATIO_COUNT_OPTIONS, SLOT_IDS, escapeHtml, selectField } from "./util.js?v=20261006j";
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
  expectedSignalRelationship,
  localizationPieces,
  nucleusRecordStatus,
  removeMark,
  resetNucleus,
  summarizeEnumeration,
  updateMark,
} from "./fish.js?v=20261025ex1";
import { nucleusSVG } from "./fish-microscopy.js?v=20261024e";
import { buildScene, compareToKey, initWorkstation, registerWorkstationHost, workstationHTML } from "./fish-workstation.js?v=20261025fish1";
import { ideogramSVG } from "./ideogram.js?v=20261024j";
import { parseBandLabel, resolutionForLocus } from "./banding.js?v=20261024c";
import { applyStep, isTeachStep, strategyFeedback } from "./pedagogy.js?v=20261025dropmodes";

const SIGNAL_LABELS = {
  red: "Red only",
  green: "Green only",
  fusion: "Fusion",
  split: "Split",
  uncertain: "Uncertain",
};

const STRATEGY_GUIDANCE = {
  "chromosome enumeration": "Count copies of a chromosome using a chromosome-specific target; this does not test for a rearrangement.",
  "loss of a specific locus": "Compare a target region with a reference signal to assess copy loss at that location.",
  "rearrangement of a particular locus": "Use probes flanking one locus to detect separation; this does not identify the partner.",
  "fusion between two defined loci": "Mark two known loci, usually on different chromosomes, and test whether their signals come together.",
  "chromosome origin": "Determine which chromosome a large added or exchanged segment came from; small changes may be below the method’s resolution.",
  "chromosome-wide visualization": "Paint chromosome material to reveal large exchanged segments or chromosome origin, not a small gene-level change.",
};

function signalLabel(type) {
  return SIGNAL_LABELS[type] || type;
}

function channelLabel(channel) {
  if (channel === "dapi") return "DAPI — nuclear counterstain";
  if (channel === "red") return "Red";
  if (channel === "green") return "Green";
  if (channel === "merge") return "Merge";
  return String(channel || "").toUpperCase();
}

function countOnlyAssay(f) {
  return f?.spec?.assay_type === "enumeration";
}

export function isFishStep(step) {
  return ["fish_demo", "probe_locus", "probe_type", "probe_strategy", "fish_scope", "fish_field", "fish_interpret"].includes(applyStep(step));
}

export function fishView(step) {
  const f = state.session.fish;
  if (!f) return `<p class="muted">This case has no FISH assay record.</p>`;
  const applied = applyStep(step);
  const teaching = isTeachStep(step) && state.session?.module !== "disease";
  return `
    <div class="fish-wrap">
      ${f.spec.synthetic_images ? `<p class="asset-banner">${applied === "probe_locus" ? "Demonstration chromosome ideogram — not a specimen image." : "Synthetic demonstration fluorescence — not authentic clinical microscopy."}</p>` : ""}
      ${teaching ? fishTeachGraphic(applied, f) : ""}
      ${!teaching && applied === "fish_demo" ? demoView(f) : ""}
      ${!teaching && applied === "probe_locus" ? locusView(f) : ""}
      ${!teaching && applied === "probe_type" ? typeView(f) : ""}
      ${!teaching && applied === "probe_strategy" ? strategyView(f) : ""}
      ${!teaching && applied === "fish_scope" ? scopeView(f) : ""}
      ${!teaching && applied === "fish_field" ? fieldView(f) : ""}
      ${!teaching && applied === "fish_interpret" ? interpretView(f) : ""}
    </div>`;
}

function fishTeachGraphic(step, f) {
  const exercise = state.session?.exercise;
  if (step === "probe_locus") return locusView(f, true);
  if (exercise === "enumeration") {
    const normal = { cx: 120, cy: 150, rx: 70, ry: 74, expected_signals: [
      { id: "n1", type: "green", x: 100, y: 140 },
      { id: "n2", type: "green", x: 145, y: 168 },
    ] };
    const gain = { cx: 120, cy: 150, rx: 70, ry: 74, expected_signals: [
      { id: "g1", type: "green", x: 92, y: 128 },
      { id: "g2", type: "green", x: 128, y: 158 },
      { id: "g3", type: "green", x: 152, y: 132 },
    ] };
    return `<div class="pair-art">
      <div><p class="group-label">Two copies</p>${nucleusSVG(normal, { width: 240, height: 280, showLabels: false, demo: false })}<p>Two separate green signals: one for each copy of the target chromosome.</p></div>
      <div><p class="group-label">Three copies</p>${nucleusSVG(gain, { width: 240, height: 280, showLabels: false, demo: false })}<p>Three separate green signals indicate three copies.</p></div>
    </div>
    <p class="ideo-caption">The nuclei you score next are not labeled. Overlapping outlines are unscorable.</p>`;
  }
  if (exercise === "break-apart") {
    const intact = { cx: 120, cy: 150, rx: 70, ry: 74, expected_signals: [{ id: "f", type: "fusion", x: 120, y: 150 }] };
    const split = { cx: 120, cy: 150, rx: 70, ry: 74, expected_signals: [
      { id: "r", type: "red", x: 95, y: 132 },
      { id: "g", type: "green", x: 148, y: 172 },
    ] };
    return `<div class="pair-art">
      <div><p class="group-label">Intact locus</p>${nucleusSVG(intact, { width: 240, height: 280, showLabels: false, demo: false })}<p>Red and green probes overlap at the intact locus.</p></div>
      <div><p class="group-label">Rearranged locus</p>${nucleusSVG(split, { width: 240, height: 280, showLabels: false, demo: false })}<p>Separated flanking signals indicate locus disruption; this probe does not name the partner.</p></div>
    </div>`;
  }
  if (exercise === "dual-fusion") {
    const cutoff = f.spec.case_specific_cutoff || {};
    if (!cutoff.normal_counts || !cutoff.abnormal_counts) return "";
    return `<div class="pair-art">
      <div><p class="group-label">Normal for this probe pair</p>${drawCounts(cutoff.normal_counts, 120)}<p>Red and green stay apart: the two target loci sit on different chromosomes.</p></div>
      <div><p class="group-label">Rearranged for this probe pair</p>${drawCounts(cutoff.abnormal_counts, 120)}<p>${escapeHtml(describeCounts(cutoff.abnormal_counts))}. A fusion is a red and a green signal overlapping. These counts belong to this assay design, not to every dual-fusion test.</p></div>
    </div>
    <p class="ideo-caption">At the microscope, check the red and green channels separately to confirm that a yellow signal contains both colors.</p>`;
  }
  if (exercise === "quality") return artifactGallery();
  return "";
}

function artifactGallery() {
  const tile = (label, caption, spec) => `<figure class="fish-tile">
    <p class="group-label">${label}</p>
    ${nucleusSVG(spec, { width: 220, height: 168, showLabels: false, demo: false })}
    <figcaption>${caption}</figcaption>
  </figure>`;
  const clear = { cx: 110, cy: 86, rx: 52, ry: 46, expected_signals: [
    { id: "a", type: "green", x: 90, y: 74 },
    { id: "b", type: "green", x: 132, y: 102 },
  ] };
  return `<div class="fish-gallery">
    ${tile("Scorable", "One intact outline. The signals are separate and belong to this cell.", clear)}
    ${tile("Overlapping nuclei", "Two outlines meet. A signal in the shared area cannot be assigned to one cell.", {
      cx: 78, cy: 78, rx: 46, ry: 42,
      overlap: { cx: 132, cy: 104, rx: 44, ry: 40 },
      expected_signals: [{ id: "o", type: "green", x: 108, y: 92 }],
    })}
    ${tile("Truncated nucleus", "The outline is cut off by the edge of the field.", {
      cx: 206, cy: 86, rx: 70, ry: 52,
      expected_signals: [{ id: "t", type: "green", x: 168, y: 80 }],
    })}
    ${tile("Weak signals", "Only faint, diffuse halos, even with brightness raised. Exclude. Dim signals that are still distinct spots can be scored.", {
      ...clear,
      presentation: "weak",
    })}
    ${tile("Closely spaced signals", "Two spots closer than one signal diameter count once in an enumeration assay. Apply the assay's own rule: in a break-apart assay, red and green that close are a fusion.", {
      cx: 110, cy: 86, rx: 52, ry: 46,
      expected_signals: [
        { id: "c1", type: "green", x: 94, y: 76 },
        { id: "c2", type: "green", x: 101, y: 79 },
        { id: "c3", type: "green", x: 134, y: 104 },
      ],
    })}
    ${tile("Excessive background", "Extra paint is scattered through the field, so the probe spots cannot be picked out.", {
      ...clear,
      background: [
        { x: 28, y: 36, r: 3 },
        { x: 48, y: 128, r: 4.5 },
        { x: 96, y: 40, r: 3.2 },
        { x: 150, y: 132, r: 4 },
        { x: 186, y: 48, r: 3.4, color: "#e24b4b" },
        { x: 70, y: 96, r: 3 },
        { x: 124, y: 58, r: 2.8 },
        { x: 196, y: 112, r: 3.6 },
      ],
    })}
    ${tile("Ambiguous signals", "The paint is smeared, so the spots cannot be separated into a count.", {
      cx: 110, cy: 86, rx: 52, ry: 46,
      presentation: "ambiguous",
      expected_signals: [{ id: "s", type: "green", x: 102, y: 82 }],
    })}
    ${tile("Poor nuclear morphology", "The outline is ragged and broken, not one intact nucleus.", {
      cx: 104, cy: 82, rx: 48, ry: 40,
      presentation: "irregular",
      fragment: { cx: 168, cy: 124, rx: 16, ry: 12 },
      expected_signals: [{ id: "p", type: "green", x: 96, y: 78 }],
    })}
  </div>`;
}

function locusView(f, teaching = false) {
  const loc = f.spec.localization || {};
  const chrom = loc.chromosome || f.probes[0]?.chromosome;
  const probe = f.probes.find((p) => p.probe_id === loc.probe_id) || f.probes[0];
  const needsSub = parseBandLabel(loc.expected)?.subband != null;
  const pieces = localizationPieces(f.maps, chrom, resolutionForLocus(loc.expected));
  const reveal = teaching;
  const highlight = teaching ? loc.expected : null;
  const place = needsSub
    ? "Click the sub-band slice, or name chromosome, arm, region, band, and sub-band."
    : "Place the probe from the chromosome, arm, and band.";
  const probeWhy = probeLocationRationale(f, probe);
  return `
    <div class="assembly-stage fish-locus-stage">
      <div class="ideo-column">
        ${ideogramSVG(pieces, { width: 260, height: 400, barWidth: 82, showLabels: reveal, highlightId: highlight })}
        <p class="ideo-caption">Click a band, or name the locus. Map from chromosome-maps.json.</p>
      </div>
      <div class="assembly-copy">
        <h3>Where does this probe hybridize?</h3>
        <p>${escapeHtml(probe?.description || "Identify the cytogenetic location of the probe.")}</p>
        <aside class="probe-purpose-note"><strong>Why this probe is here</strong><p>${escapeHtml(probeWhy)}</p></aside>
        <p class="muted">${teaching ? "The address is highlighted while the names are visible." : `${place} The answer is not highlighted.`}</p>
        ${teaching ? "" : `<label class="stack">Complete locus
          <input id="fish-loc" class="iscn-input" value="${escapeHtml(f.localization.locus)}" placeholder="${needsSub ? "e.g. 2q31.1" : "e.g. 4p16"}" />
        </label>
        <div class="locus-grid">
          ${selectField("fish-loc-chr", "Chromosome", f.localization.chromosome, SLOT_IDS)}
          ${selectField("fish-loc-arm", "Arm (p or q)", f.localization.arm, ["p", "q"])}
          ${selectField("fish-loc-band", "Band", f.localization.bandLabel || "", BAND_DESIGNATIONS)}
        </div>
        ${f.localization.placedId ? `<p>Selected segment: <code>${escapeHtml(f.localization.placedId)}</code></p>` : ""}`}
      </div>
    </div>`;
}

function probeLocationRationale(fish, probe) {
  if (!probe) return "A probe’s address identifies the DNA sequence its signal represents, so the result can be interpreted in the context of the case question.";

  const name = probe.probe_name || "This probe";
  const locus = probe.target_locus || fish.spec.localization?.expected || "the selected locus";
  const partners = fish.probes.filter((item) => item.probe_id !== probe.probe_id);
  const assay = fish.spec.assay_type;

  if (assay === "dual-fusion" && partners.length) {
    const partnerText = partners.map((item) => `${item.probe_name} at ${item.target_locus}`).join(" and ");
    return `${name} marks ${locus} (${probe.description?.match(/\(([^)]+)\)/)?.[1] || "the target locus"}). In this assay it is paired with ${partnerText}. The loci are normally on different chromosomes; placing each probe at its known address lets the assay test whether they have been brought together by a rearrangement. The address tells you what a signal represents; the fusion pattern is interpreted in a later step.`;
  }

  if (assay === "break-apart") {
    return `${name} marks the ${probe.fluorophore} flank of the locus at ${locus}. Its matching flank probe marks the other side of that same locus. Keeping both addresses tied to this locus lets you see whether the flanks remain together or have separated; this design does not identify a rearrangement partner.`;
  }

  if (assay === "enumeration" && probe.probe_type === "centromeric") {
    const chromosome = probe.chromosome || fish.spec.localization?.chromosome;
    return `${name} binds repeated centromeric DNA at ${locus} on chromosome ${chromosome}. The centromere is used here as a marker for each copy of that chromosome, so its signals support a copy count. It is not a probe for a structural breakpoint or a gene-specific rearrangement.`;
  }

  if (assay === "deletion" && partners.length) {
    const partner = partners[0];
    return `${name} marks the ${locus} region being checked for loss. The assay also includes ${partner.probe_name} at ${partner.target_locus} as a comparison signal. Reading the target alongside that reference helps distinguish loss of the region of interest from a generally weak or missing signal.`;
  }

  return `${name} is designed to bind the DNA sequence at ${locus}. Locating it on the chromosome map shows exactly which region its signal represents in this case.`;
}

function typeView(f) {
  const a = f.probeType;
  const guided = state.session?.instructionMode === "learn";
  return `
    <div class="assembly-copy">
      ${fishCaseBrief()}
      <h3>Choose a probe type</h3>
      <p>Use the case question to decide what the probe must detect. You are choosing the probe design, not predicting a signal pattern.</p>
      ${probeTypeGuide(guided)}
      <label class="stack">Probe type
        <select id="fish-ptype">
          <option value="">Select…</option>
          ${PROBE_TYPES.map((t) => `<option value="${t}" ${a.type === t ? "selected" : ""}>${t}</option>`).join("")}
        </select>
      </label>
      ${selectField("fish-ptarget", "What does the probe target?", a.target, PROBE_TARGETS)}
      ${selectField("fish-pdetect", "What abnormality class is it designed to detect?", a.detects, PROBE_DETECTS)}
      ${selectField("fish-pnorm", "Normal signal pattern", a.normal_pattern, PROBE_NORMAL_PATTERNS)}
    </div>`;
}

function strategyView(f) {
  const guided = state.session?.instructionMode === "learn";
  const targetList = f.probes?.length ? probeLegend(f) : "";
  return `
    <div class="assembly-copy">
      ${fishCaseBrief()}
      <h3>Choose a FISH strategy</h3>
      <p>Translate the case into a question: count copies, detect loss, check whether one locus is rearranged, or test whether two known loci have joined.</p>
      ${targetList ? `<section class="fish-strategy-targets"><p class="group-label">Probe targets available in this case</p>${targetList}<p>These targets show what the assay can see. Choose the biological question they can answer; do not infer the result from probe color alone.</p></section>` : ""}
      ${guided ? `<p class="muted">Use the case clues and target locations. The correct choice is not marked.</p>` : ""}
      <fieldset>
        <legend>Which question should this assay answer?</legend>
        <div class="fish-strategy-options">${PROBE_STRATEGIES.map((strategy) => `<label class="fish-strategy-option"><input type="radio" name="fish-strategy" value="${escapeHtml(strategy)}" ${f.strategy.choice === strategy ? "checked" : ""}/><span><strong>${escapeHtml(strategy)}</strong><small>${escapeHtml(STRATEGY_GUIDANCE[strategy])}</small></span></label>`).join("")}</div>
      </fieldset>
      <p class="muted">The signal pattern is assessed later. A strategy describes what the probe design can detect—not what this sample has.</p>
    </div>`;
}

function fishCaseBrief() {
  const session = state.session || {};
  const caseData = session.caseData || {};
  const item = session.atlas?.cytogeneticCase;
  const assignedCase = caseData.case_id?.startsWith("atlas-") && /^Assigned case\./.test(caseData.clinical_history || "");
  const region = item ? item.specific_region || item.primary_locus || "" : "";
  const genes = item?.genes && !region.includes(String(item.genes).split(/[\s.;,]/)[0]) ? item.genes : "";
  const focus = item ? [item.abnormality_type, region, genes].filter(Boolean).join(" · ") : "";
  const presentation = session.atlas?.disease?.clinical_background?.presentation || "";
  const context = assignedCase && focus
    ? `This ${item.kind || caseData.case_type || "teaching"} case focuses on ${focus}. Use the chromosome finding to decide what the FISH assay needs to detect.`
    : caseData.clinical_history
      ? "Use the clinical history in the case panel as your brief. Identify what needs to be detected before choosing a probe."
      : caseData.unknown_prompt || "Use the case details and assay question to decide what evidence is needed.";
  const caseType = caseData.case_type ? `${String(caseData.case_type).replaceAll("_", " ")} teaching case` : "Teaching case";
  const reminder = assignedCase && focus
    ? "This gives the biological focus without naming the diagnosis or expected FISH pattern."
    : "Choose the probe design that can answer the case question, not the one that matches a remembered color pattern.";
  return `<section class="fish-case-brief"><p class="eyebrow">${escapeHtml(caseType)} · case context</p>${presentation ? `<p><strong>Referral presentation.</strong> ${escapeHtml(presentation)}</p>` : ""}<p>${escapeHtml(context)}</p><p class="muted">${escapeHtml(reminder)}</p></section>`;
}

function probeTypeGuide(guided) {
  return `<details class="probe-type-guide" ${guided ? "open" : ""}><summary>Quick guide: what each probe type can show</summary><ul class="comp-list"><li><strong>Centromeric:</strong> count copies of a chromosome using its centromere.</li><li><strong>Locus-specific:</strong> locate or count one defined region or gene.</li><li><strong>Break-apart:</strong> see whether probes flanking one locus separate; it does not identify the partner.</li><li><strong>Dual-fusion:</strong> test whether two known loci on different chromosomes join.</li><li><strong>Whole-chromosome painting:</strong> visualize chromosome origin or large exchanged segments.</li><li><strong>Subtelomeric:</strong> examine chromosome-end regions for terminal changes.</li></ul></details>`;
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

function probeRationale(f) {
  const targets = (f.probes || []).map((probe) => `${probe.fluorophore || ""} ${probe.probe_name || "probe"} at ${probe.target_locus || "its target"}`.trim());
  let explanation = "";
  if (f.spec.assay_type === "dual-fusion" && targets.length >= 2) {
    explanation = `This pair marks ${targets.join(" and ")}. It tests whether two defined loci on different chromosomes are brought close together by a rearrangement. Overlapping probe signals indicate colocalization of the target regions; interpret the full pattern with the case context.`;
  } else if (f.spec.assay_type === "break-apart" && targets.length >= 2) {
    explanation = `These probes flank the same locus (${targets.join(" and ")}). Separation can support disruption of that locus, but a break-apart result does not identify the rearrangement partner.`;
  } else if (f.spec.assay_type === "deletion" && targets.length >= 2) {
    explanation = `The assay compares a target region with a reference signal (${targets.join(" and ")}). The reference helps distinguish loss of the target from signal failure or an unscorable nucleus.`;
  } else if (["enumeration", "sex"].includes(f.spec.assay_type)) {
    explanation = `This assay uses chromosome-specific targets${targets.length ? ` (${targets.join(" and ")})` : ""} to answer a copy-number question. It does not by itself test whether a chromosome is structurally rearranged.`;
  }
  if (!explanation) return "";
  const open = state.session?.instructionMode === "learn" ? " open" : "";
  return `<details class="fish-probe-rationale"${open}><summary>Why these probes for this case?</summary><p>${escapeHtml(explanation)}</p></details>`;
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
  return nucleusSVG(demoNucleus(counts, cx), { width: 240, height: 280, showLabels: true, demo: false });
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

function nucleusEntryIssues(f, student) {
  const decision = String(student.scorable);
  if (decision !== "true" && decision !== "false") return ["Choose whether this nucleus is scorable."];
  if (decision === "false") return student.artifact ? [] : ["Select why this nucleus is unscorable."];
  const fields = countFieldsFor(f.spec.assay_type, f.spec.count_fields);
  const spec = (f.spec.nuclei || []).find((nucleus) => nucleus.nucleus_id === student.id) || currentNucleus(f).spec;
  const missing = fields.filter((field) => {
    const value = student.counts?.[field];
    return value == null || String(value).trim() === "" || !Number.isInteger(Number(value)) || Number(value) < 0 || Number(value) > 99;
  });
  const issues = missing.length ? [`Enter a whole-number count from 0 to 99 for ${missing.map(signalLabel).join(", ")}. Enter 0 when no signal is present.`] : [];
  if (expectedSignalRelationship(spec, fields) && !student.relationship) issues.push("Say whether the signals are fused, split, separate, or only close.");
  if (f.spec.require_signal_annotations && !countOnlyAssay(f) && !student.marks?.length) issues.push("Add the required signal annotations.");
  return issues;
}

function nucleusEntryStatus(f, student) {
  return nucleusRecordStatus(f, student);
}

function summaryPercent(f) {
  const summary = summarizeEnumeration(f);
  if (summary.percent == null) return "";
  return ` · ${summary.percent}% of scorable nuclei match this assay's recorded abnormal pattern`;
}

function relationshipField(f, spec, student) {
  const fields = countFieldsFor(f.spec.assay_type, f.spec.count_fields);
  if (!(fields.includes("fusion") || fields.includes("split")) || !spec?.scorable) return "";
  if (student.scorable === "false" || student.scorable === false) return "";
  const choices = [
    ["fused", "Fused into one signal"],
    ["close", "Close, but still separate"],
    ["split", "Split apart"],
    ["separate", "Separate signals, no fusion"],
  ];
  return `<fieldset class="fish-relationship"><legend>How do the signals relate?</legend>${choices.map(([id, label]) => `<label class="check"><input type="radio" name="fish-relationship" value="${id}" ${student.relationship === id ? "checked" : ""}/> ${escapeHtml(label)}</label>`).join("")}</fieldset>`;
}

function scopeView(f) {
  const { spec, student, index } = currentNucleus(f);
  if (!spec) return `<p class="muted">No nuclei in this case.</p>`;
  const fields = countFieldsFor(f.spec.assay_type, f.spec.count_fields);
  const annotationRequired = f.spec.require_signal_annotations === true;
  const channels = f.spec.channels || ["dapi", "red", "green", "merge"];
  const recorded = f.nuclei.filter((n) => nucleusEntryStatus(f, n) === "Recorded").length;
  return `
    <div class="fish-score-workspace">
      <section class="fish-score-image">
        <div class="fish-score-heading"><div><p class="eyebrow">Illustrative field</p><h3>Nucleus ${index + 1} of ${f.spec.nuclei.length}</h3></div><span>${recorded} of ${f.spec.nuclei.length} recorded${summaryPercent(f)}</span></div>
        <p class="muted">This is one demonstration field, not a clinical image. Decide which nuclei are scorable, then count. A fusion and two signals that are only close are different calls.</p>
        <div class="channel-bar" role="group" aria-label="Fluorescence channels">
          ${channels.map((ch) => `<button type="button" class="btn ${f.activeChannel === ch ? "primary" : ""}" data-action="fish-channel" data-ch="${ch}">${escapeHtml(channelLabel(ch))}</button>`).join("")}
        </div>
        <div class="fish-canvas" data-fish-canvas="1">${nucleusSVG(spec, {
          activeChannel: f.activeChannel,
          marks: student.marks,
          selectedId: f.selectedMark,
          showLabels: false,
          demo: false,
        })}</div>
        <div class="nucleus-strip">
          ${f.spec.nuclei.map((n, i) => `<button type="button" class="nuc-thumb ${i === index ? "on" : ""}" data-action="fish-goto-n" data-index="${i}">
            ${nucleusSVG(n, { activeChannel: "merge", marks: f.nuclei[i]?.marks || [], showLabels: false, demo: false })}
            <span>Nucleus ${i + 1} of ${f.spec.nuclei.length}</span>
          </button>`).join("")}
        </div>
      </section>
      <section class="fish-score-record">
        <h3>Record this nucleus</h3>
        ${assaySetup(f)}
        ${probeRationale(f)}
        <fieldset class="fish-scorable-fieldset">
          <legend>Scorable?</legend>
          <label class="check"><input type="radio" name="fish-scorable" value="true" ${student.scorable === "true" || student.scorable === true ? "checked" : ""}/> Yes</label>
          <label class="check"><input type="radio" name="fish-scorable" value="false" ${student.scorable === "false" || student.scorable === false ? "checked" : ""}/> No</label>
        </fieldset>
        ${relationshipField(f, spec, student)}
        ${student.scorable === "false" || student.scorable === false ? `<label class="stack">Why unscorable?
          <select id="fish-artifact"><option value="">Select…</option>
            ${["overlapping_nuclei", "truncated_nucleus", "weak_signals", "excessive_background", "ambiguous_signals", "poor_nuclear_morphology"].map((a) => `<option value="${a}" ${student.artifact === a ? "selected" : ""}>${a.replace(/_/g, " ")}</option>`).join("")}
          </select></label>` : ""}
        ${countOnlyAssay(f) ? "" : `<details class="fish-signal-annotation" ${annotationRequired ? "open" : ""}><summary>Annotate signal locations ${annotationRequired ? "(required)" : "(optional · not graded)"}</summary><p class="muted fish-mark-instruction">Select a signal type, then click each spot in the image. Individual marks are a visual aid here; the count fields above record the case result. A case that requires signal annotations will say so.</p>
          <div class="piece-nav sig-palette" role="group" aria-label="Identify and count signals">
            ${["red", "green", "fusion", "split", "uncertain"].filter((t) => fields.includes(t) || t === "uncertain").map((t) => `<button type="button" class="sig-btn ${t} ${f.classifyMode === t ? "on" : ""}" data-action="fish-classify" data-type="${t}">${signalLabel(t)}</button>`).join("")}
          </div>
          <ul class="fish-mark-list">${student.marks.map((m) => `<li><button type="button" class="btn ${f.selectedMark === m.id ? "primary" : ""}" data-action="fish-select-mark" data-id="${escapeHtml(m.id)}">${escapeHtml(signalLabel(m.type))}</button></li>`).join("") || "<li class='muted'>No signals marked yet</li>"}</ul>
          <div class="piece-nav"><button type="button" class="btn" data-action="fish-reclass">Reclassify selected</button><button type="button" class="btn" data-action="fish-remove">Remove selected</button><button type="button" class="btn" data-action="fish-reset-n">Reset nucleus</button></div></details>`}
        <fieldset class="fish-count-fields"><legend>Signal counts</legend>${fields.map((fld) => `<label class="fish-count-row">${escapeHtml(signalLabel(fld))}<span class="fish-count-control"><button type="button" class="fish-count-step" data-action="fish-count-step" data-field="${escapeHtml(fld)}" data-delta="-1" aria-label="Decrease ${escapeHtml(signalLabel(fld))} count" ${student.scorable === "false" || student.scorable === false ? "disabled" : ""}>−</button><input id="fish-count-${escapeHtml(fld)}" type="number" min="0" max="99" inputmode="numeric" value="${escapeHtml(student.counts[fld] ?? "")}" aria-label="${escapeHtml(signalLabel(fld))} signal count" ${student.scorable === "false" || student.scorable === false ? "disabled" : ""}><button type="button" class="fish-count-step" data-action="fish-count-step" data-field="${escapeHtml(fld)}" data-delta="1" aria-label="Increase ${escapeHtml(signalLabel(fld))} count" ${student.scorable === "false" || student.scorable === false ? "disabled" : ""}>+</button></span></label>`).join("")}</fieldset>
        <p class="muted">${countOnlyAssay(f) ? "Count the target signals. If the nucleus is unscorable, record why instead of forcing a count." : "A fusion counts once. Separate red- and green-only signals from split signals; exclude unscorable nuclei from interpretation."}</p>
        ${f.recordMessage ? `<p class="feedback" role="status">${escapeHtml(f.recordMessage)}</p>` : ""}
        <div class="fish-nucleus-navigation"><button type="button" class="btn" data-action="fish-prev-n" ${index === 0 ? "disabled" : ""}>Previous</button><button type="button" class="btn primary" data-action="fish-next-n">${index >= f.spec.nuclei.length - 1 ? "Record nucleus" : "Record &amp; next"}</button></div>
        <div class="fish-recorded-panel"><div class="fish-recorded-heading"><h4>Recorded nuclei</h4><span>${recorded} of ${f.spec.nuclei.length}</span></div>${countTable(f)}
          <details><summary>What makes a nucleus scorable?</summary><p>Score intact, distinguishable nuclei where signals can be assigned confidently. Record overlaps, truncation, weak or ambiguous signals, and poor morphology as unscorable rather than guessing.</p></details>
        </div>
      </section>
    </div>`;
}

let sceneCache = { key: "", scene: null };

function sessionScene(f) {
  const seed = (Number.isFinite(state.session.presentation) ? state.session.presentation : 1) + (f.fieldRound || 0);
  const advanced = state.session.caseData?.difficulty === "advanced";
  const key = `${state.session.caseData?.case_id}|${seed}|${advanced}`;
  if (sceneCache.key !== key) sceneCache = { key, scene: buildScene(f.spec, seed, { advanced }) };
  return { scene: sceneCache.scene, seed };
}

function sessionWorkstation() {
  const f = state.session?.fish;
  if (!f) return null;
  const { scene, seed } = sessionScene(f);
  if (!f.workstation || f.workstation.seed !== seed) f.workstation = initWorkstation(seed);
  const submitted = Boolean(state.session.scores?.fish_field);
  return {
    host: "session",
    spec: f.spec,
    probes: f.probes,
    scene,
    ws: f.workstation,
    indication: state.session.caseData?.clinical_history || "",
    locked: submitted,
    reveal: submitted,
  };
}

registerWorkstationHost("session", {
  context: sessionWorkstation,
  save(ws) {
    if (state.session?.fish) state.session.fish = { ...state.session.fish, workstation: ws };
  },
});

function fieldView() {
  return workstationHTML(sessionWorkstation());
}

function checkField(isSubmit) {
  const s = state.session;
  const ctx = sessionWorkstation();
  if (!ctx?.scene) return;
  s.attempts.fish_field = (s.attempts.fish_field || 0) + 1;
  const result = compareToKey(ctx.spec, ctx.scene, ctx.ws);
  const recheck = result.rows.filter((row) => row.verdict !== "agrees" && row.verdict !== "not_recorded").map((row) => row.nucleus.number);
  if (isSubmit) {
    const { technical, interpretation, reasoning } = result.sections;
    s.scores.fish_field = {
      ok: result.agrees,
      n: result.total,
      technical: [technical.earned, technical.possible],
      signalRecognition: result.signalRecognition,
      inappropriateExclusion: result.inappropriateExclusion,
      missedExclusion: result.missedExclusion,
      reasonMismatch: result.reasonMismatch,
    };
    s.scores.fish_interpretation = {
      ok: interpretation.earned === interpretation.possible,
      detail: `assay interpretation ${interpretation.earned}/${interpretation.possible}; scientific reasoning ${reasoning.earned}/${reasoning.possible}`,
    };
  }
  const { technical, interpretation, reasoning } = result.sections;
  writeFb("fish_field", {
    tone: result.agrees === result.total ? "ok" : "review",
    scored: true,
    title: result.notRecorded
      ? `${result.notRecorded} nuclei are still open.`
      : (result.agrees === result.total ? "Every nucleus is scored or excluded in agreement with the case key." : "Some nuclei need another look."),
    body: isSubmit
      ? `Agreement ${result.agrees}/${result.total}. The worksheet now shows the key for each nucleus.`
      : `Agreement ${result.agrees}/${result.total}.${recheck.length ? ` Recheck nucleus ${recheck.slice(0, 6).join(", ")}${recheck.length > 6 ? ", and others" : ""}.` : ""}`,
    extra: `<ul class="comp-list">
      <li>Technical scoring: ${technical.earned}/${technical.possible} (counts differ on ${result.signalRecognition} correctly scored nuclei; ${result.inappropriateExclusion} scorable nuclei excluded; ${result.missedExclusion} unscorable nuclei scored; ${result.reasonMismatch} correct exclusions with a different reason)</li>
      <li>Assay interpretation: ${interpretation.earned}/${interpretation.possible}</li>
      <li>Scientific reasoning: ${reasoning.earned}/${reasoning.possible}</li>
    </ul>`,
  }, isSubmit);
}

function countTable(f) {
  const fields = countFieldsFor(f.spec.assay_type, f.spec.count_fields);
  const head = ["Nucleus", "Status", "Scorable", ...fields.map((x) => signalLabel(x))];
  return `<table class="case-table fish-table"><thead><tr>${head.map((h) => `<th>${h}</th>`).join("")}</tr></thead>
    <tbody>${f.nuclei.map((n, i) => `<tr class="${i === f.nucleusIndex ? "on" : ""}">
      <td><button type="button" class="btn" data-action="fish-goto-n" data-index="${i}">${i + 1}</button></td>
      <td>${nucleusEntryStatus(f, n)}</td>
      <td>${n.scorable === "" ? "—" : (n.scorable === "true" || n.scorable === true ? "yes" : "no")}</td>
      ${fields.map((fld) => `<td>${String(n.scorable) === "false" ? "—" : escapeHtml(n.counts[fld] ?? "")}</td>`).join("")}
    </tr>`).join("")}</tbody></table>`;
}

function interpretView(f) {
  const summary = summarizeEnumeration(f);
  const opts = f.spec.interpretation_options || [];
  return `
    <div class="assembly-copy">
      <h3>Pattern and interpretation</h3>
      <p>Summary is calculated from <em>your</em> nucleus records. This case does not apply a universal FISH positivity cutoff.</p>
      <ul class="comp-list">
        <li>Completed nucleus records: ${summary.reviewed} of ${summary.total}</li>
        <li>Pending: ${summary.pending}; incomplete: ${summary.incomplete}; excluded with a reason: ${summary.excluded}</li>
        <li>Marked scorable: ${summary.scorable}</li>
        ${summary.percent != null ? `<li>Your percent of scorable nuclei matching this assay's recorded pattern: <strong>${summary.percent}%</strong></li>` : ""}
      </ul>
      ${summary.reviewed < summary.total ? `<p role="status">Complete the pending or incomplete records before interpreting the full set. Pattern percentages are withheld until every nucleus has a complete record.</p>` : ""}
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
  if (step === "fish_field") buttons.push(`<button type="button" class="btn" data-action="fish-field-check">Check field</button>`);
  if (step === "probe_locus") buttons.push(`<button type="button" class="btn" data-action="fish-loc-check">Check locus</button>`);
  if (step === "probe_type") buttons.push(`<button type="button" class="btn" data-action="fish-type-check">Check probe type</button>`);
  if (step === "probe_strategy") buttons.push(`<button type="button" class="btn" data-action="fish-strat-check">Check strategy</button>`);
  if (step === "fish_interpret") buttons.push(`<button type="button" class="btn" data-action="fish-int-check">Check interpretation</button>`);
  buttons.push(`<button type="button" class="btn" data-action="hint">Hint</button>`);
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
    patchSession({ fish: { ...f, nucleusIndex: Math.max(0, f.nucleusIndex - 1), selectedMark: null, recordMessage: "" } });
    return true;
  }
  if (action === "fish-next-n") {
    const issues = nucleusEntryIssues(f, currentNucleus(f).student);
    if (issues.length) {
      patchSession({ fish: { ...f, recordMessage: issues.join(" ") } });
      return true;
    }
    const last = f.nucleusIndex === f.spec.nuclei.length - 1;
    patchSession({ fish: { ...f, nucleusIndex: Math.min(f.spec.nuclei.length - 1, f.nucleusIndex + 1), selectedMark: null,
      recordMessage: last ? "Nucleus recorded. Review the table for incomplete or pending entries before submitting your counts." : "" } });
    return true;
  }
  if (action === "fish-goto-n") {
    patchSession({ fish: { ...f, nucleusIndex: Number(el.getAttribute("data-index")) || 0, selectedMark: null, recordMessage: "" } });
    return true;
  }
  if (action === "fish-count-step") {
    const field = el.getAttribute("data-field");
    const delta = Number(el.getAttribute("data-delta")) || 0;
    const { index } = currentNucleus(f);
    if (!countFieldsFor(f.spec.assay_type, f.spec.count_fields).includes(field) || !delta || f.nuclei[index]?.scorable === "false" || f.nuclei[index]?.scorable === false) return true;
    const current = Number(f.nuclei[index].counts[field]);
    const next = Math.max(0, Math.min(99, (Number.isFinite(current) ? current : 0) + delta));
    const nuclei = f.nuclei.map((n, i) => i === index ? { ...n, counts: { ...n.counts, [field]: String(next) } } : n);
    patchSession({ fish: { ...f, nuclei, recordMessage: "" } });
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
  if (action === "fish-field-check" || (action === "submit-step" && s.steps[s.stepIndex] === "fish_field")) {
    checkField(action === "submit-step");
    return action !== "submit-step";
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
  if (countOnlyAssay(state.session?.fish)) return false;
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

function writeFb(step, fb) {
  state.session.feedback = { ...state.session.feedback, [step]: fb };
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
  const countOnly = countOnlyAssay(f);
  const nucleusReady = (spec, student) => {
    const g = gradeNucleus(student, spec, fields);
    const sig = gradeSignalIdentification(student.marks, spec.expected_signals, f.spec.signal_tolerance || 20);
    const signalsRequired = f.spec.require_signal_annotations === true && !countOnly && Boolean(spec.scorable) && (spec.expected_signals || []).length > 0;
    const signalsOk = !signalsRequired || (sig.identified === sig.expected && sig.classified === sig.expected && sig.extra === 0);
    return g.complete && signalsOk;
  };
  let allComplete = true;
  f.spec.nuclei.forEach((spec, i) => {
    if (!nucleusReady(spec, f.nuclei[i])) allComplete = false;
  });
  if (isSubmit) {
    s.scores.fish_quality = quality;
    s.scores.fish_signals = f.spec.require_signal_annotations === true ? idStats : null;
    s.scores.fish_counts = countsOk;
    writeFb("fish_scope", {
      tone: allComplete ? "ok" : "review",
      scored: true,
      title: allComplete ? "Nucleus records are complete." : "One or more nuclei are incomplete or incorrect.",
      body: countOnly
        ? `Scorable decision ${quality.ok}/${quality.n}; counts ${countsOk.ok}/${countsOk.n}.`
        : `Signal identification ${idStats.identified}/${idStats.expected}; classification ${idStats.classified}/${idStats.expected}; scorable nuclei ${quality.ok}/${quality.n}; counts ${countsOk.ok}/${countsOk.n}.`,
    }, true);
    return;
  }
  const { spec, student } = currentNucleus(f);
  const g = gradeNucleus(student, spec, fields);
  const sig = gradeSignalIdentification(student.marks, spec.expected_signals, f.spec.signal_tolerance || 20);
  const extra = `<ul class="comp-list">
    <li>Scorable: <strong>${g.scorable}</strong></li>
    ${g.artifact !== "na" ? `<li>Artifact: <strong>${g.artifact}</strong></li>` : ""}
    ${g.relationship && g.relationship !== "na" ? `<li>Signal relationship: <strong>${g.relationship}</strong></li>` : ""}
    ${Object.entries(g.counts).filter(([, v]) => v !== "na").map(([k, v]) => `<li>${signalLabel(k)}: <strong>${v}</strong></li>`).join("")}
    ${!f.spec.require_signal_annotations || countOnly ? "" : `<li>Signals identified: ${sig.identified}/${sig.expected}</li><li>Signals classified: ${sig.classified}/${sig.expected}</li>`}
  </ul>`;
  const nucleusOk = nucleusReady(spec, student);
  writeFb("fish_scope", {
    tone: nucleusOk ? "ok" : "review",
    scored: true,
    title: nucleusOk ? "This nucleus is complete." : "Review scorability, artifact, or signal counts.",
    body: spec.scorable
      ? (countOnly ? "Compare your count with the signals you can assign to this nucleus." : (f.spec.require_signal_annotations ? "Compare your counts and required annotations with the visible signals. Put a fused spot under Fusion. Red only and green only are the single-color spots." : "Your aggregate counts are recorded. Signal marks are optional and do not affect this case score."))
      : "If the nucleus is unscorable, do not force a count.",
    extra,
  }, false);
}

function nestedBand(outer, inner) {
  const left = String(outer || "");
  const right = String(inner || "");
  if (!left || !right) return false;
  if (left === right) return true;
  return left.startsWith(`${right}.`);
}

function sameBand(placed, expected) {
  return nestedBand(placed, expected) || nestedBand(expected, placed);
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
  const locus = s.fish.localization.locus || "";
  if (placed && expected && sameBand(placed, expected)) {
    grade.components.placement = "correct";
    if ((!locus || locus === placed) && nestedBand(expected, placed)) {
      grade.match = true;
      grade.components.complete = "correct";
    }
  } else if (placed) grade.components.placement = "incorrect";
  s.scores.fish_localization = grade;
  const guided = state.session.instructionMode;
  writeFb("probe_locus", {
    tone: grade.match ? "ok" : "review",
    scored: true,
    title: grade.match ? "Locus matches the probe record." : "Band location needs review.",
    body: guided
      ? (grade.match ? "The chromosome, arm, and band match the probe." : "Check the chromosome, then the arm, then the band. The answer is not marked on the map.")
      : "The probe is attached to a chromosome-map segment, not an arbitrary pixel.",
    extra: `<ul class="comp-list">${Object.entries(grade.components).filter(([, v]) => v !== "na").map(([k, v]) => `<li>${k}: <strong>${v}</strong></li>`).join("")}</ul>`,
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
  s.scores.fish_strategy = ok;
  const body = strategyFeedback(s.fish.strategy.choice, ok.ok, s.fish.spec.strategy_expected, s.fish.probes);
  const guided = s.instructionMode === "learn";
  const title = ok.ok ? "Recorded." : (guided ? "Use the distinction you just saw" : "Try again");
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
      ? (g.ok ? "Your choice matches the curated teaching answer. This checks the answer key, not whether your recorded counts support that conclusion. Compare your records with the nucleus feedback before finalizing." : "Your choice does not match the curated teaching answer. Review the probe design, recorded counts and nucleus feedback before interpreting.")
      : (isSubmit ? (s.caseData.plain_language_interpretation || "See the case explanation on the summary page.") : "The expected interpretation is withheld until you submit this step."),
    extra: summary.percent != null ? `<p>Your pattern percentage: ${summary.percent}%</p>` : "",
  }, isSubmit);
}

export function readFishFields(ev) {
  const f = state.session?.fish;
  if (!f) return;
  const t = ev.target;
  const id = t.id;
  if (t.name === "fish-scorable" || t.name === "fish-relationship" || id === "fish-artifact" || id?.startsWith("fish-count-")) f.recordMessage = "";
  if (id === "fish-class") f.classifyMode = t.value;
  if (id === "fish-loc") f.localization.locus = t.value;
  if (id === "fish-loc-chr") f.localization.chromosome = t.value;
  if (id === "fish-loc-arm") f.localization.arm = t.value;
  if (id === "fish-loc-band") {
    f.localization.bandLabel = t.value;
    const parsedBand = parseBandLabel(`${f.localization.chromosome || ""}${f.localization.arm || ""}${t.value}`);
    f.localization.region = parsedBand?.region == null ? "" : String(parsedBand.region);
    f.localization.band = parsedBand?.band == null ? "" : String(parsedBand.band);
    f.localization.subband = parsedBand?.subband == null ? "" : String(parsedBand.subband);
  }
  if (id === "fish-ptype") f.probeType.type = t.value;
  if (id === "fish-ptarget") f.probeType.target = t.value;
  if (id === "fish-pdetect") f.probeType.detects = t.value;
  if (id === "fish-pnorm") f.probeType.normal_pattern = t.value;
  if (t.name === "fish-strategy") f.strategy.choice = t.value;
  if (t.name === "fish-scorable") {
    const { index } = currentNucleus(f);
    f.nuclei[index].scorable = t.value;
  }
  if (t.name === "fish-relationship") {
    const { index } = currentNucleus(f);
    f.nuclei[index].relationship = t.value;
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
