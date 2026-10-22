/** Instructional scaffolding. The activity engines stay the same; the mode changes what is shown first. */

import { canonicalCase } from "./atlas.js?v=20261006j";

export const INSTRUCTION_MODES = ["learn", "practice", "assessment"];

export function isTeachStep(step) {
  return String(step || "").startsWith("teach:");
}

export function applyStep(step) {
  return isTeachStep(step) ? String(step).slice(6) : step;
}

export function instructionSteps(steps, disease, mode, skillId) {
  if (mode !== "learn") return { steps, titles: {} };
  const out = [];
  const titles = {};
  const seen = new Set();
  for (const step of steps) {
    const lesson = disease ? lessonFor(disease, step) : skillLesson(skillId, step);
    if (lesson && !seen.has(lesson.id)) {
      seen.add(lesson.id);
      const id = `teach:${step}`;
      out.push(id);
      titles[id] = lesson.title;
    }
    out.push(step);
  }
  return { steps: out, titles };
}

/** Skill sessions have no disease. Their lesson must win over the generic step card. */
export function lessonForContext(disease, step, skillId) {
  const applied = applyStep(step);
  if (!disease && skillId) {
    const skill = skillLesson(skillId, applied);
    if (skill) return skill;
  }
  return lessonFor(disease, applied);
}

export function lessonFor(disease, step) {
  const item = canonicalCase(disease);
  const id = disease?.id;
  const cls = item?.correct_classification;
  if (id === "down-syndrome") {
    if (step === "karyotype") return { id: "aneuploidy", title: "Homologs and copy number", html: aneuploidyCard("21") };
    if (step === "find") return { id: "trisomy-21", title: "What three copies look like", html: copyCard("21") };
    if (step !== "probe_strategy" && step !== "fish_scope" && step !== "probe_locus") return null;
  }
  if (id === "cml") {
    if (step === "karyotype") return { id: "karyotype-org", title: "How a karyotype is organized", html: karyotypeCard() };
    if (step === "find") return { id: "reciprocal", title: "Two chromosomes can exchange material", html: cmlFindCard() };
    if (step === "probe_strategy") return { id: "fish-strategy", title: "Which FISH question is this?", html: cmlStrategyCard() };
    if (step === "probe_locus") return { id: "cml-loci", title: "Where ABL1 and BCR sit", html: cmlLocusCard() };
    if (step === "fish_scope") return { id: "cml-signals", title: "Why a fusion signal appears", html: cmlSignalCard() };
    if (step === "comparison") return { id: "derivative", title: "What a derivative chromosome is", html: derivativeCard() };
    return null;
  }
  if (item?.default_karyotype_activity === false && cls === "deletion" && ["comparison", "nomenclature", "assemble", "anatomy"].includes(step)) {
    return { id: "microdeletion", title: "A deletion can sit below karyotype resolution", html: microdeletionCard(item) };
  }
  if ((id === "prader-willi" || id === "angelman") && ["fish_interpret", "disease", "probe_strategy"].includes(step)) {
    return { id: "origin-limit", title: "Deletion FISH does not establish every mechanism", html: originLimitCard(item) };
  }
  if (id === "aml-inv16" && ["comparison", "assemble", "anatomy"].includes(step)) {
    return { id: "pericentric", title: "This inversion includes the centromere", html: pericentricCard() };
  }
  if (id === "kmt2a" && ["nomenclature", "anatomy"].includes(step)) {
    return { id: "kmt2a-locus", title: "Name the locus", html: "<p>KMT2A sits at 11q23.3. This chromosome activity asks you to find that address. It does not build a partner derivative, because patients do not all share one partner.</p>" };
  }
  if (id === "alk-alcl" && step === "inspect") {
    return { id: "alk-arms", title: "The two breakpoints are on different arms", html: "<p>Chromosome 2 breaks at p23. Chromosome 5 breaks at q35. Distal 2p is exchanged with distal 5q. The arm answer is p;q.</p><p>ALK break-apart FISH later asks only whether ALK is rearranged. It does not name NPM1.</p>" };
  }
  if ((id === "alk-alcl" || id === "ewing") && ["comparison", "assemble"].includes(step)) {
    return { id: "canonical-partner", title: "This map is the canonical partner", html: canonicalPartnerCard(item) };
  }
  if (["kmt2a", "alk-alcl", "ewing", "aml-inv16"].includes(id) && ["fish_interpret", "probe_strategy"].includes(step)) {
    return { id: "breakapart-question", title: "Rearrangement is not the partner's name", html: breakApartLimitCard(item) };
  }
  if ((cls === "trisomy" || cls === "monosomy") && step === "karyotype") {
    const chr = (item?.primary_chromosome || [])[0] || "the affected chromosome";
    return { id: "aneuploidy", title: "Homologs and copy number", html: aneuploidyCard(chr) };
  }
  const base = String(step || "").replace(/_\d+$/, "");
  if (base === "nomenclature") {
    return { id: "locus-address", title: "How to read a band address", html: locusAddressCard() };
  }
  if (cls === "deletion" && (step === "inspect" || step === "comparison" || step === "find")) {
    const chr = (item?.primary_chromosome || [])[0] || "";
    return { id: "deletion", title: "A deletion changes one homolog", html: deletionCard(chr, item?.correct_arm || "p") };
  }
  if (cls === "translocation" && step === "find") {
    return { id: "reciprocal", title: "A reciprocal exchange involves two chromosomes", html: translocationCard(item) };
  }
  if (step === "probe_strategy") return { id: "fish-strategy", title: "Match the assay to the question", html: fishFamilyCard(item) };
  if (step === "fish_scope") return { id: "fish-score", title: "How to score a nucleus", html: scoringCard() };
  return null;
}

