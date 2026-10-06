import { readFileSync } from "node:fs";
import { labDiseases, canonicalCase, teachingKaryotype } from "../js/atlas.js";
import { activityCatalog, planActivity, buildDiseaseCase, HIDDEN_CASE_IDS, isStudentCatalogCase, diseasesForMethod, caseSubtitle, caseTeaching, methodAudit } from "../js/activities.js";
import { parseHash } from "../js/util.js";
import { expandChromosomeSet } from "../js/chromosomes.js";
import { fishFlow, gradeInterpretation, gradeStrategy, gradeNucleus, gradeProbeType, summarizeEnumeration } from "../js/fish.js";
import { gradeLocus, piecesForExercise } from "../js/banding.js";
import { bandingFlow, newSession } from "../js/store.js";
import { caseMatchesExercise, LABS } from "../js/labs.js";

const read = (path) => JSON.parse(readFileSync(new URL(path, import.meta.url)));
const diseases = read("../data/diseases.json");
const maps = read("../data/chromosome-maps.json");
const probes = read("../data/probes.json");
const templates = read("../data/chromosome-templates.json");
const links = read("../data/disease-activities.json");
const catalog = read("../data/catalog.json");

const packs = {};
for (const row of Object.values(links)) {
  for (const id of [...(row.assemblies || []), row.fish].filter(Boolean)) {
    const entry = catalog.cases.find((c) => c.case_id === id);
    const full = { ...entry, ...read(`../${entry.path}`) };
    packs[id] = {
      assembly: full.assembly || null,
      fish: full.fish || null,
      chromosomes_involved: full.chromosomes_involved || [],
      arms_involved: full.arms_involved || [],
      bands_involved: full.bands_involved || [],
    };
  }
}

const label = {
  available: "PASS",
  not_applicable: "NOT APPLICABLE",
  not_yet: "NOT YET IMPLEMENTED",
};
const order = [
  ["karyotype", "Karyotype"],
  ["chromosome_identification", "Affected-chromosome identification"],
  ["structural", "Structural assembly applicable/available"],
  ["chromosome_assembly", "Structural assembly"],
  ["fish", "FISH"],
  ["abnormality", "Abnormality classification"],
  ["iscn_construction", "ISCN"],
  ["iscn_interpretation", "ISCN interpretation"],
  ["disease_association", "Disease association"],
  ["integrated", "Integrated assignment"],
];

const labs = labDiseases(diseases);
const failures = [];
console.log(`lab diseases: ${labs.length}`);
for (const disease of labs) {
  const item = canonicalCase(disease);
  const kt = teachingKaryotype(item);
  const rows = activityCatalog(disease, diseases, links, packs, maps);
  const byId = Object.fromEntries(rows.map((row) => [row.id, row.status]));
  const built = buildDiseaseCase(disease, diseases, planActivity("karyotype", disease, links, packs), "explore");
  const chromosomes = expandChromosomeSet(built, templates);
  const expectedCount = Number(String(kt.iscn).match(/^(\d+)/)?.[1]);
  const missingTemplate = chromosomes.filter((chr) => !chr.template);
  const sexGot = chromosomes.filter((chr) => chr.identity === "X" || chr.identity === "Y").map((chr) => chr.identity).join("");
  const variantKeys = Object.entries(kt.variants || {}).filter(([, value]) => value && value !== "normal");
  const drawn = variantKeys.filter(([key]) => chromosomes.some((chr) => `chr${key}` === chr.id && chr.variant === kt.variants[key]));
  let karyotype = label[byId.karyotype] || "FAIL";
  if (byId.karyotype === "available" && (chromosomes.length !== expectedCount || missingTemplate.length || drawn.length !== variantKeys.length || !chromosomes.length)) {
    karyotype = "FAIL";
    failures.push(`${disease.id} karyotype count=${chromosomes.length} expected=${expectedCount} missingTemplates=${missingTemplate.length} variants=${drawn.length}/${variantKeys.length} sex=${sexGot}`);
  }
  if (karyotype === "FAIL") failures.push(`${disease.id} karyotype status`);
  const fishPlan = planActivity("fish", disease, links, packs);
  const asmPlan = planActivity("chromosome_assembly", disease, links, packs);
  console.log(`\n${disease.disease_name}`);
  console.log(`Canonical finding: ${kt.iscn}`);
  console.log(`Karyotype available? ${karyotype} (${chromosomes.length} chromosomes, sex complement in set ${sexGot || "none"})`);
  for (const [id, name] of order) {
    if (id === "karyotype") continue;
    const status = label[byId[id]] || "FAIL";
    if (status === "FAIL") failures.push(`${disease.id} ${id}`);
    console.log(`${name}? ${status}`);
  }
  console.log(`change identification: ${label[byId.change]}`);
  console.log(`anatomy: ${label[byId.anatomy]}`);
  console.log(`band/locus: ${label[byId.band_identification]}`);
  console.log(`assembly steps: ${asmPlan.steps.join(" → ")}`);
  console.log(`fish steps: ${fishPlan.steps.join(" → ")}`);
  const integrated = planActivity("integrated", disease, links, packs).steps;
  const complete = planActivity("complete", disease, links, packs).steps;
  if (byId.karyotype === "not_applicable" && (integrated.includes("karyotype") || complete.includes("karyotype"))) {
    failures.push(`${disease.id} karyotype step was inserted though conventional karyotyping is not applicable`);
  }
  if (byId.karyotype === "available") {
    if (integrated.includes("karyotype") && integrated.includes("find") && integrated.indexOf("karyotype") < integrated.indexOf("find")) {
      console.log("construction and identification are separate steps");
    } else {
      failures.push(`${disease.id} construction/identification order`);
    }
  } else {
    console.log("conventional karyotype is not part of this case");
  }
  if (["trisomy", "monosomy"].includes(item.correct_classification) && integrated.some((step) => step.startsWith("assemble"))) {
    failures.push(`${disease.id} numerical case forced into assembly`);
  }
}