export function hintFor(disease, step, level, skillId, mode) {
  const id = disease?.id;
  const ladders = {
    "cml:probe_strategy": [
      "What biological question is being asked: copy number, loss of one region, disruption of one locus, or a relationship between two known loci?",
      "ABL1 is on chromosome 9 and BCR is on chromosome 22. They start on different chromosomes.",
      "Look for the strategy designed to detect fusion between two defined loci.",
    ],
    "alk-alcl:inspect": [
      "The two breakpoints are not on the same arm.",
      "Chromosome 2 breaks on the short arm. Chromosome 5 breaks on the long arm.",
      "The bands are 2p23 and 5q35.",
    ],
    "alk-alcl:iscn_interpretation": [
      "Read the arms inside the last parentheses of the translocation.",
      "p23 belongs to chromosome 2. q35 belongs to chromosome 5.",
      "The arm pair is p;q. The band pair is p23;q35.",
    ],
    "cml:probe_locus": [
      "ABL1 is on the long arm of chromosome 9. BCR is on the long arm of chromosome 22.",
      "The band for ABL1 is 9q34. The band for BCR is 22q11.2.",
    ],
    "down-syndrome:find": [
      "Compare how many chromosomes sit in each number.",
      "Chromosome 21 is one of the smallest acrocentrics. Count that group.",
    ],
    "down-syndrome:karyotype": [
      "Homologs belong in the same numbered place.",
      "An extra whole chromosome still belongs with its own number.",
    ],
    "cri-du-chat:nomenclature": [
      "The gold mark is one slice of band 5p15, not the whole band.",
      "From the centromere toward pter, the 5p15 slices are .1, then .2, then .3 at the tip.",
      "The marked slice sits between the pter-most slice and the slice closest to the centromere.",
    ],
    "anatomy:anatomy": [
      "pter is the top end. qter is the bottom end.",
      "The centromere separates the short arm (p) from the long arm (q).",
    ],
    "chromosome_assembly:assemble": [
      "pter is at the top and qter is at the bottom.",
      "Band numbers increase from the centromere toward each telomere.",
    ],
    "band_identification:nomenclature": [
      "Read chromosome, arm, region, then band. Add a sub-band only if that band is split into separate slices.",
      "Sub-bands are numbered from the centromere toward the telomere.",
    ],
    "structural_abnormalities:assemble": [
      "Both breakpoints are on the same arm, so the centromere stays outside the reversed segment.",
      "The segment between the breakpoints is present, but its order is reversed.",
    ],
    "structural_abnormalities:comparison": [
      "A paracentric inversion reverses one arm segment and does not include the centromere.",
      "Name inversion. The centromere is not one of the breakpoints.",
    ],
    "karyotype_construction:karyotype": [
      "Pair homologs by size, centromere position, and band pattern.",
      "X is placed with the C group. Y is placed with the G group.",
    ],
    "iscn_interpretation:iscn_interpretation": [
      "A slash separates cell lines. Brackets count cells in that line, not chromosomes.",
      "45,X[12]/46,XX[18] is twelve cells with one X and eighteen cells with two X chromosomes.",
    ],
    "enumeration:fish_scope": [
      "Count discrete signals that belong to one nucleus.",
      "A normal autosome probe shows two signals, one for each copy.",
    ],
    "enumeration:fish_interpret": [
      "The signal count is the copy number of that target.",
      "Two signals is disomy. Three signals is a gain of that chromosome.",
    ],
    "break-apart:fish_scope": [
      "Look at whether the two colors sit together or apart.",
      "Together means the flanking probes are still on one unbroken locus.",
      "Separated colors mean that locus was rearranged. The partner is not named by this assay.",
    ],
    "break-apart:fish_interpret": [
      "Use the relationship you counted: together or separated.",
      "Separated flanking signals mean the locus is rearranged.",
    ],
    "probe-localization:probe_locus": [
      "Read the address from chromosome, to arm, to band.",
      "9q34 is chromosome 9, long arm, band 34.",
    ],
    "quality:fish_scope": [
      "A scorable nucleus has a single outline and discrete signals.",
      "Overlapping outlines are unscorable: the signals cannot be assigned to one nucleus.",
    ],
  };
  const applied = applyStep(step);
  const key = disease?.id ? `${id}:${applied}` : `${skillId || ""}:${applied}`;
  const family = disease?.id ? fishFamilyHints(id, applied) : null;
  const practiceTray = applied === "karyotype" && mode === "practice" ? practiceKaryotypeHints(Boolean(disease?.id)) : null;
  const list = practiceTray || family || ladders[key] || (disease ? genericHints(disease, applied) : skillHints(skillId, applied));
  const index = Math.max(0, Math.min(level, list.length - 1));
  return { text: list[index], last: index >= list.length - 1, index };
}

function skillHints(skillId, step) {
  if (step === "anatomy") return ["The short arm is p. The long arm is q. The centromere is between them."];
  if (step === "assemble") return ["Keep pter at the top. Order bands away from the centromere."];
  if (step === "nomenclature") return ["Split the address into chromosome, arm, region, band, and sub-band."];
  if (step === "karyotype") return ["Match size and centromere position before you commit a pair."];
  if (step === "fish_scope") return ["Use only signals you can assign to one intact nucleus."];
  return ["Use the pattern in front of you. The formal condition name is not part of this skill."];
}

function skillLesson(skillId, step) {
  if (skillId === "anatomy" && step === "anatomy") {
    return { id: "skill-anatomy", title: "Chromosome landmarks", html: anatomySkillCard() };
  }
  if (skillId === "chromosome_assembly" && step === "assemble") {
    return { id: "skill-assembly", title: "How a chromosome is ordered", html: assemblySkillCard() };
  }
  if (skillId === "band_identification" && step === "nomenclature") {
    return { id: "skill-locus", title: "How to read 7q22.1", html: locusSkillCard("7q22.1") };
  }
  if (skillId === "structural_abnormalities" && (step === "assemble" || step === "comparison")) {
    return { id: "skill-inversion", title: "Paracentric inversion", html: inversionSkillCard() };
  }
  if (skillId === "karyotype_construction" && step === "karyotype") {
    return { id: "skill-karyotype", title: "How a normal karyotype is organized", html: normalKaryotypeCard() };
  }
  if (skillId === "iscn_interpretation" && step === "iscn_interpretation") {
    return { id: "skill-mosaic", title: "Mosaic notation", html: mosaicSkillCard() };
  }
  if (skillId === "enumeration" && step === "fish_scope") {
    return { id: "skill-enumeration", title: "What enumeration FISH asks", html: enumerationSkillCard() };
  }
  if (skillId === "break-apart" && step === "fish_scope") {
    return { id: "skill-breakapart", title: "Intact locus versus rearranged locus", html: breakApartSkillCard() };
  }
  if (skillId === "probe-localization" && step === "probe_locus") {
    return { id: "skill-probe-locus", title: "From chromosome to probe position", html: probeLocusSkillCard() };
  }
  if (skillId === "quality" && step === "fish_scope") {
    return { id: "skill-quality", title: "Scorable or unscorable", html: qualitySkillCard() };
  }
  return null;
}