const studentIds = catalog.cases.filter(isStudentCatalogCase).map((c) => c.case_id);
const hiddenVisible = studentIds.filter((id) => HIDDEN_CASE_IDS.has(id));
if (hiddenVisible.length) failures.push(`hidden cases still student-facing: ${hiddenVisible.join(",")}`);
const skills = ["normal-46xy", "normal-46xx", "assembly-chr7-anatomy", "assembly-chr7-bands", "assembly-inv7", "fish-enum-cep21", "fish-breakapart-16q22", "fish-locus-9q34", "iscn-mosaic-45x"];
for (const id of skills) {
  if (!studentIds.includes(id)) failures.push(`skill missing from student list: ${id}`);
}

function loadCase(id) {
  const entry = catalog.cases.find((c) => c.case_id === id);
  return { ...entry, ...read(`../${entry.path}`) };
}
const flows = {
  "normal male/female remain catalog skills": studentIds.includes("normal-46xy") && studentIds.includes("normal-46xx"),
  "chromosome anatomy": bandingFlow(loadCase("assembly-chr7-anatomy"), "anatomy").join(",") === "anatomy",
  "band assembly": bandingFlow(loadCase("assembly-chr7-bands"), "chromosome_assembly").join(",") === "assemble",
  "locus identification": bandingFlow(loadCase("assembly-chr7-bands"), "band_identification").join(",") === "nomenclature",
  "band identification does not fall through": bandingFlow(loadCase("fish-locus-9q34"), "band_identification").join(",") === "unavailable",
  "enumeration FISH": fishFlow(loadCase("fish-enum-cep21"), "enumeration").join(",") === "fish_scope,fish_interpret",
  "enumeration quality is microscopy only": fishFlow(loadCase("fish-enum-cep21"), "quality").join(",") === "fish_scope",
  "break-apart FISH": fishFlow(loadCase("fish-breakapart-16q22"), "break-apart").join(",") === "fish_scope,fish_interpret",
  "probe localization": fishFlow(loadCase("fish-locus-9q34"), "probe-localization").join(",") === "probe_locus",
  "metaphase without nuclei": fishFlow(loadCase("fish-locus-9q34"), "metaphase").join(",") === "unavailable",
  "fish session does not append disease": newSession({ caseData: loadCase("fish-enum-cep21"), chromosomes: [], module: "fish", maps, probes: { probes: [] }, exercise: "enumeration" }).steps.join(",") === "fish_scope,fish_interpret,summary",
};
for (const [name, ok] of Object.entries(flows)) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}`);
  if (!ok) failures.push(name);
}

const library = catalog.cases.map((entry) => ({ ...entry, ...read(`../${entry.path}`) }));
const visibleMatch = (lab, exercise, id) => library.some((entry) => entry.case_id === id && caseMatchesExercise(entry, lab, exercise) && isStudentCatalogCase(entry));
const discovery = {
  "fish-locus stays out of chromosome assembly": !visibleMatch("chromosome", "chromosome_assembly", "fish-locus-9q34"),
  "fish-locus stays out of metaphase FISH": !visibleMatch("fish", "metaphase", "fish-locus-9q34"),
  "fish-locus remains probe localization": visibleMatch("fish", "probe-localization", "fish-locus-9q34"),
  "inv7 stays out of whole-cell karyotype": !visibleMatch("karyotype", "karyotype_construction", "assembly-inv7") && !visibleMatch("karyotype", "iscn_construction", "assembly-inv7"),
  "inv7 remains a structural chromosome skill": visibleMatch("chromosome", "structural_abnormalities", "assembly-inv7"),
};
for (const [name, ok] of Object.entries(discovery)) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}`);
  if (!ok) failures.push(name);
}
for (const lab of LABS) {
  if (lab.id !== "chromosome") continue;
  for (const exercise of lab.exercises) {
    const numerical = library.filter((entry) => isStudentCatalogCase(entry) && caseMatchesExercise(entry, lab.id, exercise.id) && /trisomy|turner|klinefelter|47,XX|45,X/.test(`${entry.case_id} ${entry.title}`));
    if (numerical.length) failures.push(`chromosome ${exercise.id} includes ${numerical.map((entry) => entry.case_id).join(",")}`);
  }
}
const kindOf = (id) => canonicalCase(diseases.diseases.find((item) => item.id === id))?.kind;
for (const [diseaseId, link] of Object.entries(links)) {
  const kind = kindOf(diseaseId);
  for (const id of [...(link.assemblies || []), link.fish].filter(Boolean)) {
    const entry = catalog.cases.find((item) => item.case_id === id);
    if (!entry) {
      failures.push(`${diseaseId} links missing case ${id}`);
      continue;
    }
    const file = loadCase(id);
    if (file.case_type !== "technical" && file.case_type !== kind) {
      failures.push(`${id} is ${file.case_type} but ${diseaseId} is ${kind}`);
    }
  }
}
for (const disease of labs) {
  const fishSteps = planActivity("fish", disease, links, packs).steps;
  const completeSteps = planActivity("complete", disease, links, packs).steps;
  if (fishSteps.includes("probe_type")) failures.push(`${disease.id} disease FISH inserts probe type`);
  if (completeSteps.includes("probe_type")) failures.push(`${disease.id} complete case inserts probe type`);
}
const inv16 = labs.find((item) => item.id === "aml-inv16");
if (inv16) {
  const audit = methodAudit(inv16, diseases, links, packs, maps, probes);
  console.log(`NOTE  AML inv(16) method fit left for scientific review: karyotype ${audit.fit.karyotype}/${audit.karyotype}, chromosome ${audit.fit.chromosome}/${audit.chromosome}, fish ${audit.fit.fish}/${audit.fish}`);
  if (audit.assemblyMissing.length) console.log(`NOTE  AML inv(16) assembly payload: ${audit.assemblyMissing.join("; ")}`);
}