function anatomySkillCard() {
  return `
    <p>A chromosome is drawn with the short arm up.</p>
    <ul class="comp-list">
      <li><strong>pter</strong> — top telomere, the end of the short arm.</li>
      <li><strong>p arm</strong> — the short arm, between pter and the centromere.</li>
      <li><strong>centromere</strong> — the primary constriction.</li>
      <li><strong>q arm</strong> — the long arm, below the centromere.</li>
      <li><strong>qter</strong> — bottom telomere.</li>
    </ul>
    <p>The next screen hides those names. Identify each landmark from its position.</p>`;
}

function assemblySkillCard() {
  return `
    <p>Build from the top down: pter, then the short arm, the centromere, the long arm, and qter.</p>
    <p>G-bands are ordered, not shuffled labels. On each arm, numbers start at the centromere and increase toward the telomere. A region contains bands, and a band can contain sub-bands.</p>
    <p>The next screen hides the band names. Use orientation and the stain pattern.</p>`;
}

function locusAddressCard() {
  return locusSkillCard();
}

function locusSkillCard(address = "5p15.2") {
  if (address === "7q22.1") {
    return `
      <p>The gold mark on this chromosome is <strong>7q22.1</strong>. Read that address from the outside in:</p>
      <ol class="comp-list">
        <li><strong>7</strong> — chromosome 7, the chromosome on the screen</li>
        <li><strong>q</strong> — the long arm, below the centromere</li>
        <li><strong>2</strong> — region 2 of that arm</li>
        <li><strong>2</strong> — band 2 inside that region, written together as q22</li>
        <li><strong>.1</strong> — the first sub-band of 7q22</li>
      </ol>
      <p>This map splits 7q22 into three slices. Sub-bands are numbered from the centromere toward qter, so <strong>7q22.1</strong> is the slice closest to the centromere, then <strong>7q22.2</strong>, then <strong>7q22.3</strong>.</p>
      <p>The next screen keeps the gold mark and hides the names. Name that same slice.</p>`;
  }
  return `
    <p>A cytogenetic address is nested. Read from the outside in, for example <strong>5p15.2</strong>:</p>
    <ol class="comp-list">
      <li><strong>5</strong> — chromosome</li>
      <li><strong>p</strong> — short arm</li>
      <li><strong>1</strong> — region 1 of that arm</li>
      <li><strong>5</strong> — band 5 inside that region (written together as p15)</li>
      <li><strong>.2</strong> — sub-band, only when that band is split on the map</li>
    </ol>
    <p>Sub-bands are numbered from the centromere toward the telomere. On 5p15, <strong>5p15.1</strong> is closest to the centromere, then <strong>5p15.2</strong>, then <strong>5p15.3</strong> at pter.</p>
    <p>The next screen keeps the gold mark and hides the names. Use that order; do not guess a sub-band for a band that is not split.</p>`;
}

function inversionSkillCard() {
  return `
    <p>Start with a normal chromosome. Choose two breakpoints on the same arm. The segment between them reverses. The centromere is not inside that segment, so the inversion is paracentric.</p>
    <p>Material is not lost or gained. Order and orientation inside the interval change. The next screens ask you to rebuild that chromosome and name the change. The class is not marked on the map.</p>`;
}

function normalKaryotypeCard() {
  return `
    <p>Homologs are the two copies of one chromosome. Pair them by relative size, centromere position, and band pattern. Both copies go in that chromosome's numbered box: two chromosomes in box 1, two in box 2, and so on.</p>
    <p>X sits with the C group. Y sits with the G group. This skill is a normal karyotype: do not look for a disease abnormality.</p>
    ${denverCard()}`;
}