const missing = [
  ["interpretation", gradeInterpretation("", "").ok === false && gradeInterpretation("", "").detail === "ungraded"],
  ["strategy", gradeStrategy("", "").ok === false],
  ["probe type", gradeProbeType({}, null).match === false && gradeProbeType({}, null).ungraded === true],
  ["locus", gradeLocus({}, "").match === false && gradeLocus({}, "").ungraded === true],
  ["blank artifact", gradeNucleus({ scorable: "false", artifact: "", counts: {} }, { scorable: false, artifact_type: "overlap", expected_counts: {} }, []).complete === false],
];
for (const [name, ok] of missing) {
  console.log(`${ok ? "PASS" : "FAIL"}  missing key does not pass: ${name}`);
  if (!ok) failures.push(`missing key ${name}`);
}

const probeById = Object.fromEntries((probes.probes || []).map((probe) => [probe.probe_id, probe]));
for (const [diseaseId, link] of Object.entries(links)) {
  for (const id of link.assemblies || []) {
    const spec = packs[id]?.assembly;
    if (!spec) {
      failures.push(`${id} assembly missing`);
      continue;
    }
    const pieces = piecesForExercise(maps, spec);
    const cen = pieces.filter((piece) => piece.role === "centromere");
    if (!pieces.length || cen.length !== 1) failures.push(`${id} transform invalid pieces=${pieces.length} centromeres=${cen.length}`);
    const arms = new Set(pieces.map((piece) => piece.arm));
    if (!arms.has("p") || !arms.has("q")) failures.push(`${id} missing an arm`);
    if (spec.transform?.type === "deletion") {
      const gone = spec.transform.labels || [];
      const source = maps.chromosomes?.[String(spec.chromosome)]?.segments || [];
      if (gone.some((label) => !source.some((seg) => seg.id === label || seg.label === label))) {
        failures.push(`${id} deletion label is not on the map`);
      }
      if (gone.some((label) => pieces.some((piece) => piece.id === label || piece.label === label))) {
        failures.push(`${id} deleted band still present`);
      }
    }
    if (spec.transform?.type === "inversion") {
      const source = maps.chromosomes?.[String(spec.chromosome)]?.segments || [];
      const ids = source.map((seg) => seg.id);
      const a = ids.indexOf(spec.transform.from);
      const b = ids.indexOf(spec.transform.to);
      const cenAt = source.findIndex((seg) => seg.role === "centromere");
      if (a < 0 || b < 0) failures.push(`${id} inversion breakpoint missing`);
      else if (source[a].arm !== source[b].arm && (cenAt < Math.min(a, b) || cenAt > Math.max(a, b))) {
        failures.push(`${id} pericentric inversion does not include the centromere`);
      }
    }
    if (spec.transform?.type === "translocation_derivative") {
      const partner = spec.transform.attach_from?.chromosome;
      const moved = pieces.filter((piece) => piece.translocated);
      if (!moved.length || moved.some((piece) => String(piece.origin) !== String(partner))) {
        failures.push(`${id} derivative segments lost source identity`);
      }
    }
    const breakpoint = spec.transform?.keep_through || spec.transform?.keep_from || spec.nomenclature?.expected;
    const segs = maps.chromosomes?.[String(spec.chromosome)]?.segments || [];
    if (breakpoint && !segs.some((seg) => seg.id === breakpoint || seg.label === breakpoint) && spec.transform?.type !== "deletion") {
      failures.push(`${id} breakpoint ${breakpoint} missing from map`);
    }
  }
  if (!link.fish) continue;
  const fish = packs[link.fish]?.fish;
  const ids = fish?.probe_ids || [];
  if (!fish?.assay_type || !fish.expected_interpretation || !fish.case_specific_cutoff?.abnormal_counts || !fish.case_specific_cutoff?.normal_counts) {
    failures.push(`${link.fish} missing assay expectations`);
  }
  for (const probeId of ids) {
    const probe = probeById[probeId];
    if (!probe) {
      failures.push(`${link.fish} probe ${probeId} missing`);
      continue;
    }
    if (fish.include_localization && fish.localization?.probe_id === probeId) {
      const segs = maps.chromosomes?.[String(probe.chromosome)]?.segments || [];
      if (!segs.some((seg) => seg.id === probe.reference_segment || seg.label === probe.target_locus)) {
        failures.push(`${probeId} locus is not on the chromosome map`);
      }
    }
  }
  const summary = summarizeEnumeration({
    spec: fish,
    nuclei: (fish.nuclei || []).map((nucleus) => ({ scorable: nucleus.scorable ? "true" : "false", counts: nucleus.expected_counts })),
  });
  const abnormalNuclei = (fish.nuclei || []).filter((nucleus) => nucleus.scorable && Object.entries(fish.case_specific_cutoff.abnormal_counts).every(([key, value]) => Number(nucleus.expected_counts?.[key]) === Number(value)));
  if (!abnormalNuclei.length || summary.percent == null) failures.push(`${link.fish} signal rule is not case-specific`);
}

const expectations = {
  "down-syndrome": /21/,
  "edwards-syndrome": /18/,
  "patau-syndrome": /13/,
  turner: /45,X/,
  klinefelter: /47,XXY/,
  "cri-du-chat": /del\(5\)\(p\)/,
  "wolf-hirschhorn": /del\(4\)\(p16\)/,
  cml: /t\(9;22\)/,
  apl: /t\(15;17\)\(q24\.1;q21\.2\)/,
  burkitt: /t\(8;14\)\(q24;q32\)/,
  digeorge: /46,XX/,
  williams: /46,XX/,
  "prader-willi": /46,XX/,
  angelman: /46,XX/,
  "cll-del13q": /46,XY/,
  "aml-runx1": /t\(8;21\)\(q22;q22\)/,
  "aml-inv16": /inv\(16\)\(p13\.1q22\)/,
  kmt2a: /46,XY/,
  "alk-alcl": /t\(2;5\)\(p23;q35\)/,
  ewing: /t\(11;22\)\(q24;q12\)/,
};
console.log("\nCross-method canonical findings");
for (const disease of labs) {
  const item = canonicalCase(disease);
  const iscn = teachingKaryotype(item).iscn || "";
  const ok = expectations[disease.id]?.test(iscn);
  console.log(`${ok ? "PASS" : "FAIL"}  ${disease.disease_name}: ${iscn}`);
  if (!ok) failures.push(`${disease.id} canonical ISCN mismatch`);
  const fish = packs[links[disease.id]?.fish]?.fish;
  if (fish && !fish.case_specific_cutoff?.abnormal_counts) failures.push(`${disease.id} FISH has no own abnormal pattern`);
}