function mosaicSkillCard() {
  return `
    <p>Mosaic notation lists more than one cell line. A slash separates the lines. The number in square brackets is how many cells were counted in that line, not a chromosome count.</p>
    <p>Example shape: 45,X[12]/46,XX[18]. Twelve cells have a single X. Eighteen cells have two X chromosomes. The next screen asks you to read a string in that form. The explanation stays hidden until you submit.</p>`;
}

function enumerationSkillCard() {
  return `
    <p>Enumeration FISH asks one question: how many copies of this chromosome or target are in the nucleus?</p>
    ${oneStrategy("Enumeration")}
    <p>Two separate signals means two copies. Three signals means three copies. Count only signals you can assign to one nucleus. If two nuclear outlines overlap, mark that nucleus unscorable and leave the count blank.</p>
    <p>The next screen asks for that count and whether the nucleus is scorable. The nuclei are not labeled.</p>`;
}

function breakApartSkillCard() {
  return `
    <p>A break-apart probe flanks one locus. This skill is about that signal relationship, not a named disease.</p>
    ${oneStrategy("Break-apart")}
    <ul class="comp-list">
      <li>Intact locus — the flanking signals stay together.</li>
      <li>Rearranged locus — those signals separate.</li>
    </ul>
    <p>Score the nuclei next, without those labels, and then interpret the pattern.</p>`;
}

function probeLocusSkillCard() {
  return `
    <p>A probe position is a cytogenetic address, read in order:</p>
    <ol class="comp-list">
      <li>chromosome</li>
      <li>arm (p or q)</li>
      <li>band</li>
      <li>locus written as one address</li>
      <li>probe sitting on that address</li>
    </ol>
    <p>9q34 means chromosome 9, long arm, band 34. The next screen asks you to place a probe. The correct band is not highlighted.</p>`;
}

function qualitySkillCard() {
  return `
    <p>Score a nucleus only when its signals belong to one cell.</p>
    <ul class="comp-list">
      <li><strong>Clear discrete signals</strong> in one nuclear outline — scorable.</li>
      <li><strong>Overlapping nuclei</strong> — two outlines overlap, so a signal cannot be assigned to one nucleus. Unscorable.</li>
    </ul>
    <p>This drawing set models overlap. It does not draw truncation, background haze, or ambiguous paint as separate pictures. Classify the later nuclei from the outline and the signals you can see.</p>`;
}

function oneStrategy(name) {
  const row = strategyCatalog().find((item) => item[0] === name);
  if (!row) return "";
  const [title, question, reason, mark] = row;
  return `<article class="strategy-card"><p class="eyebrow">${mark}</p><h3>${title}</h3><p><strong>${question}</strong></p><p>${reason}</p></article>`;
}

function fishFamily(id) {
  if (["down-syndrome", "edwards-syndrome", "patau-syndrome"].includes(id)) return "enumeration";
  if (["turner", "klinefelter"].includes(id)) return "sex";
  if (["cri-du-chat", "wolf-hirschhorn"].includes(id)) return "deletion";
  if (["cml", "apl", "burkitt"].includes(id)) return "fusion";
  return "";
}

function fishFamilyHints(id, step) {
  const family = fishFamily(id);
  const ladders = {
    enumeration: {
      fish_scope: [
        "Count the discrete signals of this probe inside one nucleus.",
        "Two signals is the usual count for one autosome in a normal cell.",
      ],
      fish_interpret: [
        "The number of signals is the copy number of that chromosome.",
        "Three signals means three copies. Two signals means the usual pair.",
      ],
    },
    sex: {
      fish_scope: [
        "Count green and red separately. Green is X. Red is Y.",
        "A nucleus with no Y signal can still be a normal female cell. Record the X count as well.",
      ],
      fish_interpret: [
        "Compare the X count with two before you decide from the Y count.",
        "Absence of Y by itself is not the abnormal finding.",
      ],
    },
    deletion: {
      fish_scope: [
        "Count the target color and the control color separately.",
        "The control is the reference for two copies of the chromosome.",
      ],
      fish_interpret: [
        "Compare the target count with the control count.",
        "One target signal, with both control signals still present, is the deletion pattern for this kind of assay.",
      ],
    },
    fusion: {
      fish_scope: [
        "Count the fusion signals.",
        "Now count the remaining separate red signals and green signals.",
      ],
      fish_interpret: [
        "A fusion signal means the two probed loci are in the same place.",
        "Compare what you counted with a nucleus of separate colors and no fusion. The abnormal count belongs to this probe pair.",
      ],
    },
  };
  return ladders[family]?.[step] || null;
}

function practiceKaryotypeHints(disease) {
  const hints = [
    "The tray is the whole set. Only the active group's places are open.",
    "Choose chromosomes by size, centromere position, and band pattern.",
  ];
  hints.push(disease
    ? "An abnormal homolog still belongs with its own chromosome number."
    : "X is placed with the C group. Y is placed with the G group.");
  return hints;
}

function genericHints(disease, step) {
  const item = canonicalCase(disease);
  if (step === "probe_strategy") {
    return [
      "Is the question copy number, missing material, one broken locus, or two known loci joined together?",
      item?.genes ? `The loci named for this case are ${item.genes}.` : "Name the biological question before choosing a probe class.",
    ];
  }
  if (step === "find") return ["Compare partners for number and for shape.", "Select every chromosome family that is not a normal pair."];
  if (step === "karyotype") return ["Place each chromosome with its own number.", "An abnormal homolog still belongs with that chromosome's number."];
  return ["Use the chromosome you can see. The formal name of the condition comes later."];
}

export function strategyFeedback(diseaseId, choice, ok) {
  if (ok) {
    return {
      learn: "That strategy matches the biological question: two known loci, from two chromosomes, brought together.",
      practice: "That matches the question.",
    };
  }
  const enumeration = /enumeration/i.test(choice || "");
  if (diseaseId === "cml" && enumeration) {
    return {
      learn: "Enumeration probes answer chromosome copy-number questions. In this case the question is whether two defined loci from chromosomes 9 and 22 have been brought together by a rearrangement. Compare the strategies again.",
      practice: "Enumeration tests copy number. This case asks whether two known loci are rearranged together.",
    };
  }
  if (diseaseId === "cml") {
    return {
      learn: "Break-apart asks whether one locus was disrupted. A target/reference assay asks whether one region is missing. This case asks whether ABL1 on chromosome 9 and BCR on chromosome 22 have been brought together.",
      practice: "This case asks whether two known loci are rearranged together.",
    };
  }
  return {
    learn: "Match the strategy to the question: copy number, a missing region, one disrupted locus, or two loci joined.",
    practice: "That strategy answers a different question than this case.",
  };
}

/** Assessment keeps the explanation off the working screen. Learn and Practice keep the feedback they were given. */
export function applyMode(session, step, fb, { lock = false } = {}) {
  if (session?.instructionMode !== "assessment" || !fb?.scored) return fb;
  session.pedagogy = session.pedagogy || { hintLevel: {}, first: {} };
  if (lock && !session.pedagogy.first[step]) {
    session.pedagogy.first[step] = { ok: fb.tone === "ok", title: fb.title, body: fb.body };
  }
  if (!lock) {
    return {
      tone: "review",
      title: "Submit to record this response.",
      body: "Assessment does not explain the answer during the activity.",
    };
  }
  return {
    tone: "ok",
    title: "Response recorded.",
    body: "The explanation is withheld until the summary.",
  };
}

export function voice(mode, { ok, learn, practice }) {
  if (mode === "assessment") {
    return { tone: "ok", title: "Response recorded.", body: "The explanation is withheld until the summary." };
  }
  if (ok) {
    return {
      tone: "ok",
      title: "Recorded.",
      body: mode === "learn" ? "That follows the question you were just shown." : "Continue.",
    };
  }
  return {
    tone: "review",
    title: mode === "learn" ? "Use the distinction you just saw" : "Try again",
    body: mode === "learn" ? learn : practice,
  };
}

export function modeLabel(mode) {
  return { learn: "Learn", practice: "Practice", assessment: "Assessment" }[mode] || "Learn";
}

function strategyCatalog() {
  return [
    ["Enumeration", "How many copies?", "Count chromosome-specific signals.", "● ● ●"],
    ["Target / reference", "Is one region missing?", "Compare a target signal with a reference signal.", "● ○"],
    ["Break-apart", "Was one locus split?", "Signals that sit together separate when the locus breaks.", "●—●  →  ●   ●"],
    ["Dual-fusion", "Did two known loci join?", "Two colors overlap when those loci are brought together.", "● + ● → ◐"],
  ];
}