const criAsm = packs["assembly-del5p"];
console.log("\nCri-du-chat nomenclature review");
console.log(`Atlas ISCN: ${teachingKaryotype(canonicalCase(labs.find((d) => d.id === "cri-du-chat"))).iscn}`);
console.log(`Assembly expected locus: ${criAsm?.assembly?.nomenclature?.expected}`);
console.log("These are different levels of specificity. The disease ISCN was not rewritten.");

const canonicalTen = ["down-syndrome", "edwards-syndrome", "patau-syndrome", "turner", "klinefelter", "cri-du-chat", "wolf-hirschhorn", "cml", "apl", "burkitt"];
const structuralFive = ["cri-du-chat", "wolf-hirschhorn", "cml", "apl", "burkitt"];
const fishLabels = {
  "down-syndrome": "Chromosome 21 enumeration",
  "edwards-syndrome": "Chromosome 18 enumeration",
  "patau-syndrome": "Chromosome 13 enumeration",
  turner: "X/Y enumeration",
  klinefelter: "X/Y enumeration",
  "cri-du-chat": "Distal 5p deletion analysis",
  "wolf-hirschhorn": "4p16 deletion analysis",
  cml: "BCR::ABL1 dual-fusion",
  apl: "PML::RARA dual-fusion",
  burkitt: "IGH::MYC dual-fusion",
};
const expectedMatrix = {
  "down-syndrome": ["AVAILABLE", "NOT APPLICABLE", "AVAILABLE"],
  "edwards-syndrome": ["AVAILABLE", "NOT APPLICABLE", "AVAILABLE"],
  "patau-syndrome": ["AVAILABLE", "NOT APPLICABLE", "AVAILABLE"],
  turner: ["AVAILABLE", "NOT APPLICABLE", "AVAILABLE"],
  klinefelter: ["AVAILABLE", "NOT APPLICABLE", "AVAILABLE"],
  "cri-du-chat": ["AVAILABLE", "AVAILABLE", "AVAILABLE"],
  "wolf-hirschhorn": ["AVAILABLE", "AVAILABLE", "AVAILABLE"],
  cml: ["AVAILABLE", "AVAILABLE", "AVAILABLE"],
  apl: ["AVAILABLE", "AVAILABLE", "AVAILABLE"],
  burkitt: ["AVAILABLE", "AVAILABLE", "AVAILABLE"],
};
console.log("\nMethod matrix");
for (const id of canonicalTen) {
  const disease = labs.find((item) => item.id === id);
  const audit = methodAudit(disease, diseases, links, packs, maps, probes);
  const got = [audit.karyotype, audit.chromosome, audit.fish];
  const ok = got.join("|") === expectedMatrix[id].join("|");
  console.log(`${ok ? "PASS" : "FAIL"}  ${disease.disease_name}: ${got.join(" | ")}`);
  if (!ok) failures.push(`${id} matrix ${got.join("|")} expected ${expectedMatrix[id].join("|")} fishMissing=${audit.fishMissing.join(";")} assemblyMissing=${audit.assemblyMissing.join(";")}`);
  if (audit.chromosome === "NOT APPLICABLE" && links[id]?.assemblies?.length) {
    failures.push(`${id} numerical or inappropriate case was given a chromosome-assembly link`);
  }
}