function strategyRows() {
  return `<div class="strategy-grid">${strategyCatalog().map(([name, question, reason, mark]) => `
    <article class="strategy-card">
      <p class="eyebrow">${mark}</p>
      <h3>${name}</h3>
      <p><strong>${question}</strong></p>
      <p>${reason}</p>
    </article>`).join("")}</div>`;
}

function fishFamilyCard(item) {
  const genes = item?.genes ? `<p>This case names ${item.genes}.</p>` : "";
  return `${strategyRows()}${genes}<p>Choose the strategy that matches the question. Do not choose an assay for a different question.</p>`;
}

function cmlStrategyCard() {
  return `
    <p>This teaching case is a rearrangement between chromosome 9 and chromosome 22.</p>
    <div class="pair-art">
      <div><p class="group-label">Normal</p><p>ABL1 is on 9q34.<br>BCR is on 22q11.2.<br>They are on separate chromosomes.</p></div>
      <div><p class="group-label">Rearranged</p><p>t(9;22) changes that context and produces BCR::ABL1. BCR still started on 22. ABL1 still started on 9.</p></div>
    </div>
    ${strategyRows()}
    <ul class="comp-list">
      <li>Copy number of one chromosome → enumeration.</li>
      <li>One locus broken apart → break-apart.</li>
      <li>Two known loci brought together → dual-fusion.</li>
    </ul>`;
}

function cmlLocusCard() {
  return `
    <div class="pair-art">
      <div><p class="group-label">Chromosome 9</p><p>q arm → 9q34 → ABL1</p></div>
      <div><p class="group-label">Chromosome 22</p><p>q arm → 22q11.2 → BCR</p></div>
    </div>
    <p>The next screen asks you to place the probe. The bands above will not stay highlighted as the answer.</p>`;
}

function derivativeCard() {
  return `<p>A derivative keeps the centromere of one chromosome and receives a piece of the other. der(9) carries 22q material. der(22), the Philadelphia chromosome, carries 9q material including ABL1. BCR began on chromosome 22.</p>`;
}

function cmlFindCard() {
  return `
    <p>A reciprocal translocation changes two chromosomes, not one.</p>
    <p>Here the partners are chromosome 9, long arm, and chromosome 22, long arm. Each still has one normal homolog.</p>`;
}

function cmlSignalCard() {
  return `
    <ol class="comp-list">
      <li>Probe identity: one color for ABL1, one color for BCR.</li>
      <li>Normal: the colors sit on different chromosomes, so the signals stay apart.</li>
      <li>Rearranged: t(9;22) places the two loci together on a derivative, so the colors overlap as a fusion signal.</li>
    </ol>
    <p>The demonstration before this screen shows that relationship. The nuclei you score are not labeled. A scorable nucleus is intact, with signals you can tell apart. Overlap is an artifact, not a count.</p>`;
}

function aneuploidyCard(chr) {
  return `
    <p>Homologs are the two copies of one chromosome number. They sit together in that number's box.</p>
    <p>A whole extra or missing chromosome changes the count. It does not have to change the banding of that chromosome. Every copy still goes in the same numbered box.</p>
    <p>For this case, watch chromosome ${chr}.</p>
    ${denverCard()}`;
}

function copyCard(chr) {
  return `<p>Three separate, structurally normal chromosomes ${chr} are trisomy ${chr}. You are counting members of the group, not repairing a band.</p>`;
}

function karyotypeCard() {
  return `<p>Each chromosome is placed by number. Both copies go in that number's box, and the p arm points up. An abnormal homolog still belongs with its own number. Three copies of one chromosome all go in that same box.</p>${denverCard()}`;
}

export function centromereKeyHtml() {
  const fig = (y, name, text) => `
    <figure class="cen-fig">
      <svg viewBox="0 0 36 88" width="28" height="72" aria-hidden="true">
        <rect x="10" y="4" width="16" height="80" rx="8" fill="#d8d3e6"/>
        <rect x="12" y="${y}" width="12" height="10" rx="5" fill="#6e6588"/>
      </svg>
      <figcaption><strong>${name}.</strong> ${text}</figcaption>
    </figure>`;
  return `<div class="cen-key" aria-label="Centromere positions">
    ${fig(36, "Metacentric", "The centromere is near the middle, so the arms are about the same length. Groups A and F.")}
    ${fig(24, "Submetacentric", "The centromere is off center, so one arm is clearly longer. Groups B, C, and E.")}
    ${fig(8, "Acrocentric", "The centromere is near the top, so the short arm is very small. Groups D and G.")}
  </div>`;
}

function denverCard() {
  return `
    <p>Build the set one Denver group at a time. Size, centromere position, and band pattern decide the group.</p>
    ${centromereKeyHtml()}
    <ul class="comp-list">
      <li>A — large metacentric chromosomes: 1–3</li>
      <li>B — large submetacentric chromosomes: 4–5</li>
      <li>C — medium submetacentric chromosomes: 6–12 and X</li>
      <li>D — medium acrocentric chromosomes: 13–15</li>
      <li>E — shorter chromosomes: 16–18</li>
      <li>F — short metacentric chromosomes: 19–20</li>
      <li>G — short acrocentric chromosomes: 21–22 and Y</li>
    </ul>`;
}

function microdeletionCard(item) {
  const region = item?.primary_locus || "the critical interval";
  const chr = (item?.primary_chromosome || [])[0] || "";
  return `<p>The teaching abnormality is loss of ${region} on one chromosome ${chr}. A conventional karyotype can still look normal, because this interval is smaller than routine G-band resolution.</p>
    <p>On the chromosome map, find the arm and the interval. The abnormal homolog is missing that interval. The centromere and the bands outside it stay.</p>`;
}

function originLimitCard(item) {
  const which = item?.id === "pws-deletion" || String(item?.mechanism || "").includes("paternal")
    ? "This representative case is the paternal 15q11-q13 deletion."
    : "This representative case is the maternal 15q11-q13 deletion.";
  return `<p>${which} The same chromosome region can be involved in both Prader-Willi syndrome and Angelman syndrome. Parent of origin changes the biological consequence.</p>
    <p>Target/reference FISH in this laboratory shows whether the targeted interval is deleted. A normal deletion-FISH result does not exclude the disease when another mechanism is responsible, and the signal pattern by itself does not prove which parent contributed the missing copy.</p>`;
}

function canonicalPartnerCard(item) {
  const genes = item?.genes || "The canonical partner is one possible partner.";
  return `<p>${genes}</p><p>Build the derivative chromosomes for that canonical variant. The break-apart assay later asks only whether the primary locus is rearranged.</p>`;
}

function pericentricCard() {
  return `<p>The breakpoints are on opposite arms, 16p13.1 and 16q22, so the reversed segment includes the centromere. That is a pericentric inversion.</p>
    <p>The paracentric inversion skill uses two breakpoints on one arm and leaves the centromere outside the reversed segment. Material is not lost. Order and orientation inside the interval change.</p>`;
}

function breakApartLimitCard(item) {
  const locus = item?.primary_locus || "the targeted locus";
  return `<p>A break-apart probe flanks ${locus}. Intact copies keep the flanking signals together. A rearrangement separates them.</p>
    <p>That result answers whether the locus is rearranged. It does not name the partner. ${item?.genes ? item.genes : "The canonical partner, when this disease has one, is a separate fact from the break-apart result."}</p>`;
}

function deletionCard(chr, arm) {
  return `<p>One homolog of chromosome ${chr} is missing material from the ${arm} arm. The centromere and the rest of the chromosome stay. Compare the two homologs; they should not match in length.</p>`;
}

function translocationCard(item) {
  const pair = (item?.primary_chromosome || []).join(" and ") || "two chromosomes";
  return `<p>Material moved between ${pair}. Select both chromosome families. A derivative is still filed under the chromosome that kept its centromere.</p>`;
}

function scoringCard() {
  return `<p>The demonstration showed the normal pattern and this assay's abnormal pattern. Those labels are not on the nuclei you score. Mark signals you can see, and say whether the nucleus is scorable before you trust a count.</p>`;
}