for (const method of ["karyotype", "chromosome", "fish"]) {
  const listed = diseasesForMethod(diseases, links, packs, maps, method, probes);
  const names = listed.map((disease) => {
    const subtitle = caseSubtitle(disease, method, links, packs, probes);
    const teach = caseTeaching(disease, method, links, packs);
    return `${disease.disease_name} | ${[subtitle, teach].filter(Boolean).join(" — ")}`;
  });
  console.log(`\n${method} landing`);
  names.forEach((line) => console.log(line));
  const ids = listed.map((disease) => disease.id);
  if (method === "karyotype" && canonicalTen.some((id) => !ids.includes(id))) failures.push("karyotype landing dropped a canonical disease");
  if (method === "chromosome") {
    const structural = ids.filter((id) => structuralFive.includes(id));
    if (structural.join(",") !== structuralFive.join(",")) failures.push(`chromosome landing ${ids.join(",")}`);
    if (ids.some((id) => ["down-syndrome", "edwards-syndrome", "patau-syndrome", "turner", "klinefelter"].includes(id))) {
      failures.push("numerical disease listed under chromosome analysis");
    }
  }
  if (method === "fish") {
    if (canonicalTen.some((id) => !ids.includes(id))) failures.push(`fish landing missing ${canonicalTen.filter((id) => !ids.includes(id)).join(",")}`);
    for (const disease of listed.filter((item) => fishLabels[item.id])) {
      const subtitle = caseSubtitle(disease, "fish", links, packs, probes);
      if (subtitle !== fishLabels[disease.id]) failures.push(`${disease.id} FISH label ${subtitle}`);
    }
  }
}

globalThis.location = { hash: "#/disease/down-syndrome/fish/learn/focus/fish" };
const focused = parseHash();
if (focused.activity !== "fish" || focused.focus !== "fish" || focused.instruction !== "learn") {
  failures.push(`focused FISH route parsed as ${JSON.stringify(focused)}`);
}
const down = labs.find((item) => item.id === "down-syndrome");
const downPlan = planActivity("fish", down, links, packs);
const downBuilt = buildDiseaseCase(down, diseases, downPlan, "explore");
const downSession = newSession({
  caseData: downBuilt,
  chromosomes: [],
  module: "disease",
  maps,
  probes,
  exercise: "fish",
  atlas: { disease: down, mode: "explore" },
});
if (!downSession.steps.includes("fish_scope") || !downSession.fish?.spec || downSession.atlas?.disease?.id !== "down-syndrome") {
  failures.push(`Down FISH session steps ${downSession.steps.join(",")}`);
}
const apl = labs.find((item) => item.id === "apl");
const aplPlan = planActivity("chromosome_assembly", apl, links, packs);
const aplBuilt = buildDiseaseCase(apl, diseases, aplPlan, "explore");
const aplSession = newSession({
  caseData: aplBuilt,
  chromosomes: [],
  module: "disease",
  maps,
  probes,
  exercise: "chromosome_assembly",
  atlas: { disease: apl, mode: "explore" },
});
if (!aplSession.steps.includes("assemble") || !aplSession.steps.includes("assemble_2") || !aplSession.assembly?.expected?.length) {
  failures.push(`APL assembly session steps ${aplSession.steps.join(",")}`);
}

const universal = summarizeEnumeration({
  spec: { assay_type: "enumeration", case_specific_cutoff: { pattern: "3 green signals" }, nuclei: [{ nucleus_id: "n", scorable: true, expected_counts: { green: 3 } }] },
  nuclei: [{ scorable: "true", counts: { green: 3 } }],
});
if (universal.percent != null) failures.push("enumeration still uses a universal 3-green rule");
else console.log("\nPASS  no universal 3-green cutoff");

if (failures.length) {
  console.log("\nFAILURES");
  failures.forEach((line) => console.log(line));
  process.exit(1);
}
console.log("\nNo capability failures.");
